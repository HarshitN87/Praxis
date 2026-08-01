/**
 * The repository — the single write path for the whole application.
 *
 * Every invariant the corrected schema enforces at the database level lives
 * here: exactly one working forecast per commitment (F21), computed rather
 * than tapped hit-targets (F6), resolution as a first-class state including
 * `unresolved` and `void` (F7), abandonment as a RESOLUTION rather than a
 * silent exit from the denominator (F20).
 */

import { getDB, newId, type AlertRecord } from './db';
import type {
  Category,
  Commitment,
  CommitmentOption,
  Constraint,
  Flow,
  FlowLog,
  FullCommitment,
  GameSketch,
  HabitLoop,
  ID,
  Intervention,
  LocalDate,
  PredictionKind,
  PredictionOutcome,
  PredictionPass,
  PredictionSet,
  Premortem,
  ReframingLog,
  Resolution,
  Settings,
  Stock,
  StockLog,
  Tier,
} from '../domain/types';
import { brierComponentFor } from '../domain/calibration';
import { checklistScore } from '../domain/process';
import { computeQuantitativeOutcome, isQuantified } from '../domain/resolution';
import { addDays, nowInstant, systemTimezone, today as todayFor } from '../domain/dates';

/* ---------------------------------------------------------------- */
/* Settings                                                          */
/* ---------------------------------------------------------------- */

export const DEFAULT_SETTINGS: Settings = {
  id: 'singleton',
  theme: 'auto',
  timezone: 'UTC',
  dayBoundaryHour: 4,
  checkinHour: 20,
  // F31: the spec capped intention reminders at ONE PER WEEK (§6.2) while
  // requiring a check-in EVERY NIGHT at 8pm (§4.10). A daily module cannot
  // run on a weekly reminder cap. Corrected policy: at most one notification
  // per day across the entire app, plus one weekly digest. The daily
  // reminder defaults ON because this module structurally requires it.
  dailyReminderEnabled: true,
  weeklyDigestEnabled: true,
  maxIntentionsPerDay: 5,
  softIntentionWarnAt: 3,
  // Optional modules start OFF, as both §4.6-4.9 of the spec and Phase 6/7 of
  // the build map require. Shipping them all on contradicted that and buried
  // the two-job core loop under four things most people never open. They are
  // one tap away on the More screen when a real need for them turns up.
  modules: { systemsMap: false, reframing: false, strategicSketch: false, habitLoops: false },
  evaluationBaselineStartedAt: null,
  onboardedAt: null,
  createdAt: nowInstant(),
};

export const DEFAULT_CATEGORIES: { name: string; icon: string }[] = [
  { name: 'Study', icon: 'book' },
  { name: 'Exercise', icon: 'activity' },
  { name: 'Work', icon: 'briefcase' },
  { name: 'Creative', icon: 'pen' },
  { name: 'Health', icon: 'heart' },
  { name: 'Social', icon: 'users' },
  { name: 'Admin', icon: 'inbox' },
];

export async function getSettings(): Promise<Settings> {
  const db = await getDB();
  const s = await db.get('settings', 'singleton');
  if (s) return s;
  const fresh: Settings = {
    ...DEFAULT_SETTINGS,
    timezone: systemTimezone(),
    createdAt: nowInstant(),
  };
  await db.put('settings', fresh);
  return fresh;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const db = await getDB();
  const current = await getSettings();
  const next = { ...current, ...patch, id: 'singleton' as const };
  await db.put('settings', next);
  return next;
}

export async function ensureSeeded(): Promise<void> {
  const db = await getDB();
  await getSettings();
  const count = await db.count('categories');
  if (count === 0) {
    const tx = db.transaction('categories', 'readwrite');
    for (const c of DEFAULT_CATEGORIES) {
      await tx.store.put({
        id: newId(),
        name: c.name,
        icon: c.icon,
        archived: false,
        createdAt: nowInstant(),
      });
    }
    await tx.done;
  }
}

/* ---------------------------------------------------------------- */
/* Categories                                                        */
/* ---------------------------------------------------------------- */

