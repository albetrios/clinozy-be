import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorSql } from '@/tests/helpers/operator-database.js';
import { runOrganizationScopedWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import {
  calendarDateInTimeZone,
  instantInTimeZone,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  runTaskRulesJob,
  type TaskRulesRunCounts,
} from '@/domains/app/sub-domains/tasks/workers/task-rules.processor.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';

const HOUR = 3_600_000;

/** The fifteen rules, in the Rules popover's order. */
const RULES = [
  'reply',
  'failed_message',
  'follow_up',
  'claim',
  'confirm',
  'arrive',
  'rebook',
  'feedback',
  'aftercare',
  'call_back',
  'next_visit',
  'gone_quiet',
  'payment_due',
  'settle_by',
  'medical_rep_visit',
] as const;

/** The `Etc/GMT` zone of a whole-hour UTC offset (`Etc/GMT-5` is UTC+5 — POSIX's sign). */
function zoneOfOffset(offsetHours: number): string {
  if (offsetHours === 0) return 'Etc/GMT';
  return `Etc/GMT${offsetHours > 0 ? '-' : '+'}${Math.abs(offsetHours)}`;
}

/**
 * The whole-hour UTC offset whose local hour is `hour` right now — kept within −10…+13, so the
 * offset one hour on (the same instant an hour later on the wall) is a real zone too.
 */
function offsetAtLocalHour(hour: number): number {
  const offset = (((hour - new Date().getUTCHours()) % 24) + 24) % 24;
  return offset > 13 ? offset - 24 : offset;
}

/** Waits out the last seconds of a UTC hour, so a step's local hour cannot turn under it. */
async function clearOfTheHour(): Promise<void> {
  const toNextHour = HOUR - (Date.now() % HOUR);
  if (toNextHour < 15_000) {
    await new Promise((resolve) => setTimeout(resolve, toNextHour + 1_000));
  }
}

/**
 * The task rules against the clock (tasks R1 and R3, docs/reviews/launch-confidence-plan-2026-10-09.md;
 * routes-final 10.A.10, TK4, TK7, TK10, D41). The rules read `now()` in the organization's time
 * zone, so the test's clock is the zone: a fixed-offset zone is chosen whose wall clock reads the
 * hour a case needs (10:xx, then 11:xx; 23:xx, then 00:xx), and the organization is moved into it
 * before a run. R3: two runs of one organization at once take each of Clinozy's steps once.
 */
describe('Task rules — the clock and overlapping runs (TK4, TK10, D41)', () => {
  const S = String(Date.now());
  const T = `r${S}`;
  const digits = `6${S.slice(-7)}`;

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let vesu = '';
  let homeZone = '';
  let consult = '';
  let contactSuffix = 10;

  /** Moves the organization into `zone` (the rules read it on every run). */
  async function setZone(zone: string): Promise<void> {
    await getOperatorSql()`
      UPDATE tenancy.organizations SET timezone = ${zone}
      WHERE public_id = ${fixture.organization.publicId}
    `;
  }

  /** One run of the task rules for the fixture organization, now. */
  async function runTaskRules(): Promise<TaskRulesRunCounts> {
    const organizationPublicId = fixture.organization.publicId;
    return runOrganizationScopedWorkerJob({ organizationPublicId }, (databaseHandle) =>
      runTaskRulesJob(databaseHandle, organizationPublicId),
    );
  }

  /** Every rule on; `automatic` ones set to "Let Clinozy handle". */
  async function setRules(automatic: readonly string[] = []): Promise<void> {
    flow.as('owner');
    await flow.expect(200, 'the rules', 'PUT', '/app/task-rule-settings', {
      rules: RULES.map((rule_key) => ({
        rule_key,
        is_on: true,
        is_automatic: automatic.includes(rule_key),
      })),
    });
  }

  /** A contact of this run, with a patient file at Vesu (a clinic bill needs one). */
  async function patient(firstName: string): Promise<string> {
    contactSuffix += 1;
    flow.as('owner');
    await flow.expect(200, `contact ${firstName}`, 'POST', '/app/contacts', {
      first_name: firstName,
      last_name: T,
      phones: [{ phone: `+91${digits}${contactSuffix}`, is_primary: true }],
    });
    const contact = flow.last('.data.id');
    await flow.expect(200, `${firstName}'s file`, 'POST', '/app/patients', {
      contact_id: contact,
      home_branch_id: vesu,
    });
    return contact;
  }

  /** An unpaid bill for the contact, dated `invoiceDate`. */
  async function unpaidBill(contact: string, invoiceDate: string): Promise<string> {
    flow.as('owner');
    await flow.expect(200, `a bill dated ${invoiceDate}`, 'POST', '/app/invoices', {
      branch_id: vesu,
      contact_id: contact,
      invoice_date: invoiceDate,
      items: [{ offering_id: consult, quantity: 1 }],
    });
    return flow.last('.data.id');
  }

  /** The rule's tasks for a record (`filter`: `contact_id=…`), everyone's, on one tab. */
  async function ruleTasks(rule: string, filter: string, tab = 'open'): Promise<void> {
    flow.as('owner');
    await flow.expect(
      200,
      `the ${rule} tasks (${tab})`,
      'GET',
      `/app/tasks?scope=everyone&tab=${tab}&rule_key=${rule}&${filter}`,
    );
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture).as('owner');
    vesu = fixture.branches.vesu;
    homeZone = fixture.organization.timezone;
    await flow.expect(200, 'offering Consult', 'POST', '/app/offerings', {
      name: `Rules consult ${T}`,
      category: 'consultation',
      price: 500,
    });
    consult = flow.last('.data.id');
  });

  beforeEach(async () => {
    await setZone(homeZone);
    await setRules();
  });

  afterAll(async () => {
    await setZone(homeZone);
    await app.close();
  });

  it.each([
    [10, 'open', 'not taken yet — due at 11:00'],
    [11, 'done', 'taken — 11:00 has passed'],
  ])(
    "R1: a payment due at 11:00, run at %i:xx on the organization's clock: %s",
    async (hour, tab, label) => {
      const contact = await patient(`Mira${hour}`);
      await setRules(['payment_due']);
      await clearOfTheHour();
      const zone = zoneOfOffset(offsetAtLocalHour(hour));
      await setZone(zone);
      const today = calendarDateInTimeZone(zone, new Date());
      await unpaidBill(contact, calendarDateInTimeZone(zone, new Date(Date.now() - 24 * HOUR)));

      await runTaskRules();
      await ruleTasks('payment_due', `contact_id=${contact}`, tab);
      flow.expectValue(
        label,
        '[(.data | length), .data[0].is_resolved_automatically] | map(tostring) | join(",")',
        `1,${tab === 'done'}`,
      );
      expect(
        new Date(flow.last('.data[0].due_at')).toISOString(),
        'due 11:00 the next day, local',
      ).toBe(instantInTimeZone({ date: today, time: '11:00', timeZone: zone }).toISOString());
    },
  );

  it('R1: arrive fires 15 minutes after the start — not at 13, at 18 — and a visit moved to tomorrow leaves it', async () => {
    const contact = await patient('Nisha');
    flow.as('owner');
    let visit = '';
    for (let offset = 30; offset <= 44 && visit === ''; offset += 1) {
      const booked = await flow.call('POST', '/app/appointments', {
        contact_id: contact,
        branch_id: vesu,
        doctor_membership_id: fixture.members.doctor.membershipPublicId,
        appointment_date: calendarDay(fixture, offset),
        start_time: '11:00',
        service_label: 'Consultation',
      });
      if (booked.status === 200) visit = flow.last('.data.id');
    }
    expect(visit, 'book Nisha').not.toBe('');
    await clearOfTheHour();
    const zone = zoneOfOffset(offsetAtLocalHour(12));
    await setZone(zone);
    /** Moves the visit to start `minutesAgo` minutes ago (to the minute), on today's local date. */
    const startAgo = async (minutesAgo: number) => {
      await getOperatorSql()`
        UPDATE app.appointments
        SET appointment_date = ((now() - make_interval(mins => ${minutesAgo})) at time zone ${zone})::date,
            start_time = date_trunc('minute', (now() - make_interval(mins => ${minutesAgo})) at time zone ${zone})::time
        WHERE public_id = ${visit}
      `;
    };

    await startAgo(13);
    await runTaskRules();
    await ruleTasks('arrive', `appointment_id=${visit}`);
    flow.expectValue('13 minutes in — no task yet', '.data | length', 0);

    await startAgo(18);
    await runTaskRules();
    await ruleTasks('arrive', `appointment_id=${visit}`);
    flow.expectValue('18 minutes in — the arrive task', '.data | length', 1);
    const arriveTask = flow.last('.data[0].id');

    await getOperatorSql()`
      UPDATE app.appointments SET appointment_date = appointment_date + 1 WHERE public_id = ${visit}
    `;
    await runTaskRules();
    await flow.expect(200, 'the arrive task', 'GET', `/app/tasks/${arriveTask}`);
    flow.expectValue(
      'moved to tomorrow — closed by Clinozy',
      '[.data.status, .data.result_text] | join(",")',
      'done,Done by Clinozy',
    );
    await ruleTasks('confirm', `appointment_id=${visit}`);
    flow.expectValue('and tomorrow it needs confirming', '.data | length', 1);
  });

  it("R1: a follow-up turns due at the organization's midnight; a snooze to midnight wakes after it", async () => {
    const contact = await patient('Opal');
    await clearOfTheHour();
    const elevenAtNight = offsetAtLocalHour(23);
    const nextHour = Math.ceil(Date.now() / HOUR) * HOUR;
    await setZone(zoneOfOffset(elevenAtNight));
    flow.as('owner');
    await flow.expect(200, "Opal's lead, follow-up at 00:05", 'POST', '/app/leads', {
      contact_id: contact,
      branch_id: vesu,
      owner_membership_id: fixture.members.counsellor.membershipPublicId,
      follow_up_at: new Date(nextHour + 5 * 60_000).toISOString(),
    });
    const lead = flow.last('.data.id');

    await runTaskRules();
    await ruleTasks('follow_up', `lead_id=${lead}`);
    flow.expectValue('23:xx — tomorrow, nothing yet', '.data | length', 0);

    const midnightZone = zoneOfOffset(elevenAtNight + 1);
    await setZone(midnightZone);
    await runTaskRules();
    await ruleTasks('follow_up', `lead_id=${lead}`);
    flow.expectValue('00:xx — today, a follow-up task', '.data | length', 1);
    const followUp = flow.last('.data[0].id');
    expect(new Date(flow.last('.data[0].due_at')).toISOString(), 'due 11:00 that day').toBe(
      instantInTimeZone({
        date: calendarDateInTimeZone(midnightZone, new Date(nextHour + 5 * 60_000)),
        time: '11:00',
        timeZone: midnightZone,
      }).toISOString(),
    );

    // Snoozed to the next midnight: a run before it keeps it snoozed; once it has passed, it wakes.
    const nextMidnight = instantInTimeZone({
      date: calendarDateInTimeZone(midnightZone, new Date(Date.now() + 24 * HOUR)),
      time: '00:00',
      timeZone: midnightZone,
    });
    flow.as('counsellor');
    await flow.expect(200, 'snooze to midnight', 'POST', `/app/tasks/${followUp}/snooze`, {
      snoozed_until: nextMidnight.toISOString(),
      snooze_label: 'Tomorrow',
    });
    await runTaskRules();
    await flow.expect(200, 'the follow-up', 'GET', `/app/tasks/${followUp}`);
    flow.expectValue('before midnight — snoozed', '.data.status', 'snoozed');
    await getOperatorSql()`
      UPDATE app.tasks SET snoozed_until = date_trunc('hour', now()) WHERE public_id = ${followUp}
    `;
    await runTaskRules();
    await flow.expect(200, 'the follow-up', 'GET', `/app/tasks/${followUp}`);
    flow.expectValue(
      'midnight passed — awake',
      '[.data.status, .data.snoozed_until] | map(tostring) | join(",")',
      'open,null',
    );
  });

  it('R3: a step Clinozy took stays taken — the next runs send nothing again', async () => {
    const contact = await patient('Ruhi');
    await unpaidBill(contact, calendarDay(fixture, -2));
    await setRules(['payment_due']);
    const handled = [];
    for (let run = 0; run < 3; run += 1) handled.push((await runTaskRules()).handledCount);
    await ruleTasks('payment_due', `contact_id=${contact}`, 'done');
    flow.expectValue('one task, taken once', '.data | length', 1);
    await flow.expect(200, "Ruhi's stream", 'GET', `/app/contacts/${contact}/activities?limit=50`);
    flow.expectValue(
      'one reminder over three runs',
      '[.data[] | select((.body // "") | contains("is still due"))] | length',
      1,
    );
    expect(handled[1], 'the second run takes nothing').toBe(0);
  });

  it("R3: two runs at once take each of Clinozy's steps once", async () => {
    const contact = await patient('Pari');
    await unpaidBill(contact, calendarDay(fixture, -2));
    await runTaskRules();
    await ruleTasks('payment_due', `contact_id=${contact}`);
    flow.expectValue('by hand: the task waits', '.data | length', 1);
    const paymentTask = flow.last('.data[0].id');

    await setRules(['payment_due']);
    const runs = await Promise.all([runTaskRules(), runTaskRules()]);
    expect(
      runs.map((counts) => counts.handledCount).sort(),
      'one run took the step, the other found it taken',
    ).toEqual([0, 1]);
    await flow.expect(200, 'the payment task', 'GET', `/app/tasks/${paymentTask}`);
    flow.expectValue(
      'closed once',
      '[.data.status, .data.result_text] | join(",")',
      'done,Done by Clinozy',
    );
    await flow.expect(200, "Pari's stream", 'GET', `/app/contacts/${contact}/activities?limit=50`);
    flow.expectValue(
      'one reminder queued, not two',
      '[.data[] | select((.body // "") | contains("is still due"))] | length',
      1,
    );
  });
});
