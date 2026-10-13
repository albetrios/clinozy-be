import { describe, expect, it } from 'vitest';
import { Faker, base, en, en_IN } from '@faker-js/faker';
import { buildDemoClinicPlan, type DemoClinicPlan } from '@/scripts/seed/demo-clinic.plan.js';
import {
  addDaysToCalendarDate,
  minutesOfClockTime,
} from '@/shared/utils/validation/record-fields.util.js';

/** A plan from its own Faker, so suites running side by side never share a generator. */
function planFor(options: { seed: number; today: string; now: string }): DemoClinicPlan {
  const faker = new Faker({ locale: [en_IN, en, base] });
  faker.seed(options.seed);
  return buildDemoClinicPlan({ faker, today: options.today, now: options.now });
}

/** A week of days (Sunday included) at a morning, an afternoon and a late clock. */
const CASES = [0, 1, 2, 3, 4, 5, 6].flatMap((offset) =>
  ['09:10', '15:40', '21:05'].map((now) => ({
    seed: 12_345 + offset,
    today: addDaysToCalendarDate({ date: '2026-10-11', days: offset }),
    now,
  })),
);

/** Statuses that hold a slot — the appointments' exclusion constraints cover these. */
const HOLDING = new Set(['scheduled', 'confirmed', 'checked_in', 'completed']);

describe('buildDemoClinicPlan', () => {
  it('is deterministic for a seed and a day', () => {
    const options = { seed: 12_345, today: '2026-10-13', now: '15:40' };
    expect(planFor(options)).toEqual(planFor(options));
  });

  it('names a real-looking clinic and keeps every email on example.com', () => {
    const plan = planFor({ seed: 12_345, today: '2026-10-13', now: '15:40' });
    expect(plan.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(plan.name).not.toMatch(/demo/i);
    for (const member of plan.staff) expect(member.email).toMatch(/^[a-z]+\.[a-z]+@example\.com$/);
    for (const branch of plan.branches) expect(branch.email).toMatch(/\.example\.com$/);
    expect(plan.branches[0].gstNumber).toMatch(/^\d{2}[A-Z]{3}F[A-Z]\d{4}[A-Z]1Z[A-Z0-9]$/);
  });

  it.each(CASES)('books no doctor twice and keeps the day $today at $now valid', (options) => {
    const plan = planFor(options);
    const byDoctorDay = new Map<string, [number, number][]>();
    for (const visit of plan.appointments) {
      const start = minutesOfClockTime(visit.start);
      expect(visit.durationMinutes % 5).toBe(0);
      expect(start).toBeGreaterThanOrEqual(minutesOfClockTime('10:00'));
      expect(start + visit.durationMinutes).toBeLessThanOrEqual(minutesOfClockTime('19:00'));
      if (!HOLDING.has(visit.status)) continue;
      const key = `${visit.doctor}|${visit.date}`;
      const day = byDoctorDay.get(key) ?? [];
      for (const [from, to] of day) {
        expect(start + visit.durationMinutes <= from || start >= to).toBe(true);
      }
      day.push([start, start + visit.durationMinutes]);
      byDoctorDay.set(key, day);
    }
  });

  it.each(CASES)('fills every lane of Today on $today at $now', (options) => {
    const plan = planFor(options);
    const lanes = (branch: 'main' | 'second') =>
      new Set(
        plan.appointments
          .filter((visit) => visit.date === options.today && visit.branch === branch)
          .map((visit) => visit.visitStage ?? visit.status),
      );
    for (const lane of [
      'completed',
      'checkout',
      'with_doctor',
      'waiting',
      'confirmed',
      'scheduled',
    ]) {
      expect(lanes('main')).toContain(lane);
      expect(lanes('second')).toContain(lane);
    }
    expect(lanes('main')).toContain('treatment');
  });

  it.each(CASES)('links only to records it plans, never in the future ($today)', (options) => {
    const plan = planFor(options);
    const { today } = options;
    for (const patient of plan.patients) {
      expect(plan.people[patient.person]).toBeDefined();
      if (patient.lead !== undefined) expect(plan.leads[patient.lead]?.person).toBe(patient.person);
    }
    for (const note of plan.notes)
      expect(plan.appointments[note.appointment]?.status).toBe('completed');
    for (const treatment of plan.treatments) {
      // Done in the room: the visit is over, or its patient is at the desk paying.
      const visit = plan.appointments[treatment.appointment]!;
      expect(visit.status === 'completed' || visit.visitStage === 'checkout').toBe(true);
    }
    for (const invoice of plan.invoices) {
      expect(plan.appointments[invoice.appointment]!.date <= today).toBe(true);
      expect(invoice.paidShare).toBeGreaterThanOrEqual(0);
      expect(invoice.paidShare).toBeLessThanOrEqual(1);
    }
    for (const checkIn of plan.checkIns) expect(checkIn.date <= today).toBe(true);
    for (const review of plan.reviews) expect(review.date <= today).toBe(true);
    for (const task of plan.tasks) {
      const links = [task.lead, task.treatment, task.invoice].filter((link) => link !== undefined);
      expect(links.length).toBeLessThanOrEqual(1);
    }
  });

  it.each(CASES)(
    'records only the aftercare calls the rules would leave closed ($today)',
    (options) => {
      const plan = planFor(options);
      const rules = plan.tasks.filter((task) => task.kind === 'rule');
      expect(rules.length).toBeGreaterThan(0);
      for (const task of rules) {
        // Done, and opened after its treatment: a later run of the aftercare rule stays quiet.
        expect(task.status).toBe('done');
        const treatment = plan.treatments[task.treatment!]!;
        const visit = plan.appointments[treatment.appointment]!;
        expect(task.createdAt!.date).toBe(visit.date);
        expect(minutesOfClockTime(task.createdAt!.time)).toBeGreaterThan(
          minutesOfClockTime(treatment.at.time),
        );
        expect(plan.checkIns.some((checkIn) => checkIn.treatment === task.treatment)).toBe(false);
      }
    },
  );

  it.each(CASES)('gives every person their own name and number ($today)', (options) => {
    const plan = planFor(options);
    const everyone = [...plan.staff, ...plan.people];
    const names = everyone.map((person) => `${person.firstName} ${person.lastName}`);
    expect(new Set(names).size).toBe(names.length);
    const phones = everyone.map((person) => person.phone);
    expect(new Set(phones).size).toBe(phones.length);
    for (const phone of phones) expect(phone).toMatch(/^\+91[6-9]\d{9}$/);
  });
});
