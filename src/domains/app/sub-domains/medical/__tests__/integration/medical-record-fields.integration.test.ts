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
 * The pharmacy record fields (iteration change-pharmacy-record-fields-2026-10-31-wpan, A1–A11):
 * a medicine's HSN code, pack label and units per pack (loose strips and tablets — its stock
 * counts units, D5, and the unit count is locked while it holds stock, D7); the MRP on each batch
 * and order line (D8), which a sale charges, per unit and rounded down (D2, D6), with the pack and
 * HSN snapshotted on the line (D3); a supplier's email and address; an order's note, the one field
 * a received order still changes (D10); and a supplier credit priced per unit.
 */
describe('Medical store — pharmacy record fields (change-pharmacy-record-fields)', () => {
  const S = String(Date.now());
  const T = `r${S}`;
  const REASON = '.error.reason';
  const FIELDS = '[.error.errors[].field] | join(",")';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let vesu = '';
  let manufacturer = '';
  let supplier = '';
  let buyer = '';

  /** Each batch's units left and MRP, `<batch>:<quantity>@<mrp>` in batch-number order. */
  async function batchesOf(medicine: string): Promise<string> {
    const rows = await operatorQuery<
      { batch_number: string; quantity: number; mrp: string | null }[]
    >`
      SELECT b.batch_number, b.quantity, b.mrp FROM app.medicine_batches b
      JOIN app.medicines m ON m.id = b.medicine_id
      WHERE m.public_id = ${medicine} ORDER BY b.batch_number
    `;
    return rows
      .map(
        (row) => `${row.batch_number}:${row.quantity}@${row.mrp === null ? '-' : Number(row.mrp)}`,
      )
      .join(',');
  }

  /** A sale of `quantity` units of the medicine to the run's buyer. */
  function sale(medicine: string, quantity: number): Record<string, unknown> {
    return { branch_id: vesu, contact_id: buyer, items: [{ medicine_id: medicine, quantity }] };
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture).as('owner');
    vesu = fixture.branches.vesu;
    await flow.expect(200, 'a manufacturer', 'POST', '/app/manufacturers', { name: `Cipla ${T}` });
    manufacturer = flow.last('.data.id');
    await flow.expect(200, 'a buyer', 'POST', '/app/contacts', {
      first_name: 'Ira',
      last_name: T,
      phones: [{ phone: `+917${S.slice(-7)}42`, is_primary: true }],
    });
    buyer = flow.last('.data.id');
  });

  afterAll(async () => {
    await app.close();
  });

  it('A1, A3, A11: a medicine keeps its HSN code, pack label, units per pack and batch MRPs', async () => {
    flow.as('owner');
    await flow.expect(200, 'a medicine sold in packs', 'POST', '/app/medicines', {
      name: `Glycolac ${T}`,
      composition: 'Glycolic acid 6%',
      manufacturer_id: manufacturer,
      mrp: 300,
      hsn_code: '33049990',
      pack_label: '50GM',
      batches: [
        { batch_number: 'G1', expiry_month: '2029-01', quantity: 4, mrp: 280 },
        { batch_number: 'G2', expiry_month: '2030-01', quantity: 2 },
      ],
    });
    const medicine = flow.last('.data.id');
    flow.expectValue(
      'the new fields, one unit a pack by default (A11)',
      '[.data.hsn_code, .data.pack_label, .data.units_per_pack, .data.quantity] | map(tostring) | join(",")',
      '33049990,50GM,1,6',
    );
    flow.expectValue(
      "each batch's MRP — none recorded on the second",
      '[.data.batches[] | "\\(.batch_number)@\\(.mrp)"] | join(",")',
      'G1@280,G2@null',
    );
    await flow.expect(200, 'clear the pack label', 'PATCH', `/app/medicines/${medicine}`, {
      pack_label: null,
      hsn_code: '3304',
    });
    flow.expectValue(
      'cleared and changed',
      '[.data.pack_label, .data.hsn_code] | map(tostring) | join(",")',
      'null,3304',
    );

    for (const hsn of ['330', '33049', '3304999900', '33A4']) {
      await flow.expect(400, `HSN ${hsn}`, 'POST', '/app/medicines', {
        name: `Bad HSN ${hsn} ${T}`,
        manufacturer_id: manufacturer,
        mrp: 10,
        hsn_code: hsn,
      });
      expect(flow.last(FIELDS), 'on hsn_code').toMatch(/(^|\.)hsn_code$/);
    }
    for (const units of [0, 1001, 2.5]) {
      await flow.expect(400, `units per pack ${units}`, 'POST', '/app/medicines', {
        name: `Bad units ${units} ${T}`,
        manufacturer_id: manufacturer,
        mrp: 10,
        units_per_pack: units,
      });
      expect(flow.last(FIELDS), 'on units_per_pack').toMatch(/(^|\.)units_per_pack$/);
    }
    await flow.expect(400, 'a batch MRP of 0', 'POST', '/app/medicines', {
      name: `Zero MRP ${T}`,
      manufacturer_id: manufacturer,
      mrp: 10,
      batches: [{ batch_number: 'Z', expiry_month: '2029-01', quantity: 1, mrp: 0 }],
    });
  });

  it('A2: units per pack changes only while the medicine holds no stock', async () => {
    flow.as('owner');
    await flow.expect(200, 'a medicine with stock', 'POST', '/app/medicines', {
      name: `Doxy ${T}`,
      manufacturer_id: manufacturer,
      mrp: 120,
      batches: [{ batch_number: 'D1', expiry_month: '2029-01', quantity: 3 }],
    });
    const stocked = flow.last('.data.id');
    await flow.expect(409, 'loose with stock', 'PATCH', `/app/medicines/${stocked}`, {
      units_per_pack: 10,
    });
    flow.expectValue('refused', REASON, 'medicine_has_stock');
    await flow.expect(200, 'the same count is no change', 'PATCH', `/app/medicines/${stocked}`, {
      units_per_pack: 1,
    });

    await flow.expect(200, 'a medicine without stock', 'POST', '/app/medicines', {
      name: `Azithral ${T}`,
      manufacturer_id: manufacturer,
      mrp: 120,
    });
    const empty = flow.last('.data.id');
    await flow.expect(200, 'loose without stock', 'PATCH', `/app/medicines/${empty}`, {
      units_per_pack: 10,
    });
    flow.expectValue('changed', '.data.units_per_pack', 10);
  });

  it('A4: a supplier keeps its email and address', async () => {
    flow.as('owner');
    await flow.expect(200, 'a supplier with contact details', 'POST', '/app/suppliers', {
      name: `Satvam Pharma ${T}`,
      email: 'orders@satvam.example',
      address: '12, Ring Road, Surat 395002',
    });
    supplier = flow.last('.data.id');
    flow.expectValue(
      'kept',
      '[.data.email, .data.address] | join("|")',
      'orders@satvam.example|12, Ring Road, Surat 395002',
    );
    await flow.expect(400, 'a placeholder email', 'POST', '/app/suppliers', {
      name: `Placeholder ${T}`,
      email: 'satvam__',
    });
    expect(flow.last(FIELDS), 'on email').toMatch(/(^|\.)email$/);
    await flow.expect(200, 'clear the address', 'PATCH', `/app/suppliers/${supplier}`, {
      address: null,
    });
    await flow.expect(200, 'read it back', 'GET', `/app/suppliers/${supplier}`);
    flow.expectValue(
      'cleared',
      '[.data.email, .data.address] | map(tostring) | join("|")',
      'orders@satvam.example|null',
    );
  });

  it('A5, A6, A7, A8, A9: an order with MRPs and a note, received in units, sold loose at the batch MRP', async () => {
    flow.as('owner');
    await flow.expect(200, 'a loose-selling medicine', 'POST', '/app/medicines', {
      name: `Telma ${T}`,
      manufacturer_id: manufacturer,
      mrp: 120,
      hsn_code: '300490',
      pack_label: '1*10',
      units_per_pack: 10,
    });
    const loose = flow.last('.data.id');
    await flow.expect(200, 'a pack medicine', 'POST', '/app/medicines', {
      name: `Sunscreen ${T}`,
      manufacturer_id: manufacturer,
      mrp: 450,
      pack_label: '60ML',
    });
    const pack = flow.last('.data.id');

    await flow.expect(200, 'order both, with a note', 'POST', '/app/medical-purchase-orders', {
      supplier_id: supplier,
      note: '30 DAYS DUE',
      items: [
        { medicine_id: loose, quantity: 5, free_quantity: 1, rate: 80, mrp: 125.55 },
        { medicine_id: pack, quantity: 2, rate: 300 },
      ],
    });
    const order = flow.last('.data.id');
    flow.expectValue(
      "the note and each line's MRP (A5)",
      '[.data.note, (.data.items[] | .mrp | tostring)] | join(",")',
      '30 DAYS DUE,125.55,null',
    );
    const [looseLine, packLine] = [flow.last('.data.items[0].id'), flow.last('.data.items[1].id')];

    await flow.expect(
      200,
      'receive both',
      'POST',
      `/app/medical-purchase-orders/${order}/receive`,
      {
        items: [
          { id: looseLine, batch_number: 'T1', expiry_month: '2029-06' },
          { id: packLine, batch_number: 'S1', expiry_month: '2029-06', mrp: 449 },
        ],
      },
    );
    flow.expectValue('the receive MRP on the line', '.data.items[1].mrp', 449);
    expect(await batchesOf(loose), '(5 + 1 free) × 10 units, the line MRP (A6)').toBe(
      'T1:60@125.55',
    );
    expect(await batchesOf(pack), 'packs as they are, the MRP sent at receive').toBe('S1:2@449');

    await flow.expect(
      200,
      'a note after receiving (D10)',
      'PATCH',
      `/app/medical-purchase-orders/${order}`,
      {
        note: 'without gst bill',
      },
    );
    flow.expectValue('changed', '.data.note', 'without gst bill');
    await flow.expect(
      409,
      'anything else after receiving',
      'PATCH',
      `/app/medical-purchase-orders/${order}`,
      {
        note: 'paid',
        supplier_bill_number: 'X-1',
      },
    );
    flow.expectValue('still read-only', REASON, 'transition_not_allowed');

    await flow.expect(200, 'sell 3 tablets (A8)', 'POST', '/app/medical-sales', sale(loose, 3));
    flow.expectValue(
      'a tenth of the batch MRP, rounded down, with pack and HSN (A9)',
      '[.data.items[0] | .quantity, .rate, .amount, .pack_size, .hsn_code, .units_per_pack, .batch_number] | map(tostring) | join(",")',
      '3,12.55,37.65,1*10,300490,10,T1',
    );
    expect(await batchesOf(loose), 'three units out').toBe('T1:57@125.55');

    await flow.expect(200, 'sell a sunscreen (A7)', 'POST', '/app/medical-sales', sale(pack, 1));
    flow.expectValue(
      "the batch's MRP, not the medicine's",
      '[.data.items[0] | .rate, .pack_size, (.hsn_code | tostring)] | map(tostring) | join(",")',
      '449,60ML,null',
    );
  });

  it('A7, A11: a batch without an MRP sells at the medicine MRP', async () => {
    flow.as('owner');
    await flow.expect(200, 'opening stock without a batch MRP', 'POST', '/app/medicines', {
      name: `Cetaphil ${T}`,
      manufacturer_id: manufacturer,
      mrp: 699,
      batches: [{ batch_number: 'C1', expiry_month: '2029-01', quantity: 2 }],
    });
    const medicine = flow.last('.data.id');
    await flow.expect(200, 'sell one', 'POST', '/app/medical-sales', sale(medicine, 1));
    flow.expectValue(
      "the medicine's MRP, as before",
      '[.data.items[0] | .rate, .units_per_pack, (.pack_size | tostring)] | map(tostring) | join(",")',
      '699,1,null',
    );
  });

  it('A10: a supplier credit on a loose-selling medicine is priced per unit', async () => {
    flow.as('owner');
    await flow.expect(200, 'a loose medicine bought at ₹80 a strip', 'POST', '/app/medicines', {
      name: `Montek ${T}`,
      manufacturer_id: manufacturer,
      mrp: 150,
      units_per_pack: 10,
      batches: [
        {
          batch_number: 'M1',
          expiry_month: '2029-01',
          quantity: 30,
          purchase_rate: 80,
          supplier_id: supplier,
        },
      ],
    });
    const batch = flow.last('.data.batches[0].id');
    await flow.expect(200, 'return 3 tablets', 'POST', `/app/suppliers/${supplier}/credits`, {
      medicine_batch_id: batch,
      quantity: 3,
    });
    flow.expectValue(
      '₹8 a tablet',
      '[.data.quantity, .data.rate, .data.amount] | map(tostring) | join(",")',
      '3,8,24',
    );
  });
});
