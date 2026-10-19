/**
 * Meal segments - splits a day's entries into "Meal 1, 2, 3" and decides
 * which meal the next log lands in.
 *
 * The rule: a log within 60 minutes of the previous one joins its meal; a
 * gap of 60+ minutes starts a new one. The result is stamped on the row as
 * meal_group_id at log time (the DB backfill used the same rule), so manual
 * choices from the input bar stick and deletions never reshuffle meals.
 */

import { formatLogTime } from '@/components/admin/helpers';
import type { FoodEntry } from '@/types';

export const MEAL_GAP_MINUTES = 60;
const GAP_MS = MEAL_GAP_MINUTES * 60 * 1000;
// A meal whose items span at least this long shows "1:15 to 1:50 PM"
const SPAN_MIN_MS = 10 * 60 * 1000;

export interface MealGroup {
  id: string;
  /** 1-based position in the day */
  number: number;
  entries: FoodEntry[];
  startedAt: string;
  /** Last item of the sitting itself; a late add pinned from the list
   *  (e.g. chai remembered at lunch) doesn't stretch the meal's time */
  endedAt: string;
  calories: number;
  protein: number;
}

/** Where the next log goes: auto (time rule), a forced new meal, or a pinned meal id */
export type MealPin = null | 'new' | string;

export interface MealTarget {
  groupId: string;
  isNew: boolean;
  /** 1-based number the target meal has (or will have) */
  number: number;
  mode: 'auto' | 'new' | 'pinned';
  /** "Adding to Meal 2 · 1:15 PM" / "Starting Meal 3" */
  label: string;
}

const time = (iso: string) => new Date(iso).getTime();

export const newMealGroupId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : // RFC 4122 v4 fallback for older webviews
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

export function groupIntoMeals(entries: FoodEntry[]): MealGroup[] {
  const sorted = [...entries].sort((a, b) => time(a.created_at) - time(b.created_at));
  const byId = new Map<string, FoodEntry[]>();
  let prev: { at: number; id: string } | null = null;

  for (const entry of sorted) {
    const at = time(entry.created_at);
    // Untagged rows (seeded data, an older client) fall back to the time rule
    const id: string =
      entry.meal_group_id ||
      (prev && at - prev.at < GAP_MS ? prev.id : `untagged_${entry.id}`);
    const list = byId.get(id);
    if (list) list.push(entry);
    else byId.set(id, [entry]);
    prev = { at, id };
  }

  // Map preserves insertion order = earliest first item, so meals are chronological
  return Array.from(byId.entries()).map(([id, list], i) => ({
    id,
    number: i + 1,
    entries: list,
    startedAt: list[0].created_at,
    endedAt: sittingEnd(list),
    calories: list.reduce((sum, e) => sum + (e.calories || 0), 0),
    protein: Math.round(list.reduce((sum, e) => sum + (Number(e.protein) || 0), 0) * 10) / 10,
  }));
}

const sittingEnd = (list: FoodEntry[]): string => {
  let end = list[0];
  for (const entry of list.slice(1)) {
    if (time(entry.created_at) - time(end.created_at) >= GAP_MS) break;
    end = entry;
  }
  return end.created_at;
};

/** "8:10 AM", or "1:15 to 1:50 PM" for a meal eaten over a while. Pass the
 *  client's IANA timezone on staff views to show THEIR clock. */
export function formatMealTime(meal: Pick<MealGroup, 'startedAt' | 'endedAt'>, timeZone?: string | null): string {
  const start = formatLogTime(meal.startedAt, timeZone);
  if (time(meal.endedAt) - time(meal.startedAt) < SPAN_MIN_MS) return start;
  const end = formatLogTime(meal.endedAt, timeZone);
  // Collapse a shared AM/PM: "1:15 to 1:50 PM". Newer ICU puts a narrow
  // no-break space before the period, so split on any whitespace.
  const period = (s: string) => s.match(/\s(AM|PM)$/i)?.[1];
  const startPeriod = period(start);
  return startPeriod && startPeriod === period(end)
    ? `${start.replace(/\s(AM|PM)$/i, '')} to ${end}`
    : `${start} to ${end}`;
}

export function resolveTargetMeal(meals: MealGroup[], pin: MealPin, now: number = Date.now()): MealTarget {
  const startNew = (mode: MealTarget['mode']): MealTarget => ({
    groupId: newMealGroupId(),
    isNew: true,
    number: meals.length + 1,
    mode,
    label: `Starting Meal ${meals.length + 1}`,
  });
  const join = (meal: MealGroup, mode: MealTarget['mode']): MealTarget => ({
    groupId: meal.id,
    isNew: false,
    number: meal.number,
    mode,
    label: `Adding to Meal ${meal.number} · ${formatMealTime(meal)}`,
  });

  if (pin === 'new') return startNew('new');
  if (pin) {
    const pinned = meals.find((m) => m.id === pin);
    if (pinned) return join(pinned, 'pinned');
  }

  // Auto: keep going with the day's latest meal if its last log was under
  // an hour ago. Only the latest meal: an item pinned into an earlier meal
  // must not pull the next normal log back into it.
  const last = meals[meals.length - 1];
  if (last) {
    const lastLog = Math.max(...last.entries.map((entry) => time(entry.created_at)));
    if (now - lastLog < GAP_MS) return join(last, 'auto');
  }
  return startNew('auto');
}
