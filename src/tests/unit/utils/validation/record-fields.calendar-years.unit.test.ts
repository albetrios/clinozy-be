import { describe, expect, it } from 'vitest';
import {
  subtractYearsFromCalendarDate,
  wholeYearsBetweenCalendarDates,
} from '@/shared/utils/validation/record-fields.util.js';

/**
 * A typed age's approximate birth date and a birth date's age (feat-approximate-age AG2, AG3):
 * whole years, the birthday not yet reached, and 29 February in a non-leap year — the same day
 * Postgres's `date - interval 'n years'` lands on, so the stored date, the age and the filter agree.
 */
describe('calendar-year helpers', () => {
  it('subtracts whole years from a date', () => {
    expect(subtractYearsFromCalendarDate({ date: '2026-10-31', years: 34 })).toBe('1992-10-31');
    expect(subtractYearsFromCalendarDate({ date: '2026-10-31', years: 0 })).toBe('2026-10-31');
  });

  it('moves 29 February to 28 February in a non-leap year', () => {
    expect(subtractYearsFromCalendarDate({ date: '2024-02-29', years: 1 })).toBe('2023-02-28');
    expect(subtractYearsFromCalendarDate({ date: '2024-02-29', years: 4 })).toBe('2020-02-29');
  });

  it('counts whole years, one less until the birthday', () => {
    expect(wholeYearsBetweenCalendarDates({ from: '1992-10-31', to: '2026-10-31' })).toBe(34);
    expect(wholeYearsBetweenCalendarDates({ from: '1992-11-01', to: '2026-10-31' })).toBe(33);
    expect(wholeYearsBetweenCalendarDates({ from: '2026-10-31', to: '2026-10-31' })).toBe(0);
  });

  it('turns someone born on 29 February a year older on 1 March in a non-leap year', () => {
    expect(wholeYearsBetweenCalendarDates({ from: '2000-02-29', to: '2001-02-28' })).toBe(0);
    expect(wholeYearsBetweenCalendarDates({ from: '2000-02-29', to: '2001-03-01' })).toBe(1);
  });

  it('reads back the age a date was made from', () => {
    for (const years of [0, 1, 34, 120]) {
      const date = subtractYearsFromCalendarDate({ date: '2028-02-29', years });
      expect(wholeYearsBetweenCalendarDates({ from: date, to: '2028-02-29' })).toBe(years);
    }
  });
});
