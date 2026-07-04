/**
 * Day Status - classifies a day's calorie total against the user's targets.
 * Thresholds copied EXACTLY from Track's getCalorieColor (app/(tabs)/index.tsx)
 * so the calendar and the Track gradient always agree.
 */

export type DayStatus = 'good' | 'warn' | 'alert' | 'danger' | 'empty';

export function getDayStatus(
  totalCalories: number,
  targetCalories: number,
  maintenanceCalories: number
): DayStatus {
  if (totalCalories === 0 || targetCalories === 0) return 'empty';

  const isDeficit = targetCalories < maintenanceCalories;
  const isSurplus = targetCalories > maintenanceCalories;

  const diff = totalCalories - targetCalories;
  const percentDiff = (diff / targetCalories) * 100;

  const isAligned = (isDeficit && diff < 0) || (isSurplus && diff > 0);

  const absDiff = Math.abs(percentDiff);
  if (isAligned) {
    if (absDiff <= 10) return 'good';   // on target
    if (absDiff <= 20) return 'warn';   // 10-20%
    if (absDiff <= 30) return 'alert';  // 20-30%
    return 'danger';                    // >30%
  }

  if (absDiff <= 5) return 'good';
  return 'danger';
}
