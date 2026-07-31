/**
 * Strategic sketch — Dixit & Nalebuff, honestly scoped.
 *
 * F24. The v2.0 document contradicted itself: §2's contract table said the
 * tool "refuses to compute an equilibrium if more than half the cells are
 * guesses", while §4.4 said "ALWAYS compute the equilibrium/dominant
 * strategy on the stated numbers". Opposite instructions for the same input.
 * §4.4's behaviour is the better one — a sensitivity analysis showing WHICH
 * guess would flip the recommendation teaches far more than a refusal — so
 * that is what is implemented, and the contract is corrected to match.
 *
 * Also unspecified in the original: with <= 3 moves per side and pure
 * strategies only, many games (matching pennies) have NO pure equilibrium.
 * The spec never said what to display. We say the true and useful thing:
 * that this is a situation where being unpredictable is itself the strategy
 * — which is Dixit & Nalebuff's actual point about mixing — without
 * pretending to compute mixed equilibria.
 *
 * §1.1 is enforced throughout: the counterparty's payoff is the USER'S
 * BELIEF about them, never a fact, and it is labelled that way at every
 * appearance.
 */

import type { GameSketch, PayoffCell, PayoffConfidence } from './types';

export const MAX_MOVES_PER_SIDE = 3;

export interface Cell {
  i: number;
  j: number;
  myPayoff: number;
  theirPayoff: number;
  confidence: PayoffConfidence;
}

export interface Matrix {
  myMoves: string[];
  theirMoves: string[];
  cells: Cell[];
  get(i: number, j: number): Cell | undefined;
}

export function buildMatrix(sketch: GameSketch): Matrix {
  const cells: Cell[] = [];
  sketch.myMoves.forEach((my, i) => {
    sketch.counterpartyMoves.forEach((their, j) => {
      const p: PayoffCell | undefined = sketch.payoffs.find(
        (c) => c.myMove === my && c.theirMove === their,
      );
      cells.push({
        i,
        j,
        myPayoff: p?.myPayoff ?? 0,
        theirPayoff: p?.theirPayoffBelief ?? 0,
        confidence: p?.confidence ?? 'guessed',
      });
    });
  });
  return {
    myMoves: sketch.myMoves,
    theirMoves: sketch.counterpartyMoves,
    cells,
    get(i, j) {
      return cells.find((c) => c.i === i && c.j === j);
    },
  };
}

/* ---------------------------------------------------------------- */
/* Strict dominance                                                  */
/* ---------------------------------------------------------------- */

/** Move a strictly dominates move b for me if it is better in EVERY column. */
export function myStrictlyDominated(m: Matrix, liveCols: number[]): number[] {
  const dominated: number[] = [];
  for (let a = 0; a < m.myMoves.length; a++) {
    for (let b = 0; b < m.myMoves.length; b++) {
      if (a === b) continue;
      const bBeatsA = liveCols.every(
        (j) => (m.get(b, j)?.myPayoff ?? 0) > (m.get(a, j)?.myPayoff ?? 0),
      );
      if (bBeatsA) {
        dominated.push(a);
        break;
      }
    }
  }
  return dominated;
}

export function theirStrictlyDominated(m: Matrix, liveRows: number[]): number[] {
  const dominated: number[] = [];
  for (let a = 0; a < m.theirMoves.length; a++) {
    for (let b = 0; b < m.theirMoves.length; b++) {
      if (a === b) continue;
      const bBeatsA = liveRows.every(
        (i) => (m.get(i, b)?.theirPayoff ?? 0) > (m.get(i, a)?.theirPayoff ?? 0),
      );
      if (bBeatsA) {
        dominated.push(a);
        break;
      }
    }
  }
  return dominated;
}

export interface EliminationStep {
  side: 'me' | 'them';
  move: string;
  because: string;
}

export interface Elimination {
  liveRows: number[];
  liveCols: number[];
  steps: EliminationStep[];
}

