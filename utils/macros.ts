/**
 * Macros - the one place that knows the four numbers the app tracks about a
 * food (calories, protein, carbs, fat), which of them a person may see, and
 * how the optional two are worded.
 *
 * Calories and protein keep their own places on every screen. Carbs and fat
 * always render as one quiet line of text built here, so every screen words
 * and rounds them the same way.
 *
 * Carbs and fat can be unknown (null): food logged before the app tracked
 * them, or an estimate that failed. Unknown is never treated as zero, and a
 * total that only covers some of the foods says so.
 */

import { api } from '@/lib/api';
import type { MacroKey, MacroVisibility } from '@/types';

export const MACRO_KEYS: MacroKey[] = ['calories', 'protein', 'carbs', 'fat'];

/** `short` labels the staff switches; `name` + `plural` build a sentence */
export const MACRO_LABELS: Record<MacroKey, { short: string; name: string; plural: boolean }> = {
  calories: { short: 'Cal', name: 'Calories', plural: true },
  protein: { short: 'Pro', name: 'Protein', plural: false },
  carbs: { short: 'Carbs', name: 'Carbs', plural: true },
  fat: { short: 'Fat', name: 'Fat', plural: false },
};

/** What everyone gets until staff flip a switch */
export const DEFAULT_MACRO_VISIBILITY: MacroVisibility = {
  calories: true,
  protein: true,
  carbs: false,
  fat: false,
};

/** The older single "hide numbers" flag, read as four switches */
export const visibilityFromLegacyHidden = (hidden: boolean): MacroVisibility => ({
  calories: !hidden,
  protein: !hidden,
  carbs: false,
  fat: false,
});

/**
 * The four profile flags as a visibility. A row from before the switches
 * existed carries none of them, so it falls back to the single flag.
 */
export function visibilityFromFlags(row: {
  show_calories?: boolean | null;
  show_protein?: boolean | null;
  show_carbs?: boolean | null;
  show_fat?: boolean | null;
  macros_hidden?: boolean | null;
}): MacroVisibility {
  const legacy = visibilityFromLegacyHidden(row.macros_hidden === true);
  return {
    calories: row.show_calories ?? legacy.calories,
    protein: row.show_protein ?? legacy.protein,
    carbs: row.show_carbs === true,
    fat: row.show_fat === true,
  };
}

export const sameVisibility = (a: MacroVisibility, b: MacroVisibility): boolean =>
  MACRO_KEYS.every((key) => a[key] === b[key]);

export const showsCarbsOrFat = (visibility: MacroVisibility): boolean =>
  visibility.carbs || visibility.fat;

// ============================================
// CARBS AND FAT: KNOWN, TOTALLED, WORDED
// ============================================

interface CarbsFat {
  carbs?: number | null;
  fat?: number | null;
}

const SEPARATOR = ' · ';

const isKnown = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Both numbers known: what a shortcut needs before it can skip the AI */
export const hasCarbsFat = (food: CarbsFat): boolean => isKnown(food.carbs) && isKnown(food.fat);

/** The food has every carbs and fat number this viewer is shown */
const hasShownCarbsFat = (food: CarbsFat, visibility: MacroVisibility): boolean =>
  (!visibility.carbs || isKnown(food.carbs)) && (!visibility.fat || isKnown(food.fat));

/**
 * A value from the AI as the database stores it: grams to one decimal, or
 * null when it is missing or nonsense. Never a made-up zero.
 */
export function cleanGrams(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0 || value > 9999) return null;
  return Math.round(value * 10) / 10;
}

const grams = (value: number): string => `${Math.round(value)}g`;

/** Under one food: "30g carbs · 12g fat". Null when there is nothing to show. */
export function carbsFatLine(food: CarbsFat, visibility: MacroVisibility): string | null {
  const parts: string[] = [];
  if (visibility.carbs && isKnown(food.carbs)) parts.push(`${grams(food.carbs)} carbs`);
  if (visibility.fat && isKnown(food.fat)) parts.push(`${grams(food.fat)} fat`);
  return parts.length > 0 ? parts.join(SEPARATOR) : null;
}

