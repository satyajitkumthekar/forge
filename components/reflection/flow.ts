/**
 * Reflection Flow - the declarative step graph for the morning practice.
 *
 * Pure data + pure functions, no React. One renderer (ReflectionStep) walks
 * this map; branching lives in the data, and the DB row's current_step is a
 * key into it — resume after an interruption is a lookup, not a replay.
 *
 * The two paths:
 *   SUCCESS → success_fork → smooth (1 question) | moments (4-question excavation)
 *   FAIL    → fail_opener → one three-way fork:
 *             out of my control / knowledge gap (2 questions) | wouldn't (4 questions)
 *             → part 2, always: the smaller win
 * Plus a pre-check when the day's log looks suspiciously light.
 *
 * Every question carries a faint `hint` that sets the expectation: nudge
 * toward honest, specific answers instead of one-worders.
 */

import type {
  DailyReflection,
  ReflectionFailReason,
  ReflectionGoalType,
  ReflectionPath,
  ReflectionVerdict,
} from '@/types';

export type StepKind = 'info' | 'choice' | 'text';

/** Everything a prompt needs to word itself (goal- and verdict-aware) */
export interface ReflectionCtx {
  verdict: ReflectionVerdict;
  goalType: ReflectionGoalType;
  suspiciousLow: boolean;
  path: ReflectionPath | null;
  showedUp: boolean | null;
  totalCalories: number;
  totalProtein: number;
  targetCalories: number;
  targetProtein: number;
}

/** Structured columns a choice step can write (mirrors ReflectionProgressPatch) */
export type StepSaveColumn = 'path' | 'showed_up' | 'logging_complete';

export interface StepOption {
  /** For enum columns this IS the stored value; for boolean columns 'yes'/'no' */
  value: string;
  label: string;
  next: string;
  /** Extra structured columns this option writes (the three-way miss fork
   *  sets both path and fail_reason in one tap) */
  writes?: { path?: ReflectionPath; fail_reason?: ReflectionFailReason };
}

export interface Step {
  id: string;
  kind: StepKind;
  prompt: (ctx: ReflectionCtx) => string;
  /** Faint subtext under the prompt: what a good answer looks like */
  hint?: string;
  options?: StepOption[];
  /** info/text steps advance here */
  next?: string;
  /** choice steps: which structured column the selection writes */
  saveColumn?: StepSaveColumn;
  /** choice steps whose answer isn't a single column: read it back off the
   *  row for the coach's transcript replay */
  readStored?: (row: DailyReflection) => string | null;
  /** text steps: the answer is saved into answers[step.id] */
  saveText?: boolean;
  placeholder?: string;
  continueLabel?: string;
  /** Reaching this step ends the flow (its button performs the close) */
  terminal?: 'completed' | 'incomplete';
}

/**
 * Option.next tokens resolved at runtime:
 * - VERDICT_ENTRY: the pre-check's "yes, log is complete" continues into
 *   whichever path the verdict dictates
 * - CLOSE_INCOMPLETE: the pre-check's "no" ends the practice immediately,
 *   no extra screen — the day is marked incomplete
 */
export const VERDICT_ENTRY = '@verdict';
export const CLOSE_INCOMPLETE = '@close_incomplete';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const fmtProtein = (n: number) => `${Math.round(n * 10) / 10}g`;

/** The fail opener states what the app already knows, in the goal's direction */
const failOpener = (ctx: ReflectionCtx): string => {
  const calorieLimit =
    ctx.goalType === 'cut'
      ? Math.round(ctx.targetCalories * 1.05)
      : Math.round(ctx.targetCalories * 0.95);
  const calorieClause =
    ctx.goalType === 'cut'
      ? `calories ran over (${fmt(ctx.totalCalories)} against a ${fmt(calorieLimit)} ceiling)`
      : `calories came in under (${fmt(ctx.totalCalories)} against a ${fmt(calorieLimit)} minimum)`;
  const proteinClause = `protein came in under (${fmtProtein(ctx.totalProtein)} against your ${ctx.targetProtein}g target)`;

  if (ctx.verdict === 'fail_both') {
    return `Yesterday didn't land. The ${calorieClause}, and ${proteinClause}.`;
  }
  if (ctx.verdict === 'fail_calories') {
    return `Yesterday didn't land. The ${calorieClause}.`;
  }
  return `Yesterday didn't land. The ${proteinClause}.`;
};