/** Iterated elimination of strictly dominated strategies. */
export function iteratedElimination(m: Matrix): Elimination {
  let liveRows = m.myMoves.map((_, i) => i);
  let liveCols = m.theirMoves.map((_, j) => j);
  const steps: EliminationStep[] = [];
  let changed = true;
  let guard = 0;

  while (changed && guard++ < 20) {
    changed = false;

    const subMine = restrict(m, liveRows, liveCols);
    const domMine = myStrictlyDominated(subMine.matrix, subMine.colIdx.map((_, j) => j));
    for (const localIdx of domMine) {
      const globalIdx = subMine.rowIdx[localIdx];
      if (globalIdx === undefined || liveRows.length <= 1) continue;
      liveRows = liveRows.filter((r) => r !== globalIdx);
      steps.push({
        side: 'me',
        move: m.myMoves[globalIdx] ?? '',
        because: 'another of your moves does better no matter what they do',
      });
      changed = true;
      break;
    }
    if (changed) continue;

    const subTheirs = restrict(m, liveRows, liveCols);
    const domTheirs = theirStrictlyDominated(
      subTheirs.matrix,
      subTheirs.rowIdx.map((_, i) => i),
    );
    for (const localIdx of domTheirs) {
      const globalIdx = subTheirs.colIdx[localIdx];
      if (globalIdx === undefined || liveCols.length <= 1) continue;
      liveCols = liveCols.filter((c) => c !== globalIdx);
      steps.push({
        side: 'them',
        move: m.theirMoves[globalIdx] ?? '',
        because: 'you believe another of their moves does better for them no matter what you do',
      });
      changed = true;
      break;
    }
  }

  return { liveRows, liveCols, steps };
}

function restrict(m: Matrix, rows: number[], cols: number[]) {
  const cells: Cell[] = [];
  rows.forEach((gi, i) =>
    cols.forEach((gj, j) => {
      const c = m.get(gi, gj);
      cells.push({
        i,
        j,
        myPayoff: c?.myPayoff ?? 0,
        theirPayoff: c?.theirPayoff ?? 0,
        confidence: c?.confidence ?? 'guessed',
      });
    }),
  );
  const matrix: Matrix = {
    myMoves: rows.map((i) => m.myMoves[i] ?? ''),
    theirMoves: cols.map((j) => m.theirMoves[j] ?? ''),
    cells,
    get: (i, j) => cells.find((c) => c.i === i && c.j === j),
  };
  return { matrix, rowIdx: rows, colIdx: cols };
}

/* ---------------------------------------------------------------- */
/* Equilibria                                                        */
/* ---------------------------------------------------------------- */

export interface PureEquilibrium {
  i: number;
  j: number;
  myMove: string;
  theirMove: string;
  myPayoff: number;
}

export function pureNashEquilibria(m: Matrix): PureEquilibrium[] {
  const out: PureEquilibrium[] = [];
  for (let i = 0; i < m.myMoves.length; i++) {
    for (let j = 0; j < m.theirMoves.length; j++) {
      const cell = m.get(i, j);
      if (!cell) continue;
      const bestForMe = m.myMoves.every(
        (_, k) => (m.get(k, j)?.myPayoff ?? -Infinity) <= cell.myPayoff,
      );
      const bestForThem = m.theirMoves.every(
        (_, l) => (m.get(i, l)?.theirPayoff ?? -Infinity) <= cell.theirPayoff,
      );
      if (bestForMe && bestForThem) {
        out.push({
          i,
          j,
          myMove: m.myMoves[i] ?? '',
          theirMove: m.theirMoves[j] ?? '',
          myPayoff: cell.myPayoff,
        });
      }
    }
  }
  return out;
}

/**
 * Backward induction for a sequential game where I move first and they
 * respond. For each of my moves, they choose the response that is best for
 * them (by my belief about their payoffs); I then choose the move whose
 * anticipated response leaves me best off.
 */
