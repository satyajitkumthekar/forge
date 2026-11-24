/**
 * Supabase Edge Function: Analyze Food v2
 *
 * A food note and/or photo in; each food on the plate out as its own item,
 * with the portion that was assumed and its own numbers. Runs beside the
 * original analyze-food, which is left exactly as it is: the app decides
 * which one it calls.
 *
 * What is different from the original:
 * - The AI thinks before it answers and lists foods one by one. It never
 *   returns a total: the adding up, and the checks on every number, happen
 *   here in code (see plate.ts).
 * - Each log is looked at fresh. No earlier logs are sent along.
 * - Oil and outside food lean high only when the client said nothing about
 *   them, once per food, and the assumption is written down.
 * - The model is one setting (see below), so moving to a newer one is a
 *   one-line change, not a rewrite.
 * - With "stream": true in the request, each food is sent to the app the
 *   moment the AI has written it, so the wait shows real progress. The
 *   checked, added-up plate still arrives once, at the end (see stream.ts).
 * - A log with no photo is turned back when the amount of a food was only
 *   a guess, naming the foods the client needs to add an amount for,
 *   instead of being logged on that guess. A log with a photo always goes
 *   through.
 * - Brands, packaged foods and chain dishes are looked up on the web, and
 *   their label's numbers are used. Each lookup is shown as it happens.
 *   One switch on the Admin page turns this off for everyone
 *   (system_settings.food_web_search), read fresh on every log. A quick
 *   check by a small, cheap model gives the search tool only to logs that
 *   name a brand, a packaged food or a chain dish, because attaching it
 *   costs about a cent on every log even when nothing is looked up. The
 *   estimate without search starts at the same time as the check, so a
 *   log with no brand does not wait for it.
 *
 * SECURITY: same sign-in check and same daily limit as the original.
 * A failed log fails in front of the client. Nothing is retried here.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isUsablePhoto, readPlate, searchThisLog, webSearchSwitchOn, INVALID_MESSAGE, type Ask, type Asked } from './plate.ts';
import { askOpenAI, askWithBrandCheck, type BrandCheck, type LiveEvent } from './openai.ts';
import { toEvent } from './stream.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// The one place the model is named. Both can be changed without touching
// code, through the function's FOOD_MODEL and FOOD_REASONING_EFFORT
// settings.
const DEFAULT_MODEL = Deno.env.get('FOOD_MODEL') || 'gpt-6.2-sol';
const DEFAULT_EFFORT = Deno.env.get('FOOD_REASONING_EFFORT') || 'low';

// Admin accounts may ask for one of these instead, to compare models on the
// same food. Nobody else can change the model, and nothing outside this list
// is ever called.
const TEST_MODELS = ['gpt-6.2-sol', 'gpt-6.1-terra', 'gpt-6-luna', 'gpt-6.2-astra'];
const TEST_EFFORTS = ['low', 'medium', 'high'];

// No amount, no photo, no log: when there is no photo, a food whose amount
// the AI could only guess turns the log back to the client. On unless
// FOOD_REQUIRE_AMOUNT is set to off.
const REQUIRE_AMOUNT = Deno.env.get('FOOD_REQUIRE_AMOUNT') !== 'off';
const mustHaveAmount = (ask: Ask): boolean => REQUIRE_AMOUNT && !ask.image;

// The admin's switch for web search (system_settings.food_web_search, on
// the Admin page), read on every log so a change applies at once. If it
// cannot be read, search stays on.
const readWebSearchSwitch = async (admin: any): Promise<boolean> => {
  try {
    const { data, error } = await admin
      .from('system_settings')
      .select('food_web_search')
      .eq('id', 1)
      .maybeSingle();
    if (error) {
      console.error('Web search switch could not be read:', error.message);
      return true;
    }
    return webSearchSwitchOn(data);
  } catch (err) {
    console.error('Web search switch could not be read:', err);
    return true;
  }
};

// The quick brand check that decides whether a log gets the search tool
// (see askWithBrandCheck in openai.ts): a small, cheap model, changeable
// through the function's FOOD_CHECK_MODEL setting. If it takes longer than
// the time limit, the log simply keeps the search tool.
const CHECK_MODEL = Deno.env.get('FOOD_CHECK_MODEL') || 'gpt-6-luna';
const CHECK_TIMEOUT_MS = 5_000;

// A request that hangs fails in front of the client instead of spinning
const AI_TIMEOUT_MS = 90_000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const JSON_HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
const STREAM_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Access-Control-Allow-Origin': '*',
};

const reply = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

const TRY_AGAIN_MESSAGE = 'Could not work this one out just now. Please send it again.';

/** What one log comes to: the HTTP status and the body that goes with it */
interface Outcome {
  status: number;
  body: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  let userId: string | null = null;
  let supabaseAdmin: any = null;
  // The brand check's answer and how long it took; null when it did not run
  let brandCheck: BrandCheck | null = null;

