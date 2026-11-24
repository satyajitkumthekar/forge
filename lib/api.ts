/**
 * API Layer - Server-Side API Calls via Supabase Edge Functions
 * ABSTRACTION: All API calls to Supabase Functions go through here
 * Components should NEVER call OpenAI or external APIs directly!
 */

import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { CoachContext, AnchorCookbookContent } from '../types';
import { ProgressReader, type AnalysisProgress, type AnalysisResult } from '../utils/plate';

/**
 * The analyser a typed or photographed food goes to: the one that lists
 * each food on the plate separately. The original 'analyze-food' stays
 * deployed beside it and still serves estimateCarbsFat below, so pointing
 * this back at 'analyze-food' is all it takes to return to one total per
 * log.
 */
// A test copy of the app can point at a test copy of the analyser with
// EXPO_PUBLIC_FOOD_ANALYSER, so a change can be tried on localhost before
// clients get it. Unset everywhere else.
const FOOD_ANALYSER = process.env.EXPO_PUBLIC_FOOD_ANALYSER || 'analyze-food-v2';

/** Shown when the analyser's answer never arrived in full */
const ANALYSIS_LOST_MESSAGE = 'Could not work this one out just now. Please send it again.';

const SESSION_EXPIRED_MESSAGE = 'Your session is no longer valid. Please sign in again.';
const SERVER_REJECTED_MESSAGE = 'The server could not verify your login just now. Please try again in a moment.';

// A refresh failure only proves the session is dead when the auth server
// explicitly rejected it. Network failures and server errors are transient
// and must never log the user out.
const isSessionDead = (refreshError: unknown): boolean => {
  const status = (refreshError as { status?: number } | null)?.status;
  return status === 400 || status === 401 || status === 403 || status === 404;
};

/**
 * Helper function to make Supabase Function requests
 */
const invokeFunction = async <T>(functionName: string, body: any, hasRetried = false): Promise<T> => {
  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
    });

    if (error) {
      // Non-2xx responses surface as a generic "non-2xx status code" —
      // the function's actual { error } body lives on error.context
      if (error instanceof FunctionsHttpError) {
        // 401 means the access token was rejected server-side. The client
        // can't detect this locally (its expiry check trusts the device
        // clock), so force a server-validated refresh and retry once.
        // Sign out ONLY when the auth server explicitly declares the session
        // dead. A 401 that persists after a successful refresh means the
        // session is alive and something between us and the function is
        // rejecting valid tokens (seen with the AU edge gateway) — that must
        // surface as a retryable error, never as a sign-out.
        if (error.context.status === 401) {
          if (hasRetried) {
            throw new Error(SERVER_REJECTED_MESSAGE);
          }
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError) {
            return invokeFunction<T>(functionName, body, true);
          }
          if (isSessionDead(refreshError)) {
            await supabase.auth.signOut({ scope: 'local' });
            throw new Error(SESSION_EXPIRED_MESSAGE);
          }
          throw new Error(SERVER_REJECTED_MESSAGE);
        }
        let detail: string | undefined;
        try {
          const errorBody = await error.context.json();
          if (typeof errorBody?.error === 'string') detail = errorBody.error;
        } catch {
          // Body wasn't JSON — fall through to the generic message
        }
        throw new Error(detail || error.message || `Function error: ${functionName}`);
      }
      throw new Error(error.message || `Function error: ${functionName}`);
    }

    if (data.error) {
      throw new Error(data.error);
    }

    return data as T;
  } catch (error) {
    // Rethrow as-is: wrapping produced nested "API request failed: Function
    // error: ..." strings that leaked into user-facing error messages
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Request failed. Please try again.');
  }
};

