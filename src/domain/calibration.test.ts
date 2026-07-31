import { describe, expect, it } from 'vitest';
import {
  MIN_N,
  allPairs,
  brierComponentFor,
  calibrationCurve,
  calibrationInTheLarge,
  murphy,
  pairsFor,
  rollingBrier,
} from './calibration';
import type { CalibrationPair, FullCommitment } from './types';
import { makeBinary, makeMulti, pair } from '../test/factories';

describe('pairsFor', () => {
  it('produces one pair for a binary prediction', () => {
    const f = makeBinary({ probability: 0.8, hit: true });
    const ps = pairsFor(f);
    expect(ps).toHaveLength(1);
    expect(ps[0]!.probability).toBe(0.8);
    expect(ps[0]!.occurred).toBe(true);
  });

  it('produces one pair per outcome for a multi prediction', () => {
    const f = makeMulti({
      outcomes: [
        ['a', 0.6],
        ['b', 0.3],
        ['c', 0.1],
      ],
      resolvedLabel: 'b',
    });
    const ps = pairsFor(f);
    expect(ps).toHaveLength(3);
    expect(ps.filter((p) => p.occurred)).toHaveLength(1);
    expect(ps.find((p) => p.occurred)!.probability).toBe(0.3);
  });

  it('resolves every outcome to false when reality was not on the list (F17)', () => {
    const f = makeMulti({
      outcomes: [
        ['a', 0.7],
        ['b', 0.3],
      ],
      resolvedLabel: null,
      unforeseen: true,
    });
    const ps = pairsFor(f);
    expect(ps).toHaveLength(2);
    expect(ps.every((p) => !p.occurred)).toBe(true);
    expect(ps.every((p) => p.fromUnforeseen)).toBe(true);
  });

  it('ignores unresolved and voided commitments', () => {
    expect(pairsFor(makeBinary({ probability: 0.5, hit: true, status: 'unresolved' }))).toEqual([]);
    expect(pairsFor(makeBinary({ probability: 0.5, hit: true, status: 'void' }))).toEqual([]);
  });

  it('scores only the working forecast, not every pass', () => {
    const f = makeBinary({ probability: 0.8, hit: true });
    f.predictions.push({
      ...f.predictions[0]!,
      id: 'other',
      pass: 'second',
      isWorkingForecast: false,
      outcomes: [{ optionId: null, label: 'x', probability: 0.1 }],
    });
    const ps = pairsFor(f);
    expect(ps).toHaveLength(1);
    expect(ps[0]!.probability).toBe(0.8);
  });
});

describe('brierComponentFor', () => {
  it('is the squared error for a binary forecast', () => {
    expect(brierComponentFor(makeBinary({ probability: 0.8, hit: true }))).toBeCloseTo(0.04, 10);
    expect(brierComponentFor(makeBinary({ probability: 0.8, hit: false }))).toBeCloseTo(0.64, 10);
  });

  it('is the sum of per-label components for a multi forecast', () => {
    const f = makeMulti({
      outcomes: [
        ['a', 0.7],
        ['b', 0.3],
      ],
      resolvedLabel: 'a',
    });
    // (0.7-1)^2 + (0.3-0)^2 = 0.09 + 0.09
    expect(brierComponentFor(f)).toBeCloseTo(0.18, 10);
  });

  it('punishes an unforeseen outcome maximally across the stated set', () => {
    const f = makeMulti({
      outcomes: [
        ['a', 0.7],
        ['b', 0.3],
      ],
      resolvedLabel: null,
      unforeseen: true,
    });
    expect(brierComponentFor(f)).toBeCloseTo(0.49 + 0.09, 10);
  });
});

