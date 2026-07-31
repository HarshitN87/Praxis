/**
 * Statistical primitives.
 *
 * Display rule this file exists to enforce (fault F4): no rate is ever shown
 * without its uncertainty interval. The v2.0 spec's weekly digest read
 * "Exercise: 3/7 days hit target (43%) — overconfident by 2 points". With 7
 * binary trials, 3/7 carries a 95% interval of roughly 12%-78%. Seeing that
 * interval once teaches more than the whole digest did.
 */

export interface Interval {
  low: number;
  high: number;
}

/**
 * Variance below this is treated as zero. Averaging ten copies of 0.7 gives
 * 0.7000000000000001, leaving a residual variance around 1e-31 — enough for
 * a naive `=== 0` guard to miss, and enough for a correlation computed from
 * it to be pure floating-point noise presented as a finding.
 */
export const EPSILON = 1e-12;

export interface Rate {
  hits: number;
  n: number;
  point: number;
  ci: Interval;
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function sum(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

/** Sample standard deviation (n-1). */
export function stdev(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  let acc = 0;
  for (const x of xs) acc += (x - m) ** 2;
  return Math.sqrt(acc / (xs.length - 1));
}

export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Median absolute deviation, scaled to be a consistent estimator of sigma
 * for normal data. Used instead of the standard deviation for the systems-map
 * alerting (F25), because daily self-report data is autocorrelated, bounded,
 * non-normal and lumpy — an SD threshold on a 1-5 slider fires constantly,
 * and each false alarm trains you to ignore the next one.
 */
export function mad(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const m = median(xs);
  return 1.4826 * median(xs.map((x) => Math.abs(x - m)));
}

/**
 * Mean absolute deviation from the median. Used as the first fallback when
 * the MAD collapses to zero.
 */
export function meanAbsoluteDeviation(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const m = median(xs);
  return mean(xs.map((x) => Math.abs(x - m)));
}

/**
 * A spread estimate that survives the data this app actually collects.
 *
 * The MAD alone is not usable here. Daily self-report is discrete and
 * low-cardinality — "3 late nights" logged over and over — and whenever more
 * than half the values are identical the MAD is exactly zero. With a zero
 * spread the systems-map alert can never fire, so the module would look
 * fine and quietly do nothing forever.
 *
 * So: MAD first (robust to outliers, which is why it was chosen), then the
 * mean absolute deviation scaled to be comparable, and finally a small floor
 * proportional to the level itself so that a genuinely constant series can
 * still register a departure. A series that never moves at all and then
 * moves is exactly the case worth flagging.
 */
export function robustSpread(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const m = mad(xs);
  if (m > 0) return m;
  const mad2 = 1.2533 * meanAbsoluteDeviation(xs);
  if (mad2 > 0) return mad2;
  const level = Math.abs(median(xs));
  return Math.max(level * 0.1, 0.05);
}

export function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return s[lo]!;
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Wilson score interval for a binomial proportion.
 *
 * Chosen over the normal approximation because it stays inside [0,1] and
 * behaves sensibly at small n and at proportions near 0 or 1 — which is
 * precisely the regime this app operates in for the first few months.
 */
export function wilson(hits: number, n: number, z = 1.96): Interval {
  if (n === 0) return { low: 0, high: 1 };
  const p = hits / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { low: clamp(center - half, 0, 1), high: clamp(center + half, 0, 1) };
}

export function rate(hits: number, n: number): Rate {
  return { hits, n, point: n === 0 ? NaN : hits / n, ci: wilson(hits, n) };
}

/** Normal-approximation CI for a mean. Reported with n so it can be judged. */
export function meanCI(xs: number[], z = 1.96): Interval {
  const n = xs.length;
  if (n < 2) return { low: NaN, high: NaN };
  const m = mean(xs);
  const se = stdev(xs) / Math.sqrt(n);
  return { low: m - z * se, high: m + z * se };
}

/**
 * Welch's t-test approximation, returning whether two sample means differ
 * at the given alpha. Used for the randomised experiment arms (F9, F28),
 * where the whole point is that the comparison is causal but still needs to
 * clear noise before the app says anything.
 */
export function differsSignificantly(a: number[], b: number[], z = 1.96): boolean {
  if (a.length < 2 || b.length < 2) return false;
  const va = stdev(a) ** 2 / a.length;
  const vb = stdev(b) ** 2 / b.length;
  const se = Math.sqrt(va + vb);
  if (!isFinite(se)) return false;
  if (se === 0) {
    // Both arms are perfectly constant. A t-test is undefined here, but
    // treating cleanly separated constants as "no effect" would hide a real
    // difference. Require a reasonable sample in each arm before saying so.
    return a.length >= 5 && b.length >= 5 && Math.abs(mean(a) - mean(b)) > EPSILON;
  }
  return Math.abs(mean(a) - mean(b)) / se > z;
}

/** Do two proportions differ? Non-overlapping Wilson intervals is the
 *  conservative test used here; it errs toward saying nothing. */
export function proportionsDiffer(
  aHits: number,
  aN: number,
  bHits: number,
  bN: number,
): boolean {
  if (aN < 2 || bN < 2) return false;
  const A = wilson(aHits, aN);
  const B = wilson(bHits, bN);
  return A.low > B.high || B.low > A.high;
}

export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return NaN;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i]! - mx;
    const b = ys[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  // Undefined when either series is effectively constant — a correlation
  // built on 1e-31 of variance is noise, not information.
  if (dx < EPSILON || dy < EPSILON) return NaN;
  return num / Math.sqrt(dx * dy);
}

/** Ordinary least squares slope of y on x. Used for rolling-Brier trend. */
export function slope(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return NaN;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i]! - mx;
    num += a * (ys[i]! - my);
    den += a * a;
  }
  return den < EPSILON ? NaN : num / den;
}

/* ---------------------------------------------------------------- */
/* Formatting                                                        */
/* ---------------------------------------------------------------- */

export function pct(x: number, digits = 0): string {
  if (!isFinite(x)) return '—';
  return `${(x * 100).toFixed(digits)}%`;
}

export function fixed(x: number, digits = 3): string {
  if (!isFinite(x)) return '—';
  return x.toFixed(digits);
}

export function signed(x: number, digits = 2): string {
  if (!isFinite(x)) return '—';
  return `${x >= 0 ? '+' : ''}${x.toFixed(digits)}`;
}

/** "43% (95% CI 12–78%)" — the mandated display form for any rate. */
export function formatRate(r: Rate, digits = 0): string {
  if (r.n === 0) return '—';
  return `${pct(r.point, digits)} (95% CI ${pct(r.ci.low, digits)}–${pct(r.ci.high, digits)})`;
}
