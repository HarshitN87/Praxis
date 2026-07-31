/**
 * Decision gates.
 *
 * These implement §4.1 (ruin check, reversibility tension), §4.6
 * (widen-options), §4.7 (independent-judgment lock) and §4.9 (margin of
 * safety), with the corrections from the review:
 *
 * F30. The widen-options gate becomes a SOFT gate with a logged override.
 *      A hard "3 options or you cannot save" produces three options where
 *      the third is padding, and it frames the vanishing-options prompt as
 *      a punishment rather than the generative tool Heath & Heath intend.
 *      So: run vanishing-options proactively FIRST, then allow saving with
 *      two options if you record why the set is genuinely binary. Recorded,
 *      reviewable, and counted.
 *
 * F27. The independent-judgment lock keeps the spec's well-judged 48h
 *      condition, but adds the half the spec omitted — see crowdWithin().
 */

import type { Commitment, CommitmentOption, Premortem, PredictionSet } from './types';
import { hoursSince } from './dates';
import { mean } from './stats';

export type GateSeverity = 'block' | 'warn';

export interface Gate {
  id: string;
  severity: GateSeverity;
  title: string;
  body: string;
  /** Present when the user can proceed by recording a reason. */
  overrideLabel?: string;
  satisfied: boolean;
}

export interface GateInput {
  commitment: Commitment;
  options: CommitmentOption[];
  premortems: Premortem[];
  /** Set true once the user has answered the ruin-check question. */
  ruinCheckAcknowledged: boolean;
  vanishingOptionAnswered: boolean;
}

export const VANISHING_OPTIONS_PROMPT =
  'If every option on this list vanished — none of them were available — what would you do instead?';

export const RUIN_CHECK_PROMPT =
  'You have flagged a plausible failure path that cannot be undone. Before continuing: is there a version of this decision with the same upside but a reversible downside?';

/** Evaluate every gate for a decision-tier commitment. */
export function evaluateGates(input: GateInput): Gate[] {
  const { commitment: c, options, premortems, ruinCheckAcknowledged, vanishingOptionAnswered } =
    input;
  const gates: Gate[] = [];
  const hardToReverse =
    c.reversibility === 'hard_to_reverse' || c.reversibility === 'irreversible';

  /* --- structural requirements ---------------------------------- */

  gates.push({
    id: 'options_min',
    severity: 'block',
    title: 'At least two options',
    body: 'A decision with one option is not a decision. Name what else you could do.',
    satisfied: options.length >= 2,
  });

  gates.push({
    id: 'premortem_min',
    severity: 'block',
    title: 'Two ways this could go badly',
    body: 'Name at least two concrete mechanisms — not "it might not work", but how. Klein\'s pre-mortem: assume it has already failed, and say why.',
    satisfied: premortems.length >= 2,
  });

  gates.push({
    id: 'resolution_criterion',
    severity: 'block',
    title: 'How will you know?',
    body: 'Write down now what you will look at, later, to decide how this turned out. Written before the outcome, this is the only thing that stops the criterion sliding to fit the result.',
    satisfied: c.resolutionCriterion.trim().length > 0,
  });

  gates.push({
    id: 'review_date',
    severity: 'block',
    title: 'When will you know?',
    body: 'Set the date you expect to be able to judge this. Praxis will resurface it then.',
    satisfied: c.reviewDueAt !== null,
  });

  /* --- Taleb: bound the irreversible downside before optimising --- */

  const ruinPaths = premortems.filter(
    (p) => !p.isReversibleIfHit && p.estimatedLikelihood !== 'low',
  );
  if (ruinPaths.length > 0) {
    gates.push({
      id: 'ruin_check',
      severity: 'block',
      title: 'Plausible, irreversible failure path',
      body: RUIN_CHECK_PROMPT,
      overrideLabel: 'I have considered a reversible version',
      satisfied: ruinCheckAcknowledged,
    });
  }

  /* --- consistency between your own two answers ------------------ */

  if (c.reversibility === 'reversible' && premortems.some((p) => !p.isReversibleIfHit)) {
    gates.push({
      id: 'reversibility_tension',
      severity: 'warn',
      title: 'You tagged this reversible, but one of your own failure paths is not',
      body: 'Both answers are yours and they disagree. Worth deciding which one you actually believe before saving.',
      satisfied: false,
    });
  }

  /* --- Heath & Heath: widen the frame (soft gate, F30) ----------- */

  if (hardToReverse) {
    gates.push({
      id: 'vanishing_options',
      severity: 'block',
      title: 'The vanishing-options test',
      body: VANISHING_OPTIONS_PROMPT,
      satisfied: vanishingOptionAnswered,
    });

    if (options.length < 3) {
      gates.push({
        id: 'widen_options',
        severity: 'warn',
        title: 'Only two options for a hard-to-reverse decision',
        body: 'Most people evaluate a narrow "whether or not" choice. If this genuinely is binary, say why in one line — that gets recorded and shown back to you at review.',
        overrideLabel: 'Record why this is genuinely binary',
        satisfied: (c.twoOptionOverrideReason ?? '').trim().length > 0,
      });
    }
  }

  /* --- Housel: margin of safety, and "enough" -------------------- */

  if (c.isFinancial && hardToReverse) {
    gates.push({
      id: 'margin_of_safety',
      severity: 'block',
      title: 'Margin of safety',
      body: 'What is the buffer between this and real trouble — and what would "enough" look like, so you know when to stop?',
      satisfied:
        (c.marginOfSafetyNote ?? '').trim().length > 0 && c.definesEnough !== null,
    });
  }

  return gates;
}

