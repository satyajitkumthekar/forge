/**
 * ReflectionStep - renders one step of the morning practice flow.
 * Presentational: choice steps answer on tap, text steps on Continue,
 * terminal info steps close via onFinish.
 */

import React, { useState } from 'react';
import Button from '@/components/ui/Button';
import type { ReflectionCtx, Step } from './flow';

interface ReflectionStepProps {
  step: Step;
  ctx: ReflectionCtx;
  /** Saved free-text answers, for prefill when resuming */
  answers: Record<string, string>;
  saving: boolean;
  onAnswer: (step: Step, answer: string) => void;
  onFinish: (step: Step) => void;
}

export default function ReflectionStep({
  step,
  ctx,
  answers,
  saving,
  onAnswer,
  onFinish,
}: ReflectionStepProps) {
  const [draft, setDraft] = useState(answers[step.id] ?? '');

  const handleContinue = () => {
    if (step.terminal) {
      onFinish(step);
      return;
    }
    if (step.kind === 'text') {
      onAnswer(step, draft.trim());
      return;
    }
    onAnswer(step, '');
  };

  return (
    <div className="animate-fade-in">
      <p
        className={`text-lg font-semibold tracking-tight text-ink leading-snug ${
          step.hint ? 'mb-1.5' : 'mb-5'
        }`}
      >
        {step.prompt(ctx)}
      </p>
      {step.hint && (
        <p className="text-xs text-ink-muted leading-relaxed mb-5">{step.hint}</p>
      )}

      {step.kind === 'choice' && step.options && (
        <div className="space-y-2">
          {step.options.map((option) => (
            <Button
              key={option.value}
              variant="secondary"
              fullWidth
              disabled={saving}
              onClick={() => onAnswer(step, option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}

      {step.kind === 'text' && (
        <div className="space-y-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={step.placeholder ?? 'Type it out. A sentence is enough'}
            rows={3}
            autoFocus
            className="w-full px-3 py-2.5 text-base border border-line-strong rounded-ctrl bg-paper-raised text-ink font-medium placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-ink-muted resize-none"
          />
          <Button fullWidth disabled={saving || draft.trim().length === 0} onClick={handleContinue}>
            Continue
          </Button>
        </div>
      )}

      {step.kind === 'info' && (
        <Button fullWidth disabled={saving} onClick={handleContinue}>
          {step.continueLabel ?? 'Continue'}
        </Button>
      )}
    </div>
  );
}