export const api = {
  // ============================================
  // FOOD ANALYSIS (OpenAI GPT-4o)
  // ============================================

  /**
   * Analyze food from description and/or image
   * Calls Supabase Edge Function which calls OpenAI
   * @param description - Text description of food
   * @param image - Base64 encoded image (optional)
   * @returns The plate's totals (name, calories, protein, and carbs and fat
   *   in grams; null when unknown), plus each food on it in `items` with
   *   the portion that was assumed. Turn it into rows with
   *   foodsFromAnalysis (utils/plate.ts).
   */
  analyzeFood: async (description: string, image?: string): Promise<AnalysisResult> => {
    return invokeFunction(FOOD_ANALYSER, {
      description,
      image,
    });
  },

  /**
   * The same analysis, with progress, so the wait can show real working:
   * onProgress hears 'start' once the server has read and accepted the log
   * and has put it to the AI, each web lookup as it starts and finishes,
   * then each food the moment the AI has found it.
   * Those are for display only. The checked, added-up plate is what this
   * resolves to, exactly as analyzeFood does. One request, no retry: if the
   * connection drops before the plate arrives, this throws.
   */
  analyzeFoodLive: async (
    description: string,
    image: string | undefined,
    onProgress: (step: AnalysisProgress) => void
  ): Promise<AnalysisResult> => {
    const answer = await invokeFunction<Response | AnalysisResult>(FOOD_ANALYSER, {
      description,
      image,
      stream: true,
    });

    // An analyser that answers in one piece (the original one) has no
    // progress to report
    if (!(answer instanceof Response)) return answer;
    if (!answer.body) throw new Error(ANALYSIS_LOST_MESSAGE);

    const progress = new ProgressReader();
    const decoder = new TextDecoder();
    const reader = answer.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const event of progress.push(decoder.decode(value, { stream: true }))) {
          if (event.type === 'start') {
            onProgress({ type: 'start' });
          } else if (event.type === 'food') {
            onProgress({ type: 'food', name: event.name, portion: event.portion, assumed: event.assumed });
          } else if (event.type === 'lookup' && typeof event.id === 'string') {
            onProgress({
              type: 'lookup',
              id: event.id,
              kind: event.kind === 'page' ? 'page' : 'search',
              text: typeof event.text === 'string' ? event.text : '',
              done: event.done === true,
            });
          } else if (event.type === 'done') {
            return event.result;
          } else if (event.type === 'error') {
            throw new Error(event.message || ANALYSIS_LOST_MESSAGE);
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
    // The connection closed before the plate arrived
    throw new Error(ANALYSIS_LOST_MESSAGE);
  },

  /**
   * Carbs and fat for foods whose calories and protein are already known
   * (shortcuts copying a food logged before carbs and fat were tracked).
   * Same Edge Function and daily limit as analyzeFood; calories and protein
   * are never re-estimated.
   * @param items - The foods, each with its name, calories and protein
   * @returns One { carbs, fat } per food, in the order sent; null where the
   *   AI gave nothing usable
   */
  estimateCarbsFat: async (
    items: Array<{
      name: string;
      description?: string | null;
      calories: number;
      protein: number;
    }>
  ): Promise<{
    items: Array<{ carbs: number | null; fat: number | null }>;
  }> => {
    return invokeFunction('analyze-food', {
      mode: 'carbs_fat',
      items,
    });
  },

  // ============================================
  // COACH (OpenAI Assistants API)
  // ============================================

  /**
   * Ask the nutrition coach a question
   * Calls Supabase Edge Function which calls OpenAI Chat Completions API
   * @param message - User's question
   * @param context - Recent food logs and user settings
   * @param conversationHistory - Previous messages in the conversation (for threading)
   * @returns Coach's response
   */
  askCoach: async (
    message: string,
    context: CoachContext,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<{
    response: string;
  }> => {
    return invokeFunction('ask-coach', {
      message,
      context,
      conversationHistory: conversationHistory || [],
    });
  },

  // ============================================
  // MEAL COACHING ANALYSIS (OpenAI GPT-4o)
  // ============================================

  /**
   * Analyze weekly meal patterns and provide coaching suggestions
   * Calls Supabase Edge Function which calls OpenAI GPT-4o
   * @param userId - User ID to analyze
   * @param weekEntries - Array of meal entries with timestamps
   * @param targets - User's nutrition targets
   * @returns Meal coaching analysis with actionable suggestions
   */
  analyzeMealCoaching: async (
    userId: string,
    weekEntries: Array<{
      date: string;
      time: string;
      food: string;
      calories: number;
      protein: number;
    }>,
    targets: {
      calories: number;
      protein: number;
      maintenance: number;
    }
  ): Promise<{
    mealTable: Array<{
      meal: string;
      timing: string;
      examples: string[];
      avgCal: number;
      avgPro: number;
      frequency: string;
      change: string | null;
    }>;
    totals: {
      currentCal: number;
      currentPro: number;
      targetCal: number;
      targetPro: number;
    };
  }> => {
    return invokeFunction('analyze-meal-coaching', {
      user_id: userId,
      week_entries: weekEntries,
      targets,
    });
  },

  // ============================================
  // ANCHOR COOKBOOK CONVERSION (Claude Opus 4.8)
  // ============================================

  /**
   * Convert a coach's cookbook PDF into structured cookbook content.
   * Admin only (enforced server-side). The PDF is read once and never
   * stored — same philosophy as food images.
   * @param pdfBase64 - Base64 PDF (data-URL prefix tolerated)
   * @returns Structured cookbook content ready to save as a draft
   */
  convertAnchorCookbook: async (
    pdfBase64: string
  ): Promise<{ content: AnchorCookbookContent }> => {
    return invokeFunction('convert-anchor-cookbook', {
      pdf_base64: pdfBase64,
    });
  },
};

/**
 * Example usage in components:
 *
 * const result = await api.analyzeFood("grilled chicken", imageBase64);
 * console.log(result.calories); // OpenAI API key is safe on server!
 *
 * const response = await api.askCoach("How's my protein intake?", context);
 * console.log(response.response);
 */
