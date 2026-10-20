/**
 * MacroTable Component - the day's food log
 * One quiet card per meal segment ("Meal 1, 2, 3"), each under a light
 * header with its time and totals. Tapping a meal's header (or its
 * "Add to this meal" pill) pins it as the target for the next log; in
 * selection mode it selects the whole meal. Rows keep duplicate/delete.
 * Optional selection mode lets the user save entries as a reusable meal.
 */

import React, { useRef, useState } from 'react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import NameMealDialog from '@/components/meals/NameMealDialog';
import MealPhotoViewer from '@/components/MealPhotoViewer';
import type { FoodItemInput } from '@/lib/database';
import type { FoodEntry, MealPhoto } from '@/types';
import { formatMealTime, type MealGroup } from '@/utils/meal-groups';
import { useCountUp } from '@/utils/use-count-up';

interface MacroTableProps {
  entries: FoodEntry[];
  /** Rows in `meals` the AI is still analyzing: shown loading, not selectable */
  pendingIds?: Set<string>;
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
  /** One photo per meal, keyed by meal id. Omit onAddPhoto to hide photos. */
  photos?: Record<string, MealPhoto>;
  /** Meals whose photo is uploading right now */
  uploadingPhotoIds?: Set<string>;
  onAddPhoto?: (mealGroupId: string, file: File) => void;
  onRemovePhoto?: (mealGroupId: string) => void;
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

const NO_PENDING = new Set<string>();
const NO_PHOTOS: Record<string, MealPhoto> = {};

export default function MacroTable({
  entries,
  pendingIds = NO_PENDING,
  onDeleteEntry,
  onDuplicateEntry,
  onSaveAsMeal,
  meals,
  targetGroupId,
  pinned,
  onPickMeal,
  hideMacros = false,
  photos = NO_PHOTOS,
  uploadingPhotoIds = NO_PENDING,
  onAddPhoto,
  onRemovePhoto,
}: MacroTableProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  // Meal photos: one hidden picker shared by every meal, and the open viewer
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoTargetRef = useRef<string | null>(null);
  const [viewerMeal, setViewerMeal] = useState<MealGroup | null>(null);

  const pickPhoto = (mealGroupId: string) => {
    photoTargetRef.current = mealGroupId;
    photoInputRef.current?.click();
  };

  // Display only, for the coach: a labelled row at the foot of each meal,
  // which becomes the thumbnail once a photo is added
  const renderPhotoRow = (meal: MealGroup) => {
    // Older untagged history has no stable meal id; a meal of only loading
    // rows isn't saved yet
    if (!onAddPhoto || selecting || meal.id.startsWith('untagged_')) return null;
    if (!meal.entries.some((entry) => !pendingIds.has(entry.id))) return null;

    const photo = photos[meal.id];
    const rowClass =
      'w-full flex items-center gap-3 px-4 min-h-[52px] border-t border-line/60 text-left transition-colors duration-150';

    if (uploadingPhotoIds.has(meal.id)) {
      return (
        <div className={rowClass} aria-busy="true">
          <Skeleton className="w-10 h-10 rounded-ctrl flex-shrink-0" />
          <span className="text-xs font-medium text-ink-muted">Adding photo…</span>
        </div>
      );
    }

    if (photo) {
      return (
        <button
          onClick={() => setViewerMeal(meal)}
          className={`${rowClass} py-2 hover:bg-paper-inset/60 active:bg-paper-inset animate-fade-in`}
          aria-label={`View photo of Meal ${meal.number}`}
        >
          <img src={photo.url} alt="" className="w-10 h-10 rounded-ctrl object-cover flex-shrink-0 border border-line" />
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-semibold text-ink">Meal photo</span>
            <span className="block text-xs text-ink-muted">Your coach can see this</span>
          </span>
          <svg className="w-4 h-4 text-ink-faint flex-shrink-0 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      );
    }

    return (
      <button
        onClick={() => pickPhoto(meal.id)}
        className={`${rowClass} text-ink-soft hover:text-ink hover:bg-paper-inset/60 active:bg-paper-inset`}
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span className="text-xs font-semibold">Add a photo of this meal</span>
      </button>
    );
  };

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
      const saved = meal.entries.filter((entry) => !pendingIds.has(entry.id));
      const allSelected = saved.every((entry) => next.has(entry.id));
      saved.forEach((entry) => (allSelected ? next.delete(entry.id) : next.add(entry.id)));
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

  // Sent from the chat box, numbers still on the way: the typed text with a
  // spinner, and shimmer where calories and protein will land
  const renderPendingRow = (entry: FoodEntry) => (
    <li
      key={entry.id}
      aria-busy="true"
      className="flex items-center gap-3 pl-4 pr-1 min-h-[52px] animate-entry-in"
    >
      <div className="flex-1 min-w-0 py-3 flex items-center gap-2">
        <svg className="animate-spin h-3.5 w-3.5 flex-shrink-0 text-ink-faint" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="text-sm text-ink-muted leading-snug break-words min-w-0">{entry.name}</span>
      </div>

      {!hideMacros && (
        <div className="flex items-center gap-2 shrink-0" aria-hidden="true">
          <Skeleton className="h-3.5 w-8 ml-2" />
          <Skeleton className="h-3.5 w-8 ml-2" />
        </div>
      )}

      {/* Same width as the duplicate/delete pair so columns stay aligned */}
      <div className="w-20 shrink-0" aria-hidden="true" />
    </li>
  );

  const renderEntryRow = (entry: FoodEntry) => {
    if (pendingIds.has(entry.id)) return renderPendingRow(entry);
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
      {meals.length === 0 ? (
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
                  {renderPhotoRow(meal)}
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

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const mealGroupId = photoTargetRef.current;
          e.target.value = '';
          if (file && mealGroupId) onAddPhoto?.(mealGroupId, file);
        }}
      />

      <MealPhotoViewer
        photo={viewerMeal ? photos[viewerMeal.id] ?? null : null}
        title={viewerMeal ? `Meal ${viewerMeal.number}` : ''}
        onClose={() => setViewerMeal(null)}
        onReplace={(file) => {
          if (viewerMeal) onAddPhoto?.(viewerMeal.id, file);
          setViewerMeal(null);
        }}
        onRemove={() => {
          if (viewerMeal) onRemovePhoto?.(viewerMeal.id);
          setViewerMeal(null);
        }}
      />

      <NameMealDialog
        open={nameDialogOpen}
        onSave={handleNameSave}
        onCancel={() => setNameDialogOpen(false)}
      />
    </div>
  );
}