export function blockingGates(gates: Gate[]): Gate[] {
  return gates.filter((g) => g.severity === 'block' && !g.satisfied);
}

export function warningGates(gates: Gate[]): Gate[] {
  return gates.filter((g) => g.severity === 'warn' && !g.satisfied);
}

export function canSave(gates: Gate[]): boolean {
  return blockingGates(gates).length === 0;
}

/* ---------------------------------------------------------------- */
/* Independent-judgment lock (§4.7) + the crowd within (F27)         */
/* ---------------------------------------------------------------- */

export interface LockState {
  /** True = hide the prior estimate and take a genuinely fresh read. */
  locked: boolean;
  reason: 'time_elapsed' | 'new_information' | 'not_locked';
  hoursElapsed: number;
}

export const LOCK_HOURS = 48;

export function independentJudgmentLock(c: Commitment): LockState {
  const h = hoursSince(c.draftLockedAt);
  if (c.newInformationSinceDraft) {
    return { locked: true, reason: 'new_information', hoursElapsed: h };
  }
  if (h >= LOCK_HOURS) {
    return { locked: true, reason: 'time_elapsed', hoursElapsed: h };
  }
  return { locked: false, reason: 'not_locked', hoursElapsed: h };
}

/**
 * "The crowd within" — the half of *Noise* the v2.0 spec omitted (F27).
 *
 * The spec hid your prior estimate to force a fresh read, then showed both
 * for comparison. But concealment is not the mechanism; AGGREGATION is. For
 * a single person the applicable technique (Vul & Pashler; Herzog & Hertwig)
 * is to make a second genuinely independent estimate and AVERAGE the two.
 * The average reliably beats either one. The spec did the hard part and
 * skipped the payoff.
 *
 * All three are stored — first, second, and the averaged working forecast —
 * so the app can later test whether averaging actually beat your first pass
 * in your own Brier history.
 */
export function averagePredictions(
  first: PredictionSet,
  second: PredictionSet,
): { label: string; optionId: string | null; probability: number }[] {
  const labels = first.outcomes.map((o) => o.label);
  return labels.map((label, i) => {
    const a = first.outcomes[i];
    const b = second.outcomes.find((o) => o.label === label) ?? second.outcomes[i];
    return {
      label,
      optionId: a?.optionId ?? null,
      probability: mean([a?.probability ?? 0, b?.probability ?? a?.probability ?? 0]),
    };
  });
}
