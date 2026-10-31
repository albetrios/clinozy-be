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
 * GST on medical purchase lines (iteration feat-purchase-line-gst-2026-10-31-vcec, A-1 – A-7): a
 * line's GST rate (the medicine's unless sent) and whether its rate includes GST (yes unless
 * sent), its taxable value and GST by the invoice calculation; the order's taxable and GST totals
 * (the received lines' once received); and the month's purchase GST summary by rate and HSN code,
 * with its CSV and gates.
 */
describe('Medical store — purchase line GST (feat-purchase-line-gst)', () => {
  const S = String(Date.now());
  const T = `g${S}`;
  const SUMMARY = '/app/medical-purchase-orders/gst-summary';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let supplier = '';
  let twelve = '';
  let zero = '';
  let eighteen = '';
  let order = '';
  let month = '';

  /** One line of the last answer: `taxable,gst,amount,rate%,inclusive`. */
  function line(index: number): string {
    return flow.last(
      `[.data.items[${index}] | .taxable_amount, .gst_amount, .amount, .gst_percent, .is_gst_inclusive] | map(tostring) | join(",")`,
    );
  }

  /** The last answer's order totals: `taxable,gst,total`. */
  function totals(): string {
    return flow.last('[.data | .taxable_total, .gst_total, .total] | map(tostring) | join(",")');
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
    const medicine = async (name: string, extra: Record<string, unknown>) => {
      await flow.expect(200, name, 'POST', '/app/medicines', {
        name: `${name} ${T}`,
        manufacturer_id: manufacturer,
        mrp: 300,
        ...extra,
      });
      return flow.last('.data.id');
    };
    twelve = await medicine('Telma', { gst_percent: 12, hsn_code: '300490' });
    zero = await medicine('Saline', { gst_percent: 0 });
    eighteen = await medicine('Sunscreen', { gst_percent: 18, hsn_code: '330499' });
    const [today] = await operatorQuery<{ month: string }[]>`
      SELECT to_char(now() AT TIME ZONE timezone, 'YYYY-MM') AS month
      FROM tenancy.organizations WHERE public_id = ${fixture.organization.publicId}
    `;
    month = today?.month ?? '';
  });

  afterAll(async () => {
    await app.close();
  });

  it('A-1 – A-4: each line carries its GST, the order its taxable and GST totals', async () => {
    await flow.expect(200, 'an order', 'POST', '/app/medical-purchase-orders', {
      supplier_id: supplier,
      items: [
        { medicine_id: twelve, quantity: 10, rate: 112 },
        { medicine_id: twelve, quantity: 10, rate: 112, is_gst_inclusive: false },
        { medicine_id: zero, quantity: 2, rate: 250 },
        { medicine_id: eighteen, quantity: 1, rate: 118, gst_percent: 18 },
      ],
    });
    order = flow.last('.data.id');
    expect(line(0), "inclusive, the medicine's 12 % (A-1, A-3)").toBe('1000,120,1120,12,true');
    expect(line(1), 'exclusive: GST on top (A-2)').toBe('1120,134.4,1254.4,12,false');
    expect(line(2), '0 % — without a GST bill').toBe('500,0,500,0,true');
    expect(line(3), 'the rate sent').toBe('100,18,118,18,true');
    expect(totals(), 'total = taxable + GST (A-4)').toBe('2720,272.4,2992.4');

    await flow.expect(200, 'read it back', 'GET', `/app/medical-purchase-orders/${order}`);
    expect(totals(), 'stored').toBe('2720,272.4,2992.4');

    await flow.expect(400, 'a rate GST does not have', 'POST', '/app/medical-purchase-orders', {
      supplier_id: supplier,
      items: [{ medicine_id: twelve, quantity: 1, rate: 10, gst_percent: 7 }],
    });
    expect(flow.last('[.error.errors[].field] | join(",")')).toMatch(/items/);
  });

  it('A-4: receiving totals the received lines only; the supplier is owed that', async () => {
    await flow.expect(200, 'read the lines', 'GET', `/app/medical-purchase-orders/${order}`);
    const exclusiveLine = flow.last('.data.items[1].id');
    await flow.expect(200, 'receive', 'POST', `/app/medical-purchase-orders/${order}/receive`, {
      items: [{ id: exclusiveLine, is_received: false }],
    });
    expect(totals(), 'the three received lines').toBe('1600,138,1738');
    flow.expectValue('owed in full', '.data.due_amount', 1738);
  });

  it('A-6: the month summary — by rate, by HSN code, in total — over received orders only', async () => {
    await flow.expect(200, 'an order still waiting', 'POST', '/app/medical-purchase-orders', {
      supplier_id: supplier,
      items: [{ medicine_id: twelve, quantity: 5, rate: 50 }],
    });
    await flow.expect(200, 'the month', 'GET', `${SUMMARY}?month=${month}`);
    flow.expectValue('the month', '.data.month', month);
    expect(
      flow.last(
        '[.data.by_rate[] | [.gst_percent, .line_count, .taxable_amount, .gst_amount, .total_amount] | map(tostring) | join(":")] | join(" ")',
      ),
      'rates ascending',
    ).toBe('0:1:500:0:500 12:1:1000:120:1120 18:1:100:18:118');
    expect(
      flow.last(
        '[.data.by_hsn[] | [.hsn_code, .gst_percent, .total_amount] | map(tostring) | join(":")] | join(" ")',
      ),
      'HSN codes ascending, none last',
    ).toBe('300490:12:1120 330499:18:118 null:0:500');
    expect(
      flow.last(
        '[.data.totals | .order_count, .line_count, .taxable_amount, .gst_amount, .total_amount] | map(tostring) | join(",")',
      ),
      'one received order, three received lines',
    ).toBe('1,3,1600,138,1738');

    await flow.expect(200, 'a month with nothing', 'GET', `${SUMMARY}?month=2020-01`);
    flow.expectValue(
      'empty',
      '[(.data.by_rate | length), (.data.by_hsn | length), .data.totals.total_amount] | map(tostring) | join(",")',
      '0,0,0',
    );
    await flow.expect(400, 'no month', 'GET', SUMMARY);
    await flow.expect(400, 'not a month', 'GET', `${SUMMARY}?month=2026-13`);
    await flow.expect(400, 'a month to come', 'GET', `${SUMMARY}?month=2999-01`);
    flow.expectValue('on month', '[.error.errors[].field] | join(",")', 'month');
  });

  it('A-7: the CSV carries the same rows and needs medicine:export', async () => {
    await flow.expect(200, 'the CSV', 'GET', `${SUMMARY}/exports?month=${month}`);
    flow.expectValue('its name', '.data.file_name', `purchase-gst-summary-${month}.csv`);
    expect(flow.last('.data.content').split(/\r?\n/).filter(Boolean)).toEqual([
      'section,gst_percent,hsn_code,line_count,taxable_amount,gst_amount,total_amount',
      'by_rate,0,,1,500.00,0.00,500.00',
      'by_rate,12,,1,1000.00,120.00,1120.00',
      'by_rate,18,,1,100.00,18.00,118.00',
      'by_hsn,12,300490,1,1000.00,120.00,1120.00',
      'by_hsn,18,330499,1,100.00,18.00,118.00',
      'by_hsn,0,,1,500.00,0.00,500.00',
      'total,,,3,1600.00,138.00,1738.00',
    ]);
    flow.expectValue('rows', '.data.row_count', 7);

    flow.as('doctor');
    await flow.expect(200, 'medicine:read reads the summary', 'GET', `${SUMMARY}?month=${month}`);
    await flow.expect(403, 'but not its CSV', 'GET', `${SUMMARY}/exports?month=${month}`);
    flow.as('front_desk');
    await flow.expect(403, 'without medicine:read', 'GET', `${SUMMARY}?month=${month}`);
    flow.as('owner');
  });
});
