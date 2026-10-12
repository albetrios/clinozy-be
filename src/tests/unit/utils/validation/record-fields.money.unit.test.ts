import { describe, expect, it } from 'vitest';
import { paiseOf, roundToPaise } from '@/shared/utils/validation/record-fields.util.js';

/** `paiseOf` and `roundToPaise` — the exact integers the money rules add and compare. */
describe('paiseOf', () => {
  it('reads a number or a stored numeric as whole paise', () => {
    expect(paiseOf(1180)).toBe(118_000);
    expect(paiseOf('5084.75')).toBe(508_475);
    expect(paiseOf(0.07)).toBe(7);
  });

  it('is exact where floating point is not (0.1 + 0.2)', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(paiseOf(0.1) + paiseOf(0.2)).toBe(paiseOf(0.3));
    expect(paiseOf(0.1 + 0.2)).toBe(30);
  });

  it('reads nothing as 0', () => {
    expect(paiseOf(null)).toBe(0);
    expect(paiseOf(undefined)).toBe(0);
  });

  it('keeps the sign of a reversal', () => {
    expect(paiseOf(-250.5)).toBe(-25_050);
  });
});

describe('roundToPaise', () => {
  it('rounds to two decimals', () => {
    expect(roundToPaise(1000 - 999.99)).toBe(0.01);
    expect(roundToPaise(2 * 33.333)).toBe(66.67);
    expect(roundToPaise(0.1 + 0.2)).toBe(0.3);
  });
});
