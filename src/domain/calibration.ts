/**
 * The calibration engine — one engine, fed by every tier (fault F1).
 *
 * Two corrections from the v2.0 spec are implemented here and they matter
 * more than anything else in the codebase:
 *
 * F2. The spec set `corr(confidence, completed) -> 1.0` as the target.
 *     That is wrong. Correlation measures DISCRIMINATION (do you rank days
 *     correctly?), not CALIBRATION (are your numbers right?). A perfectly
 *     calibrated forecaster who says 70% every day and hits 70% of days has
 *     a correlation of exactly 0. Chasing 1.0 pushes you toward extreme,
 *     confident-sounding predictions — the overconfidence Kahneman is cited
 *     to correct. We use the Murphy decomposition instead, which separates
 *     the two properties cleanly and reports them as two numbers that are
 *     never merged.
 *
 * F1. Because intentions, actions and decisions all produce
 *     `CalibrationPair`s on one probability scale, n>=20 arrives in about
 *     three weeks rather than in 2028. A calibration curve is over
 *     (probability, event) pairs; it does not care which tier produced them.
 */

import type { CalibrationPair, FullCommitment, PredictionSet, Tier } from './types';
import { clamp, mean, rate, wilson, type Interval, type Rate } from './stats';

/* ---------------------------------------------------------------- */
/* Minimum-n thresholds. The app is REQUIRED to show a progress      */
/* counter instead of a number when these are not met (F4, F22).     */
/* ---------------------------------------------------------------- */

export const MIN_N = {
  /** Total resolved pairs before reliability / resolution are shown. */
  calibration: 20,
  /** Pairs in a single probability bin before that bin is plotted. */
  perBin: 5,
  /** Any subgroup claim (per-category, per-weekday, per-window). */
  subgroup: 30,
  /** Resolved decisions before the surprise rate is meaningful. */
  surprise: 10,
  /** Reviews before the hindsight-contamination measure is shown. */
  hindsight: 15,
  /** Per arm of a randomised experiment (implementation intentions, reframing). */
  experimentArm: 30,
  /** Interventions in a single leverage band. */
  leverageBand: 5,
  /** Days of flow history before any systems-map alert can fire. */
  systemsWindow: 21,
} as const;

/* ---------------------------------------------------------------- */
/* Extracting pairs from the spine                                   */
/* ---------------------------------------------------------------- */

export function workingForecast(predictions: PredictionSet[]): PredictionSet | null {
  return predictions.find((p) => p.isWorkingForecast) ?? null;
}

/**
 * Turn one resolved commitment into its (probability, outcome) pairs.
 *
 * binary set  -> 1 pair.  The single outcome is "the thing happened".
 * multi set   -> 1 pair per stated outcome. Multi-outcome Brier is exactly
 *                the sum of these per-label binary components, which is why
 *                pooling them into one curve is legitimate.
 *
 * F17. If the actual outcome was not on the list at all, every stated
 * outcome resolves to false. That is the maximally punishing and correct
 * treatment — you assigned probability to a set of things and none of them
 * happened — and it is separately counted as a "surprise".
 */
export function pairsFor(full: FullCommitment): CalibrationPair[] {
  return pairsForSet(full, workingForecast(full.predictions));
}

/**
 * Score a SPECIFIC prediction set rather than the working forecast. Used by
 * the metrics that test the features themselves: does seeing your own base
 * rate improve the revised estimate (F10), and does averaging two
 * independent passes beat the first one (F27)?
 */
export function pairsForSet(
  full: FullCommitment,
  set: PredictionSet | null,
): CalibrationPair[] {
  const { commitment, resolution } = full;
  if (!resolution || resolution.status !== 'resolved') return [];
  if (!set) return [];

  const base = {
    tier: commitment.tier,
    categoryId: commitment.categoryId,
    commitmentId: commitment.id,
    resolvedAt: resolution.resolvedAt,
    fromUnforeseen: resolution.unforeseenOutcome,
  };

  if (set.kind === 'binary') {
    const o = set.outcomes[0];
    if (!o) return [];
    if (resolution.hitTarget === null) return [];
    return [{ ...base, probability: o.probability, occurred: resolution.hitTarget }];
  }

  return set.outcomes.map((o) => ({
    ...base,
    probability: o.probability,
    occurred: resolution.unforeseenOutcome
      ? false
      : o.optionId !== null && o.optionId === resolution.resolvedOptionId,
  }));
}

