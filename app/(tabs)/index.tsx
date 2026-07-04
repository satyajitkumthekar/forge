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
import Totals from '@/components/Totals';
import FrequentItems from '@/components/FrequentItems';
import { appToday, todayLocal, addDaysYMD, maxNavigableDate, formatDisplayDate, parseYMD } from '@/utils/date';
import { tokens } from '@/lib/design-tokens';
import Card from '@/components/ui/Card';
import { SkeletonRow, SkeletonDonut } from '@/components/ui/Skeleton';
import type { FoodEntry, UserSettings, FrequentItem } from '@/types';

// Note: CACHE_KEYS now imported from enhanced-cache for consistency

export default function TrackScreen() {
  const [currentDate, setCurrentDate] = useState(appToday());
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
  // Coach reminder loaded for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [coachReminder, setCoachReminder] = useState<string | null>(null);

  // Monotonic sequence guard: bumping it invalidates any in-flight background
  // load, so stale revalidations can never overwrite newer data or mutations
  const loadSeqRef = React.useRef(0);

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
        const endDate = todayLocal();
        const startDate = addDaysYMD(endDate, -7);

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
      const seq = ++loadSeqRef.current;

      try {
        setError('');

        // PHASE 1: Load from cache (L1 memory or L2 MMKV) - INSTANT
        const cacheKey = CACHE_KEYS.entries(currentDate);
        const cachedEntries = getCached<FoodEntry[]>(cacheKey);
        const cachedSettings = getCached<UserSettings>(CACHE_KEYS.settings);

        if (isMounted) {
          // Never leave the previous date's entries showing while an uncached
          // date loads — clear so totals/list don't flash stale data
          setEntries(cachedEntries ?? []);
          if (cachedSettings !== null) {
            setSettings(cachedSettings);
          }
          setLoading(cachedEntries === null);
        }

        // PHASE 2: Fetch fresh data from database (revalidate in background)
        const [freshEntries, freshSettings, reminder] = await Promise.all([
          db.food.getByDate(currentDate),
          db.settings.get(),
          db.access.getReminder(),
        ]);

        if (!isMounted) return;

        // Superseded by a mutation or a newer load — discard, the newer
        // operation is responsible for the final state
        if (seq !== loadSeqRef.current) return;

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
    // Invalidate any in-flight background load; this mutation owns the final state
    loadSeqRef.current++;

    // Captured before the optimistic update so a failed add rolls back to
    // exactly what was showing (not a stale closure re-read after awaits)
    const originalEntries = entries;

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
          setEntries(originalEntries);
          setCached(cacheKey, originalEntries);
        }
      }
    } catch (err) {
      // Catch any unexpected errors
      console.error('Unexpected error in handleFoodLogged:', err);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    // Invalidate any in-flight background load; this mutation owns the final state
    loadSeqRef.current++;

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
      }
    } catch (err) {
      // Catch any unexpected errors
      console.error('Unexpected error in handleDeleteEntry:', err);
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
    const newDateStr = addDaysYMD(currentDate, days);

    // Allow dates up to tomorrow
    if (newDateStr <= maxNavigableDate()) {
      setCurrentDate(newDateStr);
    }
  };

  const goToToday = () => {
    setCurrentDate(appToday());
  };

  // Calculate calorie color for gradient
  const getCalorieColor = () => {
    const totals = entries.reduce(
      (acc, entry) => ({ calories: acc.calories + (entry.calories || 0) }),
      { calories: 0 }
    );

    if (totals.calories === 0 || settings.target_calories === 0) return tokens.colors.ink.faint;

    const isDeficit = settings.target_calories < settings.maintenance_calories;
    const isSurplus = settings.target_calories > settings.maintenance_calories;

    const diff = totals.calories - settings.target_calories;
    const percentDiff = (diff / settings.target_calories) * 100;

    const isAligned = (isDeficit && diff < 0) || (isSurplus && diff > 0);

    if (isAligned) {
      const absDiff = Math.abs(percentDiff);
      if (absDiff <= 10) return tokens.colors.accent[500];   // on target
      if (absDiff <= 20) return tokens.colors.warn.DEFAULT;  // 10-20%
      if (absDiff <= 30) return tokens.colors.alert.DEFAULT; // 20-30%
      return tokens.colors.danger.DEFAULT;                   // >30%
    } else {
      const absDiff = Math.abs(percentDiff);
      if (absDiff <= 5) return tokens.colors.accent[500];
      return tokens.colors.danger.DEFAULT;
    }
  };

  const calorieColor = getCalorieColor();

  // Premium gradient: status color at top, softened, fading into eggshell paper
  const getPastelGradient = (color: string) => {
    // On-target green
    if (color === tokens.colors.accent[500]) {
      return 'linear-gradient(to bottom, rgba(16, 163, 127, 0.85) 0%, rgba(110, 231, 183, 0.5) 10%, rgba(209, 250, 229, 0.6) 20%, rgba(236, 253, 245, 0.7) 35%, #FAF9F6 100%)';
    }
    // 10-20% off (amber)
    if (color === tokens.colors.warn.DEFAULT) {
      return 'linear-gradient(to bottom, rgba(217, 119, 6, 0.75) 0%, rgba(252, 211, 77, 0.5) 10%, rgba(254, 243, 199, 0.6) 20%, rgba(254, 249, 195, 0.7) 35%, #FAF9F6 100%)';
    }
    // 20-30% off (orange)
    if (color === tokens.colors.alert.DEFAULT) {
      return 'linear-gradient(to bottom, rgba(234, 88, 12, 0.75) 0%, rgba(253, 186, 116, 0.5) 10%, rgba(255, 237, 213, 0.6) 20%, rgba(255, 247, 237, 0.7) 35%, #FAF9F6 100%)';
    }
    // >30% off (red)
    if (color === tokens.colors.danger.DEFAULT) {
      return 'linear-gradient(to bottom, rgba(220, 38, 38, 0.75) 0%, rgba(248, 113, 113, 0.5) 10%, rgba(254, 202, 202, 0.6) 20%, rgba(254, 226, 226, 0.7) 35%, #FAF9F6 100%)';
    }
    // No entries — warm neutral ramp
    return 'linear-gradient(to bottom, rgba(180, 174, 162, 0.55) 0%, rgba(216, 210, 198, 0.5) 10%, rgba(237, 233, 224, 0.7) 20%, rgba(244, 241, 234, 0.85) 35%, #FAF9F6 100%)';
  };

  const backgroundGradient = getPastelGradient(calorieColor);

  // Computed once per render so the label, Today pill, and nav guard always agree
  const isAtMaxDate = currentDate >= maxNavigableDate();
  const isOnToday = currentDate === appToday();

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
          <div className="bg-paper-raised border border-danger/25 rounded-ctrl p-3 shadow-overlay flex items-center gap-2 animate-toast-in">
            <svg className="w-4 h-4 text-danger flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-ink text-sm flex-1">{error}</span>
            <button onClick={() => setError('')} className="p-1 text-ink-faint hover:text-ink-muted active:text-ink-soft">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Header with Settings */}
      <div className="bg-paper-raised/70 backdrop-blur-sm border-b border-line px-4 md:px-6 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-base md:text-lg font-semibold tracking-tight text-ink">Food Tracker</h1>
            <Link href="/settings" className="p-2.5 hover:bg-paper-inset active:bg-paper-deep rounded-ctrl transition duration-150">
              <svg className="w-5 h-5 text-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
          </div>

          {/* Date Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigateDate(-1)}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-paper-inset active:bg-paper-deep rounded-ctrl transition duration-150"
              aria-label="Previous day"
            >
              <svg className="w-4 h-4 text-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="flex items-center gap-2">
              <div className="text-center">
                <div className="text-sm md:text-base font-semibold tracking-tight text-ink">
                  {formatDisplayDate(currentDate)}
                </div>
                <div className="text-xs text-ink-muted mt-0.5">
                  {parseYMD(currentDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </div>
              </div>
              {!isOnToday && (
                <button
                  onClick={goToToday}
                  className="px-3 py-1.5 bg-ink text-white text-xs font-medium rounded-ctrl hover:bg-ink-soft transition duration-150 ease-out active:scale-[0.98]"
                >
                  Today
                </button>
              )}
            </div>

            <button
              onClick={() => navigateDate(1)}
              disabled={isAtMaxDate}
              className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-ctrl transition duration-150 ${
                isAtMaxDate
                  ? 'opacity-30 cursor-not-allowed'
                  : 'hover:bg-paper-inset active:bg-paper-deep'
              }`}
              aria-label="Next day"
            >
              <svg className="w-4 h-4 text-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Totals Section */}
      <div className="bg-paper-raised/70 backdrop-blur-sm border-b border-line px-4 md:px-6 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-6">
              <SkeletonDonut size={60} />
              <SkeletonDonut size={60} />
            </div>
          ) : (
            <Totals
              entries={entries}
              targetCalories={settings.target_calories}
              targetProtein={settings.target_protein}
              maintenanceCalories={settings.maintenance_calories}
            />
          )}
        </div>
      </div>

      {/* Scrollable Content */}
      <div
        className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 pt-3 bg-transparent"
        style={{
          paddingBottom: 'calc(200px + env(safe-area-inset-bottom, 0px))',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Entries */}
          {loading ? (
            <Card translucent className="divide-y divide-line/60">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </Card>
          ) : (
            <MacroTable
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