describe('murphy decomposition', () => {
  /**
   * The identity brier = reliability - resolution + uncertainty is the
   * reason this decomposition is used at all (fault F2). If it does not
   * hold exactly, the two headline numbers are not measuring what they
   * claim to.
   */
  it('satisfies brier = reliability - resolution + uncertainty exactly', () => {
    const pairs: CalibrationPair[] = [
      pair(0.9, true),
      pair(0.9, true),
      pair(0.9, false),
      pair(0.7, true),
      pair(0.7, false),
      pair(0.5, true),
      pair(0.5, false),
      pair(0.3, false),
      pair(0.3, true),
      pair(0.1, false),
    ];
    const m = murphy(pairs);
    expect(m.brier).toBeCloseTo(m.reliability - m.resolution + m.uncertainty, 12);
  });

  it('holds for randomised data too', () => {
    let seed = 42;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const pairs: CalibrationPair[] = [];
    for (let i = 0; i < 500; i++) {
      const p = Math.round(rnd() * 10) / 10;
      pairs.push(pair(p, rnd() < p));
    }
    const m = murphy(pairs);
    expect(m.brier).toBeCloseTo(m.reliability - m.resolution + m.uncertainty, 12);
  });

  it('gives near-zero reliability to a perfectly calibrated forecaster', () => {
    // 100 predictions at 70%, exactly 70 of which happen.
    const pairs = [
      ...Array.from({ length: 70 }, () => pair(0.7, true)),
      ...Array.from({ length: 30 }, () => pair(0.7, false)),
    ];
    const m = murphy(pairs);
    expect(m.reliability).toBeCloseTo(0, 10);
  });

  it('gives zero resolution to a forecaster who never varies', () => {
    // Same forecast every time = no discrimination, whatever the outcomes.
    const pairs = [
      ...Array.from({ length: 60 }, () => pair(0.6, true)),
      ...Array.from({ length: 40 }, () => pair(0.6, false)),
    ];
    expect(murphy(pairs).resolution).toBeCloseTo(0, 10);
  });

  it('rewards discrimination with high resolution', () => {
    // Confident and correct in both directions.
    const pairs = [
      ...Array.from({ length: 50 }, () => pair(1, true)),
      ...Array.from({ length: 50 }, () => pair(0, false)),
    ];
    const m = murphy(pairs);
    expect(m.brier).toBeCloseTo(0, 10);
    expect(m.resolution).toBeCloseTo(m.uncertainty, 10);
  });

  it('reports insufficient below the threshold', () => {
    expect(murphy(Array.from({ length: MIN_N.calibration - 1 }, () => pair(0.5, true))).sufficient).toBe(
      false,
    );
    expect(murphy(Array.from({ length: MIN_N.calibration }, () => pair(0.5, true))).sufficient).toBe(
      true,
    );
  });

  it('handles the empty case without throwing', () => {
    const m = murphy([]);
    expect(m.n).toBe(0);
    expect(m.sufficient).toBe(false);
  });
});

describe('calibration in the large', () => {
  it('refuses to state a direction when the interval covers the claim', () => {
    // 10 predictions at 60%, 6 hit. Correct, but n is far too small.
    const pairs = [
      ...Array.from({ length: 6 }, () => pair(0.6, true)),
      ...Array.from({ length: 4 }, () => pair(0.6, false)),
    ];
    expect(calibrationInTheLarge(pairs).direction).toBe('indistinguishable');
  });

  it('calls overconfidence only when the observed interval excludes the mean forecast', () => {
    // 100 predictions at 90%, only 40 happen. Unambiguous.
    const pairs = [
      ...Array.from({ length: 40 }, () => pair(0.9, true)),
      ...Array.from({ length: 60 }, () => pair(0.9, false)),
    ];
    expect(calibrationInTheLarge(pairs).direction).toBe('overconfident');
  });

  it('detects underconfidence symmetrically', () => {
    const pairs = [
      ...Array.from({ length: 90 }, () => pair(0.3, true)),
      ...Array.from({ length: 10 }, () => pair(0.3, false)),
    ];
    expect(calibrationInTheLarge(pairs).direction).toBe('underconfident');
  });
});

describe('calibration curve', () => {
  it('bins by stated probability and flags thin bins', () => {
    const pairs = [
      ...Array.from({ length: 8 }, () => pair(0.85, true)),
      pair(0.15, false),
    ];
    const bins = calibrationCurve(pairs);
    const high = bins.find((b) => b.low === 0.8)!;
    const low = bins.find((b) => b.low === 0.1)!;
    expect(high.n).toBe(8);
    expect(high.sufficient).toBe(true);
    expect(low.n).toBe(1);
    expect(low.sufficient).toBe(false);
  });

  it('puts a probability of exactly 1 in the top bin', () => {
    const bins = calibrationCurve([pair(1, true)]);
    expect(bins[bins.length - 1]!.n).toBe(1);
  });
});

describe('rollingBrier', () => {
  it('returns one point per window', () => {
    const pairs = Array.from({ length: 40 }, () => pair(0.5, true));
    expect(rollingBrier(pairs, 20, 5)).toHaveLength(5);
  });

  it('returns nothing before a full window exists', () => {
    expect(rollingBrier(Array.from({ length: 10 }, () => pair(0.5, true)), 20, 5)).toHaveLength(0);
  });
});

describe('allPairs', () => {
  it('pools every tier into one stream — the point of the spine (F1)', () => {
    const fulls: FullCommitment[] = [
      makeBinary({ probability: 0.7, hit: true, tier: 'intention' }),
      makeBinary({ probability: 0.4, hit: false, tier: 'action' }),
      makeMulti({
        outcomes: [
          ['a', 0.5],
          ['b', 0.5],
        ],
        resolvedLabel: 'a',
      }),
    ];
    const ps = allPairs(fulls);
    expect(ps).toHaveLength(4);
    expect(new Set(ps.map((p) => p.tier))).toEqual(new Set(['intention', 'action', 'decision']));
  });
});