/** Under a day's totals: "Carbs 182g · Fat 61g" */
export function carbsFatTotalLine(totals: { carbs: number; fat: number }, visibility: MacroVisibility): string {
  const parts: string[] = [];
  if (visibility.carbs) parts.push(`Carbs ${grams(totals.carbs)}`);
  if (visibility.fat) parts.push(`Fat ${grams(totals.fat)}`);
  return parts.join(SEPARATOR);
}

export interface CarbsFatSummary {
  carbs: number;
  fat: number;
  /** Foods that had the numbers, so went into the totals */
  counted: number;
  /** Every food looked at */
  total: number;
  /** "counting 3 of 5 foods" when the totals only cover some; else null */
  note: string | null;
}

/**
 * Carbs and fat across a list of foods, for a line under their totals.
 * Null means show no line at all: the viewer's switches are off, or there
 * are foods but none of them has the numbers. An empty list sums to zero.
 */
export function summarizeCarbsFat(foods: CarbsFat[], visibility: MacroVisibility): CarbsFatSummary | null {
  if (!showsCarbsOrFat(visibility)) return null;

  let carbs = 0;
  let fat = 0;
  let counted = 0;
  for (const food of foods) {
    if (!hasShownCarbsFat(food, visibility)) continue;
    counted++;
    carbs += isKnown(food.carbs) ? food.carbs : 0;
    fat += isKnown(food.fat) ? food.fat : 0;
  }

  const total = foods.length;
  if (total > 0 && counted === 0) return null;

  return {
    carbs,
    fat,
    counted,
    total,
    note: counted < total ? `counting ${counted} of ${total} foods` : null,
  };
}

/**
 * Under a meal's heading or a saved meal's totals: "48g carbs · 18g fat",
 * only when every food in it has the numbers. A partial meal total would
 * read as the whole meal, so it shows nothing instead.
 */
export function groupCarbsFatLine(foods: CarbsFat[], visibility: MacroVisibility): string | null {
  const summary = summarizeCarbsFat(foods, visibility);
  if (!summary || summary.total === 0 || summary.counted < summary.total) return null;
  return carbsFatLine(summary, visibility);
}

// ============================================
// SHORTCUTS: FILL IN WHAT A COPIED FOOD LACKS
// ============================================

/** Shown when a shortcut's food was logged without its carbs and fat */
export const CARBS_FAT_MISSED_MESSAGE = 'Logged. Carbs and fat could not be worked out for this one.';

interface EstimableFood extends CarbsFat {
  name: string;
  description?: string | null;
  calories: number;
  protein: number;
}

/**
 * Shortcuts (Quick Add, Duplicate, saved meals, cookbook meals) copy a
 * food's numbers instead of asking the AI. A food first logged before the
 * app tracked carbs and fat would then never get them. This asks the AI for
 * just those two, for whichever foods in the list lack them; calories and
 * protein are left exactly as they are. Foods that already have both cost
 * nothing: no request is made.
 *
 * One request, no retry. If it fails, the foods come back unchanged with
 * complete = false, so the caller logs them anyway and says so.
 */
export async function ensureCarbsFat<T extends EstimableFood>(
  foods: T[]
): Promise<{ foods: T[]; complete: boolean }> {
  const missing = foods.flatMap((food, index) => (hasCarbsFat(food) ? [] : [index]));
  if (missing.length === 0) return { foods, complete: true };

  try {
    const { items } = await api.estimateCarbsFat(
      missing.map((index) => {
        const { name, description, calories, protein } = foods[index];
        return { name, description, calories, protein };
      })
    );

    const filled = [...foods];
    missing.forEach((foodIndex, i) => {
      filled[foodIndex] = {
        ...foods[foodIndex],
        carbs: cleanGrams(items?.[i]?.carbs),
        fat: cleanGrams(items?.[i]?.fat),
      };
    });
    return { foods: filled, complete: filled.every(hasCarbsFat) };
  } catch (err) {
    console.error('Carbs and fat estimate failed:', err);
    return { foods, complete: false };
  }
}
