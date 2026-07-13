/**
 * TestPracticeSheet - admin-only scenario menu for testing the morning
 * practice end-to-end. Presentational (CalendarSheet skeleton); the Track
 * screen owns the seeding/reset/re-fire logic and passes it in via onRun.
 */

import React from 'react';

export type TestScenarioKey =
  | 'win'
  | 'fail_calories'
  | 'fail_protein'
  | 'fail_both'
  | 'suspicious_low'
  | 'unlogged'
  | 'reset_only';

interface TestScenario {
  key: TestScenarioKey;
  label: string;
  description: string;
}

const SCENARIOS: TestScenario[] = [
  { key: 'win', label: 'Win day', description: 'Calories on target, protein above floor → win fork' },
  { key: 'fail_calories', label: 'Calorie miss', description: 'Calories break the limit, protein passes' },
  { key: 'fail_protein', label: 'Protein miss', description: 'Calories pass, protein under the floor' },
  { key: 'fail_both', label: 'Both miss', description: 'Calories and protein both miss' },
  { key: 'suspicious_low', label: 'Suspicious low', description: 'Way under target → "did you log everything?" pre-check' },
  { key: 'unlogged', label: 'Unlogged day', description: 'Clears yesterday. No practice should fire' },
  { key: 'reset_only', label: 'Just reset', description: "Keep yesterday's real log, re-fire the practice" },
];

interface TestPracticeSheetProps {
  open: boolean;
  onClose: () => void;
  /** Scenario currently running, or null */
  running: TestScenarioKey | null;
  onRun: (key: TestScenarioKey) => void;
}

export default function TestPracticeSheet({ open, onClose, running, onRun }: TestPracticeSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Test practice">
      <div className="absolute inset-0 bg-ink/40 animate-fade-in" onClick={onClose} />

      <div className="absolute bottom-0 left-0 right-0">
        <div
          className="max-w-md mx-auto bg-paper-raised rounded-t-card shadow-overlay animate-sheet-up"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="w-9 h-1 rounded-full bg-line-strong mx-auto mt-2" />

          <div className="px-5 pt-3 pb-2">
            <h2 className="text-sm font-semibold tracking-tight text-ink">Test practice</h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Presets replace yesterday&apos;s log on this account, then re-fire the practice.
            </p>
          </div>

          <div className="px-3 pb-4 space-y-1">
            {SCENARIOS.map((scenario) => (
              <button
                key={scenario.key}
                onClick={() => onRun(scenario.key)}
                disabled={running !== null}
                className={`w-full text-left px-3 py-2.5 rounded-ctrl transition duration-150 ${
                  running !== null
                    ? 'opacity-50 cursor-wait'
                    : 'hover:bg-paper-inset active:bg-paper-deep'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink">{scenario.label}</span>
                  {running === scenario.key && (
                    <span className="text-xs text-ink-muted">Running…</span>
                  )}
                </div>
                <div className="text-xs text-ink-muted mt-0.5">{scenario.description}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
