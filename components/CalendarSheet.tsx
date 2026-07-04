/**
 * CalendarSheet - bottom sheet month calendar opened from Track.
 * Each day square is colored by how that day's calories landed against the
 * user's targets (thresholds shared with Track via utils/day-status).
 * ABSTRACTION: Uses db.food and cache APIs, never calls Supabase directly.
 */

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/database';
import { getCached, setCached, CACHE_KEYS } from '@/lib/enhanced-cache';
import { getDayStatus, type DayStatus } from '@/utils/day-status';
import { parseYMD, appToday, maxNavigableDate } from '@/utils/date';
import { Skeleton } from '@/components/ui/Skeleton';
import type { UserSettings } from '@/types';

interface CalendarSheetProps {
  open: boolean;
  onClose: () => void;
  settings: UserSettings;
  /** The date currently shown on Track (YYYY-MM-DD) */
  viewedDate: string;
  onSelectDate: (date: string) => void;
}

// Month totals change at most a few times an hour for one user
const CALENDAR_CACHE_TTL = 5 * 60 * 1000;

const STATUS_CLASSES: Record<DayStatus, string> = {
  good: 'bg-accent-500 text-white font-semibold',
  warn: 'bg-warn text-white font-semibold',
  alert: 'bg-alert text-white font-semibold',
  danger: 'bg-danger text-white font-semibold',
  empty: 'bg-paper-inset text-ink-faint',
};

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** 'YYYY-MM' helpers — all local time, consistent with utils/date.ts */
const monthOf = (date: string): string => date.slice(0, 7);

const shiftMonth = (month: string, delta: number): string => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const daysInMonth = (month: string): number => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

export default function CalendarSheet({ open, onClose, settings, viewedDate, onSelectDate }: CalendarSheetProps) {
  const [month, setMonth] = useState(() => monthOf(viewedDate));
  // date -> total calories for the displayed month; null = not loaded yet
  const [totals, setTotals] = useState<Record<string, number> | null>(null);

  // Reset to the viewed date's month each time the sheet opens
  useEffect(() => {
    if (open) setMonth(monthOf(viewedDate));
    // viewedDate only matters at the moment of opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Load the month's day totals (SWR: cache-first, then fresh with 5-min TTL)
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const load = async () => {
      const cacheKey = CACHE_KEYS.calendarMonth(month);
      const cached = getCached<Record<string, number>>(cacheKey);
      setTotals(cached);

      try {
        const first = `${month}-01`;
        const last = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
        const entries = await db.food.getRange(first, last);

        if (cancelled) return;

        const fresh: Record<string, number> = {};
        for (const entry of entries) {
          fresh[entry.entry_date] = (fresh[entry.entry_date] ?? 0) + (entry.calories || 0);
        }

        setCached(cacheKey, fresh, CALENDAR_CACHE_TTL);
        setTotals(fresh);
      } catch (err) {
        console.error('Error loading calendar month:', err);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [open, month]);

  if (!open) return null;

  const today = appToday();
  const maxDate = maxNavigableDate();
  const atCurrentMonth = month >= monthOf(today);

  const monthTitle = parseYMD(`${month}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const dayCount = daysInMonth(month);
  // Monday-start grid: JS getDay() is 0=Sun..6=Sat
  const mondayOffset = (parseYMD(`${month}-01`).getDay() + 6) % 7;
  const daysLogged = totals ? Object.values(totals).filter((calories) => calories > 0).length : 0;

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Calendar">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-ink/40 animate-fade-in" onClick={onClose} />

      {/* Sheet */}
      <div className="absolute bottom-0 left-0 right-0">
        <div
          className="max-w-md mx-auto bg-paper-raised rounded-t-card shadow-overlay animate-sheet-up"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          {/* Drag handle */}
          <div className="w-9 h-1 rounded-full bg-line-strong mx-auto mt-2" />

          {/* Month header */}
          <div className="flex items-center justify-between px-3 pt-1">
            <button
              onClick={() => setMonth(shiftMonth(month, -1))}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-paper-inset active:bg-paper-deep rounded-ctrl transition duration-150"
              aria-label="Previous month"
            >
              <svg className="w-4 h-4 text-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="text-center">
              <div className="text-base font-semibold tracking-tight text-ink">{monthTitle}</div>
              {totals === null ? (
                <Skeleton className="h-3 w-20 mx-auto mt-1" />
              ) : (
                <div className="text-xs text-ink-muted tabular-nums mt-0.5">{daysLogged} days logged</div>
              )}
            </div>

            <button
              onClick={() => setMonth(shiftMonth(month, 1))}
              disabled={atCurrentMonth}
              className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-ctrl transition duration-150 ${
                atCurrentMonth ? 'opacity-30 cursor-not-allowed' : 'hover:bg-paper-inset active:bg-paper-deep'
              }`}
              aria-label="Next month"
            >
              <svg className="w-4 h-4 text-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Weekday row (Monday start) */}
          <div className="grid grid-cols-7 gap-1.5 px-4 pt-3">
            {WEEKDAYS.map((letter, i) => (
              <div key={i} className="text-center text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                {letter}
              </div>
            ))}
          </div>

          {/* Day grid */}
          {totals === null ? (
            <div className="grid grid-cols-7 gap-1.5 p-4 pt-2">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1.5 p-4 pt-2">
              {Array.from({ length: mondayOffset }).map((_, i) => (
                <div key={`blank-${i}`} />
              ))}
              {Array.from({ length: dayCount }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${month}-${String(day).padStart(2, '0')}`;
                const isFuture = dateStr > maxDate;
                const isToday = dateStr === today;
                const isViewed = dateStr === viewedDate && !isToday;
                const status = getDayStatus(
                  totals[dateStr] ?? 0,
                  settings.target_calories,
                  settings.maintenance_calories
                );

                return (
                  <button
                    key={dateStr}
                    onClick={() => onSelectDate(dateStr)}
                    disabled={isFuture}
                    className={`aspect-square rounded-md flex items-center justify-center text-[11px] tabular-nums transition duration-150 active:scale-[0.95] ${
                      isFuture
                        ? 'bg-transparent text-ink-faint/60 cursor-not-allowed active:scale-100'
                        : STATUS_CLASSES[status]
                    } ${
                      isToday
                        ? 'ring-2 ring-ink ring-offset-1 ring-offset-paper-raised'
                        : isViewed
                          ? 'ring-1 ring-ink-muted'
                          : ''
                    }`}
                    aria-label={dateStr}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="px-4 pb-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-ink-muted">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-accent-500" />
              On target
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-warn" />
              Close
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-alert" />
              Off
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-danger" />
              Over
            </span>
            <span className="flex items-center gap-1">
              · <span className="w-2.5 h-2.5 rounded-sm bg-paper-inset border border-line" />
              not logged
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
