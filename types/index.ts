// Type Definitions for Food Tracker

export interface FoodEntry {
  id: string;
  entry_date: string;
  name: string;
  calories: number;
  protein: number;
  image_data?: string;
  description?: string;
  created_at: string;
  user_id: string;
  /** Set when the entry was logged via a saved meal (see Meal) */
  meal_id?: string | null;
}

export interface MealItem {
  id: string;
  meal_id: string;
  name: string;
  calories: number;
  protein: number;
  description?: string | null;
  position: number;
}

export interface Meal {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  items: MealItem[];
}

export interface UserSettings {
  id: string;
  user_id: string;
  target_calories: number;
  maintenance_calories: number;
  target_protein: number;
  created_at: string;
  updated_at: string;
  /** IANA timezone captured silently from the client's device */
  timezone?: string | null;
}

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface RateLimitStatus {
  calls_used: number;
  calls_limit: number;
  coach_calls_used: number;
  coach_calls_limit: number;
  resets_at: string;
  account_type: 'basic' | 'pro' | 'admin';
}

export interface CoachContext {
  recentLogs: { [date: string]: FoodEntry[] };
  targetCalories: number;
  targetProtein: number;
  maintenanceCalories: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface WeeklyStats {
  dailyData: DayData[];
  averages: {
    calories: number;
    protein: number;
  };
  deficit: {
    daily: number;
    weekly: number;
  };
  daysLogged: number;
}

export interface DayData {
  date: string;
  calories: number;
  protein: number;
  entries: FoodEntry[];
}

export interface FrequentItem extends Omit<FoodEntry, 'id' | 'entry_date' | 'created_at' | 'user_id'> {
  count: number;
  /** 'meal' chips re-add a whole saved meal; 'item' (default) a single food */
  type?: 'item' | 'meal';
  mealId?: string;
  itemCount?: number;
}

export type AccountType = 'basic' | 'pro' | 'admin';

export interface UserPositionInfo {
  rank: number;
  totalUsers: number;
  maxAllowed: number;
  hasAccess: boolean;
}

export interface AnalyticsSummary {
  totalUsers: number;
  totalFoodLogs: number;
  totalCoachCalls: number;
}

export interface DailyMetrics {
  dailyActiveUsers: Array<{ date: string; user_count: number }>;
  dailyFoodLogs: Array<{ date: string; log_count: number }>;
  dailyCoachCalls: Array<{ date: string; call_count: number }>;
}

export interface UserMetric {
  user_id: string;
  email: string;
  user_rank: number;
  account_type: AccountType;
  food_logs_count: number;
  coach_calls_count: number;
  last_active: string | null;
  client: boolean;
  maintenance_calories: number;
  target_calories: number;
  target_protein: number;
  coach_reminder: string | null;
  timezone?: string | null;
}

export interface DailyNutrition {
  calories: number;
  protein: number;
}

export interface CoachAnalyticsRow {
  user_id: string;
  email: string;
  target_calories: number;
  target_protein: number;
  maintenance_calories: number;
  d1_calories: number;
  d1_protein: number;
  d2_calories: number;
  d2_protein: number;
  d3_calories: number;
  d3_protein: number;
  d4_calories: number;
  d4_protein: number;
  d5_calories: number;
  d5_protein: number;
  d6_calories: number;
  d6_protein: number;
  d7_calories: number;
  d7_protein: number;
  avg_calories: number;
  avg_protein: number;
  daily_deficit: number;
  weekly_deficit: number;
  days_logged: number;
}

export interface MealTableRow {
  meal: string;
  timing: string;
  examples: string[];
  avgCal: number;
  avgPro: number;
  frequency: string;
  change: string | null;  // "ADD 2 eggs → +140cal, +12g pro" or null
}

export interface MealCoachingAnalysis {
  mealTable: MealTableRow[];
  totals: {
    currentCal: number;
    currentPro: number;
    targetCal: number;
    targetPro: number;
  };
}
