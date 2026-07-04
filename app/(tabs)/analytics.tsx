/**
 * Analytics Screen - Admin Dashboard
 * Shows system-wide metrics and user management
 * ABSTRACTION: Uses db.analytics APIs, never calls Supabase directly
 */

import React, { useState, useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import { db } from '@/lib/database';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { getCached, setCached, CACHE_KEYS } from '@/lib/enhanced-cache';
import { getWeekStart, formatWeekRange, getWeeklyStats } from '@/utils/weekly-stats';
import { appToday } from '@/utils/date';
import { format, addDays } from 'date-fns';
import { formatDate, getTierColor } from '@/components/admin/helpers';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Skeleton, SkeletonRow, SkeletonStat } from '@/components/ui/Skeleton';
import StatTile from '@/components/admin/StatTile';
import SectionDisclosure from '@/components/admin/SectionDisclosure';
import MetricLineChart from '@/components/admin/MetricLineChart';
import WeekSelector from '@/components/admin/WeekSelector';
import UserActivityTable from '@/components/admin/UserActivityTable';
import UserChips from '@/components/admin/UserChips';
import CoachTable from '@/components/admin/CoachTable';
import type { AnalyticsSummary, DailyMetrics, UserMetric, CoachAnalyticsRow, FoodEntry, MealCoachingAnalysis } from '@/types';

// Cache TTL: 5 minutes (analytics don't need to be real-time)
const ANALYTICS_CACHE_TTL = 5 * 60 * 1000;

