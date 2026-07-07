/**
 * CookbookView - the anchor cookbook rendered as a typeset document.
 * One renderer serves both surfaces: the coach's preview IS the client view.
 *
 * Design rule: the document is the hero. No cards, chips, or app chrome in
 * the reading flow — hairline rules, editorial rhythm, and one quiet action
 * per recipe. The zinger pull-quote is the only color in the flow.
 *
 * Pure content component: no positioning. Consumers wrap it in their own
 * full-screen container (admin panel now, client Meals tab in Stage 2).
 */

import React, { useState } from 'react';
import { format } from 'date-fns';
import type { AnchorCookbook } from '@/types';

interface CookbookViewProps {
  cookbook: AnchorCookbook;
  /** preview: coach verification — per-ingredient macros visible, add buttons inert */
  mode: 'preview' | 'client';
  /** Client mode: perform the one-tap preset insert for recipe `index` */
  onAddMeal?: (index: number) => Promise<void>;
}

const microLabel = 'text-[11px] font-semibold uppercase tracking-wider text-ink-muted';

export default function CookbookView({ cookbook, mode, onAddMeal }: CookbookViewProps) {
  const c = cookbook.content;
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState<number | null>(null);

  const handleAdd = async (index: number) => {
    if (!onAddMeal || adding !== null || added.has(index)) return;
    setAdding(index);
    try {
      await onAddMeal(index);
      setAdded((prev) => new Set(prev).add(index));
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 md:py-14 animate-fade-in">
      {/* Masthead */}
      <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-ink-muted">
        Superhuman Lab
      </div>
      <h1 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight text-ink leading-tight uppercase">
        {c.title}
      </h1>
      <p className="mt-2 text-xs text-ink-muted">
        Prepared for {c.clientName} · {format(new Date(cookbook.created_at), 'MMMM yyyy')}
      </p>
      {c.subtitle ? (
        <p className="mt-4 text-sm font-medium text-ink-soft">{c.subtitle}</p>
      ) : null}
      {c.taglines.length > 0 && (
        <p className="mt-2 text-sm text-ink-muted italic">{c.taglines.join(' · ')}</p>
      )}

      {/* Intro — written to the client */}
      {c.intro ? (
        <p className="mt-8 text-[15px] leading-relaxed text-ink-soft whitespace-pre-line">
          {c.intro}
        </p>
      ) : null}

      {/* How it works — clean lined ledger */}
      {c.howItWorks.rows.length > 0 && (
        <section className="mt-10">
          <div className={microLabel}>How it works</div>
          <div className="mt-3">
            {c.howItWorks.rows.map((row, i) => (
              <div
                key={i}
                className="flex items-baseline justify-between gap-4 py-2.5 border-b border-line"
              >
                <span className="text-sm text-ink min-w-0 flex-1">{row.label}</span>
                <span className="text-sm text-ink-soft tabular-nums shrink-0">
                  ~{row.protein}g · {row.calories} kcal
                </span>
              </div>
            ))}
          </div>
          {c.howItWorks.footer ? (
            <p className="mt-3 text-xs text-ink-muted leading-relaxed">{c.howItWorks.footer}</p>
          ) : null}
        </section>
      )}

      {/* Recipes */}
      {c.meals.map((meal, i) => (
        <section key={i}>
          <hr className="my-10 border-line" />

          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-ink">
              {i + 1} · {meal.name}
            </h2>
            {meal.timeMinutes > 0 && (
              <span className="text-xs text-ink-muted shrink-0 tabular-nums">
                ~{meal.timeMinutes} min
              </span>
            )}
          </div>
          {meal.blurb ? (
            <p className="mt-1.5 text-sm text-ink-soft leading-relaxed">{meal.blurb}</p>
          ) : null}

          {meal.ingredients.length > 0 && (
            <div className="mt-5">
              <div className={microLabel}>Ingredients</div>
              <ul className="mt-2 space-y-1.5">
                {meal.ingredients.map((ing, j) => (
                  <li key={j} className="flex items-baseline justify-between gap-3 text-sm text-ink">
                    <span className="min-w-0 flex-1">· {ing.text}</span>
                    {mode === 'preview' && (
                      <span className="text-[11px] text-ink-faint tabular-nums shrink-0">
                        {ing.calories} cal · {Number(ing.protein).toFixed(0)}g
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {meal.sauces.length > 0 && (
            <div className="mt-5">
              <div className={microLabel}>Sauce (pick one)</div>
              <p className="mt-2 text-sm text-ink leading-relaxed">{meal.sauces.join(' · ')}</p>
            </div>
          )}

          {meal.steps.length > 0 && (
            <div className="mt-5">
              <div className={microLabel}>Steps</div>
              <ol className="mt-2 space-y-1.5 list-decimal list-inside">
                {meal.steps.map((step, j) => (
                  <li key={j} className="text-sm text-ink leading-relaxed">
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {meal.zinger ? (
            <blockquote className="mt-6 border-l-2 border-accent-600 pl-4 text-sm italic text-ink-soft leading-relaxed">
              {meal.zinger}
            </blockquote>
          ) : null}

          <p className="mt-6 text-sm font-medium text-ink tabular-nums">
            ~{meal.calories} kcal · ~{Number(meal.protein).toFixed(0)}g protein
          </p>

          {/* The one quiet action per recipe: instant preset insert, no computation */}
          {added.has(i) ? (
            <div className="mt-3 inline-flex items-center gap-1.5 min-h-[36px] px-3 text-xs font-medium text-accent-700">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Added to today
            </div>
          ) : (
            <button
              onClick={onAddMeal ? () => handleAdd(i) : undefined}
              disabled={adding !== null}
              className={`mt-3 inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3 text-xs font-medium rounded-ctrl border border-line bg-paper-inset text-ink transition duration-150 ease-spring ${
                onAddMeal
                  ? 'hover:bg-paper-deep active:scale-[0.97] disabled:opacity-60'
                  : 'cursor-default'
              }`}
            >
              {adding === i ? (
                <>
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Adding…
                </>
              ) : (
                <>＋ Add to today's log</>
              )}
            </button>
          )}
        </section>
      ))}

      {/* Cheat sheet — derived from the recipes */}
      {c.meals.length > 0 && (
        <section className="mt-10">
          <hr className="mb-10 border-line" />
          <div className={microLabel}>The cheat sheet</div>
          <div className="mt-3">
            <div className="flex items-baseline justify-between gap-4 pb-2 border-b border-line-strong">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Meal</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted shrink-0">
                kcal · protein
              </span>
            </div>
            {c.meals.map((meal, i) => (
              <div key={i} className="flex items-baseline justify-between gap-4 py-2.5 border-b border-line">
                <span className="text-sm text-ink min-w-0 flex-1">{meal.name}</span>
                <span className="text-sm text-ink-soft tabular-nums shrink-0">
                  ~{meal.calories} · ~{Number(meal.protein).toFixed(0)}g
                </span>
              </div>
            ))}
          </div>
          {c.cheatSheetNote ? (
            <p className="mt-3 text-xs text-ink-muted leading-relaxed">{c.cheatSheetNote}</p>
          ) : null}
        </section>
      )}

      {/* Sauce guide */}
      {(c.sauceGuide.useFreely.length > 0 || c.sauceGuide.useSparingly.length > 0) && (
        <section className="mt-10">
          <div className={microLabel}>Low-cal sauce guide</div>
          <div className="mt-3 grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs font-medium text-accent-700">Use freely</div>
              <ul className="mt-2 space-y-1">
                {c.sauceGuide.useFreely.map((s, i) => (
                  <li key={i} className="text-sm text-ink">· {s}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs font-medium text-alert">Use sparingly</div>
              <ul className="mt-2 space-y-1">
                {c.sauceGuide.useSparingly.map((s, i) => (
                  <li key={i} className="text-sm text-ink">· {s}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Grocery kit */}
      {c.groceryKit.items.length > 0 && (
        <section className="mt-10">
          <div className={microLabel}>{c.groceryKit.title || 'Grocery starter kit'}</div>
          <ul className="mt-3 space-y-1.5">
            {c.groceryKit.items.map((item, i) => (
              <li key={i} className="text-sm text-ink leading-relaxed">· {item}</li>
            ))}
          </ul>
          {c.groceryKit.note ? (
            <p className="mt-3 text-xs text-ink-muted leading-relaxed">{c.groceryKit.note}</p>
          ) : null}
        </section>
      )}

      {/* Sign-off */}
      <p className="mt-14 mb-6 text-sm font-medium text-ink whitespace-pre-line">
        {c.signoff || '— Superhuman Lab'}
      </p>
    </div>
  );
}