export async function listCategories(includeArchived = false): Promise<Category[]> {
  const db = await getDB();
  const all = await db.getAll('categories');
  return all
    .filter((c) => includeArchived || !c.archived)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createCategory(name: string, icon = 'circle'): Promise<Category> {
  const db = await getDB();
  const c: Category = { id: newId(), name, icon, archived: false, createdAt: nowInstant() };
  await db.put('categories', c);
  return c;
}

export async function updateCategory(id: ID, patch: Partial<Category>): Promise<void> {
  const db = await getDB();
  const c = await db.get('categories', id);
  if (!c) return;
  await db.put('categories', { ...c, ...patch, id });
}

/* ---------------------------------------------------------------- */
/* Commitments                                                       */
/* ---------------------------------------------------------------- */

export function blankCommitment(tier: Tier, localDate: LocalDate): Commitment {
  const now = nowInstant();
  return {
    id: newId(),
    tier,
    categoryId: null,
    title: '',
    context: null,
    localDate,
    plannedWindow: tier === 'intention' ? 'unscheduled' : null,
    resolutionCriterion: '',
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
    status: 'open',
    abandonmentReason: null,
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

export async function saveCommitment(c: Commitment): Promise<Commitment> {
  const db = await getDB();
  const next = { ...c, updatedAt: nowInstant() };
  await db.put('commitments', next);
  return next;
}

export async function getCommitment(id: ID): Promise<Commitment | undefined> {
  const db = await getDB();
  return db.get('commitments', id);
}

export async function deleteCommitment(id: ID): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ['commitments', 'options', 'predictions', 'resolutions', 'premortems'],
    'readwrite',
  );
  await tx.objectStore('commitments').delete(id);
  for (const store of ['options', 'predictions', 'resolutions', 'premortems'] as const) {
    const idx = tx.objectStore(store).index('by-commitment');
    let cursor = await idx.openCursor(IDBKeyRange.only(id));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
  }
  await tx.done;
}

export async function listCommitmentsByDate(date: LocalDate): Promise<Commitment[]> {
  const db = await getDB();
  return db.getAllFromIndex('commitments', 'by-date', date);
}

export async function listCommitmentsByTier(tier: Tier): Promise<Commitment[]> {
  const db = await getDB();
  return db.getAllFromIndex('commitments', 'by-tier', tier);
}

export async function listAllCommitments(): Promise<Commitment[]> {
  const db = await getDB();
  return db.getAll('commitments');
}

/** Hydrate a commitment with everything needed to render or score it. */
export async function getFull(id: ID): Promise<FullCommitment | null> {
  const db = await getDB();
  const commitment = await db.get('commitments', id);
  if (!commitment) return null;
  const [options, predictions, resolutions, premortems] = await Promise.all([
    db.getAllFromIndex('options', 'by-commitment', id),
    db.getAllFromIndex('predictions', 'by-commitment', id),
    db.getAllFromIndex('resolutions', 'by-commitment', id),
    db.getAllFromIndex('premortems', 'by-commitment', id),
  ]);
  return {
    commitment,
    options: options.sort((a, b) => a.orderIndex - b.orderIndex),
    predictions,
    resolution: resolutions[0] ?? null,
    premortems,
  };
}

/** Hydrate every commitment. The dataset is one person's; this is cheap. */
export async function getAllFull(): Promise<FullCommitment[]> {
  const db = await getDB();
  const [commitments, options, predictions, resolutions, premortems] = await Promise.all([
    db.getAll('commitments'),
    db.getAll('options'),
    db.getAll('predictions'),
    db.getAll('resolutions'),
    db.getAll('premortems'),
  ]);
  const group = <T extends { commitmentId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const g = m.get(r.commitmentId);
      if (g) g.push(r);
      else m.set(r.commitmentId, [r]);
    }
    return m;
  };
  const o = group(options);
  const p = group(predictions);
  const r = group(resolutions);
  const pm = group(premortems);
  return commitments.map((commitment) => ({
    commitment,
    options: (o.get(commitment.id) ?? []).sort((a, b) => a.orderIndex - b.orderIndex),
    predictions: p.get(commitment.id) ?? [],
    resolution: (r.get(commitment.id) ?? [])[0] ?? null,
    premortems: pm.get(commitment.id) ?? [],
  }));
}

/* ---------------------------------------------------------------- */
/* Options                                                           */
/* ---------------------------------------------------------------- */

