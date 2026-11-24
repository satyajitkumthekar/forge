/**
 * OpenAI - how the food analyser asks one of OpenAI's models, through the
 * Responses API. Building the request and reading the reply are plain
 * functions, tested without a network in tests/analyser.test.mjs.
 */

import { MAX_OUTPUT_TOKENS, PLATE_SCHEMA, noteText, platePrompt, type Ask, type Asked } from './plate.ts';
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
 * way.
 */
export async function askOpenAI(
  ask: Ask,
  apiKey: string | undefined,
  timeoutMs: number,
  onLive?: (event: LiveEvent) => void
): Promise<Asked> {
  if (!apiKey) return { ok: false, why: 'openai key not set' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
    const timedOut = err instanceof Error && err.name === 'AbortError';
    console.error('OpenAI request failed:', err);
    return { ok: false, why: timedOut ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}
