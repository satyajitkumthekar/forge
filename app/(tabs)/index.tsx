/**
 * Track Screen - Main Food Logging Interface
 * ABSTRACTION: Uses db.* and cache.* APIs, never calls Supabase directly
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'expo-router';
import { db } from '@/lib/database';
import { getCached, setCached, invalidate, CACHE_KEYS } from '@/lib/enhanced-cache';
import { queueOperation, processQueue, checkOnlineStatus } from '@/utils/offline-queue';
import { getFrequentItems } from '@/utils/frequent-items';
import ChatInput from '@/components/ChatInput';
import MacroTable from '@/components/MacroTable';
import FoodLogView from '@/components/FoodLogView';
import Totals from '@/components/Totals';
import FrequentItems from '@/components/FrequentItems';
import type { FoodEntry, UserSettings, FrequentItem } from '@/types';

// Date utility functions
const getTodayDate = (): string => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};

const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

const formatDisplayDate = (dateStr: string): string => {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date(getTodayDate() + 'T00:00:00');
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (dateStr === getTodayDate()) {
    return 'Today';
  } else if (dateStr === formatDate(yesterday)) {
    return 'Yesterday';
  } else if (dateStr === formatDate(tomorrow)) {
    return 'Tomorrow';
  } else {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }
};

// Note: CACHE_KEYS now imported from enhanced-cache for consistency

export default function TrackScreen() {
  const [currentDate, setCurrentDate] = useState(getTodayDate());
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [settings, setSettings] = useState<UserSettings>({
    id: '',
    user_id: '',
    target_calories: 2000,
    maintenance_calories: 2000,
    target_protein: 150,
    created_at: '',
    updated_at: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [frequentItems, setFrequentItems] = useState<FrequentItem[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [viewMode, setViewMode] = useState<'table' | 'log'>('table');
  // Coach reminder loaded for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [coachReminder, setCoachReminder] = useState<string | null>(null);

  // Track if we're currently mutating to prevent race conditions
  const isMutatingRef = React.useRef(false);

  // Process offline queue on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      processQueue();
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  // Load frequent items when data changes
  useEffect(() => {
    const loadFrequentItems = async () => {
      try {
        const today = new Date();
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 7);

        const startDate = formatDate(sevenDaysAgo);
        const endDate = formatDate(today);

        // Use database abstraction
        const allData = await db.food.getRange(startDate, endDate);

        // Group entries by date for frequent items algorithm
        const groupedData: Record<string, FoodEntry[]> = {};
        for (const entry of allData) {
          if (!groupedData[entry.entry_date]) {
            groupedData[entry.entry_date] = [];
          }
          groupedData[entry.entry_date].push(entry);
        }

        const frequent = getFrequentItems(groupedData);
        setFrequentItems(frequent);
      } catch (err) {
        console.error('Error loading frequent items:', err);
      }
    };

    loadFrequentItems();
  }, [dataVersion]);

  // Load entries and settings (Stale-While-Revalidate pattern with L1/L2 cache)
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        setError('');

        // PHASE 1: Load from cache (L1 memory or L2 MMKV) - INSTANT
        const cacheKey = CACHE_KEYS.entries(currentDate);
        const cachedEntries = getCached<FoodEntry[]>(cacheKey);
        const cachedSettings = getCached<UserSettings>(CACHE_KEYS.settings);

        if (cachedEntries !== null && cachedSettings !== null) {
          // Show cached data immediately (no loading spinner!)
          if (isMounted) {
            setEntries(cachedEntries);
            setSettings(cachedSettings);
            setLoading(false);
          }
        } else {
          // No cache - show loading spinner
          setLoading(true);
        }

        // PHASE 2: Fetch fresh data from database (revalidate in background)
        const [freshEntries, freshSettings, reminder] = await Promise.all([
          db.food.getByDate(currentDate),
          db.settings.get(),
          db.access.getReminder(),
        ]);

        if (!isMounted) return;

        // Skip update if we're currently mutating (prevents race condition)
        if (isMutatingRef.current) {
          console.log('Skipping background update during mutation');
          return;
        }

        // Update cache (writes to both L1 and L2)
        setCached(cacheKey, freshEntries);
        setCached(CACHE_KEYS.settings, freshSettings);

        // Update UI silently (data already showing if cached)
        setEntries(freshEntries);
        setSettings(freshSettings);
        setCoachReminder(reminder);
        setLoading(false);

      } catch (err: any) {
        // Handle authentication errors silently (user will be redirected)
        if (err?.message === 'Not authenticated') {
          console.log('User not authenticated, will redirect...');
          if (isMounted) {
            setLoading(false);
          }
          return;
        }

        console.error('Error loading data:', err);
        if (isMounted) {
          setError('Failed to load data. Showing cached data.');
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [currentDate]);

  const handleFoodLogged = async (foodData: Omit<FoodEntry, 'id' | 'entry_date' | 'created_at' | 'user_id'>) => {
    // Start mutation - prevent background updates
    isMutatingRef.current = true;

    try {
      // Optimistic update with temp ID
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      const newEntry: FoodEntry = {
        ...foodData,
        id: tempId,
        entry_date: currentDate,
        created_at: new Date().toISOString(),
        user_id: settings.user_id,
      };

      // Update UI immediately
      const optimisticEntries = [...entries, newEntry];
      setEntries(optimisticEntries);

      const cacheKey = CACHE_KEYS.entries(currentDate);
      setCached(cacheKey, optimisticEntries);

      // Check if online
      const isOnline = checkOnlineStatus();

      if (!isOnline) {
        await queueOperation({
          type: 'add_entry',
          date: currentDate,
          data: foodData,
        });
        setError('Offline: Entry saved and will sync when online.');
        setTimeout(() => setError(''), 3000);
        // End mutation here for offline case
        isMutatingRef.current = false;
        return;
      }

      try {
        // Make API call using abstraction
        await db.food.add(currentDate, foodData);

        // Reload fresh data and update cache
        const updatedEntries = await db.food.getByDate(currentDate);
        setEntries(updatedEntries);
        setCached(cacheKey, updatedEntries);
        setDataVersion((prev) => prev + 1);

        // End mutation AFTER reload completes successfully
        isMutatingRef.current = false;

      } catch (err) {
        console.error('Error adding entry:', err);

        if (!checkOnlineStatus()) {
          await queueOperation({
            type: 'add_entry',
            date: currentDate,
            data: foodData,
          });
          setError('Connection lost: Entry saved and will sync when online.');
        } else {
          setError('Failed to add entry. Please try again.');
          setEntries(entries);
          setCached(cacheKey, entries);
        }
        // End mutation after error handling
        isMutatingRef.current = false;
      }
    } catch (err) {
      // Catch any unexpected errors
      console.error('Unexpected error in handleFoodLogged:', err);
      isMutatingRef.current = false;
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    // Start mutation - prevent background updates
    isMutatingRef.current = true;

    try {
      const originalEntries = entries;

      // Optimistic update
      const optimisticEntries = entries.filter((entry) => entry.id !== entryId);
      setEntries(optimisticEntries);

      const cacheKey = CACHE_KEYS.entries(currentDate);
      setCached(cacheKey, optimisticEntries);

      const isOnline = checkOnlineStatus();

      if (!isOnline) {
        await queueOperation({
          type: 'delete_entry',
          date: currentDate,
          entryId,
        });
        setError('Offline: Entry deleted and will sync when online.');
        setTimeout(() => setError(''), 3000);
        // End mutation here for offline case
        isMutatingRef.current = false;
        return;
      }

      try {
        // Use database abstraction
        await db.food.delete(entryId);

        // Reload fresh data and update cache
        const updatedEntries = await db.food.getByDate(currentDate);
        setEntries(updatedEntries);
        setCached(cacheKey, updatedEntries);
        setDataVersion((prev) => prev + 1);

        // End mutation AFTER reload completes successfully
        isMutatingRef.current = false;

      } catch (err) {
        console.error('Error deleting entry:', err);

        if (!checkOnlineStatus()) {
          await queueOperation({
            type: 'delete_entry',
            date: currentDate,
            entryId,
          });
          setError('Connection lost: Entry deleted and will sync when online.');
        } else {
          setError('Failed to delete entry. Please try again.');
          setEntries(originalEntries);
          setCached(cacheKey, originalEntries);
        }
        // End mutation after error handling
        isMutatingRef.current = false;
      }
    } catch (err) {
      // Catch any unexpected errors
      console.error('Unexpected error in handleDeleteEntry:', err);
      isMutatingRef.current = false;
    }
  };

  const handleDuplicateEntry = async (entryId: string) => {
    const entryToDuplicate = entries.find((entry) => entry.id === entryId);
    if (!entryToDuplicate) return;

    const { id, entry_date, created_at, user_id, ...foodData } = entryToDuplicate;
    await handleFoodLogged(foodData);
  };

  const handleFrequentItemClick = async (item: FrequentItem) => {
    const { count, ...foodData } = item;
    await handleFoodLogged(foodData);
  };

  const navigateDate = (days: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + days);
    const newDateStr = formatDate(newDate);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatDate(tomorrow);

    // Allow dates up to tomorrow
    if (newDateStr <= tomorrowStr) {
      setCurrentDate(newDateStr);
    }
  };

  const goToToday = () => {
    setCurrentDate(getTodayDate());
  };

  // Calculate calorie color for gradient
  const getCalorieColor = () => {
    const totals = entries.reduce(
      (acc, entry) => ({ calories: acc.calories + (entry.calories || 0) }),
      { calories: 0 }
    );

    if (totals.calories === 0 || settings.target_calories === 0) return '#9CA3AF'; // gray-400

    const isDeficit = settings.target_calories < settings.maintenance_calories;
    const isSurplus = settings.target_calories > settings.maintenance_calories;

    const diff = totals.calories - settings.target_calories;
    const percentDiff = (diff / settings.target_calories) * 100;

    const isAligned = (isDeficit && diff < 0) || (isSurplus && diff > 0);

    if (isAligned) {
      const absDiff = Math.abs(percentDiff);
      if (absDiff <= 10) return '#10A37F';  // green
      if (absDiff <= 20) return '#F59E0B';  // yellow
      if (absDiff <= 30) return '#F97316';  // orange
      return '#EF4444';                     // red
    } else {
      const absDiff = Math.abs(percentDiff);
      if (absDiff <= 5) return '#10A37F';
      return '#EF4444';
    }
  };

  const calorieColor = getCalorieColor();

  // Premium gradient: Rich color at top that quickly fades to white
  const getPastelGradient = (color: string) => {
    // Green progress - Rich emerald at top, quick fade to white
    if (color === '#10A37F') {
      return 'linear-gradient(to bottom, #10A37F 0%, #6ee7b7 10%, #d1fae5 20%, #ecfdf5 35%, #ffffff 100%)';
    }
    // Yellow progress - Rich amber at top, quick fade to white
    if (color === '#F59E0B') {
      return 'linear-gradient(to bottom, #F59E0B 0%, #fcd34d 10%, #fef3c7 20%, #fef9c3 35%, #ffffff 100%)';
    }
    // Orange progress - Rich orange at top, quick fade to white
    if (color === '#F97316') {
      return 'linear-gradient(to bottom, #F97316 0%, #fdba74 10%, #ffedd5 20%, #fff7ed 35%, #ffffff 100%)';
    }
    // Red progress - Rich red at top, quick fade to white
    if (color === '#EF4444') {
      return 'linear-gradient(to bottom, #EF4444 0%, #f87171 10%, #fecaca 20%, #fee2e2 35%, #ffffff 100%)';
    }
    // Gray (no entries) - Gray at top, quick fade to white
    return 'linear-gradient(to bottom, #9CA3AF 0%, #d1d5db 10%, #f3f4f6 20%, #f9fafb 35%, #ffffff 100%)';
  };

  const backgroundGradient = getPastelGradient(calorieColor);

  return (
    <div
      className="flex flex-col relative"
      style={{
        minHeight: '100dvh',
        WebkitOverflowScrolling: 'touch',
        background: backgroundGradient
      }}
    >
      {/* Error Message */}
      {error && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-lg w-11/12">
          <div className="bg-white border border-red-200 rounded-lg p-3 shadow-md flex items-center gap-2">
            <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-red-800 text-sm flex-1">{error}</span>
            <button onClick={() => setError('')} className="text-gray-400 hover:text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Header with Settings */}
      <div className="bg-white/70 backdrop-blur-sm border-b border-gray-200 px-4 md:px-6 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-base md:text-lg font-bold text-gray-900">Food Tracker</h1>
            <Link href="/settings" className="p-2 hover:bg-gray-100 rounded-lg transition-all">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
          </div>

          {/* Date Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigateDate(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-all"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="flex items-center gap-2">
              <div className="text-center">
                <div className="text-sm md:text-base font-bold text-gray-900">
                  {formatDisplayDate(currentDate)}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {new Date(currentDate + 'T00:00:00').toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </div>
              </div>
              {currentDate !== getTodayDate() && (
                <button
                  onClick={goToToday}
                  className="px-3 py-1 bg-black text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-all"
                >
                  Today
                </button>
              )}
            </div>

            <button
              onClick={() => navigateDate(1)}
              disabled={(() => {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                return currentDate === formatDate(tomorrow);
              })()}
              className={`p-2 rounded-lg transition-all ${
                (() => {
                  const tomorrow = new Date();
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  return currentDate === formatDate(tomorrow);
                })()
                  ? 'opacity-30 cursor-not-allowed'
                  : 'hover:bg-gray-100'
              }`}
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Totals Section */}
      <div className="bg-white/70 backdrop-blur-sm border-b border-gray-200 px-4 md:px-6 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto">
          <Totals
            entries={entries}
            targetCalories={settings.target_calories}
            targetProtein={settings.target_protein}
            maintenanceCalories={settings.maintenance_calories}
          />
        </div>
      </div>

      {/* Loading Spinner */}
      {loading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-white bg-opacity-80">
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-md flex items-center gap-3">
            <svg className="animate-spin h-5 w-5 text-gray-900" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-gray-900 font-medium">Loading...</span>
          </div>
        </div>
      )}

      {/* Scrollable Content */}
      <div
        className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 pt-3 bg-transparent"
        style={{
          paddingBottom: 'calc(200px + env(safe-area-inset-bottom, 0px))',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <div className="max-w-7xl mx-auto space-y-6">
          {/* View Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('table')}
              className={`flex-1 py-3 rounded-lg border font-medium text-sm transition-all ${
                viewMode === 'table'
                  ? 'bg-black text-white border-black'
                  : 'bg-white/70 backdrop-blur-sm text-gray-600 border-gray-200 hover:bg-gray-50/70'
              }`}
            >
              Table
            </button>
            <button
              onClick={() => setViewMode('log')}
              className={`flex-1 py-3 rounded-lg border font-medium text-sm transition-all ${
                viewMode === 'log'
                  ? 'bg-black text-white border-black'
                  : 'bg-white/70 backdrop-blur-sm text-gray-600 border-gray-200 hover:bg-gray-50/70'
              }`}
            >
              Log
            </button>
          </div>

          {/* Conditional View Rendering */}
          {viewMode === 'table' ? (
            <MacroTable
              entries={entries}
              onDeleteEntry={handleDeleteEntry}
              onDuplicateEntry={handleDuplicateEntry}
            />
          ) : (
            <FoodLogView
              entries={entries}
              onDeleteEntry={handleDeleteEntry}
              onDuplicateEntry={handleDuplicateEntry}
            />
          )}

          {/* Frequent Items */}
          <FrequentItems items={frequentItems} onItemClick={handleFrequentItemClick} />
        </div>
      </div>

      {/* Chat Input (Fixed Bottom) */}
      <ChatInput onFoodLogged={handleFoodLogged} />
    </div>
  );
}
