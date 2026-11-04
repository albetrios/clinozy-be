import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { operatorQuery } from '@/tests/helpers/operator-database.js';
import { executeAsClinozyBeAppTenant } from '@/tests/helpers/rls-matrix.helper.js';
import { sql } from 'drizzle-orm';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/**
 * The previous release (v9.4.1) keeps writing while this release's migrations apply, and again after a
 * rollback to it. Each case replays one of its writes — the SQL its repositories send — against this
 * release's schema: the write passes, completed in this release's shape by
 * `20261104043911_previous_release_write_compatibility.sql`, and the constraint still refuses a write
 * that breaks it on purpose. Remove this suite with that migration's contract.
 */
describe('Previous-release writes — integration (expand phase)', () => {
  const S = String(Date.now());
  const T = `p${S}`;
  const digits = S.slice(-7);

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let supplierId = 0;
  let strips = { id: 0, batch: 0 };
  let cream = { id: 0, batch: 0 };

  /** Internal id of the `table` row with public id `publicId`. */
  async function internalId(table: string, publicId: string): Promise<number> {
    const [row] = await operatorQuery.unsafe<{ id: number }[]>(
      `SELECT id::int AS id FROM ${table} WHERE public_id = $1`,
      [publicId],
    );
    if (!row) throw new Error(`${table} ${publicId} not found`);
    return row.id;
  }

  /** v9.4.1's order create: the order with its total and no split, then its lines in one INSERT. */
  async function previousReleaseOrder(): Promise<{ id: number; publicId: string }> {
    const publicId = generatePublicId('medicalPurchaseOrder');
    const [order] = await operatorQuery<{ id: number }[]>`
      INSERT INTO app.medical_purchase_orders (public_id, organization_id, supplier_id, order_date, total)
      VALUES (${publicId}, ${fixture.organization.id}, ${supplierId}, current_date, 1720.00)
      RETURNING id::int AS id
    `;
    const orderId = order?.id ?? 0;
    await operatorQuery`
      INSERT INTO app.medical_purchase_order_items
        (public_id, organization_id, medical_purchase_order_id, line_number, medicine_id, quantity,
         free_quantity, rate, amount)
      VALUES
        (${generatePublicId('medicalPurchaseOrderItem')}, ${fixture.organization.id}, ${orderId}, 1,
         ${strips.id}, 10, 2, 112.00, 1120.00),
        (${generatePublicId('medicalPurchaseOrderItem')}, ${fixture.organization.id}, ${orderId}, 2,
         ${cream.id}, 3, 0, 200.00, 600.00)
    `;
    return { id: orderId, publicId };
  }

  /** The order's `total,taxable_total,gst_total`. */
  async function split(orderId: number): Promise<string> {
    const [row] = await operatorQuery<{ split: string }[]>`
      SELECT concat_ws(',', total, taxable_total, gst_total) AS split
      FROM app.medical_purchase_orders WHERE id = ${orderId}
    `;
    return row?.split ?? '';
  }

  /** v9.4.1's markItemReceived: ticked or not, with its batch — and no received quantities. */
  async function previousReleaseReceive(options: {
    orderId: number;
    lineNumber: number;
    isReceived: boolean;
    batchId: number | null;
  }): Promise<void> {
    await operatorQuery`
      UPDATE app.medical_purchase_order_items
      SET is_received = ${options.isReceived}, batch_number = ${options.batchId ? 'OLD1' : null},
          medicine_batch_id = ${options.batchId},
          updated_at = greatest(created_at, now())
      WHERE medical_purchase_order_id = ${options.orderId} AND line_number = ${options.lineNumber}
    `;
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture).as('owner');

    await flow.expect(200, 'a manufacturer', 'POST', '/app/manufacturers', { name: `Sun ${T}` });
    const manufacturer = flow.last('.data.id');
    await flow.expect(200, 'a supplier', 'POST', '/app/suppliers', { name: `Shree ${T}` });
    supplierId = await internalId('app.suppliers', flow.last('.data.id'));
    await flow.expect(200, 'a 12 % medicine', 'POST', '/app/medicines', {
      name: `Telma ${T}`,
      manufacturer_id: manufacturer,
      mrp: 150,
      gst_percent: 12,
    });
    const stripsId = flow.last('.data.id');
    await flow.expect(200, 'an 18 % medicine', 'POST', '/app/medicines', {
      name: `Cream ${T}`,
      manufacturer_id: manufacturer,
      mrp: 300,
      gst_percent: 18,
    });
    const creamId = flow.last('.data.id');
    // A batch of each, received through this release, for the old receive to file into
    await flow.expect(200, 'an order', 'POST', '/app/medical-purchase-orders', {
      supplier_id: (
        await operatorQuery<{ public_id: string }[]>`
        SELECT public_id FROM app.suppliers WHERE id = ${supplierId}
      `
      )[0]?.public_id,
      items: [
        { medicine_id: stripsId, quantity: 1, rate: 112 },
        { medicine_id: creamId, quantity: 1, rate: 200 },
      ],
    });
    const placed = flow.last('.data.id');
    await flow.expect(200, 'received', 'POST', `/app/medical-purchase-orders/${placed}/receive`, {
      items: [
        { id: flow.last('.data.items[0].id'), batch_number: 'NEW1' },
        { id: flow.last('.data.items[1].id'), batch_number: 'NEW2' },
      ],
    });
    const batches = await operatorQuery<{ medicine: string; medicine_id: number; batch: number }[]>`
      SELECT m.public_id AS medicine, m.id::int AS medicine_id, b.id::int AS batch
      FROM app.medicine_batches b JOIN app.medicines m ON m.id = b.medicine_id
      WHERE m.public_id = ANY(${[stripsId, creamId]})
    `;
    const of = (medicine: string) => batches.find((row) => row.medicine === medicine);
    strips = { id: of(stripsId)?.medicine_id ?? 0, batch: of(stripsId)?.batch ?? 0 };
    cream = { id: of(creamId)?.medicine_id ?? 0, batch: of(creamId)?.batch ?? 0 };
  });

  afterAll(async () => {
    await app.close();
  });

  it('purchase order: a line without GST takes its medicine’s rate, and the order splits its total', async () => {
    const order = await previousReleaseOrder();
    const lines = await operatorQuery<{ line: string }[]>`
      SELECT concat_ws(',', gst_percent, is_gst_inclusive, amount, taxable_amount, gst_amount) AS line
      FROM app.medical_purchase_order_items WHERE medical_purchase_order_id = ${order.id}
      ORDER BY line_number
    `;
    expect(
      lines.map((row) => row.line),
      'PG8: rate inclusive, amount unchanged',
    ).toEqual(['12,t,1120.00,1000.00,120.00', '18,t,600.00,508.47,91.53']);
    expect(await split(order.id), 'the split of its lines').toBe('1720.00,1508.47,211.53');

    // Receive everything as ordered: v9.4.1 marks each line, then the order (same total)
    await previousReleaseReceive({
      orderId: order.id,
      lineNumber: 1,
      isReceived: true,
      batchId: strips.batch,
    });
    await previousReleaseReceive({
      orderId: order.id,
      lineNumber: 2,
      isReceived: true,
      batchId: cream.batch,
    });
    await operatorQuery`
      UPDATE app.medical_purchase_orders SET stage = 'received', received_at = now(), total = 1720.00
      WHERE id = ${order.id}
    `;
    const received = await operatorQuery<{ received: string }[]>`
      SELECT concat_ws(',', received_quantity, received_free_quantity, is_short) AS received
      FROM app.medical_purchase_order_items WHERE medical_purchase_order_id = ${order.id}
      ORDER BY line_number
    `;
    expect(
      received.map((row) => row.received),
      'SD10: received = ordered',
    ).toEqual(['10,2,f', '3,0,f']);
    expect(await split(order.id)).toBe('1720.00,1508.47,211.53');

    await flow.expect(
      200,
      'this release reads it',
      'GET',
      `/app/medical-purchase-orders/${order.publicId}`,
    );
    flow.expectValue(
      'its totals',
      '[.data | .total, .taxable_total, .gst_total, .short_line_count] | map(tostring) | join(",")',
      '1720,1508.47,211.53,0',
    );
  });

  it('purchase order: a partial receive re-splits the total over the received lines', async () => {
    const order = await previousReleaseOrder();
    await previousReleaseReceive({
      orderId: order.id,
      lineNumber: 1,
      isReceived: true,
      batchId: strips.batch,
    });
    await previousReleaseReceive({
      orderId: order.id,
      lineNumber: 2,
      isReceived: false,
      batchId: null,
    });
    await operatorQuery`
      UPDATE app.medical_purchase_orders SET stage = 'received', received_at = now(), total = 1120.00
      WHERE id = ${order.id}
    `;
    expect(await split(order.id), 'only the received line counts').toBe('1120.00,1000.00,120.00');
  });

  it('purchase order: a receive that keeps the ordered total still re-splits over the received lines', async () => {
    const order = await previousReleaseOrder();
    // v9.4.1's receive: goods not ordered go in first — 3 × ₹200 of the 12 % medicine, the same
    // amount as the cream line left unticked, so the total stays ₹1720
    await operatorQuery`
      INSERT INTO app.medical_purchase_order_items
        (public_id, organization_id, medical_purchase_order_id, line_number, medicine_id, quantity,
         free_quantity, rate, amount)
      VALUES (${generatePublicId('medicalPurchaseOrderItem')}, ${fixture.organization.id}, ${order.id},
        3, ${strips.id}, 3, 0, 200.00, 600.00)
    `;
    await previousReleaseReceive({
      orderId: order.id,
      lineNumber: 1,
      isReceived: true,
      batchId: strips.batch,
    });
    await previousReleaseReceive({
      orderId: order.id,
      lineNumber: 2,
      isReceived: false,
      batchId: null,
    });
    await previousReleaseReceive({
      orderId: order.id,
      lineNumber: 3,
      isReceived: true,
      batchId: strips.batch,
    });
    await operatorQuery`
      UPDATE app.medical_purchase_orders SET stage = 'received', received_at = now(), total = 1720.00
      WHERE id = ${order.id}
    `;
    expect(await split(order.id), '(1000 + 535.71) taxable, (120 + 64.29) GST').toBe(
      '1720.00,1535.71,184.29',
    );
  });

  it('as the production role, in the organization’s context: the triggers read and write under RLS', async () => {
    await flow.expect(200, 'an open lead', 'POST', '/app/leads', {
      contact: {
        first_name: 'Rita',
        last_name: T,
        phones: [{ phone: `+917${digits}73`, is_primary: true }],
      },
    });
    const lead = flow.last('.data.id');
    await flow.expect(200, 'a contact registered by age', 'POST', '/app/contacts', {
      first_name: 'Role',
      last_name: T,
      phones: [{ phone: `+916${digits}74`, is_primary: true }],
      age: 30,
    });
    const contact = flow.last('.data.id');
    const orderPublicId = generatePublicId('medicalPurchaseOrder');

    await executeAsClinozyBeAppTenant(fixture.organization.publicId, async (transaction) => {
      await transaction.execute(sql`
        INSERT INTO app.medical_purchase_orders (public_id, organization_id, supplier_id, order_date, total)
        VALUES (${orderPublicId}, ${fixture.organization.id}, ${supplierId}, current_date, 1120.00)
      `);
      await transaction.execute(sql`
        INSERT INTO app.medical_purchase_order_items
          (public_id, organization_id, medical_purchase_order_id, line_number, medicine_id, quantity,
           free_quantity, rate, amount)
        SELECT ${generatePublicId('medicalPurchaseOrderItem')}, ${fixture.organization.id}, id, 1,
          ${strips.id}, 10, 0, 112.00, 1120.00
        FROM app.medical_purchase_orders
        WHERE organization_id = ${fixture.organization.id} AND public_id = ${orderPublicId}
      `);
      await transaction.execute(
        sql`UPDATE app.leads SET status = 'lost'
          WHERE organization_id = ${fixture.organization.id} AND public_id = ${lead}`,
      );
      await transaction.execute(
        sql`UPDATE app.contacts SET date_of_birth = NULL
          WHERE organization_id = ${fixture.organization.id} AND public_id = ${contact}`,
      );
    });

    const [order] = await operatorQuery<{ id: number }[]>`
      SELECT id::int AS id FROM app.medical_purchase_orders WHERE public_id = ${orderPublicId}
    `;
    expect(await split(order?.id ?? 0), 'the medicine read and the order split under RLS').toBe(
      '1120.00,1000.00,120.00',
    );
    const [closed] = await operatorQuery<{ closed: boolean }[]>`
      SELECT closed_at IS NOT NULL AS closed FROM app.leads WHERE public_id = ${lead}
    `;
    expect(closed?.closed).toBe(true);
    const [cleared] = await operatorQuery<{ approximate: boolean }[]>`
      SELECT date_of_birth_is_approximate AS approximate FROM app.contacts WHERE public_id = ${contact}
    `;
    expect(cleared?.approximate).toBe(false);
  });

  it('purchase order: a write that breaks the rules on purpose is still refused', async () => {
    const order = await previousReleaseOrder();
    await expect(
      operatorQuery`UPDATE app.medical_purchase_orders SET taxable_total = 1.00 WHERE id = ${order.id}`,
      'a split that does not add up',
    ).rejects.toThrow(/chk_medical_purchase_orders_totals/);
    await expect(
      operatorQuery`
        UPDATE app.medical_purchase_order_items SET received_quantity = 10
        WHERE medical_purchase_order_id = ${order.id} AND line_number = 1
      `,
      'a received quantity on a line not received',
    ).rejects.toThrow(/chk_medical_purchase_order_items_received/);
  });

  it('lead: check-in closes it with a date, a reopen clears it, and D13 still holds', async () => {
    await flow.expect(200, 'an open lead', 'POST', '/app/leads', {
      contact: {
        first_name: 'Lena',
        last_name: T,
        phones: [{ phone: `+919${digits}71`, is_primary: true }],
      },
    });
    const lead = flow.last('.data.id');

    // v9.4.1's markVisited — status only
    await operatorQuery`
      UPDATE app.leads SET status = 'clinic_visited', updated_at = greatest(now(), created_at)
      WHERE public_id = ${lead}
    `;
    const [visited] = await operatorQuery<{ closed: boolean }[]>`
      SELECT closed_at IS NOT NULL AS closed FROM app.leads WHERE public_id = ${lead}
    `;
    expect(visited?.closed, 'closed with a date').toBe(true);

    // v9.4.1's status PATCH back to an open status — closed_at untouched
    await operatorQuery`UPDATE app.leads SET status = 'follow_up' WHERE public_id = ${lead}`;
    const [reopened] = await operatorQuery<{ closed: boolean }[]>`
      SELECT closed_at IS NOT NULL AS closed FROM app.leads WHERE public_id = ${lead}
    `;
    expect(reopened?.closed, 'reopened without a date').toBe(false);

    await expect(
      operatorQuery`UPDATE app.leads SET closed_at = now() WHERE public_id = ${lead}`,
      'a close date on an open lead (D13)',
    ).rejects.toThrow(/chk_leads_closed_at/);

    // v9.4.1's create of a lead filed as Lost — no closed_at column in its INSERT
    const copy = generatePublicId('lead');
    await operatorQuery`
      INSERT INTO app.leads
      SELECT (jsonb_populate_record(NULL::app.leads, to_jsonb(lead) || jsonb_build_object(
        'id', nextval(pg_get_serial_sequence('app.leads', 'id')),
        'public_id', ${copy}::text, 'lead_number', 0, 'status', 'lost', 'closed_at', NULL))).*
      FROM app.leads AS lead WHERE lead.public_id = ${lead}
    `;
    await flow.expect(200, 'this release reads it', 'GET', `/app/leads/${copy}`);
    flow.expectValue('closed with a date', '.data.closed_at != null', 'true');
  });

  it('contact: clearing an approximate date of birth turns the flag off', async () => {
    await flow.expect(200, 'a contact registered by age', 'POST', '/app/contacts', {
      first_name: 'Aged',
      last_name: T,
      phones: [{ phone: `+918${digits}72`, is_primary: true }],
      age: 40,
    });
    const contact = flow.last('.data.id');
    flow.expectValue('approximate', '.data.date_of_birth_is_approximate', 'true');

    // v9.4.1's PATCH { date_of_birth: null }
    await operatorQuery`UPDATE app.contacts SET date_of_birth = NULL WHERE public_id = ${contact}`;
    await flow.expect(200, 'this release reads it', 'GET', `/app/contacts/${contact}`);
    flow.expectValue(
      'no date, not approximate',
      '[.data | .date_of_birth, .date_of_birth_is_approximate] | map(tostring) | join(",")',
      'null,false',
    );

    await expect(
      operatorQuery`UPDATE app.contacts SET date_of_birth_is_approximate = true WHERE public_id = ${contact}`,
      'an approximate flag with no date',
    ).rejects.toThrow(/chk_contacts_date_of_birth_approximate/);
  });
});
