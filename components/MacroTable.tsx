/**
 * MacroTable Component - the day's food log
 * One quiet card per meal segment ("Meal 1, 2, 3"), each under a light
 * header with its time and totals. Tapping a meal's header (or its
 * "Add to this meal" pill) pins it as the target for the next log; in
 * selection mode it selects the whole meal. Rows keep duplicate/delete.
 * Optional selection mode lets the user save entries as a reusable meal.
 * While the AI works on a log, its place in the list shows the working
 * (WorkingBlock). Once saved, a food the AI analysed opens a short note of
 * how it was worked out when its name is tapped.
 */

import React, { useRef, useState } from 'react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import NameMealDialog from '@/components/meals/NameMealDialog';
import MealPhotoViewer from '@/components/MealPhotoViewer';
import WorkingBlock, { type WorkingState } from '@/components/WorkingBlock';
import type { FoodItemInput } from '@/lib/database';
import type { FoodEntry, MacroVisibility, MealPhoto } from '@/types';
import { formatMealTime, type MealGroup } from '@/utils/meal-groups';
import { useCountUp } from '@/utils/use-count-up';
import { carbsFatLine, groupCarbsFatLine, showsCarbsOrFat, DEFAULT_MACRO_VISIBILITY } from '@/utils/macros';
import { workedOutLine } from '@/utils/plate';

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
  /** Which numbers this person sees. Calories and protein are the two
   *  columns; carbs and fat are one small line under each food and meal. */
  visibility?: MacroVisibility;
  /** One photo per meal, keyed by meal id. Omit onAddPhoto to hide photos. */
  photos?: Record<string, MealPhoto>;
  /** Meals whose photo is uploading right now */
  uploadingPhotoIds?: Set<string>;
  onAddPhoto?: (mealGroupId: string, file: File) => void;
  onRemovePhoto?: (mealGroupId: string) => void;
  /** The analyser's live working, by loading-row id. A loading row with an
   *  entry here shows it in place of the plain loading row. */
  working?: Record<string, WorkingState>;
  /** Ids of the rows that just landed together, in order: they come in one
   *  after another */
  landed?: string[];
}

interface MealHeaderProps {
  meal: MealGroup;
  /** Gets the next item automatically (60-minute rule) */
  isAutoTarget: boolean;
  /** The user picked this meal for the next item */
  isPinned: boolean;
  selecting: boolean;
  onClick: () => void;
  visibility: MacroVisibility;
}

