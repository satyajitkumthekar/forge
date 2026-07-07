/**
 * CoachTable - weekly coach-analytics table with expandable per-user rows
 * (Table/Log timeline views and AI Coaching analysis).
 * Stateless: expansion, view-mode, and data caches live in the parent and
 * arrive as props; all mutations are delegated through the on* callbacks.
 */

import React from 'react';
import { format, addDays } from 'date-fns';
import type { CoachAnalyticsRow, FoodEntry, MealCoachingAnalysis } from '@/types';
import { SkeletonRow } from '@/components/ui/Skeleton';
import SegmentedControl from '@/components/admin/SegmentedControl';
import DayTimeline from '@/components/admin/DayTimeline';
import CoachingAnalysisTable from '@/components/admin/CoachingAnalysisTable';
import { getCaloriesColor, getProteinColor, getDeficitDisplay } from '@/components/admin/helpers';

interface CoachTableProps {
  users: CoachAnalyticsRow[];
  weekStart: Date;
  expandedRows: Set<string>;
  loadingExpanded: Set<string>;
  expandedRowsData: Map<string, Record<string, FoodEntry[]>>;
  expandedRowViewMode: Map<string, 'table' | 'log' | 'coaching'>;
  coachingAnalysisData: Map<string, MealCoachingAnalysis>;
  loadingCoaching: Set<string>;
  onToggleExpand: (userId: string) => void;
  onUpdateViewMode: (userId: string, mode: 'table' | 'log' | 'coaching') => void;
  onRefreshCoaching: (userId: string) => void;
  /** Client timezone lookup — timelines render log times in the client's clock */
  getTimezone?: (userId: string) => string | null | undefined;
  /** Opens the anchor-cookbook panel for a client */
  onOpenCookbooks?: (userId: string, email: string) => void;
}

const headerCellClass =
  'px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted';

