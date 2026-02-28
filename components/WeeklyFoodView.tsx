/**
 * WeeklyFoodView Component - 7-Day Side-by-Side Food Log Display
 * Shows all 7 days of the week with food entries for coach analytics
 */

import React from 'react';
import { format, addDays } from 'date-fns';
import DayColumn from './DayColumn';
import type { FoodEntry } from '@/types';

interface WeeklyFoodViewProps {
  weekStart: Date;
  weeklyData: Record<string, FoodEntry[]>;
  targetCalories: number;
  targetProtein: number;
  maintenanceCalories: number;
  viewMode: 'table' | 'log';
  onViewModeChange: (mode: 'table' | 'log') => void;
}

export default function WeeklyFoodView({
  weekStart,
  weeklyData,
  targetCalories,
  targetProtein,
  maintenanceCalories,
  viewMode,
  onViewModeChange,
}: WeeklyFoodViewProps) {
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const today = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="bg-gray-50 p-4">
      {/* View Mode Toggle */}
      <div className="flex justify-end mb-4">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          <button
            onClick={() => onViewModeChange('table')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              viewMode === 'table' ? 'bg-black text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Table
          </button>
          <button
            onClick={() => onViewModeChange('log')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              viewMode === 'log' ? 'bg-black text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Log
          </button>
        </div>
      </div>

      {/* 7-Day Horizontal Scroll View */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {dayNames.map((dayName, index) => {
            const date = addDays(weekStart, index);
            const dateStr = format(date, 'yyyy-MM-dd');
            const entries = weeklyData[dateStr] || [];
            const isToday = dateStr === today;

            return (
              <DayColumn
                key={dateStr}
                date={dateStr}
                dayName={dayName}
                entries={entries}
                targetCalories={targetCalories}
                targetProtein={targetProtein}
                maintenanceCalories={maintenanceCalories}
                viewMode={viewMode}
                isToday={isToday}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
