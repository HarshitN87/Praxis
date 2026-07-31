/**
 * The evaluation suite — Part 5 of the corrected build map.
 *
 * Every metric here is falsifiable, states its own minimum n, and is never
 * combined with any other into a composite index. A metric that has not
 * cleared its threshold renders as a progress counter ("12 of 20"), not as
 * a number with a caption apologising for itself.
 *
 * This file replaces §7 of the v2.0 spec wholesale, including the two
 * metrics that were statistically wrong (F2: corr(confidence, completed)
 * -> 1.0; F19: corr(process, outcome) -> 0) and the two that were
 * confounded by self-selection (F9, F28).
 */

import type {
  Category,
  Commitment,
  Constraint,
  FullCommitment,
  Intervention,
  ReframingLog,
  Tier,
} from './types';
import {
  MIN_N,
  allPairs,
  calibrationInTheLarge,
  murphy,
  pairsForSet,
  rollingBrier,
  type CalibrationInTheLarge,
  type Murphy,
} from './calibration';
import { hindsightContamination, hindsightRecords, type HindsightContamination } from './process';
import { auditResponses, hitRateBounds, type HitRateBounds } from './resolution';
import { effectivenessByBand, type BandEffectiveness } from './systems';
import {
  differsSignificantly,
  mean,
  meanCI,
  proportionsDiffer,
  rate,
  slope,
  type Interval,
  type Rate,
} from './stats';
import { addDays, daysBetween, weekdayName, type LocalDate } from './dates';

/** Common envelope so the UI can render "not enough data yet" uniformly. */
export interface Gated<T> {
  value: T;
  n: number;
  required: number;
  sufficient: boolean;
}

function gate<T>(value: T, n: number, required: number): Gated<T> {
  return { value, n, required, sufficient: n >= required };
}

/* ================================================================ */
/* 1. Calibration — the headline pair (F2)                          */
/* ================================================================ */

export interface CalibrationReport {
  overall: Murphy;
  inTheLarge: CalibrationInTheLarge;
  byTier: { tier: Tier; murphy: Murphy; inTheLarge: CalibrationInTheLarge }[];
  /** Negative slope = Brier falling = forecasting improving. */
  trendSlope: number;
  trendPoints: number[];
}

export function calibrationReport(fulls: FullCommitment[]): CalibrationReport {
  const pairs = allPairs(fulls);
  const tiers: Tier[] = ['intention', 'action', 'decision'];
  const trendPoints = rollingBrier(pairs);
  return {
    overall: murphy(pairs),
    inTheLarge: calibrationInTheLarge(pairs),
    byTier: tiers.map((tier) => {
      const p = pairs.filter((x) => x.tier === tier);
      return { tier, murphy: murphy(p), inTheLarge: calibrationInTheLarge(p) };
    }),
    trendSlope:
      trendPoints.length >= 3 ? slope(trendPoints.map((_, i) => i), trendPoints) : NaN,
    trendPoints,
  };
}

/* ================================================================ */
/* 2. Surprise rate — the size of the blind spot (F17)              */
/* ================================================================ */

export interface SurpriseReport {
  surprises: number;
  resolvedDecisions: number;
  rate: Rate;
}

/**
 * The fraction of decisions whose actual outcome was not in your option set.
 * This measures the size of your blind spot rather than your accuracy within
 * it — a genuinely Talebian instrument that the v2.0 spec had no equivalent
 * of, and arguably more useful day to day than the Brier score.
 */
export function surpriseReport(fulls: FullCommitment[]): Gated<SurpriseReport> {
  const resolved = fulls.filter(
    (f) => f.commitment.tier === 'decision' && f.resolution?.status === 'resolved',
  );
  const surprises = resolved.filter((f) => f.resolution!.unforeseenOutcome).length;
  return gate(
    { surprises, resolvedDecisions: resolved.length, rate: rate(surprises, resolved.length) },
    resolved.length,
    MIN_N.surprise,
  );
}

/* ================================================================ */
/* 3. Resulting — hindsight contamination (F19)                     */
/* ================================================================ */

export function resultingReport(fulls: FullCommitment[]): Gated<HindsightContamination> {
  const records = hindsightRecords(fulls);
  return gate(hindsightContamination(records), records.length, MIN_N.hindsight);
}

/* ================================================================ */
/* 4. Honesty of the record — response rate and bounds (F7)         */
/* ================================================================ */

export interface HonestyReport {
  responseRate: number;
  answered: number;
  unresolved: number;
  voided: number;
  bounds: HitRateBounds;
}

