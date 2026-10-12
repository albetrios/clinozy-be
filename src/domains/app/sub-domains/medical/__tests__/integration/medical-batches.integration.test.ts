import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { operatorQuery } from '@/tests/helpers/operator-database.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/**
 * A medicine's batches under sales and returns (tasks MD1 and MD3,
 * docs/reviews/launch-confidence-plan-2026-10-09.md; routes-final 11.H, MD5, MD14, MD20, MD21):
 * a sale draws from the unexpired batches, earliest expiry first and the older batch on a tie —
 * a batch of this month still sells, an expired one never does and never counts as stock — at
 * the medicine's near-expiry discount unless one is sent; a return puts each line back into the
 * batch it came from, and a sale with a return is never voided.
 */
describe('Medical store — batches, sales and returns (MD5, MD21)', () => {
  const S = String(Date.now());
  const T = `m${S}`;
  const REASON = '.error.reason';
  const BATCHES = '[.data.items[].batch_number] | join(",")';
  const QUANTITIES = '[.data.items[].quantity] | map(tostring) | join(",")';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let vesu = '';
  let manufacturer = '';
  let buyer = '';

  /** Each batch's packs left, `<batch>:<quantity>` in batch-number order. */
  async function stockOf(medicine: string): Promise<string> {
    const rows = await operatorQuery<{ batch_number: string; quantity: number }[]>`
      SELECT b.batch_number, b.quantity FROM app.medicine_batches b
      JOIN app.medicines m ON m.id = b.medicine_id
      WHERE m.public_id = ${medicine} ORDER BY b.batch_number
    `;
    return rows.map((row) => `${row.batch_number}:${row.quantity}`).join(',');
  }

  /** A sale of `quantity` of the medicine to the run's buyer, with an optional discount. */
  function sale(medicine: string, quantity: number, discount?: number): Record<string, unknown> {
    return {
      branch_id: vesu,
      contact_id: buyer,
      items: [
        {
          medicine_id: medicine,
          quantity,
          ...(discount === undefined ? {} : { discount_percent: discount }),
        },
      ],
    };
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture).as('owner');
    vesu = fixture.branches.vesu;
    await flow.expect(200, 'a manufacturer', 'POST', '/app/manufacturers', { name: `Sun ${T}` });
    manufacturer = flow.last('.data.id');
    await flow.expect(200, 'a buyer', 'POST', '/app/contacts', {
      first_name: 'Veda',
      last_name: T,
      phones: [{ phone: `+917${S.slice(-7)}31`, is_primary: true }],
    });
    buyer = flow.last('.data.id');
  });

  afterAll(async () => {
    await app.close();
  });

  it('MD1: earliest expiry first, a batch of this month still sells, an expired one never', async () => {
    flow.as('owner');
    await flow.expect(200, 'a medicine with five batches', 'POST', '/app/medicines', {
      name: `Azelaic ${T}`,
      composition: 'Azelaic acid 20%',
      manufacturer_id: manufacturer,
      mrp: 100,
      batches: [
        { batch_number: 'A', expiry_month: '2028-06', quantity: 2, purchase_rate: 60 },
        { batch_number: 'B', expiry_month: '2028-06', quantity: 3, purchase_rate: 60 },
        { batch_number: 'C', expiry_month: '2030-01', quantity: 1, purchase_rate: 60 },
        { batch_number: 'E', expiry_month: '2031-01', quantity: 5, purchase_rate: 60 },
        { batch_number: 'X', expiry_month: '2030-02', quantity: 4, purchase_rate: 60 },
      ],
    });
    const medicine = flow.last('.data.id');
    // C expires this month (still sellable); X expired last month.
    const zone = fixture.organization.timezone;
    await operatorQuery`
      UPDATE app.medicine_batches b
      SET expiry_month = CASE b.batch_number
        WHEN 'C' THEN date_trunc('month', now() AT TIME ZONE ${zone})::date
        ELSE (date_trunc('month', now() AT TIME ZONE ${zone}) - interval '1 month')::date END
      FROM app.medicines m
      WHERE m.id = b.medicine_id AND m.public_id = ${medicine} AND b.batch_number IN ('C', 'X')
    `;

    await flow.expect(200, 'sell 5', 'POST', '/app/medical-sales', sale(medicine, 5));
    flow.expectValue('this month first, then the 2028 pair, older first', BATCHES, 'C,A,B');
    flow.expectValue('what each gave', QUANTITIES, '1,2,2');
    flow.expectValue(
      'no discount yet',
      '[.data.items[].discount_percent] | map(tostring) | join(",")',
      '0,0,0',
    );
    expect(await stockOf(medicine), 'X untouched').toBe('A:0,B:1,C:0,E:5,X:4');

    await flow.expect(409, 'sell 7 — 6 sellable', 'POST', '/app/medical-sales', sale(medicine, 7));
    flow.expectValue('the expired 4 are not stock', REASON, 'not_enough_stock');
    expect(await stockOf(medicine), 'a refused sale moves nothing').toBe('A:0,B:1,C:0,E:5,X:4');

    await flow.expect(200, '20% off near expiry', 'PATCH', `/app/medicines/${medicine}`, {
      near_expiry_discount_percent: 20,
    });
    await flow.expect(200, 'sell 2', 'POST', '/app/medical-sales', sale(medicine, 2));
    flow.expectValue('the last of B, then E', BATCHES, 'B,E');
    flow.expectValue(
      "the medicine's discount on every line",
      '[.data.items[].discount_percent] | map(tostring) | join(",")',
      '20,20',
    );
    await flow.expect(
      200,
      'sell 1 at no discount',
      'POST',
      '/app/medical-sales',
      sale(medicine, 1, 0),
    );
    flow.expectValue('a sent discount wins', '.data.items[0].discount_percent', 0);
    expect(await stockOf(medicine)).toBe('A:0,B:0,C:0,E:3,X:4');
  });

  it('MD3: returns go back into the batch each line came from; a sale with a return is never voided', async () => {
    flow.as('owner');
    await flow.expect(200, 'a medicine with two batches', 'POST', '/app/medicines', {
      name: `Niacinamide ${T}`,
      composition: 'Niacinamide 10%',
      manufacturer_id: manufacturer,
      mrp: 200,
      batches: [
        { batch_number: 'N1', expiry_month: '2029-01', quantity: 2, purchase_rate: 120 },
        { batch_number: 'N2', expiry_month: '2030-01', quantity: 5, purchase_rate: 120 },
      ],
    });
    const medicine = flow.last('.data.id');
    await flow.expect(200, 'sell 4 — 2 from each', 'POST', '/app/medical-sales', sale(medicine, 4));
    const saleId = flow.last('.data.id');
    flow.expectValue('two lines', BATCHES, 'N1,N2');
    const invoice = flow.last('.data.invoice.id');
    const [firstLine, secondLine] = [
      flow.last('.data.items[0].invoice_item_id'),
      flow.last('.data.items[1].invoice_item_id'),
    ];
    const total = Number(flow.last('.data.invoice.total'));
    await flow.expect(200, 'paid', 'POST', '/app/payments', {
      kind: 'receipt',
      branch_id: vesu,
      contact_id: buyer,
      invoice_id: invoice,
      splits: [{ mode: 'cash', amount: total }],
    });
    expect(await stockOf(medicine)).toBe('N1:0,N2:3');

    const returns = `/app/medical-sales/${saleId}/returns`;
    await flow.expect(200, 'one back from each line, unused', 'POST', returns, {
      items: [
        { invoice_item_id: firstLine, quantity: 1 },
        { invoice_item_id: secondLine, quantity: 1 },
      ],
      reason: 'unused',
      refund_mode: 'cash',
    });
    flow.expectValue(
      "each line's count",
      '[.data.items[].returned_quantity] | map(tostring) | join(",")',
      '1,1',
    );
    expect(await stockOf(medicine), 'each into its own batch').toBe('N1:1,N2:4');

    await flow.expect(400, 'two more from the first line — one is left', 'POST', returns, {
      items: [{ invoice_item_id: firstLine, quantity: 2 }],
      reason: 'unused',
      refund_mode: 'cash',
    });
    await flow.expect(200, 'the last of the first line, damaged', 'POST', returns, {
      items: [{ invoice_item_id: firstLine, quantity: 1 }],
      reason: 'damaged',
      refund_mode: 'cash',
    });
    expect(await stockOf(medicine), 'written off, not restocked').toBe('N1:1,N2:4');

    await flow.expect(
      409,
      'void after a partial return',
      'DELETE',
      `/app/medical-sales/${saleId}?reason=wrong_items`,
    );
    expect(['sale_has_payments', 'sale_has_returns'], 'refused').toContain(flow.last(REASON));
    expect(await stockOf(medicine), 'nothing put back twice').toBe('N1:1,N2:4');
  });
});
