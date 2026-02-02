/**
 * Analytics Screen - Admin Dashboard
 * Shows system-wide metrics and user management
 * ABSTRACTION: Uses db.analytics APIs, never calls Supabase directly
 */

import React, { useState, useEffect } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { db } from '@/lib/database';
import { api } from '@/lib/api';
import { getCached, setCached, CACHE_KEYS } from '@/lib/enhanced-cache';
import { getWeekStart, formatWeekRange, getWeeklyStats } from '@/utils/weekly-stats';
import { getAppDate } from '@/utils/date-helpers';
import { format, addDays } from 'date-fns';
import type { AnalyticsSummary, DailyMetrics, UserMetric, CoachAnalyticsRow, FoodEntry, MealCoachingAnalysis } from '@/types';

// Cache TTL: 5 minutes (analytics don't need to be real-time)
const ANALYTICS_CACHE_TTL = 5 * 60 * 1000;

export default function AnalyticsScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const chartWidth = Math.min(windowWidth - 96, 800);

  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetrics | null>(null);
  const [userMetrics, setUserMetrics] = useState<UserMetric[]>([]);
  const [coachAnalytics, setCoachAnalytics] = useState<CoachAnalyticsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingTier, setUpdatingTier] = useState<string | null>(null);
  const [updatingClient, setUpdatingClient] = useState<string | null>(null);
  const [updatingMacros, setUpdatingMacros] = useState<string | null>(null);
  const [updatingReminder, setUpdatingReminder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [appAnalyticsOpen, setAppAnalyticsOpen] = useState(false);
  const [userSelectorOpen, setUserSelectorOpen] = useState(true);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const USERS_PER_PAGE = 15;
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [adminControlsOpen, setAdminControlsOpen] = useState(false);
  const [maxAllowedUsers, setMaxAllowedUsers] = useState(100);
  const [totalActiveUsers, setTotalActiveUsers] = useState(0);
  const [savedAdminControls, setSavedAdminControls] = useState(false);

  // Week selector for coach analytics (using 3 AM cutoff and local timezone)
  const getTodayDate = getAppDate;
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date(getTodayDate())));

  // Expandable rows state
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedRowsData, setExpandedRowsData] = useState<Map<string, Record<string, FoodEntry[]>>>(new Map());
  const [expandedRowViewMode, setExpandedRowViewMode] = useState<Map<string, 'table' | 'log' | 'coaching'>>(new Map());
  const [loadingExpanded, setLoadingExpanded] = useState<Set<string>>(new Set());
  const [coachingAnalysisData, setCoachingAnalysisData] = useState<Map<string, MealCoachingAnalysis>>(new Map());
  const [loadingCoaching, setLoadingCoaching] = useState<Set<string>>(new Set());

  useEffect(() => {
    checkAdminAndLoadAnalytics();
  }, [weekStart]);

  const checkAdminAndLoadAnalytics = async () => {
    try {
      // First check if user is admin
      const status = await db.rateLimit.getStatus();
      const userIsAdmin = status.account_type === 'admin';
      setIsAdmin(userIsAdmin);

      if (!userIsAdmin) {
        setLoading(false);
        setError('Access denied: Admin privileges required to view analytics');
        return;
      }

      // User is admin, proceed to load analytics
      await loadAnalytics();
    } catch (err: any) {
      console.error('[Analytics] Error checking admin status:', err);
      setIsAdmin(false);
      setLoading(false);
      setError('Access denied: Admin privileges required to view analytics');
    }
  };

  const loadAnalytics = async (forceRefresh = false) => {
    try {
      setError(null);

      // Check admin status first (unless already checked)
      if (isAdmin === null) {
        const status = await db.rateLimit.getStatus();
        const userIsAdmin = status.account_type === 'admin';
        setIsAdmin(userIsAdmin);

        if (!userIsAdmin) {
          setLoading(false);
          setError('Access denied: Admin privileges required to view analytics');
          return;
        }
      } else if (isAdmin === false) {
        setLoading(false);
        setError('Access denied: Admin privileges required to view analytics');
        return;
      }

      // PHASE 1: Load from cache - INSTANT (skip if force refresh)
      if (!forceRefresh) {
        const cachedData = getCached<{
          summary: AnalyticsSummary;
          metrics: DailyMetrics;
          users: UserMetric[];
          coach: CoachAnalyticsRow[];
        }>(CACHE_KEYS.analytics);

        if (cachedData) {
          // Show cached data immediately (no loading spinner!)
          setSummary(cachedData.summary);
          setDailyMetrics(cachedData.metrics);
          setUserMetrics(cachedData.users);
          setCoachAnalytics(cachedData.coach);
          setLoading(false);

          // Initialize selected users from cache
          if (cachedData.coach.length > 0 && selectedUsers.size === 0) {
            setSelectedUsers(new Set(cachedData.coach.slice(0, 5).map(u => u.user_id)));
          }
        } else {
          // No cache - show loading spinner
          setLoading(true);
        }
      } else {
        setLoading(true);
      }

      // PHASE 2: Fetch fresh data (revalidate in background)
      console.log('[Analytics] Fetching fresh data...');

      console.log('[Analytics] Fetching summary...');
      const summaryData = await db.analytics.getSummary();
      console.log('[Analytics] Summary fetched');

      console.log('[Analytics] Fetching daily metrics...');
      const metricsData = await db.analytics.getDailyMetrics(30);
      console.log('[Analytics] Daily metrics fetched');

      console.log('[Analytics] Fetching user metrics...');
      const usersData = await db.analytics.getUserMetrics();
      console.log('[Analytics] User metrics fetched');

      console.log('[Analytics] Fetching coach analytics...');
      const weekStartStr = format(weekStart, 'yyyy-MM-dd');
      const rawCoachData = await db.analytics.getCoachAnalytics(weekStartStr);
      console.log('[Analytics] Coach analytics fetched for week:', weekStartStr);

      console.log('[Analytics] Fetching admin controls data...');
      const [maxUsers, totalUsers] = await Promise.all([
        db.admin.getMaxAllowedUsers(),
        db.admin.getTotalActiveUsers(),
      ]);
      setMaxAllowedUsers(maxUsers);
      setTotalActiveUsers(totalUsers);
      console.log('[Analytics] Admin controls data fetched');

      // Use the same getWeeklyStats utility as the dashboard for consistency
      const coachData = await Promise.all(
        rawCoachData.map(async (user) => {
          // Build daily food entries data from the 7 day columns
          const entriesByDate: Record<string, FoodEntry[]> = {};

          for (let i = 0; i < 7; i++) {
            const date = addDays(weekStart, i);
            const dateStr = format(date, 'yyyy-MM-dd');
            const dayNum = i + 1;
            const calories = user[`d${dayNum}_calories` as keyof typeof user] as number;
            const protein = user[`d${dayNum}_protein` as keyof typeof user] as number;

            // Create synthetic entries to match the expected format
            if (calories > 0) {
              entriesByDate[dateStr] = [{
                id: `${user.user_id}-${dateStr}`,
                entry_date: dateStr,
                name: 'Daily Total',
                calories,
                protein,
                created_at: dateStr,
                user_id: user.user_id
              }];
            } else {
              entriesByDate[dateStr] = [];
            }
          }

          // Use getWeeklyStats utility - same logic as dashboard
          const stats = await getWeeklyStats(
            weekStart,
            user.target_calories,
            user.maintenance_calories,
            async () => entriesByDate
          );

          return {
            ...user,
            avg_calories: stats.averages.calories,
            avg_protein: stats.averages.protein,
            daily_deficit: stats.deficit.daily,
            weekly_deficit: stats.deficit.weekly,
            days_logged: stats.daysLogged
          };
        })
      );

      console.log('[Analytics] Coach data processed using getWeeklyStats utility:', coachData[0]);

      console.log('[Analytics] All data fetched successfully');

      // Update cache with 5-minute TTL
      setCached(
        CACHE_KEYS.analytics,
        {
          summary: summaryData,
          metrics: metricsData,
          users: usersData,
          coach: coachData,
        },
        ANALYTICS_CACHE_TTL
      );

      // Update UI silently (data already showing if cached)
      setSummary(summaryData);
      setDailyMetrics(metricsData);
      setUserMetrics(usersData);
      setCoachAnalytics(coachData);

      // Initialize selected users if not already set
      if (coachData.length > 0 && selectedUsers.size === 0) {
        setSelectedUsers(new Set(coachData.slice(0, 5).map(u => u.user_id)));
      }
    } catch (err: any) {
      console.error('[Analytics] Error loading analytics:', err);
      const errorMessage = err?.message || 'Failed to load analytics data';
      setError(errorMessage);

      // If it's an admin access error, show specific message
      if (errorMessage.includes('Admin') || errorMessage.includes('admin')) {
        setError('Access denied: Admin privileges required to view analytics');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTierChange = async (userId: string, newTier: 'basic' | 'pro' | 'admin') => {
    setUpdatingTier(userId);
    try {
      await db.analytics.updateUserTier(userId, newTier);

      // Reload analytics and update cache
      await loadAnalytics(true); // Force refresh to clear cache
    } catch (err) {
      console.error('Error updating tier:', err);
    } finally {
      setUpdatingTier(null);
    }
  };

  const handleClientToggle = async (userId: string, currentValue: boolean) => {
    setUpdatingClient(userId);
    try {
      await db.analytics.toggleClientFlag(userId, !currentValue);

      // Reload analytics and update cache
      await loadAnalytics(true); // Force refresh to clear cache
    } catch (err) {
      console.error('Error toggling client flag:', err);
    } finally {
      setUpdatingClient(null);
    }
  };

  const handleMacroUpdate = async (
    userId: string,
    maintenance: number,
    target: number,
    protein: number
  ) => {
    setUpdatingMacros(userId);
    try {
      await db.analytics.updateUserMacros(userId, maintenance, target, protein);

      // Update local state optimistically
      setUserMetrics(prev =>
        prev.map(user =>
          user.user_id === userId
            ? {
                ...user,
                maintenance_calories: maintenance,
                target_calories: target,
                target_protein: protein,
              }
            : user
        )
      );

      // Reload analytics to sync with server
      await loadAnalytics(true); // Force refresh to clear cache
    } catch (err) {
      console.error('Error updating user macros:', err);
      alert('Failed to update macros');
    } finally {
      setUpdatingMacros(null);
    }
  };

  const handleReminderUpdate = async (userId: string, reminder: string) => {
    setUpdatingReminder(userId);
    try {
      const trimmedReminder = reminder.trim();
      await db.analytics.updateUserReminder(
        userId,
        trimmedReminder === '' ? null : trimmedReminder
      );

      // Update local state optimistically
      setUserMetrics(prev =>
        prev.map(user =>
          user.user_id === userId
            ? { ...user, coach_reminder: trimmedReminder || null }
            : user
        )
      );

      // Reload analytics to sync with server
      await loadAnalytics(true); // Force refresh to clear cache
    } catch (err) {
      console.error('Error updating reminder:', err);
      alert('Failed to update reminder');
    } finally {
      setUpdatingReminder(null);
    }
  };

  const handleSaveAdminControls = async () => {
    try {
      await db.admin.updateMaxAllowedUsers(maxAllowedUsers);
      setSavedAdminControls(true);
      setTimeout(() => setSavedAdminControls(false), 2000);
    } catch (err) {
      console.error('Error saving admin controls:', err);
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const selectAllUsers = () => {
    setSelectedUsers(new Set(coachAnalytics.map(u => u.user_id)));
  };

  const deselectAllUsers = () => {
    setSelectedUsers(new Set());
  };

  const navigateWeek = (direction: number) => {
    const newWeekStart = new Date(weekStart);
    newWeekStart.setDate(newWeekStart.getDate() + direction * 7);

    // Don't allow navigating to future weeks
    if (direction > 0) {
      const currentWeekStart = getWeekStart(new Date(getTodayDate()));
      if (format(newWeekStart, 'yyyy-MM-dd') > format(currentWeekStart, 'yyyy-MM-dd')) {
        return;
      }
    }

    // Clear expanded rows cache when changing weeks
    setExpandedRowsData(new Map());
    setWeekStart(newWeekStart);
  };

  const goToCurrentWeek = () => {
    // Clear expanded rows cache when changing weeks
    setExpandedRowsData(new Map());
    setWeekStart(getWeekStart(new Date(getTodayDate())));
  };

  const isCurrentWeek = () => {
    const currentWeekStart = getWeekStart(new Date(getTodayDate()));
    return format(weekStart, 'yyyy-MM-dd') === format(currentWeekStart, 'yyyy-MM-dd');
  };

  const toggleExpand = async (userId: string) => {
    const newExpanded = new Set(expandedRows);

    if (newExpanded.has(userId)) {
      // Collapse
      newExpanded.delete(userId);
      setExpandedRows(newExpanded);
    } else {
      // Expand - load data if not cached
      newExpanded.add(userId);
      setExpandedRows(newExpanded);

      if (!expandedRowsData.has(userId)) {
        await loadWeeklyEntries(userId);
      }
    }
  };

  const loadWeeklyEntries = async (userId: string) => {
    setLoadingExpanded(prev => new Set(prev).add(userId));

    try {
      const weekEnd = addDays(weekStart, 6);
      const startDate = format(weekStart, 'yyyy-MM-dd');
      const endDate = format(weekEnd, 'yyyy-MM-dd');

      console.log('[Analytics] Loading weekly entries for user:', userId, 'from', startDate, 'to', endDate);

      // Use admin function to fetch entries for any user
      const userEntries = await db.analytics.getUserFoodEntries(userId, startDate, endDate);
      console.log('[Analytics] Fetched entries count:', userEntries.length, 'for user:', userId);
      const groupedByDate: Record<string, FoodEntry[]> = {};

      // Initialize all 7 days with empty arrays
      for (let i = 0; i < 7; i++) {
        const date = addDays(weekStart, i);
        const dateStr = format(date, 'yyyy-MM-dd');
        groupedByDate[dateStr] = [];
      }

      // Fill in the actual entries
      userEntries.forEach(entry => {
        if (!groupedByDate[entry.entry_date]) {
          groupedByDate[entry.entry_date] = [];
        }
        groupedByDate[entry.entry_date].push(entry);
      });

      console.log('[Analytics] Loaded entries for user:', userId, 'total entries:', userEntries.length);
      console.log('[Analytics] Grouped data:', groupedByDate);

      // Update cache
      setExpandedRowsData(prev => new Map(prev).set(userId, groupedByDate));

      // Initialize view mode if not set
      if (!expandedRowViewMode.has(userId)) {
        setExpandedRowViewMode(prev => new Map(prev).set(userId, 'table'));
      }
    } catch (err) {
      console.error('[Analytics] Error loading weekly entries:', err);
      console.error('[Analytics] Full error:', err);
    } finally {
      setLoadingExpanded(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    }
  };

  const updateViewMode = async (userId: string, mode: 'table' | 'log' | 'coaching') => {
    setExpandedRowViewMode(prev => new Map(prev).set(userId, mode));

    // If switching to coaching view, load analysis if not cached
    if (mode === 'coaching' && !coachingAnalysisData.has(userId)) {
      await loadCoachingAnalysis(userId);
    }
  };

  const loadCoachingAnalysis = async (userId: string) => {
    setLoadingCoaching(prev => new Set(prev).add(userId));

    try {
      // Get user data from coachAnalytics
      const user = coachAnalytics.find(u => u.user_id === userId);
      if (!user) {
        console.error('[Analytics] User not found in coachAnalytics:', userId);
        return;
      }

      // Get the week's entries for this user
      const weekEnd = addDays(weekStart, 6);
      const startDate = format(weekStart, 'yyyy-MM-dd');
      const endDate = format(weekEnd, 'yyyy-MM-dd');

      const userEntries = await db.analytics.getUserFoodEntries(userId, startDate, endDate);

      // Filter out today's incomplete data to avoid skewing the analysis
      const today = getTodayDate();
      const filteredEntries = userEntries.filter(entry => entry.entry_date !== today);

      // Format entries for AI with timestamps
      const weekEntries = filteredEntries.map(entry => ({
        date: entry.entry_date,
        time: format(new Date(entry.created_at), 'HH:mm'),
        food: entry.description || entry.name,
        calories: entry.calories,
        protein: entry.protein
      }));

      // Call the Edge Function via API abstraction
      const analysis = await api.analyzeMealCoaching(
        userId,
        weekEntries,
        {
          calories: user.target_calories,
          protein: user.target_protein,
          maintenance: user.maintenance_calories
        }
      );

      // Cache the result
      setCoachingAnalysisData(prev => new Map(prev).set(userId, analysis));
    } catch (err: any) {
      console.error('[Analytics] Error loading coaching analysis:', err);
      alert(err.message || 'Failed to load coaching analysis');
    } finally {
      setLoadingCoaching(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'admin':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'pro':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  // Helper function to get color coding for daily calories
  // Aligned side: gradual (0-10% green, 10-20% yellow, 20-30% orange, >30% red)
  // Non-aligned side: strict (>5% red)
  const getCaloriesColor = (calories: number, target: number, maintenance: number) => {
    if (calories === 0) return 'bg-gray-100 text-gray-500';

    const isDeficit = target < maintenance;  // Cutting
    const isSurplus = target > maintenance;  // Bulking

    const diff = calories - target;
    const percentDiff = (diff / target) * 100;  // Positive = above, negative = below

    // Determine if we're on the "aligned" side (good direction)
    const isAligned = (isDeficit && diff < 0) || (isSurplus && diff > 0);

    if (isAligned) {
      // ALIGNED SIDE (good direction) - Gradual thresholds
      const absDiff = Math.abs(percentDiff);
      if (absDiff <= 10) return 'bg-green-100 text-green-700';      // 0-10%
      if (absDiff <= 20) return 'bg-yellow-100 text-yellow-700';    // 10-20%
      if (absDiff <= 30) return 'bg-orange-100 text-orange-700';    // 20-30%
      return 'bg-red-100 text-red-700';                             // >30%
    } else {
      // NON-ALIGNED SIDE (bad direction) - Strict threshold
      const absDiff = Math.abs(percentDiff);
      if (absDiff <= 5) return 'bg-green-100 text-green-700';       // 0-5% tolerance
      return 'bg-red-100 text-red-700';                             // >5%
    }
  };

  // Helper function to get color coding for daily protein
  // 0-10% green, 10-20% yellow, 20-30% orange, >30% red
  const getProteinColor = (protein: number, target: number) => {
    if (protein === 0) return 'bg-gray-100 text-gray-500';

    // Calculate percentage below target
    const percentBelow = ((target - protein) / target) * 100;

    // Green: at or above target, or 0-10% below
    if (percentBelow <= 10) return 'bg-green-100 text-green-700';    // 0-10% below

    // Yellow: 10-20% below target
    if (percentBelow <= 20) return 'bg-yellow-100 text-yellow-700';  // 10-20% below

    // Orange: 20-30% below target
    if (percentBelow <= 30) return 'bg-orange-100 text-orange-700';  // 20-30% below

    // Red: more than 30% below target
    return 'bg-red-100 text-red-700';                                // >30% below
  };

  // Calculate deficit/surplus status and color
  const getDeficitDisplay = (dailyDeficit: number, targetCal: number, maintenance: number) => {
    const isCutting = targetCal < maintenance;
    const isBulking = targetCal > maintenance;
    const isDeficit = dailyDeficit < 0;
    const isSurplus = dailyDeficit > 0;

    let color = 'text-gray-700';
    let label = 'Maintenance';

    if (isDeficit) {
      // In deficit
      label = `${Math.abs(dailyDeficit)} cal deficit`;
      color = (isCutting) ? 'text-green-700' : 'text-red-700';
    } else if (isSurplus) {
      // In surplus
      label = `${Math.abs(dailyDeficit)} cal surplus`;
      color = (isBulking) ? 'text-green-700' : 'text-red-700';
    }

    return { label, color };
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 p-12">
        <div className="max-w-md bg-white rounded-xl border border-red-200 p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-gray-900 mb-1">Error Loading Analytics</h3>
              <p className="text-sm text-gray-700 mb-4">{error}</p>
              <button
                onClick={() => loadAnalytics(true)}
                className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-all"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !summary || !dailyMetrics) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 p-12">
        <div className="flex items-center gap-3">
          <svg className="animate-spin h-5 w-5 text-gray-900" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-gray-900 font-medium">Loading analytics...</span>
        </div>
      </div>
    );
  }

  const filteredCoachAnalytics = coachAnalytics.filter(user => selectedUsers.has(user.user_id));

  // Search and sort user metrics
  const filteredAndSortedUserMetrics = userMetrics
    // Filter by search query
    .filter(user =>
      searchQuery === '' ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
    )
    // Sort by: 1) client status (true first), 2) food logs count (descending)
    .sort((a, b) => {
      // First sort by client status (clients first)
      if (a.client !== b.client) {
        return a.client ? -1 : 1;
      }
      // Then sort by food logs count (descending)
      return b.food_logs_count - a.food_logs_count;
    });

  // Pagination for user metrics
  const totalPages = Math.ceil(filteredAndSortedUserMetrics.length / USERS_PER_PAGE);
  const paginatedUserMetrics = filteredAndSortedUserMetrics.slice(
    (currentPage - 1) * USERS_PER_PAGE,
    currentPage * USERS_PER_PAGE
  );

  return (
    <div className="h-screen overflow-y-auto bg-gray-50 p-3 md:p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-xs text-gray-500 mt-1">System-wide metrics and user management</p>
          </div>
          <button
            onClick={() => loadAnalytics(true)}
            className="px-4 py-2 border border-gray-200 bg-white rounded-lg text-sm font-medium text-gray-900 hover:bg-gray-50 transition-all"
          >
            Refresh
          </button>
        </div>

        {/* SECTION 0: Admin Controls (Collapsible) */}
        <div className="mb-8">
          <button
            onClick={() => setAdminControlsOpen(!adminControlsOpen)}
            className="w-full bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:bg-gray-50 transition-all flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-purple-600">Admin Controls</span>
              <span className="text-xs text-gray-500">User access management</span>
            </div>
            <svg
              className={`w-5 h-5 text-gray-600 transition-transform ${adminControlsOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {adminControlsOpen && (
            <div className="mt-4 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="space-y-6">
                {/* User Access Limit */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    User Access Limit
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={maxAllowedUsers}
                      onChange={(e) => setMaxAllowedUsers(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white text-gray-900 font-medium text-sm"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                      users
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    <span className="font-semibold">{totalActiveUsers}</span> of{' '}
                    <span className="font-semibold">{maxAllowedUsers}</span> users have access
                  </p>
                </div>

                {/* Tier API Limits */}
                <div className="pt-4 border-t border-gray-200">
                  <h3 className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                    Tier API Call Limits (Daily)
                  </h3>
                  <div className="space-y-3">
                    {/* Basic Tier */}
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-gray-200 text-gray-700 uppercase">
                          Basic
                        </span>
                      </div>
                      <div className="flex gap-4 text-xs">
                        <span className="text-gray-600">
                          Food: <span className="font-semibold text-gray-900">50</span>
                        </span>
                        <span className="text-gray-600">
                          Coach: <span className="font-semibold text-gray-900">10</span>
                        </span>
                      </div>
                    </div>

                    {/* Pro Tier */}
                    <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-blue-100 text-blue-700 uppercase">
                          Pro
                        </span>
                      </div>
                      <div className="flex gap-4 text-xs">
                        <span className="text-gray-600">
                          Food: <span className="font-semibold text-gray-900">100</span>
                        </span>
                        <span className="text-gray-600">
                          Coach: <span className="font-semibold text-gray-900">50</span>
                        </span>
                      </div>
                    </div>

                    {/* Admin Tier */}
                    <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-200">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-purple-100 text-purple-700 uppercase">
                          Admin
                        </span>
                      </div>
                      <div className="flex gap-4 text-xs">
                        <span className="text-gray-600">
                          Food: <span className="font-semibold text-gray-900">Unlimited</span>
                        </span>
                        <span className="text-gray-600">
                          Coach: <span className="font-semibold text-gray-900">Unlimited</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleSaveAdminControls}
                  className="w-full px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-lg transition-all font-medium text-sm"
                >
                  {savedAdminControls ? '✓ Saved!' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 1: App Analytics (Collapsible) */}
        <div className="mb-8">
          <button
            onClick={() => setAppAnalyticsOpen(!appAnalyticsOpen)}
            className="w-full bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:bg-gray-50 transition-all flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-gray-900">App Analytics</span>
              <span className="text-xs text-gray-500">System metrics and user management</span>
            </div>
            <svg
              className={`w-5 h-5 text-gray-600 transition-transform ${appAnalyticsOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {appAnalyticsOpen && (
            <div className="mt-4 space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Total Users */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <span className="text-xl">👥</span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Total Users</p>
                      <p className="text-2xl font-bold text-gray-900">{summary.totalUsers}</p>
                    </div>
                  </div>
                </div>

                {/* Total Food Logs */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <span className="text-xl">📋</span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Total Food Logs</p>
                      <p className="text-2xl font-bold text-gray-900">{summary.totalFoodLogs}</p>
                    </div>
                  </div>
                </div>

                {/* Total Coach Calls */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                      <span className="text-xl">💬</span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Total Coach Calls</p>
                      <p className="text-2xl font-bold text-gray-900">{summary.totalCoachCalls}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Analytics Charts */}
              <div className="space-y-4">
                {/* Daily Active Users */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-900 mb-4">Daily Active Users (Last 30 Days)</h3>
                  <View style={{ alignItems: 'center' }}>
                    <LineChart
                      data={dailyMetrics.dailyActiveUsers.map(item => ({
                        value: item.user_count,
                        label: formatDate(item.date)
                      }))}
                      width={chartWidth}
                      height={200}
                      color="#3b82f6"
                      thickness={2}
                      startFillColor="rgba(59, 130, 246, 0.3)"
                      endFillColor="rgba(59, 130, 246, 0.01)"
                      startOpacity={0.9}
                      endOpacity={0.2}
                      spacing={30}
                      noOfSections={5}
                      yAxisColor="#E5E7EB"
                      xAxisColor="#E5E7EB"
                      yAxisTextStyle={{ color: '#6B7280', fontSize: 12 }}
                      xAxisLabelTextStyle={{ color: '#6B7280', fontSize: 10, width: 70, textAlign: 'center' }}
                      hideRules
                      isAnimated
                      animationDuration={300}
                    />
                  </View>
                </div>

                {/* Daily Food Logs */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-900 mb-4">Daily Food Logs (Last 30 Days)</h3>
                  <View style={{ alignItems: 'center' }}>
                    <LineChart
                      data={dailyMetrics.dailyFoodLogs.map(item => ({
                        value: item.log_count,
                        label: formatDate(item.date)
                      }))}
                      width={chartWidth}
                      height={200}
                      color="#10b981"
                      thickness={2}
                      startFillColor="rgba(16, 185, 129, 0.3)"
                      endFillColor="rgba(16, 185, 129, 0.01)"
                      startOpacity={0.9}
                      endOpacity={0.2}
                      spacing={30}
                      noOfSections={5}
                      yAxisColor="#E5E7EB"
                      xAxisColor="#E5E7EB"
                      yAxisTextStyle={{ color: '#6B7280', fontSize: 12 }}
                      xAxisLabelTextStyle={{ color: '#6B7280', fontSize: 10, width: 70, textAlign: 'center' }}
                      hideRules
                      isAnimated
                      animationDuration={300}
                    />
                  </View>
                </div>

                {/* Daily Coach Calls */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-900 mb-4">Daily Coach Calls (Last 30 Days)</h3>
                  <View style={{ alignItems: 'center' }}>
                    <LineChart
                      data={dailyMetrics.dailyCoachCalls.map(item => ({
                        value: item.call_count,
                        label: formatDate(item.date)
                      }))}
                      width={chartWidth}
                      height={200}
                      color="#8b5cf6"
                      thickness={2}
                      startFillColor="rgba(139, 92, 246, 0.3)"
                      endFillColor="rgba(139, 92, 246, 0.01)"
                      startOpacity={0.9}
                      endOpacity={0.2}
                      spacing={30}
                      noOfSections={5}
                      yAxisColor="#E5E7EB"
                      xAxisColor="#E5E7EB"
                      yAxisTextStyle={{ color: '#6B7280', fontSize: 12 }}
                      xAxisLabelTextStyle={{ color: '#6B7280', fontSize: 10, width: 70, textAlign: 'center' }}
                      hideRules
                      isAnimated
                      animationDuration={300}
                    />
                  </View>
                </div>
              </div>

              {/* User Metrics Table */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-sm font-bold text-gray-900">User Activity</h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Showing {filteredAndSortedUserMetrics.length > 0 ? (currentPage - 1) * USERS_PER_PAGE + 1 : 0}-{Math.min(currentPage * USERS_PER_PAGE, filteredAndSortedUserMetrics.length)} of {filteredAndSortedUserMetrics.length} users
                        {searchQuery && ` (filtered from ${userMetrics.length} total)`}
                      </p>
                    </div>
                  </div>

                  {/* Search Input */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search users by email..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1); // Reset to first page on search
                      }}
                      className="w-full px-4 py-2.5 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400 bg-white text-gray-900 text-sm"
                    />
                    <svg
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>

                {userMetrics.length === 0 ? (
                  <div className="p-12 text-center">
                    <p className="text-sm text-gray-500">No users yet</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Email</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">User #</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Tier</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Client</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Maintenance Cal</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Target Cal</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Target Pro</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Food Logs</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Coach Calls</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Last Active</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedUserMetrics.map((user) => (
                            <tr key={user.user_id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-4 text-sm text-gray-900">{user.email}</td>
                              <td className="px-6 py-4 text-sm text-gray-700">#{user.user_rank}</td>
                              <td className="px-6 py-4">
                                <select
                                  value={user.account_type}
                                  onChange={(e) => handleTierChange(user.user_id, e.target.value as 'basic' | 'pro' | 'admin')}
                                  disabled={updatingTier === user.user_id}
                                  className={`px-2.5 py-1.5 border rounded-lg text-xs font-semibold uppercase cursor-pointer hover:opacity-80 transition-all ${getTierColor(user.account_type)} ${updatingTier === user.user_id ? 'opacity-50 cursor-wait' : ''}`}
                                >
                                  <option value="basic">Basic</option>
                                  <option value="pro">Pro</option>
                                  <option value="admin">Admin</option>
                                </select>
                              </td>
                              <td className="px-6 py-4">
                                <button
                                  onClick={() => handleClientToggle(user.user_id, user.client)}
                                  disabled={updatingClient === user.user_id}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    user.client
                                      ? 'bg-green-100 text-green-700 border border-green-200 hover:bg-green-200'
                                      : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                                  } ${updatingClient === user.user_id ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
                                >
                                  {updatingClient === user.user_id ? '...' : user.client ? 'YES' : 'NO'}
                                </button>
                              </td>
                              <td className="px-6 py-4">
                                <input
                                  type="number"
                                  defaultValue={user.maintenance_calories}
                                  onBlur={(e) => {
                                    const newValue = parseInt(e.target.value) || user.maintenance_calories;
                                    if (newValue !== user.maintenance_calories) {
                                      handleMacroUpdate(
                                        user.user_id,
                                        newValue,
                                        user.target_calories,
                                        user.target_protein
                                      );
                                    }
                                  }}
                                  disabled={updatingMacros === user.user_id}
                                  className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
                                />
                              </td>
                              <td className="px-6 py-4">
                                <input
                                  type="number"
                                  defaultValue={user.target_calories}
                                  onBlur={(e) => {
                                    const newValue = parseInt(e.target.value) || user.target_calories;
                                    if (newValue !== user.target_calories) {
                                      handleMacroUpdate(
                                        user.user_id,
                                        user.maintenance_calories,
                                        newValue,
                                        user.target_protein
                                      );
                                    }
                                  }}
                                  disabled={updatingMacros === user.user_id}
                                  className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
                                />
                              </td>
                              <td className="px-6 py-4">
                                <input
                                  type="number"
                                  defaultValue={user.target_protein}
                                  onBlur={(e) => {
                                    const newValue = parseInt(e.target.value) || user.target_protein;
                                    if (newValue !== user.target_protein) {
                                      handleMacroUpdate(
                                        user.user_id,
                                        user.maintenance_calories,
                                        user.target_calories,
                                        newValue
                                      );
                                    }
                                  }}
                                  disabled={updatingMacros === user.user_id}
                                  className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
                                />
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-700">{user.food_logs_count}</td>
                              <td className="px-6 py-4 text-sm text-gray-700">{user.coach_calls_count}</td>
                              <td className="px-6 py-4 text-sm text-gray-500">{formatDateTime(user.last_active)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                      <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                          className={`px-4 py-2 border rounded-lg text-sm font-medium transition-all ${
                            currentPage === 1
                              ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                              : 'border-gray-300 text-gray-900 bg-white hover:bg-gray-50'
                          }`}
                        >
                          Previous
                        </button>
                        <span className="text-sm text-gray-700">
                          Page {currentPage} of {totalPages}
                        </span>
                        <button
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                          className={`px-4 py-2 border rounded-lg text-sm font-medium transition-all ${
                            currentPage === totalPages
                              ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                              : 'border-gray-300 text-gray-900 bg-white hover:bg-gray-50'
                          }`}
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2: Coach Analytics (Main Section) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-gray-900">Coach Analytics</h2>
                <p className="text-xs text-gray-500 mt-0.5">Detailed nutrition tracking by week</p>
              </div>
            </div>

            {/* Week Selector */}
            <div className="mb-4 bg-gray-50 rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => navigateWeek(-1)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-all"
                  title="Previous week"
                >
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                <div className="text-center">
                  <h3 className="text-sm font-bold text-gray-900">
                    {formatWeekRange(weekStart)}
                  </h3>
                  {!isCurrentWeek() && (
                    <button
                      onClick={goToCurrentWeek}
                      className="mt-1 px-3 py-1 bg-black text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-all"
                    >
                      Current Week
                    </button>
                  )}
                </div>

                <button
                  onClick={() => navigateWeek(1)}
                  disabled={isCurrentWeek()}
                  className={`p-2 rounded-lg transition-all ${
                    isCurrentWeek()
                      ? 'opacity-30 cursor-not-allowed'
                      : 'hover:bg-gray-100'
                  }`}
                  title="Next week"
                >
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* User Selector (Collapsible) */}
            <div className="mb-4">
              <button
                onClick={() => setUserSelectorOpen(!userSelectorOpen)}
                className="w-full bg-gray-50 rounded-lg border border-gray-200 p-3 hover:bg-gray-100 transition-all flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-900">User Selection</span>
                  <span className="text-xs text-gray-500">
                    ({selectedUsers.size} of {coachAnalytics.length} selected)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!userSelectorOpen && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          selectAllUsers();
                        }}
                        className="px-2 py-1 border border-gray-300 bg-white rounded text-xs font-medium text-gray-900 hover:bg-gray-50 transition-all"
                      >
                        Select All
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deselectAllUsers();
                        }}
                        className="px-2 py-1 border border-gray-300 bg-white rounded text-xs font-medium text-gray-900 hover:bg-gray-50 transition-all"
                      >
                        Clear
                      </button>
                    </>
                  )}
                  <svg
                    className={`w-4 h-4 text-gray-600 transition-transform ${userSelectorOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {userSelectorOpen && (
                <div className="mt-3 space-y-3">
                  <div className="flex gap-2">
                    <button
                      onClick={selectAllUsers}
                      className="px-3 py-1.5 border border-gray-200 bg-white rounded-lg text-xs font-medium text-gray-900 hover:bg-gray-50 transition-all"
                    >
                      Select All
                    </button>
                    <button
                      onClick={deselectAllUsers}
                      className="px-3 py-1.5 border border-gray-200 bg-white rounded-lg text-xs font-medium text-gray-900 hover:bg-gray-50 transition-all"
                    >
                      Deselect All
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {coachAnalytics.map(user => (
                      <button
                        key={user.user_id}
                        onClick={() => toggleUserSelection(user.user_id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          selectedUsers.has(user.user_id)
                            ? 'bg-black text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {user.email}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Coach Analytics Table */}
          {filteredCoachAnalytics.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm text-gray-500">No users selected</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Target</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Weekly Avg</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Daily Avg +-</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Weekly Total</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Mon</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Tue</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Wed</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Thu</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Fri</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Sat</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Sun</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCoachAnalytics.map((user) => {
                    const deficitDisplay = getDeficitDisplay(user.daily_deficit, user.target_calories, user.maintenance_calories);
                    const weeklyDeficitDisplay = getDeficitDisplay(user.weekly_deficit, user.target_calories, user.maintenance_calories);
                    const isExpanded = expandedRows.has(user.user_id);
                    const isLoading = loadingExpanded.has(user.user_id);

                    return (
                      <React.Fragment key={user.user_id}>
                        {/* Main Row */}
                        <tr className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-4 text-sm text-gray-900 font-medium sticky left-0 bg-white z-10">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => toggleExpand(user.user_id)}
                                className="p-1 hover:bg-gray-100 rounded transition-all"
                                title={isExpanded ? 'Collapse' : 'Expand'}
                              >
                                <svg className={`w-4 h-4 text-gray-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                              <span>{user.email}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-xs text-gray-700">
                          <div className="text-gray-500 mb-1">Maint: {user.maintenance_calories} cal</div>
                          <div>{user.target_calories} cal</div>
                          <div>{user.target_protein}g pro</div>
                        </td>
                        <td className="px-4 py-4 text-xs text-gray-700">
                          <div>{user.avg_calories} cal</div>
                          <div>{user.avg_protein}g pro</div>
                        </td>
                        <td className="px-4 py-4 text-xs">
                          <div className={`font-semibold ${deficitDisplay.color}`}>{deficitDisplay.label}</div>
                        </td>
                        <td className="px-4 py-4 text-xs">
                          <div className={`font-semibold ${weeklyDeficitDisplay.color}`}>{Math.abs(user.weekly_deficit)} cal</div>
                          <div className="text-gray-400 text-xs mt-1">({user.days_logged} days)</div>
                        </td>
                        {/* Day 1-7 */}
                        {[
                          [user.d1_calories, user.d1_protein],
                          [user.d2_calories, user.d2_protein],
                          [user.d3_calories, user.d3_protein],
                          [user.d4_calories, user.d4_protein],
                          [user.d5_calories, user.d5_protein],
                          [user.d6_calories, user.d6_protein],
                          [user.d7_calories, user.d7_protein],
                        ].map(([cal, pro], idx) => {
                          const calColor = getCaloriesColor(cal, user.target_calories, user.maintenance_calories);
                          const proColor = getProteinColor(Number(pro), user.target_protein);

                          return (
                            <td key={idx} className="px-2 py-4">
                              {cal === 0 ? (
                                <div className="text-center text-xs text-gray-400">-</div>
                              ) : (
                                <div className="space-y-1">
                                  <div className={`px-2 py-1 rounded text-xs font-bold text-center ${calColor}`}>
                                    {cal}
                                  </div>
                                  <div className={`px-2 py-1 rounded text-xs font-bold text-center ${proColor}`}>
                                    {Number(pro).toFixed(0)}g
                                  </div>
                                </div>
                              )}
                            </td>
                          );
                        })}
                        </tr>

                        {/* Expanded Row */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={13} className="px-4 py-6 bg-white border-t border-gray-100">
                              {isLoading ? (
                                <div className="flex items-center justify-center py-8">
                                  <div className="flex items-center gap-3">
                                    <svg className="animate-spin h-5 w-5 text-gray-900" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    <span className="text-gray-900 font-medium text-sm">Loading...</span>
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  {/* View Toggle */}
                                  <div className="flex justify-end mb-4">
                                    <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
                                      <button
                                        onClick={() => updateViewMode(user.user_id, 'table')}
                                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                          (expandedRowViewMode.get(user.user_id) || 'table') === 'table'
                                            ? 'bg-black text-white'
                                            : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                      >
                                        Table
                                      </button>
                                      <button
                                        onClick={() => updateViewMode(user.user_id, 'log')}
                                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                          (expandedRowViewMode.get(user.user_id) || 'table') === 'log'
                                            ? 'bg-black text-white'
                                            : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                      >
                                        Log
                                      </button>
                                      <button
                                        onClick={() => updateViewMode(user.user_id, 'coaching')}
                                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                          (expandedRowViewMode.get(user.user_id) || 'table') === 'coaching'
                                            ? 'bg-black text-white'
                                            : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                      >
                                        Coaching
                                      </button>
                                    </div>
                                  </div>

                                  {/* Render content based on view mode */}
                                  {(expandedRowViewMode.get(user.user_id) || 'table') === 'coaching' ? (
                                    // Coaching View
                                    loadingCoaching.has(user.user_id) ? (
                                      <div className="flex items-center justify-center py-12">
                                        <div className="flex items-center gap-3">
                                          <svg className="animate-spin h-5 w-5 text-gray-900" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                          </svg>
                                          <span className="text-gray-900 font-medium text-sm">Analyzing meal patterns...</span>
                                        </div>
                                      </div>
                                    ) : coachingAnalysisData.has(user.user_id) ? (
(() => {
                                        const analysis = coachingAnalysisData.get(user.user_id)!;
                                        return (
                                          <div className="space-y-4">
                                            {/* Simple Table */}
                                            <div className="overflow-x-auto">
                                              <table className="w-full border border-gray-200 rounded-lg">
                                                <thead>
                                                  <tr className="bg-gray-50 border-b border-gray-200">
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Meal & Timing</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Examples</th>
                                                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase">Cal</th>
                                                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase">Pro</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Frequency</th>
                                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Recommended Change</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {analysis.mealTable.map((meal, idx) => (
                                                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                                                      <td className="px-4 py-3">
                                                        <div className="text-sm font-semibold text-gray-900">{meal.meal}</div>
                                                        <div className="text-xs text-gray-500 mt-0.5">⏰ {meal.timing}</div>
                                                      </td>
                                                      <td className="px-4 py-3 text-xs text-gray-700">
                                                        {meal.examples.join(', ')}
                                                      </td>
                                                      <td className="px-4 py-3 text-center text-sm font-medium text-gray-900">{meal.avgCal}</td>
                                                      <td className="px-4 py-3 text-center text-sm font-medium text-gray-900">{meal.avgPro}g</td>
                                                      <td className="px-4 py-3 text-xs text-gray-700">{meal.frequency}</td>
                                                      <td className="px-4 py-3">
                                                        {meal.change ? (
                                                          <div className="text-sm text-green-700 font-medium">{meal.change}</div>
                                                        ) : (
                                                          <span className="text-xs text-gray-400">-</span>
                                                        )}
                                                      </td>
                                                    </tr>
                                                  ))}

                                                  {/* Totals Row */}
                                                  <tr className="bg-gray-50 border-t-2 border-gray-300">
                                                    <td className="px-4 py-3 text-sm font-bold text-gray-900">Daily Avg</td>
                                                    <td className="px-4 py-3 text-xs text-gray-400">-</td>
                                                    <td className="px-4 py-3 text-center">
                                                      <div className="text-sm font-bold text-gray-900">{analysis.totals.currentCal} cal</div>
                                                      <div className="text-xs text-gray-500">Target: {analysis.totals.targetCal}</div>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                      <div className="text-sm font-bold text-gray-900">{analysis.totals.currentPro}g</div>
                                                      <div className="text-xs text-gray-500">Target: {analysis.totals.targetPro}g</div>
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-gray-400">-</td>
                                                    <td className="px-4 py-3">
                                                      {(() => {
                                                        const calGap = analysis.totals.targetCal - analysis.totals.currentCal;
                                                        const proGap = analysis.totals.targetPro - analysis.totals.currentPro;
                                                        return (
                                                          <div className="text-xs">
                                                            <div className={calGap > 0 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
                                                              Cal: {calGap > 0 ? '+' : ''}{calGap}
                                                            </div>
                                                            <div className={proGap > 0 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
                                                              Pro: {proGap > 0 ? '+' : ''}{proGap}g
                                                            </div>
                                                          </div>
                                                        );
                                                      })()}
                                                    </td>
                                                  </tr>
                                                </tbody>
                                              </table>
                                            </div>

                                            {/* Refresh Button */}
                                            <button
                                              onClick={async () => {
                                                // Clear cache and reload
                                                setCoachingAnalysisData(prev => {
                                                  const newMap = new Map(prev);
                                                  newMap.delete(user.user_id);
                                                  return newMap;
                                                });
                                                await loadCoachingAnalysis(user.user_id);
                                              }}
                                              className="px-4 py-2 border border-gray-200 bg-white rounded-lg text-sm font-medium text-gray-900 hover:bg-gray-50 transition-all"
                                            >
                                              Refresh Analysis
                                            </button>
                                          </div>
                                        );
                                      })()
                                    ) : null
                                  ) : (
                                    <div className="overflow-x-auto">
                                      <div className="flex gap-6 min-w-max">
                                        {/* Render each day */}
                                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayName, idx) => {
                                          const date = addDays(weekStart, idx);
                                          const dateStr = format(date, 'yyyy-MM-dd');
                                          const entries = expandedRowsData.get(user.user_id)?.[dateStr] || [];
                                          const viewMode = expandedRowViewMode.get(user.user_id) || 'table';

                                          // Calculate totals for this day
                                          const totalCal = entries.reduce((sum, e) => sum + e.calories, 0);
                                          const totalPro = entries.reduce((sum, e) => sum + e.protein, 0);

                                          const calColor = getCaloriesColor(totalCal, user.target_calories, user.maintenance_calories);
                                          const proColor = getProteinColor(totalPro, user.target_protein);

                                          return (
                                            <div key={dateStr} className="flex-shrink-0 w-52">
                                              {/* Day Header with totals */}
                                              <div className="mb-2">
                                                <div className="text-xs font-bold text-gray-900">{dayName} {format(date, 'M/d')}</div>
                                                {totalCal === 0 ? (
                                                  <div className="text-xs text-gray-400 mt-1">-</div>
                                                ) : (
                                                  <div className="flex gap-2 mt-1">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${calColor}`}>
                                                      {totalCal}
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${proColor}`}>
                                                      {totalPro.toFixed(0)}g
                                                    </span>
                                                  </div>
                                                )}
                                              </div>

                                              {/* Food entries */}
                                              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                                {viewMode === 'table' ? (
                                                  // Table view - compact with macros
                                                  entries.map((entry) => (
                                                    <div key={entry.id} className="text-xs">
                                                      <div className="font-medium text-gray-700">{entry.name}</div>
                                                      <div className="text-gray-500">
                                                        {entry.calories}c • {entry.protein.toFixed(0)}p
                                                      </div>
                                                    </div>
                                                  ))
                                                ) : (
                                                  // Log view - shows original user input
                                                  entries.map((entry) => (
                                                    <div key={entry.id} className="text-xs text-gray-700">
                                                      {entry.description || entry.name} <span className="text-gray-500">({entry.calories}c, {entry.protein.toFixed(0)}p)</span>
                                                    </div>
                                                  ))
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
