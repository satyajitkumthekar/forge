/**
 * API Layer - Server-Side API Calls via Supabase Edge Functions
 * ABSTRACTION: All API calls to Supabase Functions go through here
 * Components should NEVER call OpenAI or external APIs directly!
 */

import { supabase } from './supabase';
import type { CoachContext } from '../types';

/**
 * Helper function to make Supabase Function requests
 */
const invokeFunction = async <T>(functionName: string, body: any): Promise<T> => {
  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
    });

    if (error) {
      throw new Error(error.message || `Function error: ${functionName}`);
    }

    if (data.error) {
      throw new Error(data.error);
    }

    return data as T;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`API request failed: ${error.message}`);
    }
    throw new Error('API request failed');
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
    image?: string,
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
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
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
    },
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