export function honestyReport(fulls: FullCommitment[], tier?: Tier): HonestyReport {
  const scope = tier ? fulls.filter((f) => f.commitment.tier === tier) : fulls;
  const due = scope.filter((f) => f.commitment.status !== 'open' || f.resolution !== null);
  const audit = auditResponses(due.map((f) => f.resolution));
  const hits = due.filter((f) => f.resolution?.status === 'resolved' && f.resolution.hitTarget)
    .length;
  return {
    responseRate: audit.responseRate,
    answered: audit.answered,
    unresolved: audit.unresolved,
    voided: audit.voided,
    bounds: hitRateBounds(hits, audit.answered, audit.unresolved),
  };
}

/* ================================================================ */
/* 5. Hit rate by category (F4 — with intervals, and gated)         */
/* ================================================================ */

export interface CategoryPerformance {
  categoryId: string | null;
  name: string;
  hits: number;
  answered: number;
  unresolved: number;
  rate: Rate;
  bounds: HitRateBounds;
  meanProbability: number;
  calibration: CalibrationInTheLarge;
  sufficientForCalibration: boolean;
}

export function categoryPerformance(
  fulls: FullCommitment[],
  categories: Category[],
): CategoryPerformance[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const groups = new Map<string, FullCommitment[]>();
  for (const f of fulls) {
    if (f.commitment.tier !== 'intention') continue;
    const k = f.commitment.categoryId ?? '__none__';
    const g = groups.get(k);
    if (g) g.push(f);
    else groups.set(k, [f]);
  }

  const out: CategoryPerformance[] = [];
  for (const [k, group] of groups) {
    const audit = auditResponses(group.map((f) => f.resolution));
    const hits = group.filter(
      (f) => f.resolution?.status === 'resolved' && f.resolution.hitTarget,
    ).length;
    const pairs = group.flatMap((f) => pairsForSet(f, f.predictions.find((p) => p.isWorkingForecast) ?? null));
    out.push({
      categoryId: k === '__none__' ? null : k,
      name: byId.get(k)?.name ?? 'Uncategorised',
      hits,
      answered: audit.answered,
      unresolved: audit.unresolved,
      rate: rate(hits, audit.answered),
      bounds: hitRateBounds(hits, audit.answered, audit.unresolved),
      meanProbability: pairs.length ? mean(pairs.map((p) => p.probability)) : NaN,
      calibration: calibrationInTheLarge(pairs),
      sufficientForCalibration: pairs.length >= MIN_N.subgroup,
    });
  }
  return out.sort((a, b) => b.answered - a.answered);
}

/* ================================================================ */
/* 6. Implementation intentions — randomised (F9)                   */
/* ================================================================ */

export interface ArmComparison {
  armAName: string;
  armBName: string;
  aHits: number;
  aN: number;
  bHits: number;
  bN: number;
  aRate: Rate;
  bRate: Rate;
  /** Conservative: only true when the Wilson intervals do not overlap. */
  distinguishable: boolean;
  sufficient: boolean;
  note: string;
}

/**
 * Intention-to-treat: arms are defined by what the app ASSIGNED, not by
 * whether you went on to write the if-then. That is the whole point — an
 * as-treated comparison would smuggle back the self-selection the
 * randomisation exists to remove.
 *
 * `user_initiated` entries are excluded from this comparison entirely and
 * reported separately, because they are exactly the confounded population
 * the v2.0 metric would have measured.
 */
export function implementationIntentionReport(fulls: FullCommitment[]): ArmComparison {
  const resolved = fulls.filter(
    (f) => f.commitment.tier === 'intention' && f.resolution?.status === 'resolved',
  );
  const prompted = resolved.filter((f) => f.commitment.iiAssignment === 'prompted');
  const notPrompted = resolved.filter((f) => f.commitment.iiAssignment === 'not_prompted');
  const hits = (xs: FullCommitment[]) => xs.filter((f) => f.resolution!.hitTarget).length;

  const aHits = hits(prompted);
  const bHits = hits(notPrompted);
  return {
    armAName: 'Prompted for an if-then plan',
    armBName: 'Not prompted',
    aHits,
    aN: prompted.length,
    bHits,
    bN: notPrompted.length,
    aRate: rate(aHits, prompted.length),
    bRate: rate(bHits, notPrompted.length),
    distinguishable: proportionsDiffer(aHits, prompted.length, bHits, notPrompted.length),
    sufficient:
      prompted.length >= MIN_N.experimentArm && notPrompted.length >= MIN_N.experimentArm,
    note: 'Arms are assigned by coin flip, so this comparison is causal. Intentions where you added an if-then plan yourself are excluded — those would measure your motivation, not the technique.',
  };
}

