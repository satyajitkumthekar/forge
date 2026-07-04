/**
 * Date Utilities - single source of truth for calendar dates
 *
 * All functions operate in LOCAL time on YYYY-MM-DD strings.
 * Never use toISOString() or new Date("YYYY-MM-DD") for calendar math:
 * both work in UTC and shift the day for users west of Greenwich.
 */

export const formatYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Parse YYYY-MM-DD as LOCAL midnight (new Date("YYYY-MM-DD") would be UTC). */
export const parseYMD = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** The local calendar date, no cutoff logic. */
export const todayLocal = (): string => formatYMD(new Date());

/**
 * The app's canonical "today": local date with a 3 AM cutoff.
 * Before 3 AM, late-night food still counts toward the previous day.
 */
export const appToday = (): string => {
  const now = new Date();
  const dateStr = formatYMD(now);
  return now.getHours() < 3 ? addDaysYMD(dateStr, -1) : dateStr;
};

export const addDaysYMD = (s: string, n: number): string => {
  const d = parseYMD(s);
  d.setDate(d.getDate() + n);
  return formatYMD(d);
};

/** Latest date the Track screen may navigate to (tomorrow, local). */
export const maxNavigableDate = (): string => addDaysYMD(todayLocal(), 1);

/** "Today" for the canonical date, otherwise e.g. "Sun, Feb 2, 2026". */
export const formatDisplayDate = (s: string): string => {
  if (s === appToday()) return 'Today';
  return parseYMD(s).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};