  // Failures are recorded too, so it is possible to see how often a log
  // could not be worked out. Recording never gets in the way of the reply.
  const record = async (success: boolean, errorMessage: string | null) => {
    if (!supabaseAdmin || !userId) return;
    try {
      await supabaseAdmin.rpc('log_api_usage', {
        user_uuid: userId,
        action: 'food_analysis',
        was_success: success,
        error_msg: errorMessage ? errorMessage.slice(0, 300) : null,
      });
    } catch (err) {
      console.error('Usage log failed:', err);
    }
  };

  // Asks the AI, checks every food and adds up (in code, never by the AI).
  // One answer, no retry. With checkBrand, the brand check decides about
  // web search. With onLive, foods and lookups are reported as they happen.
  const analyse = async (ask: Ask, checkBrand: boolean, onLive?: (event: LiveEvent) => void): Promise<Outcome> => {
    const startedAt = Date.now();
    let search = Boolean(ask.search);
    let asked: Asked;
    if (checkBrand) {
      const decided = await askWithBrandCheck(
        ask,
        OPENAI_API_KEY,
        CHECK_MODEL,
        { check: CHECK_TIMEOUT_MS, answer: AI_TIMEOUT_MS },
        onLive
      );
      brandCheck = decided.check;
      search = decided.search;
      asked = decided.asked;
    } else {
      asked = await askOpenAI(ask, OPENAI_API_KEY, AI_TIMEOUT_MS, onLive);
    }

    if (!asked.ok) {
      console.error('No usable answer from', ask.model, ':', asked.why);
      await record(false, `${ask.model}: ${asked.why}`);
      return { status: asked.why === 'timeout' ? 504 : 502, body: { error: TRY_AGAIN_MESSAGE } };
    }

    let answer: unknown;
    try {
      answer = JSON.parse(asked.text);
    } catch {
      console.error('Answer from', ask.model, 'was not JSON');
      await record(false, `${ask.model}: not json`);
      return { status: 502, body: { error: TRY_AGAIN_MESSAGE } };
    }

    // One line per log in the function's logs, so time, tokens and web
    // searches (each one is billed) can be added up later
    console.log(
      JSON.stringify({
        food_analysis: ask.model,
        effort: ask.effort,
        ms: Date.now() - startedAt,
        input_tokens: asked.usage.input_tokens,
        output_tokens: asked.usage.output_tokens,
        search,
        check: brandCheck ? brandCheck.lookup : 'skipped',
        check_ms: brandCheck ? brandCheck.ms : null,
        lookups: asked.lookups.count,
      })
    );

    const plate = readPlate(answer, { requireAmount: mustHaveAmount(ask) });
    if (!plate.ok) {
      await record(false, `${ask.model}: ${plate.reason}`);
      // 422: the log itself needs more from the client, or cannot be true
      return { status: 422, body: { error: plate.reason === 'invalid' ? INVALID_MESSAGE : plate.message } };
    }

    await record(true, null);
    return {
      status: 200,
      body: {
        // The same five fields the original analyser returns, so anything
        // that only wants a total still works
        ...plate.totals,
        // One entry per food: what the app logs as separate rows
        items: plate.items,
        // Which model answered, how long it took and what it used,
        // including any web lookups and the sites they read
        meta: {
          model: ask.model,
          effort: ask.effort,
          ms: Date.now() - startedAt,
          ...asked.usage,
          search,
          check: brandCheck,
          lookups: asked.lookups.count,
          sites: asked.lookups.sites,
        },
      },
    };
  };

