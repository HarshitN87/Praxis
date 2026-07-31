import { describe, expect, it } from 'vitest';
import {
  baseRateRevisionReport,
  categoryPerformance,
  discoverPatterns,
  honestyReport,
  implementationIntentionReport,
  reframingReport,
  resultingReport,
  surpriseReport,
} from './metrics';
import { MIN_N } from './calibration';
import { blank, makeBinary, makeMulti } from '../test/factories';
import type { Category, FullCommitment, ReframingLog } from './types';

describe('surprise rate (F17)', () => {
  it('is gated below the threshold', () => {
    const fulls = Array.from({ length: 3 }, () =>
      makeMulti({ outcomes: [['a', 1]], resolvedLabel: 'a' }),
    );
    expect(surpriseReport(fulls).sufficient).toBe(false);
  });

  it('counts outcomes that were not on the list', () => {
    const fulls: FullCommitment[] = [
      ...Array.from({ length: 8 }, () =>
        makeMulti({
          outcomes: [
            ['a', 0.6],
            ['b', 0.4],
          ],
          resolvedLabel: 'a',
        }),
      ),
      ...Array.from({ length: 2 }, () =>
        makeMulti({
          outcomes: [
            ['a', 0.6],
            ['b', 0.4],
          ],
          resolvedLabel: null,
          unforeseen: true,
        }),
      ),
    ];
    const r = surpriseReport(fulls);
    expect(r.sufficient).toBe(true);
    expect(r.value.surprises).toBe(2);
    expect(r.value.resolvedDecisions).toBe(10);
    expect(r.value.rate.point).toBeCloseTo(0.2, 10);
  });
});

describe('resulting / hindsight contamination (F19)', () => {
  function reviewed(commitScore: number, reviewScore: number, favorability: number) {
    const f = makeMulti({ outcomes: [['a', 1]], resolvedLabel: 'a' });
    f.commitment.processScoreAtCommit = commitScore;
    f.resolution!.processScoreAtReview = reviewScore;
    f.resolution!.outcomeFavorability = favorability;
    return f;
  }

  it('is gated below the threshold', () => {
    expect(resultingReport([reviewed(3, 4, 2)]).sufficient).toBe(false);
  });

  it('detects the outcome dragging the process rating with it', () => {
    const fulls = [
      ...Array.from({ length: 8 }, () => reviewed(3, 5, 2)), // good outcome -> +2
      ...Array.from({ length: 8 }, () => reviewed(3, 1, -2)), // bad outcome -> -2
    ];
    const r = resultingReport(fulls);
    expect(r.sufficient).toBe(true);
    expect(r.value.goodOutcomeDelta).toBeCloseTo(2, 10);
    expect(r.value.badOutcomeDelta).toBeCloseTo(-2, 10);
    expect(r.value.spread).toBeCloseTo(4, 10);
  });

  it('shows near-zero spread for someone judging process on its own terms', () => {
    const fulls = [
      ...Array.from({ length: 8 }, () => reviewed(3, 3, 2)),
      ...Array.from({ length: 8 }, () => reviewed(3, 3, -2)),
    ];
    expect(resultingReport(fulls).value.spread).toBeCloseTo(0, 10);
  });
});

describe('honesty report (F7)', () => {
  it('reports the response rate and the resulting bounds', () => {
    const fulls: FullCommitment[] = [
      ...Array.from({ length: 6 }, () => makeBinary({ probability: 0.5, hit: true })),
      ...Array.from({ length: 4 }, () => makeBinary({ probability: 0.5, hit: true, status: 'unresolved' })),
    ];
    const r = honestyReport(fulls, 'intention');
    expect(r.answered).toBe(6);
    expect(r.unresolved).toBe(4);
    expect(r.responseRate).toBeCloseTo(0.6, 10);
    expect(r.bounds.observed).toBeCloseTo(1, 10);
    expect(r.bounds.worstCase).toBeCloseTo(0.6, 10);
  });
});

describe('implementation intentions (F9 — intention to treat)', () => {
  function intention(assignment: 'prompted' | 'not_prompted' | 'user_initiated', hit: boolean) {
    const f = makeBinary({ probability: 0.5, hit });
    f.commitment.iiAssignment = assignment;
    return f;
  }

  it('is gated until both arms are large enough', () => {
    const fulls = Array.from({ length: 10 }, () => intention('prompted', true));
    expect(implementationIntentionReport(fulls).sufficient).toBe(false);
  });

  it('excludes self-initiated plans from the randomised comparison', () => {
    const fulls = [
      ...Array.from({ length: 30 }, () => intention('prompted', true)),
      ...Array.from({ length: 30 }, () => intention('not_prompted', false)),
      ...Array.from({ length: 50 }, () => intention('user_initiated', true)),
    ];
    const r = implementationIntentionReport(fulls);
    expect(r.aN).toBe(30);
    expect(r.bN).toBe(30);
    expect(r.sufficient).toBe(true);
    expect(r.distinguishable).toBe(true);
  });

  it('reports no distinguishable effect when the arms are similar', () => {
    const mix = (n: number, hits: number, arm: 'prompted' | 'not_prompted') => [
      ...Array.from({ length: hits }, () => intention(arm, true)),
      ...Array.from({ length: n - hits }, () => intention(arm, false)),
    ];
    const r = implementationIntentionReport([...mix(30, 18, 'prompted'), ...mix(30, 17, 'not_prompted')]);
    expect(r.distinguishable).toBe(false);
  });
});

