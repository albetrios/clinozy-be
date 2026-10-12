import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';
import { jsonQuery } from '@/tests/helpers/json-query.helper.js';

/** One answer of a parallel call: its status and what a jq expression reads of its body. */
interface RaceAnswer {
  status: number;
  read: (expression: string) => string;
}

/**
 * Billing under concurrent writes (task B4, docs/reviews/launch-confidence-plan-2026-10-09.md):
 * two receipts that together pass the bill's total, two refunds of everything paid, and a day
 * closed while a payment for it posts. Each pair is sent at once; the guarded paid-amount
 * statement (B5, B21) and the day lock (B6) decide the winner, and the books stay whole.
 */
describe('Billing races — integration (B5, B6, B21)', () => {
  const S = String(Date.now());
  const digits = `6${S.slice(-7)}`;
  const REASON = '.error.reason';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let vesu = '';
  let contact = '';
  let facial = '';
  let raceBranch = '';

  /** Sends the calls at once; answers each one's status and a reader of its body. */
  async function atOnce(
    calls: { method: 'GET' | 'POST'; path: string; body?: unknown }[],
  ): Promise<RaceAnswer[]> {
    const answers = await Promise.all(
      calls.map((call) => flow.call(call.method, call.path, call.body)),
    );
    return answers.map((answer) => ({
      status: answer.status,
      read: (expression: string) => jsonQuery(answer.body, expression),
    }));
  }

  /** A one-line facial bill (₹1,000 + 18% = ₹1,180) at Vesu; answers its id. */
  async function facialBill(label: string): Promise<string> {
    await flow.expect(200, label, 'POST', '/app/invoices', {
      branch_id: vesu,
      contact_id: contact,
      items: [{ offering_id: facial, quantity: 1 }],
    });
    return flow.last('.data.id');
  }

  /** A cash receipt body. */
  const receipt = (amount: number, extra: Record<string, unknown> = {}) => ({
    kind: 'receipt',
    branch_id: vesu,
    contact_id: contact,
    splits: [{ mode: 'cash', amount }],
    ...extra,
  });

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    vesu = fixture.branches.vesu;
    flow.as('owner');
    await flow.expect(200, 'a contact', 'POST', '/app/contacts', {
      first_name: 'Race',
      last_name: `r${S}`,
      phones: [{ phone: `+91${digits}01`, is_primary: true }],
    });
    contact = flow.last('.data.id');
    await flow.expect(200, 'their patient file', 'POST', '/app/patients', {
      contact_id: contact,
      home_branch_id: vesu,
    });
    await flow.expect(200, 'offering Facial', 'POST', '/app/offerings', {
      name: `Race facial ${S}`,
      category: 'treatment',
      price: 1000,
      gst_percent: 18,
      is_gst_inclusive: false,
    });
    facial = flow.last('.data.id');
    await flow.expect(200, 'a branch of this run (its day)', 'POST', '/app/branches', {
      name: `Races ${S}`,
      address_line_one: '1 Station Road',
      area: 'Varachha',
      city: 'Surat',
      postal_code: '395006',
      phone: '+919876543211',
      email: `races.${S}@fixture.example`,
    });
    raceBranch = flow.last('.data.id');
  });

  afterAll(async () => {
    await app.close();
  });

  it('two receipts that together pass the total: one lands, the other is a 409 (B5)', async () => {
    flow.as('owner');
    const bill = await facialBill('a bill of 1,180');
    const answers = await atOnce([
      { method: 'POST', path: '/app/payments', body: receipt(1180, { invoice_id: bill }) },
      { method: 'POST', path: '/app/payments', body: receipt(1180, { invoice_id: bill }) },
    ]);

    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);
    expect(answers.find((answer) => answer.status === 409)?.read(REASON)).toBe('more_than_due');
    await flow.expect(200, 'the bill', 'GET', `/app/invoices/${bill}`);
    flow.expectValue(
      'paid once, in full',
      '[.data.paid_amount, .data.due_amount, .data.payment_status] | map(tostring) | join(",")',
      '1180,0,paid',
    );
    await flow.expect(200, "the bill's payments", 'GET', `/app/payments?invoice_id=${bill}`);
    flow.expectValue('one receipt', '.data | length', 1);
  });

  it('partial receipts racing past the total: the paid amount never passes it', async () => {
    flow.as('owner');
    const bill = await facialBill('another bill of 1,180');
    const answers = await atOnce(
      [500, 500, 500].map((amount) => ({
        method: 'POST' as const,
        path: '/app/payments',
        body: receipt(amount, { invoice_id: bill }),
      })),
    );

    expect(answers.filter((answer) => answer.status === 200)).toHaveLength(2);
    expect(answers.filter((answer) => answer.status === 409)).toHaveLength(1);
    await flow.expect(200, 'the bill', 'GET', `/app/invoices/${bill}`);
    flow.expectValue('paid 1,000 of 1,180', '.data.paid_amount', 1000);
  });

  it('two refunds of everything paid: one credit note, the paid amount at zero (B21)', async () => {
    flow.as('owner');
    const bill = await facialBill('a bill to refund');
    await flow.expect(
      200,
      'paid in full',
      'POST',
      '/app/payments',
      receipt(1180, { invoice_id: bill }),
    );
    const refund = {
      amount: 1180,
      reason: 'Refund everything',
      splits: [{ mode: 'cash', amount: 1180 }],
    };
    const creditNotes = `/app/invoices/${bill}/credit-notes`;
    const answers = await atOnce([
      { method: 'POST', path: creditNotes, body: refund },
      { method: 'POST', path: creditNotes, body: refund },
    ]);

    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);
    expect(answers.find((answer) => answer.status === 409)?.read(REASON)).toBe('more_than_paid');
    await flow.expect(200, 'the bill', 'GET', `/app/invoices/${bill}`);
    flow.expectValue('nothing paid now', '.data.paid_amount', 0);
    await flow.expect(200, "the bill's credit notes", 'GET', creditNotes);
    flow.expectValue('one credit note', '.data | length', 1);
    await flow.expect(200, "the bill's payments", 'GET', `/app/payments?invoice_id=${bill}`);
    flow.expectValue(
      'the receipt and one refund',
      '[.data[].kind] | sort | join(",")',
      'receipt,refund',
    );
  });

  it('a day closed while a payment for it posts: the close counts it, or it is refused (B6)', async () => {
    flow.as('owner');
    const day = calendarDay(fixture, -2);
    await flow.expect(200, 'open the day', 'POST', '/app/day-closes', {
      branch_id: raceBranch,
      close_date: day,
    });
    const dayClose = flow.last('.data.id');
    const [close, payment] = await atOnce([
      {
        method: 'POST',
        path: `/app/day-closes/${dayClose}/close`,
        body: { counted_cash: 0, difference_reason: 'Counted before the late receipt' },
      },
      {
        method: 'POST',
        path: '/app/payments',
        body: { ...receipt(500), branch_id: raceBranch, paid_at: `${day}T18:00:00+05:30` },
      },
    ]);

    expect(close?.status).toBe(200);
    expect(close?.read('.data.status')).toBe('closed');
    if (payment?.status === 200) {
      // The payment took the day first: the close waited for it and counted it
      expect(close?.read('.data.expected_cash')).toBe('500');
    } else {
      expect(payment?.status).toBe(409);
      expect(payment?.read(REASON)).toBe('day_closed');
      expect(close?.read('.data.expected_cash')).toBe('0');
    }
  });
});
