import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { operatorQuery } from '@/tests/helpers/operator-database.js';
import { runOrganizationScopedWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';
import { runTaskRulesJob } from '@/domains/app/sub-domains/tasks/workers/task-rules.processor.js';

/**
 * Launch ROUTE #140–#142 (D78): the notices the app writes into the outbox — the booking messages
 * (WC-5 the confirm request, WC-6 the day-before reminder, WC-7 moves and cancels) and the receipt
 * (WC-9) — by the rules run over the fixture organization. Delivering them is the messaging
 * service's; here they stay `queued`.
 */
describe("The app's messages — integration (launch D78, ROUTE #140–#142)", () => {
  const S = String(Date.now());
  const digits = `8${S.slice(-7)}`;
  const lastName = `m${S}`;

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let organizationPublicId = '';
  let vesu = '';
  let doctor = '';
  let day = '';
  let tomorrow = '';
  let asha = '';
  let bela = '';
  let chirag = '';
  let ashaBooking = '';

  /** `count` working dates (Monday–Saturday) from today + `from`, in the fixture's time zone. */
  function workDays(from: number, count: number): string[] {
    const timeZone = fixture.organization.timezone;
    const found: string[] = [];
    for (let offset = from; found.length < count && offset < from + 30; offset += 1) {
      const at = new Date(Date.now() + offset * 86_400_000);
      if (new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(at) !== 'Sun') {
        found.push(new Intl.DateTimeFormat('en-CA', { timeZone }).format(at));
      }
    }
    return found;
  }

  /** A contact of this run with its own number. */
  async function person(firstName: string, suffix: string): Promise<string> {
    await flow.expect(200, `contact ${firstName}`, 'POST', '/app/contacts', {
      first_name: firstName,
      last_name: lastName,
      phones: [{ phone: `+91${digits}${suffix}`, is_primary: true }],
    });
    return flow.last('.data.id');
  }

  /** Books the contact at Vesu with the doctor; answers the booking's id. */
  async function book(contact: string, date: string, start: string, extra = {}): Promise<string> {
    await flow.expect(200, `book ${contact} ${date} ${start}`, 'POST', '/app/appointments', {
      contact_id: contact,
      branch_id: vesu,
      doctor_membership_id: doctor,
      appointment_date: date,
      start_time: start,
      service_label: 'Consultation',
      ...extra,
    });
    return flow.last('.data.id');
  }

  /** The organization's rules run (TK4), as the worker runs it. */
  function runRules() {
    return runOrganizationScopedWorkerJob({
      job: { organizationPublicId },
      processor: (handle) => runTaskRulesJob({ databaseHandle: handle, organizationPublicId }),
    });
  }

  /** The app's messages about a booking, oldest first. */
  async function bookingMessages(appointment: string) {
    return operatorQuery<
      {
        automation_kind: string;
        delivery_status: string;
        failure_reason: string | null;
        body: string;
      }[]
    >`
      SELECT activity.automation_kind, activity.delivery_status, activity.failure_reason, activity.body
      FROM app.contact_activities activity
      JOIN app.appointments booking ON booking.id = activity.appointment_id
      WHERE booking.public_id = ${appointment} AND activity.automation_kind IS NOT NULL
      ORDER BY activity.id
    `;
  }

  /** A booking's status, reminder status and "Replied Yes", as the API answers them. */
  async function bookingState(appointment: string): Promise<string> {
    await flow.expect(200, `read ${appointment}`, 'GET', `/app/appointments/${appointment}`);
    const data = (flow.lastBody() as { data: Record<string, unknown> }).data;
    return [data.status, data.reminder_status, data.is_confirmed_by_reply].map(String).join(',');
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    organizationPublicId = fixture.organization.publicId;
    vesu = fixture.branches.vesu;
    doctor = fixture.members.doctor.membershipPublicId;
    [day = ''] = workDays(3, 1);
    tomorrow = calendarDay(fixture, 1);

    flow.as('owner');
    asha = await person('Asha', '01');
    bela = await person('Bela', '02');
    chirag = await person('Chirag', '03');
  });

  afterAll(async () => {
    await app.close();
  });

  it('WC-5: a booking gets its confirm request; a walk-in none; a second run adds nothing', async () => {
    flow.as('front_desk');
    ashaBooking = await book(asha, day, '10:00');
    const run = await runRules();
    expect(run.messageCount).toBeGreaterThanOrEqual(1);
    const messages = await bookingMessages(ashaBooking);
    expect(
      messages.map((message) => `${message.automation_kind}:${message.delivery_status}`),
    ).toEqual(['booking_confirm:queued']);
    expect(messages[0]?.body).toMatch(
      /^Hi Asha, your visit at .+ is booked for .+ at 10:00\. Reply YES to confirm\.$/,
    );
    expect(await bookingState(ashaBooking)).toBe('scheduled,confirm_requested,false');

    await runRules();
    expect(await bookingMessages(ashaBooking)).toHaveLength(1);

    await flow.expect(200, 'Bela walks in', 'POST', '/app/appointments', {
      contact_id: bela,
      branch_id: vesu,
      doctor_membership_id: doctor,
      service_label: 'Consultation',
      is_walk_in: true,
    });
    const walkIn = flow.last('.data.id');
    await runRules();
    expect(await bookingMessages(walkIn)).toHaveLength(0);
  });

  it('WC-7: a move stops the waiting message and asks again; a cancel stops it; a reinstate asks again', async () => {
    flow.as('front_desk');
    const belaBooking = await book(bela, day, '11:00');
    await runRules();
    expect((await bookingMessages(belaBooking)).map((message) => message.delivery_status)).toEqual([
      'queued',
    ]);

    await flow.expect(200, 'move it to 12:00', 'PATCH', `/app/appointments/${belaBooking}`, {
      start_time: '12:00',
    });
    expect(await bookingState(belaBooking)).toBe('scheduled,not_sent,false');
    let messages = await bookingMessages(belaBooking);
    expect([messages[0]?.delivery_status, messages[0]?.failure_reason]).toEqual([
      'failed',
      'reminder_stopped',
    ]);
    await runRules();
    messages = await bookingMessages(belaBooking);
    expect(messages).toHaveLength(2);
    expect(messages[1]?.body).toContain('at 12:00');

    // A stopped message is no failure to chase: no failed_message task for Bela.
    const failedTasks = await operatorQuery<{ count: number }[]>`
      SELECT count(*)::int AS count FROM app.tasks task
      JOIN app.contacts contact ON contact.id = task.contact_id
      WHERE contact.public_id = ${bela} AND task.rule_key = 'failed_message'
    `;
    expect(failedTasks[0]?.count).toBe(0);

    await flow.expect(200, 'cancel it', 'POST', `/app/appointments/${belaBooking}/cancel`, {
      cancel_reason: 'patient_asked',
    });
    messages = await bookingMessages(belaBooking);
    expect(messages.map((message) => message.delivery_status)).toEqual(['failed', 'failed']);

    await flow.expect(200, 'restore it', 'POST', `/app/appointments/${belaBooking}/reinstate`);
    expect(await bookingState(belaBooking)).toBe('scheduled,not_sent,false');
    await runRules();
    expect((await bookingMessages(belaBooking)).at(-1)?.delivery_status).toBe('queued');
  });

  it("WC-6: tomorrow's booking gets the day-before reminder once the clinic's hour has passed", async () => {
    flow.as('owner');
    await flow.expect(200, 'reminders from midnight', 'PATCH', '/tenancy/organization/settings', {
      reminder_hour: 0,
    });
    flow.as('front_desk');
    const chiragBooking = await book(chirag, day, '14:00');
    await runRules();
    await operatorQuery`
      UPDATE app.appointments
      SET appointment_date = ${tomorrow}, created_at = now() - interval '3 days',
        updated_at = greatest(updated_at, now() - interval '3 days')
      WHERE public_id = ${chiragBooking}
    `;
    await runRules();
    const messages = await bookingMessages(chiragBooking);
    expect(messages.map((message) => message.automation_kind)).toEqual([
      'booking_confirm',
      'booking_reminder',
    ]);
    expect(messages[1]?.body).toMatch(/tomorrow, .+ at 14:00\. Reply YES to confirm\.$/);
    expect(await bookingState(chiragBooking)).toBe('scheduled,reminder_queued,false');

    // The reminder waits in the outbox; a second run adds nothing.
    await runRules();
    expect(await bookingMessages(chiragBooking)).toHaveLength(2);
  });

  it('WC-9: a receipt goes to the person once; a spend sends nothing', async () => {
    flow.as('owner');
    await flow.expect(200, "receive Asha's 500", 'POST', '/app/payments', {
      kind: 'receipt',
      branch_id: vesu,
      splits: [{ mode: 'cash', amount: 500 }],
      contact_id: asha,
    });
    const receipt = flow.last('.data.id');
    await flow.expect(200, 'a spend', 'POST', '/app/payments', {
      kind: 'expense',
      branch_id: vesu,
      splits: [{ mode: 'cash', amount: 40 }],
      payee_name: 'Tea stall',
      expense_category: 'misc',
    });
    await runRules();
    await runRules();
    const receipts = await operatorQuery<{ body: string; delivery_status: string }[]>`
      SELECT activity.body, activity.delivery_status FROM app.contact_activities activity
      JOIN app.payments payment ON payment.id = activity.payment_id
      WHERE payment.public_id = ${receipt} AND activity.automation_kind = 'payment_receipt'
    `;
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.body).toMatch(/^Hi Asha, we have received ₹500\.00 on .+\. Thank you!$/);
    const spendMessages = await operatorQuery<{ count: number }[]>`
      SELECT count(*)::int AS count FROM app.contact_activities WHERE automation_kind = 'payment_receipt'
    `;
    expect(spendMessages[0]?.count).toBe(1);
  });
});
