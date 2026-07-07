/**
 * Meals Screen - Saved Meals (reusable food combos)
 * ABSTRACTION: Uses db.meals and db.food APIs, never calls Supabase directly
 */

import React, { useEffect, useState } from 'react';
import { Link, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { db } from '@/lib/database';
import { getCached, setCached, CACHE_KEYS } from '@/lib/enhanced-cache';
import { appToday } from '@/utils/date';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/AuthContext';
import MealBuilder from '@/components/meals/MealBuilder';
import CookbookView from '@/components/cookbook/CookbookView';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Skeleton } from '@/components/ui/Skeleton';
import type { FoodEntry, Meal, AnchorCookbook } from '@/types';

type BuilderState = null | { mode: 'new' } | { mode: 'edit'; meal: Meal };

const MealsGlyph = (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

export default function MealsScreen() {
  const { signOut } = useAuth();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [builder, setBuilder] = useState<BuilderState>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [addedMealId, setAddedMealId] = useState<string | null>(null);
  const [addingMealId, setAddingMealId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // Bumped on tab focus so meals saved from Track show up on return
  const [focusVersion, setFocusVersion] = useState(0);
  // Published anchor cookbooks from the coach; opened one takes over the screen
  const [cookbooks, setCookbooks] = useState<AnchorCookbook[]>([]);
  const [openCookbookId, setOpenCookbookId] = useState<string | null>(null);
  // ?cookbook=<id> deep link (from the reveal popup) — consume it once
  const params = useLocalSearchParams<{ cookbook?: string }>();
  const cookbookParamConsumedRef = React.useRef(false);

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
        const cachedCookbooks = getCached<AnchorCookbook[]>(CACHE_KEYS.cookbooks);
        if (isMounted) {
          if (cachedMeals !== null) setMeals(cachedMeals);
          if (cachedCookbooks !== null) setCookbooks(cachedCookbooks);
          setLoading(cachedMeals === null);
        }

        // PHASE 2: Fetch fresh data (revalidate in background)
        const [freshMeals, freshCookbooks] = await Promise.all([
          db.meals.list(),
          db.cookbooks.listMine(),
        ]);

        if (!isMounted) return;
        // Superseded by a mutation or a newer load — discard
        if (seq !== loadSeqRef.current) return;

        setCached(CACHE_KEYS.meals, freshMeals);
        setCached(CACHE_KEYS.cookbooks, freshCookbooks);
        setMeals(freshMeals);
        setCookbooks(freshCookbooks);
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

  // Open a cookbook arriving via the reveal popup's deep link
  useEffect(() => {
    if (cookbookParamConsumedRef.current) return;
    const target = typeof params.cookbook === 'string' ? params.cookbook : undefined;
    if (!target) return;
    if (cookbooks.some((cb) => cb.id === target)) {
      cookbookParamConsumedRef.current = true;
      setOpenCookbookId(target);
    }
  }, [params.cookbook, cookbooks]);

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

  /**
   * One-tap add from inside a cookbook: pure insert of the preset baked at
   * publish time (is_anchor meal matched by cookbook + recipe position).
   * Throws on failure so CookbookView doesn't flip the button to "Added".
   */
  const handleAddFromCookbook = async (cookbook: AnchorCookbook, index: number) => {
    const findPreset = (list: Meal[]) =>
      list.find((m) => m.is_anchor && m.cookbook_id === cookbook.id && m.position === index);

    let anchorMeal = findPreset(meals);
    if (!anchorMeal) {
      // Presets can be newer than the cached meals list (e.g. just republished)
      const freshMeals = await db.meals.list();
      loadSeqRef.current++;
      setMeals(freshMeals);
      setCached(CACHE_KEYS.meals, freshMeals);
      anchorMeal = findPreset(freshMeals);
    }
    if (!anchorMeal) {
      toast.error('Could not add this meal — please try again');
      throw new Error('Anchor meal preset not found');
    }

    try {
      const date = appToday();
      await db.food.addMany(
        date,
        anchorMeal.items.map(({ name, calories, protein, description }) => ({ name, calories, protein, description })),
        anchorMeal.id
      );

      // Warm Track's cache so the entries are already there on tab switch
      const fresh = await db.food.getByDate(date);
      setCached<FoodEntry[]>(CACHE_KEYS.entries(date), fresh);

      toast.success(`${anchorMeal.name} added to today · ${anchorMeal.items.length} items`);
    } catch (err) {
      console.error('Error adding anchor meal:', err);
      toast.error('Could not add meal. Please try again.');
      throw err;
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

  // Full-screen takeover: an opened cookbook is a document, not a list —
  // minimal chrome, the typeset page is the experience
  const openCookbook = cookbooks.find((cb) => cb.id === openCookbookId);
  if (openCookbook) {
    return (
      <div className="h-full flex flex-col bg-paper">
        <div className="bg-paper-raised/80 backdrop-blur-md border-b border-line/70 px-4 md:px-6 lg:px-8 py-3">
          <div className="max-w-2xl mx-auto flex items-center gap-2">
            <button
              onClick={() => setOpenCookbookId(null)}
              className="min-w-[44px] min-h-[44px] -ml-2 flex items-center justify-center text-ink-soft hover:bg-paper-inset active:bg-paper-deep rounded-ctrl transition duration-150"
              aria-label="Back to meals"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-sm font-semibold tracking-tight text-ink truncate">
              {openCookbook.content.shortTitle}
            </h1>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <CookbookView
            cookbook={openCookbook}
            mode="client"
            onAddMeal={(index) => handleAddFromCookbook(openCookbook, index)}
          />
        </div>
      </div>
    );
  }

  // Coach-prescribed presets live inside their cookbook, not the personal list
  const personalMeals = meals.filter((meal) => !meal.is_anchor);

  return (
    <div className="h-full flex flex-col bg-paper">
      {/* Frosted in-page header */}
      <div className="bg-paper-raised/80 backdrop-blur-md border-b border-line/70 px-4 md:px-6 lg:px-8 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-base md:text-lg font-semibold tracking-tight text-ink">Meals</h1>
          <div className="flex items-center gap-1">
            <Button size="sm" onClick={() => setBuilder({ mode: 'new' })}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Meal
            </Button>
            <Link
              href="/settings"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-paper-inset active:bg-paper-deep rounded-ctrl transition duration-150"
              aria-label="Settings"
            >
              <svg className="w-5 h-5 text-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
            <button
              onClick={() => signOut()}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-paper-inset active:bg-paper-deep rounded-ctrl transition duration-150"
              aria-label="Sign out"
            >
              <svg className="w-5 h-5 text-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto p-3 md:p-4">
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
        ) : (
          <>
            {/* Anchor Meals — coach-crafted cookbooks, above personal meals */}
            {cookbooks.length > 0 && (
              <div className="space-y-3">
                <div className="pt-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  From your coach
                </div>
                {cookbooks.map((cb) => (
                  <button
                    key={cb.id}
                    onClick={() => setOpenCookbookId(cb.id)}
                    className="w-full text-left bg-paper-raised rounded-card border border-line shadow-card p-5 hover:bg-paper-inset active:bg-paper-deep transition duration-150 animate-fade-in"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-ink-muted">
                      Superhuman Lab
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-base font-semibold tracking-tight text-ink break-words">
                          {cb.content.shortTitle}
                        </div>
                        <div className="text-xs text-ink-muted mt-0.5">
                          {cb.content.meals.length} meal{cb.content.meals.length === 1 ? '' : 's'} · crafted by your coach
                        </div>
                      </div>
                      <svg className="w-4 h-4 text-ink-faint flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                ))}
                {personalMeals.length > 0 && (
                  <div className="pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                    My Meals
                  </div>
                )}
              </div>
            )}

            {personalMeals.length === 0 && cookbooks.length === 0 ? (
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
            ) : null}

            {personalMeals.map((meal) => {
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
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold tracking-tight text-ink break-words">{meal.name}</div>
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
                        <div key={item.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                          <span className="font-medium text-ink text-sm min-w-0 flex-1 break-words">{item.name}</span>
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
