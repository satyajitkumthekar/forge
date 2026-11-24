/**
 * Plate - turns the food analyser's answer into the foods the app logs.
 *
 * The analyser returns each food on a plate separately (see
 * supabase/functions/analyze-food-v2). Each becomes its own row in the same
 * meal, carrying a short note of how its numbers were worked out: the
 * portion that was assumed, anything else that was assumed, and whether the
 * client typed the numbers themselves. This file builds those rows and words
 * that note, so every screen says it the same way.
 *
 * No imports that run code, on purpose: the rules here are tested on their
 * own (tests/plate.test.mjs).
 */

import type { FoodAnalysis, FoodEntry } from '@/types';

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** One food as the analyser returns it */
export interface AnalysedFood {
  name: string;
  portion?: string;
  assumed?: string;
  numbers_from?: 'client' | 'label' | 'estimate';
  calories: number;
  protein: number;
  carbs?: number | null;
  fat?: number | null;
}

/**
 * The analyser's reply: the plate's totals, plus one entry per food in
 * `items`. The original analyser returns the totals only.
 */
export interface AnalysisResult extends AnalysedFood {
  items?: AnalysedFood[];
}

/** A food ready to log: everything a row needs except where and when */
export type FoodDraft = Omit<FoodEntry, 'id' | 'entry_date' | 'created_at' | 'user_id'>;

/**
 * A food as the analyser reports it while it is still working: shown as
 * progress, never saved. The checked numbers only come with the finished
 * plate.
 */
export interface LiveFood {
  name: string;
  portion?: string;
  assumed?: string;
}

/**
 * A web lookup the analyser is making for a brand or chain: reported when
 * it starts and again when it is done. The search words may only arrive
 * with the second report.
 */
export interface LiveLookup {
  id: string;
  /** search: words it searched for. page: a site it read. */
  kind: 'search' | 'page';
  /** The search words, or the site's name; may be empty */
  text: string;
  done: boolean;
}

/** Progress worth showing: the log was accepted, a lookup started or
 *  finished, or a food was found */
export type AnalysisProgress = { type: 'start' } | ({ type: 'food' } & LiveFood) | ({ type: 'lookup' } & LiveLookup);

/** What the analyser sends while it works, ending in 'done' or 'error' */
export type AnalysisEvent =
  | { type: 'start' }
  | ({ type: 'food' } & LiveFood)
  | ({ type: 'lookup' } & LiveLookup)
  | { type: 'done'; result: AnalysisResult }
  | { type: 'error'; status?: number; message?: string };

/**
 * The list of lookups with one more report in it: a new lookup is added,
 * a second report on the same one fills in its words and marks it done.
 * Never loses words it already had, and never undoes done.
 */
export function withLookup(lookups: LiveLookup[], next: LiveLookup): LiveLookup[] {
  const index = lookups.findIndex((lookup) => lookup.id === next.id);
  if (index < 0) return [...lookups, next];
  const before = lookups[index];
  const merged: LiveLookup = {
    id: before.id,
    kind: next.text ? next.kind : before.kind,
    text: next.text || before.text,
    done: before.done || next.done,
  };
  return lookups.map((lookup, at) => (at === index ? merged : lookup));
}

/**
 * A lookup as the working view words it: "Looking up Epigamia Turbo Greek
 * yoghurt nutrition" while it runs, "Looked up ..." once done, or
 * "Reading epigamia.com" for a site it opened.
 */
export function lookupLine(lookup: LiveLookup): string {
  const what = text(lookup.text);
  if (lookup.kind === 'page') {
    if (what) return `${lookup.done ? 'Read' : 'Reading'} ${what}`;
    return lookup.done ? 'Read a page online' : 'Reading a page online';
  }
  if (what) return `${lookup.done ? 'Looked up' : 'Looking up'} ${what}`;
  return lookup.done ? 'Searched online' : 'Searching online';
}

/**
 * Splits the analyser's progress stream into its messages. Feed it the
 * stream piece by piece; each call returns the messages that piece
 * completed and keeps any unfinished one for the next call.
 */
export class ProgressReader {
  private pending = '';

  push(piece: string): AnalysisEvent[] {
    // On the whole buffer, not the piece: a line ending can be split in two
    this.pending = (this.pending + piece).replace(/\r\n/g, '\n');
    const events: AnalysisEvent[] = [];

    let end = this.pending.indexOf('\n\n');
    while (end >= 0) {
      const block = this.pending.slice(0, end);
      this.pending = this.pending.slice(end + 2);
      end = this.pending.indexOf('\n\n');

      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      try {
        const event = JSON.parse(data);
        if (event && typeof event.type === 'string') events.push(event as AnalysisEvent);
      } catch {
        // Not a message for the app
      }
    }
    return events;
  }
}

const MAX_TYPED_CHARS = 500;

/** Grams as stored (one decimal), or null when missing or nonsense: never a made-up zero */
function gramsOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0 || value > 9999) return null;
  return Math.round(value * 10) / 10;
}

function noteFor(food: AnalysedFood, typed: string): FoodAnalysis {
  const portion = text(food.portion);
  const assumed = text(food.assumed);
  return {
    v: 1,
    ...(portion ? { portion } : {}),
    ...(assumed ? { assumed } : {}),
    from: food.numbers_from === 'client' ? 'client' : food.numbers_from === 'label' ? 'label' : 'estimate',
    ...(typed ? { typed: typed.slice(0, MAX_TYPED_CHARS) } : {}),
  };
}

/**
 * The rows to log for one analysed log, in the order the foods were listed.
 * A single food logs exactly as it always has. Several foods each become
 * their own row.
 */
export function foodsFromAnalysis(result: AnalysisResult, typedText: string): FoodDraft[] {
  const typed = typedText.trim();
  const foods = Array.isArray(result.items) ? result.items : [];

  // The original analyser, or a reply with no breakdown: one row, as before
  if (foods.length === 0) {
    return [
      {
        name: result.name,
        calories: result.calories,
        protein: result.protein,
        carbs: gramsOrNull(result.carbs),
        fat: gramsOrNull(result.fat),
        description: typed || result.name,
      },
    ];
  }

  const single = foods.length === 1;
  return foods.map((food) => {
    const portion = text(food.portion);
    return {
      name: food.name,
      calories: food.calories,
      protein: food.protein,
      carbs: gramsOrNull(food.carbs),
      fat: gramsOrNull(food.fat),
      // One food: what the client typed, as before. Several: the sentence
      // covers them all, so each row says which food it is and how much.
      description: single ? typed || food.name : portion ? `${food.name} (${portion})` : food.name,
      analysis: noteFor(food, typed),
    };
  });
}

const sentence = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const capitalised = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`;
};

/**
 * Under a food, once its meal's working is opened:
 * "1 katori, about 180 g. Oil not mentioned, assumed 1 tsp."
 * Null when there is nothing to say (shortcuts, and food logged before
 * this existed).
 */
export function workedOutLine(analysis: FoodAnalysis | null | undefined): string | null {
  if (!analysis || typeof analysis !== 'object') return null;
  const parts = [
    sentence(text(analysis.portion)),
    analysis.from === 'client' ? 'Used the numbers you typed.' : '',
    sentence(text(analysis.assumed)),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

/** The food carries a note worth showing */
export const hasWorking = (food: { analysis?: FoodAnalysis | null }): boolean =>
  workedOutLine(food.analysis) !== null;