export const FLOW: Record<string, Step> = {
  // ---- Pre-check: only when the day's log looks suspiciously light ----
  precheck: {
    id: 'precheck',
    kind: 'choice',
    prompt: (ctx) =>
      `Before we look at yesterday: the log seems light (${fmt(ctx.totalCalories)} calories). Did you log everything you ate?`,
    saveColumn: 'logging_complete',
    options: [
      { value: 'yes', label: "Yes, that's everything", next: VERDICT_ENTRY },
      { value: 'no', label: "No, I didn't log it all", next: CLOSE_INCOMPLETE },
    ],
  },

  // ---- Path A: the win ----
  success_fork: {
    id: 'success_fork',
    kind: 'choice',
    prompt: () =>
      'Yesterday was a win. Calories and protein both landed. Did any of it take a real fight? A moment you didn’t want to show up, but did anyway?',
    hint: 'A fight counts even if it only lasted a minute. A craving you rode out, a meal you almost skipped.',
    saveColumn: 'path',
    options: [
      { value: 'smooth', label: 'No, it was smooth', next: 'smooth_q1' },
      { value: 'moments', label: 'Yes, there were moments', next: 'moments_q1' },
    ],
  },
  smooth_q1: {
    id: 'smooth_q1',
    kind: 'text',
    prompt: () => "What's one thing today that'll keep it this easy?",
    hint: 'Talk in actions. What was the best action you took yesterday that made it this easy?',
    saveText: true,
    next: 'success_close',
  },
  moments_q1: {
    id: 'moments_q1',
    kind: 'text',
    prompt: () => 'Which moment? What was the resistance, and what did you do anyway?',
    hint: 'Set the scene. Where were you, what did the pull feel like, what did you do instead?',
    saveText: true,
    next: 'moments_q2',
  },
  moments_q2: {
    id: 'moments_q2',
    kind: 'text',
    prompt: () => 'How did you feel after?',
    hint: 'A feeling, not a fact. Proud, relieved, in control, calm. Whatever it actually was.',
    saveText: true,
    next: 'moments_q3',
  },
  moments_q3: {
    id: 'moments_q3',
    kind: 'text',
    prompt: () =>
      'Why did it feel that way? Don’t stop at “because I got it done”. Go deeper. What was it really about?',
    hint: 'One layer under the obvious. What does that moment say about who you’re becoming?',
    saveText: true,
    next: 'moments_q4',
  },
  moments_q4: {
    id: 'moments_q4',
    kind: 'text',
    prompt: () => 'What do you need to do to keep feeling that way?',
    hint: 'Think conditions, not willpower. What sets today up so that feeling shows up again?',
    saveText: true,
    next: 'success_close',
  },
  success_close: {
    id: 'success_close',
    kind: 'info',
    prompt: (ctx) =>
      ctx.path === 'moments'
        ? "That's an identity rep. Banked. See you tomorrow."
        : 'Green day banked. See you tomorrow.',
    continueLabel: 'Done',
    terminal: 'completed',
  },

  // ---- Path B: the miss ----
  fail_opener: {
    id: 'fail_opener',
    kind: 'info',
    prompt: failOpener,
    hint: 'Every miss is feedback. Let’s see what happened.',
    continueLabel: "Let's look at it",
    next: 'fail_fork',
  },
  fail_fork: {
    id: 'fail_fork',
    kind: 'choice',
    prompt: () => "Why weren't you able to hit your targets yesterday?",
    hint: 'Be honest. These three need very different fixes.',
    readStored: (row) =>
      row.path === 'wouldnt' ? 'wouldnt' : row.path === 'couldnt' ? row.fail_reason : null,
    options: [
      {
        value: 'outside_control',
        label: 'Something out of my control. There was nothing I could do',
        writes: { path: 'couldnt', fail_reason: 'outside_control' },
        next: 'couldnt_challenge',
      },
      {
        value: 'didnt_know',
        label: "I wanted to, but I didn't know what to do. A knowledge gap",
        writes: { path: 'couldnt', fail_reason: 'didnt_know' },
        next: 'couldnt_challenge',
      },
      {
        value: 'wouldnt',
        label: "I knew what to do, could have done it, and didn't",
        writes: { path: 'wouldnt' },
        next: 'wouldnt_thought',
      },
    ],
  },

  // Couldn't: friction or a knowledge gap — the coach's territory
  couldnt_challenge: {
    id: 'couldnt_challenge',
    kind: 'text',
    prompt: () => 'What exactly was the challenge?',
    hint: 'Set the exact scene. What you thought would happen, and what ended up happening.',
    saveText: true,
    next: 'couldnt_plan',
  },
  couldnt_plan: {
    id: 'couldnt_plan',
    kind: 'text',
    prompt: () =>
      'Could you have planned better around it, or asked your coach for help? In what sense?',
    hint: 'If nothing was possible, say so. If there was a move, name it.',
    saveText: true,
    next: 'part2_fork',
  },

  // Wouldn't: the internal dialogue — mirror the win excavation
  wouldnt_thought: {
    id: 'wouldnt_thought',
    kind: 'text',
    prompt: () =>
      'Take me into that moment. What was the exact situation, and what was the exact thought process?',
    hint: 'Set the exact scene, and the actual words in your head. “One night won’t matter” hits different once you see it written down.',
    saveText: true,
    next: 'wouldnt_feel',
  },
  wouldnt_feel: {
    id: 'wouldnt_feel',
    kind: 'text',
    prompt: () => 'How do you feel about it now?',
    hint: 'Any regret or guilt? Relief? Nothing at all? Name whatever is actually there.',
    saveText: true,
    next: 'wouldnt_why',
  },
  wouldnt_why: {
    id: 'wouldnt_why',
    kind: 'text',
    prompt: () => 'Why do you feel this way?',
    hint: 'Go one layer under. What does this feeling say about who you’re trying to become?',
    saveText: true,
    next: 'wouldnt_redo',
  },
  wouldnt_redo: {
    id: 'wouldnt_redo',
    kind: 'text',
    prompt: () => 'If you had a redo of that situation, would you handle it differently? How so?',
    hint: 'Play it back. Same trigger, what’s the different move?',
    saveText: true,
    next: 'part2_fork',
  },

  // Part 2 — always after a fail: never end on a purely negative note
  part2_fork: {
    id: 'part2_fork',
    kind: 'choice',
    prompt: () =>
      'Now the flip side. Even on a day that didn’t hit, was there a moment you showed up when you didn’t want to?',
    hint: 'Even rough days usually have one rep in them. Logging the bad stuff honestly counts.',
    saveColumn: 'showed_up',
    options: [
      { value: 'yes', label: 'Yes', next: 'part2_moment' },
      { value: 'no', label: 'Honestly, no', next: 'part2_carry' },
    ],
  },
  part2_moment: {
    id: 'part2_moment',
    kind: 'text',
    prompt: () => 'Which moment, and what did you tell yourself to do it?',
    hint: 'What you said to yourself matters more than what you did. That’s the voice we’re training.',
    saveText: true,
    next: 'fail_close',
  },
  part2_carry: {
    id: 'part2_carry',
    kind: 'text',
    prompt: () =>
      "Fair. Then what's the one thing you'll carry into today so it goes differently?",
    hint: 'One thing, not a plan. What will you actually do differently today?',
    saveText: true,
    next: 'fail_close',
  },
  fail_close: {
    id: 'fail_close',
    kind: 'info',
    prompt: (ctx) =>
      ctx.showedUp
        ? 'Banked. You showed up. That counts.'
        : 'Good. Carry it into today. See you tomorrow.',
    continueLabel: 'Done',
    terminal: 'completed',
  },
};

