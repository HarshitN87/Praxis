import { describe, expect, it } from 'vitest';
import {
  checkDistribution,
  formatAsFrequency,
  isExtreme,
  normalise,
  outOfTenToProbability,
  probabilityToOutOfTen,
} from './probability';

describe('frequency format (F1 — one scale everywhere)', () => {
  it('round-trips out-of-ten to probability', () => {
    for (let k = 0; k <= 10; k++) {
      expect(probabilityToOutOfTen(outOfTenToProbability(k))).toBe(k);
    }
  });

  it('clamps out-of-range input', () => {
    expect(outOfTenToProbability(-3)).toBe(0);
    expect(outOfTenToProbability(14)).toBe(1);
  });

  it('describes a probability as a frequency', () => {
    expect(formatAsFrequency(0.7)).toBe('7 in 10');
  });
});

describe('extremes', () => {
  it('flags near-certainty in both directions', () => {
    expect(isExtreme(0)).toBe(true);
    expect(isExtreme(1)).toBe(true);
    expect(isExtreme(0.99)).toBe(true);
    expect(isExtreme(0.5)).toBe(false);
  });
});

describe('distribution checking (F21 — enforced, not promised)', () => {
  it('accepts a distribution summing to one', () => {
    expect(checkDistribution([0.6, 0.3, 0.1]).valid).toBe(true);
  });

  it('rejects one that does not', () => {
    const r = checkDistribution([0.6, 0.6]);
    expect(r.valid).toBe(false);
    expect(r.message).toMatch(/120%/);
  });

  it('rejects a single-outcome decision', () => {
    expect(checkDistribution([1]).valid).toBe(false);
  });

  it('allows a small rounding tolerance', () => {
    expect(checkDistribution([0.333, 0.333, 0.334]).valid).toBe(true);
  });

  it('rejects out-of-range probabilities', () => {
    expect(checkDistribution([1.5, -0.5]).valid).toBe(false);
  });
});

describe('normalise', () => {
  it('rescales to sum to one, preserving ratios', () => {
    const out = normalise([0.6, 0.6]);
    expect(out[0]).toBeCloseTo(0.5, 10);
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('falls back to a uniform distribution when everything is zero', () => {
    expect(normalise([0, 0])).toEqual([0.5, 0.5]);
  });
});
