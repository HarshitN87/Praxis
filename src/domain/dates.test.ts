import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateRange,
  daysBetween,
  formatDateHuman,
  hoursSince,
  toLocalDate,
  weekdayName,
} from './dates';

describe('day boundary (F12)', () => {
  /**
   * The v2.0 schema used `DEFAULT CURRENT_DATE`, which on a UTC server puts
   * an evening check-in in most of Asia on the following day.
   */
  it('places a 20:00 IST check-in on the correct local day', () => {
    // 2026-03-01T20:30 IST = 2026-03-01T15:00Z
    const at = new Date('2026-03-01T15:00:00.000Z');
    expect(toLocalDate(at, 'Asia/Kolkata', 4)).toBe('2026-03-01');
    // Naive UTC formatting would also give 03-01 here, but the timezone
    // matters for the late-evening case:
    const late = new Date('2026-03-01T19:00:00.000Z'); // 00:30 IST on the 2nd
    expect(toLocalDate(late, 'Asia/Kolkata', 4)).toBe('2026-03-01');
    expect(toLocalDate(late, 'UTC', 4)).toBe('2026-03-01');
  });

  it('keeps a 2am entry on the previous day with a 4am boundary', () => {
    const at = new Date('2026-03-02T02:30:00.000Z');
    expect(toLocalDate(at, 'UTC', 4)).toBe('2026-03-01');
  });

  it('rolls over once the boundary passes', () => {
    const at = new Date('2026-03-02T04:30:00.000Z');
    expect(toLocalDate(at, 'UTC', 4)).toBe('2026-03-02');
  });

  it('respects a midnight boundary when chosen', () => {
    const at = new Date('2026-03-02T02:30:00.000Z');
    expect(toLocalDate(at, 'UTC', 0)).toBe('2026-03-02');
  });

  it('falls back gracefully for an unknown timezone', () => {
    const at = new Date('2026-03-01T12:00:00.000Z');
    expect(toLocalDate(at, 'Not/AZone', 0)).toBe('2026-03-01');
  });
});

describe('date arithmetic', () => {
  it('adds and subtracts days across month ends', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('measures the gap between dates', () => {
    expect(daysBetween('2026-03-01', '2026-03-08')).toBe(7);
    expect(daysBetween('2026-03-08', '2026-03-01')).toBe(-7);
  });

  it('builds an inclusive range', () => {
    expect(dateRange('2026-03-01', '2026-03-04')).toEqual([
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
    ]);
  });

  it('names weekdays', () => {
    expect(weekdayName('2026-03-01')).toBe('Sun');
    expect(weekdayName('2026-03-02')).toBe('Mon');
  });
});

describe('human formatting', () => {
  it('uses relative words for nearby days', () => {
    expect(formatDateHuman('2026-03-01', '2026-03-01')).toBe('Today');
    expect(formatDateHuman('2026-02-28', '2026-03-01')).toBe('Yesterday');
    expect(formatDateHuman('2026-03-02', '2026-03-01')).toBe('Tomorrow');
  });

  it('falls back to a date for anything further out', () => {
    expect(formatDateHuman('2026-01-15', '2026-03-01')).toMatch(/15/);
  });
});

describe('hoursSince', () => {
  it('is infinite for a null timestamp so the lock defaults open', () => {
    expect(hoursSince(null)).toBe(Infinity);
  });

  it('measures elapsed hours', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
    expect(hoursSince(twoHoursAgo)).toBeCloseTo(2, 1);
  });
});
