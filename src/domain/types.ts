/**
 * Praxis domain types — the unified prediction spine.
 *
 * The central correction from the v2.0 spec (fault F1): a big irreversible
 * decision and "will I study 6 hours today" differ in stakes, reversibility
 * and how much structure is worth building around them. They do NOT differ
 * in how the prediction is stored or scored. Everything is a `Commitment`
 * with a `tier`, carrying `PredictionSet`s on one scale (probability 0..1),
 * resolved by one `Resolution`, scored by one calibration engine.
 */

export type ID = string;

/** ISO-8601 instant, e.g. 2026-07-31T09:14:00.000Z */
export type Instant = string;
/** Calendar date in the USER'S local timezone, YYYY-MM-DD (fault F12). */
export type LocalDate = string;

export type Tier = 'intention' | 'action' | 'decision';

export const TIERS: Tier[] = ['intention', 'action', 'decision'];

export const TIER_LABEL: Record<Tier, string> = {
  intention: 'Intention',
  action: 'Action',
  decision: 'Decision',
};

export type Reversibility = 'reversible' | 'hard_to_reverse' | 'irreversible';

export const REVERSIBILITY_LABEL: Record<Reversibility, string> = {
  reversible: 'Reversible',
  hard_to_reverse: 'Hard to reverse',
  irreversible: 'Irreversible',
};

export type CommitmentStatus = 'open' | 'resolved' | 'abandoned' | 'void';

/**
 * F7 — missing check-ins are not missing at random. You skip the check-in on
 * exactly the days that went badly, which biases every hit rate upward,
 * silently and forever. So "no answer" is a first-class recorded state, never
 * an absent row, and the response rate is displayed beside every rate.
 */
export type ResolutionStatus = 'resolved' | 'unresolved' | 'void';

export type PlannedWindow = 'morning' | 'afternoon' | 'evening' | 'unscheduled';

export const PLANNED_WINDOW_LABEL: Record<PlannedWindow, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  unscheduled: 'No set time',
};

/**
 * F9 — Gollwitzer's technique is randomised so its effect is measurable
 * rather than confounded by self-selection (you write an if-then on the days
 * you're already most committed, so an opt-in comparison measures motivation,
 * not the technique).
 */
export type IIAssignment = 'prompted' | 'not_prompted' | 'user_initiated';

/** F28 — reframing needs a control arm or the module cannot be validated. */
export type ReframeCondition = 'reframe' | 'control';

/** F26 — Meadows' actual ordering, with goals and paradigms restored. */
export type LeverageBand =
  | 'parameters'
  | 'feedback_and_delays'
  | 'information_flows'
  | 'rules'
  | 'goals_and_paradigms';

export const LEVERAGE_BANDS: LeverageBand[] = [
  'parameters',
  'feedback_and_delays',
  'information_flows',
  'rules',
  'goals_and_paradigms',
];

export const LEVERAGE_LABEL: Record<LeverageBand, string> = {
  parameters: 'Parameters',
  feedback_and_delays: 'Feedback loops & delays',
  information_flows: 'Information flows',
  rules: 'Rules',
  goals_and_paradigms: 'Goals & paradigms',
};

export const LEVERAGE_DESCRIPTION: Record<LeverageBand, string> = {
  parameters:
    'Numbers, schedules, quantities. Meadows ranks these weakest — but most interventions genuinely are parameters, and that is fine.',
  feedback_and_delays:
    'Changing the strength of a balancing or reinforcing loop, or shortening a delay.',
  information_flows:
    'Giving yourself information you did not previously have, at the moment you can act on it.',
  rules: 'Changing the incentives, constraints, or permissions you operate under.',
  goals_and_paradigms:
    'Changing what the system is for, or the assumption underneath it. Strongest and rarest.',
};

/**
 * F2 — the four categories the classifier offers, deliberately ordered with
 * the two "do not route around this" options FIRST. The app never
 * auto-classifies, and never offers a bypass prompt for the first two, nor
 * when the user is unsure.
 */
export type ConstraintCategory =
  | 'physical_or_legal'
  | 'safety_or_licensing'
  | 'social_convention'
  | 'permission_assumption'
  | 'unknown';

export const CONSTRAINT_CATEGORIES: ConstraintCategory[] = [
  'physical_or_legal',
  'safety_or_licensing',
  'social_convention',
  'permission_assumption',
  'unknown',
];

export const CONSTRAINT_LABEL: Record<ConstraintCategory, string> = {
  physical_or_legal: 'Physical or legal',
  safety_or_licensing: 'Safety or licensing',
  social_convention: 'Social convention',
  permission_assumption: 'Assumed I need permission',
  unknown: "I don't know",
};

export const CONSTRAINT_HELP: Record<ConstraintCategory, string> = {
  physical_or_legal: 'A law, or a fact about the physical world. Not routable.',
  safety_or_licensing:
    'Someone could be harmed, or it requires a licence or qualification. Not routable.',
  social_convention: 'A norm or expectation. It is real, but it is not a rule.',
  permission_assumption:
    'You assumed you needed someone to say yes. Check whether you ever actually asked.',
  unknown: 'Not sure yet. Praxis will not suggest anything until you are.',
};

