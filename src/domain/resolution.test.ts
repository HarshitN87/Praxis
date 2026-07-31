import { describe, expect, it } from 'vitest';
import {
  auditResponses,
  computeQuantitativeOutcome,
  describeOutcome,
  hitRateBounds,
  isQuantified,
} from './resolution';
import { blank } from '../test/factories';
import type { Resolution } from './types';

const res = (patch: Partial<Resolution>): Resolution => ({
  id: 'r',
  commitmentId: 'c',
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
});

describe('computed hit target (F6)', () => {
  it('is false below the target — 5.5 of 6 hours is not a hit', () => {
    const out = computeQuantitativeOutcome(6, 5.5);
    expect(out.hitTarget).toBe(false);
    expect(out.attainment).toBeCloseTo(0.9167, 3);
  });

  it('is true at exactly the target', () => {
    expect(computeQuantitativeOutcome(6, 6).hitTarget).toBe(true);
  });

  it('is true above the target', () => {
    const out = computeQuantitativeOutcome(4, 5);
    expect(out.hitTarget).toBe(true);
    expect(out.attainment).toBe(1.25);
  });

  it('handles a zero target without dividing by zero', () => {
    expect(computeQuantitativeOutcome(0, 0).attainment).toBe(1);
  });
});

describe('describeOutcome (F11 — stated, never praised)', () => {
  it('states a miss plainly with no softening', () => {
    const c = blank('intention', { targetQuantity: 6, targetUnit: 'hours' });
    const text = describeOutcome(c, res({ actualQuantity: 5.5, hitTarget: false }));
    expect(text).toBe('5.5 hours of 6 hours — Target not met');
    expect(text).not.toMatch(/close|nearly|almost|!/i);
  });

  it('states an overshoot without celebrating it', () => {
    const c = blank('intention', { targetQuantity: 4, targetUnit: 'pomodoros' });
    const text = describeOutcome(c, res({ actualQuantity: 5, hitTarget: true }));
    expect(text).toMatch(/Target met/);
    expect(text).not.toMatch(/exceeded|great|well done|!/i);
  });

  it('labels a void and an unanswered entry distinctly', () => {
    const c = blank('intention');
    expect(describeOutcome(c, res({ status: 'void', voidReason: 'flu' }))).toBe('Voided');
    expect(describeOutcome(c, res({ status: 'unresolved' }))).toBe('Not answered');
  });

  it('handles binary intentions', () => {
    const c = blank('intention');
    expect(describeOutcome(c, res({ hitTarget: true }))).toBe('Done');
    expect(describeOutcome(c, res({ hitTarget: false }))).toBe('Not done');
  });
});

describe('isQuantified', () => {
  it('requires a positive target', () => {
    expect(isQuantified(blank('intention', { targetQuantity: 6 }))).toBe(true);
    expect(isQuantified(blank('intention', { targetQuantity: 0 }))).toBe(false);
    expect(isQuantified(blank('intention', { targetQuantity: null }))).toBe(false);
  });
});

describe('response audit (F7)', () => {
  it('counts unanswered entries rather than dropping them', () => {
    const audit = auditResponses([
      res({ status: 'resolved' }),
      res({ status: 'resolved' }),
      null,
      res({ status: 'unresolved' }),
      res({ status: 'void', voidReason: 'flu' }),
    ]);
    expect(audit.answered).toBe(2);
    expect(audit.unresolved).toBe(2);
    expect(audit.voided).toBe(1);
    expect(audit.responseRate).toBeCloseTo(0.5, 10);
  });

  it('excludes voids from the denominator so honesty is not punished', () => {
    const audit = auditResponses([res({ status: 'resolved' }), res({ status: 'void', voidReason: 'x' })]);
    expect(audit.total).toBe(1);
    expect(audit.responseRate).toBe(1);
  });
});

describe('hit-rate bounds (F7)', () => {
  /**
   * You skip the check-in on exactly the days that went badly, so the
   * observed rate is optimistic. The app shows the range the truth must sit
   * in whenever the response rate is below 100%.
   */
  it('brackets the observed rate with the best and worst cases', () => {
    const b = hitRateBounds(12, 18, 9);
    expect(b.observed).toBeCloseTo(12 / 18, 10);
    expect(b.worstCase).toBeCloseTo(12 / 27, 10);
    expect(b.bestCase).toBeCloseTo(21 / 27, 10);
    expect(b.worstCase).toBeLessThan(b.observed);
    expect(b.bestCase).toBeGreaterThan(b.observed);
  });

  it('collapses to the observed rate when nothing is missing', () => {
    const b = hitRateBounds(8, 10, 0);
    expect(b.worstCase).toBeCloseTo(b.observed, 10);
    expect(b.bestCase).toBeCloseTo(b.observed, 10);
  });
});
