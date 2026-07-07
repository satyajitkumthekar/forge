/**
 * Database Layer - Supabase Operations
 * ABSTRACTION: All Supabase database calls go through here
 * Components should NEVER call Supabase directly!
 */

import { supabase } from './supabase';
import type {
  FoodEntry,
  UserSettings,
  RateLimitStatus,
  UserPositionInfo,
  AnalyticsSummary,
  DailyMetrics,
  UserMetric,
  CoachAnalyticsRow,
  Meal,
  AnchorCookbook,
  AnchorCookbookContent,
} from '../types';

/** Input shape for meal items and batch entry inserts */
export interface FoodItemInput {
  name: string;
  calories: number;
  protein: number;
  description?: string | null;
}

import { appToday, formatYMD } from '../utils/date';

// Canonical local-time date helpers (see utils/date.ts); UTC toISOString
// shifted the day for users west of Greenwich.
const getAppDate = appToday;
const formatDateToString = formatYMD;

export const db = {
  // ============================================
  // FOOD ENTRIES
  // ============================================
  food: {
    /**
     * Get food entries for a specific date
     */
    getByDate: async (date: string): Promise<FoodEntry[]> => {
      const { data, error } = await supabase
        .from('food_entries')
        .select('*')
        .eq('entry_date', date)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    },

    /**
     * Get food entries for a date range
     */
    getRange: async (startDate: string, endDate: string): Promise<FoodEntry[]> => {
      const { data, error } = await supabase
        .from('food_entries')
        .select('*')
        .gte('entry_date', startDate)
        .lte('entry_date', endDate)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    },

    /**
     * Add a new food entry
     */
    add: async (date: string, entry: Omit<FoodEntry, 'id' | 'entry_date' | 'created_at' | 'user_id'>): Promise<FoodEntry> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('food_entries')
        .insert({
          entry_date: date,
          user_id: user.id,
          ...entry,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    /**
     * Batch-insert entries for a date. When mealId is set (adding a saved
     * meal), every row is stamped so Quick Add can collapse them into one
     * meal chip. Entries remain individual rows — editable/deletable alone.
     */
    addMany: async (date: string, items: FoodItemInput[], mealId?: string): Promise<FoodEntry[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const rows = items.map((item) => ({
        entry_date: date,
        user_id: user.id,
        name: item.name,
        calories: item.calories,
        protein: item.protein,
        description: item.description ?? null,
        meal_id: mealId ?? null,
      }));

      const { data, error } = await supabase
        .from('food_entries')
        .insert(rows)
        .select();

      if (error) throw error;
      return data || [];
    },

    /**
     * Delete a food entry
     */
    delete: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('food_entries')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
  },

  // ============================================
  // MEALS (saved groups of food items)
  // ============================================
  meals: {
    /**
     * Get all of the user's meals with their items (items in position order)
     */
    list: async (): Promise<Meal[]> => {
      const { data, error } = await supabase
        .from('meals')
        .select('*, items:meal_items(*)')
        .order('created_at', { ascending: false })
        .order('position', { referencedTable: 'meal_items', ascending: true });

      if (error) throw error;
      return (data as Meal[]) || [];
    },

    /**
     * Create a meal from a list of items
     */
    create: async (name: string, items: FoodItemInput[]): Promise<Meal> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: meal, error } = await supabase
        .from('meals')
        .insert({ user_id: user.id, name })
        .select()
        .single();

      if (error) throw error;

      const { data: mealItems, error: itemsError } = await supabase
        .from('meal_items')
        .insert(items.map((item, index) => ({
          meal_id: meal.id,
          user_id: user.id,
          name: item.name,
          calories: item.calories,
          protein: item.protein,
          description: item.description ?? null,
          position: index,
        })))
        .select();

      if (itemsError) {
        // Don't leave an empty meal behind if items failed to insert
        await supabase.from('meals').delete().eq('id', meal.id);
        throw itemsError;
      }

      return { ...meal, items: mealItems || [] };
    },

    /**
     * Update a meal's name and replace its items.
     * Past logged entries keep their snapshot; only future adds change.
     */
    update: async (id: string, name: string, items: FoodItemInput[]): Promise<Meal> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: meal, error } = await supabase
        .from('meals')
        .update({ name })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const { error: deleteError } = await supabase
        .from('meal_items')
        .delete()
        .eq('meal_id', id);

      if (deleteError) throw deleteError;

      const { data: mealItems, error: itemsError } = await supabase
        .from('meal_items')
        .insert(items.map((item, index) => ({
          meal_id: id,
          user_id: user.id,
          name: item.name,
          calories: item.calories,
          protein: item.protein,
          description: item.description ?? null,
          position: index,
        })))
        .select();

      if (itemsError) throw itemsError;

      return { ...meal, items: mealItems || [] };
    },

    /**
     * Delete a meal. Logged history is preserved: food_entries.meal_id
     * nulls out via ON DELETE SET NULL.
     */
    remove: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('meals')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
  },

  // ============================================
  // ANCHOR COOKBOOKS (coach-authored meal programs)
  // ============================================
  cookbooks: {
    /**
     * The signed-in client's published cookbooks, newest first.
     * RLS enforces published-only for clients; the filters here keep the
     * query correct for admins too (who can read every row).
     */
    listMine: async (): Promise<AnchorCookbook[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('anchor_cookbooks')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as AnchorCookbook[]) || [];
    },

    /**
     * All of a client's cookbooks, any status (admin only via RLS)
     */
    adminListForUser: async (userId: string): Promise<AnchorCookbook[]> => {
      const { data, error } = await supabase
        .from('anchor_cookbooks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as AnchorCookbook[]) || [];
    },

    /**
     * Save converted content. Null id creates a new draft cookbook;
     * an id replaces that cookbook's content (status untouched).
     */
    adminSaveDraft: async (
      id: string | null,
      userId: string,
      content: AnchorCookbookContent
    ): Promise<AnchorCookbook> => {
      if (id) {
        const { data, error } = await supabase
          .from('anchor_cookbooks')
          .update({ content })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return data as AnchorCookbook;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('anchor_cookbooks')
        .insert({ user_id: userId, created_by: user.id, content })
        .select()
        .single();

      if (error) throw error;
      return data as AnchorCookbook;
    },

    /**
     * Rename the short label shown on cards/lists (masthead title untouched)
     */
    adminRename: async (cookbook: AnchorCookbook, shortTitle: string): Promise<AnchorCookbook> => {
      const { data, error } = await supabase
        .from('anchor_cookbooks')
        .update({ content: { ...cookbook.content, shortTitle } })
        .eq('id', cookbook.id)
        .select()
        .single();

      if (error) throw error;
      return data as AnchorCookbook;
    },

    /**
     * Publish: flips status and bakes the recipes into is_anchor meal
     * presets server-side. The client's one-tap add never computes anything.
     */
    adminPublish: async (id: string): Promise<void> => {
      const { error } = await supabase
        .rpc('admin_publish_anchor_cookbook', { p_cookbook_id: id });

      if (error) throw error;
    },

    /**
     * Unpublish: back to draft, presets removed. Logged history preserved
     * (food_entries.meal_id nulls via FK).
     */
    adminUnpublish: async (id: string): Promise<void> => {
      const { error } = await supabase
        .rpc('admin_unpublish_anchor_cookbook', { p_cookbook_id: id });

      if (error) throw error;
    },

    /**
     * Delete a cookbook. Its preset meals cascade away; logged history stays.
     */
    adminRemove: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('anchor_cookbooks')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },

    /**
     * Client marks their cookbook's reveal as seen (once, ever — DB-backed
     * so it never re-fires across devices)
     */
    markRevealed: async (id: string): Promise<void> => {
      const { error } = await supabase
        .rpc('mark_cookbook_revealed', { p_cookbook_id: id });

      if (error) throw error;
    },
  },

  // ============================================
  // USER SETTINGS
  // ============================================
  settings: {
    /**
     * Get user settings
     */
    get: async (): Promise<UserSettings> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) {
        // If no settings exist, return defaults
        return {
          id: '',
          user_id: user.id,
          target_calories: 2000,
          maintenance_calories: 2000,
          target_protein: 150,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }

      return data;
    },

    /**
     * Update user settings
     */
    update: async (settings: Partial<UserSettings>): Promise<UserSettings> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          ...settings,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
  },

  // ============================================
  // RATE LIMITING
  // ============================================
  rateLimit: {
    /**
     * Check if user has remaining API calls.
     * Returns false when the limit is hit (callers show a friendly message);
     * throws only on auth/RPC errors.
     */
    checkFood: async (): Promise<boolean> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .rpc('check_and_increment_rate_limit', { user_uuid: user.id });

      if (error) throw error;
      return Boolean(data);
    },

    /**
     * Check if user has remaining coach calls.
     * Returns false when the limit is hit; throws only on auth/RPC errors.
     */
    checkCoach: async (): Promise<boolean> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .rpc('check_and_increment_coach_limit', { user_uuid: user.id });

      if (error) throw error;
      return Boolean(data);
    },

    /**
     * Get rate limit status
     */
    getStatus: async (): Promise<RateLimitStatus> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .rpc('get_rate_limit_status', { user_uuid: user.id });

      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Rate limit status unavailable');
      return data[0];
    },
  },

  // ============================================
  // USER ACCESS
  // ============================================
  access: {
    /**
     * Check if user has access (waitlist system)
     */
    check: async (): Promise<boolean> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .rpc('check_user_access', { user_uuid: user.id });

      if (error) throw error;
      return data;
    },

    /**
     * Update last active timestamp
     */
    updateLastActive: async (): Promise<void> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .rpc('update_last_active', { user_uuid: user.id });
    },

    /**
     * Get user's position in waitlist
     */
    getUserPosition: async (): Promise<UserPositionInfo> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .rpc('get_user_position_info', { user_uuid: user.id });

      if (error) throw error;
      // Function returns array with one row
      if (!data || data.length === 0) {
        throw new Error('No position info found');
      }

      return {
        rank: data[0].rank,
        totalUsers: data[0].total_users,
        maxAllowed: data[0].max_allowed,
        hasAccess: data[0].has_access
      };
    },

    /**
     * Get coach reminder for current user
     */
    getReminder: async (): Promise<string | null> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('user_profiles')
        .select('coach_reminder')
        .eq('user_id', user.id)
        .single();

      if (error) return null;
      return data?.coach_reminder || null;
    },
  },

  // ============================================
  // FEEDBACK
  // ============================================
  feedback: {
    /**
     * Submit user feedback
     */
    submit: async (rating: number, type: string, message: string): Promise<void> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('user_feedback')
        .insert({
          user_id: user.id,
          rating,
          feedback_type: type,
          message,
        });

      if (error) throw error;
    },

    /**
     * Get user's feedback history
     */
    getHistory: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('user_feedback')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },

    /**
     * Get today's feedback count
     */
    getTodayCount: async (): Promise<number> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const today = getAppDate();

      const { count, error } = await supabase
        .from('user_feedback')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', today + 'T00:00:00')
        .lte('created_at', today + 'T23:59:59');

      if (error) throw error;
      return count || 0;
    },
  },

  // ============================================
  // ANALYTICS (Admin only)
  // ============================================
  analytics: {
    /**
     * Get food entries for any user (admin only - bypasses RLS)
     */
    getUserFoodEntries: async (userId: string, startDate: string, endDate: string): Promise<FoodEntry[]> => {
      const { data, error } = await supabase
        .rpc('admin_get_user_food_entries', {
          target_user_id: userId,
          start_date: startDate,
          end_date: endDate
        });

      if (error) throw error;
      return data || [];
    },

    /**
     * Get analytics summary - calls 3 separate RPC functions
     */
    getSummary: async (): Promise<AnalyticsSummary> => {
      const [totalUsers, totalFoodLogs, totalCoachCalls] = await Promise.all([
        supabase.rpc('get_total_users'),
        supabase.rpc('get_total_food_logs'),
        supabase.rpc('get_total_coach_calls')
      ]);

      if (totalUsers.error) throw totalUsers.error;
      if (totalFoodLogs.error) throw totalFoodLogs.error;
      if (totalCoachCalls.error) throw totalCoachCalls.error;

      return {
        totalUsers: totalUsers.data || 0,
        totalFoodLogs: totalFoodLogs.data || 0,
        totalCoachCalls: totalCoachCalls.data || 0
      };
    },

    /**
     * Get daily metrics for charts - calls 3 separate RPC functions
     */
    getDailyMetrics: async (daysBack: number = 30): Promise<DailyMetrics> => {
      const [dau, dailyLogs, dailyCalls] = await Promise.all([
        supabase.rpc('get_daily_active_users', { days_back: daysBack }),
        supabase.rpc('get_daily_food_logs', { days_back: daysBack }),
        supabase.rpc('get_daily_coach_calls', { days_back: daysBack })
      ]);

      if (dau.error) throw dau.error;
      if (dailyLogs.error) throw dailyLogs.error;
      if (dailyCalls.error) throw dailyCalls.error;

      return {
        dailyActiveUsers: dau.data || [],
        dailyFoodLogs: dailyLogs.data || [],
        dailyCoachCalls: dailyCalls.data || []
      };
    },

    /**
     * Get user metrics (admin only)
     */
    getUserMetrics: async (): Promise<UserMetric[]> => {
      const { data, error } = await supabase
        .rpc('get_user_metrics');

      if (error) throw error;
      return data;
    },

    /**
     * Update user's account tier
     */
    updateUserTier: async (userId: string, tier: 'basic' | 'pro' | 'admin'): Promise<void> => {
      const { error } = await supabase
        .rpc('admin_update_user_tier', {
          target_user_id: userId,
          new_tier: tier,
        });

      if (error) throw error;
    },

    /**
     * Toggle user's client flag
     */
    toggleClientFlag: async (userId: string, isClient: boolean): Promise<void> => {
      const { error } = await supabase
        .rpc('admin_toggle_client_flag', {
          target_user_id: userId,
          new_client_value: isClient,
        });

      if (error) throw error;
    },

    /**
     * Update user's coach reminder (admin only)
     */
    updateUserReminder: async (userId: string, reminder: string | null): Promise<void> => {
      const { error } = await supabase
        .rpc('admin_update_user_reminder', {
          target_user_id: userId,
          reminder_message: reminder,
        });

      if (error) throw error;
    },

    /**
     * Update user's macro targets (admin only)
     */
    updateUserMacros: async (
      userId: string,
      maintenanceCalories: number,
      targetCalories: number,
      targetProtein: number
    ): Promise<void> => {
      const { error } = await supabase
        .rpc('admin_update_user_macros', {
          target_user_id: userId,
          maintenance_cal: maintenanceCalories,
          target_cal: targetCalories,
          target_pro: targetProtein,
        });

      if (error) throw error;
    },

    /**
     * Get daily active users (legacy - kept for compatibility)
     */
    getDailyActiveUsers: async (daysBack: number = 30) => {
      const { data, error } = await supabase
        .rpc('get_daily_active_users', { days_back: daysBack });

      if (error) throw error;
      return data;
    },

    /**
     * Get coach analytics - detailed nutrition tracking for all users
     * @param weekStartDate - Monday date in YYYY-MM-DD format (optional, defaults to current week)
     */
    getCoachAnalytics: async (weekStartDate?: string): Promise<CoachAnalyticsRow[]> => {
      // Pass today's date to match dashboard calculations
      const today = getAppDate();

      const { data, error } = await supabase
        .rpc('get_coach_analytics', {
          week_start_date: weekStartDate || null,
          today_date: today
        });

      if (error) throw error;
      return data || [];
    },
  },

  // ============================================
  // ADMIN CONTROLS
  // ============================================
  admin: {
    /**
     * Get max allowed users setting
     */
    getMaxAllowedUsers: async (): Promise<number> => {
      const { data, error } = await supabase
        .rpc('get_max_allowed_users');

      if (error) throw error;
      return data;
    },

    /**
     * Update max allowed users setting - direct table update
     */
    updateMaxAllowedUsers: async (maxUsers: number): Promise<void> => {
      const { error } = await supabase
        .from('system_settings')
        .update({ max_allowed_users: maxUsers })
        .eq('id', 1);

      if (error) throw error;
    },

    /**
     * Get total number of users with access
     */
    getTotalActiveUsers: async (): Promise<number> => {
      const { data, error } = await supabase
        .rpc('get_total_active_users');

      if (error) throw error;
      return data;
    },
  },
};

// Helper functions for date formatting
export const formatDate = formatDateToString;
export const getTodayDate = getAppDate;
