import { describe, expect, it } from 'vitest';
import { blank } from '../test/factories';
import {
  LOCK_HOURS,
  averagePredictions,
  blockingGates,
  canSave,
  evaluateGates,
  independentJudgmentLock,
  warningGates,
} from './gates';
import type { Commitment, CommitmentOption, Premortem, PredictionSet } from './types';

const opt = (label: string, i = 0): CommitmentOption => ({
  id: `o${i}`,
  commitmentId: 'c',
  label,
  isVanishingOptionAnswer: false,
  differentiation: null,
  orderIndex: i,
});

const pm = (
  reversible: boolean,
  likelihood: Premortem['estimatedLikelihood'] = 'medium',
  i = 0,
): Premortem => ({
  id: `p${i}`,
  commitmentId: 'c',
  failureMechanism: 'something',
  estimatedLikelihood: likelihood,
  isReversibleIfHit: reversible,
});

function build(patch: Partial<Commitment> = {}) {
  return blank('decision', {
    reversibility: 'hard_to_reverse',
    reviewDueAt: '2026-06-01T00:00:00.000Z',
    resolutionCriterion: 'a criterion',
    ...patch,
  });
}

function run(
  commitment: Commitment,
  options: CommitmentOption[],
  premortems: Premortem[],
  extra: { ruin?: boolean; vanishing?: boolean } = {},
) {
  return evaluateGates({
    commitment,
    options,
    premortems,
    ruinCheckAcknowledged: extra.ruin ?? false,
    vanishingOptionAnswered: extra.vanishing ?? true,
  });
}

describe('structural gates', () => {
  it('blocks a single-option decision', () => {
    const gates = run(build(), [opt('only')], [pm(true), pm(true, 'low', 1)]);
    expect(blockingGates(gates).map((g) => g.id)).toContain('options_min');
  });

  it('blocks fewer than two pre-mortems', () => {
    const gates = run(build(), [opt('a'), opt('b', 1)], [pm(true)]);
    expect(blockingGates(gates).map((g) => g.id)).toContain('premortem_min');
  });

  it('blocks a missing resolution criterion', () => {
    const gates = run(build({ resolutionCriterion: '  ' }), [opt('a'), opt('b', 1)], [pm(true), pm(true, 'low', 1)]);
    expect(blockingGates(gates).map((g) => g.id)).toContain('resolution_criterion');
  });

  it('blocks a missing review date', () => {
    const gates = run(build({ reviewDueAt: null }), [opt('a'), opt('b', 1)], [pm(true), pm(true, 'low', 1)]);
    expect(blockingGates(gates).map((g) => g.id)).toContain('review_date');
  });
});

describe('ruin check (Taleb)', () => {
  it('fires for an irreversible failure path that is not unlikely', () => {
    const gates = run(build(), [opt('a'), opt('b', 1), opt('c', 2)], [pm(false, 'high'), pm(true, 'low', 1)]);
    const ruin = gates.find((g) => g.id === 'ruin_check');
    expect(ruin).toBeDefined();
    expect(ruin!.severity).toBe('block');
    expect(ruin!.satisfied).toBe(false);
  });

  it('does not fire when the irreversible path is unlikely', () => {
    const gates = run(build(), [opt('a'), opt('b', 1), opt('c', 2)], [pm(false, 'low'), pm(true, 'low', 1)]);
    expect(gates.find((g) => g.id === 'ruin_check')).toBeUndefined();
  });

  it('clears once acknowledged', () => {
    const gates = run(
      build(),
      [opt('a'), opt('b', 1), opt('c', 2)],
      [pm(false, 'high'), pm(true, 'low', 1)],
      { ruin: true },
    );
    expect(gates.find((g) => g.id === 'ruin_check')!.satisfied).toBe(true);
  });
});

describe('reversibility tension', () => {
  it('warns when a reversible decision has an irreversible failure path', () => {
    const gates = run(
      build({ reversibility: 'reversible' }),
      [opt('a'), opt('b', 1)],
      [pm(false, 'low'), pm(true, 'low', 1)],
    );
    expect(warningGates(gates).map((g) => g.id)).toContain('reversibility_tension');
  });

  it('stays quiet when the tags agree', () => {
    const gates = run(
      build({ reversibility: 'reversible' }),
      [opt('a'), opt('b', 1)],
      [pm(true), pm(true, 'low', 1)],
    );
    expect(gates.find((g) => g.id === 'reversibility_tension')).toBeUndefined();
  });
});

