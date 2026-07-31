import { beforeEach, describe, expect, it } from 'vitest';
import * as repo from './repo';
import { exportAll, importBackup, wipeEverything } from './backup';
import { workingForecast } from '../domain/calibration';

beforeEach(async () => {
  await wipeEverything();
  await repo.ensureSeeded();
});

describe('seeding', () => {
  it('creates default settings and categories once', async () => {
    const s = await repo.getSettings();
    expect(s.id).toBe('singleton');
    expect(s.dayBoundaryHour).toBe(4);
    // F31 — the daily reminder defaults ON, because a daily module cannot
    // run on the spec's one-per-week cap.
    expect(s.dailyReminderEnabled).toBe(true);

    const cats = await repo.listCategories();
    expect(cats.length).toBeGreaterThan(0);

    await repo.ensureSeeded();
    expect((await repo.listCategories()).length).toBe(cats.length);
  });
});

describe('working forecast invariant (F21)', () => {
  it('keeps exactly one working forecast per commitment', async () => {
    const c = await repo.saveCommitment(repo.blankCommitment('intention', '2026-03-01'));

    await repo.savePrediction({
      commitmentId: c.id,
      kind: 'binary',
      pass: 'first',
      outcomes: [{ optionId: null, label: 'x', probability: 0.6 }],
    });
    await repo.savePrediction({
      commitmentId: c.id,
      kind: 'binary',
      pass: 'second',
      outcomes: [{ optionId: null, label: 'x', probability: 0.3 }],
    });
    await repo.savePrediction({
      commitmentId: c.id,
      kind: 'binary',
      pass: 'averaged',
      outcomes: [{ optionId: null, label: 'x', probability: 0.45 }],
    });

    const preds = await repo.listPredictions(c.id);
    expect(preds).toHaveLength(3);
    expect(preds.filter((p) => p.isWorkingForecast)).toHaveLength(1);
    expect(workingForecast(preds)!.pass).toBe('averaged');
  });

  it('leaves the working flag alone when makeWorking is false', async () => {
    const c = await repo.saveCommitment(repo.blankCommitment('intention', '2026-03-01'));
    await repo.savePrediction({
      commitmentId: c.id,
      kind: 'binary',
      pass: 'first',
      outcomes: [{ optionId: null, label: 'x', probability: 0.6 }],
    });
    await repo.savePrediction({
      commitmentId: c.id,
      kind: 'binary',
      pass: 'second',
      outcomes: [{ optionId: null, label: 'x', probability: 0.3 }],
      makeWorking: false,
    });
    const preds = await repo.listPredictions(c.id);
    expect(preds.filter((p) => p.isWorkingForecast)).toHaveLength(1);
    expect(workingForecast(preds)!.pass).toBe('first');
  });
});

describe('resolution computes rather than accepts the verdict (F6)', () => {
  it('marks 5.5 of 6 as a miss even though the user only typed a number', async () => {
    const c = await repo.saveCommitment({
      ...repo.blankCommitment('intention', '2026-03-01'),
      title: 'Study',
      targetQuantity: 6,
      targetUnit: 'hours',
      resolutionCriterion: 'timer',
    });
    await repo.savePrediction({
      commitmentId: c.id,
      kind: 'binary',
      pass: 'first',
      outcomes: [{ optionId: null, label: 'Study', probability: 0.8 }],
    });

    const r = await repo.resolveCommitment({
      commitmentId: c.id,
      status: 'resolved',
      actualQuantity: 5.5,
    });

    expect(r.hitTarget).toBe(false);
    expect(r.attainment).toBeCloseTo(0.9167, 3);
    expect(r.brierComponent).toBeCloseTo(0.64, 6);
  });

  it('accepts the tap only when there is no target', async () => {
    const c = await repo.saveCommitment({
      ...repo.blankCommitment('intention', '2026-03-01'),
      title: 'Call the bank',
      resolutionCriterion: 'called',
    });
    await repo.savePrediction({
      commitmentId: c.id,
      kind: 'binary',
      pass: 'first',
      outcomes: [{ optionId: null, label: 'x', probability: 0.5 }],
    });
    const r = await repo.resolveCommitment({ commitmentId: c.id, status: 'resolved', didIt: true });
    expect(r.hitTarget).toBe(true);
  });

  it('records a void with its reason and excludes it from scoring', async () => {
    const c = await repo.saveCommitment(repo.blankCommitment('intention', '2026-03-01'));
    await repo.savePrediction({
      commitmentId: c.id,
      kind: 'binary',
      pass: 'first',
      outcomes: [{ optionId: null, label: 'x', probability: 0.5 }],
    });
    const r = await repo.resolveCommitment({
      commitmentId: c.id,
      status: 'void',
      voidReason: 'fever',
    });
    expect(r.status).toBe('void');
    expect(r.voidReason).toBe('fever');
    expect(r.brierComponent).toBeNull();
  });
});

describe('abandonment is a resolution (F20)', () => {
  it('keeps an abandoned decision in the denominator', async () => {
    const c = await repo.saveCommitment({
      ...repo.blankCommitment('decision', '2026-03-01'),
      title: 'A venture',
      reversibility: 'hard_to_reverse',
    });
    const opts = await repo.setOptions(c.id, [{ label: 'go' }, { label: 'stay' }]);
    await repo.savePrediction({
      commitmentId: c.id,
      kind: 'multi',
      pass: 'first',
      outcomes: [
        { optionId: opts[0]!.id, label: 'go', probability: 0.7 },
        { optionId: opts[1]!.id, label: 'stay', probability: 0.3 },
      ],
    });

    await repo.abandonCommitment(c.id, 'ran out of runway');

    const full = await repo.getFull(c.id);
    expect(full!.commitment.status).toBe('abandoned');
    expect(full!.resolution).not.toBeNull();
    expect(full!.resolution!.status).toBe('resolved');
    expect(full!.resolution!.unforeseenOutcome).toBe(true);
    // Scored, not silently dropped: 0.7^2 + 0.3^2
    expect(full!.resolution!.brierComponent).toBeCloseTo(0.58, 6);
  });
});

