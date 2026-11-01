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
 * Short deliveries (iteration feat-short-delivery-2026-11-01-qfnq, A-1 – A-5): receive records the
 * packs and free packs that came per line (what was ordered unless sent, never more); the batch takes
 * them as units; the line, its GST and the order's totals and dues follow what arrived; a line that
 * came short is marked and counted.
 */
describe('Medical store — short deliveries (feat-short-delivery)', () => {
  const S = String(Date.now());
  const T = `s${S}`;

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let supplier = '';
  let strips = '';
  let cream = '';

  /** A medicine's batches as `<batch>:<units>`, in batch-number order. */
  async function batchesOf(medicine: string): Promise<string> {
    const rows = await operatorQuery<{ batch_number: string; quantity: number }[]>`
      SELECT b.batch_number, b.quantity FROM app.medicine_batches b
      JOIN app.medicines m ON m.id = b.medicine_id
      WHERE m.public_id = ${medicine} ORDER BY b.batch_number
    `;
    return rows.map((row) => `${row.batch_number}:${row.quantity}`).join(',');
  }

  /** A new order of 10 (+2 free) strips at ₹112 and 3 creams at ₹200; answers its id and line ids. */
  async function order(): Promise<{ id: string; strips: string; cream: string }> {
    await flow.expect(200, 'an order', 'POST', '/app/medical-purchase-orders', {
      supplier_id: supplier,
      items: [
        { medicine_id: strips, quantity: 10, free_quantity: 2, rate: 112 },
        { medicine_id: cream, quantity: 3, rate: 200 },
      ],
    });
    return {
      id: flow.last('.data.id'),
      strips: flow.last('.data.items[0].id'),
      cream: flow.last('.data.items[1].id'),
    };
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture).as('owner');
    await flow.expect(200, 'a manufacturer', 'POST', '/app/manufacturers', { name: `Sun ${T}` });
    const manufacturer = flow.last('.data.id');
    await flow.expect(200, 'a supplier', 'POST', '/app/suppliers', { name: `Shree ${T}` });
    supplier = flow.last('.data.id');
    await flow.expect(200, 'a medicine sold loose', 'POST', '/app/medicines', {
      name: `Telma ${T}`,
      manufacturer_id: manufacturer,
      mrp: 150,
      gst_percent: 12,
      pack_label: '1*10',
      units_per_pack: 10,
    });
    strips = flow.last('.data.id');
    await flow.expect(200, 'a medicine sold in packs', 'POST', '/app/medicines', {
      name: `Cream ${T}`,
      manufacturer_id: manufacturer,
      mrp: 300,
      gst_percent: 18,
    });
    cream = flow.last('.data.id');
  });

  afterAll(async () => {
    await app.close();
  });

  it('A-1 – A-4: receives what came, owes what came, and marks the short line', async () => {
    const placed = await order();
    await flow.expect(
      200,
      'receive 8 (+1 of 2 free)',
      'POST',
      `/app/medical-purchase-orders/${placed.id}/receive`,
      {
        items: [
          {
            id: placed.strips,
            batch_number: 'SH1',
            received_quantity: 8,
            received_free_quantity: 1,
          },
          { id: placed.cream, batch_number: 'CR1' },
        ],
      },
    );
    expect(await batchesOf(strips), '(8 + 1) × 10 units (A-1)').toBe('SH1:90');
    expect(await batchesOf(cream), 'the cream as ordered (A-4)').toBe('CR1:3');
    expect(
      flow.last(
        '[.data.items[0] | .received_quantity, .received_free_quantity, .is_short, .amount, .taxable_amount, .gst_amount] | map(tostring) | join(",")',
      ),
      '8 × ₹112, GST inside, short (A-2)',
    ).toBe('8,1,true,896,800,96');
    expect(
      flow.last(
        '[.data.items[1] | .received_quantity, .is_short, .amount] | map(tostring) | join(",")',
      ),
      'received in full, not short (A-4)',
    ).toBe('3,false,600');
    expect(
      flow.last(
        '[.data | .total, .taxable_total, .gst_total, .due_amount, .short_line_count] | map(tostring) | join(",")',
      ),
      'the order owes what came (A-3)',
    ).toBe('1496,1308.47,187.53,1496,1');

    await flow.expect(200, 'read it back', 'GET', `/app/medical-purchase-orders/${placed.id}`);
    flow.expectValue('still counted', '.data.short_line_count', 1);
  });

  it('A-5: more than was ordered is a 400 on items; nothing that came is not received', async () => {
    const placed = await order();
    await flow.expect(
      400,
      'more than ordered',
      'POST',
      `/app/medical-purchase-orders/${placed.id}/receive`,
      {
        items: [{ id: placed.strips, received_quantity: 11 }],
      },
    );
    flow.expectValue('on items', '[.error.errors[].field] | join(",")', 'items');
    await flow.expect(
      200,
      'the strips came with nothing',
      'POST',
      `/app/medical-purchase-orders/${placed.id}/receive`,
      {
        items: [{ id: placed.strips, received_quantity: 0, received_free_quantity: 0 }],
      },
    );
    expect(
      flow.last(
        '[.data.items[0] | .is_received, .received_quantity, .is_short] | map(tostring) | join(",")',
      ),
      'not received, not short (SD8)',
    ).toBe('false,null,false');
    flow.expectValue('the order owes the cream alone', '.data.total', 600);
  });
});