export interface BackwardInduction {
  myMove: string;
  myMoveIndex: number;
  anticipatedResponse: string;
  myPayoff: number;
  branches: { myMove: string; theirBestResponse: string; myPayoff: number }[];
}

export function backwardInduction(m: Matrix): BackwardInduction | null {
  if (m.myMoves.length === 0 || m.theirMoves.length === 0) return null;
  const branches = m.myMoves.map((my, i) => {
    let bestJ = 0;
    let bestTheir = -Infinity;
    for (let j = 0; j < m.theirMoves.length; j++) {
      const tp = m.get(i, j)?.theirPayoff ?? -Infinity;
      if (tp > bestTheir) {
        bestTheir = tp;
        bestJ = j;
      }
    }
    return {
      myMove: my,
      theirBestResponse: m.theirMoves[bestJ] ?? '',
      myPayoff: m.get(i, bestJ)?.myPayoff ?? 0,
      index: i,
    };
  });
  const best = branches.reduce((a, b) => (b.myPayoff > a.myPayoff ? b : a));
  return {
    myMove: best.myMove,
    myMoveIndex: best.index,
    anticipatedResponse: best.theirBestResponse,
    myPayoff: best.myPayoff,
    branches: branches.map(({ myMove, theirBestResponse, myPayoff }) => ({
      myMove,
      theirBestResponse,
      myPayoff,
    })),
  };
}

/* ---------------------------------------------------------------- */
/* The recommendation, and what would overturn it                    */
/* ---------------------------------------------------------------- */

export type RecommendationKind =
  | 'dominant'
  | 'unique_equilibrium'
  | 'multiple_equilibria'
  | 'no_pure_equilibrium'
  | 'sequential'
  | 'insufficient';

export interface Recommendation {
  kind: RecommendationKind;
  move: string | null;
  explanation: string;
  equilibria: PureEquilibrium[];
  elimination: Elimination;
  induction: BackwardInduction | null;
}

export function recommend(sketch: GameSketch): Recommendation {
  const m = buildMatrix(sketch);
  if (m.myMoves.length === 0 || m.theirMoves.length === 0) {
    return {
      kind: 'insufficient',
      move: null,
      explanation: 'Add at least one move for each side.',
      equilibria: [],
      elimination: { liveRows: [], liveCols: [], steps: [] },
      induction: null,
    };
  }

  const elimination = iteratedElimination(m);

  if (sketch.gameType === 'sequential') {
    const induction = backwardInduction(m);
    return {
      kind: 'sequential',
      move: induction?.myMove ?? null,
      explanation: induction
        ? `Working backwards: if you play "${induction.myMove}", you believe they respond "${induction.anticipatedResponse}".`
        : 'Not enough structure to work backwards.',
      equilibria: [],
      elimination,
      induction,
    };
  }

  const eq = pureNashEquilibria(m);

  if (elimination.liveRows.length === 1 && elimination.steps.some((s) => s.side === 'me')) {
    const idx = elimination.liveRows[0]!;
    return {
      kind: 'dominant',
      move: m.myMoves[idx] ?? null,
      explanation:
        'One of your moves survives elimination of strictly dominated strategies — it does at least as well as the alternatives whatever they do.',
      equilibria: eq,
      elimination,
      induction: null,
    };
  }

  if (eq.length === 1) {
    return {
      kind: 'unique_equilibrium',
      move: eq[0]!.myMove,
      explanation: `One pure-strategy equilibrium: you play "${eq[0]!.myMove}", they play "${eq[0]!.theirMove}". Neither of you would want to change unilaterally — given your beliefs about their payoffs.`,
      equilibria: eq,
      elimination,
      induction: null,
    };
  }

  if (eq.length > 1) {
    return {
      kind: 'multiple_equilibria',
      move: null,
      explanation:
        'There is more than one stable outcome here. Which one you land in is usually decided by expectations, commitment, or who moves first — not by the payoffs. That is a real finding, not a failure of the sketch.',
      equilibria: eq,
      elimination,
      induction: null,
    };
  }

  return {
    kind: 'no_pure_equilibrium',
    move: null,
    explanation:
      'No stable pair of fixed moves exists: whatever you settle on, one of you would want to deviate. This is a situation where being unpredictable is itself the strategy — Praxis does not compute mixed strategies, and will not pretend to.',
    equilibria: [],
    elimination,
    induction: null,
  };
}

