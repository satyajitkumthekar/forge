/**
 * Weekly Stats Calculator
 * ABSTRACTION: Calculate weekly nutrition statistics
 */

import { startOfWeek, format, addDays } from 'date-fns';
import { getAppDate, formatDateToString } from './date-helpers';
import type { FoodEntry, WeeklyStats, DayData } from '../types';

export const getWeekStart = (date: Date | string): Date => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return startOfWeek(d, { weekStartsOn: 1 }); // Monday
};

export const formatWeekRange = (weekStart: Date): string => {
  const weekEnd = addDays(weekStart, 6);
  const startMonth = format(weekStart, 'MMM');
  const endMonth = format(weekEnd, 'MMM');

  if (startMonth === endMonth) {
    return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'd, yyyy')}`;
  }
  return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
};

export const getWeeklyStats = async (
  weekStart: Date,
  targetCalories: number,
  maintenanceCalories: number,
  getDataForRange: (start: string, end: string) => Promise<Record<string, FoodEntry[]>>
): Promise<WeeklyStats> => {
  const weekEnd = addDays(weekStart, 6);
  const startDate = format(weekStart, 'yyyy-MM-dd');
  const endDate = format(weekEnd, 'yyyy-MM-dd');
  const today = getAppDate(); // Use 3 AM cutoff and local timezone

  const allData = await getDataForRange(startDate, endDate);

  // Build daily data for each day of the week
  const dailyData: DayData[] = [];
  let daysLogged = 0;

  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const dateStr = format(date, 'yyyy-MM-dd');
    const entries = allData[dateStr] || [];

    if (entries.length > 0) daysLogged++;

    const totals = entries.reduce(
      (acc, entry) => ({
        calories: acc.calories + (entry.calories || 0),
        protein: acc.protein + (entry.protein || 0),
      }),
      { calories: 0, protein: 0 }
    );

    dailyData.push({
      date: dateStr,
      ...totals,
      entries,
    });
  }

  // Calculate averages - EXCLUDE today and days with no food
  const completedDaysWithFood = dailyData.filter(
    day => day.date < today && day.calories > 0
  );

  const avgCaloriesTotal = completedDaysWithFood.reduce((sum, day) => sum + day.calories, 0);
  const avgProteinTotal = completedDaysWithFood.reduce((sum, day) => sum + day.protein, 0);
  const avgDaysCount = completedDaysWithFood.length;

  const avgCalories = avgDaysCount > 0 ? Math.round(avgCaloriesTotal / avgDaysCount) : 0;
  const avgProtein = avgDaysCount > 0 ? Math.round(avgProteinTotal / avgDaysCount) : 0;

  // Calculate deficit/surplus from MAINTENANCE (not target)
  // Positive = surplus (eating more than maintenance)
  // Negative = deficit (eating less than maintenance)
  const dailyDeficit = avgCalories - maintenanceCalories;
  const weeklyDeficit = avgDaysCount > 0 ? dailyDeficit * avgDaysCount : 0;

  return {
    dailyData,
    averages: {
      calories: avgCalories,
      protein: avgProtein,
    },
    deficit: {
      daily: dailyDeficit,
      weekly: weeklyDeficit,
    },
    daysLogged,
  };
};
