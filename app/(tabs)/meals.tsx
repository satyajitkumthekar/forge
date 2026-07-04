/**
 * Meals Screen - Saved Meals (reusable food combos)
 * ABSTRACTION: Uses db.meals and db.food APIs, never calls Supabase directly
 */

import React, { useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { db } from '@/lib/database';
import { getCached, setCached, CACHE_KEYS } from '@/lib/enhanced-cache';
import { appToday } from '@/utils/date';
import { toast } from '@/lib/toast';
import MealBuilder from '@/components/meals/MealBuilder';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Skeleton } from '@/components/ui/Skeleton';
import type { FoodEntry, Meal } from '@/types';

type BuilderState = null | { mode: 'new' } | { mode: 'edit'; meal: Meal };

const MealsGlyph = (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

export default function MealsScreen() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [builder, setBuilder] = useState<BuilderState>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [addedMealId, setAddedMealId] = useState<string | null>(null);
  const [addingMealId, setAddingMealId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // Bumped on tab focus so meals saved from Track show up on return
  const [focusVersion, setFocusVersion] = useState(0);

  // Monotonic sequence guard: bumping it invalidates any in-flight background
  // load, so stale revalidations can never overwrite newer data or mutations
  const loadSeqRef = React.useRef(0);

  // Revalidate on tab focus. The first focus fires on mount, which the load
  // effect already covers.
  const isFirstFocusRef = React.useRef(true);
  useFocusEffect(
    React.useCallback(() => {
      if (isFirstFocusRef.current) {
        isFirstFocusRef.current = false;
        return;
      }
      setFocusVersion((prev) => prev + 1);
    }, [])
  );

  // Load meals (Stale-While-Revalidate pattern, mirrors Track's loadData)
  useEffect(() => {
    let isMounted = true;

    const loadMeals = async () => {
      const seq = ++loadSeqRef.current;

      try {
        // PHASE 1: Load from cache - INSTANT
        const cachedMeals = getCached<Meal[]>(CACHE_KEYS.meals);
        if (isMounted) {
          if (cachedMeals !== null) setMeals(cachedMeals);
          setLoading(cachedMeals === null);
        }

        // PHASE 2: Fetch fresh data (revalidate in background)
        const freshMeals = await db.meals.list();

        if (!isMounted) return;
        // Superseded by a mutation or a newer load — discard
        if (seq !== loadSeqRef.current) return;

        setCached(CACHE_KEYS.meals, freshMeals);
        setMeals(freshMeals);
        setLoading(false);
      } catch (err: any) {
        if (err?.message === 'Not authenticated') {
          if (isMounted) setLoading(false);
          return;
        }
        console.error('Error loading meals:', err);
        if (isMounted) setLoading(false);
      }
    };

    loadMeals();

    return () => {
      isMounted = false;
    };
  }, [focusVersion]);

  const toggleExpanded = (mealId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(mealId)) {
        next.delete(mealId);
      } else {
        next.add(mealId);
      }
      return next;
    });
  };

  const handleAdd = async (meal: Meal) => {
    if (addingMealId) return;

    setAddingMealId(meal.id);
    try {
      const date = appToday();
      await db.food.addMany(
        date,
        meal.items.map(({ name, calories, protein, description }) => ({ name, calories, protein, description })),
        meal.id
      );

      // Warm Track's cache so the entries are already there on tab switch
      const fresh = await db.food.getByDate(date);
      setCached<FoodEntry[]>(CACHE_KEYS.entries(date), fresh);

      toast.success(`${meal.name} added to today · ${meal.items.length} items`);
      setAddedMealId(meal.id);
      setTimeout(() => {
        setAddedMealId((prev) => (prev === meal.id ? null : prev));
      }, 2000);
    } catch (err) {
      console.error('Error adding meal:', err);
      toast.error('Could not add meal. Please try again.');
    } finally {
      setAddingMealId(null);
    }
  };

  const handleDelete = async (mealId: string) => {
    // Invalidate any in-flight background load; this mutation owns the final state
    loadSeqRef.current++;

    const originalMeals = meals;
    const optimisticMeals = meals.filter((meal) => meal.id !== mealId);
    setMeals(optimisticMeals);
    setCached(CACHE_KEYS.meals, optimisticMeals);

    try {
      await db.meals.remove(mealId);
    } catch (err) {
      console.error('Error deleting meal:', err);
      setMeals(originalMeals);
      setCached(CACHE_KEYS.meals, originalMeals);
      toast.error('Could not delete meal. Please try again.');
    }
  };

  const handleSaved = (savedMeal: Meal) => {
    // Invalidate any in-flight background load; this mutation owns the final state
    loadSeqRef.current++;

    const isEdit = meals.some((meal) => meal.id === savedMeal.id);
    const nextMeals = isEdit
      ? meals.map((meal) => (meal.id === savedMeal.id ? savedMeal : meal))
      : [savedMeal, ...meals];

    setMeals(nextMeals);
    setCached(CACHE_KEYS.meals, nextMeals);
    setLoading(false);
    setBuilder(null);
  };

  // Full-screen takeover: builder replaces the list (same approach as loading states)
  if (builder) {
    return (
      <MealBuilder
        meal={builder.mode === 'edit' ? builder.meal : undefined}
        onSaved={handleSaved}
        onCancel={() => setBuilder(null)}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-paper p-3 md:p-4">
      <div className="max-w-3xl mx-auto space-y-3 pb-8">
        {loading ? (
          <>
            {[0, 1, 2].map((i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-4 w-40 mb-2.5" />
                <Skeleton className="h-3 w-28" />
              </Card>
            ))}
          </>
        ) : meals.length === 0 ? (
          <Card>
            <EmptyState
              icon={MealsGlyph}
              title="No meals yet"
              subtitle="Save your go-to combos once, log them in one tap."
            />
            <div className="px-8 pb-8 -mt-2 flex justify-center">
              <Button onClick={() => setBuilder({ mode: 'new' })}>New Meal</Button>
            </div>
          </Card>
        ) : (
          <>
            {/* Header row */}
            <div className="flex items-center justify-end">
              <Button onClick={() => setBuilder({ mode: 'new' })}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Meal
              </Button>
            </div>

            {meals.map((meal) => {
              const totalCalories = meal.items.reduce((sum, item) => sum + item.calories, 0);
              const totalProtein = Math.round(meal.items.reduce((sum, item) => sum + item.protein, 0) * 10) / 10;
              const isExpanded = expandedIds.has(meal.id);

              return (
                <Card key={meal.id} className="animate-fade-in overflow-hidden">
                  {/* Summary row (tap to expand) */}
                  <button
                    onClick={() => toggleExpanded(meal.id)}
                    className="w-full min-h-[44px] flex items-center justify-between gap-3 p-4 text-left hover:bg-paper-inset/50 active:bg-paper-inset transition-colors"
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${meal.name}`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold tracking-tight text-ink truncate">{meal.name}</div>
                      <div className="text-xs text-ink-muted tabular-nums mt-0.5">
                        {meal.items.length} items · {totalCalories} cal · {totalProtein}g pro
                      </div>
                    </div>
                    <svg
                      className={`w-4 h-4 text-ink-muted flex-shrink-0 transition-transform duration-150 ease-spring ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Item list */}
                  {isExpanded && (
                    <div className="border-t border-line/60 divide-y divide-line/60 animate-fade-in">
                      {meal.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                          <span className="font-medium text-ink text-sm truncate">{item.name}</span>
                          <span className="text-xs text-ink-muted tabular-nums whitespace-nowrap">
                            {item.calories}c · {item.protein}p
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions row */}
                  <div className="border-t border-line/60 px-3 py-2 flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleAdd(meal)}
                      disabled={addingMealId !== null}
                      className="min-w-[80px]"
                    >
                      {addedMealId === meal.id ? '✓ Added' : addingMealId === meal.id ? 'Adding...' : 'Add'}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setBuilder({ mode: 'edit', meal })}>
                      Edit
                    </Button>
                    <div className="flex-1" />
                    <button
                      onClick={() => setConfirmDeleteId(meal.id)}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center text-ink-muted hover:text-danger hover:bg-paper-inset active:bg-paper-deep rounded-ctrl transition duration-150"
                      title="Delete"
                      aria-label={`Delete ${meal.name}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </Card>
              );
            })}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete this meal?"
        message="Past logs keep their items — only the saved meal is removed."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (confirmDeleteId) handleDelete(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