export async function setOptions(
  commitmentId: ID,
  labels: { label: string; isVanishingOptionAnswer?: boolean; differentiation?: string | null }[],
): Promise<CommitmentOption[]> {
  const db = await getDB();
  const existing = await db.getAllFromIndex('options', 'by-commitment', commitmentId);
  const tx = db.transaction('options', 'readwrite');
  for (const e of existing) await tx.store.delete(e.id);
  const created: CommitmentOption[] = labels.map((l, i) => ({
    id: newId(),
    commitmentId,
    label: l.label,
    isVanishingOptionAnswer: l.isVanishingOptionAnswer ?? false,
    differentiation: l.differentiation ?? null,
    orderIndex: i,
  }));
  for (const c of created) await tx.store.put(c);
  await tx.done;
  return created;
}

export async function listOptions(commitmentId: ID): Promise<CommitmentOption[]> {
  const db = await getDB();
  const rows = await db.getAllFromIndex('options', 'by-commitment', commitmentId);
  return rows.sort((a, b) => a.orderIndex - b.orderIndex);
}

/* ---------------------------------------------------------------- */
/* Predictions                                                       */
/* ---------------------------------------------------------------- */

export interface SavePredictionInput {
  commitmentId: ID;
  kind: PredictionKind;
  pass: PredictionPass;
  outcomes: PredictionOutcome[];
  referenceClass?: string | null;
  referenceClassRate?: number | null;
  baseRateShownAt?: string | null;
  makeWorking?: boolean;
}

/**
 * Exactly one prediction set per commitment carries `isWorkingForecast`.
 * Enforced here rather than promised by the client (F21): with a sync layer
 * and an offline cache, app-level invariants ACROSS rows will eventually
 * break, and a commitment with two working forecasts silently corrupts the
 * calibration engine with no error anywhere.
 */
export async function savePrediction(input: SavePredictionInput): Promise<PredictionSet> {
  const db = await getDB();
  const makeWorking = input.makeWorking ?? true;
  const set: PredictionSet = {
    id: newId(),
    commitmentId: input.commitmentId,
    kind: input.kind,
    pass: input.pass,
    isWorkingForecast: makeWorking,
    referenceClass: input.referenceClass ?? null,
    referenceClassRate: input.referenceClassRate ?? null,
    baseRateShownAt: input.baseRateShownAt ?? null,
    outcomes: input.outcomes,
    createdAt: nowInstant(),
  };

  const tx = db.transaction('predictions', 'readwrite');
  if (makeWorking) {
    const idx = tx.store.index('by-commitment');
    let cursor = await idx.openCursor(IDBKeyRange.only(input.commitmentId));
    while (cursor) {
      if (cursor.value.isWorkingForecast) {
        await cursor.update({ ...cursor.value, isWorkingForecast: false });
      }
      cursor = await cursor.continue();
    }
  }
  await tx.store.put(set);
  await tx.done;
  return set;
}

