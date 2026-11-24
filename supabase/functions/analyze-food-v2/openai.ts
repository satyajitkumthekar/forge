/**
 * OpenAI - how the food analyser asks one of OpenAI's models, through the
 * Responses API. Building the request and reading the reply are plain
 * functions, tested without a network in tests/analyser.test.mjs.
 */

import {
  BRAND_CHECK_PROMPT,
  BRAND_CHECK_SCHEMA,
  MAX_OUTPUT_TOKENS,
  PLATE_SCHEMA,
  noteText,
  platePrompt,
  readBrandCheck,
  searchThisLog,
  type Ask,
  type Asked,
} from './plate.ts';
import { EventReader, FoodScanner, readLookup, siteOf, type LiveFood, type LiveLookup } from './stream.ts';

/** Web searches and page reads one log may use; any more are ignored */
export const MAX_LOOKUPS = 3;

/** The request body for POST https://api.openai.com/v1/responses */
export function buildOpenAIRequest(ask: Ask): Record<string, unknown> {
  const content: Array<Record<string, unknown>> = [{ type: 'input_text', text: noteText(ask.description) }];
  if (ask.image) {
    content.push({ type: 'input_image', image_url: ask.image, detail: 'high' });
  }

  return {
    model: ask.model,
    instructions: platePrompt({ search: ask.search }),
    input: [{ role: 'user', content }],
    reasoning: { effort: ask.effort },
    text: { format: { type: 'json_schema', name: 'plate', strict: true, schema: PLATE_SCHEMA } },
    max_output_tokens: MAX_OUTPUT_TOKENS,
    // Client food notes and photos are not kept on OpenAI's side
    store: false,
    ...(ask.search
      ? {
          // A label needs little text, so searches read little. With no
          // location given, searches would default to the United States;
          // an empty one keeps them neutral for Indian brands.
          tools: [{ type: 'web_search', search_context_size: 'low', user_location: { type: 'approximate' } }],
          max_tool_calls: MAX_LOOKUPS,
          include: ['web_search_call.action.sources'],
        }
      : {}),
  };
}

/** How hard the small model thinks about the brand check: not at all, so
 *  the answer is back quickly. gpt-6-luna accepts none, low, medium, high,
 *  xhigh and max (it rejects minimal). */
export const CHECK_EFFORT = 'none';

/** The brand check's request: the note only, one yes or no back, no tools */
export function buildBrandCheckRequest(description: string | null | undefined, model: string): Record<string, unknown> {
  return {
    model,
    instructions: BRAND_CHECK_PROMPT,
    input: [{ role: 'user', content: [{ type: 'input_text', text: noteText(description) }] }],
    reasoning: { effort: CHECK_EFFORT },
    text: { format: { type: 'json_schema', name: 'brand_check', strict: true, schema: BRAND_CHECK_SCHEMA } },
    // Thinking counts toward this; the answer itself is a few words
    max_output_tokens: 2000,
    store: false,
  };
}

/** The brand check's answer, null when it gave none, and how long it took */
export interface BrandCheck {
  lookup: boolean | null;
  ms: number;
}

/**
 * Asks the brand check (see BRAND_CHECK_PROMPT). One request, no retry,
 * cut off at timeoutMs. lookup is null when it fails, and then the log
 * keeps the search tool, so a failed check costs money, never accuracy.
 */
export async function checkForBrand(
  description: string | null | undefined,
  apiKey: string | undefined,
  model: string,
  timeoutMs: number
): Promise<BrandCheck> {
  const startedAt = Date.now();
  if (!apiKey) return { lookup: null, ms: 0 };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildBrandCheckRequest(description, model)),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error('Brand check error:', response.status, await response.text());
      return { lookup: null, ms: Date.now() - startedAt };
    }
    const written = readOpenAIReply(await response.json());
    if (!written.ok) return { lookup: null, ms: Date.now() - startedAt };
    let answer: unknown = null;
    try {
      answer = JSON.parse(written.text);
    } catch {
      // Not JSON: treated as no answer
    }
    return { lookup: readBrandCheck(answer), ms: Date.now() - startedAt };
  } catch (err) {
    console.error('Brand check failed:', err);
    return { lookup: null, ms: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}

/** Pulls the written answer out of a Responses API reply */
export function readOpenAIReply(body: unknown): { ok: true; text: string } | { ok: false; why: string } {
  if (!body || typeof body !== 'object') return { ok: false, why: 'empty reply' };
  const reply = body as Record<string, any>;

  if (reply.status === 'incomplete') {
    return { ok: false, why: `incomplete: ${reply.incomplete_details?.reason ?? 'unknown'}` };
  }
  if (typeof reply.status === 'string' && reply.status !== 'completed') {
    return { ok: false, why: `status ${reply.status}` };
  }

  for (const item of Array.isArray(reply.output) ? reply.output : []) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part?.type === 'refusal') return { ok: false, why: 'refusal' };
      if (part?.type === 'output_text' && typeof part.text === 'string') {
        return { ok: true, text: part.text };
      }
    }
  }
  return { ok: false, why: 'no text in reply' };
}

/** The web searches and page reads in a finished reply, and the sites read */
export function lookupsOf(reply: unknown): { count: number; sites: string[] } {
  const output = Array.isArray((reply as any)?.output) ? (reply as any).output : [];
  const calls = output.filter((item: any) => item?.type === 'web_search_call');
  const sites = new Set<string>();
  for (const call of calls) {
    const action = call?.action ?? {};
    if (action.url) sites.add(siteOf(action.url));
    for (const source of Array.isArray(action.sources) ? action.sources : []) sites.add(siteOf(source?.url));
  }
  sites.delete('');
  return { count: calls.length, sites: [...sites].slice(0, 8) };
}