/** Where the flow starts, given the verdict (and the suspicious-log pre-check) */
export function entryStep(ctx: ReflectionCtx): string {
  if (ctx.suspiciousLow) return 'precheck';
  return verdictEntry(ctx);
}

function verdictEntry(ctx: ReflectionCtx): string {
  return ctx.verdict === 'success' ? 'success_fork' : 'fail_opener';
}

/**
 * The step after answering `step` with `answer` (a choice value or free
 * text). May return the CLOSE_INCOMPLETE token — the caller ends the
 * practice there instead of rendering a step.
 */
export function resolveNext(step: Step, ctx: ReflectionCtx, answer: string): string {
  if (step.kind === 'choice') {
    const option = step.options?.find((o) => o.value === answer);
    const next = option?.next ?? verdictEntry(ctx);
    return next === VERDICT_ENTRY ? verdictEntry(ctx) : next;
  }
  return step.next ?? verdictEntry(ctx);
}

/** Build the prompt context from the DB row (local optimistic values win) */
export function buildCtx(
  row: DailyReflection,
  local?: { path?: ReflectionPath | null; showedUp?: boolean | null }
): ReflectionCtx {
  return {
    verdict: row.verdict,
    goalType: row.goal_type,
    suspiciousLow: row.suspicious_low,
    path: local?.path !== undefined ? local.path : row.path,
    showedUp: local?.showedUp !== undefined ? local.showedUp : row.showed_up,
    totalCalories: row.total_calories,
    totalProtein: Number(row.total_protein),
    targetCalories: row.target_calories,
    targetProtein: row.target_protein,
  };
}