export async function listPredictions(commitmentId: ID): Promise<PredictionSet[]> {
  const db = await getDB();
  const rows = await db.getAllFromIndex('predictions', 'by-commitment', commitmentId);
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/* ---------------------------------------------------------------- */
/* Premortems                                                        */
/* ---------------------------------------------------------------- */

export async function setPremortems(
  commitmentId: ID,
  rows: Omit<Premortem, 'id' | 'commitmentId'>[],
): Promise<Premortem[]> {
  const db = await getDB();
  const existing = await db.getAllFromIndex('premortems', 'by-commitment', commitmentId);
  const tx = db.transaction('premortems', 'readwrite');
  for (const e of existing) await tx.store.delete(e.id);
  const created = rows.map((r) => ({ ...r, id: newId(), commitmentId }));
  for (const c of created) await tx.store.put(c);
  await tx.done;
  return created;
}

export async function listPremortems(commitmentId: ID): Promise<Premortem[]> {
  const db = await getDB();
  return db.getAllFromIndex('premortems', 'by-commitment', commitmentId);
}

/* ---------------------------------------------------------------- */
/* Resolution                                                        */
/* ---------------------------------------------------------------- */

export interface ResolveInput {
  commitmentId: ID;
  status: 'resolved' | 'unresolved' | 'void';
  voidReason?: string | null;
  /** Binary tier: did the pre-committed criterion get met? */
  didIt?: boolean | null;
  actualQuantity?: number | null;
  resolvedOptionId?: ID | null;
  unforeseenOutcome?: boolean;
  unforeseenDescription?: string | null;
  outcomeFavorability?: number | null;
  processScoreAtReview?: number | null;
  processReasoning?: string | null;
  reversibilityMatchedExperience?: boolean | null;
  note?: string | null;
}

export async function resolveCommitment(input: ResolveInput): Promise<Resolution> {
  const db = await getDB();
  const full = await getFull(input.commitmentId);
  if (!full) throw new Error(`No commitment ${input.commitmentId}`);
  const c = full.commitment;

  // F6 — hitTarget is COMPUTED for quantified commitments. The user supplies
  // the number; the app does the comparison. It is never a tap.
  let hitTarget: boolean | null = null;
  let attainment: number | null = null;
  if (input.status === 'resolved') {
    if (isQuantified(c) && input.actualQuantity !== null && input.actualQuantity !== undefined) {
      const q = computeQuantitativeOutcome(c.targetQuantity!, input.actualQuantity);
      hitTarget = q.hitTarget;
      attainment = q.attainment;
    } else if (input.didIt !== null && input.didIt !== undefined) {
      hitTarget = input.didIt;
      attainment = input.didIt ? 1 : 0;
    }
    if (c.tier === 'decision') {
      // For a decision, "hit target" means the outcome you called most likely
      // is the one that happened — used only for display; scoring uses the
      // full distribution.
      const working = full.predictions.find((p) => p.isWorkingForecast);
      const top = working?.outcomes.slice().sort((a, b) => b.probability - a.probability)[0];
      hitTarget = input.unforeseenOutcome
        ? false
        : !!top && top.optionId === (input.resolvedOptionId ?? null);
    }
  }

  const existing = (
    await db.getAllFromIndex('resolutions', 'by-commitment', input.commitmentId)
  )[0];

  const resolution: Resolution = {
    id: existing?.id ?? newId(),
    commitmentId: input.commitmentId,
    status: input.status,
    voidReason: input.voidReason ?? null,
    resolvedOptionId: input.resolvedOptionId ?? null,
    resolvedLabel:
      full.options.find((o) => o.id === input.resolvedOptionId)?.label ??
      (input.unforeseenOutcome ? (input.unforeseenDescription ?? 'Something else') : null),
    unforeseenOutcome: input.unforeseenOutcome ?? false,
    unforeseenDescription: input.unforeseenDescription ?? null,
    actualQuantity: input.actualQuantity ?? null,
    hitTarget,
    attainment,
    outcomeFavorability: input.outcomeFavorability ?? null,
    processScoreAtReview: input.processScoreAtReview ?? null,
    processReasoning: input.processReasoning ?? null,
    reversibilityMatchedExperience: input.reversibilityMatchedExperience ?? null,
    note: input.note ?? null,
    brierComponent: null,
    resolvedAt: existing?.resolvedAt ?? nowInstant(),
  };

  await db.put('resolutions', resolution);

  // Recompute the stored Brier component now that the resolution exists.
  const hydrated = await getFull(input.commitmentId);
  if (hydrated) {
    const brier = brierComponentFor(hydrated);
    if (brier !== null) {
      resolution.brierComponent = brier;
      await db.put('resolutions', resolution);
    }
  }

  await saveCommitment({
    ...c,
    status: input.status === 'void' ? 'void' : 'resolved',
    processChecklistScore: hydrated ? checklistScore(hydrated) : c.processChecklistScore,
  });

  return resolution;
}

/**
 * F20 — abandonment IS a resolution. In the v2.0 spec, `status='abandoned'`
 * never resolved its forecast, so abandoned decisions never entered the
 * Brier score. But you abandon the ones going badly, so the calibration
 * score would be computed on a survivor-biased sample — the exact mechanism
 * Taleb is cited for, operating inside the tool built to detect it.
 */
export async function abandonCommitment(id: ID, reason: string): Promise<void> {
  const c = await getCommitment(id);
  if (!c) return;
  await saveCommitment({ ...c, abandonmentReason: reason, status: 'abandoned' });
  await resolveCommitment({
    commitmentId: id,
    status: 'resolved',
    unforeseenOutcome: true,
    unforeseenDescription: `Abandoned: ${reason}`,
    note: reason,
  });
  const after = await getCommitment(id);
  if (after) await saveCommitment({ ...after, status: 'abandoned', abandonmentReason: reason });
}

/**
 * F7 — sweep commitments left unanswered past the horizon into an explicit
 * `unresolved` state. They are reported separately and never dropped from
 * the denominator, because missing check-ins are not missing at random.
 */
export async function sweepUnresolved(
  timezone: string,
  boundaryHour: number,
  horizonDays = 7,
): Promise<number> {
  const db = await getDB();
  const today = todayFor(timezone, boundaryHour);
  const cutoff = addDays(today, -horizonDays);
  const open = await db.getAllFromIndex('commitments', 'by-status', 'open');
  let swept = 0;
  for (const c of open) {
    if (c.tier === 'decision') continue; // decisions resolve on their own review date
    if (c.localDate >= cutoff) continue;
    const existing = (await db.getAllFromIndex('resolutions', 'by-commitment', c.id))[0];
    if (existing) continue;
    await resolveCommitment({ commitmentId: c.id, status: 'unresolved' });
    swept++;
  }
  return swept;
}

/** Decisions whose review date has passed and which have not been reviewed. */
export async function listOverdueReviews(): Promise<Commitment[]> {
  const db = await getDB();
  const open = await db.getAllFromIndex('commitments', 'by-status', 'open');
  const now = nowInstant();
  return open
    .filter((c) => c.tier === 'decision' && c.reviewDueAt !== null && c.reviewDueAt <= now)
    .sort((a, b) => (a.reviewDueAt ?? '').localeCompare(b.reviewDueAt ?? ''));
}

/* ---------------------------------------------------------------- */
/* Constraints                                                       */
/* ---------------------------------------------------------------- */

export async function listConstraints(): Promise<Constraint[]> {
  const db = await getDB();
  const all = await db.getAll('constraints');
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveConstraint(c: Omit<Constraint, 'id' | 'createdAt'> & { id?: ID }): Promise<Constraint> {
  const db = await getDB();
  const row: Constraint = {
    ...c,
    id: c.id ?? newId(),
    createdAt: nowInstant(),
  };
  await db.put('constraints', row);
  return row;
}

/* ---------------------------------------------------------------- */
/* Systems map                                                       */
/* ---------------------------------------------------------------- */

export async function listStocks(): Promise<Stock[]> {
  const db = await getDB();
  return (await db.getAll('stocks')).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveStock(s: Omit<Stock, 'id' | 'createdAt'> & { id?: ID }): Promise<Stock> {
  const db = await getDB();
  const row: Stock = { ...s, id: s.id ?? newId(), createdAt: nowInstant() };
  await db.put('stocks', row);
  return row;
}

export async function deleteStock(id: ID): Promise<void> {
  const db = await getDB();
  const flows = await db.getAllFromIndex('flows', 'by-stock', id);
  for (const f of flows) await deleteFlow(f.id);
  await db.delete('stocks', id);
}

export async function listFlows(stockId?: ID): Promise<Flow[]> {
  const db = await getDB();
  return stockId ? db.getAllFromIndex('flows', 'by-stock', stockId) : db.getAll('flows');
}

export async function saveFlow(f: Omit<Flow, 'id' | 'createdAt'> & { id?: ID }): Promise<Flow> {
  const db = await getDB();
  const row: Flow = { ...f, id: f.id ?? newId(), createdAt: nowInstant() };
  await db.put('flows', row);
  return row;
}

export async function deleteFlow(id: ID): Promise<void> {
  const db = await getDB();
  const logs = await db.getAllFromIndex('flowLogs', 'by-flow', id);
  const tx = db.transaction(['flows', 'flowLogs'], 'readwrite');
  for (const l of logs) await tx.objectStore('flowLogs').delete(l.id);
  await tx.objectStore('flows').delete(id);
  await tx.done;
}

export async function logFlow(flowId: ID, localDate: LocalDate, value: number): Promise<FlowLog> {
  const db = await getDB();
  const existing = await db.getAllFromIndex(
    'flowLogs',
    'by-flow-date',
    IDBKeyRange.only([flowId, localDate]),
  );
  const row: FlowLog = {
    id: existing[0]?.id ?? newId(),
    flowId,
    localDate,
    value,
    createdAt: nowInstant(),
  };
  await db.put('flowLogs', row);
  return row;
}

export async function listFlowLogs(flowId: ID): Promise<FlowLog[]> {
  const db = await getDB();
  const rows = await db.getAllFromIndex('flowLogs', 'by-flow', flowId);
  return rows.sort((a, b) => a.localDate.localeCompare(b.localDate));
}

export async function listFlowLogsForDate(localDate: LocalDate): Promise<FlowLog[]> {
  const db = await getDB();
  return db.getAllFromIndex('flowLogs', 'by-date', localDate);
}

export async function logStock(stockId: ID, localDate: LocalDate, value: number): Promise<void> {
  const db = await getDB();
  const all = await db.getAllFromIndex('stockLogs', 'by-stock', stockId);
  const existing = all.find((s) => s.localDate === localDate);
  const row: StockLog = {
    id: existing?.id ?? newId(),
    stockId,
    localDate,
    value,
    createdAt: nowInstant(),
  };
  await db.put('stockLogs', row);
  const stock = await db.get('stocks', stockId);
  if (stock) await db.put('stocks', { ...stock, currentValue: value });
}

export async function listStockLogs(stockId: ID): Promise<StockLog[]> {
  const db = await getDB();
  const rows = await db.getAllFromIndex('stockLogs', 'by-stock', stockId);
  return rows.sort((a, b) => a.localDate.localeCompare(b.localDate));
}

export async function listInterventions(): Promise<Intervention[]> {
  const db = await getDB();
  return (await db.getAll('interventions')).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export async function saveIntervention(
  i: Omit<Intervention, 'id' | 'createdAt'> & { id?: ID },
): Promise<Intervention> {
  const db = await getDB();
  const row: Intervention = { ...i, id: i.id ?? newId(), createdAt: nowInstant() };
  await db.put('interventions', row);
  return row;
}

export async function listHabitLoops(): Promise<HabitLoop[]> {
  const db = await getDB();
  return db.getAll('habitLoops');
}

export async function saveHabitLoop(
  h: Omit<HabitLoop, 'id' | 'createdAt'> & { id?: ID },
): Promise<HabitLoop> {
  const db = await getDB();
  const row: HabitLoop = { ...h, id: h.id ?? newId(), createdAt: nowInstant() };
  await db.put('habitLoops', row);
  return row;
}

export async function getAlertRecord(flowId: ID): Promise<AlertRecord | undefined> {
  const db = await getDB();
  return db.get('alerts', flowId);
}

export async function recordAlert(flowId: ID, on: LocalDate): Promise<void> {
  const db = await getDB();
  await db.put('alerts', { flowId, lastAlertedOn: on });
}

/* ---------------------------------------------------------------- */
/* Reframing                                                         */
/* ---------------------------------------------------------------- */

export async function listReframingLogs(): Promise<ReframingLog[]> {
  const db = await getDB();
  return (await db.getAll('reframingLogs')).sort((a, b) =>
    b.loggedBeforeTaskAt.localeCompare(a.loggedBeforeTaskAt),
  );
}

export async function saveReframingLog(
  r: Omit<ReframingLog, 'id'> & { id?: ID },
): Promise<ReframingLog> {
  const db = await getDB();
  const row: ReframingLog = { ...r, id: r.id ?? newId() };
  await db.put('reframingLogs', row);
  return row;
}

/* ---------------------------------------------------------------- */
/* Strategic sketches                                                */
/* ---------------------------------------------------------------- */

export async function listSketches(): Promise<GameSketch[]> {
  const db = await getDB();
  return (await db.getAll('gameSketches')).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export async function saveSketch(
  s: Omit<GameSketch, 'id' | 'createdAt'> & { id?: ID; createdAt?: string },
): Promise<GameSketch> {
  const db = await getDB();
  const row: GameSketch = {
    ...s,
    id: s.id ?? newId(),
    createdAt: s.createdAt ?? nowInstant(),
  };
  await db.put('gameSketches', row);
  return row;
}

export async function deleteSketch(id: ID): Promise<void> {
  const db = await getDB();
  await db.delete('gameSketches', id);
}