function MealHeader({ meal, isAutoTarget, isPinned, selecting, onClick, visibility }: MealHeaderProps) {
  const shownCalories = useCountUp(meal.calories);
  const shownProtein = useCountUp(meal.protein, { decimals: 1 });
  const time = formatMealTime(meal);
  // Only once every food in the meal has the numbers (a row still loading,
  // or an older food without them, would make this a partial total)
  const carbsFat = groupCarbsFatLine(meal.entries, visibility);

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
        {(visibility.calories || visibility.protein) && (
          <div className="mt-0.5 text-xs text-ink-muted tabular-nums whitespace-nowrap">
            {visibility.calories && <>{shownCalories} cal</>}
            {visibility.calories && visibility.protein && <span className="text-ink-faint"> · </span>}
            {visibility.protein && <>{shownProtein}g protein</>}
          </div>
        )}
        {carbsFat && (
          <div className="mt-0.5 text-xs text-ink-muted tabular-nums whitespace-nowrap animate-fade-in">
            {carbsFat}
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
const NO_WORKING: Record<string, WorkingState> = {};
const NO_LANDED: string[] = [];
/** Gap between rows that land together */
const LANDING_STEP_MS = 70;
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
  visibility = DEFAULT_MACRO_VISIBILITY,
  photos = NO_PHOTOS,
  uploadingPhotoIds = NO_PENDING,
  onAddPhoto,
  onRemovePhoto,
  working: liveWorking = NO_WORKING,
  landed = NO_LANDED,
}: MacroTableProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  // Foods whose note of how they were worked out is open
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  const toggleNote = (entryId: string) =>
    setOpenNotes((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });

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
      .map(({ name: entryName, calories, protein, carbs, fat, description }) => ({
        name: entryName,
        calories,
        protein,
        carbs,
        fat,
        description,
      }));

    setNameDialogOpen(false);
    exitSelecting();
    onSaveAsMeal?.(name, items);
  };

  // Numbers still on the way. A food sent from the chat box shows the
  // analyser's working. A shortcut waiting on its carbs and fat shows the
  // text with a spinner, and shimmer wherever this person's numbers will land.
  const renderPendingRow = (entry: FoodEntry) => {
    const live = liveWorking[entry.id];
    if (live) {
      return (
        <li key={entry.id} className="animate-entry-in">
          <WorkingBlock state={live} />
        </li>
      );
    }

    return (
      <li
        key={entry.id}
        aria-busy="true"
        className="flex items-center gap-3 pl-4 pr-1 min-h-[52px] animate-entry-in"
      >
        <div className="flex-1 min-w-0 py-3">
          <div className="flex items-center gap-2">
            <svg className="animate-spin h-3.5 w-3.5 flex-shrink-0 text-ink-faint" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-sm text-ink-muted leading-snug break-words min-w-0">{entry.name}</span>
          </div>
          {/* Indented past the spinner so it sits where the line will */}
          {showsCarbsOrFat(visibility) && <Skeleton className="mt-1.5 ml-[22px] h-3 w-28" />}
        </div>

        {(visibility.calories || visibility.protein) && (
          <div className="flex items-center gap-2 shrink-0" aria-hidden="true">
            {visibility.calories && <Skeleton className="h-3.5 w-8 ml-2" />}
            {visibility.protein && <Skeleton className="h-3.5 w-8 ml-2" />}
          </div>
        )}

        {/* Same width as the duplicate/delete pair so columns stay aligned */}
        <div className="w-20 shrink-0" aria-hidden="true" />
      </li>
    );
  };

  const renderEntryRow = (entry: FoodEntry) => {
    if (pendingIds.has(entry.id)) return renderPendingRow(entry);
    const isSelected = selectedIds.has(entry.id);
    const carbsFat = carbsFatLine(entry, visibility);
    // How the AI worked this food out (the portion, and anything else it
    // assumed). Opened by tapping the food's name; shortcuts and older rows
    // have none, so their name stays plain text.
    const note = selecting ? null : workedOutLine(entry.analysis);
    const noteOpen = note !== null && openNotes.has(entry.id);
    const landedAt = landed.indexOf(entry.id);
    // The name split before its last word, which the arrow is kept beside.
    // A very long last word is left free to wrap rather than overflow.
    const lastSpace = entry.name.lastIndexOf(' ');
    const nameHead = lastSpace >= 0 ? entry.name.slice(0, lastSpace + 1) : '';
    const nameTail = lastSpace >= 0 ? entry.name.slice(lastSpace + 1) : entry.name;
    const nameGlued = nameTail.length <= 24;
    return (
      <li
        key={entry.id}
        onClick={selecting ? () => toggleSelected(entry.id) : undefined}
        style={landedAt > 0 ? { animationDelay: `${landedAt * LANDING_STEP_MS}ms` } : undefined}
        className={`animate-entry-in transition-colors duration-150 ${
          selecting ? 'cursor-pointer active:bg-paper-inset/60' : ''
        } ${isSelected ? 'bg-paper-inset/60' : ''}`}
      >
        <div className="flex items-center gap-3 pl-4 pr-1 min-h-[52px]">
          {note !== null ? (
            <button
              type="button"
              onClick={() => toggleNote(entry.id)}
              aria-expanded={noteOpen}
              aria-label={`${entry.name}. ${noteOpen ? 'Hide' : 'Show'} how this was worked out`}
              className="flex-1 min-w-0 py-3 text-left rounded-ctrl outline-none focus-visible:ring-1 focus-visible:ring-ink-muted"
            >
              {/* The arrow stays with the last word, so a long name never
                  leaves it on a line of its own */}
              <span className="text-sm text-ink leading-snug break-words">
                {nameHead}
                <span className={nameGlued ? 'whitespace-nowrap' : undefined}>
                  {nameTail}
                  <svg
                    className={`inline-block align-[-2px] ml-1 w-3.5 h-3.5 text-ink-faint transition-transform duration-150 ${
                      noteOpen ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </span>
              {carbsFat && <span className="block mt-0.5 text-xs text-ink-muted tabular-nums">{carbsFat}</span>}
            </button>
          ) : (
            <div className="flex-1 min-w-0 py-3">
              <div className="text-sm text-ink leading-snug break-words">{entry.name}</div>
              {carbsFat && <div className="mt-0.5 text-xs text-ink-muted tabular-nums">{carbsFat}</div>}
            </div>
          )}

          {(visibility.calories || visibility.protein) && (
            <div className="flex items-baseline gap-2 shrink-0 tabular-nums">
              {visibility.calories && (
                <span className="w-10 text-right text-sm font-medium text-ink">{entry.calories}</span>
              )}
              {visibility.protein && (
                <span className="w-10 text-right text-sm text-ink-muted">{entry.protein}g</span>
              )}
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
        </div>

        {/* The note runs the full width of the row, under the food it is about */}
        {noteOpen && (
          <div className="px-4 pb-3 -mt-1 text-xs text-ink-muted leading-snug break-words animate-fade-in">{note}</div>
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
                  visibility={visibility}
                />
                <Card
                  translucent
                  className={`overflow-hidden transition-shadow duration-200 ${isPinned ? 'ring-1 ring-ink/20' : ''}`}
                >
                  <ul className="divide-y divide-line/60">{meal.entries.map((entry) => renderEntryRow(entry))}</ul>
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