/* ================================================================ */
/* 7. Reframing — randomised (F28)                                  */
/* ================================================================ */

export interface ReframingReport {
  reframeGaps: number[];
  controlGaps: number[];
  reframeMean: number;
  controlMean: number;
  reframeCI: Interval;
  controlCI: Interval;
  distinguishable: boolean;
  sufficient: boolean;
}

/**
 * The measured quantity is `actual - predicted` difficulty. A negative gap
 * means the task turned out easier than you expected.
 */
export function reframingReport(logs: ReframingLog[]): ReframingReport {
  const done = logs.filter((l) => l.actualDifficulty !== null);
  const gapsFor = (cond: 'reframe' | 'control') =>
    done
      .filter((l) => l.reframeCondition === cond)
      .map((l) => l.actualDifficulty! - l.predictedDifficulty);
  const r = gapsFor('reframe');
  const c = gapsFor('control');
  return {
    reframeGaps: r,
    controlGaps: c,
    reframeMean: r.length ? mean(r) : NaN,
    controlMean: c.length ? mean(c) : NaN,
    reframeCI: meanCI(r),
    controlCI: meanCI(c),
    distinguishable: differsSignificantly(r, c),
    sufficient: r.length >= MIN_N.experimentArm && c.length >= MIN_N.experimentArm,
  };
}

/* ================================================================ */
/* 8. Does the outside view help? (F10)                             */
/* ================================================================ */

export interface RevisionReport {
  n: number;
  firstPassBrier: number;
  revisedBrier: number;
  improvement: number;
  sufficient: boolean;
}

/**
 * Intentions where the base rate was revealed after the first estimate and
 * the user then revised. Compares the Brier of the original estimate against
 * the revised one — testing the FEATURE, not just using it.
 */
export function baseRateRevisionReport(fulls: FullCommitment[]): RevisionReport {
  const eligible = fulls.filter(
    (f) =>
      f.commitment.tier === 'intention' &&
      f.resolution?.status === 'resolved' &&
      f.predictions.some((p) => p.pass === 'first') &&
      f.predictions.some((p) => p.pass === 'second'),
  );
  const brierOf = (f: FullCommitment, pass: 'first' | 'second') => {
    const set = f.predictions.find((p) => p.pass === pass) ?? null;
    const ps = pairsForSet(f, set);
    return ps.reduce((a, p) => a + (p.probability - (p.occurred ? 1 : 0)) ** 2, 0);
  };
  const first = eligible.map((f) => brierOf(f, 'first'));
  const second = eligible.map((f) => brierOf(f, 'second'));
  return {
    n: eligible.length,
    firstPassBrier: first.length ? mean(first) : NaN,
    revisedBrier: second.length ? mean(second) : NaN,
    improvement: first.length ? mean(first) - mean(second) : NaN,
    sufficient: eligible.length >= MIN_N.subgroup,
  };
}

/* ================================================================ */
/* 9. Does averaging two estimates help? (F27)                      */
/* ================================================================ */

export function crowdWithinReport(fulls: FullCommitment[]): RevisionReport {
  const eligible = fulls.filter(
    (f) =>
      f.resolution?.status === 'resolved' &&
      f.predictions.some((p) => p.pass === 'first') &&
      f.predictions.some((p) => p.pass === 'averaged'),
  );
  const brierOf = (f: FullCommitment, pass: 'first' | 'averaged') => {
    const set = f.predictions.find((p) => p.pass === pass) ?? null;
    const ps = pairsForSet(f, set);
    return ps.reduce((a, p) => a + (p.probability - (p.occurred ? 1 : 0)) ** 2, 0);
  };
  const first = eligible.map((f) => brierOf(f, 'first'));
  const avg = eligible.map((f) => brierOf(f, 'averaged'));
  return {
    n: eligible.length,
    firstPassBrier: first.length ? mean(first) : NaN,
    revisedBrier: avg.length ? mean(avg) : NaN,
    improvement: first.length ? mean(first) - mean(avg) : NaN,
    sufficient: eligible.length >= MIN_N.calibration,
  };
}

/* ================================================================ */
/* 10. Interventions — did the stock actually move? (F26)           */
/* ================================================================ */

export function interventionReport(interventions: Intervention[]): BandEffectiveness[] {
  return effectivenessByBand(interventions);
}

/* ================================================================ */
/* 11. Agency — weekly action count by constraint category          */
/* ================================================================ */

export interface AgencyReport {
  weeks: { weekStart: LocalDate; count: number }[];
  byConstraintCategory: { category: string; count: number }[];
  forcingFunctionRate: Rate;
  medianWeekly: number;
}

