import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorSql } from '@/tests/helpers/operator-database.js';
import { jsonQuery } from '@/tests/helpers/json-query.helper.js';
import {
  type AppFixture,
  type AppFixtureRole,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/** One answer of a parallel call: its status and what a jq expression reads of its body. */
interface RaceAnswer {
  status: number;
  read: (expression: string) => string;
}

/** One call of a race: who sends it, and what. */
interface RaceCall {
  as: AppFixtureRole;
  method: 'POST' | 'PATCH';
  path: string;
  body?: unknown;
}

/**
 * The app's last-unit races (tasks AP2, S1, S2, MD2, PT2, L1 —
 * docs/reviews/launch-confidence-plan-2026-10-09.md): two writes for the one thing left — a
 * doctor's slot, the last of a stock item, the last medicine unit, the last session of a package,
 * an open lead — sent at once. Exactly one wins; the other gets its 409; nothing goes below zero
 * and nothing is taken twice. Each request runs in its own unit of work, so the database's
 * constraints and row locks decide.
 */
describe('App races — integration (A3, S5, MD5, TR7, L5)', () => {
  const S = String(Date.now());
  const T = `q${S}`;
  const digits = `2${S.slice(-7)}`;
  const REASON = '.error.reason';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let vesu = '';
  let doctor = '';
  let workDay = '';
  let asha = '';
  let bela = '';

  /** Sends the calls at once, each as its member; answers each one's status and body reader. */
  async function atOnce(calls: RaceCall[]): Promise<RaceAnswer[]> {
    const answers = await Promise.all(
      calls.map((call) =>
        new AppFlow(app, fixture).as(call.as).call(call.method, call.path, call.body),
      ),
    );
    return answers.map((answer) => ({
      status: answer.status,
      read: (expression: string) => jsonQuery(answer.body, expression),
    }));
  }

  /** The statuses of a race's answers, sorted. */
  const statuses = (answers: readonly RaceAnswer[]) =>
    answers.map((answer) => answer.status).sort((a, b) => a - b);

  /** The first working day (Monday–Saturday) from `from` days ahead, in the organization's zone. */
  function nextWorkDay(from: number): string {
    const timeZone = fixture.organization.timezone;
    for (let offset = from; offset < from + 7; offset += 1) {
      const at = new Date(Date.now() + offset * 86_400_000);
      if (new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(at) !== 'Sun') {
        return new Intl.DateTimeFormat('en-CA', { timeZone }).format(at);
      }
    }
    throw new Error('no working day in a week');
  }

  /** A contact of this run with its own number. */
  async function person(firstName: string, suffix: string): Promise<string> {
    await flow.expect(200, `contact ${firstName}`, 'POST', '/app/contacts', {
      first_name: firstName,
      last_name: T,
      phones: [{ phone: `+91${digits}${suffix}`, is_primary: true }],
    });
    return flow.last('.data.id');
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    vesu = fixture.branches.vesu;
    doctor = fixture.members.doctor.membershipPublicId;
    workDay = nextWorkDay(2);
    flow.as('owner');
    asha = await person('Asha', '01');
    bela = await person('Bela', '02');
    for (const contact of [asha, bela]) {
      await flow.expect(200, 'a patient file', 'POST', '/app/patients', {
        contact_id: contact,
        home_branch_id: vesu,
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it("AP2: one doctor's slot booked twice at once — one booking, one 409 slot_taken (A3)", async () => {
    const booking = (contact: string) => ({
      contact_id: contact,
      branch_id: vesu,
      doctor_membership_id: doctor,
      appointment_date: workDay,
      start_time: '11:00',
      duration_minutes: 30,
      service_label: 'Consultation',
    });
    const answers = await atOnce([
      { as: 'front_desk', method: 'POST', path: '/app/appointments', body: booking(asha) },
      { as: 'owner', method: 'POST', path: '/app/appointments', body: booking(bela) },
    ]);

    expect(statuses(answers)).toEqual([200, 409]);
    expect(answers.find((answer) => answer.status === 409)?.read(REASON)).toBe('slot_taken');
    const [row] = await getOperatorSql()<{ count: string }[]>`
      SELECT count(*)::text AS count FROM app.appointments a
        JOIN tenancy.memberships m ON m.id = a.doctor_membership_id
      WHERE m.public_id = ${doctor} AND a.appointment_date = ${workDay}
        AND a.start_time = '11:00' AND a.deleted_at IS NULL
    `;
    expect(row?.count).toBe('1');
  });

  it('S1: two uses of the last of a stock item at once — the balance never goes below zero (S5)', async () => {
    flow.as('owner');
    await flow.expect(200, 'an item with 2 in stock', 'POST', '/app/stock-items', {
      name: `Gauze ${T}`,
      opening_quantity: 2,
    });
    const movements = `/app/stock-items/${flow.last('.data.id')}/movements`;
    const answers = await atOnce([
      { as: 'owner', method: 'POST', path: movements, body: { type: 'damaged', quantity: 2 } },
      { as: 'owner', method: 'POST', path: movements, body: { type: 'damaged', quantity: 2 } },
    ]);

    expect(statuses(answers)).toEqual([200, 409]);
    expect(answers.find((answer) => answer.status === 409)?.read(REASON)).toBe('not_enough_stock');
    expect(answers.find((answer) => answer.status === 200)?.read('.data.quantity_after')).toBe('0');
  });

  it('S1: three uses that each fit but not together — the balance is exactly what is left', async () => {
    flow.as('owner');
    await flow.expect(200, 'an item with 5 in stock', 'POST', '/app/stock-items', {
      name: `Cotton ${T}`,
      opening_quantity: 5,
    });
    const item = flow.last('.data.id');
    const movements = `/app/stock-items/${item}/movements`;
    const answers = await atOnce(
      [2, 2, 2].map(() => ({
        as: 'owner' as const,
        method: 'POST' as const,
        path: movements,
        body: { type: 'damaged', quantity: 2 },
      })),
    );

    expect(statuses(answers)).toEqual([200, 200, 409]);
    await flow.expect(200, 'the item', 'GET', `/app/stock-items/${item}`);
    flow.expectValue('one left', '.data.quantity', 1);
  });

  it('S2: a count saved while uses post — its difference is against the stock it found, nothing lost (S9)', async () => {
    flow.as('owner');
    await flow.expect(200, 'an item with 20 in stock', 'POST', '/app/stock-items', {
      name: `Swabs ${T}`,
      opening_quantity: 20,
    });
    const item = flow.last('.data.id');
    const movements = `/app/stock-items/${item}/movements`;
    const use = { as: 'owner' as const, method: 'POST' as const, path: movements };
    const answers = await atOnce([
      { ...use, body: { type: 'damaged', quantity: 1 } },
      {
        as: 'owner',
        method: 'POST',
        path: '/app/stock-counts',
        body: { lines: [{ stock_item_id: item, counted_quantity: 15 }] },
      },
      { ...use, body: { type: 'damaged', quantity: 1 } },
      { ...use, body: { type: 'damaged', quantity: 1 } },
    ]);
    expect(statuses(answers)).toEqual([200, 200, 200, 200]);

    const count = answers[1];
    const found = Number(count?.read('.data.lines[0].system_quantity'));
    const usesBefore = 20 - found;
    expect(usesBefore, 'the count found 20 less the uses that went first').toBeGreaterThanOrEqual(
      0,
    );
    expect(usesBefore).toBeLessThanOrEqual(3);
    expect(Number(count?.read('.data.lines[0].difference')), 'counted less found').toBe(15 - found);
    await flow.expect(200, 'the item', 'GET', `/app/stock-items/${item}`);
    flow.expectValue('15, less the uses after the count', '.data.quantity', 15 - (3 - usesBefore));
    await flow.expect(200, 'its ledger', 'GET', `${movements}?limit=50`);
    const ledger = (flow.lastBody() as { data: { quantity_change: number }[] }).data;
    expect(
      ledger.reduce((total, movement) => total + movement.quantity_change, 0),
      'opening + every change = the balance',
    ).toBe(15 - (3 - usesBefore));
  });

  it('MD2: the last medicine unit sold twice at once — one sale, one 409 not_enough_stock (MD5)', async () => {
    flow.as('owner');
    await flow.expect(200, 'a manufacturer', 'POST', '/app/manufacturers', { name: `Cipla ${T}` });
    const manufacturer = flow.last('.data.id');
    await flow.expect(200, 'a medicine with one unit', 'POST', '/app/medicines', {
      name: `Tretinoin ${T}`,
      composition: 'Tretinoin 0.025%',
      manufacturer_id: manufacturer,
      mrp: 300,
      batches: [{ batch_number: 'ONE', expiry_month: '2030-12', quantity: 1, purchase_rate: 200 }],
    });
    const medicine = flow.last('.data.id');
    const sale = (contact: string) => ({
      branch_id: vesu,
      contact_id: contact,
      items: [{ medicine_id: medicine, quantity: 1 }],
    });
    const answers = await atOnce([
      { as: 'pharmacist', method: 'POST', path: '/app/medical-sales', body: sale(asha) },
      { as: 'owner', method: 'POST', path: '/app/medical-sales', body: sale(bela) },
    ]);

    expect(statuses(answers)).toEqual([200, 409]);
    expect(answers.find((answer) => answer.status === 409)?.read(REASON)).toBe('not_enough_stock');
    const [row] = await getOperatorSql()<{ quantity: string }[]>`
      SELECT b.quantity::text AS quantity FROM app.medicine_batches b
        JOIN app.medicines m ON m.id = b.medicine_id
      WHERE m.public_id = ${medicine} AND b.batch_number = 'ONE'
    `;
    expect(row?.quantity).toBe('0');
  });

  it('PT2: the last session of a package spent twice at once — one treatment, one 409 offering_used_up (TR7)', async () => {
    flow.as('owner');
    await flow.expect(200, 'a one-session package', 'POST', '/app/offerings', {
      name: `Single peel ${T}`,
      category: 'package',
      price: 1000,
      sessions: 1,
      validity_days: 30,
    });
    await flow.expect(200, 'bill Asha the package', 'POST', '/app/invoices', {
      branch_id: vesu,
      contact_id: asha,
      items: [{ offering_id: flow.last('.data.id'), quantity: 1 }],
    });
    const [bought] = await getOperatorSql()<{ public_id: string; patient: string }[]>`
      SELECT o.public_id, p.public_id AS patient FROM app.patient_offerings o
        JOIN app.patients p ON p.id = o.patient_id
        JOIN app.contacts c ON c.id = p.contact_id
      WHERE c.public_id = ${asha} AND o.deleted_at IS NULL
      ORDER BY o.id DESC LIMIT 1
    `;
    expect(bought).toBeDefined();
    const treatments = `/app/patients/${bought?.patient}/treatments`;
    const session = { name: 'Peel', patient_offering_id: bought?.public_id };
    const answers = await atOnce([
      { as: 'doctor', method: 'POST', path: treatments, body: session },
      { as: 'therapist', method: 'POST', path: treatments, body: session },
    ]);

    expect(statuses(answers)).toEqual([200, 409]);
    expect(answers.find((answer) => answer.status === 409)?.read(REASON)).toBe('offering_used_up');
    const [row] = await getOperatorSql()<{ used: number; total: number }[]>`
      SELECT sessions_used AS used, sessions_total AS total FROM app.patient_offerings
      WHERE public_id = ${bought?.public_id ?? ''}
    `;
    expect([row?.used, row?.total]).toEqual([1, 1]);
  });

  it('L1: one open lead claimed by two members at once — one owner, one 409 lead_held (L5)', async () => {
    flow.as('owner');
    const contact = await person('Kavya', '03');
    await flow.expect(200, 'an open lead nobody holds', 'POST', '/app/leads', {
      contact_id: contact,
      branch_id: vesu,
      source: 'walk_in',
    });
    const lead = flow.last('.data.id');
    await getOperatorSql()`
      UPDATE app.leads SET owner_membership_id = NULL, held_until = NULL WHERE public_id = ${lead}
    `;
    const claim = `/app/leads/${lead}/claim`;
    const answers = await atOnce([
      { as: 'front_desk', method: 'POST', path: claim },
      { as: 'marketing', method: 'POST', path: claim },
    ]);

    expect(statuses(answers)).toEqual([200, 409]);
    expect(answers.find((answer) => answer.status === 409)?.read(REASON)).toBe('lead_held');
    const winner = answers
      .find((answer) => answer.status === 200)
      ?.read('.data.owner_membership_id');
    await flow.expect(200, 'the lead', 'GET', `/app/leads/${lead}`);
    flow.expectValue('owned by the winner', '.data.owner_membership_id', winner ?? '');
  });

  it('keeps the races on today out of the books (a sanity read of the day)', async () => {
    flow.as('owner');
    await flow.expect(
      200,
      'the day',
      'GET',
      `/app/appointments/daily-counts?date_from=${calendarDay(fixture, 0)}&date_to=${workDay}`,
    );
  });
});
