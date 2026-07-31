import { describe, expect, it } from 'vitest';
import { backwardInduction, buildMatrix, pureNashEquilibria, recommend, sensitivity } from './game';
import type { GameSketch, PayoffCell, PayoffConfidence } from './types';

function sketch(
  myMoves: string[],
  theirMoves: string[],
  grid: [number, number][][],
  opts: { type?: 'sequential' | 'simultaneous'; confidence?: PayoffConfidence } = {},
): GameSketch {
  const payoffs: PayoffCell[] = [];
  myMoves.forEach((my, i) =>
    theirMoves.forEach((their, j) => {
      const [mine, theirs] = grid[i]![j]!;
      payoffs.push({
        myMove: my,
        theirMove: their,
        myPayoff: mine,
        theirPayoffBelief: theirs,
        confidence: opts.confidence ?? 'known',
      });
    }),
  );
  return {
    id: 'g',
    scenario: 's',
    gameType: opts.type ?? 'simultaneous',
    myMoves,
    counterpartyMoves: theirMoves,
    payoffs,
    outcomeAssessment: null,
    outcomeNote: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('matrix', () => {
  it('fills every cell of the grid', () => {
    const m = buildMatrix(sketch(['a', 'b'], ['x', 'y'], [[[1, 1], [2, 2]], [[3, 3], [4, 4]]]));
    expect(m.cells).toHaveLength(4);
    expect(m.get(1, 1)!.myPayoff).toBe(4);
  });
});

describe("prisoner's dilemma", () => {
  // Defect strictly dominates for both sides; (defect, defect) is the unique
  // equilibrium even though (cooperate, cooperate) pays both more.
  const pd = sketch(
    ['cooperate', 'defect'],
    ['cooperate', 'defect'],
    [
      [
        [3, 3],
        [0, 5],
      ],
      [
        [5, 0],
        [1, 1],
      ],
    ],
  );

  it('finds the unique pure equilibrium', () => {
    const eq = pureNashEquilibria(buildMatrix(pd));
    expect(eq).toHaveLength(1);
    expect(eq[0]!.myMove).toBe('defect');
    expect(eq[0]!.theirMove).toBe('defect');
  });

  it('recommends the dominant strategy and says why', () => {
    const r = recommend(pd);
    expect(r.move).toBe('defect');
    expect(['dominant', 'unique_equilibrium']).toContain(r.kind);
    expect(r.elimination.steps.length).toBeGreaterThan(0);
  });
});

describe('matching pennies', () => {
  // No pure-strategy equilibrium exists. The v2.0 spec never said what to
  // display here; we say the true thing about mixing (F24).
  const mp = sketch(
    ['heads', 'tails'],
    ['heads', 'tails'],
    [
      [
        [1, -1],
        [-1, 1],
      ],
      [
        [-1, 1],
        [1, -1],
      ],
    ],
  );

  it('finds no pure equilibrium', () => {
    expect(pureNashEquilibria(buildMatrix(mp))).toHaveLength(0);
  });

  it('reports that unpredictability is the strategy, rather than inventing one', () => {
    const r = recommend(mp);
    expect(r.kind).toBe('no_pure_equilibrium');
    expect(r.move).toBeNull();
    expect(r.explanation).toMatch(/unpredictable/i);
  });
});

describe('coordination game', () => {
  const coord = sketch(
    ['left', 'right'],
    ['left', 'right'],
    [
      [
        [2, 2],
        [0, 0],
      ],
      [
        [0, 0],
        [2, 2],
      ],
    ],
  );

  it('reports multiple equilibria as a real finding', () => {
    const r = recommend(coord);
    expect(r.kind).toBe('multiple_equilibria');
    expect(r.equilibria).toHaveLength(2);
    expect(r.move).toBeNull();
  });
});

describe('sequential games', () => {
  it('works backwards through their best response', () => {
    // If I play "demand", they prefer to "refuse" (3 > 1) leaving me 0.
    // If I play "ask", they prefer to "accept" (4 > 2) leaving me 3.
    const seq = sketch(
      ['demand', 'ask'],
      ['accept', 'refuse'],
      [
        [
          [5, 1],
          [0, 3],
        ],
        [
          [3, 4],
          [1, 2],
        ],
      ],
      { type: 'sequential' },
    );
    const bi = backwardInduction(buildMatrix(seq))!;
    expect(bi.myMove).toBe('ask');
    expect(bi.anticipatedResponse).toBe('accept');
    expect(bi.myPayoff).toBe(3);

    const r = recommend(seq);
    expect(r.kind).toBe('sequential');
    expect(r.move).toBe('ask');
  });
});

describe('sensitivity (F24 — always compute, then show what would overturn it)', () => {
  it('reports no result-changing cells when everything is known', () => {
    const pd = sketch(
      ['cooperate', 'defect'],
      ['cooperate', 'defect'],
      [
        [
          [3, 3],
          [0, 5],
        ],
        [
          [5, 0],
          [1, 1],
        ],
      ],
    );
    const s = sensitivity(pd);
    expect(s.guessedRatio).toBe(0);
    expect(s.anyResultChanging).toBe(false);
  });

  it('flags a guessed cell that flips the recommendation', () => {
    const g = sketch(
      ['a', 'b'],
      ['x', 'y'],
      [
        [
          [3, 1],
          [2, 2],
        ],
        [
          [1, 3],
          [4, 1],
        ],
      ],
      { confidence: 'guessed' },
    );
    const s = sensitivity(g);
    expect(s.guessedRatio).toBe(1);
    expect(s.anyResultChanging).toBe(true);
    expect(s.caption).toMatch(/would flip/i);
  });

  it('warns about a mostly-guessed table even when the answer is stable', () => {
    const g = sketch(
      ['cooperate', 'defect'],
      ['cooperate', 'defect'],
      [
        [
          [3, 3],
          [0, 5],
        ],
        [
          [5, 0],
          [1, 1],
        ],
      ],
      { confidence: 'guessed' },
    );
    const s = sensitivity(g);
    expect(s.guessedRatio).toBeGreaterThan(0.5);
    expect(s.caption).toBeTruthy();
  });

  it('still produces a recommendation when most cells are guesses', () => {
    // §2 of the spec said "refuse to compute"; §4.4 said "always compute".
    // The contradiction is resolved in favour of computing plus sensitivity.
    const g = sketch(
      ['a', 'b'],
      ['x', 'y'],
      [
        [
          [3, 3],
          [0, 5],
        ],
        [
          [5, 0],
          [1, 1],
        ],
      ],
      { confidence: 'guessed' },
    );
    expect(recommend(g).move).not.toBeUndefined();
  });
});

describe('degenerate input', () => {
  it('handles an empty sketch without throwing', () => {
    const r = recommend(sketch([], [], []));
    expect(r.kind).toBe('insufficient');
  });
});