/** Progress while the answer is being worked out: a food, or a lookup */
export type LiveEvent = { type: 'food'; food: LiveFood } | { type: 'lookup'; lookup: LiveLookup };

/**
 * Follows a streamed reply. Each message is one event from OpenAI; foods
 * are reported as the answer text reaches them, lookups as they start and
 * finish, and the finished reply (the same object a plain request returns)
 * is kept when it arrives.
 */
export class ReplyFollower {
  private scanner = new FoodScanner();
  /** The finished reply, once OpenAI has sent it */
  reply: unknown = null;
  /** Set when OpenAI reports an error instead of a reply */
  failed = false;

  take(message: unknown): LiveEvent[] {
    if (!message || typeof message !== 'object') return [];
    const event = message as Record<string, any>;

    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
      return this.scanner.push(event.delta).map((food) => ({ type: 'food' as const, food }));
    }
    if (event.type === 'response.output_item.added' || event.type === 'response.output_item.done') {
      const lookup = readLookup(event.item, event.type === 'response.output_item.done');
      return lookup ? [{ type: 'lookup', lookup }] : [];
    }
    if (
      event.type === 'response.completed' ||
      event.type === 'response.incomplete' ||
      event.type === 'response.failed'
    ) {
      this.reply = event.response ?? null;
    } else if (event.type === 'error') {
      this.failed = true;
    }
    return [];
  }
}

const usageOf = (reply: any) => {
  const usage = reply?.usage ?? {};
  return {
    input_tokens: usage.input_tokens ?? null,
    cached_tokens: usage.input_tokens_details?.cached_tokens ?? null,
    output_tokens: usage.output_tokens ?? null,
    reasoning_tokens: usage.output_tokens_details?.reasoning_tokens ?? null,
  };
};

/**
 * One request, no retry. A request that hangs is cut off at timeoutMs.
 * With onLive, the reply is streamed and each food and lookup is reported
 * as it happens; the finished, complete reply is what comes back either
 * way. When drop fires, the request is stopped and its answer is not
 * wanted (see askWithBrandCheck).
 */
export async function askOpenAI(
  ask: Ask,
  apiKey: string | undefined,
  timeoutMs: number,
  onLive?: (event: LiveEvent) => void,
  drop?: AbortSignal
): Promise<Asked> {
  if (!apiKey) return { ok: false, why: 'openai key not set' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const stop = () => controller.abort();
  drop?.addEventListener('abort', stop);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(onLive ? { ...buildOpenAIRequest(ask), stream: true } : buildOpenAIRequest(ask)),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error('OpenAI API error:', response.status, await response.text());
      return { ok: false, why: `openai ${response.status}` };
    }

    let data: any;
    if (onLive) {
      if (!response.body) return { ok: false, why: 'no stream' };
      const follower = new ReplyFollower();
      const events = new EventReader();
      const decoder = new TextDecoder();
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const message of events.push(decoder.decode(value, { stream: true }))) {
          for (const live of follower.take(message)) onLive(live);
        }
      }
      if (follower.failed) return { ok: false, why: 'openai stream error' };
      if (!follower.reply) return { ok: false, why: 'stream ended early' };
      data = follower.reply;
    } else {
      data = await response.json();
    }

    const written = readOpenAIReply(data);
    if (!written.ok) return written;
    return { ok: true, text: written.text, usage: usageOf(data), lookups: lookupsOf(data) };
  } catch (err) {
    // Stopped on purpose: nothing went wrong
    if (drop?.aborted) return { ok: false, why: 'dropped' };
    const timedOut = err instanceof Error && err.name === 'AbortError';
    console.error('OpenAI request failed:', err);
    return { ok: false, why: timedOut ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
    drop?.removeEventListener('abort', stop);
  }
}

/**
 * The answer for a typed log whose web search the brand check decides
 * (the admin switch is on and there is no photo).
 *
 * The estimate without search starts at once, beside the check, so a log
 * with no brand waits for nothing extra: its progress is held back until
 * the check has answered, then shown. When the check finds a brand, or
 * cannot answer, that estimate is stopped and its progress never shown,
 * and the log is asked again with search. Neither is a retry: each log
 * gets exactly one answer, and a failed one fails in front of the client.
 */
export async function askWithBrandCheck(
  ask: Ask,
  apiKey: string | undefined,
  checkModel: string,
  timeouts: { check: number; answer: number },
  onLive?: (event: LiveEvent) => void
): Promise<{ asked: Asked; check: BrandCheck; search: boolean }> {
  let held: LiveEvent[] | null = [];
  const holdOrShow = (event: LiveEvent) => {
    if (held) held.push(event);
    else onLive?.(event);
  };
  const drop = new AbortController();
  const withoutSearch = askOpenAI({ ...ask, search: false }, apiKey, timeouts.answer, onLive && holdOrShow, drop.signal);

  const check = await checkForBrand(ask.description, apiKey, checkModel, timeouts.check);
  const search = searchThisLog({ switchOn: true, hasPhoto: Boolean(ask.image), brand: check.lookup });

  if (!search) {
    const waiting = held ?? [];
    held = null;
    for (const event of waiting) onLive?.(event);
    return { asked: await withoutSearch, check, search };
  }
  drop.abort();
  return { asked: await askOpenAI({ ...ask, search: true }, apiKey, timeouts.answer, onLive), check, search };
}
