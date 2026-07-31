/** Fixtures for the domain tests. */

import type {
  CalibrationPair,
  Commitment,
  FullCommitment,
  PredictionSet,
  Resolution,
  ResolutionStatus,
  Tier,
} from '../domain/types';

let seq = 0;
const id = () => `id-${++seq}`;

export function pair(probability: number, occurred: boolean, tier: Tier = 'intention'): CalibrationPair {
  return {
    probability,
    occurred,
    tier,
    categoryId: null,
    commitmentId: id(),
    resolvedAt: '2026-01-01T00:00:00.000Z',
    fromUnforeseen: false,
  };
}

export function blank(tier: Tier = 'intention', patch: Partial<Commitment> = {}): Commitment {
  return {
    id: id(),
    tier,
    categoryId: null,
    title: 'test',
    context: null,
    localDate: '2026-01-01',
    plannedWindow: null,
    resolutionCriterion: 'criterion',
    targetQuantity: null,
    targetUnit: null,
    reversibility: null,
    chosenOptionId: null,
    chosenAt: null,
    reviewDueAt: null,
    isFinancial: false,
    marginOfSafetyNote: null,
    definesEnough: null,
    twoOptionOverrideReason: null,
    draftLockedAt: null,
    newInformationSinceDraft: false,
    discomfortLevel: null,
    constraintId: null,
    isForcingFunction: false,
    forcingFunctionDetail: null,
    processScoreAtCommit: null,
    processChecklistScore: null,
    iiAssignment: null,
    iiWhen: null,
    iiThen: null,
    iiIfThen: null,
    status: 'resolved',
    abandonmentReason: null,
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  };
}

function resolution(commitmentId: string, patch: Partial<Resolution> = {}): Resolution {
  return {
    id: id(),
    commitmentId,
    status: 'resolved',
    voidReason: null,
    resolvedOptionId: null,
    resolvedLabel: null,
    unforeseenOutcome: false,
    unforeseenDescription: null,
    actualQuantity: null,
    hitTarget: null,
    attainment: null,
    outcomeFavorability: null,
    processScoreAtReview: null,
    processReasoning: null,
    reversibilityMatchedExperience: null,
    note: null,
    brierComponent: null,
    resolvedAt: '2026-01-02T00:00:00.000Z',
    ...patch,
  };
}

export function makeBinary({
  probability,
  hit,
  tier = 'intention',
  status = 'resolved',
}: {
  probability: number;
  hit: boolean;
  tier?: Tier;
  status?: ResolutionStatus;
}): FullCommitment {
  const commitment = blank(tier);
  const prediction: PredictionSet = {
    id: id(),
    commitmentId: commitment.id,
    kind: 'binary',
    pass: 'first',
    isWorkingForecast: true,
    referenceClass: null,
    referenceClassRate: null,
    baseRateShownAt: null,
    outcomes: [{ optionId: null, label: commitment.title, probability }],
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  return {
    commitment,
    options: [],
    predictions: [prediction],
    premortems: [],
    resolution: resolution(commitment.id, {
      status,
      hitTarget: status === 'resolved' ? hit : null,
    }),
  };
}

export function makeMulti({
  outcomes,
  resolvedLabel,
  unforeseen = false,
}: {
  outcomes: [string, number][];
  resolvedLabel: string | null;
  unforeseen?: boolean;
}): FullCommitment {
  const commitment = blank('decision');
  const options = outcomes.map(([label], i) => ({
    id: `opt-${commitment.id}-${i}`,
    commitmentId: commitment.id,
    label,
    isVanishingOptionAnswer: false,
    differentiation: null,
    orderIndex: i,
  }));
  const prediction: PredictionSet = {
    id: id(),
    commitmentId: commitment.id,
    kind: 'multi',
    pass: 'first',
    isWorkingForecast: true,
    referenceClass: null,
    referenceClassRate: null,
    baseRateShownAt: null,
    outcomes: outcomes.map(([label, probability], i) => ({
      optionId: options[i]!.id,
      label,
      probability,
    })),
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const resolved = options.find((o) => o.label === resolvedLabel);
  return {
    commitment,
    options,
    predictions: [prediction],
    premortems: [],
    resolution: resolution(commitment.id, {
      resolvedOptionId: resolved?.id ?? null,
      resolvedLabel,
      unforeseenOutcome: unforeseen,
    }),
  };
}