  try {
    // ============================================
    // SECURITY: Verify Authentication
    // ============================================
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return reply(401, { error: 'Unauthorized: Missing auth token' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    // Read alongside the sign-in and limit checks, so it adds no wait
    const searchSwitch = readWebSearchSwitch(supabaseAdmin);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return reply(401, { error: 'Unauthorized: Invalid auth token' });
    }
    userId = user.id;

    // ============================================
    // SECURITY: Check Rate Limit SERVER-SIDE
    // ============================================
    const { data: canProceed, error: rateLimitError } = await supabase.rpc(
      'check_and_increment_rate_limit',
      { user_uuid: user.id }
    );
    if (rateLimitError || !canProceed) {
      return reply(429, { error: 'Rate limit exceeded. Please try again later.' });
    }

    // ============================================
    // READ THE LOG
    // ============================================
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return reply(400, { error: 'Either description or image is required' });
    }

    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const image = body.image;
    const hasImage = image !== undefined && image !== null && image !== '';

    if (!description && !hasImage) {
      return reply(400, { error: 'Either description or image is required' });
    }
    if (hasImage && !isUsablePhoto(image)) {
      return reply(400, { error: 'This photo could not be read. Please send a JPG or PNG photo.' });
    }

    // ============================================
    // WHICH MODEL (admins may compare, everyone else gets the default)
    // ============================================
    let model = DEFAULT_MODEL;
    let effort = DEFAULT_EFFORT;
    let forcedSearch: boolean | null = null;
    const test = body.test && typeof body.test === 'object' ? (body.test as Record<string, unknown>) : null;
    if (test) {
      const { data: status } = await supabase.rpc('get_rate_limit_status', { user_uuid: user.id });
      const isAdmin = Array.isArray(status) && status[0]?.account_type === 'admin';
      if (!isAdmin) {
        return reply(403, { error: 'Not allowed' });
      }
      if (typeof test.model === 'string' && TEST_MODELS.includes(test.model)) model = test.model;
      if (typeof test.effort === 'string' && TEST_EFFORTS.includes(test.effort)) effort = test.effort;
      // Admins can compare the same log with and without the web lookup
      if (typeof test.search === 'boolean') forcedSearch = test.search;
    }

    // ============================================
    // WEB SEARCH: off while the admin switch is off, on for a photo (the
    // check reads only the note). For a typed log the quick brand check
    // decides, so only logs that need a label carry the search tool.
    // ============================================
    const switchOn = await searchSwitch;
    const checkBrand = forcedSearch === null && switchOn && !hasImage;
    // Before any check: what the switch and the photo say
    const search = forcedSearch ?? searchThisLog({ switchOn, hasPhoto: hasImage, brand: null });

    const ask: Ask = { model, effort, description, image: hasImage ? (image as string) : null, search };

    // ============================================
    // ANSWER IN ONE PIECE (the meal builder, and anything that does not
    // ask for progress)
    // ============================================
    if (body.stream !== true) {
      const outcome = await analyse(ask, checkBrand);
      return reply(outcome.status, outcome.body);
    }

    // ============================================
    // ANSWER WITH PROGRESS: each food as it is found, then the checked,
    // added-up plate (or the reason there is none) as the last message
    // ============================================
    const encoder = new TextEncoder();
    const progress = new ReadableStream<Uint8Array>({
      async start(controller) {
        // The app may have gone away; the log is still finished and recorded
        const send = (event: unknown) => {
          try {
            controller.enqueue(encoder.encode(toEvent(event)));
          } catch {
            // Nobody is listening any more
          }
        };

        try {
          send({ type: 'start' });
          // Once a food turns up whose amount was only a guess, the log is
          // going to be turned back: nothing more is shown as found
          let turningBack = false;
          const outcome = await analyse(ask, checkBrand, (live) => {
            // Each web lookup as it starts and when it is done
            if (live.type === 'lookup') {
              const { id, kind, text, done } = live.lookup;
              send({ type: 'lookup', id, kind, text, done });
              return;
            }
            const food = live.food;
            if (mustHaveAmount(ask) && food.needs_amount) turningBack = true;
            if (!turningBack) {
              send({ type: 'food', name: food.name, portion: food.portion, assumed: food.assumed });
            }
          });
          send(
            outcome.status === 200
              ? { type: 'done', result: outcome.body }
              : { type: 'error', status: outcome.status, message: outcome.body.error }
          );
        } catch (error) {
          console.error('Food analysis error:', error);
          await record(false, 'unexpected');
          send({ type: 'error', status: 500, message: TRY_AGAIN_MESSAGE });
        } finally {
          try {
            controller.close();
          } catch {
            // Already closed
          }
        }
      },
    });

    return new Response(progress, { headers: STREAM_HEADERS });
  } catch (error) {
    console.error('Food analysis error:', error);
    await record(false, 'unexpected');
    return reply(500, { error: TRY_AGAIN_MESSAGE });
  }
});
