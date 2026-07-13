/**
 * useReflection - orchestration for the morning practice.
 *
 * Owns the active reflection row, the current step, and the in-flight
 * answers. Every answer advances optimistically and saves to the row
 * (the row IS the saved progress — resume is free); a failed save rolls
 * back to the same step with a toast.
 * ABSTRACTION: Uses db.* and cache.* APIs, never calls Supabase directly.
 */

import { useCallback, useState } from 'react';
import { db, type ReflectionProgressPatch } from '@/lib/database';
import { getCached, setCached, invalidate, CACHE_KEYS } from '@/lib/enhanced-cache';
import { toast } from '@/lib/toast';
import {
  CLOSE_INCOMPLETE,
  FLOW,
  buildCtx,
  entryStep,
  resolveNext,
  type ReflectionCtx,
  type Step,
} from './flow';
import type { DailyReflection, ReflectionPath } from '@/types';

const isLive = (row: DailyReflection | null): row is DailyReflection =>
  !!row && (row.status === 'pending' || row.status === 'in_progress');

export function useReflection() {
  const [reflection, setReflection] = useState<DailyReflection | null>(null);
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Optimistic copies of the fork answers so close-step prompts word
  // themselves correctly even before the save round-trip lands
  const [localPath, setLocalPath] = useState<ReflectionPath | null>(null);
  const [localShowedUp, setLocalShowedUp] = useState<boolean | null>(null);

  const hydrate = useCallback((row: DailyReflection, open: boolean) => {
    setReflection(row);
    setAnswers(row.answers ?? {});
    setLocalPath(row.path);
    setLocalShowedUp(row.showed_up);
    // current_step is the resume point; a fresh row starts at the entry
    const resumeAt =
      row.current_step && FLOW[row.current_step] ? row.current_step : entryStep(buildCtx(row));
    setCurrentStepId(resumeAt);
    if (open) setModalOpen(true);
  }, []);

  /**
   * Get-or-create the reflection for a date and open the modal if one is
   * live. Returns whether the practice fired (the popup chain stops there).
   */
  const check = useCallback(
    async (reflectionDate: string): Promise<boolean> => {
      // Paint the banner instantly from cache while the RPC revalidates
      const cached = getCached<DailyReflection>(CACHE_KEYS.reflection);
      if (isLive(cached) && cached.reflection_date === reflectionDate) {
        hydrate(cached, false);
      }

      const row = await db.reflections.start(reflectionDate);
      if (!isLive(row)) {
        setReflection(null);
        setModalOpen(false);
        setCurrentStepId(null);
        invalidate(CACHE_KEYS.reflection);
        return false;
      }

      setCached(CACHE_KEYS.reflection, row);
      hydrate(row, true);
      return true;
    },
    [hydrate]
  );

  /** Answer the current step: advance optimistically, then persist */
  const answerStep = useCallback(
    async (step: Step, answer: string) => {
      if (!reflection || saving) return;

      const ctx = buildCtx(reflection, { path: localPath, showedUp: localShowedUp });
      const patch: ReflectionProgressPatch = { status: 'in_progress' };
      if (!reflection.started_at) {
        patch.started_at = new Date().toISOString(); // verdict freezes here
      }

      const prevAnswers = answers;
      let nextAnswers = answers;
      if (step.saveText) {
        nextAnswers = { ...answers, [step.id]: answer };
        patch.answers = nextAnswers;
      }

      if (step.saveColumn) {
        switch (step.saveColumn) {
          case 'path':
            patch.path = answer as ReflectionPath;
            setLocalPath(answer as ReflectionPath);
            break;
          case 'showed_up':
            patch.showed_up = answer === 'yes';
            setLocalShowedUp(answer === 'yes');
            break;
          case 'logging_complete':
            patch.logging_complete = answer === 'yes';
            break;
        }
      }

      // Options can write extra structured columns (the three-way miss fork
      // sets both path and fail_reason in one tap)
      const chosenOption =
        step.kind === 'choice' ? step.options?.find((o) => o.value === answer) : undefined;
      if (chosenOption?.writes) {
        if (chosenOption.writes.path !== undefined) {
          patch.path = chosenOption.writes.path;
          setLocalPath(chosenOption.writes.path);
        }
        if (chosenOption.writes.fail_reason !== undefined) {
          patch.fail_reason = chosenOption.writes.fail_reason;
        }
      }

      const nextId = resolveNext(step, ctx, answer);

      // Pre-check answered "no, I didn't log it all": the practice ends
      // right here — no extra screen. closeIncomplete sets the flag,
      // status and timestamps in one write.
      if (nextId === CLOSE_INCOMPLETE) {
        setSaving(true);
        try {
          await db.reflections.closeIncomplete(reflection.id);
          setReflection(null);
          setModalOpen(false);
          setCurrentStepId(null);
          invalidate(CACHE_KEYS.reflection);
        } catch (err) {
          console.error('Error closing incomplete reflection:', err);
          toast.error("Couldn't save. Check your connection and try again.");
        } finally {
          setSaving(false);
        }
        return;
      }

      patch.current_step = nextId;

      const prevStepId = currentStepId;
      setAnswers(nextAnswers);
      setCurrentStepId(nextId);

      setSaving(true);
      try {
        const updated = await db.reflections.saveProgress(reflection.id, patch);
        setReflection(updated);
        setCached(CACHE_KEYS.reflection, updated);
      } catch (err) {
        console.error('Error saving reflection step:', err);
        setAnswers(prevAnswers);
        setCurrentStepId(prevStepId);
        toast.error("Couldn't save. Check your connection and try again.");
      } finally {
        setSaving(false);
      }
    },
    [reflection, saving, answers, currentStepId, localPath, localShowedUp]
  );

  /** Terminal steps' Done button — the only thing that clears the practice */
  const finishStep = useCallback(
    async (step: Step) => {
      if (!reflection || !step.terminal || saving) return;

      setSaving(true);
      try {
        if (step.terminal === 'completed') {
          await db.reflections.complete(reflection.id);
        } else {
          await db.reflections.closeIncomplete(reflection.id);
        }
        setReflection(null);
        setModalOpen(false);
        setCurrentStepId(null);
        invalidate(CACHE_KEYS.reflection);
      } catch (err) {
        console.error('Error completing reflection:', err);
        toast.error("Couldn't save. Check your connection and try again.");
      } finally {
        setSaving(false);
      }
    },
    [reflection, saving]
  );

  const ctx: ReflectionCtx | null = reflection
    ? buildCtx(reflection, { path: localPath, showedUp: localShowedUp })
    : null;
  const step: Step | null = currentStepId ? (FLOW[currentStepId] ?? null) : null;

  return {
    reflection,
    /** A live (pending/in_progress) reflection exists — the banner shows */
    isActive: isLive(reflection),
    modalOpen,
    step,
    ctx,
    answers,
    saving,
    check,
    openModal: () => setModalOpen(true),
    dismiss: () => setModalOpen(false),
    answerStep,
    finishStep,
  };
}