export default function CoachTable({
  users,
  weekStart,
  expandedRows,
  loadingExpanded,
  expandedRowsData,
  expandedRowViewMode,
  coachingAnalysisData,
  loadingCoaching,
  onToggleExpand,
  onUpdateViewMode,
  onRefreshCoaching,
  getTimezone,
  onOpenCookbooks,
}: CoachTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-paper-inset border-b border-line">
            <th className={`${headerCellClass} text-left sticky left-0 bg-paper-inset z-10 scroll-edge-r`}>Email</th>
            <th className={`${headerCellClass} text-left`}>Target</th>
            <th className={`${headerCellClass} text-left`}>Weekly Avg</th>
            <th className={`${headerCellClass} text-left`}>Daily Avg +-</th>
            <th className={`${headerCellClass} text-left`}>Weekly Total</th>
            <th className={`${headerCellClass} text-center`}>Mon</th>
            <th className={`${headerCellClass} text-center`}>Tue</th>
            <th className={`${headerCellClass} text-center`}>Wed</th>
            <th className={`${headerCellClass} text-center`}>Thu</th>
            <th className={`${headerCellClass} text-center`}>Fri</th>
            <th className={`${headerCellClass} text-center`}>Sat</th>
            <th className={`${headerCellClass} text-center`}>Sun</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const deficitDisplay = getDeficitDisplay(user.daily_deficit, user.target_calories, user.maintenance_calories);
            const weeklyDeficitDisplay = getDeficitDisplay(user.weekly_deficit, user.target_calories, user.maintenance_calories);
            const isExpanded = expandedRows.has(user.user_id);
            const isLoading = loadingExpanded.has(user.user_id);

            return (
              <React.Fragment key={user.user_id}>
                {/* Main Row */}
                <tr className="border-b border-line hover:bg-paper-inset transition-colors">
                  <td className="px-4 py-4 text-sm text-ink font-medium sticky left-0 bg-paper-raised z-10 scroll-edge-r">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onToggleExpand(user.user_id)}
                        className="p-1 hover:bg-paper-inset active:bg-paper-deep rounded transition-all"
                        title={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        <svg className={`w-4 h-4 text-ink-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                      <span>{user.email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-xs text-ink-soft">
                    <div className="text-ink-muted mb-1">Maint: {user.maintenance_calories} cal</div>
                    <div>{user.target_calories} cal</div>
                    <div>{user.target_protein}g pro</div>
                  </td>
                  <td className="px-4 py-4 text-xs text-ink-soft">
                    <div>{user.avg_calories} cal</div>
                    <div>{user.avg_protein}g pro</div>
                  </td>
                  <td className="px-4 py-4 text-xs">
                    <div className={`font-semibold ${deficitDisplay.color}`}>{deficitDisplay.label}</div>
                  </td>
                  <td className="px-4 py-4 text-xs">
                    <div className={`font-semibold ${weeklyDeficitDisplay.color}`}>{Math.abs(user.weekly_deficit)} cal</div>
                    <div className="text-ink-faint text-xs mt-1">({user.days_logged} days)</div>
                  </td>
                  {/* Day 1-7 */}
                  {[
                    [user.d1_calories, user.d1_protein],
                    [user.d2_calories, user.d2_protein],
                    [user.d3_calories, user.d3_protein],
                    [user.d4_calories, user.d4_protein],
                    [user.d5_calories, user.d5_protein],
                    [user.d6_calories, user.d6_protein],
                    [user.d7_calories, user.d7_protein],
                  ].map(([cal, pro], idx) => {
                    const calColor = getCaloriesColor(cal, user.target_calories, user.maintenance_calories);
                    const proColor = getProteinColor(Number(pro), user.target_protein);

                    return (
                      <td key={idx} className="px-2 py-4">
                        {cal === 0 ? (
                          <div className="text-center text-xs text-ink-faint">-</div>
                        ) : (
                          <div className="space-y-1">
                            <div className={`px-2 py-1 rounded-full text-xs font-bold text-center tabular-nums ${calColor}`}>
                              {cal}
                            </div>
                            <div className={`px-2 py-1 rounded-full text-xs font-bold text-center tabular-nums ${proColor}`}>
                              {Number(pro).toFixed(0)}g
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* Expanded Row */}
                {isExpanded && (
                  <tr>
                    <td colSpan={13} className="px-4 py-6 bg-paper-raised border-t border-line/60">
                      {isLoading ? (
                        <div>
                          <SkeletonRow />
                          <SkeletonRow />
                          <SkeletonRow />
                        </div>
                      ) : (
                        <div>
                          {/* Cookbooks entry + view toggle */}
                          <div className="flex items-center justify-between gap-2 mb-4">
                            {onOpenCookbooks ? (
                              <button
                                onClick={() => onOpenCookbooks(user.user_id, user.email)}
                                className="inline-flex items-center gap-1.5 min-h-[36px] px-3 text-xs font-medium rounded-ctrl border border-line bg-paper-inset text-ink hover:bg-paper-deep active:scale-[0.97] transition duration-150 ease-spring"
                              >
                                <svg className="w-3.5 h-3.5 text-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                </svg>
                                Cookbooks
                              </button>
                            ) : (
                              <span />
                            )}
                            <SegmentedControl
                              options={[
                                { value: 'table', label: 'Table' },
                                { value: 'log', label: 'Log' },
                                { value: 'coaching', label: 'Coaching' },
                              ]}
                              value={expandedRowViewMode.get(user.user_id) || 'table'}
                              onChange={(v) => onUpdateViewMode(user.user_id, v as 'table' | 'log' | 'coaching')}
                            />
                          </div>

                          {/* Render content based on view mode */}
                          {(expandedRowViewMode.get(user.user_id) || 'table') === 'coaching' ? (
                            // Coaching View
                            loadingCoaching.has(user.user_id) ? (
                              <div className="flex items-center justify-center py-12">
                                <div className="flex items-center gap-3">
                                  <svg className="animate-spin h-5 w-5 text-ink" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                  </svg>
                                  <span className="text-ink font-medium text-sm">Analyzing meal patterns...</span>
                                </div>
                              </div>
                            ) : coachingAnalysisData.has(user.user_id) ? (
                              <CoachingAnalysisTable
                                analysis={coachingAnalysisData.get(user.user_id)!}
                                onRefresh={() => onRefreshCoaching(user.user_id)}
                              />
                            ) : null
                          ) : (
                            <div className="overflow-x-auto">
                              <div className="flex gap-6 min-w-max">
                                {/* Render each day */}
                                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayName, idx) => {
                                  const date = addDays(weekStart, idx);
                                  const dateStr = format(date, 'yyyy-MM-dd');
                                  const entries = expandedRowsData.get(user.user_id)?.[dateStr] || [];
                                  const viewMode = expandedRowViewMode.get(user.user_id) || 'table';

                                  return (
                                    <DayTimeline
                                      key={dateStr}
                                      dayName={dayName}
                                      date={date}
                                      entries={entries}
                                      viewMode={viewMode === 'log' ? 'log' : 'table'}
                                      targetCalories={user.target_calories}
                                      targetProtein={user.target_protein}
                                      maintenanceCalories={user.maintenance_calories}
                                      timezone={getTimezone?.(user.user_id)}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
