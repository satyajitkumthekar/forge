/**
 * WorkingBlock - what the food list shows while the AI works on a log: what
 * was sent, the step it is on, and each food as it is found, with the
 * portion that was assumed. It takes the place of the loading row and gives
 * way to the saved rows the moment the plate has been added up.
 *
 * Every line is real progress reported by the analyser (see
 * supabase/functions/analyze-food-v2/stream.ts), never a canned sequence:
 * a food appears here only once the AI has actually written it, and a
 * label lookup only while the AI is actually searching for it.
 */

import React from 'react';
import { lookupLine, type LiveFood, type LiveLookup } from '@/utils/plate';

export interface WorkingState {
  /** What the person typed; empty when they sent only a photo */
  typed: string;
  /** A photo went with it */
  photo: boolean;
  /** Foods found so far, in the order they were written */
  foods: LiveFood[];
  /** Labels looked up online so far, in the order they were started */
  lookups: LiveLookup[];
  /** reading: on its way to the server. portions: the server has read it
   *  and the AI is working, foods arriving as it finds them. adding: the
   *  checked plate is back and is being saved. */
  stage: 'reading' | 'portions' | 'adding';
}

const sent = (state: WorkingState): string =>
  state.photo && state.typed ? 'your photo and note' : state.photo ? 'your photo' : 'your note';

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    // Icon level with the first line, so a step that wraps (a long lookup)
    // still reads like a list
    <div className="flex items-start gap-2 py-1 text-xs leading-4 text-ink-soft animate-entry-in">
      {done ? (
        <svg className="mt-px h-3.5 w-3.5 flex-shrink-0 text-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="animate-spin mt-px h-3.5 w-3.5 flex-shrink-0 text-ink-faint" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

export default function WorkingBlock({ state }: { state: WorkingState }) {
  const reading = state.stage === 'reading';
  const adding = state.stage === 'adding';
  const count = state.foods.length;
  const lookups = state.lookups ?? [];
  // Finished lookups stay as ticked lines. One still running takes over the
  // working step, so only one thing is ever shown as in progress.
  const looked = lookups.filter((lookup) => lookup.done);
  const looking = [...lookups].reverse().find((lookup) => !lookup.done);

  return (
    <div className="px-4 py-3" role="status" aria-live="polite" aria-busy="true">
      <div className="text-sm text-ink-muted leading-snug break-words">{state.typed || 'Photo'}</div>

      <div className="mt-1.5">
        <Step done={!reading}>{reading ? `Reading ${sent(state)}` : `Read ${sent(state)}`}</Step>

        {!reading && (
          <>
            {looked.map((lookup) => (
              <Step key={lookup.id} done>
                {lookupLine(lookup)}
              </Step>
            ))}

            <Step done={adding}>
              {adding
                ? `Found ${count} ${count === 1 ? 'food' : 'foods'}`
                : looking
                  ? lookupLine(looking)
                  : 'Working out portions'}
            </Step>

            {/* Each food as it is found: the name, the portion that was
                assumed, and anything else that had to be assumed */}
            {count > 0 && (
              <ul className="ml-[6px] my-0.5 border-l border-line-strong max-w-xl">
                {state.foods.map((food, index) => (
                  <li key={index} className="pl-3.5 py-1 animate-entry-in">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-xs font-medium text-ink break-words min-w-0">{food.name}</span>
                      {food.portion && (
                        <span className="text-xs text-ink-muted text-right tabular-nums flex-shrink-0 max-w-[60%]">
                          {food.portion}
                        </span>
                      )}
                    </div>
                    {food.assumed && <div className="mt-0.5 text-xs text-ink-muted leading-snug">{food.assumed}</div>}
                  </li>
                ))}
              </ul>
            )}

            {adding && <Step done={false}>Adding it up</Step>}
          </>
        )}
      </div>
    </div>
  );
}
