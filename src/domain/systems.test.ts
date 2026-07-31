import { describe, expect, it } from 'vitest';
import {
  ALERT_COOLDOWN_DAYS,
  MIN_ALERT_WINDOW_DAYS,
  effectCheckDate,
  effectivenessByBand,
  evaluateFlowAlert,
} from './systems';
import { addDays } from './dates';
import type { FlowLog, Intervention } from './types';

const TODAY = '2026-03-01';

function logs(values: number[], endDate = TODAY): FlowLog[] {
  // values[last] is `endDate`, walking backwards day by day.
  return values.map((value, i) => ({
    id: `l${i}`,
    flowId: 'f',
    localDate: addDays(endDate, -(values.length - 1 - i)),
    value,
    createdAt: '2026-01-01T00:00:00.000Z',
  }));
}

function ctx(values: number[], patch: Partial<Parameters<typeof evaluateFlowAlert>[0]> = {}) {
  return {
    flowId: 'f',
    flowLabel: 'Late nights',
    stockName: 'Sleep debt',
    direction: 'inflow' as const,
    typicalDelayDays: 2,
    logs: logs(values),
    today: TODAY,
    lastAlertedOn: null,
    ...patch,
  };
}

describe('flow alerting (F25 — a hard floor and robust statistics)', () => {
  it('says nothing with only a couple of days of history', () => {
    // The v2.0 rule computed a standard deviation from 2xD days, which with
    // D=1 means an SD from two points.
    expect(evaluateFlowAlert(ctx([3, 9]))).toBeNull();
  });

  it('says nothing below the 21-day floor even with a huge spike', () => {
    const values = [...Array.from({ length: 17 }, () => 3), 20, 20, 20];
    expect(values.length).toBeLessThan(MIN_ALERT_WINDOW_DAYS + 3);
    expect(evaluateFlowAlert(ctx(values))).toBeNull();
  });

  it('fires on a sustained three-day departure once there is enough history', () => {
    const values = [...Array.from({ length: 25 }, () => 3), 20, 20, 20];
    const alert = evaluateFlowAlert(ctx(values));
    expect(alert).not.toBeNull();
    expect(alert!.direction).toBe('high');
    expect(alert!.breachedDates).toHaveLength(3);
    expect(alert!.message).toMatch(/Late nights/);
    expect(alert!.message).toMatch(/Sleep debt/);
  });

  it('ignores a single spike, however large', () => {
    const values = [...Array.from({ length: 27 }, () => 3), 40];
    expect(evaluateFlowAlert(ctx(values))).toBeNull();
  });

  it('detects a sustained drop as well as a rise', () => {
    const values = [...Array.from({ length: 25 }, (_, i) => 10 + (i % 2)), 1, 1, 1];
    const alert = evaluateFlowAlert(ctx(values));
    expect(alert).not.toBeNull();
    expect(alert!.direction).toBe('low');
  });

  it('stays quiet inside the cooldown window', () => {
    const values = [...Array.from({ length: 25 }, () => 3), 20, 20, 20];
    const recent = addDays(TODAY, -(ALERT_COOLDOWN_DAYS - 2));
    expect(evaluateFlowAlert(ctx(values, { lastAlertedOn: recent }))).toBeNull();
  });

  it('suppresses when too much of the window is unlogged', () => {
    // 22 logs spread across a 60-day window = >30% missing.
    const sparse = Array.from({ length: 22 }, (_, i) => ({
      id: `s${i}`,
      flowId: 'f',
      localDate: addDays(TODAY, -(i * 3)),
      value: i > 18 ? 20 : 3,
      createdAt: '2026-01-01T00:00:00.000Z',
    }));
    expect(
      evaluateFlowAlert(ctx([], { logs: sparse, typicalDelayDays: 20 })),
    ).toBeNull();
  });

  it('says nothing when the series never varies (zero spread)', () => {
    const values = Array.from({ length: 28 }, () => 5);
    expect(evaluateFlowAlert(ctx(values))).toBeNull();
  });
});

describe('effect check scheduling', () => {
  it('is at least two weeks out', () => {
    expect(effectCheckDate(TODAY, 0)).toBe(addDays(TODAY, 14));
  });

  it('scales to twice the longest delay', () => {
    expect(effectCheckDate(TODAY, 10)).toBe(addDays(TODAY, 20));
  });
});

describe('intervention effectiveness by band (F26)', () => {
  const iv = (
    leverageBand: Intervention['leverageBand'],
    effectObserved: Intervention['effectObserved'],
    i: number,
  ): Intervention => ({
    id: `i${i}`,
    stockId: 's',
    description: 'x',
    leverageBand,
    intendedDirection: 'decrease',
    effectCheckDueAt: '2026-01-01T00:00:00.000Z',
    effectObserved,
    effectNote: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  it('excludes "cannot tell" from the denominator rather than counting it as failure', () => {
    const rows = [
      iv('parameters', 'as_intended', 1),
      iv('parameters', 'no_change', 2),
      iv('parameters', 'too_noisy_to_tell', 3),
    ];
    const band = effectivenessByBand(rows).find((b) => b.band === 'parameters')!;
    expect(band.rate.n).toBe(2);
    expect(band.rate.hits).toBe(1);
    expect(band.tooNoisy).toBe(1);
  });

  it('gates a band until it has enough judged interventions', () => {
    const rows = [iv('rules', 'as_intended', 1), iv('rules', 'as_intended', 2)];
    const band = effectivenessByBand(rows).find((b) => b.band === 'rules')!;
    expect(band.sufficient).toBe(false);
  });

  it('covers all five Meadows bands, including goals and paradigms', () => {
    const bands = effectivenessByBand([]).map((b) => b.band);
    expect(bands).toEqual([
      'parameters',
      'feedback_and_delays',
      'information_flows',
      'rules',
      'goals_and_paradigms',
    ]);
  });
});
