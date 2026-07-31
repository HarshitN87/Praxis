/**
 * Resolution — turning a commitment into an outcome.
 *
 * F6. In the v2.0 spec `completed BOOLEAN` was a tap. The evening screen
 * showed "[completed] -> 5.5 hours" against a 6-hour target, so `completed`
 * was a subjective self-verdict — but the weekly digest reported it as
 * "5/7 days HIT TARGET". Those are different claims, and nothing stopped you
 * tapping the tick at 2 hours against a 6-hour target. On a bad day you
 * would, because the whole design nudged toward it. If the resolution
 * criterion is elastic, every downstream number — hit rate, calibration,
 * Brier — is meaningless. This is the load-bearing measurement of the entire
 * product.
 *
 * So: for quantified commitments `hitTarget` is COMPUTED, never tapped. The
 * user enters the number; the app does the comparison.
 */

import type { Commitment, Resolution } from './types';

export interface QuantitativeOutcome {
  hitTarget: boolean;
  attainment: number;
}

export function computeQuantitativeOutcome(
  targetQuantity: number,
  actualQuantity: number,
): QuantitativeOutcome {
  const attainment = targetQuantity === 0 ? 1 : actualQuantity / targetQuantity;
  return { hitTarget: actualQuantity >= targetQuantity, attainment };
}

export function isQuantified(c: Commitment): boolean {
  return c.targetQuantity !== null && c.targetQuantity > 0;
}

/**
 * Neutral result text. F11: the spec's mockups said "Exceeded!", "(close!)",
 * "Your strongest category — keep it up!". That is praise, and praise
 * corrupts honest self-report by making the tick feel better than the cross.
 * Results are stated, never evaluated.
 */
export function describeOutcome(c: Commitment, r: Resolution): string {
  if (r.status === 'void') return 'Voided';
  if (r.status === 'unresolved') return 'Not answered';
  if (isQuantified(c) && r.actualQuantity !== null) {
    const unit = c.targetUnit ? ` ${c.targetUnit}` : '';
    const verdict = r.hitTarget ? 'Target met' : 'Target not met';
    return `${r.actualQuantity}${unit} of ${c.targetQuantity}${unit} — ${verdict}`;
  }
  if (r.hitTarget === true) return 'Done';
  if (r.hitTarget === false) return 'Not done';
  return 'Not answered';
}

/**
 * F7 — a commitment left unanswered past this horizon auto-resolves to
 * `unresolved` rather than silently vanishing from the denominator.
 * Unresolved items are reported separately and never dropped.
 */
export const AUTO_UNRESOLVE_AFTER_DAYS = 7;

export interface ResponseAudit {
  answered: number;
  unresolved: number;
  voided: number;
  total: number;
  responseRate: number;
}

export function auditResponses(resolutions: (Resolution | null)[]): ResponseAudit {
  let answered = 0;
  let unresolved = 0;
  let voided = 0;
  for (const r of resolutions) {
    if (!r || r.status === 'unresolved') unresolved++;
    else if (r.status === 'void') voided++;
    else answered++;
  }
  // Voided items are excluded from the denominator by design: they are the
  // explicit, reasoned "this day did not happen" escape hatch, and forcing
  // them into the rate would punish honesty about genuine disruption.
  const total = answered + unresolved;
  return {
    answered,
    unresolved,
    voided,
    total,
    responseRate: total === 0 ? NaN : answered / total,
  };
}

/**
 * The honest bound on a hit rate given unanswered days (F7).
 *
 * You skip the check-in on exactly the days that went badly, so the observed
 * rate is an OPTIMISTIC estimate. This returns the range the true rate must
 * lie in: best case all missed days were hits, worst case all were misses.
 * The UI shows this whenever the response rate is below 100%.
 */
export interface HitRateBounds {
  observed: number;
  answered: number;
  unresolved: number;
  worstCase: number;
  bestCase: number;
}

export function hitRateBounds(hits: number, answered: number, unresolved: number): HitRateBounds {
  const denom = answered + unresolved;
  return {
    observed: answered === 0 ? NaN : hits / answered,
    answered,
    unresolved,
    worstCase: denom === 0 ? NaN : hits / denom,
    bestCase: denom === 0 ? NaN : (hits + unresolved) / denom,
  };
}