export function agencyReport(
  fulls: FullCommitment[],
  constraints: Constraint[],
  fromDate: LocalDate,
  toDate: LocalDate,
): AgencyReport {
  const actions = fulls
    .map((f) => f.commitment)
    .filter((c) => c.tier === 'action' && c.localDate >= fromDate && c.localDate <= toDate);

  const weeks = new Map<LocalDate, number>();
  for (const a of actions) {
    const offset = daysBetween(fromDate, a.localDate);
    const weekStart = addDays(fromDate, Math.floor(offset / 7) * 7);
    weeks.set(weekStart, (weeks.get(weekStart) ?? 0) + 1);
  }

  const constraintById = new Map(constraints.map((c) => [c.id, c]));
  const byCat = new Map<string, number>();
  for (const a of actions) {
    const cat = a.constraintId ? constraintById.get(a.constraintId)?.category ?? 'unknown' : 'none';
    byCat.set(cat, (byCat.get(cat) ?? 0) + 1);
  }

  const ff = actions.filter((a) => a.isForcingFunction);
  const ffDone = fulls.filter(
    (f) =>
      f.commitment.isForcingFunction &&
      f.resolution?.status === 'resolved' &&
      f.resolution.hitTarget,
  ).length;

  const counts = [...weeks.values()].sort((a, b) => a - b);
  return {
    weeks: [...weeks.entries()]
      .map(([weekStart, count]) => ({ weekStart, count }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
    byConstraintCategory: [...byCat.entries()].map(([category, count]) => ({ category, count })),
    forcingFunctionRate: rate(ffDone, ff.length),
    medianWeekly: counts.length
      ? counts[Math.floor(counts.length / 2)] ?? 0
      : 0,
  };
}

/* ================================================================ */
/* Pattern discovery — deliberately hard to trigger (F4)            */
/* ================================================================ */

export interface Pattern {
  kind: 'weekday' | 'window' | 'category';
  label: string;
  statement: string;
  aRate: Rate;
  bRate: Rate;
}

/**
 * The v2.0 weekly digest split 7 data points by weekday and by time of day
 * and printed whichever cell looked worst, plus a suggestion. With ~7
 * categories x 7 weekdays x 3 windows you have around 150 cells; at p<0.05
 * you will "find" several spurious patterns every week, forever, in a
 * different place each time.
 *
 * This function therefore requires BOTH cells to clear MIN_N.subgroup (30)
 * AND their Wilson intervals to be disjoint. It usually returns nothing,
 * which is the correct behaviour. It never suggests what you should do
 * (§6.4) — it states what the data shows and stops.
 */
export function discoverPatterns(fulls: FullCommitment[], categories: Category[]): Pattern[] {
  const resolved = fulls.filter(
    (f) => f.commitment.tier === 'intention' && f.resolution?.status === 'resolved',
  );
  const patterns: Pattern[] = [];

  const split = (
    kind: Pattern['kind'],
    keyOf: (c: Commitment) => string | null,
    labelOf: (k: string) => string,
  ) => {
    const groups = new Map<string, FullCommitment[]>();
    for (const f of resolved) {
      const k = keyOf(f.commitment);
      if (k === null) continue;
      const g = groups.get(k);
      if (g) g.push(f);
      else groups.set(k, [f]);
    }
    const stats = [...groups.entries()]
      .map(([k, g]) => ({
        k,
        n: g.length,
        hits: g.filter((f) => f.resolution!.hitTarget).length,
      }))
      .filter((s) => s.n >= MIN_N.subgroup);
    if (stats.length < 2) return;

    stats.sort((a, b) => b.hits / b.n - a.hits / a.n);
    const best = stats[0]!;
    const worst = stats[stats.length - 1]!;
    const bestRate = rate(best.hits, best.n);
    const worstRate = rate(worst.hits, worst.n);
    if (bestRate.ci.low > worstRate.ci.high) {
      patterns.push({
        kind,
        label: labelOf(best.k),
        statement: `${labelOf(best.k)}: ${best.hits} of ${best.n}. ${labelOf(worst.k)}: ${worst.hits} of ${worst.n}. These intervals do not overlap.`,
        aRate: bestRate,
        bRate: worstRate,
      });
    }
  };

  split('weekday', (c) => weekdayName(c.localDate), (k) => k);
  split('window', (c) => c.plannedWindow, (k) => k);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  split('category', (c) => c.categoryId, (k) => catName.get(k) ?? 'Uncategorised');

  return patterns;
}