describe('sweeping unanswered intentions (F7)', () => {
  it('converts stale open intentions into an explicit unresolved state', async () => {
    const old = await repo.saveCommitment(repo.blankCommitment('intention', '2020-01-01'));
    await repo.savePrediction({
      commitmentId: old.id,
      kind: 'binary',
      pass: 'first',
      outcomes: [{ optionId: null, label: 'x', probability: 0.5 }],
    });

    const swept = await repo.sweepUnresolved('UTC', 4);
    expect(swept).toBe(1);

    const full = await repo.getFull(old.id);
    expect(full!.resolution!.status).toBe('unresolved');
    expect(full!.resolution!.brierComponent).toBeNull();
  });

  it('leaves recent intentions and all decisions alone', async () => {
    const todayLocal = new Date().toISOString().slice(0, 10);
    await repo.saveCommitment(repo.blankCommitment('intention', todayLocal));
    await repo.saveCommitment(repo.blankCommitment('decision', '2020-01-01'));
    expect(await repo.sweepUnresolved('UTC', 4)).toBe(0);
  });
});

describe('cascade delete', () => {
  it('removes every child row with the commitment', async () => {
    const c = await repo.saveCommitment(repo.blankCommitment('decision', '2026-03-01'));
    await repo.setOptions(c.id, [{ label: 'a' }, { label: 'b' }]);
    await repo.setPremortems(c.id, [
      { failureMechanism: 'x', estimatedLikelihood: 'low', isReversibleIfHit: true },
    ]);
    await repo.savePrediction({
      commitmentId: c.id,
      kind: 'multi',
      pass: 'first',
      outcomes: [{ optionId: null, label: 'a', probability: 1 }],
    });

    await repo.deleteCommitment(c.id);

    expect(await repo.getFull(c.id)).toBeNull();
    expect(await repo.listOptions(c.id)).toHaveLength(0);
    expect(await repo.listPremortems(c.id)).toHaveLength(0);
    expect(await repo.listPredictions(c.id)).toHaveLength(0);
  });
});

describe('overdue reviews', () => {
  it('surfaces decisions past their review date', async () => {
    await repo.saveCommitment({
      ...repo.blankCommitment('decision', '2026-01-01'),
      title: 'Past due',
      reviewDueAt: '2020-01-01T00:00:00.000Z',
    });
    await repo.saveCommitment({
      ...repo.blankCommitment('decision', '2026-01-01'),
      title: 'Future',
      reviewDueAt: '2099-01-01T00:00:00.000Z',
    });
    const overdue = await repo.listOverdueReviews();
    expect(overdue).toHaveLength(1);
    expect(overdue[0]!.title).toBe('Past due');
  });
});

describe('flow logging', () => {
  it('upserts one value per flow per day', async () => {
    const stock = await repo.saveStock({ name: 'Sleep debt', unit: 'hours', currentValue: null });
    const flow = await repo.saveFlow({
      stockId: stock.id,
      direction: 'inflow',
      label: 'Late nights',
      typicalDelayDays: 2,
    });
    await repo.logFlow(flow.id, '2026-03-01', 3);
    await repo.logFlow(flow.id, '2026-03-01', 5);
    const logs = await repo.listFlowLogs(flow.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.value).toBe(5);
  });

  it('deletes a stock together with its flows and logs', async () => {
    const stock = await repo.saveStock({ name: 'S', unit: 'u', currentValue: null });
    const flow = await repo.saveFlow({
      stockId: stock.id,
      direction: 'outflow',
      label: 'f',
      typicalDelayDays: 0,
    });
    await repo.logFlow(flow.id, '2026-03-01', 1);
    await repo.deleteStock(stock.id);
    expect(await repo.listStocks()).toHaveLength(0);
    expect(await repo.listFlows()).toHaveLength(0);
    expect(await repo.listFlowLogs(flow.id)).toHaveLength(0);
  });
});

describe('backup round trip', () => {
  it('exports and restores every store', async () => {
    const c = await repo.saveCommitment({
      ...repo.blankCommitment('intention', '2026-03-01'),
      title: 'Study',
      targetQuantity: 6,
    });
    await repo.savePrediction({
      commitmentId: c.id,
      kind: 'binary',
      pass: 'first',
      outcomes: [{ optionId: null, label: 'Study', probability: 0.8 }],
    });
    await repo.resolveCommitment({ commitmentId: c.id, status: 'resolved', actualQuantity: 7 });

    const backup = await exportAll();
    const json = JSON.stringify(backup);

    await wipeEverything();
    await repo.ensureSeeded();
    expect(await repo.listAllCommitments()).toHaveLength(0);

    const result = await importBackup(json);
    expect(result.ok).toBe(true);

    const restored = await repo.getFull(c.id);
    expect(restored!.commitment.title).toBe('Study');
    expect(restored!.resolution!.hitTarget).toBe(true);
    expect(restored!.predictions[0]!.outcomes[0]!.probability).toBe(0.8);
  });

  it('rejects an unrecognised format rather than corrupting the database', async () => {
    const result = await importBackup(JSON.stringify({ format: 'something-else', data: {} }));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Unrecognised/);
  });

  it('rejects invalid JSON', async () => {
    const result = await importBackup('not json at all');
    expect(result.ok).toBe(false);
  });
});
