/**
 * Totals Component - Daily Macro Progress
 * Displays calories and protein progress with SVG donut charts
 */

import React from 'react';
import type { FoodEntry } from '@/types';

interface TotalsProps {
  entries: FoodEntry[];
  targetCalories: number;
  targetProtein: number;
  maintenanceCalories?: number;
}

export default function Totals({ entries, targetCalories, targetProtein, maintenanceCalories }: TotalsProps) {
  // Calculate totals
  const totals = entries.reduce(
    (acc, entry) => ({
      calories: acc.calories + (entry.calories || 0),
      protein: acc.protein + (entry.protein || 0)
    }),
    { calories: 0, protein: 0 }
  );

  const caloriePercentage = targetCalories > 0 ? Math.min((totals.calories / targetCalories) * 100, 100) : 0;
  const proteinPercentage = targetProtein > 0 ? Math.min((totals.protein / targetProtein) * 100, 100) : 0;

  // SVG donut chart settings
  const size = 60;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;

  const getStrokeDashoffset = (percentage: number) => {
    return circumference - (percentage / 100) * circumference;
  };

  const getCalorieColor = () => {
    if (totals.calories === 0) return '#9CA3AF'; // gray-400
    if (targetCalories === 0) return '#9CA3AF';

    // If maintenanceCalories not provided, use simple logic
    if (!maintenanceCalories) {
      const percentOfTarget = (totals.calories / targetCalories) * 100;
      if (percentOfTarget > 100) return '#EF4444'; // red-500
      if (percentOfTarget > 90) return '#F59E0B'; // amber-500
      return '#10A37F'; // OpenAI green
    }

    const isDeficit = targetCalories < maintenanceCalories;  // Cutting
    const isSurplus = targetCalories > maintenanceCalories;  // Bulking

    const diff = totals.calories - targetCalories;
    const percentDiff = (diff / targetCalories) * 100;  // Positive = above, negative = below

    // Determine if we're on the "aligned" side (good direction)
    const isAligned = (isDeficit && diff < 0) || (isSurplus && diff > 0);

    if (isAligned) {
      // ALIGNED SIDE (good direction) - Gradual thresholds
      const absDiff = Math.abs(percentDiff);
      if (absDiff <= 10) return '#10A37F';  // green - 0-10%
      if (absDiff <= 20) return '#F59E0B';  // yellow - 10-20%
      if (absDiff <= 30) return '#F97316';  // orange - 20-30%
      return '#EF4444';                     // red - >30%
    } else {
      // NON-ALIGNED SIDE (bad direction) - Strict threshold
      const absDiff = Math.abs(percentDiff);
      if (absDiff <= 5) return '#10A37F';   // green - 0-5% tolerance
      return '#EF4444';                     // red - >5%
    }
  };

  const getProteinColor = () => {
    if (totals.protein === 0) return '#9CA3AF'; // gray-400
    if (targetProtein === 0) return '#9CA3AF';

    // Calculate percentage below target
    const percentBelow = ((targetProtein - totals.protein) / targetProtein) * 100;

    // Green: at or above target, or 0-10% below
    if (percentBelow <= 10) return '#10A37F';  // green - 0-10% below

    // Yellow: 10-20% below target
    if (percentBelow <= 20) return '#F59E0B';  // yellow - 10-20% below

    // Orange: 20-30% below target
    if (percentBelow <= 30) return '#F97316';  // orange - 20-30% below

    // Red: more than 30% below target
    return '#EF4444'; // red - >30% below
  };


  // Get background gradient class based on percentage and color
  const getCalorieGradient = () => {
    const color = getCalorieColor();
    if (color === '#10A37F') return 'bg-gradient-to-br from-green-50 to-emerald-50';
    if (color === '#F59E0B') return 'bg-gradient-to-br from-yellow-50 to-amber-50';
    if (color === '#F97316') return 'bg-gradient-to-br from-orange-50 to-red-50';
    if (color === '#EF4444') return 'bg-gradient-to-br from-red-50 to-pink-50';
    return 'bg-gray-50';
  };

  const getProteinGradient = () => {
    const color = getProteinColor();
    if (color === '#10A37F') return 'bg-gradient-to-br from-green-50 to-emerald-50';
    if (color === '#F59E0B') return 'bg-gradient-to-br from-yellow-50 to-amber-50';
    if (color === '#F97316') return 'bg-gradient-to-br from-orange-50 to-red-50';
    if (color === '#EF4444') return 'bg-gradient-to-br from-red-50 to-pink-50';
    return 'bg-gray-50';
  };

  return (
    <div className="flex items-center justify-center gap-6">
      {/* Calories Donut */}
      <div className="flex items-center gap-2">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="transform -rotate-90">
            {/* Background circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#E5E7EB"
              strokeWidth={strokeWidth}
              fill="none"
            />
            {/* Progress circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={getCalorieColor()}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={getStrokeDashoffset(caloriePercentage)}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-bold text-gray-900">{Math.round(caloriePercentage)}%</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-600 font-medium">Calories</div>
          <div className="text-sm font-bold text-gray-900">{totals.calories}</div>
          <div className="text-xs text-gray-500">of {targetCalories}</div>
        </div>
      </div>

      {/* Protein Donut */}
      <div className="flex items-center gap-2">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="transform -rotate-90">
            {/* Background circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#E5E7EB"
              strokeWidth={strokeWidth}
              fill="none"
            />
            {/* Progress circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={getProteinColor()}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={getStrokeDashoffset(proteinPercentage)}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-bold text-gray-900">{Math.round(proteinPercentage)}%</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-600 font-medium">Protein</div>
          <div className="text-sm font-bold text-gray-900">{Math.round(totals.protein * 10) / 10}g</div>
          <div className="text-xs text-gray-500">of {targetProtein}g</div>
        </div>
      </div>
    </div>
  );
}
