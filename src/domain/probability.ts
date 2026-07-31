/**
 * One probability scale for the entire application (fault F1).
 *
 * The v2.0 spec used probability 0..1 for `forecasts` and an integer 1..10
 * "confidence" for `daily_intentions`, with no defined mapping between them.
 * Is 5/10 = 50%? Is 1/10 = 10% or 0%? Undefined — so intention confidence
 * could never be scored with a proper scoring rule, and could never be
 * pooled with a forecast. Two incompatible yardsticks measuring the same
 * kind of belief.
 *
 * Here everything is a probability in [0,1], and everything is ENTERED the
 * same way, at every tier:
 *
 *     "Out of 10 times in a situation like this, how many go this way?"
 *
 * Frequency format (Gigerenzer) is easier to reason about than percentages
 * and is already the right instinct in §4.1 of the spec — the correction is
 * applying it everywhere instead of inventing a second scale.
 */

import { clamp } from './stats';

/** The ten primary stops offered in the UI. */
export const FREQUENCY_STOPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function outOfTenToProbability(k: number): number {
  return clamp(k, 0, 10) / 10;
}

export function probabilityToOutOfTen(p: number): number {
  return Math.round(clamp(p, 0, 1) * 10);
}

/**
 * Certainty is never offered as a one-tap option. 0 and 10 are reachable
 * only through the fine slider, because a stated 0% or 100% that turns out
 * wrong is unboundedly penalised by any proper scoring rule, and people
 * reach for the ends far too readily.
 */
export function isExtreme(p: number): boolean {
  return p <= 0.02 || p >= 0.98;
}

export const EXTREME_WARNING =
  'A stated 0% or 100% is a claim that the opposite is impossible. If it happens even once, it dominates your score for a long time.';

export function formatProbability(p: number): string {
  if (!isFinite(p)) return '—';
  return `${Math.round(p * 100)}%`;
}

export function formatAsFrequency(p: number): string {
  const k = probabilityToOutOfTen(p);
  return `${k} in 10`;
}

/** Validate a multi-outcome distribution: >= 2 outcomes summing to 1. */
export interface DistributionCheck {
  valid: boolean;
  total: number;
  message: string | null;
}

export const SUM_TOLERANCE = 0.011;

export function checkDistribution(probabilities: number[]): DistributionCheck {
  const total = probabilities.reduce((a, b) => a + b, 0);
  if (probabilities.length < 2) {
    return { valid: false, total, message: 'A decision needs at least two possible outcomes.' };
  }
  if (probabilities.some((p) => p < 0 || p > 1)) {
    return { valid: false, total, message: 'Every probability must be between 0% and 100%.' };
  }
  if (Math.abs(total - 1) > SUM_TOLERANCE) {
    return {
      valid: false,
      total,
      message: `These add up to ${Math.round(total * 100)}%. They need to add up to 100%, because exactly one of them will happen.`,
    };
  }
  return { valid: true, total, message: null };
}

/**
 * Proportionally rescale a distribution to sum to 1, preserving relative
 * weights. Offered as a one-tap fix, never applied silently.
 */
export function normalise(probabilities: number[]): number[] {
  const total = probabilities.reduce((a, b) => a + b, 0);
  if (total <= 0) return probabilities.map(() => 1 / Math.max(1, probabilities.length));
  return probabilities.map((p) => p / total);
}
