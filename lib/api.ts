/**
 * API Layer - Server-Side API Calls via Supabase Edge Functions
 * ABSTRACTION: All API calls to Supabase Functions go through here
 * Components should NEVER call OpenAI or external APIs directly!
 */

import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { CoachContext, AnchorCookbookContent } from '../types';

const SESSION_EXPIRED_MESSAGE = 'Your session is no longer valid. Please sign in again.';

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
        // 401 means the stored access token was rejected server-side. The
        // client can't detect this locally (its expiry check trusts the
        // device clock), so force a server-validated refresh and retry once.
        // If the session can't refresh it's dead (deleted account, revoked
        // refresh token) — sign out cleanly instead of erroring forever.
        if (error.context.status === 401) {
          if (!hasRetried) {
            const { error: refreshError } = await supabase.auth.refreshSession();
            if (!refreshError) {
              return invokeFunction<T>(functionName, body, true);
            }
          }
          await supabase.auth.signOut();
          throw new Error(SESSION_EXPIRED_MESSAGE);
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
   * @returns Nutrition data (name, calories, protein)
   */
  analyzeFood: async (
    description: string,
    image?: string
  ): Promise<{
    name: string;
    calories: number;
    protein: number;
  }> => {
    return invokeFunction('analyze-food', {
      description,
      image,
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