export interface TranscriptLine {
  prompt: string;
  /** null = the flow stopped here (unanswered) or the line is a statement */
  answer: string | null;
}

/** What a choice step's answer was, read back off the stored row */
const storedChoiceValue = (row: DailyReflection, column: StepSaveColumn): string | null => {
  switch (column) {
    case 'path':
      return row.path;
    case 'showed_up':
      return row.showed_up === null ? null : row.showed_up ? 'yes' : 'no';
    case 'logging_complete':
      return row.logging_complete === null ? null : row.logging_complete ? 'yes' : 'no';
  }
};

/**
 * Replay the flow against a stored row to reconstruct the exact
 * question-and-answer transcript (the coach's day-ledger view). Walks the
 * same graph the client walked, so wording and order always match.
 */
export function transcriptFor(row: DailyReflection): TranscriptLine[] {
  const ctx = buildCtx(row);
  const lines: TranscriptLine[] = [];
  let stepId: string | null = entryStep(ctx);
  let guard = 0;

  while (stepId && guard++ < 30) {
    const step: Step | undefined = FLOW[stepId];
    if (!step) break;

    let answer: string | null = null;

    if (step.kind === 'choice') {
      const value = step.readStored
        ? step.readStored(row)
        : step.saveColumn
          ? storedChoiceValue(row, step.saveColumn)
          : null;
      if (value === null) {
        lines.push({ prompt: step.prompt(ctx), answer: null });
        break; // flow stopped here
      }
      const option = step.options?.find((o) => o.value === value);
      if (!option) {
        // Row written by an older flow version — show the raw value, stop
        lines.push({ prompt: step.prompt(ctx), answer: value });
        break;
      }
      lines.push({ prompt: step.prompt(ctx), answer: option.label });
      answer = value;
    } else if (step.kind === 'text') {
      const text = row.answers?.[step.id];
      if (!text) {
        lines.push({ prompt: step.prompt(ctx), answer: null });
        break;
      }
      lines.push({ prompt: step.prompt(ctx), answer: text });
      answer = text;
    } else {
      // Statements (the fail opener) belong in the transcript;
      // terminal closers don't add information
      if (!step.terminal) lines.push({ prompt: step.prompt(ctx), answer: null });
      answer = '';
    }

    if (step.terminal) break;
    stepId = resolveNext(step, ctx, answer ?? '');
    if (stepId === CLOSE_INCOMPLETE) break;
  }

  return lines;
}
