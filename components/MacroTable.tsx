/**
 * MacroTable Component - the day's food log
 * One quiet card per meal segment ("Meal 1, 2, 3"), each under a light
 * header with its time and totals. Tapping a meal's header (or its
 * "Add to this meal" pill) pins it as the target for the next log; in
 * selection mode it selects the whole meal. Rows keep duplicate/delete.
 * Optional selection mode lets the user save entries as a reusable meal.
 */

import React, { useState } from 'react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import NameMealDialog from '@/components/meals/NameMealDialog';
import type { FoodItemInput } from '@/lib/database';
import type { FoodEntry } from '@/types';
import { formatMealTime, type MealGroup } from '@/utils/meal-groups';
import { useCountUp } from '@/utils/use-count-up';

interface MacroTableProps {
  entries: FoodEntry[];
  onDeleteEntry: (entryId: string) => void;
  onDuplicateEntry: (entryId: string) => void;
  /** When provided (with ≥2 entries), enables "Select → Save as meal" */
  onSaveAsMeal?: (name: string, items: FoodItemInput[]) => void;
  /** The day's entries split into meal segments (utils/meal-groups.ts) */
  meals: MealGroup[];
  /** Meal the next log joins; null when the next log starts a new meal */
  targetGroupId: string | null;
  /** True when the target was picked by the user (vs the 60-minute rule) */
  pinned: boolean;
  onPickMeal: (groupId: string) => void;
  /** Coach has hidden calorie & protein numbers: drop the Cal/Pro columns */
  hideMacros?: boolean;
}

interface MealHeaderProps {
  meal: MealGroup;
  /** Gets the next item automatically (60-minute rule) */
  isAutoTarget: boolean;
  /** The user picked this meal for the next item */
  isPinned: boolean;
  selecting: boolean;
  onClick: () => void;
  hideMacros: boolean;
}

