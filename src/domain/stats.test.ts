import { describe, expect, it } from 'vitest';
import {
  differsSignificantly,
  formatRate,
  mad,
  mean,
  meanCI,
  median,
  pearson,
  proportionsDiffer,
  quantile,
  rate,
  robustSpread,
  slope,
  stdev,
  wilson,
} from './stats';

describe('wilson interval', () => {
  it('is wide at small n — the whole reason it exists (F4)', () => {
    // The v2.0 digest printed "3/7 (43%) - overconfident by 2 points".
    const ci = wilson(3, 7);
    expect(ci.low).toBeLessThan(0.2);
    expect(ci.high).toBeGreaterThan(0.7);
  });

  it('narrows as n grows', () => {
    const small = wilson(30, 70);
    const large = wilson(300, 700);
    expect(large.high - large.low).toBeLessThan(small.high - small.low);
  });

  it('stays inside [0,1] at the extremes', () => {
    for (const [h, n] of [
      [0, 5],
      [5, 5],
      [0, 1],
      [1, 1],
    ] as const) {
      const ci = wilson(h, n);
      expect(ci.low).toBeGreaterThanOrEqual(0);
      expect(ci.high).toBeLessThanOrEqual(1);
      expect(ci.low).toBeLessThanOrEqual(ci.high);
    }
  });

  it('returns the full range for n = 0', () => {
    expect(wilson(0, 0)).toEqual({ low: 0, high: 1 });
  });

  it('brackets the point estimate', () => {
    const ci = wilson(7, 20);
    expect(ci.low).toBeLessThanOrEqual(0.35);
    expect(ci.high).toBeGreaterThanOrEqual(0.35);
  });
});

describe('formatRate', () => {
  it('always includes the interval', () => {
    expect(formatRate(rate(3, 7))).toMatch(/43%.*95% CI.*%/);
  });
  it('renders an em dash for no data', () => {
    expect(formatRate(rate(0, 0))).toBe('—');
  });
});

describe('proportionsDiffer', () => {
  it('is false for overlapping intervals', () => {
    expect(proportionsDiffer(6, 10, 4, 10)).toBe(false);
  });
  it('is true only for clearly separated proportions', () => {
    expect(proportionsDiffer(90, 100, 10, 100)).toBe(true);
  });
  it('is false when either arm is tiny', () => {
    expect(proportionsDiffer(1, 1, 0, 1)).toBe(false);
  });
});

describe('robust statistics', () => {
  it('median ignores an extreme value that would drag a mean', () => {
    const xs = [1, 2, 3, 4, 100];
    expect(median(xs)).toBe(3);
    expect(mean(xs)).toBeGreaterThan(20);
  });

  it('median handles even-length input', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('mad collapses to zero on discrete data, which is why robustSpread exists', () => {
    // More than half these values are 3, so the median absolute deviation is
    // exactly 0. Daily self-report looks like this constantly.
    expect(mad([3, 3, 4, 3, 5, 3, 4])).toBe(0);
  });

  it('mad is zero for a constant series', () => {
    expect(mad([4, 4, 4, 4])).toBe(0);
  });

  it('robustSpread stays positive where the mad collapses', () => {
    expect(robustSpread([3, 3, 4, 3, 5, 3, 4])).toBeGreaterThan(0);
  });

  it('robustSpread stays positive even for a perfectly constant series', () => {
    // Otherwise a flow that has never moved could never register a change.
    expect(robustSpread([3, 3, 3, 3])).toBeGreaterThan(0);
  });

  it('robustSpread prefers the mad when the mad is usable', () => {
    const xs = [1, 4, 6, 9, 12, 20, 31];
    expect(robustSpread(xs)).toBe(mad(xs));
  });

  it('robustSpread is not dragged by a single outlier', () => {
    const calm = [5, 5, 6, 5, 6, 5, 6];
    const withSpike = [...calm, 500];
    expect(robustSpread(withSpike)).toBeLessThan(5);
  });

  it('quantile interpolates', () => {
    expect(quantile([0, 10], 0.5)).toBe(5);
  });
});

describe('mean / stdev / CI', () => {
  it('stdev needs two points', () => {
    expect(Number.isNaN(stdev([1]))).toBe(true);
  });
  it('meanCI brackets the mean', () => {
    const ci = meanCI([1, 2, 3, 4, 5]);
    expect(ci.low).toBeLessThan(3);
    expect(ci.high).toBeGreaterThan(3);
  });
});

describe('pearson', () => {
  /**
   * The v2.0 spec targeted corr(confidence, completed) -> 1.0. This test
   * documents why that target is wrong (F2): a perfectly calibrated
   * forecaster who never varies has a correlation of zero.
   */
  it('is undefined for a constant forecast, however well calibrated', () => {
    // Ten forecasts of 70%, seven of which happen: perfectly calibrated, and
    // yet the correlation the v2.0 spec wanted to drive toward 1.0 does not
    // even exist. Note mean([0.7 x 10]) is 0.7000000000000001, so this also
    // guards the floating-point residual that a naive `=== 0` check misses.
    const conf = Array.from({ length: 10 }, () => 0.7);
    const outcome = [1, 1, 1, 1, 1, 1, 1, 0, 0, 0];
    expect(Number.isNaN(pearson(conf, outcome))).toBe(true);
  });

  it('is undefined when the outcomes never vary', () => {
    expect(Number.isNaN(pearson([0.1, 0.5, 0.9], [1, 1, 1]))).toBe(true);
  });

  it('is 1 for a perfectly monotonic relationship', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 10);
  });

  it('is -1 when inverted', () => {
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 10);
  });
});

describe('differsSignificantly', () => {
  it('is false for overlapping noisy samples', () => {
    const a = [5, 6, 4, 5, 7, 3, 5, 6, 4, 5];
    const b = [5, 5, 6, 4, 6, 4, 5, 5, 6, 4];
    expect(differsSignificantly(a, b)).toBe(false);
  });

  it('is true for clearly separated samples', () => {
    const a = Array.from({ length: 20 }, (_, i) => 2 + (i % 3));
    const b = Array.from({ length: 20 }, (_, i) => 12 + (i % 3));
    expect(differsSignificantly(a, b)).toBe(true);
  });

  it('handles two perfectly constant but separated arms', () => {
    // A t-test is undefined here, but calling this "no effect" would hide a
    // clean separation.
    const a = Array.from({ length: 10 }, () => -2);
    const b = Array.from({ length: 10 }, () => 0);
    expect(differsSignificantly(a, b)).toBe(true);
  });

  it('is false for two identical constant arms', () => {
    const a = Array.from({ length: 10 }, () => 3);
    expect(differsSignificantly(a, [...a])).toBe(false);
  });

  it('refuses to judge tiny samples', () => {
    expect(differsSignificantly([1], [9])).toBe(false);
  });
});

describe('slope', () => {
  it('is negative for a falling series', () => {
    expect(slope([0, 1, 2, 3], [10, 8, 6, 4])).toBeCloseTo(-2, 10);
  });
});