/* ---------------------------------------------------------------- */
/* Sensitivity — which guess would overturn the recommendation       */
/* ---------------------------------------------------------------- */

export interface SensitivityResult {
  guessedRatio: number;
  resultChangingCells: { myMove: string; theirMove: string; flipsTo: string | null }[];
  anyResultChanging: boolean;
  caption: string | null;
}

/**
 * For each cell the user marked "guessed", re-run the recommendation with
 * that cell perturbed across the plausible range implied by the other stated
 * payoffs. If the recommended move changes, the cell is result-changing.
 */
export function sensitivity(sketch: GameSketch): SensitivityResult {
  const total = sketch.payoffs.length;
  const guessed = sketch.payoffs.filter((p) => p.confidence === 'guessed');
  const guessedRatio = total === 0 ? 0 : guessed.length / total;
  const baseline = recommend(sketch);

  const all = sketch.payoffs.flatMap((p) => [p.myPayoff, p.theirPayoffBelief]);
  const lo = all.length ? Math.min(...all) : 0;
  const hi = all.length ? Math.max(...all) : 1;
  const span = Math.max(1, hi - lo);
  const probes = [lo - span * 0.5, lo, (lo + hi) / 2, hi, hi + span * 0.5];

  const resultChanging: SensitivityResult['resultChangingCells'] = [];

  for (const cell of guessed) {
    let flipsTo: string | null = null;
    outer: for (const field of ['myPayoff', 'theirPayoffBelief'] as const) {
      for (const v of probes) {
        const perturbed: GameSketch = {
          ...sketch,
          payoffs: sketch.payoffs.map((p) =>
            p.myMove === cell.myMove && p.theirMove === cell.theirMove
              ? { ...p, [field]: v }
              : p,
          ),
        };
        const r = recommend(perturbed);
        if (r.move !== baseline.move || r.kind !== baseline.kind) {
          flipsTo = r.move;
          break outer;
        }
      }
    }
    if (flipsTo !== null || (flipsTo === null && wasFlipped(sketch, cell, probes, baseline))) {
      resultChanging.push({ myMove: cell.myMove, theirMove: cell.theirMove, flipsTo });
    }
  }

  const anyResultChanging = resultChanging.length > 0;
  let caption: string | null = null;
  if (anyResultChanging) {
    const list = resultChanging.map((c) => `"${c.myMove}" vs "${c.theirMove}"`).join(', ');
    caption = `This recommendation would flip if you are wrong about: ${list}.`;
  } else if (guessedRatio > 0.5) {
    caption = `More than half these payoffs are guesses (${guessed.length} of ${total}). The recommendation is stable across the range you might be wrong by — but it is built on numbers you made up.`;
  }

  return { guessedRatio, resultChangingCells: resultChanging, anyResultChanging, caption };
}

function wasFlipped(
  sketch: GameSketch,
  cell: PayoffCell,
  probes: number[],
  baseline: Recommendation,
): boolean {
  for (const v of probes) {
    const perturbed: GameSketch = {
      ...sketch,
      payoffs: sketch.payoffs.map((p) =>
        p.myMove === cell.myMove && p.theirMove === cell.theirMove ? { ...p, myPayoff: v } : p,
      ),
    };
    if (recommend(perturbed).kind !== baseline.kind) return true;
  }
  return false;
}
