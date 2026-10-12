import { afterAll, beforeAll, describe, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/**
 * A day in the clinic across two branches (task F2, docs/reviews/launch-confidence-plan-2026-10-09.md;
 * routes-final 6, 8.A–8.E): each branch opens its day — Vesu recounts its float, Adajan
 * carries none — walk-ins are seen and billed, paid in cash, UPI and card; each branch closes on its
 * own count (Vesu matches, Adajan is short and says why); and the closed day refuses a late
 * receipt.
 */
describe('Flow — a day in the clinic, two branches', () => {
  const S = String(Date.now());
  const T = `d${S}`;
  const digits = `2${S.slice(-7)}`;

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let vesu = '';
  let adajan = '';
  let consult = '';
  let peel = '';
  const days: Record<string, string> = {};

  /** A walk-in at the branch, seen and completed, billed for `offering` and paid by `mode`. */
  async function visit(options: {
    branch: string;
    firstName: string;
    suffix: string;
    offering: string;
    mode: 'cash' | 'upi' | 'card';
  }): Promise<number> {
    flow.as('owner');
    await flow.expect(200, `contact ${options.firstName}`, 'POST', '/app/contacts', {
      first_name: options.firstName,
      last_name: T,
      phones: [{ phone: `+91${digits}${options.suffix}`, is_primary: true }],
    });
    const contact = flow.last('.data.id');
    await flow.expect(200, `${options.firstName} walks in`, 'POST', '/app/appointments', {
      contact_id: contact,
      branch_id: options.branch,
      doctor_membership_id: fixture.members.doctor.membershipPublicId,
      service_label: 'Consultation',
      is_walk_in: true,
    });
    const appointment = flow.last('.data.id');
    await flow.expect(200, 'seen', 'POST', `/app/appointments/${appointment}/complete`);
    await flow.expect(200, 'billed', 'POST', '/app/invoices', {
      branch_id: options.branch,
      contact_id: contact,
      items: [{ offering_id: options.offering, quantity: 1 }],
    });
    const invoice = flow.last('.data.id');
    const total = Number(flow.last('.data.total'));
    await flow.expect(200, `paid by ${options.mode}`, 'POST', '/app/payments', {
      kind: 'receipt',
      branch_id: options.branch,
      contact_id: contact,
      invoice_id: invoice,
      splits: [{ mode: options.mode, amount: total }],
    });
    return total;
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture).as('owner');
    vesu = fixture.branches.vesu;
    adajan = fixture.branches.adajan;
    await flow.expect(200, 'a consultation', 'POST', '/app/offerings', {
      name: `Consult ${T}`,
      category: 'consultation',
      price: 500,
    });
    consult = flow.last('.data.id');
    await flow.expect(200, 'a peel', 'POST', '/app/offerings', {
      name: `Peel ${T}`,
      price: 1200,
    });
    peel = flow.last('.data.id');
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. morning: each branch opens its day — Vesu recounts a float of ₹2,000, Adajan carries none', async () => {
    flow.as('owner');
    await flow.expect(200, 'Vesu opens', 'POST', '/app/day-closes', {
      branch_id: vesu,
      opening_source: 'recounted',
      opening_cash: 2000,
    });
    days.vesu = flow.last('.data.id');
    flow.expectValue(
      'open, with its float',
      '[.data.status, .data.opening_cash, .data.opening_source] | map(tostring) | join(",")',
      'open,2000,recounted',
    );
    await flow.expect(200, 'Adajan opens', 'POST', '/app/day-closes', { branch_id: adajan });
    days.adajan = flow.last('.data.id');
    flow.expectValue('carried: nothing yet', '.data.opening_cash', 0);
    await flow.expect(409, 'Vesu opens again', 'POST', '/app/day-closes', { branch_id: vesu });
  });

  it('2. the day: walk-ins at both branches, paid in cash, UPI and card', async () => {
    const vesuCash = await visit({
      branch: vesu,
      firstName: 'Om',
      suffix: '01',
      offering: consult,
      mode: 'cash',
    });
    const vesuUpi = await visit({
      branch: vesu,
      firstName: 'Pia',
      suffix: '02',
      offering: peel,
      mode: 'upi',
    });
    const adajanCash = await visit({
      branch: adajan,
      firstName: 'Raj',
      suffix: '03',
      offering: consult,
      mode: 'cash',
    });
    const adajanCard = await visit({
      branch: adajan,
      firstName: 'Sia',
      suffix: '04',
      offering: peel,
      mode: 'card',
    });

    flow.as('owner');
    await flow.expect(200, "Vesu's day", 'GET', `/app/day-closes/${days.vesu}`);
    flow.expectValue(
      'cash and UPI at Vesu only; the float plus its cash expected',
      '[.data.net_by_mode.cash, .data.net_by_mode.upi, .data.net_by_mode.card, .data.expected_cash] | map(tostring) | join(",")',
      `${vesuCash},${vesuUpi},0,${2000 + vesuCash}`,
    );
    await flow.expect(200, "Adajan's day", 'GET', `/app/day-closes/${days.adajan}`);
    flow.expectValue(
      'cash and card at Adajan only',
      '[.data.net_by_mode.cash, .data.net_by_mode.upi, .data.net_by_mode.card, .data.expected_cash] | map(tostring) | join(",")',
      `${adajanCash},0,${adajanCard},${adajanCash}`,
    );
  });

  it('3. evening: Vesu closes on a matching count; Adajan is short and says why', async () => {
    flow.as('owner');
    await flow.expect(200, "Vesu's day", 'GET', `/app/day-closes/${days.vesu}`);
    const vesuExpected = Number(flow.last('.data.expected_cash'));
    await flow.expect(200, 'Vesu closes', 'POST', `/app/day-closes/${days.vesu}/close`, {
      counted_cash: vesuExpected,
    });
    flow.expectValue(
      'closed, no difference',
      '[.data.status, .data.difference_reason] | map(tostring) | join(",")',
      'closed,null',
    );

    await flow.expect(200, "Adajan's day", 'GET', `/app/day-closes/${days.adajan}`);
    const adajanExpected = Number(flow.last('.data.expected_cash'));
    await flow.expect(
      400,
      'Adajan short without a reason',
      'POST',
      `/app/day-closes/${days.adajan}/close`,
      {
        counted_cash: adajanExpected - 50,
      },
    );
    flow.expectValue('why: field', '[.error.errors[].field] | join(",")', 'difference_reason');
    await flow.expect(200, 'Adajan closes short', 'POST', `/app/day-closes/${days.adajan}/close`, {
      counted_cash: adajanExpected - 50,
      difference_reason: 'Change given from the drawer',
    });
    flow.expectValue('closed', '.data.status', 'closed');
  });

  it('4. the closed day refuses a late receipt', async () => {
    flow.as('owner');
    await flow.expect(200, 'a late patient', 'POST', '/app/contacts', {
      first_name: 'Tia',
      last_name: T,
      phones: [{ phone: `+91${digits}05`, is_primary: true }],
    });
    const late = flow.last('.data.id');
    await flow.expect(409, 'a receipt on the closed day', 'POST', '/app/payments', {
      kind: 'receipt',
      branch_id: vesu,
      contact_id: late,
      splits: [{ mode: 'cash', amount: 100 }],
    });
    flow.expectValue('the day is closed', '.error.reason', 'day_closed');
  });
});