describe('reframing (F28 — needs both arms)', () => {
  const log = (cond: 'reframe' | 'control', predicted: number, actual: number, i: number): ReframingLog => ({
    id: `r${i}`,
    taskDescription: 't',
    predictedDifficulty: predicted,
    reframeCondition: cond,
    reframeShown: cond === 'reframe' ? 'text' : null,
    actualDifficulty: actual,
    loggedBeforeTaskAt: '2026-01-01T00:00:00.000Z',
    loggedAfterTaskAt: '2026-01-01T01:00:00.000Z',
  });

  it('is gated until both arms are large enough', () => {
    const logs = Array.from({ length: 40 }, (_, i) => log('reframe', 7, 5, i));
    expect(reframingReport(logs).sufficient).toBe(false);
  });

  it('computes the predicted-versus-actual gap per arm', () => {
    // Realistic data: both arms vary, the reframe arm is systematically lower.
    const logs = [
      ...Array.from({ length: 30 }, (_, i) => log('reframe', 7, 4 + (i % 3), i)),
      ...Array.from({ length: 30 }, (_, i) => log('control', 7, 7 + (i % 3), i + 100)),
    ];
    const r = reframingReport(logs);
    expect(r.sufficient).toBe(true);
    expect(r.reframeMean).toBeCloseTo(-2, 10);
    expect(r.controlMean).toBeCloseTo(1, 10);
    expect(r.distinguishable).toBe(true);
  });

  it('reports no distinguishable difference when the arms overlap', () => {
    const logs = [
      ...Array.from({ length: 30 }, (_, i) => log('reframe', 7, 5 + (i % 4), i)),
      ...Array.from({ length: 30 }, (_, i) => log('control', 7, 5 + ((i + 1) % 4), i + 100)),
    ];
    expect(reframingReport(logs).distinguishable).toBe(false);
  });

  it('ignores entries with no recorded actual difficulty', () => {
    const logs = [{ ...log('reframe', 7, 5, 1), actualDifficulty: null }];
    expect(reframingReport(logs).reframeGaps).toHaveLength(0);
  });
});

describe('base-rate revision (F10)', () => {
  it('scores the first and revised estimates separately', () => {
    const fulls = Array.from({ length: 30 }, () => {
      const f = makeBinary({ probability: 0.9, hit: false });
      f.predictions[0]!.isWorkingForecast = false;
      f.predictions.push({
        ...f.predictions[0]!,
        id: `${f.commitment.id}-second`,
        pass: 'second',
        isWorkingForecast: true,
        outcomes: [{ optionId: null, label: 'x', probability: 0.5 }],
      });
      return f;
    });
    const r = baseRateRevisionReport(fulls);
    expect(r.sufficient).toBe(true);
    expect(r.firstPassBrier).toBeCloseTo(0.81, 10);
    expect(r.revisedBrier).toBeCloseTo(0.25, 10);
    expect(r.improvement).toBeGreaterThan(0);
  });
});

describe('category performance', () => {
  const cats: Category[] = [
    { id: 'c1', name: 'Study', icon: '', archived: false, createdAt: '2026-01-01T00:00:00.000Z' },
  ];

  it('gates a per-category calibration verdict below the subgroup threshold', () => {
    const fulls = Array.from({ length: 5 }, () => {
      const f = makeBinary({ probability: 0.8, hit: true });
      f.commitment.categoryId = 'c1';
      return f;
    });
    const rows = categoryPerformance(fulls, cats);
    expect(rows[0]!.name).toBe('Study');
    expect(rows[0]!.sufficientForCalibration).toBe(false);
  });
});

describe('pattern discovery (F4 — deliberately hard to trigger)', () => {
  const cats: Category[] = [];

  it('finds nothing in seven data points, which is the whole point', () => {
    const fulls = Array.from({ length: 7 }, (_, i) => {
      const f = makeBinary({ probability: 0.5, hit: i % 2 === 0 });
      f.commitment.localDate = `2026-03-0${i + 1}`;
      return f;
    });
    expect(discoverPatterns(fulls, cats)).toEqual([]);
  });

  it('reports a weekday split only when both cells are large and separated', () => {
    const make = (date: string, hit: boolean) => {
      const f = makeBinary({ probability: 0.5, hit });
      f.commitment.localDate = date;
      return f;
    };
    const fulls: FullCommitment[] = [];
    // 40 Mondays, all hits; 40 Saturdays, all misses.
    for (let i = 0; i < 40; i++) {
      fulls.push(make('2026-03-02', true)); // Monday
      fulls.push(make('2026-03-07', false)); // Saturday
    }
    const patterns = discoverPatterns(fulls, cats);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0]!.kind).toBe('weekday');
    expect(patterns[0]!.statement).toMatch(/do not overlap/);
  });

  it('stays silent when both cells are large but the rates are close', () => {
    const make = (date: string, hit: boolean) => {
      const f = makeBinary({ probability: 0.5, hit });
      f.commitment.localDate = date;
      return f;
    };
    const fulls: FullCommitment[] = [];
    for (let i = 0; i < 40; i++) {
      fulls.push(make('2026-03-02', i % 2 === 0));
      fulls.push(make('2026-03-07', i % 2 === 1));
    }
    expect(discoverPatterns(fulls, cats)).toEqual([]);
  });
});

describe('thresholds are what the build map says', () => {
  it('matches Part 5 of the corrected map', () => {
    expect(MIN_N.calibration).toBe(20);
    expect(MIN_N.perBin).toBe(5);
    expect(MIN_N.subgroup).toBe(30);
    expect(MIN_N.surprise).toBe(10);
    expect(MIN_N.hindsight).toBe(15);
    expect(MIN_N.experimentArm).toBe(30);
    expect(blank('intention').status).toBe('resolved');
  });
});
