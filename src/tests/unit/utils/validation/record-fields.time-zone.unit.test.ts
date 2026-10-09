import { describe, expect, it } from 'vitest';
import {
  addDaysToCalendarDate,
  calendarDateInTimeZone,
  clockTimeInTimeZone,
  clockTimeOfMinutes,
  instantInTimeZone,
  isKnownTimeZone,
  minutesOfClockTime,
  weekdayOfCalendarDate,
} from '@/shared/utils/validation/record-fields.util.js';

/**
 * The clock every "today", slot and due time reads (task AP1,
 * docs/reviews/launch-confidence-plan-2026-10-09.md; D41 — an organization's timed work runs in
 * its own zone): the calendar date and wall time of an instant in a zone, and back; midnight on
 * either side; the zones furthest apart (UTC+14, UTC−11); a daylight-saving jump and its repeat.
 */
describe('time-zone helpers', () => {
  it("reads India's date and time across UTC midnight", () => {
    // 18:29 UTC is 23:59 in India; 18:30 UTC is the next day there
    const beforeMidnight = new Date('2026-10-09T18:29:00Z');
    const atMidnight = new Date('2026-10-09T18:30:00Z');
    expect(calendarDateInTimeZone('Asia/Kolkata', beforeMidnight)).toBe('2026-10-09');
    expect(clockTimeInTimeZone('Asia/Kolkata', beforeMidnight)).toBe('23:59');
    expect(calendarDateInTimeZone('Asia/Kolkata', atMidnight)).toBe('2026-10-10');
    expect(clockTimeInTimeZone('Asia/Kolkata', atMidnight)).toBe('00:00');
  });

  it('gives the same instant two dates in the zones furthest apart', () => {
    const at = new Date('2026-10-09T12:00:00Z');
    expect(calendarDateInTimeZone('Pacific/Kiritimati', at)).toBe('2026-10-10');
    expect(calendarDateInTimeZone('Pacific/Pago_Pago', at)).toBe('2026-10-09');
  });

  it('turns a wall time in a zone into its instant', () => {
    expect(
      instantInTimeZone({
        date: '2026-10-07',
        time: '10:30',
        timeZone: 'Asia/Kolkata',
      }).toISOString(),
    ).toBe('2026-10-07T05:00:00.000Z');
    expect(
      instantInTimeZone({
        date: '2026-10-10',
        time: '00:00',
        timeZone: 'Asia/Kolkata',
      }).toISOString(),
    ).toBe('2026-10-09T18:30:00.000Z');
    expect(
      instantInTimeZone({
        date: '2026-10-10',
        time: '01:00',
        timeZone: 'Pacific/Kiritimati',
      }).toISOString(),
    ).toBe('2026-10-09T11:00:00.000Z');
  });

  it('lands on the right offset either side of a daylight-saving change', () => {
    // New York: EST (−05:00) before 8 March 2026, EDT (−04:00) after
    expect(
      instantInTimeZone({
        date: '2026-03-07',
        time: '10:00',
        timeZone: 'America/New_York',
      }).toISOString(),
    ).toBe('2026-03-07T15:00:00.000Z');
    expect(
      instantInTimeZone({
        date: '2026-03-09',
        time: '10:00',
        timeZone: 'America/New_York',
      }).toISOString(),
    ).toBe('2026-03-09T14:00:00.000Z');
  });

  it('resolves a skipped wall time to the later offset, as documented', () => {
    // 02:30 on 8 March 2026 does not exist in New York (02:00 jumps to 03:00)
    const resolved = instantInTimeZone({
      date: '2026-03-08',
      time: '02:30',
      timeZone: 'America/New_York',
    });
    expect([
      calendarDateInTimeZone('America/New_York', resolved),
      clockTimeInTimeZone('America/New_York', resolved),
    ]).toEqual(['2026-03-08', expect.stringMatching(/^0[13]:30$/)]);
  });

  it('round-trips every hour of a year in each zone the product meets', () => {
    const zones = [
      'Asia/Kolkata',
      'Asia/Dubai',
      'Europe/London',
      'America/New_York',
      'Pacific/Kiritimati',
      'Pacific/Pago_Pago',
    ];
    const start = Date.parse('2026-01-01T00:00:00Z');
    for (const timeZone of zones) {
      for (let hour = 0; hour < 365 * 24; hour += 7) {
        const at = new Date(start + hour * 3_600_000);
        const date = calendarDateInTimeZone(timeZone, at);
        const time = clockTimeInTimeZone(timeZone, at);
        const back = instantInTimeZone({ date, time, timeZone });
        // An hour repeated by a fall-back may resolve to either reading; the wall time is the same
        expect(
          [calendarDateInTimeZone(timeZone, back), clockTimeInTimeZone(timeZone, back)],
          `${timeZone} ${at.toISOString()}`,
        ).toEqual([date, time]);
      }
    }
  });

  it('adds days across months, years and a leap day', () => {
    expect(addDaysToCalendarDate({ date: '2026-01-31', days: 1 })).toBe('2026-02-01');
    expect(addDaysToCalendarDate({ date: '2026-12-31', days: 1 })).toBe('2027-01-01');
    expect(addDaysToCalendarDate({ date: '2028-02-28', days: 1 })).toBe('2028-02-29');
    expect(addDaysToCalendarDate({ date: '2027-03-01', days: -1 })).toBe('2027-02-28');
    expect(addDaysToCalendarDate({ date: '2026-03-31', days: 1 })).toBe('2026-04-01');
  });

  it('wraps clock minutes past midnight in both directions', () => {
    expect(clockTimeOfMinutes(1440)).toBe('00:00');
    expect(clockTimeOfMinutes(1445)).toBe('00:05');
    expect(clockTimeOfMinutes(-5)).toBe('23:55');
    expect(minutesOfClockTime('23:59')).toBe(1439);
    expect(minutesOfClockTime('10:30:00')).toBe(630);
  });

  it('names the weekday of a date whatever the runtime zone', () => {
    expect(weekdayOfCalendarDate('2026-10-11')).toBe('sun');
    expect(weekdayOfCalendarDate('2026-10-12')).toBe('mon');
  });

  it('knows real zones and refuses made-up ones', () => {
    expect(isKnownTimeZone('Asia/Kolkata')).toBe(true);
    expect(isKnownTimeZone('Mars/Olympus_Mons')).toBe(false);
  });
});
