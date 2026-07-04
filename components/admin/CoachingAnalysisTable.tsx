/**
 * CoachingAnalysisTable - AI meal-coaching analysis table with totals row.
 * Display-only: receives the cached analysis; refresh is delegated upward.
 */

import React from 'react';
import type { MealCoachingAnalysis } from '@/types';
import Button from '@/components/ui/Button';

interface CoachingAnalysisTableProps {
  analysis: MealCoachingAnalysis;
  onRefresh: () => void;
}

const headerCellClass =
  'px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted';

export default function CoachingAnalysisTable({ analysis, onRefresh }: CoachingAnalysisTableProps) {
  return (
    <div className="space-y-4">
      {/* Simple Table */}
      <div className="overflow-x-auto">
        <table className="w-full border border-line rounded-ctrl">
          <thead>
            <tr className="bg-paper-inset border-b border-line">
              <th className={`${headerCellClass} text-left`}>Meal & Timing</th>
              <th className={`${headerCellClass} text-left`}>Examples</th>
              <th className={`${headerCellClass} text-center`}>Cal</th>
              <th className={`${headerCellClass} text-center`}>Pro</th>
              <th className={`${headerCellClass} text-left`}>Frequency</th>
              <th className={`${headerCellClass} text-left`}>Recommended Change</th>
            </tr>
          </thead>
          <tbody>
            {analysis.mealTable.map((meal, idx) => (
              <tr key={idx} className="border-b border-line/60 hover:bg-paper-inset">
                <td className="px-4 py-3">
                  <div className="text-sm font-semibold text-ink">{meal.meal}</div>
                  <div className="text-xs text-ink-muted mt-0.5">⏰ {meal.timing}</div>
                </td>
                <td className="px-4 py-3 text-xs text-ink-soft">
                  {meal.examples.join(', ')}
                </td>
                <td className="px-4 py-3 text-center text-sm font-medium text-ink">{meal.avgCal}</td>
                <td className="px-4 py-3 text-center text-sm font-medium text-ink">{meal.avgPro}g</td>
                <td className="px-4 py-3 text-xs text-ink-soft">{meal.frequency}</td>
                <td className="px-4 py-3">
                  {meal.change ? (
                    <div className="text-sm text-accent-700 font-medium">{meal.change}</div>
                  ) : (
                    <span className="text-xs text-ink-faint">-</span>
                  )}
                </td>
              </tr>
            ))}

            {/* Totals Row */}
            <tr className="bg-paper-inset border-t-2 border-line-strong">
              <td className="px-4 py-3 text-sm font-bold text-ink">Daily Avg</td>
              <td className="px-4 py-3 text-xs text-ink-faint">-</td>
              <td className="px-4 py-3 text-center">
                <div className="text-sm font-bold text-ink">{analysis.totals.currentCal} cal</div>
                <div className="text-xs text-ink-muted">Target: {analysis.totals.targetCal}</div>
              </td>
              <td className="px-4 py-3 text-center">
                <div className="text-sm font-bold text-ink">{analysis.totals.currentPro}g</div>
                <div className="text-xs text-ink-muted">Target: {analysis.totals.targetPro}g</div>
              </td>
              <td className="px-4 py-3 text-xs text-ink-faint">-</td>
              <td className="px-4 py-3">
                {(() => {
                  const calGap = analysis.totals.targetCal - analysis.totals.currentCal;
                  const proGap = analysis.totals.targetPro - analysis.totals.currentPro;
                  return (
                    <div className="text-xs">
                      <div className={calGap > 0 ? 'text-danger font-medium' : 'text-accent-600 font-medium'}>
                        Cal: {calGap > 0 ? '+' : ''}{calGap}
                      </div>
                      <div className={proGap > 0 ? 'text-danger font-medium' : 'text-accent-600 font-medium'}>
                        Pro: {proGap > 0 ? '+' : ''}{proGap}g
                      </div>
                    </div>
                  );
                })()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Refresh Button */}
      <Button variant="secondary" size="sm" onClick={onRefresh}>
        Refresh Analysis
      </Button>
    </div>
  );
}
