/**
 * Stream - reading the AI's answer while it is still being written, so the
 * app can show each food the moment it is found instead of a blank wait.
 *
 * What is sent along the way is for showing progress only. Nothing here is
 * checked or saved: the checked, added-up plate still comes once, at the
 * end, exactly as it does without streaming (see plate.ts).
 *
 * Plain functions and classes with no server or network code, tested on
 * their own in tests/analyser.test.mjs.
 */

import { cleanText, needsAmount } from './plate.ts';

/** A food as it appears while the answer is still being written */
export interface LiveFood {
  name: string;
  portion: string;
  assumed: string;
  /** The AI could only guess how much there was (see needsAmount) */
  needs_amount: boolean;
}

/**
 * Finds each food in the answer as soon as it has been written in full.
 * Feed it the answer piece by piece, in order; each call returns the foods
 * that piece completed.
 *
 * The answer is one JSON object whose only list is the foods, so a food is
 * any object that opens directly inside a list that sits directly inside
 * the top object. Text inside quotes is skipped, whatever it contains.
 */
export class FoodScanner {
  private text = '';
  private at = 0;
  private open: string[] = [];
  private inText = false;
  private escaped = false;
  private foodStart = -1;

  push(piece: string): LiveFood[] {
    this.text += piece;
    const found: LiveFood[] = [];

    for (; this.at < this.text.length; this.at++) {
      const char = this.text[this.at];

      if (this.inText) {
        if (this.escaped) this.escaped = false;
        else if (char === '\\') this.escaped = true;
        else if (char === '"') this.inText = false;
        continue;
      }

      if (char === '"') {
        this.inText = true;
      } else if (char === '{' || char === '[') {
        if (char === '{' && this.open.length === 2 && this.open[0] === '{' && this.open[1] === '[') {
          this.foodStart = this.at;
        }
        this.open.push(char);
      } else if (char === '}' || char === ']') {
        this.open.pop();
        if (char === '}' && this.foodStart >= 0 && this.open.length === 2) {
          const food = readLiveFood(this.text.slice(this.foodStart, this.at + 1));
          if (food) found.push(food);
          this.foodStart = -1;
        }
      }
    }
    return found;
  }
}

function readLiveFood(json: string): LiveFood | null {
  try {
    const raw = JSON.parse(json);
    const name = cleanText(raw?.name, 120);
    if (!name) return null;
    return {
      name,
      portion: cleanText(raw?.portion, 160),
      assumed: cleanText(raw?.assumed, 240),
      needs_amount: needsAmount(raw ?? {}),
    };
  } catch {
    return null;
  }
}

/** A web search or page read the AI is making, or has made */
export interface LiveLookup {
  /** OpenAI's id for it: the same lookup is reported when it starts and when it ends */
  id: string;
  /** search: words it searched for. page: a site it read. */
  kind: 'search' | 'page';
  /** The search words, or the site's name; empty when not known yet */
  text: string;
  done: boolean;
}

/** The site's name from a web address: "epigamia.com" */
export function siteOf(url: unknown): string {
  if (typeof url !== 'string') return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Reads a web_search_call item from OpenAI's stream. The search words may
 * only be known once the search has finished, so a lookup can start with
 * no text and get it when it is done.
 */
export function readLookup(item: unknown, done: boolean): LiveLookup | null {
  if (!item || typeof item !== 'object') return null;
  const call = item as Record<string, any>;
  if (call.type !== 'web_search_call' || typeof call.id !== 'string' || !call.id) return null;

  const action = call.action && typeof call.action === 'object' ? call.action : {};
  if (action.type === 'open_page' || action.type === 'find_in_page') {
    return { id: call.id, kind: 'page', text: siteOf(action.url), done };
  }
  const words =
    typeof action.query === 'string'
      ? action.query
      : Array.isArray(action.queries)
        ? action.queries.find((query: unknown) => typeof query === 'string')
        : '';
  return { id: call.id, kind: 'search', text: cleanText(words, 90), done };
}

/** One event on its way to the app, in server-sent event form */
export const toEvent = (event: unknown): string => `data: ${JSON.stringify(event)}\n\n`;

/**
 * Splits a server-sent event stream into its JSON messages. Feed it the
 * stream piece by piece; each call returns the messages that piece
 * completed and keeps any unfinished one for the next call.
 */
export class EventReader {
  private pending = '';

  push(piece: string): unknown[] {
    // On the whole buffer, not the piece: a line ending can be split in two
    this.pending = (this.pending + piece).replace(/\r\n/g, '\n');
    const messages: unknown[] = [];

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
      if (!data || data === '[DONE]') continue;
      try {
        messages.push(JSON.parse(data));
      } catch {
        // Not JSON: nothing the analyser needs
      }
    }
    return messages;
  }
}