export function allPairs(fulls: FullCommitment[]): CalibrationPair[] {
  return fulls.flatMap(pairsFor);
}

/**
 * The Brier component stored on a resolution. Never displayed alone (F3):
 * a 0.9 prediction that fails is *expected* to fail 10% of the time, so a
 * per-instance score is resulting, which is the exact error the whole
 * product exists to correct.
 */
export function brierComponentFor(full: FullCommitment): number | null {
  const ps = pairsFor(full);
  if (ps.length === 0) return null;
  return ps.reduce((acc, p) => acc + (p.probability - (p.occurred ? 1 : 0)) ** 2, 0);
}

/* ---------------------------------------------------------------- */
/* Brier + Murphy decomposition                                      */
/* ---------------------------------------------------------------- */

export interface Murphy {
  n: number;
  /** Mean squared error of the probability forecasts. Lower is better. */
  brier: number;
  /**
   * How far your stated probabilities sit from the observed frequencies at
   * those probabilities. THIS is calibration. Target: 0.
   */
  reliability: number;
  /**
   * How much your forecasts vary from the base rate in a way that tracks
   * reality. This is discrimination — whether you actually know which cases
   * are different. Target: as high as possible.
   */
  resolution: number;
  /** Irreducible variance of the events themselves. Not a performance term. */
  uncertainty: number;
  /** Observed base rate across all pairs. */
  baseRate: number;
  /** Brier of always predicting the base rate. Beating this is the real bar. */
  referenceBrier: number;
  /** 1 - brier/referenceBrier. >0 means you beat the base rate. */
  skillScore: number;
  sufficient: boolean;
}

/**
 * Exact Murphy decomposition: brier = reliability - resolution + uncertainty.
 *
 * The decomposition is only exact when grouping by DISTINCT forecast values,
 * not by coarse display bins — so that is what we do here. The decile
 * binning used for the chart lives in `calibrationCurve` and is explicitly
 * a display artefact.
 */
export function murphy(pairs: CalibrationPair[]): Murphy {
  const n = pairs.length;
  const empty: Murphy = {
    n,
    brier: NaN,
    reliability: NaN,
    resolution: NaN,
    uncertainty: NaN,
    baseRate: NaN,
    referenceBrier: NaN,
    skillScore: NaN,
    sufficient: false,
  };
  if (n === 0) return empty;

  const brier = mean(pairs.map((p) => (p.probability - (p.occurred ? 1 : 0)) ** 2));
  const baseRate = mean(pairs.map((p) => (p.occurred ? 1 : 0)));
  const uncertainty = baseRate * (1 - baseRate);

  // group by distinct forecast value (3dp) for exactness
  const groups = new Map<string, CalibrationPair[]>();
  for (const p of pairs) {
    const k = p.probability.toFixed(3);
    const g = groups.get(k);
    if (g) g.push(p);
    else groups.set(k, [p]);
  }

  let reliability = 0;
  let resolution = 0;
  for (const g of groups.values()) {
    const nk = g.length;
    const pk = mean(g.map((x) => x.probability));
    const ok = mean(g.map((x) => (x.occurred ? 1 : 0)));
    reliability += nk * (pk - ok) ** 2;
    resolution += nk * (ok - baseRate) ** 2;
  }
  reliability /= n;
  resolution /= n;

  const referenceBrier = uncertainty;
  const skillScore = referenceBrier === 0 ? NaN : 1 - brier / referenceBrier;

  return {
    n,
    brier,
    reliability,
    resolution,
    uncertainty,
    baseRate,
    referenceBrier,
    skillScore,
    sufficient: n >= MIN_N.calibration,
  };
}

/* ---------------------------------------------------------------- */
/* Calibration curve (display)                                       */
/* ---------------------------------------------------------------- */

