import { describe, expect, it } from 'vitest';
import { organizationClock } from '@/domains/app/sub-domains/tasks/tasks.rule-tasks.js';

/** 10.A.10: "11:00 that day" — a wall-clock time on the organization's own calendar day. */
describe('organizationClock', () => {
  it('reads the day in the organization’s time zone, not the server’s', () => {
    // 20:00 UTC on 9 Oct is already 01:30 on 10 Oct in Kolkata.
    const now = new Date('2026-10-09T20:00:00Z');
    expect(
      organizationClock({ timeZone: 'Asia/Kolkata', days: 0, time: '11:00', now }).toISOString(),
    ).toBe('2026-10-10T05:30:00.000Z');
  });

  it('moves whole calendar days, across a month end', () => {
    const now = new Date('2026-10-31T06:00:00Z');
    expect(
      organizationClock({ timeZone: 'Asia/Kolkata', days: 1, time: '09:15', now }).toISOString(),
    ).toBe('2026-11-01T03:45:00.000Z');
    expect(
      organizationClock({ timeZone: 'Asia/Kolkata', days: -1, time: '09:15', now }).toISOString(),
    ).toBe('2026-10-30T03:45:00.000Z');
  });

  it('keeps the wall clock across a daylight-saving change', () => {
    // New York leaves daylight time on 1 Nov 2026: 11:00 is 15:00 UTC before, 16:00 after.
    const now = new Date('2026-10-31T16:00:00Z');
    expect(
      organizationClock({
        timeZone: 'America/New_York',
        days: 0,
        time: '11:00',
        now,
      }).toISOString(),
    ).toBe('2026-10-31T15:00:00.000Z');
    expect(
      organizationClock({
        timeZone: 'America/New_York',
        days: 1,
        time: '11:00',
        now,
      }).toISOString(),
    ).toBe('2026-11-01T16:00:00.000Z');
  });
});
