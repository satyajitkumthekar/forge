/**
 * Date Helper Utilities
 * Handles app-specific date logic with 3 AM cutoff for day transitions
 *
 * KEY BEHAVIOR:
 * - New day starts at 3 AM local time (not midnight)
 * - Times 12:00 AM - 2:59 AM count as "yesterday"
 * - Times 3:00 AM - 11:59 PM count as "today"
 * - Always uses LOCAL timezone (not UTC)
 */

/**
 * Get the current "app date" with 3 AM cutoff
 *
 * Examples (local time):
 * - 2:59 AM on Jan 16 → Returns "2024-01-15" (still yesterday)
 * - 3:00 AM on Jan 16 → Returns "2024-01-16" (new day starts)
 * - 11:00 PM on Jan 15 → Returns "2024-01-15" (normal case)
 *
 * @param date Optional date to calculate from (defaults to now)
 * @returns Date string in YYYY-MM-DD format
 */
export const getAppDate = (date?: Date): string => {
  const now = date || new Date();

  // If hour is between 0-2 (12 AM - 2:59 AM), subtract one day
  if (now.getHours() < 3) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return formatDateToString(yesterday);
  }

  return formatDateToString(now);
};

/**
 * Format a Date object to YYYY-MM-DD string using LOCAL timezone
 * (NOT UTC - this is the key fix for the timezone bug)
 *
 * @param date The date to format
 * @returns Date string in YYYY-MM-DD format
 */
export const formatDateToString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Alias for getAppDate() for backwards compatibility
 * @deprecated Use getAppDate() instead for clarity
 */
export const getTodayDate = getAppDate;