const getTodayDate = (): string => appToday();

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
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(getTodayDate()));

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

      const summaryData = await db.analytics.getSummary();

      const metricsData = await db.analytics.getDailyMetrics(30);

      const usersData = await db.analytics.getUserMetrics();

      const weekStartStr = format(weekStart, 'yyyy-MM-dd');
      const rawCoachData = await db.analytics.getCoachAnalytics(weekStartStr);

      const [maxUsers, totalUsers] = await Promise.all([
        db.admin.getMaxAllowedUsers(),
        db.admin.getTotalActiveUsers(),
      ]);
      setMaxAllowedUsers(maxUsers);
      setTotalActiveUsers(totalUsers);

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
      toast.error('Failed to update macros');
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
      toast.error('Failed to update reminder');
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
      const currentWeekStart = getWeekStart(getTodayDate());
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
    setWeekStart(getWeekStart(getTodayDate()));
  };

  const isCurrentWeek = () => {
    const currentWeekStart = getWeekStart(getTodayDate());
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


      // Use admin function to fetch entries for any user
      const userEntries = await db.analytics.getUserFoodEntries(userId, startDate, endDate);
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

      // Sort each day's entries chronologically so timestamps and meal gaps read in order
      Object.values(groupedByDate).forEach(dayEntries => {
        dayEntries.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      });


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
      toast.error('Failed to load coaching analysis');
    } finally {
      setLoadingCoaching(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    }
  };

  const handleRefreshCoaching = async (userId: string) => {
    // Clear cache and reload
    setCoachingAnalysisData(prev => {
      const newMap = new Map(prev);
      newMap.delete(userId);
      return newMap;
    });
    await loadCoachingAnalysis(userId);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-[calc(100dvh-var(--safe-top))] bg-paper p-12">
        <div className="max-w-md bg-paper-raised rounded-card border border-danger-soft p-6 shadow-card">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-danger flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-semibold tracking-tight text-ink mb-1">Error Loading Analytics</h3>
              <p className="text-sm text-ink-soft mb-4">{error}</p>
              <Button variant="primary" onClick={() => loadAnalytics(true)}>
                Retry
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !summary || !dailyMetrics) {
    return (
      <div className="h-[calc(100dvh-var(--safe-top))] overflow-y-auto bg-paper p-3 md:p-4">
        <div className="max-w-7xl mx-auto">
          {/* Stat tiles skeleton */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            <SkeletonStat />
            <SkeletonStat />
            <SkeletonStat />
          </div>

          {/* Disclosure bars skeleton */}
          <div className="mt-4 bg-paper-raised rounded-card border border-line p-4 shadow-card">
            <Skeleton className="h-4 w-44" />
          </div>
          <div className="mt-4 bg-paper-raised rounded-card border border-line p-4 shadow-card">
            <Skeleton className="h-4 w-44" />
          </div>

          {/* Table skeleton */}
          <div className="mt-4 bg-paper-raised rounded-card border border-line shadow-card p-4">
            <Skeleton className="h-4 w-40 mb-4" />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
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
    <div className="h-[calc(100dvh-var(--safe-top))] overflow-y-auto bg-paper p-3 md:p-4">
      <div className="max-w-7xl mx-auto animate-fade-in">
        {/* Sticky frosted header */}
        <div className="sticky top-0 z-30 -mx-3 md:-mx-4 px-4 md:px-6 py-3 bg-paper/85 backdrop-blur-md border-b border-line/70 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-ink">Admin</h1>
            <p className="text-[11px] text-ink-muted">System-wide metrics and user management</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => loadAnalytics(true)}>
            Refresh
          </Button>
        </div>

        {/* Stat row */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <StatTile label="Users" value={summary.totalUsers} />
          <StatTile label="Food Logs" value={summary.totalFoodLogs} />
          <StatTile label="Coach Calls" value={summary.totalCoachCalls} />
        </div>

        {/* SECTION 0: Admin Controls (Collapsible) */}
        <div className="mt-4">
          <SectionDisclosure
            title="Admin Controls"
            subtitle="User access management"
            open={adminControlsOpen}
            onToggle={() => setAdminControlsOpen(!adminControlsOpen)}
            accentDot
          >
            <div className="bg-paper-raised rounded-card border border-line p-6 shadow-card">
              <div className="space-y-6">
                {/* User Access Limit */}
                <div>
                  <Input
                    label="User Access Limit"
                    unit="users"
                    type="number"
                    value={maxAllowedUsers}
                    onChange={(e) => setMaxAllowedUsers(parseInt(e.target.value) || 0)}
                  />
                  <p className="mt-1 text-xs text-ink-muted">
                    <span className="font-semibold">{totalActiveUsers}</span> of{' '}
                    <span className="font-semibold">{maxAllowedUsers}</span> users have access
                  </p>
                </div>

                {/* Tier API Limits */}
                <div className="pt-4 border-t border-line">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-3">
                    Tier API Call Limits (Daily)
                  </h3>
                  <div className="space-y-3">
                    {/* Basic Tier */}
                    <div className="flex items-center justify-between p-3 bg-paper-inset border border-line rounded-ctrl">
                      <span className={`px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide rounded-full border ${getTierColor('basic')}`}>
                        Basic
                      </span>
                      <div className="flex gap-4 text-xs">
                        <span className="text-ink-muted">
                          Food: <span className="font-semibold text-ink">50</span>
                        </span>
                        <span className="text-ink-muted">
                          Coach: <span className="font-semibold text-ink">10</span>
                        </span>
                      </div>
                    </div>

                    {/* Pro Tier */}
                    <div className="flex items-center justify-between p-3 bg-paper-inset border border-line rounded-ctrl">
                      <span className={`px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide rounded-full border ${getTierColor('pro')}`}>
                        Pro
                      </span>
                      <div className="flex gap-4 text-xs">
                        <span className="text-ink-muted">
                          Food: <span className="font-semibold text-ink">100</span>
                        </span>
                        <span className="text-ink-muted">
                          Coach: <span className="font-semibold text-ink">50</span>
                        </span>
                      </div>
                    </div>

                    {/* Admin Tier */}
                    <div className="flex items-center justify-between p-3 bg-paper-inset border border-line rounded-ctrl">
                      <span className={`px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide rounded-full border ${getTierColor('admin')}`}>
                        Admin
                      </span>
                      <div className="flex gap-4 text-xs">
                        <span className="text-ink-muted">
                          Food: <span className="font-semibold text-ink">Unlimited</span>
                        </span>
                        <span className="text-ink-muted">
                          Coach: <span className="font-semibold text-ink">Unlimited</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <Button variant="primary" fullWidth onClick={handleSaveAdminControls}>
                  {savedAdminControls ? '✓ Saved!' : 'Save'}
                </Button>
              </div>
            </div>
          </SectionDisclosure>
        </div>

        {/* SECTION 1: App Analytics (Collapsible) */}
        <div className="mt-4">
          <SectionDisclosure
            title="App Analytics"
            subtitle="System metrics and user management"
            open={appAnalyticsOpen}
            onToggle={() => setAppAnalyticsOpen(!appAnalyticsOpen)}
          >
            <div className="space-y-4">
              {/* Analytics Charts */}
              <MetricLineChart
                title="Daily Active Users (Last 30 Days)"
                data={dailyMetrics.dailyActiveUsers.map(item => ({
                  value: item.user_count,
                  label: formatDate(item.date)
                }))}
                width={chartWidth}
              />

              <MetricLineChart
                title="Daily Food Logs (Last 30 Days)"
                data={dailyMetrics.dailyFoodLogs.map(item => ({
                  value: item.log_count,
                  label: formatDate(item.date)
                }))}
                width={chartWidth}
              />

              <MetricLineChart
                title="Daily Coach Calls (Last 30 Days)"
                data={dailyMetrics.dailyCoachCalls.map(item => ({
                  value: item.call_count,
                  label: formatDate(item.date)
                }))}
                width={chartWidth}
              />

              {/* User Metrics Table */}
              <UserActivityTable
                users={paginatedUserMetrics}
                filteredCount={filteredAndSortedUserMetrics.length}
                totalCount={userMetrics.length}
                usersPerPage={USERS_PER_PAGE}
                searchQuery={searchQuery}
                onSearchChange={(value) => {
                  setSearchQuery(value);
                  setCurrentPage(1); // Reset to first page on search
                }}
                currentPage={currentPage}
                totalPages={totalPages}
                onPrevPage={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                onNextPage={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                updatingTier={updatingTier}
                updatingClient={updatingClient}
                updatingMacros={updatingMacros}
                onTierChange={handleTierChange}
                onClientToggle={handleClientToggle}
                onMacroUpdate={handleMacroUpdate}
              />
            </div>
          </SectionDisclosure>
        </div>

        {/* SECTION 2: Coach Analytics (Main Section) */}
        <div className="mt-4 bg-paper-raised rounded-card border border-line shadow-card overflow-hidden">
          <div className="p-6 border-b border-line">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-ink">Coach Analytics</h2>
                <p className="text-xs text-ink-muted mt-0.5">Detailed nutrition tracking by week</p>
              </div>
            </div>

            {/* Week Selector */}
            <div className="mb-4">
              <WeekSelector
                label={formatWeekRange(weekStart)}
                isCurrentWeek={isCurrentWeek()}
                onPrev={() => navigateWeek(-1)}
                onNext={() => navigateWeek(1)}
                onGoToCurrent={goToCurrentWeek}
              />
            </div>

            {/* User Selector (Collapsible) */}
            <div className="mb-4">
              <UserChips
                users={coachAnalytics}
                selectedUsers={selectedUsers}
                open={userSelectorOpen}
                onToggleOpen={() => setUserSelectorOpen(!userSelectorOpen)}
                onToggleUser={toggleUserSelection}
                onSelectAll={selectAllUsers}
                onClear={deselectAllUsers}
              />
            </div>
          </div>

          {/* Coach Analytics Table */}
          {filteredCoachAnalytics.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm text-ink-muted">No users selected</p>
            </div>
          ) : (
            <CoachTable
              users={filteredCoachAnalytics}
              weekStart={weekStart}
              expandedRows={expandedRows}
              loadingExpanded={loadingExpanded}
              expandedRowsData={expandedRowsData}
              expandedRowViewMode={expandedRowViewMode}
              coachingAnalysisData={coachingAnalysisData}
              loadingCoaching={loadingCoaching}
              onToggleExpand={toggleExpand}
              onUpdateViewMode={updateViewMode}
              onRefreshCoaching={handleRefreshCoaching}
            />
          )}
        </div>
      </div>
    </div>
  );
}
