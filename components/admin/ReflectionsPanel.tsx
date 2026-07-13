/**
 * ReflectionsPanel - full-screen per-client reflections surface (the coach's
 * DECODE material). Same takeover pattern as CookbookPanel, opened from the
 * expanded CoachTable row or a day marker.
 *
 * Organized as ledgers mirroring the practice's three-way fork:
 *   Wins ledger    - smooth wins, wins with resistance, showed up on a miss
 *   Friction ledger - knowledge gap, out of control, knew but didn't do it
 *   Day ledger     - every day with its full question-and-answer transcript
 * Month view adds the three-line trajectory.
 * ABSTRACTION: Uses db.reflections admin APIs, never calls Supabase directly.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { format } from 'date-fns';
import { db } from '@/lib/database';
import { toast } from '@/lib/toast';
import { appToday, addDaysYMD, parseYMD } from '@/utils/date';
import { getWeekStart, formatWeekRange } from '@/utils/weekly-stats';
import Button from '@/components/ui/Button';
import SegmentedControl from '@/components/admin/SegmentedControl';
import WeekSelector from '@/components/admin/WeekSelector';
import TrajectoryChart from '@/components/admin/TrajectoryChart';
import { SkeletonRow } from '@/components/ui/Skeleton';
import { transcriptFor } from '@/components/reflection/flow';
import type { DailyReflection, ReflectionStatus, ReflectionVerdict } from '@/types';

interface ReflectionsPanelProps {
  userId: string;
  email: string;
  fullName?: string | null;
  /** Opens with this day's transcript expanded (from a ledger "view" marker) */
  focusDate?: string | null;
  onClose: () => void;
}

type Period = 'week' | 'month';

const VERDICT_LABEL: Record<ReflectionVerdict, string> = {
  success: 'Win',
  fail_calories: 'Calories missed',
  fail_protein: 'Protein missed',
  fail_both: 'Both missed',
};

const STATUS_LABEL: Record<ReflectionStatus, string> = {
  pending: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  incomplete: 'Incomplete log',
  missed: 'Practice missed',
};

const verdictChipClass = (verdict: ReflectionVerdict) =>
  verdict === 'success'
    ? 'bg-accent-100 text-accent-700'
    : 'bg-danger-soft text-danger';

const statusChipClass = (status: ReflectionStatus) => {
  switch (status) {
    case 'completed':
      return 'bg-accent-100 text-accent-700';
    case 'incomplete':
      return 'bg-warn-soft text-warn';
    case 'missed':
      return 'bg-paper-inset text-ink-muted';
    default:
      return 'bg-paper-inset text-ink-soft';
  }
};

