/**
 * Dashboard Screen - Weekly Statistics
 * ABSTRACTION: Uses db.* API to fetch food data
 */

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/database';
import { getWeeklyStats, getWeekStart, formatWeekRange } from '@/utils/weekly-stats';
import { appToday } from '@/utils/date';
import { toast } from '@/lib/toast';
import { format } from 'date-fns';
import WeeklyChart from '@/components/WeeklyChart';
import { SkeletonStat } from '@/components/ui/Skeleton';
import { useCountUp } from '@/utils/use-count-up';
import type { WeeklyStats, UserSettings } from '@/types';

export default function DashboardScreen() {
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(appToday()));
  const [stats, setStats] = useState<WeeklyStats | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  // Split loading so week navigation stays visible while a week's stats load
  const [statsLoading, setStatsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Display-only animated stat values (hooks must run before early returns)
  const shownAvgCalories = useCountUp(stats?.averages.calories ?? 0);
  const shownAvgProtein = useCountUp(stats?.averages.protein ?? 0);
  const shownDailyValue = useCountUp(stats ? Math.abs(Math.round(stats.deficit.daily)) : 0);
  const shownWeeklyValue = useCountUp(stats ? Math.abs(Math.round(stats.deficit.weekly)) : 0);

  const loadSettings = async () => {
    setLoadError(false);
    try {
      const userSettings = await db.settings.get();
      setSettings(userSettings);
    } catch (err) {
      console.error('[Dashboard] Error loading settings:', err);
      setLoadError(true);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (!settings) return;

    const loadStats = async () => {
      setStatsLoading(true);
      try {
        // Use database abstraction to get range
        const weeklyStats = await getWeeklyStats(
          weekStart,
          settings.target_calories,
          settings.maintenance_calories,
          async (start: string, end: string) => {
            const entries = await db.food.getRange(start, end);
            // Group entries by date
            const grouped: Record<string, typeof entries> = {};
            for (const entry of entries) {
              if (!grouped[entry.entry_date]) {
                grouped[entry.entry_date] = [];
              }
              grouped[entry.entry_date].push(entry);
            }
            return grouped;
          }
        );
        setStats(weeklyStats);
      } catch (err) {
        console.error('[Dashboard] Error loading stats:', err);
        if (stats === null) {
          // First load failed — show the error screen with Retry
          setLoadError(true);
        } else {
          // Week navigation failed — keep the current week's data visible
          toast.error('Could not load that week. Please try again.');
        }
      } finally {
        setStatsLoading(false);
      }
    };

    loadStats();
  }, [weekStart, settings]);

  const navigateWeek = (direction: number) => {
    const newWeekStart = new Date(weekStart);
    newWeekStart.setDate(newWeekStart.getDate() + direction * 7);

    // Don't allow navigating to future weeks
    if (direction > 0) {
      const currentWeekStart = getWeekStart(appToday());
      if (format(newWeekStart, 'yyyy-MM-dd') > format(currentWeekStart, 'yyyy-MM-dd')) {
        return;
      }
    }

    setWeekStart(newWeekStart);
  };

  const goToCurrentWeek = () => {
    setWeekStart(getWeekStart(appToday()));
  };

  const isCurrentWeek = () => {
    const currentWeekStart = getWeekStart(appToday());
    return format(weekStart, 'yyyy-MM-dd') === format(currentWeekStart, 'yyyy-MM-dd');
  };

  if (loadError && (!settings || !stats)) {
    return (
      <div className="flex items-center justify-center h-screen bg-paper p-6">
        <div className="max-w-sm w-full bg-paper-raised rounded-card border border-line p-6 shadow-card text-center">
          <p className="text-sm font-semibold text-ink mb-1">Couldn&apos;t load your dashboard</p>
          <p className="text-xs text-ink-muted mb-4">Check your connection and try again.</p>
          <button
            onClick={loadSettings}
            className="w-full min-h-[44px] bg-ink hover:bg-ink-soft active:bg-ink-soft text-white px-4 rounded-ctrl transition-all font-medium text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Full-screen spinner only on the very first paint
  if (!settings || !stats) {
    return (
      <div className="flex items-center justify-center h-screen bg-paper">
        <div className="flex items-center gap-2 text-ink-faint">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  // Determine goal type
  const isCutting = settings.target_calories < settings.maintenance_calories;
  const isBulking = settings.target_calories > settings.maintenance_calories;
  const isMaintaining = settings.target_calories === settings.maintenance_calories;

  // Deficit is negative, surplus is positive
  const isDeficit = stats.deficit.daily < 0;
  const isSurplus = stats.deficit.daily > 0;

  // Always show positive values
  const dailyValue = Math.abs(Math.round(stats.deficit.daily));
  const weeklyValue = Math.abs(Math.round(stats.deficit.weekly));

  // Labels and colors based on user's logic
  let deficitColor, weeklyDeficitColor, deficitLabel, weeklyDeficitLabel, deficitBgColor, weeklyDeficitBgColor;

  if (isDeficit) {
    // Eating less than maintenance = deficit
    deficitLabel = 'Avg Daily Deficit';
    weeklyDeficitLabel = 'Weekly Deficit';

    // 1) If target < maintenance (cutting), deficit should be GREEN
    // 2) If target > maintenance (bulking), deficit should be RED
    // 3) If target == maintenance, deficit should be GREEN
    if (isCutting || isMaintaining) {
      deficitColor = 'text-accent-700';
      weeklyDeficitColor = 'text-accent-700';
      deficitBgColor = 'bg-accent-50';
      weeklyDeficitBgColor = 'bg-accent-50';
    } else {
      // Bulking but in deficit = RED
      deficitColor = 'text-danger';
      weeklyDeficitColor = 'text-danger';
      deficitBgColor = 'bg-danger-soft';
      weeklyDeficitBgColor = 'bg-danger-soft';
    }
  } else if (isSurplus) {
    // Eating more than maintenance = surplus
    deficitLabel = 'Avg Daily Surplus';
    weeklyDeficitLabel = 'Weekly Surplus';

    // 1) If target < maintenance (cutting), surplus should be RED
    // 2) If target > maintenance (bulking), surplus should be GREEN
    // 3) If target == maintenance, surplus should be RED
    if (isBulking) {
      deficitColor = 'text-accent-700';
      weeklyDeficitColor = 'text-accent-700';
      deficitBgColor = 'bg-accent-50';
      weeklyDeficitBgColor = 'bg-accent-50';
    } else {
      // Cutting or maintaining but in surplus = RED
      deficitColor = 'text-danger';
      weeklyDeficitColor = 'text-danger';
      deficitBgColor = 'bg-danger-soft';
      weeklyDeficitBgColor = 'bg-danger-soft';
    }
  } else {
    // Exactly at maintenance
    deficitColor = 'text-ink-soft';
    weeklyDeficitColor = 'text-ink-soft';
    deficitBgColor = 'bg-paper-inset';
    weeklyDeficitBgColor = 'bg-paper-inset';
    deficitLabel = 'At Maintenance';
    weeklyDeficitLabel = 'At Maintenance';
  }

  return (
    <div className="h-screen overflow-y-auto bg-paper p-3 md:p-4">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Week Navigation */}
        <div className="bg-paper-raised rounded-card border border-line p-4 shadow-card">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigateWeek(-1)}
              className="p-2 hover:bg-paper-inset active:bg-paper-deep rounded-ctrl transition-all"
              title="Previous week"
            >
              <svg className="w-4 h-4 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="text-center">
              <h2 className="text-base font-semibold tracking-tight text-ink">
                {formatWeekRange(weekStart)}
              </h2>
              <div className="mt-1 text-xs text-ink-muted">
                {stats.daysLogged}/7 days logged
              </div>
              <div className="mt-0.5 text-xs text-ink-faint">
                Updates at end of day
              </div>
              {!isCurrentWeek() && (
                <button
                  onClick={goToCurrentWeek}
                  className="mt-1.5 px-3 py-1 bg-ink text-white text-xs font-medium rounded-ctrl hover:bg-ink-soft transition duration-150 ease-out active:scale-[0.98]"
                >
                  Current Week
                </button>
              )}
            </div>

            <button
              onClick={() => navigateWeek(1)}
              disabled={isCurrentWeek()}
              className={`p-2 rounded-ctrl transition-all ${
                isCurrentWeek()
                  ? 'opacity-30 cursor-not-allowed'
                  : 'hover:bg-paper-inset active:bg-paper-deep'
              }`}
              title="Next week"
            >
              <svg className="w-4 h-4 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Metrics area: skeletons during week change, nav above stays visible */}
        {statsLoading ? (
          <div className="grid grid-cols-2 gap-3">
            <SkeletonStat />
            <SkeletonStat />
            <SkeletonStat />
            <SkeletonStat />
          </div>
        ) : stats.daysLogged === 0 ? (
          <div className="bg-paper-raised rounded-card border border-line p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-3 bg-paper-deep rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-ink mb-1">No data for this week</h3>
            <p className="text-xs text-ink-muted">Start logging food to see your weekly stats here</p>
          </div>
        ) : (
          <>
            {/* Key Metrics - Simplified to 4 */}
            <div className="grid grid-cols-2 gap-3 animate-fade-in">
              {/* Average Daily Calories */}
              <div className="bg-paper-raised rounded-card border border-line p-4 shadow-card hover:border-line-strong transition-all">
                <p className="text-xs font-semibold text-ink-muted mb-1">Avg Calories</p>
                <p className="text-[28px] font-bold tracking-tight tabular-nums leading-tight text-ink">{shownAvgCalories}</p>
                <p className="text-xs text-ink-muted mt-0.5">per day</p>
              </div>

              {/* Average Daily Protein */}
              <div className="bg-paper-raised rounded-card border border-line p-4 shadow-card hover:border-line-strong transition-all">
                <p className="text-xs font-semibold text-ink-muted mb-1">Avg Protein</p>
                <p className="text-[28px] font-bold tracking-tight tabular-nums leading-tight text-ink">{shownAvgProtein}g</p>
                <p className="text-xs text-ink-muted mt-0.5">per day</p>
              </div>

              {/* Average Daily Deficit/Surplus */}
              <div className={`${deficitBgColor} rounded-card border border-line p-4 shadow-card hover:border-line-strong transition-all`}>
                <p className="text-xs font-semibold text-ink-muted mb-2">Daily Status</p>
                <p className={`text-sm font-medium ${deficitColor} leading-relaxed`}>
                  You are in an average <span className="font-bold">{isDeficit ? 'deficit' : isSurplus ? 'surplus' : 'maintenance'}</span> of{' '}
                  <span className="font-bold text-base tabular-nums">{shownDailyValue}</span> cal/day
                </p>
              </div>

              {/* Weekly Deficit/Surplus */}
              <div className={`${weeklyDeficitBgColor} rounded-card border border-line p-4 shadow-card hover:border-line-strong transition-all`}>
                <p className="text-xs font-semibold text-ink-muted mb-2">Weekly Status</p>
                <p className={`text-sm font-medium ${weeklyDeficitColor} leading-relaxed`}>
                  You are in a weekly <span className="font-bold">{isDeficit ? 'deficit' : isSurplus ? 'surplus' : 'maintenance'}</span> of{' '}
                  <span className="font-bold text-base tabular-nums">{shownWeeklyValue}</span> cal
                </p>
              </div>
            </div>

            {/* Chart */}
            <WeeklyChart dailyData={stats.dailyData} targetCalories={settings.target_calories} targetProtein={settings.target_protein} maintenanceCalories={settings.maintenance_calories} />
          </>
        )}
      </div>
    </div>
  );
}
