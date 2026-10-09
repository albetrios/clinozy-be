import { describe, expect, it } from 'vitest';
import { toInstant, toText } from '@/shared/utils/validation/record-fields.util.js';
import { toCsv } from '@/shared/utils/text/csv.util.js';

describe('toText', () => {
  it('is empty for null and undefined', () => {
    expect(toText(null)).toBe('');
    expect(toText(undefined)).toBe('');
  });

  it('passes text through and prints numbers, booleans and bigints', () => {
    expect(toText('Vesu')).toBe('Vesu');
    expect(toText(12.5)).toBe('12.5');
    expect(toText(false)).toBe('false');
    expect(toText(9007199254740993n)).toBe('9007199254740993');
  });

  it('writes a Date as ISO 8601 and anything else as JSON', () => {
    expect(toText(new Date('2026-10-09T05:30:00.000Z'))).toBe('2026-10-09T05:30:00.000Z');
    expect(toText({ a: 1 })).toBe('{"a":1}');
    expect(toText(['x', 2])).toBe('["x",2]');
  });
});

describe('toInstant', () => {
  it('keeps null and writes a Date or text as an instant', () => {
    expect(toInstant(null)).toBeNull();
    expect(toInstant(new Date('2026-10-09T00:00:00.000Z'))).toBe('2026-10-09T00:00:00.000Z');
    expect(toInstant('2026-10-09T00:00:00Z')).toBe('2026-10-09T00:00:00Z');
  });
});

describe('toCsv cells', () => {
  it('joins lists with | (objects as JSON) and defuses formulas', () => {
    const csv = toCsv([{ tags: ['a', { b: 1 }], note: '=SUM(A1)', empty: null }]);
    expect(csv.split('\r\n')[1]).toBe('"a|{""b"":1}",\'=SUM(A1),');
  });
});