/** A user-editable category (F14 — not a hardcoded CHECK constraint). */
export interface Category {
  id: ID;
  name: string;
  icon: string;
  archived: boolean;
  createdAt: Instant;
}

/** ---------------------------------------------------------------- */
/** THE SPINE                                                        */
/** ---------------------------------------------------------------- */

export interface Commitment {
  id: ID;
  tier: Tier;
  categoryId: ID | null;
  title: string;
  context: string | null;

  /** The user's local calendar date this belongs to (F12). */
  localDate: LocalDate;
  plannedWindow: PlannedWindow | null;

  /**
   * F6 — written BEFORE the outcome is known. Without this, `completed`
   * is an elastic self-verdict and every downstream number is meaningless.
   */
  resolutionCriterion: string;
  targetQuantity: number | null;
  targetUnit: string | null;

  /* decision tier ------------------------------------------------- */
  reversibility: Reversibility | null;
  /** F16 — the v2.0 schema had no column for what you actually chose. */
  chosenOptionId: ID | null;
  chosenAt: Instant | null;
  reviewDueAt: Instant | null;
  isFinancial: boolean;
  marginOfSafetyNote: string | null;
  definesEnough: boolean | null;
  /** F30 — a soft gate with a logged override beats a hard gate satisfied with filler. */
  twoOptionOverrideReason: string | null;
  /** F27 — the 48h conditional lock from §4.7. */
  draftLockedAt: Instant | null;
  newInformationSinceDraft: boolean;

  /* action tier --------------------------------------------------- */
  discomfortLevel: number | null;
  constraintId: ID | null;
  isForcingFunction: boolean;
  forcingFunctionDetail: string | null;

  /* process capture, at commit time, before the outcome is known (F18) */
  processScoreAtCommit: number | null;
  processChecklistScore: number | null;

  /* implementation intentions (F9) -------------------------------- */
  iiAssignment: IIAssignment | null;
  iiWhen: string | null;
  iiThen: string | null;
  iiIfThen: string | null;

  status: CommitmentStatus;
  abandonmentReason: string | null;
  tags: string[];
  createdAt: Instant;
  updatedAt: Instant;
}

export interface CommitmentOption {
  id: ID;
  commitmentId: ID;
  label: string;
  /** Recorded when generated by the vanishing-options prompt (F30). */
  isVanishingOptionAnswer: boolean;
  differentiation: string | null;
  orderIndex: number;
}

/**
 * A prediction set is ONE row holding the whole probability distribution,
 * so the sum-to-one invariant is intra-row and enforceable rather than an
 * app-level promise across rows that a sync layer will eventually break (F21).
 *
 * `binary` sets hold exactly one outcome (the probability the thing happens).
 * `multi` sets hold >= 2 mutually exclusive outcomes summing to 1.
 */
export type PredictionKind = 'binary' | 'multi';

/** F27 — "the crowd within": two independent passes, then their average. */
export type PredictionPass = 'first' | 'second' | 'averaged';

export interface PredictionOutcome {
  optionId: ID | null;
  label: string;
  probability: number;
}

export interface PredictionSet {
  id: ID;
  commitmentId: ID;
  kind: PredictionKind;
  pass: PredictionPass;
  /** Exactly one set per commitment is the scored forecast. */
  isWorkingForecast: boolean;

  /**
   * F10 — the outside view. Captured, but revealed to the user only AFTER
   * they commit their own estimate, so it informs rather than anchors.
   */
  referenceClass: string | null;
  referenceClassRate: number | null;
  baseRateShownAt: Instant | null;

  outcomes: PredictionOutcome[];
  createdAt: Instant;
}

export interface Resolution {
  id: ID;
  commitmentId: ID;
  status: ResolutionStatus;
  voidReason: string | null;

  resolvedOptionId: ID | null;
  resolvedLabel: string | null;
  /** F17 — the actual outcome was not on your list. Scored, and counted. */
  unforeseenOutcome: boolean;
  unforeseenDescription: string | null;

  actualQuantity: number | null;
  /** F6 — COMPUTED from actual vs target, never tapped by the user. */
  hitTarget: boolean | null;
  attainment: number | null;
  outcomeFavorability: number | null;

  processScoreAtReview: number | null;
  processReasoning: string | null;
  reversibilityMatchedExperience: boolean | null;

  note: string | null;
  /** Stored for aggregation; never displayed on its own (F3). */
  brierComponent: number | null;
  resolvedAt: Instant;
}

export interface Premortem {
  id: ID;
  commitmentId: ID;
  failureMechanism: string;
  estimatedLikelihood: 'low' | 'medium' | 'high';
  isReversibleIfHit: boolean;
}

export interface Constraint {
  id: ID;
  description: string;
  category: ConstraintCategory;
  categoryConfidence: 'confident' | 'unsure';
  bypassIdentified: string | null;
  createdAt: Instant;
}

/** ---------------------------------------------------------------- */
/** SYSTEMS MAP                                                      */
/** ---------------------------------------------------------------- */

