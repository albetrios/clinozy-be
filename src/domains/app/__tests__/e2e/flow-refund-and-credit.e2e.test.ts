import { afterAll, beforeAll, describe, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/**
 * A refund and a credit carried to the next visit, end to end (task B5,
 * docs/reviews/launch-confidence-plan-2026-10-09.md; routes-final 8.B–8.D, B16, B21, B23, B24): a
 * package paid by UPI; part refunded in cash at once (a credit note and its refund); the rest owed
 * as a pending credit; half of it used on the next bill, the other half given back in cash. At
 * the end the first bill's paid amount, its credit notes, the credit's state and the day's cash
 * all agree.
 */
describe('Flow — refund and credit carried to the next bill', () => {
  const S = String(Date.now());
  const T = `f${S}`;
  const digits = `4${S.slice(-7)}`;

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let vesu = '';
  let contact = '';
  let pack = '';
  let consult = '';
  let packageBill = '';
  let credit = '';

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    vesu = fixture.branches.vesu;

    flow.as('owner');
    await flow.expect(200, 'a package, GST inside', 'POST', '/app/offerings', {
      name: `Glow pack ${T}`,
      category: 'package',
      price: 6000,
      sessions: 6,
      validity_days: 90,
      gst_percent: 18,
      is_gst_inclusive: true,
    });
    pack = flow.last('.data.id');
    await flow.expect(200, 'a consultation', 'POST', '/app/offerings', {
      name: `Consult ${T}`,
      category: 'consultation',
      price: 500,
    });
    consult = flow.last('.data.id');
    await flow.expect(200, 'the patient', 'POST', '/app/contacts', {
      first_name: 'Isha',
      last_name: T,
      phones: [{ phone: `+91${digits}01`, is_primary: true }],
    });
    contact = flow.last('.data.id');
    await flow.expect(200, 'her patient file', 'POST', '/app/patients', {
      contact_id: contact,
      home_branch_id: vesu,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. the package is billed and paid by UPI', async () => {
    flow.as('front_desk');
    await flow.expect(200, 'bill the package', 'POST', '/app/invoices', {
      branch_id: vesu,
      contact_id: contact,
      items: [{ offering_id: pack, quantity: 1 }],
    });
    packageBill = flow.last('.data.id');
    flow.expectValue('6,000 with GST inside', '.data.total', 6000);
    await flow.expect(200, 'paid by UPI', 'POST', '/app/payments', {
      kind: 'receipt',
      branch_id: vesu,
      contact_id: contact,
      invoice_id: packageBill,
      splits: [{ mode: 'upi', amount: 6000 }],
    });
    await flow.expect(200, 'the bill', 'GET', `/app/invoices/${packageBill}`);
    flow.expectValue('paid in full', '.data.payment_status', 'paid');
  });

  it('2. part of it is refunded in cash at once: a credit note and its refund', async () => {
    flow.as('owner');
    await flow.expect(200, 'refund 1,000', 'POST', `/app/invoices/${packageBill}/credit-notes`, {
      amount: 1000,
      reason: 'Two sessions not suitable',
      splits: [{ mode: 'cash', amount: 1000 }],
    });
    flow.expectValue('its refund payment', '(.data.payment_id | startswith("pay_"))', true);
    await flow.expect(200, 'the bill', 'GET', `/app/invoices/${packageBill}`);
    flow.expectValue(
      '5,000 paid, 1,000 due',
      '[.data.paid_amount, .data.due_amount, .data.payment_status] | map(tostring) | join(",")',
      '5000,1000,partial',
    );
  });

  it('3. the clinic owes her 1,000 more as a credit for the next visit', async () => {
    flow.as('owner');
    await flow.expect(200, 'owe her 1,000 (B23)', 'POST', '/app/pending-credits', {
      direction: 'give',
      amount: 1000,
      reason: 'Goodwill for the next visit',
      contact_id: contact,
      invoice_id: packageBill,
      settle_by: calendarDay(fixture, 30),
    });
    credit = flow.last('.data.id');
    flow.expectValue(
      'open, all of it left',
      '[.data.status, .data.left_amount] | map(tostring) | join(",")',
      'open,1000',
    );
  });

  it('4. the next visit uses half of the credit on its bill', async () => {
    flow.as('front_desk');
    await flow.expect(200, 'bill a consultation', 'POST', '/app/invoices', {
      branch_id: vesu,
      contact_id: contact,
      items: [{ offering_id: consult, quantity: 1 }],
    });
    const consultBill = flow.last('.data.id');
    flow.as('owner');
    await flow.expect(200, 'use 500 on it (B24)', 'POST', `/app/pending-credits/${credit}/settle`, {
      amount: 500,
      method: 'use_on_bill',
      invoice_id: consultBill,
    });
    flow.expectValue(
      'half settled, still open',
      '[.data.settled_amount, .data.left_amount, .data.status] | map(tostring) | join(",")',
      '500,500,open',
    );
    await flow.expect(200, 'the consultation bill', 'GET', `/app/invoices/${consultBill}`);
    flow.expectValue('paid by the credit', '.data.payment_status', 'paid');
    await flow.expect(
      200,
      'its payment',
      'GET',
      `/app/payments?invoice_id=${consultBill}&mode=credit`,
    );
    flow.expectValue(
      'a receipt in credit',
      '[(.data | length), .data[0].kind] | map(tostring) | join(",")',
      '1,receipt',
    );
  });

  it('5. the rest is given back in cash, and the books agree', async () => {
    flow.as('owner');
    await flow.expect(
      200,
      'give back 500 in cash',
      'POST',
      `/app/pending-credits/${credit}/settle`,
      {
        amount: 500,
        method: 'money',
        branch_id: vesu,
        splits: [{ mode: 'cash', amount: 500 }],
      },
    );
    flow.expectValue(
      'settled in full — the last part given back',
      '[.data.settled_amount, .data.left_amount, .data.status] | map(tostring) | join(",")',
      '1000,0,given_back',
    );
    await flow.expect(
      200,
      "the package bill's credit notes",
      'GET',
      `/app/invoices/${packageBill}/credit-notes`,
    );
    flow.expectValue(
      'the cash refund and the credit given back',
      '[.data[].amount] | sort | map(tostring) | join(",")',
      '500,1000',
    );
    await flow.expect(200, 'the package bill', 'GET', `/app/invoices/${packageBill}`);
    flow.expectValue('4,500 kept', '.data.paid_amount', 4500);
    await flow.expect(200, 'her payments', 'GET', `/app/payments?contact_id=${contact}`);
    flow.expectValue(
      'UPI in, two cash refunds out, the credit used',
      '[.data[] | "\\(.kind):\\(.direction):\\(.amount)"] | sort | join(",")',
      'receipt:received:500,receipt:received:6000,refund:paid:1000,refund:paid:500',
    );
  });
});