describe('widen options (F30 — soft gate, logged override)', () => {
  it('warns rather than blocks at two options', () => {
    const gates = run(build(), [opt('a'), opt('b', 1)], [pm(true), pm(true, 'low', 1)]);
    const widen = gates.find((g) => g.id === 'widen_options')!;
    expect(widen.severity).toBe('warn');
    expect(blockingGates(gates).map((g) => g.id)).not.toContain('widen_options');
  });

  it('is satisfied by a recorded reason', () => {
    const gates = run(
      build({ twoOptionOverrideReason: 'the contract is sign or walk' }),
      [opt('a'), opt('b', 1)],
      [pm(true), pm(true, 'low', 1)],
    );
    expect(gates.find((g) => g.id === 'widen_options')!.satisfied).toBe(true);
  });

  it('disappears at three options', () => {
    const gates = run(build(), [opt('a'), opt('b', 1), opt('c', 2)], [pm(true), pm(true, 'low', 1)]);
    expect(gates.find((g) => g.id === 'widen_options')).toBeUndefined();
  });

  it('blocks until the vanishing-options test is answered', () => {
    const gates = run(
      build(),
      [opt('a'), opt('b', 1), opt('c', 2)],
      [pm(true), pm(true, 'low', 1)],
      { vanishing: false },
    );
    expect(blockingGates(gates).map((g) => g.id)).toContain('vanishing_options');
  });

  it('skips both for a reversible decision', () => {
    const gates = run(
      build({ reversibility: 'reversible' }),
      [opt('a'), opt('b', 1)],
      [pm(true), pm(true, 'low', 1)],
      { vanishing: false },
    );
    expect(gates.find((g) => g.id === 'vanishing_options')).toBeUndefined();
    expect(gates.find((g) => g.id === 'widen_options')).toBeUndefined();
  });
});

describe('margin of safety (Housel)', () => {
  it('blocks a hard-to-reverse money decision without a margin note', () => {
    const gates = run(
      build({ isFinancial: true }),
      [opt('a'), opt('b', 1), opt('c', 2)],
      [pm(true), pm(true, 'low', 1)],
    );
    expect(blockingGates(gates).map((g) => g.id)).toContain('margin_of_safety');
  });

  it('needs both the note and a defined "enough"', () => {
    const partial = run(
      build({ isFinancial: true, marginOfSafetyNote: 'six months of runway' }),
      [opt('a'), opt('b', 1), opt('c', 2)],
      [pm(true), pm(true, 'low', 1)],
    );
    expect(partial.find((g) => g.id === 'margin_of_safety')!.satisfied).toBe(false);

    const complete = run(
      build({ isFinancial: true, marginOfSafetyNote: 'six months of runway', definesEnough: true }),
      [opt('a'), opt('b', 1), opt('c', 2)],
      [pm(true), pm(true, 'low', 1)],
    );
    expect(complete.find((g) => g.id === 'margin_of_safety')!.satisfied).toBe(true);
  });

  it('does not apply to a reversible money decision', () => {
    const gates = run(
      build({ isFinancial: true, reversibility: 'reversible' }),
      [opt('a'), opt('b', 1)],
      [pm(true), pm(true, 'low', 1)],
    );
    expect(gates.find((g) => g.id === 'margin_of_safety')).toBeUndefined();
  });
});

describe('canSave', () => {
  it('permits a complete decision that still has warnings', () => {
    const gates = run(
      build({ twoOptionOverrideReason: '' }),
      [opt('a'), opt('b', 1)],
      [pm(true), pm(true, 'low', 1)],
    );
    expect(warningGates(gates).length).toBeGreaterThan(0);
    expect(canSave(gates)).toBe(true);
  });
});

describe('independent-judgment lock (§4.7)', () => {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

  it('stays open inside the window with no new information', () => {
    const state = independentJudgmentLock(blank('decision', { draftLockedAt: hoursAgo(2) }));
    expect(state.locked).toBe(false);
    expect(state.reason).toBe('not_locked');
  });

  it('locks after the elapsed threshold', () => {
    const state = independentJudgmentLock(
      blank('decision', { draftLockedAt: hoursAgo(LOCK_HOURS + 1) }),
    );
    expect(state.locked).toBe(true);
    expect(state.reason).toBe('time_elapsed');
  });

  it('locks immediately when new information is flagged', () => {
    const state = independentJudgmentLock(
      blank('decision', { draftLockedAt: hoursAgo(1), newInformationSinceDraft: true }),
    );
    expect(state.locked).toBe(true);
    expect(state.reason).toBe('new_information');
  });
});

describe('the crowd within (F27)', () => {
  const set = (probs: number[]): PredictionSet => ({
    id: 'x',
    commitmentId: 'c',
    kind: 'multi',
    pass: 'first',
    isWorkingForecast: false,
    referenceClass: null,
    referenceClassRate: null,
    baseRateShownAt: null,
    outcomes: probs.map((p, i) => ({ optionId: `o${i}`, label: `L${i}`, probability: p })),
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  it('averages two independent reads', () => {
    const avg = averagePredictions(set([0.6, 0.4]), set([0.8, 0.2]));
    expect(avg[0]!.probability).toBeCloseTo(0.7, 10);
    expect(avg[1]!.probability).toBeCloseTo(0.3, 10);
  });

  it('preserves a distribution that sums to one', () => {
    const avg = averagePredictions(set([0.5, 0.3, 0.2]), set([0.1, 0.6, 0.3]));
    expect(avg.reduce((a, o) => a + o.probability, 0)).toBeCloseTo(1, 10);
  });

  it('matches by label rather than position', () => {
    const first = set([0.7, 0.3]);
    const second = { ...set([0.1, 0.9]), outcomes: [...set([0.1, 0.9]).outcomes].reverse() };
    const avg = averagePredictions(first, second);
    // L0 pairs with L0 (0.7 and 0.1) regardless of ordering.
    expect(avg[0]!.probability).toBeCloseTo(0.4, 10);
  });
});