export interface Stock {
  id: ID;
  name: string;
  unit: string;
  currentValue: number | null;
  createdAt: Instant;
}

export interface Flow {
  id: ID;
  stockId: ID;
  direction: 'inflow' | 'outflow';
  label: string;
  typicalDelayDays: number;
  createdAt: Instant;
}

export interface FlowLog {
  id: ID;
  flowId: ID;
  localDate: LocalDate;
  value: number;
  createdAt: Instant;
}

export interface StockLog {
  id: ID;
  stockId: ID;
  localDate: LocalDate;
  value: number;
  createdAt: Instant;
}

export interface Intervention {
  id: ID;
  stockId: ID | null;
  description: string;
  leverageBand: LeverageBand;
  intendedDirection: 'increase' | 'decrease';
  /** F26 — did the stock actually move? Set at 2x the flow delay. */
  effectCheckDueAt: Instant;
  effectObserved: 'as_intended' | 'no_change' | 'opposite' | 'too_noisy_to_tell' | null;
  effectNote: string | null;
  createdAt: Instant;
}

export interface HabitLoop {
  id: ID;
  flowId: ID;
  cue: string;
  routine: string;
  desiredChange: 'increase' | 'decrease' | 'redirect';
  environmentRedesign: string | null;
  /** Dated so the before/after comparison window is well defined. */
  environmentRedesignAt: Instant | null;
  stackedOnHabit: string | null;
  createdAt: Instant;
}

/** ---------------------------------------------------------------- */
/** REFRAMING                                                        */
/** ---------------------------------------------------------------- */

export interface ReframingLog {
  id: ID;
  taskDescription: string;
  predictedDifficulty: number;
  /** F28 — randomised. `reframeShown` is null in the control arm. */
  reframeCondition: ReframeCondition;
  reframeShown: string | null;
  actualDifficulty: number | null;
  loggedBeforeTaskAt: Instant;
  loggedAfterTaskAt: Instant | null;
}

/** ---------------------------------------------------------------- */
/** STRATEGIC SKETCH                                                 */
/** ---------------------------------------------------------------- */

export type PayoffConfidence = 'known' | 'estimated' | 'guessed';

export interface PayoffCell {
  myMove: string;
  theirMove: string;
  myPayoff: number;
  /**
   * The user's BELIEF about the counterparty's payoff, never a fact about
   * that person (§1.1). The UI labels it as such at every appearance.
   */
  theirPayoffBelief: number;
  confidence: PayoffConfidence;
}

export interface GameSketch {
  id: ID;
  scenario: string;
  gameType: 'sequential' | 'simultaneous';
  myMoves: string[];
  counterpartyMoves: string[];
  payoffs: PayoffCell[];
  /** Post-hoc: was their actual behaviour close to the sketch, or a surprise? */
  outcomeAssessment: 'as_sketched' | 'surprise' | null;
  outcomeNote: string | null;
  createdAt: Instant;
}

/** ---------------------------------------------------------------- */
/** SETTINGS                                                         */
/** ---------------------------------------------------------------- */

export type ThemePreference = 'auto' | 'light' | 'dark';

export interface Settings {
  id: 'singleton';
  /** 'auto' follows the device. Dark is the one most evening check-ins land in. */
  theme: ThemePreference;
  timezone: string;
  /** Day starts at 04:00 local by default — late nights shouldn't split a day. */
  dayBoundaryHour: number;
  checkinHour: number;
  /**
   * §6.2 corrected (F31): at most ONE notification per day across the whole
   * app, plus one weekly digest. The daily reminder defaults ON because the
   * intention module structurally requires it.
   */
  dailyReminderEnabled: boolean;
  weeklyDigestEnabled: boolean;
  maxIntentionsPerDay: number;
  softIntentionWarnAt: number;
  /** Toggle for the optional modules (§4.6-4.9 + sketch). */
  modules: {
    systemsMap: boolean;
    reframing: boolean;
    strategicSketch: boolean;
    habitLoops: boolean;
  };
  /** §7.1 — a commitment device, not a guarantee. Labelled as such (F34). */
  evaluationBaselineStartedAt: Instant | null;
  onboardedAt: Instant | null;
  createdAt: Instant;
}

/** ---------------------------------------------------------------- */
/** VIEW MODELS                                                      */
/** ---------------------------------------------------------------- */

/** A commitment with everything needed to render or score it. */
export interface FullCommitment {
  commitment: Commitment;
  options: CommitmentOption[];
  predictions: PredictionSet[];
  resolution: Resolution | null;
  premortems: Premortem[];
}

/**
 * The atomic unit the calibration engine consumes: one stated probability
 * paired with one binary realised outcome. Every tier produces these, which
 * is the entire point of the spine.
 */
export interface CalibrationPair {
  probability: number;
  occurred: boolean;
  tier: Tier;
  categoryId: ID | null;
  commitmentId: ID;
  resolvedAt: Instant;
  /** True when this pair exists because reality was not on the list (F17). */
  fromUnforeseen: boolean;
}
