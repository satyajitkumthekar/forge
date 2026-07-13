/**
 * Totals Component - Daily Macro Progress
 * Displays calories and protein progress with SVG donut charts
 */

import React from 'react';
import { tokens } from '@/lib/design-tokens';
import { useCountUp } from '@/utils/use-count-up';
import type { FoodEntry } from '@/types';

interface TotalsProps {
  entries: FoodEntry[];
  targetCalories: number;
  targetProtein: number;
  maintenanceCalories?: number;
}

const STATUS = {
  none: tokens.colors.ink.faint,
  good: tokens.colors.accent[500],
  warn: tokens.colors.warn.DEFAULT,
  alert: tokens.colors.alert.DEFAULT,
  danger: tokens.colors.danger.DEFAULT,
};

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

  // Display-only animated values (logic above always uses the real totals)
  const shownCalories = useCountUp(Math.round(totals.calories));
  const shownProtein = useCountUp(Math.round(totals.protein * 10) / 10, { decimals: 1 });
  const shownCaloriePct = useCountUp(Math.round(caloriePercentage));
  const shownProteinPct = useCountUp(Math.round(proteinPercentage));

  // SVG donut chart settings
  const size = 60;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;

  const getStrokeDashoffset = (percentage: number) => {
    return circumference - (percentage / 100) * circumference;
  };

  const getCalorieColor = () => {
    if (totals.calories === 0) return STATUS.none;
    if (targetCalories === 0) return STATUS.none;

    // If maintenanceCalories not provided, use simple logic
    if (!maintenanceCalories) {
      const percentOfTarget = (totals.calories / targetCalories) * 100;
      if (percentOfTarget > 100) return STATUS.danger;
      if (percentOfTarget > 90) return STATUS.warn;
      return STATUS.good;
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
      if (absDiff <= 10) return STATUS.good;   // 0-10%
      if (absDiff <= 20) return STATUS.warn;   // 10-20%
      if (absDiff <= 30) return STATUS.alert;  // 20-30%
      return STATUS.danger;                    // >30%
    } else {
      // NON-ALIGNED SIDE (bad direction) - Strict threshold
      const absDiff = Math.abs(percentDiff);
      if (absDiff <= 5) return STATUS.good;    // 0-5% tolerance
      return STATUS.danger;                    // >5%
    }
  };

  const getProteinColor = () => {
    if (totals.protein === 0) return STATUS.none;
    if (targetProtein === 0) return STATUS.none;

    // Calculate percentage below target
    const percentBelow = ((targetProtein - totals.protein) / targetProtein) * 100;

    // 10% grace below target stays green — matches the gate's protein floor
    if (percentBelow <= 10) return STATUS.good;   // at/above target or 0-10% below
    if (percentBelow <= 20) return STATUS.warn;   // 10-20% below
    if (percentBelow <= 30) return STATUS.alert;  // 20-30% below
    return STATUS.danger;                         // >30% below
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
              stroke={tokens.colors.line.DEFAULT}
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
            <span className="text-xs font-bold text-ink tabular-nums">{shownCaloriePct}%</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-ink-muted font-medium">Calories</div>
          <div className="text-lg font-semibold tracking-tight tabular-nums leading-tight text-ink">{shownCalories}</div>
          <div className="text-xs text-ink-muted tabular-nums">of {targetCalories}</div>
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
              stroke={tokens.colors.line.DEFAULT}
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
            <span className="text-xs font-bold text-ink tabular-nums">{shownProteinPct}%</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-ink-muted font-medium">Protein</div>
          <div className="text-lg font-semibold tracking-tight tabular-nums leading-tight text-ink">{shownProtein}g</div>
          <div className="text-xs text-ink-muted tabular-nums">of {targetProtein}g</div>
        </div>
      </div>
    </div>
  );
}