export interface CalibrationBin {
  /** Lower/upper edge of the bin, e.g. 0.6 - 0.7 */
  low: number;
  high: number;
  n: number;
  /** Mean stated probability inside the bin. */
  meanProbability: number;
  /** Observed frequency inside the bin. */
  observed: number;
  ci: Interval;
  /** Bins below MIN_N.perBin are returned but flagged, and drawn faintly. */
  sufficient: boolean;
}

export function calibrationCurve(pairs: CalibrationPair[], binCount = 10): CalibrationBin[] {
  const bins: CalibrationBin[] = [];
  for (let i = 0; i < binCount; i++) {
    const low = i / binCount;
    const high = (i + 1) / binCount;
    const inBin = pairs.filter((p) => {
      const v = clamp(p.probability, 0, 1);
      return i === binCount - 1 ? v >= low && v <= high : v >= low && v < high;
    });
    const hits = inBin.filter((p) => p.occurred).length;
    bins.push({
      low,
      high,
      n: inBin.length,
      meanProbability: inBin.length ? mean(inBin.map((p) => p.probability)) : (low + high) / 2,
      observed: inBin.length ? hits / inBin.length : NaN,
      ci: wilson(hits, inBin.length),
      sufficient: inBin.length >= MIN_N.perBin,
    });
  }
  return bins;
}

/* ---------------------------------------------------------------- */
/* Calibration in the large                                          */
/* ---------------------------------------------------------------- */

export interface CalibrationInTheLarge {
  n: number;
  meanProbability: number;
  observedRate: Rate;
  /** mean(p) - observed. Positive = overconfident. */
  gap: number;
  /**
   * F22 — a direction is stated ONLY when the observed rate's interval
   * excludes the mean stated probability. Otherwise the honest answer is
   * "can't tell yet", and that is what gets rendered.
   */
  direction: 'overconfident' | 'underconfident' | 'indistinguishable';
  sufficient: boolean;
}

export function calibrationInTheLarge(pairs: CalibrationPair[]): CalibrationInTheLarge {
  const n = pairs.length;
  const hits = pairs.filter((p) => p.occurred).length;
  const r = rate(hits, n);
  const mp = n ? mean(pairs.map((p) => p.probability)) : NaN;
  let direction: CalibrationInTheLarge['direction'] = 'indistinguishable';
  if (n >= MIN_N.calibration) {
    if (mp > r.ci.high) direction = 'overconfident';
    else if (mp < r.ci.low) direction = 'underconfident';
  }
  return {
    n,
    meanProbability: mp,
    observedRate: r,
    gap: mp - r.point,
    direction,
    sufficient: n >= MIN_N.calibration,
  };
}

/* ---------------------------------------------------------------- */
/* Slicing                                                           */
/* ---------------------------------------------------------------- */

export function byTier(pairs: CalibrationPair[]): Record<Tier, CalibrationPair[]> {
  return {
    intention: pairs.filter((p) => p.tier === 'intention'),
    action: pairs.filter((p) => p.tier === 'action'),
    decision: pairs.filter((p) => p.tier === 'decision'),
  };
}

export function byCategory(pairs: CalibrationPair[]): Map<string, CalibrationPair[]> {
  const m = new Map<string, CalibrationPair[]>();
  for (const p of pairs) {
    const k = p.categoryId ?? '__none__';
    const g = m.get(k);
    if (g) g.push(p);
    else m.set(k, [p]);
  }
  return m;
}

/**
 * Rolling Brier over successive windows, for the "is my forecasting
 * improving?" trend. Returns one point per window, oldest first.
 */
export function rollingBrier(pairs: CalibrationPair[], window = 20, step = 5): number[] {
  const sorted = [...pairs].sort((a, b) => a.resolvedAt.localeCompare(b.resolvedAt));
  const out: number[] = [];
  for (let end = window; end <= sorted.length; end += step) {
    const slice = sorted.slice(end - window, end);
    out.push(mean(slice.map((p) => (p.probability - (p.occurred ? 1 : 0)) ** 2)));
  }
  return out;
}
