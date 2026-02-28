/**
 * DayColumn Component - Single Day Food Log Display
 * Shows date, totals, and food entries for one day in coach analytics
 */

import React from 'react';
import Totals from './Totals';
import MacroTable from './MacroTable';
import FoodLogView from './FoodLogView';
import type { FoodEntry } from '@/types';

interface DayColumnProps {
  date: string;
  dayName: string;
  entries: FoodEntry[];
  targetCalories: number;
  targetProtein: number;
  maintenanceCalories: number;
  viewMode: 'table' | 'log';
  isToday?: boolean;
}

export default function DayColumn({
  date,
  dayName,
  entries,
  targetCalories,
  targetProtein,
  maintenanceCalories,
  viewMode,
  isToday = false,
}: DayColumnProps) {
  const formatDisplayDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Read-only mode - no delete/duplicate actions in coach view
  const handleDelete = () => {};
  const handleDuplicate = () => {};

  return (
    <div className="flex-shrink-0 w-80 bg-white border border-gray-200 rounded-lg shadow-sm">
      {/* Day Header */}
      <div className={`p-3 border-b border-gray-200 ${isToday ? 'bg-blue-50' : 'bg-gray-50'}`}>
        <div className="text-center">
          <div className="text-xs font-semibold text-gray-600 uppercase">{dayName}</div>
          <div className="text-sm font-medium text-gray-900 mt-0.5">
            {formatDisplayDate(date)}
            {isToday && <span className="ml-2 text-xs text-blue-600 font-bold">TODAY</span>}
          </div>
        </div>
      </div>

      {/* Totals */}
      <div className="p-3 border-b border-gray-200 bg-gray-50">
        <Totals
          entries={entries}
          targetCalories={targetCalories}
          targetProtein={targetProtein}
          maintenanceCalories={maintenanceCalories}
        />
      </div>

      {/* Food Entries */}
      <div className="p-3 max-h-96 overflow-y-auto">
        {viewMode === 'table' ? (
          <MacroTable
            entries={entries}
            onDeleteEntry={handleDelete}
            onDuplicateEntry={handleDuplicate}
          />
        ) : (
          <FoodLogView
            entries={entries}
            onDeleteEntry={handleDelete}
            onDuplicateEntry={handleDuplicate}
          />
        )}
      </div>
    </div>
  );
}