const dayLabel = (date: string) =>
  parseYMD(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

const sectionCardClass = 'bg-paper-raised rounded-card border border-line shadow-card p-5';

/** Subsection header: name + colored count chip */
function GroupHeader({ label, count, chipClass, note }: { label: string; count: number; chipClass: string; note?: string }) {
  return (
    <div className="mb-1.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-ink">{label}</span>
        <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${chipClass}`}>
          ×{count}
        </span>
      </div>
      {note && <p className="text-xs text-ink-muted mt-0.5">{note}</p>}
    </div>
  );
}

export default function ReflectionsPanel({ userId, email, fullName, focusDate, onClose }: ReflectionsPanelProps) {
  const { width: windowWidth } = useWindowDimensions();
  const chartWidth = Math.min(windowWidth - 140, 620);

  const [period, setPeriod] = useState<Period>('week');
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => getWeekStart(focusDate ?? appToday()));
  const [monthAnchor, setMonthAnchor] = useState<string>(() => (focusDate ?? appToday()).slice(0, 7));
  const [rows, setRows] = useState<DailyReflection[] | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(focusDate ?? null);

  const range = useMemo(() => {
    if (period === 'week') {
      const start = format(weekAnchor, 'yyyy-MM-dd');
      return { start, end: addDaysYMD(start, 6), label: formatWeekRange(weekAnchor) };
    }
    const [year, month] = monthAnchor.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return {
      start: `${monthAnchor}-01`,
      end: `${monthAnchor}-${String(lastDay).padStart(2, '0')}`,
      label: parseYMD(`${monthAnchor}-01`).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
    };
  }, [period, weekAnchor, monthAnchor]);

  useEffect(() => {
    let cancelled = false;
    setRows(null);

    db.reflections
      .adminForClient(userId, range.start, range.end)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        console.error('[Reflections] Error loading:', err);
        toast.error('Failed to load reflections');
        if (!cancelled) setRows([]);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, range.start, range.end]);

  // ---- Bucket the period's rows the same way the fork does ----
  const completed = useMemo(() => (rows ?? []).filter((r) => r.status === 'completed'), [rows]);
  const wins = completed.filter((r) => r.verdict === 'success');
  const fails = completed.filter((r) => r.verdict !== 'success');
  const smoothWins = wins.filter((r) => r.path === 'smooth');
  const foughtWins = wins.filter((r) => r.path === 'moments');
  const knowledgeRows = fails.filter((r) => r.fail_reason === 'didnt_know');
  // Legacy no_time_access rows (old two-level fork) fold into out of control
  const outControlRows = fails.filter((r) => r.path === 'couldnt' && r.fail_reason !== 'didnt_know');
  const wouldntRows = fails.filter((r) => r.path === 'wouldnt');
  const smallerWins = fails.filter((r) => r.showed_up === true && r.answers?.part2_moment);
  const incompleteCount = (rows ?? []).filter((r) => r.status === 'incomplete').length;
  const missedCount = (rows ?? []).filter((r) => r.status === 'missed').length;

  // Month view: completed fails bucketed by week for the trajectory
  const trajectory = useMemo(() => {
    if (period !== 'month' || !rows) return null;
    const weeks = new Map<string, { outControl: number; knowledge: number; wouldnt: number }>();
    let cursor = format(getWeekStart(range.start), 'yyyy-MM-dd');
    while (cursor <= range.end) {
      weeks.set(cursor, { outControl: 0, knowledge: 0, wouldnt: 0 });
      cursor = addDaysYMD(cursor, 7);
    }
    for (const row of rows) {
      if (row.status !== 'completed' || row.verdict === 'success') continue;
      const week = format(getWeekStart(row.reflection_date), 'yyyy-MM-dd');
      const bucket = weeks.get(week);
      if (!bucket) continue;
      if (row.path === 'wouldnt') bucket.wouldnt++;
      else if (row.fail_reason === 'didnt_know') bucket.knowledge++;
      else if (row.path === 'couldnt') bucket.outControl++;
    }
    const keys = [...weeks.keys()].sort();
    const series = (pick: (b: { outControl: number; knowledge: number; wouldnt: number }) => number) =>
      keys.map((k) => ({ value: pick(weeks.get(k)!), label: format(parseYMD(k), 'M/d') }));
    return {
      outControl: series((b) => b.outControl),
      knowledge: series((b) => b.knowledge),
      wouldnt: series((b) => b.wouldnt),
    };
  }, [period, rows, range.start, range.end]);

  const atCurrentPeriod =
    period === 'week'
      ? format(weekAnchor, 'yyyy-MM-dd') === format(getWeekStart(appToday()), 'yyyy-MM-dd')
      : monthAnchor === appToday().slice(0, 7);

  const navigatePeriod = (direction: number) => {
    if (period === 'week') {
      const next = new Date(weekAnchor);
      next.setDate(next.getDate() + direction * 7);
      if (direction > 0 && format(next, 'yyyy-MM-dd') > format(getWeekStart(appToday()), 'yyyy-MM-dd')) return;
      setWeekAnchor(next);
    } else {
      const [year, month] = monthAnchor.split('-').map(Number);
      const d = new Date(year, month - 1 + direction, 1);
      const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (direction > 0 && next > appToday().slice(0, 7)) return;
      setMonthAnchor(next);
    }
  };

  const goToCurrentPeriod = () => {
    if (period === 'week') setWeekAnchor(getWeekStart(appToday()));
    else setMonthAnchor(appToday().slice(0, 7));
  };

  const summaryTiles = [
    { label: 'Wins', value: wins.length },
    { label: 'Out of control', value: outControlRows.length },
    { label: 'Knowledge gaps', value: knowledgeRows.length },
    { label: "Could but didn't", value: wouldntRows.length },
    { label: 'Incomplete', value: incompleteCount },
    { label: 'Missed', value: missedCount },
  ];

  return (
    <div className="fixed inset-0 z-[60] bg-paper overflow-y-auto">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 px-4 py-3 bg-paper/85 backdrop-blur-md border-b border-line/70">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-ink">Reflections</h2>
            <p className="text-[11px] text-ink-muted truncate">
              {fullName ? `${fullName} · ${email}` : email}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SegmentedControl
              options={[
                { value: 'week', label: 'Week' },
                { value: 'month', label: 'Month' },
              ]}
              value={period}
              onChange={(v) => setPeriod(v as Period)}
            />
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4 pb-12">
        <WeekSelector
          label={range.label}
          isCurrentWeek={atCurrentPeriod}
          onPrev={() => navigatePeriod(-1)}
          onNext={() => navigatePeriod(1)}
          onGoToCurrent={goToCurrentPeriod}
          currentLabel={period === 'week' ? 'Current Week' : 'Current Month'}
        />

        {rows === null ? (
          <div className={sectionCardClass}>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : rows.length === 0 ? (
          <div className={`${sectionCardClass} text-center py-10`}>
            <p className="text-sm text-ink-muted">No reflections in this period.</p>
          </div>
        ) : (
          <>
            {/* Summary tiles */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {summaryTiles.map((tile) => (
                <div
                  key={tile.label}
                  className="bg-paper-raised rounded-card border border-line shadow-card px-3 py-2.5 text-center"
                >
                  <div className="text-lg font-semibold tracking-tight text-ink tabular-nums">
                    {tile.value}
                  </div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
                    {tile.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Trajectory (month view) */}
            {period === 'month' && trajectory && (
              <div className={sectionCardClass}>
                <h3 className="text-sm font-semibold tracking-tight text-ink mb-1">Trajectory</h3>
                <p className="text-xs text-ink-muted mb-4">
                  Healthy arc: the friction lines shrink as your clearing lands, then
                  could-but-didn&apos;t shrinks as the inner work lands.
                </p>
                <TrajectoryChart
                  outControl={trajectory.outControl}
                  knowledge={trajectory.knowledge}
                  wouldnt={trajectory.wouldnt}
                  width={chartWidth}
                />
              </div>
            )}

            {/* Wins ledger */}
            {(wins.length > 0 || smallerWins.length > 0) && (
              <div className={sectionCardClass}>
                <h3 className="text-sm font-semibold tracking-tight text-ink mb-1">Wins ledger</h3>
                <p className="text-xs text-ink-muted mb-4">Every win, banked. Identity reps.</p>
                <div className="space-y-5">
                  {smoothWins.length > 0 && (
                    <div>
                      <GroupHeader label="Smooth wins" count={smoothWins.length} chipClass="bg-accent-100 text-accent-700" />
                      <div className="space-y-1.5">
                        {smoothWins.map((row) => (
                          <div key={row.id} className="text-xs text-ink-soft">
                            <span className="text-ink-muted tabular-nums">{dayLabel(row.reflection_date)}</span>
                            {row.answers?.smooth_q1 && (
                              <span>: &ldquo;{row.answers.smooth_q1}&rdquo;</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {foughtWins.length > 0 && (
                    <div>
                      <GroupHeader label="Wins with resistance" count={foughtWins.length} chipClass="bg-accent-100 text-accent-700" />
                      <div className="space-y-3">
                        {foughtWins.map((row) => (
                          <div key={row.id} className="border-l-2 border-accent-500/40 pl-3">
                            <div className="text-[11px] text-ink-muted tabular-nums mb-0.5">
                              {dayLabel(row.reflection_date)}
                            </div>
                            <div className="space-y-1 text-sm text-ink">
                              {row.answers?.moments_q1 && <p>{row.answers.moments_q1}</p>}
                              {row.answers?.moments_q2 && (
                                <p>
                                  <span className="text-ink-muted">Felt:</span> {row.answers.moments_q2}
                                </p>
                              )}
                              {row.answers?.moments_q3 && (
                                <p>
                                  <span className="text-ink-muted">Why:</span> {row.answers.moments_q3}
                                </p>
                              )}
                              {row.answers?.moments_q4 && (
                                <p>
                                  <span className="text-ink-muted">To keep it:</span> {row.answers.moments_q4}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {smallerWins.length > 0 && (
                    <div>
                      <GroupHeader label="Showed up on a miss" count={smallerWins.length} chipClass="bg-accent-100 text-accent-700" />
                      <div className="space-y-1.5">
                        {smallerWins.map((row) => (
                          <div key={row.id} className="text-xs text-ink-soft">
                            <span className="text-ink-muted tabular-nums">{dayLabel(row.reflection_date)}</span>
                            <span>: &ldquo;{row.answers.part2_moment}&rdquo;</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Friction ledger */}
            {fails.length > 0 && (
              <div className={sectionCardClass}>
                <h3 className="text-sm font-semibold tracking-tight text-ink mb-1">Friction ledger</h3>
                <p className="text-xs text-ink-muted mb-4">
                  Every miss, sorted by what actually got in the way.
                </p>
                <div className="space-y-5">
                  {knowledgeRows.length > 0 && (
                    <div>
                      <GroupHeader
                        label="Knowledge gap"
                        count={knowledgeRows.length}
                        chipClass="bg-alert-soft text-alert"
                        note="Cookbook material for you."
                      />
                      <div className="space-y-2">
                        {knowledgeRows.map((row) => (
                          <div key={row.id} className="text-xs text-ink-soft space-y-0.5">
                            <div className="text-ink-muted tabular-nums">{dayLabel(row.reflection_date)}</div>
                            {row.answers?.couldnt_challenge && (
                              <p>
                                <span className="font-semibold text-ink">Challenge:</span>{' '}
                                &ldquo;{row.answers.couldnt_challenge}&rdquo;
                              </p>
                            )}
                            {row.answers?.couldnt_plan && (
                              <p>
                                <span className="font-semibold text-ink">Plan:</span>{' '}
                                &ldquo;{row.answers.couldnt_plan}&rdquo;
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {outControlRows.length > 0 && (
                    <div>
                      <GroupHeader
                        label="Out of control"
                        count={outControlRows.length}
                        chipClass="bg-warn-soft text-warn"
                      />
                      <div className="space-y-2">
                        {outControlRows.map((row) => (
                          <div key={row.id} className="text-xs text-ink-soft space-y-0.5">
                            <div className="text-ink-muted tabular-nums">{dayLabel(row.reflection_date)}</div>
                            {row.answers?.couldnt_challenge && (
                              <p>
                                <span className="font-semibold text-ink">Challenge:</span>{' '}
                                &ldquo;{row.answers.couldnt_challenge}&rdquo;
                              </p>
                            )}
                            {row.answers?.couldnt_plan && (
                              <p>
                                <span className="font-semibold text-ink">Plan:</span>{' '}
                                &ldquo;{row.answers.couldnt_plan}&rdquo;
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {wouldntRows.length > 0 && (
                    <div>
                      <GroupHeader
                        label="Knew but didn't do it"
                        count={wouldntRows.length}
                        chipClass="bg-danger-soft text-danger"
                      />
                      <div className="space-y-3">
                        {wouldntRows.map((row) => (
                          <div key={row.id} className="border-l-2 border-danger/30 pl-3">
                            <p className="text-sm text-ink italic">
                              &ldquo;{row.answers?.wouldnt_thought ?? '…'}&rdquo;
                            </p>
                            <div className="mt-1 text-[11px] text-ink-muted tabular-nums">
                              {dayLabel(row.reflection_date)}
                            </div>
                            <div className="mt-1.5 space-y-1 text-xs text-ink-soft">
                              {row.answers?.wouldnt_feel && (
                                <p>
                                  <span className="font-semibold text-ink">Feels now:</span>{' '}
                                  {row.answers.wouldnt_feel}
                                </p>
                              )}
                              {row.answers?.wouldnt_why && (
                                <p>
                                  <span className="font-semibold text-ink">Why:</span>{' '}
                                  {row.answers.wouldnt_why}
                                </p>
                              )}
                              {row.answers?.wouldnt_redo && (
                                <p>
                                  <span className="font-semibold text-ink">Redo:</span>{' '}
                                  {row.answers.wouldnt_redo}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Day ledger */}
            <div className={sectionCardClass}>
              <h3 className="text-sm font-semibold tracking-tight text-ink mb-4">Day ledger</h3>
              <div className="divide-y divide-line/60">
                {rows.map((row) => {
                  const isExpanded = expandedDay === row.reflection_date;
                  return (
                    <div key={row.id} className="py-2.5 first:pt-0 last:pb-0">
                      <button
                        onClick={() => setExpandedDay(isExpanded ? null : row.reflection_date)}
                        className="w-full flex items-center justify-between gap-2 text-left"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <span className="text-sm font-medium text-ink tabular-nums">
                            {dayLabel(row.reflection_date)}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[11px] font-semibold ${verdictChipClass(row.verdict)}`}
                          >
                            {VERDICT_LABEL[row.verdict]}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[11px] font-semibold ${statusChipClass(row.status)}`}
                          >
                            {STATUS_LABEL[row.status]}
                          </span>
                        </div>
                        <svg
                          className={`w-4 h-4 text-ink-muted flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>

                      {isExpanded && (
                        <div className="mt-3 space-y-2.5 animate-fade-in">
                          <div className="text-xs text-ink-muted tabular-nums">
                            {row.total_calories.toLocaleString('en-US')} cal ·{' '}
                            {Number(row.total_protein)}g protein (target {row.target_calories} /{' '}
                            {row.target_protein}g)
                          </div>
                          {row.status === 'missed' || row.status === 'pending' ? (
                            <p className="text-xs text-ink-muted">The practice wasn&apos;t completed for this day.</p>
                          ) : (
                            transcriptFor(row).map((line, index) => (
                              <div key={index}>
                                <p className="text-xs text-ink-muted">{line.prompt}</p>
                                {line.answer !== null && (
                                  <p className="text-sm text-ink mt-0.5">{line.answer}</p>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