function MealHeader({ meal, isAutoTarget, isPinned, selecting, onClick, hideMacros }: MealHeaderProps) {
  const shownCalories = useCountUp(meal.calories);
  const shownProtein = useCountUp(meal.protein, { decimals: 1 });
  const time = formatMealTime(meal);

  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      role="button"
      aria-pressed={isPinned}
      aria-label={
        selecting
          ? `Select all of Meal ${meal.number}`
          : isPinned
            ? `Meal ${meal.number}, ${time}. Your next item goes here. Tap to cancel`
            : `Meal ${meal.number}, ${time}. Add to this meal`
      }
      className="flex items-center justify-between gap-3 px-1 pb-2 min-h-[44px] cursor-pointer select-none rounded-ctrl outline-none focus-visible:ring-1 focus-visible:ring-ink-muted"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          {isAutoTarget && !selecting && (
            <span className="w-1.5 h-1.5 rounded-full bg-ink animate-fade-in" aria-hidden="true" />
          )}
          <span className="text-sm font-semibold tracking-tight text-ink">Meal {meal.number}</span>
          <span className="text-xs text-ink-muted tabular-nums truncate">· {time}</span>
        </div>
        {!hideMacros && (
          <div className="mt-0.5 text-xs text-ink-muted tabular-nums whitespace-nowrap">
            {shownCalories} cal
            <span className="text-ink-faint"> · </span>
            {shownProtein}g protein
          </div>
        )}
      </div>

      {/* The whole header is the tap target; the pill names the action.
          Neutral ink on eggshell: green is reserved for on-target status. */}
      {selecting ? (
        <span className="text-xs font-medium text-ink-muted whitespace-nowrap">Select meal</span>
      ) : (
        !isAutoTarget && (
          <span
            key={isPinned ? 'pinned' : 'add'}
            className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full border text-[11px] font-semibold whitespace-nowrap flex-shrink-0 animate-fade-in transition-colors duration-150 ${
              isPinned
                ? 'border-ink text-ink bg-paper-raised'
                : 'border-line-strong text-ink-soft bg-paper-raised/70'
            }`}
          >
            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.75}
                d={isPinned ? 'M5 13l4 4L19 7' : 'M12 5v14m-7-7h14'}
              />
            </svg>
            {isPinned ? 'Adding here' : 'Add to this meal'}
          </span>
        )
      )}
    </div>
  );
}

export default function MacroTable({
  entries,
  onDeleteEntry,
  onDuplicateEntry,
  onSaveAsMeal,
  meals,
  targetGroupId,
  pinned,
  onPickMeal,
  hideMacros = false,
}: MacroTableProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [nameDialogOpen, setNameDialogOpen] = useState(false);

  const handleDuplicate = (entryId: string) => {
    onDuplicateEntry(entryId);
  };

  const canSelect = onSaveAsMeal !== undefined && entries.length >= 2;

  const startSelecting = () => {
    setSelectedIds(new Set());
    setSelecting(true);
  };

  const exitSelecting = () => {
    setSelecting(false);
    setSelectedIds(new Set());
  };

  const toggleSelected = (entryId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  };

  // Selection mode: a meal's header selects all of it, or clears it if
  // every item is already selected
  const toggleMealSelected = (meal: MealGroup) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = meal.entries.every((entry) => next.has(entry.id));
      meal.entries.forEach((entry) => (allSelected ? next.delete(entry.id) : next.add(entry.id)));
      return next;
    });
  };


  const handleNameSave = (name: string) => {
    const items: FoodItemInput[] = entries
      .filter((entry) => selectedIds.has(entry.id))
      .map(({ name: entryName, calories, protein, description }) => ({
        name: entryName,
        calories,
        protein,
        description,
      }));

    setNameDialogOpen(false);
    exitSelecting();
    onSaveAsMeal?.(name, items);
  };

  const renderEntryRow = (entry: FoodEntry) => {
    const isSelected = selectedIds.has(entry.id);
    return (
      <li
        key={entry.id}
        onClick={selecting ? () => toggleSelected(entry.id) : undefined}
        className={`flex items-center gap-3 pl-4 pr-1 min-h-[52px] animate-entry-in transition-colors duration-150 ${
          selecting ? 'cursor-pointer active:bg-paper-inset/60' : ''
        } ${isSelected ? 'bg-paper-inset/60' : ''}`}
      >
        <div className="flex-1 min-w-0 py-3 text-sm text-ink leading-snug break-words">{entry.name}</div>

        {!hideMacros && (
          <div className="flex items-baseline gap-2 shrink-0 tabular-nums">
            <span className="w-10 text-right text-sm font-medium text-ink">{entry.calories}</span>
            <span className="w-10 text-right text-sm text-ink-muted">{entry.protein}g</span>
          </div>
        )}

        {selecting ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleSelected(entry.id);
            }}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-ctrl transition duration-150"
            role="checkbox"
            aria-checked={isSelected}
            aria-label={isSelected ? `Deselect ${entry.name}` : `Select ${entry.name}`}
          >
            <span
              className={`w-5 h-5 rounded-full border flex items-center justify-center transition duration-150 ${
                isSelected ? 'bg-ink border-ink' : 'bg-paper-raised border-line-strong'
              }`}
            >
              {isSelected && (
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </span>
          </button>
        ) : (
          <div className="flex items-center shrink-0">
            <button
              onClick={() => handleDuplicate(entry.id)}
              className="w-10 min-h-[44px] flex items-center justify-center text-ink-faint hover:text-ink active:text-ink active:bg-paper-inset rounded-ctrl transition duration-150"
              title="Duplicate"
              aria-label="Duplicate entry"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              onClick={() => setConfirmDeleteId(entry.id)}
              className="w-10 min-h-[44px] flex items-center justify-center text-ink-faint hover:text-danger active:text-danger active:bg-paper-inset rounded-ctrl transition duration-150"
              title="Delete"
              aria-label="Delete entry"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <div>
      {entries.length === 0 ? (
        <Card translucent>
          <EmptyState
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            }
            title="No entries yet"
            subtitle="Start logging your meals below"
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {/* Selection mode entry point, out of the way at the top right */}
          {canSelect && !selecting && (
            <div className="flex justify-end -mb-3">
              <button
                onClick={startSelecting}
                className="min-h-[36px] px-2 text-xs font-medium text-ink-muted hover:text-ink active:text-ink transition duration-150"
              >
                Select
              </button>
            </div>
          )}

          {meals.map((meal) => {
            const isPinned = !selecting && pinned && meal.id === targetGroupId;
            return (
              <section key={meal.id}>
                <MealHeader
                  meal={meal}
                  isAutoTarget={!pinned && meal.id === targetGroupId}
                  isPinned={isPinned}
                  selecting={selecting}
                  onClick={() => (selecting ? toggleMealSelected(meal) : onPickMeal(meal.id))}
                  hideMacros={hideMacros}
                />
                <Card
                  translucent
                  className={`overflow-hidden transition-shadow duration-200 ${isPinned ? 'ring-1 ring-ink/20' : ''}`}
                >
                  <ul className="divide-y divide-line/60">{meal.entries.map(renderEntryRow)}</ul>
                </Card>
              </section>
            );
          })}

          {/* Selection footer */}
          {selecting && (
            <Card translucent className="p-3 flex items-center gap-2 animate-toast-in">
              <Button size="sm" disabled={selectedIds.size === 0} onClick={() => setNameDialogOpen(true)}>
                Save as meal ({selectedIds.size})
              </Button>
              <Button size="sm" variant="ghost" onClick={exitSelecting}>
                Cancel
              </Button>
            </Card>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete this entry?"
        message="This will remove it from your log."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (confirmDeleteId) onDeleteEntry(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <NameMealDialog
        open={nameDialogOpen}
        onSave={handleNameSave}
        onCancel={() => setNameDialogOpen(false)}
      />
    </div>
  );
}
