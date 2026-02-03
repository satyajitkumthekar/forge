/**
 * Dashboard Screen - Weekly Statistics
 * ABSTRACTION: Uses db.* API to fetch food data
 */

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/database';
import { getWeeklyStats, getWeekStart, formatWeekRange } from '@/utils/weekly-stats';
import { format } from 'date-fns';
import WeeklyChart from '@/components/WeeklyChart';
import type { WeeklyStats, UserSettings } from '@/types';

const getTodayDate = (): string => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};

export default function DashboardScreen() {
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date(getTodayDate())));
  const [stats, setStats] = useState<WeeklyStats | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        console.log('📊 [Dashboard] Loading settings...');
        const userSettings = await db.settings.get();
        console.log('📊 [Dashboard] Settings loaded:', userSettings);
        setSettings(userSettings);
      } catch (err) {
        console.error('❌ [Dashboard] Error loading settings:', err);
      }
    };

    loadSettings();
  }, []);

  useEffect(() => {
    if (!settings) {
      console.log('📊 [Dashboard] Waiting for settings...');
      return;
    }

    const loadStats = async () => {
      setLoading(true);
      try {
        console.log('📊 [Dashboard] Loading stats for week:', weekStart);
        // Use database abstraction to get range
        const weeklyStats = await getWeeklyStats(
          weekStart,
          settings.target_calories,
          settings.maintenance_calories,
          async (start: string, end: string) => {
            console.log('📊 [Dashboard] Fetching food entries from', start, 'to', end);
            const entries = await db.food.getRange(start, end);
            console.log('📊 [Dashboard] Got', entries.length, 'food entries');
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
        console.log('📊 [Dashboard] Weekly stats calculated:', weeklyStats);
        setStats(weeklyStats);
      } catch (err) {
        console.error('❌ [Dashboard] Error loading stats:', err);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [weekStart, settings]);

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

    setWeekStart(newWeekStart);
  };

  const goToCurrentWeek = () => {
    setWeekStart(getWeekStart(new Date(getTodayDate())));
  };

  const isCurrentWeek = () => {
    const currentWeekStart = getWeekStart(new Date(getTodayDate()));
    return format(weekStart, 'yyyy-MM-dd') === format(currentWeekStart, 'yyyy-MM-dd');
  };

  if (loading || !stats || !settings) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="flex items-center gap-2 text-gray-400">
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
      deficitColor = 'text-green-700';
      weeklyDeficitColor = 'text-green-700';
      deficitBgColor = 'bg-green-50';
      weeklyDeficitBgColor = 'bg-green-50';
    } else {
      // Bulking but in deficit = RED
      deficitColor = 'text-red-700';
      weeklyDeficitColor = 'text-red-700';
      deficitBgColor = 'bg-red-50';
      weeklyDeficitBgColor = 'bg-red-50';
    }
  } else if (isSurplus) {
    // Eating more than maintenance = surplus
    deficitLabel = 'Avg Daily Surplus';
    weeklyDeficitLabel = 'Weekly Surplus';

    // 1) If target < maintenance (cutting), surplus should be RED
    // 2) If target > maintenance (bulking), surplus should be GREEN
    // 3) If target == maintenance, surplus should be RED
    if (isBulking) {
      deficitColor = 'text-green-700';
      weeklyDeficitColor = 'text-green-700';
      deficitBgColor = 'bg-green-50';
      weeklyDeficitBgColor = 'bg-green-50';
    } else {
      // Cutting or maintaining but in surplus = RED
      deficitColor = 'text-red-700';
      weeklyDeficitColor = 'text-red-700';
      deficitBgColor = 'bg-red-50';
      weeklyDeficitBgColor = 'bg-red-50';
    }
  } else {
    // Exactly at maintenance
    deficitColor = 'text-gray-700';
    weeklyDeficitColor = 'text-gray-700';
    deficitBgColor = 'bg-gray-50';
    weeklyDeficitBgColor = 'bg-gray-50';
    deficitLabel = 'At Maintenance';
    weeklyDeficitLabel = 'At Maintenance';
  }

  return (
    <div className="h-screen overflow-y-auto bg-gray-50 p-3 md:p-4">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Week Navigation */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
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
              <h2 className="text-base font-bold text-gray-900">
                {formatWeekRange(weekStart)}
              </h2>
              <div className="mt-1 text-xs text-gray-500">
                {stats.daysLogged}/7 days logged
              </div>
              <div className="mt-0.5 text-xs text-gray-400">
                Updates at end of day
              </div>
              {!isCurrentWeek() && (
                <button
                  onClick={goToCurrentWeek}
                  className="mt-1.5 px-3 py-1 bg-black text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-all"
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

        {/* Empty Week Message */}
        {stats.daysLogged === 0 ? (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-3 bg-gray-200 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">No data for this week</h3>
            <p className="text-xs text-gray-500">Start logging food to see your weekly stats here</p>
          </div>
        ) : (
          <>
            {/* Key Metrics - Simplified to 4 */}
            <div className="grid grid-cols-2 gap-3">
              {/* Average Daily Calories */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:border-gray-300 transition-all">
                <p className="text-xs font-semibold text-gray-600 mb-1">Avg Calories</p>
                <p className="text-2xl font-bold text-gray-900">{stats.averages.calories}</p>
                <p className="text-xs text-gray-500 mt-0.5">per day</p>
              </div>

              {/* Average Daily Protein */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:border-gray-300 transition-all">
                <p className="text-xs font-semibold text-gray-600 mb-1">Avg Protein</p>
                <p className="text-2xl font-bold text-gray-900">{stats.averages.protein}g</p>
                <p className="text-xs text-gray-500 mt-0.5">per day</p>
              </div>

              {/* Average Daily Deficit/Surplus */}
              <div className={`${deficitBgColor} rounded-xl border border-gray-200 p-4 shadow-sm hover:border-gray-300 transition-all`}>
                <p className="text-xs font-semibold text-gray-600 mb-2">Daily Status</p>
                <p className={`text-sm font-medium ${deficitColor} leading-relaxed`}>
                  You are in an average <span className="font-bold">{isDeficit ? 'deficit' : isSurplus ? 'surplus' : 'maintenance'}</span> of{' '}
                  <span className="font-bold text-base">{dailyValue}</span> cal/day
                </p>
              </div>

              {/* Weekly Deficit/Surplus */}
              <div className={`${weeklyDeficitBgColor} rounded-xl border border-gray-200 p-4 shadow-sm hover:border-gray-300 transition-all`}>
                <p className="text-xs font-semibold text-gray-600 mb-2">Weekly Status</p>
                <p className={`text-sm font-medium ${weeklyDeficitColor} leading-relaxed`}>
                  You are in a weekly <span className="font-bold">{isDeficit ? 'deficit' : isSurplus ? 'surplus' : 'maintenance'}</span> of{' '}
                  <span className="font-bold text-base">{weeklyValue}</span> cal
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
