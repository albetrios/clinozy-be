import { afterAll, beforeAll, describe, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { runOrganizationScopedWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { runTaskRulesJob } from '@/domains/app/sub-domains/tasks/workers/task-rules.processor.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/**
 * Sub-domain 11, the medical store 11.A–11.H (routes-final §11, launch ROUTE #153): manufacturers
 * and suppliers linked both ways; medicines with batches, supplier prices and the near-expiry
 * discount; orders received into batches; supplier credits applied to what is owed and paying a
 * supplier; MRs, their visits and the visit reminder task; sales through the invoice ledger by
 * earliest expiry, their void and undo, returns with a credit note; the store's payments; the
 * medicine codes by role — one flow over the fixture organization. The task rules run in-process,
 * as one job of the five-minute sweep would.
 */
describe('Medical store — integration (routes-final §11)', () => {
  const S = String(Date.now());
  const T = `m${S}`;
  const digits = `7${S.slice(-7)}`;
  const FIELDS = '[.error.errors[].field] | join(",")';
  const REASON = '.error.reason';
  const IDS = '[.data[].id] | join(",")';
  const DELETE_REASON = 'reason=mistake';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let vesu = '';
  let doctor = '';
  let today = '';
  let tomorrow = '';
  let nextMonth = '';
  let later = '';
  let latest = '';

  let manufacturer = '';
  let quickManufacturer = '';
  let supplier = '';
  let rep = '';
  let otherRep = '';
  let glycolac = '';
  let batchOne = '';
  let quickMedicine = '';
  let purchaseOrder = '';
  let secondPurchaseOrder = '';
  let asha = '';
  let ashaFile = '';
  let bela = '';
  let saleBody: Record<string, unknown> = {};

  /** `YYYY-MM` of the month `months` after today's (the curl helper's `date -d … +N month`). */
  function monthFrom(months: number): string {
    const [year = 0, month = 1] = today.split('-').map(Number);
    const total = year * 12 + (month - 1) + months;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  }

  /** The medicine's quantity now. */
  async function stockOf(medicine: string): Promise<number> {
    await flow.call('GET', `/app/medicines/${medicine}`);
    return Number(flow.last('.data.quantity'));
  }

  /** One batch's packs now (0 when it holds none). */
  async function batchStock(medicine: string, batchNumber: string): Promise<string> {
    await flow.call('GET', `/app/medicines/${medicine}`);
    return flow.last(
      `[.data.batches[] | select(.batch_number == "${batchNumber}") | .quantity] | first // 0`,
    );
  }

  /** One run of the task rules for the fixture organization, now. */
  async function runTaskRules(): Promise<void> {
    const organizationPublicId = fixture.organization.publicId;
    await runOrganizationScopedWorkerJob({
      job: { organizationPublicId },
      processor: (databaseHandle) => runTaskRulesJob({ databaseHandle, organizationPublicId }),
    });
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    vesu = fixture.branches.vesu;
    doctor = fixture.members.doctor.membershipPublicId;
    today = calendarDay(fixture, 0);
    tomorrow = calendarDay(fixture, 1);
    nextMonth = monthFrom(1);
    later = monthFrom(24);
    latest = monthFrom(36);
  });

  afterAll(async () => {
    await app.close();
  });

  it('11.A manufacturers (routes 1–6)', async () => {
    flow.as('owner');
    await flow.expect(200, 'add a manufacturer', 'POST', '/app/manufacturers', {
      name: `alvi ${T}`,
    });
    manufacturer = flow.last('.data.id');
    flow.expectValue(
      'upper case, lav, no medicines (MD9)',
      '[(.data.id | startswith("mfr_")), .data.name, .data.tone, .data.is_quick, .data.medicine_count] | map(tostring) | join(",")',
      `true,ALVI ${T.toUpperCase()},lav,false,0`,
    );
    await flow.expect(409, 'the name in another case', 'POST', '/app/manufacturers', {
      name: `Alvi ${T}`,
    });
    flow.expectValue('taken: why', REASON, 'record_already_exists');
    await flow.expect(200, 'a quick one from a picker', 'POST', '/app/manufacturers', {
      name: `Quickbrand ${T}`,
      is_quick: true,
    });
    quickManufacturer = flow.last('.data.id');
    flow.expectValue(
      'a quick one takes the next tone (after lav)',
      '[.data.is_quick, .data.tone] | map(tostring) | join(",")',
      'true,sky',
    );
    await flow.expect(400, 'no name', 'POST', '/app/manufacturers', {});
    flow.expectValue('no name: field', FIELDS, 'body.name');
    await flow.expect(400, 'a supplier not here', 'POST', '/app/manufacturers', {
      name: `Linked ${T}`,
      supplier_ids: ['sup_000000000000000000000'],
    });
    flow.expectValue('unknown supplier: field', FIELDS, 'supplier_ids');
    await flow.expect(200, 'the picker by name, A–Z', 'GET', `/app/manufacturers?q=${T}`);
    flow.expectValue('both, A–Z', IDS, `${manufacturer},${quickManufacturer}`);
    await flow.expect(200, 'change the tone', 'PATCH', `/app/manufacturers/${quickManufacturer}`, {
      tone: 'mint',
    });
    flow.expectValue('mint', '.data.tone', 'mint');
    await flow.expect(
      404,
      'a manufacturer not here',
      'GET',
      '/app/manufacturers/mfr_000000000000000000000',
    );
  });

  it('11.B suppliers (routes 7–12)', async () => {
    flow.as('owner');
    await flow.expect(200, 'add a supplier', 'POST', '/app/suppliers', {
      name: `Shree Agency ${T}`,
      phone: `+91${digits}11`,
      gst_number: '24ABCDE1234F1Z5',
      manufacturer_ids: [manufacturer],
    });
    supplier = flow.last('.data.id');
    flow.expectValue(
      'the supplier: its brand, nothing owed, no orders (MD10)',
      '[(.data.id | startswith("sup_")), .data.manufacturers[0].id, .data.payable, (.data.ageing_days | tostring), .data.order_count] | map(tostring) | join(",")',
      `true,${manufacturer},0,null,0`,
    );
    await flow.expect(
      200,
      'the manufacturer sees it (links both ways)',
      'GET',
      `/app/manufacturers/${manufacturer}`,
    );
    flow.expectValue(
      "the manufacturer's suppliers",
      '[.data.suppliers[].id] | join(",")',
      supplier,
    );
    await flow.expect(409, 'the name in another case', 'POST', '/app/suppliers', {
      name: `SHREE AGENCY ${T}`,
    });
    flow.expectValue('taken: why', REASON, 'record_already_exists');
    await flow.expect(400, 'a phone without +91', 'POST', '/app/suppliers', {
      name: `Bad phone ${T}`,
      phone: '9876543210',
    });
    flow.expectValue('bad phone: field', FIELDS, 'body.phone');
    await flow.expect(400, 'not a GSTIN', 'POST', '/app/suppliers', {
      name: `Bad GST ${T}`,
      gst_number: '123',
    });
    flow.expectValue('bad GSTIN: field', FIELDS, 'body.gst_number');
    await flow.expect(200, 'a second supplier', 'POST', '/app/suppliers', {
      name: `Other Agency ${T}`,
      is_quick: true,
    });
    const otherSupplier = flow.last('.data.id');
    await flow.expect(
      200,
      'suppliers of the brand',
      'GET',
      `/app/suppliers?manufacturer_id=${manufacturer}&q=${T}`,
    );
    flow.expectValue('only the first', IDS, supplier);
    await flow.expect(200, 'clear the GSTIN', 'PATCH', `/app/suppliers/${otherSupplier}`, {
      gst_number: null,
      phone: null,
    });
    flow.expectValue('no GSTIN', '.data.gst_number', 'null');
    await flow.expect(200, 'get the supplier', 'GET', `/app/suppliers/${supplier}`);
    await flow.expect(
      204,
      'delete the second (nothing owed)',
      'DELETE',
      `/app/suppliers/${otherSupplier}?${DELETE_REASON}`,
    );
    await flow.expect(200, 'restore it', 'POST', `/app/suppliers/${otherSupplier}/restore`);
    await flow.expect(409, 'restore a live one', 'POST', `/app/suppliers/${otherSupplier}/restore`);
    flow.expectValue('live: why', REASON, 'record_not_deleted');
  });

  it('11.F medical reps (routes 33–38)', async () => {
    flow.as('owner');
    const inTwoWeeks = calendarDay(fixture, 14);
    await flow.expect(200, 'add an MR', 'POST', '/app/medical-reps', {
      name: `Alvio Pharma · Rakesh ${T}`,
      phone: `+91${digits}21`,
      next_visit_on: inTwoWeeks,
      manufacturer_ids: [manufacturer],
    });
    rep = flow.last('.data.id');
    flow.expectValue(
      'the MR: brand, next visit, not overdue, no visit yet (MD17)',
      '[(.data.id | startswith("mrep_")), .data.manufacturers[0].id, .data.next_visit_on, .data.is_visit_overdue, (.data.last_visit_on | tostring)] | map(tostring) | join(",")',
      `true,${manufacturer},${inTwoWeeks},false,null`,
    );
    await flow.expect(400, 'a next visit 121 days on', 'POST', '/app/medical-reps', {
      name: `Far ${T}`,
      next_visit_on: calendarDay(fixture, 121),
    });
    flow.expectValue('too far: field', FIELDS, 'next_visit_on');
    await flow.expect(400, 'a next visit yesterday', 'PATCH', `/app/medical-reps/${rep}`, {
      next_visit_on: calendarDay(fixture, -1),
    });
    await flow.expect(200, "the manufacturer's MRs", 'GET', `/app/manufacturers/${manufacturer}`);
    flow.expectValue('the rep', '[.data.medical_reps[].id] | join(",")', rep);
    await flow.expect(
      200,
      'MRs of the brand, not overdue',
      'GET',
      `/app/medical-reps?manufacturer_id=${manufacturer}&is_visit_overdue=false`,
    );
    flow.expectValue('the rep is there', `[.data[].id] | index("${rep}") != null`, 'true');
    await flow.expect(200, 'a second MR', 'POST', '/app/medical-reps', { name: `Rakesh ${T}` });
    otherRep = flow.last('.data.id');
    await flow.expect(
      200,
      'MRs by next visit (none last)',
      'GET',
      `/app/medical-reps?q=${T}&sort=next_visit_on`,
    );
    flow.expectValue('the one with a visit first', IDS, `${rep},${otherRep}`);
  });

  it('11.G MR visits (routes 39–43) and the visit reminder (MD8)', async () => {
    flow.as('owner');
    const inAWeek = calendarDay(fixture, 7);
    await flow.expect(200, 'log a visit', 'POST', `/app/medical-reps/${rep}/visits`, {
      samples: '2 strips Alvi-D',
      next_visit_on: inAWeek,
      notes: 'Launch next month',
    });
    const visit = flow.last('.data.id');
    flow.expectValue(
      'the visit: today, by the caller (MD18)',
      '[(.data.id | startswith("mrv_")), .data.visit_date, .data.medical_rep_id, (.data.logged_by_membership_id != null)] | map(tostring) | join(",")',
      `true,${today},${rep},true`,
    );
    await flow.expect(200, 'the MR after the visit', 'GET', `/app/medical-reps/${rep}`);
    flow.expectValue(
      'next visit moved, the last visit shows',
      '[.data.next_visit_on, .data.last_visit_on, .data.last_samples] | join(",")',
      `${inAWeek},${today},2 strips Alvi-D`,
    );
    await flow.expect(400, 'a visit tomorrow', 'POST', `/app/medical-reps/${rep}/visits`, {
      visit_date: tomorrow,
    });
    flow.expectValue('future: field', FIELDS, 'visit_date');
    await flow.expect(
      400,
      'the next visit on the visit day',
      'POST',
      `/app/medical-reps/${rep}/visits`,
      { next_visit_on: today },
    );
    flow.expectValue('not after: field', FIELDS, 'next_visit_on');
    await flow.expect(200, "an MR's visits", 'GET', `/app/medical-reps/${rep}/visits`);
    flow.expectValue('one visit', '.data | length', 1);
    await flow.expect(200, 'get the visit', 'GET', `/app/medical-reps/${rep}/visits/${visit}`);
    await flow.expect(
      404,
      'the visit under another MR',
      'GET',
      `/app/medical-reps/${otherRep}/visits/${visit}`,
    );
    await flow.expect(
      204,
      'delete the visit',
      'DELETE',
      `/app/medical-reps/${rep}/visits/${visit}?${DELETE_REASON}`,
    );
    await flow.expect(
      200,
      'restore the visit',
      'POST',
      `/app/medical-reps/${rep}/visits/${visit}/restore`,
    );
    await flow.expect(
      404,
      'visits of an MR not here',
      'GET',
      '/app/medical-reps/mrep_000000000000000000000/visits',
    );

    // The visit reminder (MD8): a visit due today opens the pharmacist's task; logging it closes it.
    const visitTasks = `[.data[] | select(.medical_rep_id == "${otherRep}")]`;
    await flow.expect(200, 'an MR due today', 'PATCH', `/app/medical-reps/${otherRep}`, {
      next_visit_on: today,
    });
    await runTaskRules();
    await flow.expect(
      200,
      'the MR visit tasks',
      'GET',
      '/app/tasks?scope=everyone&tab=open&rule_key=medical_rep_visit&limit=100',
    );
    flow.expectValue(
      'one task, the pharmacist queue',
      `${visitTasks} | [length, .[0].owner_role, .[0].title] | map(tostring) | join(",")`,
      `1,pharmacist,Meet Rakesh ${T}`,
    );
    await flow.expect(200, 'log that visit', 'POST', `/app/medical-reps/${otherRep}/visits`, {
      samples: 'Brochure',
    });
    await flow.expect(200, 'the MR, visit logged', 'GET', `/app/medical-reps/${otherRep}`);
    flow.expectValue(
      'no next visit now (it was due on the visit day)',
      '.data.next_visit_on',
      'null',
    );
    await runTaskRules();
    await flow.expect(
      200,
      'the MR visit tasks after',
      'GET',
      '/app/tasks?scope=everyone&tab=open&rule_key=medical_rep_visit&limit=100',
    );
    flow.expectValue('closed by the app', `${visitTasks} | length`, 0);
  });

  it('11.D medicines (routes 17–24)', async () => {
    flow.as('owner');
    await flow.expect(200, 'add a medicine with batches and prices', 'POST', '/app/medicines', {
      name: `Glycolac ${T}`,
      composition: 'Glycolic acid 6%',
      manufacturer_id: manufacturer,
      mrp: 369,
      min_stock: 2,
      max_stock: 30,
      batches: [
        {
          batch_number: 'B1',
          expiry_month: nextMonth,
          quantity: 5,
          purchase_rate: 246,
          supplier_id: supplier,
        },
        { batch_number: 'B2', expiry_month: later, quantity: 3, purchase_rate: 240 },
      ],
      supplier_prices: [{ supplier_id: supplier, rate: 246, lead_days: 2 }],
    });
    glycolac = flow.last('.data.id');
    flow.expectValue(
      "stock is the batches' sum (MD4)",
      '[(.data.id | startswith("med_")), .data.quantity, .data.stock_level, (.data.batches | length), .data.manufacturer.id] | map(tostring) | join(",")',
      `true,8,ok,2,${manufacturer}`,
    );
    flow.expectValue(
      'nearest expiry, best rate, margin, before GST (MD12)',
      '[.data.nearest_expiry.batch_number, .data.nearest_expiry.expiry_month, .data.best_rate.rate, .data.best_rate.supplier_id, .data.margin_percent, .data.price_before_gst, .data.gst_percent] | map(tostring) | join(",")',
      `B1,${nextMonth},246,${supplier},33.33,329.46,12`,
    );
    batchOne = flow.last('[.data.batches[] | select(.batch_number == "B1") | .id] | first');
    await flow.expect(409, 'the name in another case', 'POST', '/app/medicines', {
      name: `GLYCOLAC ${T}`,
      manufacturer_id: manufacturer,
      mrp: 10,
    });
    flow.expectValue('taken: why', REASON, 'record_already_exists');
    await flow.expect(400, 'no MRP, not quick', 'POST', '/app/medicines', {
      name: `No MRP ${T}`,
      manufacturer_id: manufacturer,
    });
    flow.expectValue('no MRP: field', FIELDS, 'mrp');
    await flow.expect(400, 'no manufacturer, not quick', 'POST', '/app/medicines', {
      name: `No brand ${T}`,
      mrp: 10,
    });
    flow.expectValue('no brand: field', FIELDS, 'manufacturer_id');
    await flow.expect(400, 'fill-up below reorder', 'POST', '/app/medicines', {
      name: `Levels ${T}`,
      manufacturer_id: manufacturer,
      mrp: 10,
      min_stock: 5,
      max_stock: 3,
    });
    flow.expectValue('levels: field', FIELDS, 'max_stock');
    await flow.expect(400, 'a batch number twice', 'POST', '/app/medicines', {
      name: `Twice ${T}`,
      manufacturer_id: manufacturer,
      mrp: 10,
      batches: [
        { batch_number: 'X1', expiry_month: nextMonth, quantity: 1 },
        { batch_number: 'x1', expiry_month: nextMonth, quantity: 1 },
      ],
    });
    await flow.expect(200, 'a quick medicine', 'POST', '/app/medicines', {
      name: `Quickmed ${T}`,
      is_quick: true,
    });
    quickMedicine = flow.last('.data.id');
    flow.expectValue(
      'quick: MRP 0, needs details, out',
      '[.data.is_quick, .data.mrp, .data.needs_details, .data.stock_level] | map(tostring) | join(",")',
      'true,0,true,out',
    );
    await flow.expect(200, 'complete the quick one', 'PATCH', `/app/medicines/${quickMedicine}`, {
      mrp: 99,
      composition: 'Zinc',
      manufacturer_id: quickManufacturer,
    });
    flow.expectValue(
      'it loses its flag (MD12)',
      '[.data.is_quick, .data.needs_details] | map(tostring) | join(",")',
      'false,false',
    );
    await flow.expect(200, 'batches as the whole list', 'PATCH', `/app/medicines/${glycolac}`, {
      batches: [
        {
          id: batchOne,
          batch_number: 'B1',
          expiry_month: nextMonth,
          quantity: 6,
          purchase_rate: 246,
          supplier_id: supplier,
        },
        { batch_number: 'B3', expiry_month: later, quantity: 2 },
      ],
    });
    flow.expectValue(
      'kept 6, added 2, B2 left out to 0 (MD13)',
      '[.data.quantity, ([.data.batches[].batch_number] | join("+"))] | map(tostring) | join(",")',
      '8,B1+B3',
    );
    await flow.expect(
      409,
      'a new batch with a left-out number',
      'PATCH',
      `/app/medicines/${glycolac}`,
      {
        batches: [
          { id: batchOne, batch_number: 'B1', expiry_month: nextMonth, quantity: 6 },
          { batch_number: 'b2', expiry_month: later, quantity: 1 },
        ],
      },
    );
    flow.expectValue('batch taken: why', REASON, 'record_already_exists');
    await flow.expect(
      400,
      "another medicine's batch id",
      'PATCH',
      `/app/medicines/${quickMedicine}`,
      { batches: [{ id: batchOne, batch_number: 'B1', expiry_month: nextMonth, quantity: 1 }] },
    );
    flow.expectValue('foreign batch: field', FIELDS, 'batches');
    await flow.expect(
      200,
      'medicines in stock, expiring within 90 days',
      'GET',
      `/app/medicines?q=${T}&stock_level=ok&expiring_within_days=90`,
    );
    flow.expectValue('the batch of next month', IDS, glycolac);
    await flow.expect(
      200,
      'medicines out of stock',
      'GET',
      `/app/medicines?q=${T}&stock_level=out`,
    );
    flow.expectValue(
      'the quick one, no batches',
      `[.data[].id] | index("${quickMedicine}") != null`,
      'true',
    );
    await flow.expect(
      200,
      "medicines of the brand, a supplier's",
      'GET',
      `/app/medicines?manufacturer_id=${manufacturer}&supplier_id=${supplier}`,
    );
    flow.expectValue("the one with the supplier's price", IDS, glycolac);
    await flow.call('GET', `/app/medicines/${glycolac}`);
    const medicineNumber = flow.last('.data.medicine_number');
    await flow.expect(200, 'by number', 'GET', `/app/medicines?q=%23${medicineNumber}`);
    flow.expectValue('found by #number', '.data[0].id', glycolac);
    await flow.expect(
      200,
      'the near-expiry discount',
      'POST',
      '/app/medicines/near-expiry-discount',
      {
        expiring_within_days: 90,
        discount_percent: 20,
      },
    );
    flow.expectValue('at least this medicine changed', '.data.updated_count >= 1', 'true');
    await flow.expect(200, 'the medicine after', 'GET', `/app/medicines/${glycolac}`);
    flow.expectValue('20% off near expiry (MD14)', '.data.near_expiry_discount_percent', 20);
    await flow.expect(400, 'a window of 45 days', 'POST', '/app/medicines/near-expiry-discount', {
      expiring_within_days: 45,
      discount_percent: 20,
    });
    await flow.expect(200, 'the medicines CSV', 'GET', `/app/medicines/exports?q=${T}`);
    flow.expectValue(
      'the file',
      '[(.data.file_name | startswith("medicines-")), .data.row_count] | map(tostring) | join(",")',
      'true,2',
    );
    await flow.expect(
      409,
      'delete a medicine with stock',
      'DELETE',
      `/app/medicines/${glycolac}?${DELETE_REASON}`,
    );
    flow.expectValue('stock: why', REASON, 'medicine_has_stock');
    await flow.expect(
      409,
      'delete a manufacturer with medicines',
      'DELETE',
      `/app/manufacturers/${manufacturer}?${DELETE_REASON}`,
    );
    flow.expectValue('medicines: why', REASON, 'manufacturer_has_medicines');
    await flow.expect(
      204,
      'delete the out-of-stock one',
      'DELETE',
      `/app/medicines/${quickMedicine}?${DELETE_REASON}`,
    );
    await flow.expect(200, 'restore it', 'POST', `/app/medicines/${quickMedicine}/restore`);
  });

  it('11.E medical purchase orders (routes 25–32)', async () => {
    flow.as('owner');
    await flow.expect(200, 'order from the supplier', 'POST', '/app/medical-purchase-orders', {
      supplier_id: supplier,
      supplier_bill_number: 'SMA-1',
      items: [
        { medicine_id: glycolac, quantity: 10, free_quantity: 1, rate: 246 },
        { new_medicine_name: `Newderm ${T}`, quantity: 5, rate: 100 },
      ],
    });
    purchaseOrder = flow.last('.data.id');
    flow.expectValue(
      'ordered: total, nothing due yet (MD15)',
      '[(.data.id | startswith("mpo_")), .data.stage, .data.total, .data.due_amount, .data.payment_status, .data.item_count, .data.free_count, .data.supplier.id] | map(tostring) | join(",")',
      `true,ordered,2960,0,unpaid,2,1,${supplier}`,
    );
    const lineOne = flow.last('.data.items[0].id');
    const lineTwo = flow.last('.data.items[1].id');
    await flow.expect(200, 'the line added as typed', 'GET', `/app/medicines?q=Newderm%20${T}`);
    flow.expectValue(
      "a quick medicine, the supplier's brand",
      '[.data[0].is_quick, .data[0].mrp, .data[0].manufacturer.id, .data[0].best_rate.rate] | map(tostring) | join(",")',
      `true,0,${manufacturer},100`,
    );
    await flow.expect(400, 'an order dated tomorrow', 'POST', '/app/medical-purchase-orders', {
      supplier_id: supplier,
      order_date: tomorrow,
      items: [{ medicine_id: glycolac, quantity: 1, rate: 1 }],
    });
    flow.expectValue('future: field', FIELDS, 'order_date');
    await flow.expect(400, 'an order without lines', 'POST', '/app/medical-purchase-orders', {
      supplier_id: supplier,
      items: [],
    });
    await flow.expect(400, 'a line with both', 'POST', '/app/medical-purchase-orders', {
      supplier_id: supplier,
      items: [{ medicine_id: glycolac, new_medicine_name: 'x', quantity: 1, rate: 1 }],
    });
    await flow.expect(200, 'a second order', 'POST', '/app/medical-purchase-orders', {
      supplier_id: supplier,
      items: [{ medicine_id: glycolac, quantity: 2, rate: 250 }],
    });
    secondPurchaseOrder = flow.last('.data.id');
    await flow.expect(
      200,
      'change its lines',
      'PATCH',
      `/app/medical-purchase-orders/${secondPurchaseOrder}`,
      { items: [{ medicine_id: glycolac, quantity: 4, rate: 250 }] },
    );
    flow.expectValue('the new total', '.data.total', 1000);
    await flow.expect(
      204,
      'cancel it',
      'DELETE',
      `/app/medical-purchase-orders/${secondPurchaseOrder}?reason=supplier_cant_deliver`,
    );
    await flow.expect(
      400,
      'cancel with a stock reason',
      'DELETE',
      `/app/medical-purchase-orders/${purchaseOrder}?reason=duplicate`,
    );
    await flow.expect(
      200,
      'undo the cancel',
      'POST',
      `/app/medical-purchase-orders/${secondPurchaseOrder}/restore`,
    );
    flow.expectValue('ordered again', '.data.stage', 'ordered');
    const before = await stockOf(glycolac);
    await flow.expect(
      200,
      'receive the goods',
      'POST',
      `/app/medical-purchase-orders/${purchaseOrder}/receive`,
      {
        supplier_bill_number: 'SMA-2291',
        items: [
          { id: lineOne, batch_number: 'GC-PO', expiry_month: latest },
          { id: lineTwo, is_received: false },
        ],
      },
    );
    flow.expectValue(
      "received: the received lines' total, due, the bill number (MD16)",
      '[.data.stage, .data.total, .data.due_amount, .data.payment_status, .data.supplier_bill_number, .data.items[0].is_received, .data.items[1].is_received] | map(tostring) | join(",")',
      'received,2460,2460,unpaid,SMA-2291,true,false',
    );
    flow.expectEqual(
      '11 packs into the batch (10 + 1 free)',
      String((await stockOf(glycolac)) - before),
      '11',
    );
    flow.expectEqual('the new batch', await batchStock(glycolac, 'GC-PO'), '11');
    await flow.expect(
      409,
      'receive again',
      'POST',
      `/app/medical-purchase-orders/${purchaseOrder}/receive`,
      {},
    );
    flow.expectValue('received: why', REASON, 'transition_not_allowed');
    await flow.expect(
      409,
      'change a received order',
      'PATCH',
      `/app/medical-purchase-orders/${purchaseOrder}`,
      { supplier_bill_number: 'x' },
    );
    await flow.expect(
      409,
      'cancel a received order',
      'DELETE',
      `/app/medical-purchase-orders/${purchaseOrder}?reason=mistake`,
    );
    await flow.expect(
      200,
      'the Purchases tab, received',
      'GET',
      `/app/medical-purchase-orders?supplier_id=${supplier}&stage=received`,
    );
    flow.expectValue('the received order', IDS, purchaseOrder);
    await flow.call('GET', `/app/medical-purchase-orders/${purchaseOrder}`);
    const orderNumber = flow.last('.data.purchase_order_number');
    await flow.expect(200, 'by number', 'GET', `/app/medical-purchase-orders?q=%23${orderNumber}`);
    flow.expectValue('found', '.data[0].id', purchaseOrder);
    await flow.expect(
      200,
      'the orders CSV',
      'GET',
      `/app/medical-purchase-orders/exports?supplier_id=${supplier}`,
    );
    flow.expectValue('two orders', '.data.row_count', 2);
    await flow.expect(200, 'the supplier owes now', 'GET', `/app/suppliers/${supplier}`);
    flow.expectValue(
      'payable, ageing, orders (MD10)',
      '[.data.payable, .data.ageing_days, .data.order_count] | map(tostring) | join(",")',
      '2460,0,2',
    );
    await flow.expect(
      409,
      'delete a supplier owed',
      'DELETE',
      `/app/suppliers/${supplier}?${DELETE_REASON}`,
    );
    flow.expectValue('owed: why', REASON, 'supplier_has_dues');
  });

  it('11.C supplier credits under their supplier (routes 14–16, 57 — MD34)', async () => {
    flow.as('owner');
    const credits = `/app/suppliers/${supplier}/credits`;
    await flow.expect(200, 'return expiring stock', 'POST', credits, {
      medicine_batch_id: batchOne,
      quantity: 1,
    });
    const credit = flow.last('.data.id');
    flow.expectValue(
      'at the batch rate, applied at once (MD11)',
      '[(.data.id | startswith("scr_")), .data.rate, .data.amount, .data.applied_amount, .data.status, .data.batch_number, .data.supplier_id] | map(tostring) | join(",")',
      `true,246,246,246,adjusted,B1,${supplier}`,
    );
    flow.expectEqual('out of the batch', await batchStock(glycolac, 'B1'), '5');
    await flow.expect(
      200,
      'the order credited',
      'GET',
      `/app/medical-purchase-orders/${purchaseOrder}`,
    );
    flow.expectValue(
      'credited, still due',
      '[.data.credited_amount, .data.due_amount, .data.payment_status] | map(tostring) | join(",")',
      '246,2214,partial',
    );
    await flow.expect(409, 'more than the batch holds', 'POST', credits, {
      medicine_batch_id: batchOne,
      quantity: 99,
    });
    flow.expectValue('stock: why', REASON, 'not_enough_stock');
    await flow.expect(400, 'the supplier is the path', 'POST', credits, {
      medicine_batch_id: batchOne,
      supplier_id: supplier,
      quantity: 1,
    });
    await flow.expect(
      404,
      'a supplier not here',
      'POST',
      '/app/suppliers/sup_000000000000000000000/credits',
      { medicine_batch_id: batchOne, quantity: 1 },
    );
    await flow.expect(200, "a supplier's credits (route 57)", 'GET', `${credits}?status=adjusted`);
    flow.expectValue('the credit', IDS, credit);
    await flow.expect(400, 'the path is the supplier', 'GET', `${credits}?supplier_id=${supplier}`);
    await flow.expect(
      200,
      'created since yesterday',
      'GET',
      `/app/supplier-credits?supplier_id=${supplier}&created_from=${calendarDay(fixture, -1)}T00:00:00Z`,
    );
    flow.expectValue('still the credit', IDS, credit);
    await flow.expect(
      200,
      'created before today',
      'GET',
      `/app/supplier-credits?supplier_id=${supplier}&created_to=2000-01-01T00:00:00Z`,
    );
    flow.expectValue('none', '.data | length', 0);
    await flow.expect(
      200,
      'every credit, by supplier (route 14)',
      'GET',
      `/app/supplier-credits?supplier_id=${supplier}&status=adjusted`,
    );
    flow.expectValue('the same credit', IDS, credit);
    await flow.expect(200, 'get the credit', 'GET', `${credits}/${credit}`);
    await flow.expect(200, 'another supplier', 'POST', '/app/suppliers', {
      name: `Creditless agency ${T}`,
    });
    const other = flow.last('.data.id');
    await flow.expect(
      404,
      "another supplier's path",
      'GET',
      `/app/suppliers/${other}/credits/${credit}`,
    );
    await flow.expect(200, 'none of its own', 'GET', `/app/suppliers/${other}/credits`);
    flow.expectValue('empty', '.data | length', 0);
  });

  it('11.C a supplier credit voided and undone (routes 54, 55 — MD32)', async () => {
    flow.as('owner');
    const credits = `/app/suppliers/${supplier}/credits`;
    const orderDues = async (label: string, want: string) => {
      await flow.expect(200, label, 'GET', `/app/medical-purchase-orders/${purchaseOrder}`);
      flow.expectValue(
        label,
        '[.data.credited_amount, .data.due_amount] | map(tostring) | join(",")',
        want,
      );
    };
    const payable = async (label: string, want: number) => {
      await flow.expect(200, label, 'GET', `/app/suppliers/${supplier}`);
      flow.expectValue(label, '.data.payable', want);
    };
    await flow.expect(200, 'the first credit', 'GET', `${credits}?status=adjusted`);
    const first = flow.last('.data[0].id');
    await flow.expect(200, 'two more packs back', 'POST', credits, {
      medicine_batch_id: batchOne,
      quantity: 2,
    });
    const second = flow.last('.data.id');
    flow.expectEqual('three packs left', await batchStock(glycolac, 'B1'), '3');
    await orderDues('both credits on the order', '738,1722');
    await payable('the store owes 1,722', 1722);
    flow.as('pharmacist');
    await flow.expect(
      403,
      "the pharmacist can't void (medicine:delete)",
      'DELETE',
      `${credits}/${first}?reason=mistake`,
    );
    flow.as('owner');
    await flow.expect(400, 'other needs a note', 'DELETE', `${credits}/${first}?reason=other`);
    await flow.expect(
      400,
      "the store's own reasons",
      'DELETE',
      `${credits}/${first}?reason=duplicate`,
    );
    await flow.expect(204, 'void the first', 'DELETE', `${credits}/${first}?reason=wrong_quantity`);
    flow.expectEqual('its pack back', await batchStock(glycolac, 'B1'), '4');
    await orderDues('only the second on the order — applied again', '492,1968');
    await payable('owed 246 more', 1968);
    await flow.expect(404, 'a voided credit is not read', 'GET', `${credits}/${first}`);
    await flow.expect(200, 'nor listed', 'GET', credits);
    flow.expectValue('the second only', IDS, second);
    await flow.expect(200, 'undo the void', 'POST', `${credits}/${first}/restore`);
    flow.expectValue(
      'applied again, in its place',
      '[.data.id, .data.applied_amount, .data.status] | map(tostring) | join(",")',
      `${first},246,adjusted`,
    );
    flow.expectEqual('the pack out again', await batchStock(glycolac, 'B1'), '3');
    await orderDues('both on the order again', '738,1722');
    await flow.expect(409, 'undo a live credit', 'POST', `${credits}/${first}/restore`);
    flow.expectValue('live: why', REASON, 'record_not_deleted');
    await flow.expect(
      204,
      'void the second for good',
      'DELETE',
      `${credits}/${second}?${DELETE_REASON}`,
    );
    flow.expectEqual('its packs back', await batchStock(glycolac, 'B1'), '5');
    await orderDues('as before', '246,2214');
    await payable('as before', 2214);
  });

  it('11.B pay a supplier (route 13) and supplier bills on an order (MD7)', async () => {
    flow.as('owner');
    const payments = `/app/suppliers/${supplier}/payments`;
    await flow.expect(409, 'pay more than owed', 'POST', payments, {
      branch_id: vesu,
      splits: [{ mode: 'cash', amount: 99999 }],
    });
    flow.expectValue('too much: why', REASON, 'more_than_due');
    await flow.expect(400, 'pay with credit', 'POST', payments, {
      branch_id: vesu,
      splits: [{ mode: 'credit', amount: 10 }],
    });
    await flow.expect(200, 'pay ₹1,000', 'POST', payments, {
      branch_id: vesu,
      splits: [
        { mode: 'cash', amount: 600 },
        { mode: 'upi', amount: 400 },
      ],
      reference: 'UTR-1',
    });
    flow.expectValue('what is left (MD10)', '.data.payable', 1214);
    await flow.expect(
      200,
      "the order's payments",
      'GET',
      `/app/payments?medical_purchase_order_id=${purchaseOrder}`,
    );
    flow.expectValue(
      'one supplier bill',
      '[(.data | length), .data[0].kind, .data[0].amount, .data[0].medical_purchase_order_id] | map(tostring) | join(",")',
      `1,supplier_bill,1000,${purchaseOrder}`,
    );
    await flow.expect(400, 'a receipt naming the order', 'POST', '/app/payments', {
      kind: 'expense',
      branch_id: vesu,
      expense_category: 'medicines',
      payee_name: 'x',
      medical_purchase_order_id: purchaseOrder,
      splits: [{ mode: 'cash', amount: 1 }],
    });
    flow.expectValue('only a supplier bill: field', FIELDS, 'medical_purchase_order_id');
    await flow.expect(200, 'a supplier bill on the order (MD7)', 'POST', '/app/payments', {
      kind: 'supplier_bill',
      branch_id: vesu,
      payee_name: 'Shree Agency',
      medical_purchase_order_id: purchaseOrder,
      splits: [{ mode: 'upi', amount: 214 }],
    });
    await flow.expect(
      200,
      'the order after',
      'GET',
      `/app/medical-purchase-orders/${purchaseOrder}`,
    );
    flow.expectValue(
      'paid 1,214, due 1,000',
      '[.data.paid_amount, .data.due_amount] | map(tostring) | join(",")',
      '1214,1000',
    );
    await flow.expect(409, 'a supplier bill over the due', 'POST', '/app/payments', {
      kind: 'supplier_bill',
      branch_id: vesu,
      payee_name: 'x',
      medical_purchase_order_id: purchaseOrder,
      splits: [{ mode: 'cash', amount: 1001 }],
    });
    flow.expectValue('over: why', REASON, 'more_than_due');
    await flow.expect(409, 'a supplier bill on an order not received', 'POST', '/app/payments', {
      kind: 'supplier_bill',
      branch_id: vesu,
      payee_name: 'x',
      medical_purchase_order_id: secondPurchaseOrder,
      splits: [{ mode: 'cash', amount: 1 }],
    });
  });

  it('11.H medical sales (routes 44–51)', async () => {
    flow.as('owner');
    await flow.expect(200, 'contact Asha', 'POST', '/app/contacts', {
      first_name: 'Asha',
      last_name: T,
      phones: [{ phone: `+91${digits}31`, is_primary: true }],
    });
    asha = flow.last('.data.id');
    await flow.expect(200, "Asha's file", 'POST', '/app/patients', {
      contact_id: asha,
      home_branch_id: vesu,
    });
    ashaFile = flow.last('.data.id');
    await flow.expect(200, 'contact Bela, no file', 'POST', '/app/contacts', {
      first_name: 'Bela',
      last_name: T,
      phones: [{ phone: `+91${digits}32`, is_primary: true }],
    });
    bela = flow.last('.data.id');
    await flow.expect(
      200,
      'remove the near-expiry discount',
      'POST',
      '/app/medicines/near-expiry-discount',
      { expiring_within_days: 90, discount_percent: null },
    );
    saleBody = {
      branch_id: vesu,
      contact_id: asha,
      member_ids: [doctor],
      items: [{ medicine_id: glycolac, quantity: 2 }],
    };
    await flow.expect(200, 'sell two', 'POST', '/app/medical-sales', saleBody);
    const sale = flow.last('.data.id');
    const invoice = flow.last('.data.invoice.id');
    const line = flow.last('.data.items[0].invoice_item_id');
    flow.expectValue(
      'unpaid, its medical invoice, from the earliest batch (MD5, MD19)',
      '[(.data.id | startswith("msal_")), .data.status, .data.invoice.total, .data.invoice.due_amount, .data.items[0].batch_number, .data.items[0].quantity, .data.contact.id, .data.patient_id, .data.member_ids[0]] | map(tostring) | join(",")',
      `true,unpaid,738,738,B1,2,${asha},${ashaFile},${doctor}`,
    );
    flow.expectValue(
      "the margin over the batch's rate",
      '[.data.margin_amount, .data.margin_percent] | map(tostring) | join(",")',
      '246,33.33',
    );
    flow.expectEqual('two out of B1', await batchStock(glycolac, 'B1'), '3');
    await flow.expect(200, 'sell one, paid now', 'POST', '/app/medical-sales', {
      branch_id: vesu,
      contact_id: bela,
      items: [{ medicine_id: glycolac, quantity: 1 }],
      payment: { splits: [{ mode: 'cash', amount: 369 }] },
    });
    const paidSale = flow.last('.data.id');
    flow.expectValue(
      'paid now (B13)',
      '[.data.status, .data.invoice.paid_amount] | map(tostring) | join(",")',
      'paid,369',
    );
    await flow.expect(200, 'sell across two batches', 'POST', '/app/medical-sales', {
      branch_id: vesu,
      contact_id: bela,
      items: [{ medicine_id: glycolac, quantity: 3 }],
    });
    const splitSale = flow.last('.data.id');
    flow.expectValue(
      "B1's last two, then B3 (MD5)",
      '[.data.items[] | "\\(.batch_number)x\\(.quantity)"] | join(",")',
      'B1x2,B3x1',
    );
    await flow.expect(409, 'more than the unexpired batches hold', 'POST', '/app/medical-sales', {
      branch_id: vesu,
      contact_id: bela,
      items: [{ medicine_id: glycolac, quantity: 999 }],
    });
    flow.expectValue('stock: why', REASON, 'not_enough_stock');
    await flow.expect(400, 'a medicine twice', 'POST', '/app/medical-sales', {
      branch_id: vesu,
      contact_id: bela,
      items: [
        { medicine_id: glycolac, quantity: 1 },
        { medicine_id: glycolac, quantity: 1 },
      ],
    });
    await flow.expect(400, 'a contact not here', 'POST', '/app/medical-sales', {
      branch_id: vesu,
      contact_id: 'con_000000000000000000000',
      items: [{ medicine_id: glycolac, quantity: 1 }],
    });
    flow.expectValue('unknown contact: field', FIELDS, 'contact_id');
    await flow.expect(
      200,
      'the Sales tab, unpaid',
      'GET',
      `/app/medical-sales?status=unpaid&contact_id=${asha}`,
    );
    flow.expectValue("Asha's sale", IDS, sale);
    await flow.expect(
      200,
      "search a medicine's name",
      'GET',
      `/app/medical-sales?q=Glycolac%20${T}&sort=sale_number`,
    );
    flow.expectValue('the three sales', '.data | length', 3);
    await flow.expect(
      409,
      'void a paid sale',
      'DELETE',
      `/app/medical-sales/${paidSale}?reason=wrong_items`,
    );
    flow.expectValue('paid: why', REASON, 'sale_has_payments');
    await flow.expect(
      400,
      'void with a stock reason',
      'DELETE',
      `/app/medical-sales/${splitSale}?reason=mistake`,
    );
    await flow.expect(
      204,
      'void the split sale',
      'DELETE',
      `/app/medical-sales/${splitSale}?reason=customer_changed_mind`,
    );
    flow.expectEqual('its stock back into B1', await batchStock(glycolac, 'B1'), '2');
    await flow.expect(
      200,
      'the voided sales',
      'GET',
      `/app/medical-sales?status=voided&contact_id=${bela}`,
    );
    flow.expectValue(
      'the split sale, voided',
      '[.data[].id, .data[0].status] | join(",")',
      `${splitSale},voided`,
    );
    await flow.expect(200, 'undo the void', 'POST', `/app/medical-sales/${splitSale}/restore`);
    flow.expectValue('unpaid again, stock taken again', '.data.status', 'unpaid');
    flow.expectEqual('B1 empty again', await batchStock(glycolac, 'B1'), '0');
    await flow.expect(
      409,
      "change the sale's invoice through /invoices",
      'PATCH',
      `/app/invoices/${invoice}`,
      { remark: 'x' },
    );
    flow.expectValue("the sale's: why", REASON, 'invoice_of_sale');
    await flow.expect(
      409,
      "delete the sale's invoice through /invoices",
      'DELETE',
      `/app/invoices/${invoice}?${DELETE_REASON}`,
    );
    const returns = `/app/medical-sales/${sale}/returns`;
    await flow.expect(409, 'return an unpaid sale', 'POST', returns, {
      items: [{ invoice_item_id: line, quantity: 1 }],
      reason: 'unused',
      refund_mode: 'cash',
    });
    flow.expectValue('unpaid: why', REASON, 'sale_not_paid');
    await flow.expect(200, 'collect the sale', 'POST', '/app/payments', {
      kind: 'receipt',
      branch_id: vesu,
      contact_id: asha,
      invoice_id: invoice,
      splits: [{ mode: 'upi', amount: 738 }],
    });
    await flow.expect(400, 'return more than was sold', 'POST', returns, {
      items: [{ invoice_item_id: line, quantity: 3 }],
      reason: 'unused',
      refund_mode: 'cash',
    });
    flow.expectValue('too many: field', FIELDS, 'items');
    await flow.expect(200, 'return one, unused', 'POST', returns, {
      items: [{ invoice_item_id: line, quantity: 1 }],
      reason: 'unused',
      refund_mode: 'cash',
      note: 'Sealed',
    });
    flow.expectValue(
      "returned: the refund, the line's count (MD21)",
      '[.data.status, .data.returned_amount, .data.items[0].returned_quantity, (.data.returns[0].id | startswith("msrt_")), .data.returns[0].items[0].is_restocked, (.data.returns[0].invoice_credit_note_id != null)] | map(tostring) | join(",")',
      'returned,369,1,true,true,true',
    );
    flow.expectEqual('back into B1', await batchStock(glycolac, 'B1'), '1');
    await flow.expect(200, 'return the other, damaged', 'POST', returns, {
      items: [{ invoice_item_id: line, quantity: 1 }],
      reason: 'damaged',
      refund_mode: 'upi',
    });
    flow.expectValue(
      'two returns, written off',
      '[(.data.returns | length), .data.returns[1].items[0].is_restocked, .data.returned_amount] | map(tostring) | join(",")',
      '2,false,738',
    );
    flow.expectEqual('not back into B1', await batchStock(glycolac, 'B1'), '1');
    await flow.expect(
      409,
      'void a returned sale',
      'DELETE',
      `/app/medical-sales/${sale}?reason=wrong_items`,
    );
    await flow.expect(200, 'the sales CSV', 'GET', `/app/medical-sales/exports?contact_id=${bela}`);
    flow.expectValue("Bela's two", '.data.row_count', 2);
    await flow.expect(200, "the store's payments (MD22)", 'GET', '/app/medical-payments?q=Shree');
    flow.expectValue(
      'the supplier bills',
      `[.data[] | select(.medical_purchase_order_id == "${purchaseOrder}")] | length`,
      2,
    );
    await flow.expect(
      200,
      "the store's receipts and refunds",
      'GET',
      `/app/medical-payments?contact_id=${asha}`,
    );
    flow.expectValue(
      'the receipt and two refunds',
      '[.data[].kind] | sort | join(",")',
      'receipt,refund,refund',
    );
    await flow.expect(200, 'a rent expense — not the store', 'POST', '/app/payments', {
      kind: 'expense',
      branch_id: vesu,
      expense_category: 'rent',
      payee_name: `Shree Landlord ${T}`,
      splits: [{ mode: 'cash', amount: 50 }],
    });
    const rent = flow.last('.data.id');
    await flow.expect(200, 'the ledger has it', 'GET', `/app/payments?q=Shree%20Landlord`);
    flow.expectValue('in the ledger', `[.data[] | select(.id == "${rent}")] | length`, 1);
    await flow.expect(200, "the store's payments again", 'GET', '/app/medical-payments?q=Shree');
    flow.expectValue('not the store', `[.data[] | select(.id == "${rent}")] | length`, 0);
    const storeRows = flow.last('.data | length');
    await flow.expect(
      200,
      "the store's payments CSV (MD31)",
      'GET',
      '/app/medical-payments/exports?q=Shree',
    );
    flow.expectValue(
      "the same rows, the store's file name",
      '[.data.row_count, (.data.file_name | startswith("medical-payments-")), (.data.content | contains("Landlord"))] | map(tostring) | join(",")',
      `${storeRows},true,false`,
    );
  });

  it("the store's payments managed through the ledger (MD31)", async () => {
    flow.as('owner');
    const at = (day: string) => `${day}T10:00:00+05:30`;
    const yesterday = calendarDay(fixture, -1);
    const storeHas = async (label: string, id: string, want: number) => {
      await flow.expect(200, label, 'GET', `/app/medical-payments?q=Ledger%20${T}`);
      flow.expectValue(label, `[.data[] | select(.id == "${id}")] | length`, want);
    };
    await flow.expect(200, 'a medicines expense through the ledger', 'POST', '/app/payments', {
      kind: 'expense',
      branch_id: vesu,
      expense_category: 'medicines',
      payee_name: `Ledger ${T}`,
      splits: [{ mode: 'cash', amount: 30 }],
    });
    const expense = flow.last('.data.id');
    await storeHas("in the store's payments", expense, 1);
    await flow.expect(200, 'changed on an open day', 'PATCH', `/app/payments/${expense}`, {
      note: 'Strips',
    });
    await flow.expect(200, 'the change shows', 'GET', `/app/medical-payments?q=Ledger%20${T}`);
    flow.expectValue(
      'its note and edit count',
      `.data[] | select(.id == "${expense}") | [.note, .edit_count] | map(tostring) | join(",")`,
      'Strips,1',
    );
    await flow.expect(204, 'deleted', 'DELETE', `/app/payments/${expense}?reason=mistake`);
    await storeHas('gone from the store', expense, 0);
    await flow.expect(200, 'restored', 'POST', `/app/payments/${expense}/restore`);
    await storeHas('back in the store', expense, 1);
    await flow.expect(200, "yesterday's medicines expense", 'POST', '/app/payments', {
      kind: 'expense',
      branch_id: vesu,
      expense_category: 'medicines',
      payee_name: `Ledger ${T}`,
      paid_at: at(yesterday),
      splits: [{ mode: 'upi', amount: 20 }],
    });
    const settled = flow.last('.data.id');
    await flow.expect(200, 'open yesterday', 'POST', '/app/day-closes', {
      branch_id: vesu,
      close_date: yesterday,
    });
    const dayClose = flow.last('.data.id');
    await flow.expect(200, 'and close it', 'POST', `/app/day-closes/${dayClose}/close`, {
      counted_cash: 0,
    });
    await flow.expect(200, 'reverse the settled one', 'POST', `/app/payments/${settled}/reverse`, {
      reason: 'Wrong supplier',
    });
    const reversal = flow.last('.data.id');
    await flow.expect(
      200,
      "the store's reversals",
      'GET',
      '/app/medical-payments?kind=reversal&limit=100',
    );
    flow.expectValue(
      "the reversal is the store's, pointing at the settled one",
      `[.data[] | select(.id == "${reversal}") | .reverses_payment_id] | join(",")`,
      settled,
    );
  });

  it('a prescription filled once (MD19, MDC4)', async () => {
    flow.as('owner');
    await flow.expect(
      200,
      'a draft prescription',
      'POST',
      `/app/patients/${ashaFile}/prescriptions`,
      {
        doctor_membership_id: doctor,
        prescription_date: today,
        items: [
          {
            medicine_name: 'Glycolac',
            medicine_id: glycolac,
            dose_night: 1,
            meal: 'after',
            quantity: 1,
          },
        ],
      },
    );
    const prescription = flow.last('.data.id');
    flow.as('doctor');
    await flow.expect(
      200,
      'the doctor approves',
      'POST',
      `/app/patients/${ashaFile}/prescriptions/${prescription}/approve`,
    );
    flow.as('owner');
    await flow.expect(
      200,
      'prescriptions to fill',
      'GET',
      `/app/patient-prescriptions?status=approved&is_filled=false&patient_id=${ashaFile}`,
    );
    flow.expectValue(
      'the prescription is to fill',
      `[.data[].id] | index("${prescription}") != null`,
      'true',
    );
    await flow.expect(400, "fill another contact's prescription", 'POST', '/app/medical-sales', {
      branch_id: vesu,
      contact_id: bela,
      patient_prescription_id: prescription,
      items: [{ medicine_id: glycolac, quantity: 1 }],
    });
    flow.expectValue("not the buyer's: field", FIELDS, 'patient_prescription_id');
    const fill = {
      branch_id: vesu,
      contact_id: asha,
      patient_prescription_id: prescription,
      items: [{ medicine_id: glycolac, quantity: 1 }],
    };
    await flow.expect(200, 'fill the prescription', 'POST', '/app/medical-sales', fill);
    flow.expectValue('the sale names it', '.data.patient_prescription_id', prescription);
    await flow.expect(409, 'fill it again', 'POST', '/app/medical-sales', fill);
    flow.expectValue('filled: why', REASON, 'prescription_filled');
    await flow.expect(
      200,
      'prescriptions filled',
      'GET',
      `/app/patient-prescriptions?is_filled=true&patient_id=${ashaFile}`,
    );
    flow.expectValue(
      'the prescription is filled',
      `[.data[].id] | index("${prescription}") != null`,
      'true',
    );
    await flow.expect(
      404,
      'a sale not here',
      'GET',
      '/app/medical-sales/msal_000000000000000000000',
    );
  });

  it('the medicine codes by role (MD2)', async () => {
    flow.as('pharmacist');
    await flow.expect(200, 'the pharmacist lists medicines', 'GET', `/app/medicines?q=${T}`);
    await flow.expect(200, 'the pharmacist adds a manufacturer', 'POST', '/app/manufacturers', {
      name: `Pharmacist brand ${T}`,
    });
    await flow.expect(
      403,
      "the pharmacist can't delete",
      'DELETE',
      `/app/manufacturers/${quickManufacturer}?${DELETE_REASON}`,
    );
    await flow.expect(403, "the pharmacist can't export", 'GET', '/app/medicines/exports');
    await flow.expect(
      200,
      "the pharmacist reads the store's payments",
      'GET',
      '/app/medical-payments',
    );
    await flow.expect(
      403,
      "nor export the store's payments",
      'GET',
      '/app/medical-payments/exports',
    );
    flow.as('accountant');
    await flow.expect(
      200,
      'the accountant reads the store',
      'GET',
      `/app/medical-sales?contact_id=${asha}`,
    );
    await flow.expect(
      200,
      'the accountant exports',
      'GET',
      `/app/medical-sales/exports?contact_id=${asha}`,
    );
    await flow.expect(
      200,
      "the accountant exports the store's payments",
      'GET',
      '/app/medical-payments/exports',
    );
    await flow.expect(403, "the accountant can't add", 'POST', '/app/medicines', {
      name: `Accountant ${T}`,
      manufacturer_id: manufacturer,
      mrp: 1,
    });
    flow.as('doctor');
    await flow.expect(200, 'the doctor reads medicines', 'GET', `/app/medicines?q=${T}`);
    await flow.expect(403, "the doctor can't sell", 'POST', '/app/medical-sales', saleBody);
    flow.as('front_desk');
    await flow.expect(403, 'the front desk sees no store', 'GET', '/app/medicines');
  });

  it("a return's refund needs payment:delete (MD23, D83)", async () => {
    flow.as('owner');
    await flow.expect(200, 'sell one, paid now', 'POST', '/app/medical-sales', {
      branch_id: vesu,
      contact_id: bela,
      items: [{ medicine_id: glycolac, quantity: 1 }],
      payment: { splits: [{ mode: 'cash', amount: 369 }] },
    });
    const returns = `/app/medical-sales/${flow.last('.data.id')}/returns`;
    const body = {
      items: [{ invoice_item_id: flow.last('.data.items[0].invoice_item_id'), quantity: 1 }],
      reason: 'unused',
      refund_mode: 'cash',
    };
    flow.as('pharmacist');
    await flow.expect(403, "the pharmacist can't give money back", 'POST', returns, body);
    flow.expectValue('no refund code: why', REASON, 'missing_permission');
    flow.as('accountant');
    await flow.expect(200, 'the accountant refunds the return', 'POST', returns, body);
    flow.expectValue('returned', '.data.status', 'returned');
  });

  it('who owes on sales, the Created filter and the customer sort (MD25, MD27, MD30)', async () => {
    flow.as('owner');
    await flow.expect(200, 'Asha buys one, unpaid', 'POST', '/app/medical-sales', {
      branch_id: vesu,
      contact_id: asha,
      items: [{ medicine_id: glycolac, quantity: 1 }],
    });
    const ashaSale = flow.last('.data.id');
    const ownRows = `[.data[] | select(.contact.id == "${bela}" or .contact.id == "${asha}")]`;
    const rowOf = (contact: string) => `.data[] | select(.contact.id == "${contact}")`;
    await flow.expect(200, 'who owes (route 52)', 'GET', '/app/medical-sales/dues');
    flow.expectValue(
      'largest due first: Bela, then Asha (MD25)',
      `${ownRows} | map(.contact.id) | join(",")`,
      `${bela},${asha}`,
    );
    flow.expectValue(
      'Bela: the split sale only — paid, returned and voided sales owe nothing',
      `${rowOf(bela)} | [.due_total, .sale_count, .contact.name, .patient_id] | map(tostring) | join(",")`,
      `1107,1,Bela ${T},null`,
    );
    flow.expectValue(
      'Asha: two unpaid sales, the new one last, her file',
      `${rowOf(asha)} | [.due_total, .sale_count, .sales[1].id, .sales[1].due_amount, .patient_id] | map(tostring) | join(",")`,
      `738,2,${ashaSale},369,${ashaFile}`,
    );
    await flow.expect(
      200,
      "search the buyer's name",
      'GET',
      `/app/medical-sales/dues?q=Asha%20${T}`,
    );
    flow.expectValue('only Asha', '[.data[].contact.id] | join(",")', asha);
    await flow.expect(200, 'one row at most', 'GET', '/app/medical-sales/dues?limit=1');
    flow.expectValue('the largest only', '.data | length', 1);
    await flow.expect(
      200,
      'nothing created before 2000',
      'GET',
      '/app/medical-sales/dues?created_to=2000-01-01T00:00:00Z',
    );
    flow.expectValue('no dues', '.data | length', 0);
    await flow.expect(
      200,
      'the Created filter on the Sales tab (MD30 (a))',
      'GET',
      `/app/medical-sales?contact_id=${asha}&created_from=2000-01-01T00:00:00Z&created_to=2000-01-02T00:00:00Z`,
    );
    flow.expectValue('none created then', '.data | length', 0);
    await flow.expect(
      200,
      'sales by customer, A–Z (MD27)',
      'GET',
      `/app/medical-sales?q=${T}&sort=contact_name&limit=100`,
    );
    flow.expectValue(
      'Asha before Bela',
      '[.data[].contact.name] == ([.data[].contact.name] | sort)',
      true,
    );
    flow.expectValue('both buyers listed', '[.data[].contact.name] | unique | length', 2);
    flow.as('front_desk');
    await flow.expect(403, 'the front desk reads no dues', 'GET', '/app/medical-sales/dues');
  });

  it('receive takes goods not ordered; the order names its supplier (MD26, MD30 (c))', async () => {
    flow.as('owner');
    await flow.expect(200, 'a supplier with phone and GSTIN', 'POST', '/app/suppliers', {
      name: `Surprise Agency ${T}`,
      phone: `+91${digits}41`,
      gst_number: '24AABCS1429B1Z5',
    });
    const surpriseSupplier = flow.last('.data.id');
    await flow.expect(200, 'order one line', 'POST', '/app/medical-purchase-orders', {
      supplier_id: surpriseSupplier,
      items: [{ medicine_id: glycolac, quantity: 2, rate: 100 }],
    });
    const order = flow.last('.data.id');
    const orderedLine = flow.last('.data.items[0].id');
    flow.expectValue(
      "the order's supplier: phone and GSTIN (MD30 (c))",
      '[.data.supplier.name, .data.supplier.phone, .data.supplier.gst_number] | join(",")',
      `Surprise Agency ${T},+91${digits}41,24AABCS1429B1Z5`,
    );
    const receive = `/app/medical-purchase-orders/${order}/receive`;
    await flow.expect(400, 'a new line naming two medicines', 'POST', receive, {
      items: [{ medicine_id: glycolac, new_medicine_name: 'Both', quantity: 1, rate: 10 }],
    });
    await flow.expect(400, 'past 50 lines', 'POST', receive, {
      items: Array.from({ length: 50 }, () => ({ medicine_id: glycolac, quantity: 1, rate: 10 })),
    });
    flow.expectValue('too many: field', FIELDS, 'items');
    await flow.expect(200, 'receive with two lines not ordered (MD26)', 'POST', receive, {
      items: [
        { id: orderedLine },
        {
          medicine_id: glycolac,
          quantity: 1,
          free_quantity: 1,
          rate: 120,
          batch_number: 'UX1',
          expiry_month: later,
        },
        { new_medicine_name: `Surprise gel ${T}`, quantity: 3, rate: 50 },
      ],
    });
    flow.expectValue(
      'three received lines, the bill counts them all',
      '[.data.stage, (.data.items | length), .data.total, .data.items[1].line_number, .data.items[1].batch_number, .data.items[2].line_number, .data.items[2].is_received, .data.items[2].batch_number] | map(tostring) | join(",")',
      `received,3,470,2,UX1,3,true,NEW-${flow.last('.data.purchase_order_number')}`,
    );
    flow.expectEqual('one and one free into batch UX1', await batchStock(glycolac, 'UX1'), '2');
    await flow.expect(
      200,
      'the typed name is a medicine',
      'GET',
      `/app/medicines?q=Surprise%20gel%20${T}`,
    );
    flow.expectValue(
      'quick, its three packs in stock',
      '[.data[0].is_quick, .data[0].quantity] | map(tostring) | join(",")',
      'true,3',
    );
    await flow.expect(
      200,
      'pay the supplier in full',
      'POST',
      `/app/suppliers/${surpriseSupplier}/payments`,
      { branch_id: vesu, splits: [{ mode: 'cash', amount: 470 }] },
    );
    await flow.expect(
      204,
      'delete the supplier, nothing owed',
      'DELETE',
      `/app/suppliers/${surpriseSupplier}?${DELETE_REASON}`,
    );
    await flow.expect(200, 'the order after', 'GET', `/app/medical-purchase-orders/${order}`);
    flow.expectValue(
      "a deleted supplier's phone and GSTIN stay on the order",
      '[.data.supplier.name, .data.supplier.phone, .data.supplier.gst_number] | join(",")',
      `Surprise Agency ${T},+91${digits}41,24AABCS1429B1Z5`,
    );
  });

  it('medicines sort by manufacturer and margin, none last (MD27)', async () => {
    flow.as('owner');
    await flow.expect(200, 'a maker A–Z first', 'POST', '/app/manufacturers', { name: `aaa ${T}` });
    const makerA = flow.last('.data.id');
    await flow.expect(200, 'a maker A–Z last', 'POST', '/app/manufacturers', { name: `zzz ${T}` });
    const makerZ = flow.last('.data.id');
    await flow.expect(200, 'a supplier for the prices', 'POST', '/app/suppliers', {
      name: `Sort supplier ${T}`,
    });
    const priceSupplier = flow.last('.data.id');
    await flow.expect(200, 'margin 10%, maker Z', 'POST', '/app/medicines', {
      name: `Sort ${T} low`,
      manufacturer_id: makerZ,
      mrp: 100,
      supplier_prices: [{ supplier_id: priceSupplier, rate: 90 }],
    });
    const low = flow.last('.data.id');
    await flow.expect(200, 'margin 50%, maker A', 'POST', '/app/medicines', {
      name: `Sort ${T} high`,
      manufacturer_id: makerA,
      mrp: 100,
      supplier_prices: [{ supplier_id: priceSupplier, rate: 50 }],
    });
    const high = flow.last('.data.id');
    await flow.expect(200, 'no maker, no price (quick)', 'POST', '/app/medicines', {
      name: `Sort ${T} quick`,
      is_quick: true,
    });
    const quick = flow.last('.data.id');
    const list = `/app/medicines?q=Sort%20${T}`;
    await flow.expect(200, 'by margin, highest first', 'GET', `${list}&sort=margin_percent`);
    flow.expectValue('50%, 10%, then none', IDS, `${high},${low},${quick}`);
    await flow.expect(200, 'by maker, A–Z', 'GET', `${list}&sort=manufacturer_name`);
    flow.expectValue('AAA, ZZZ, then none', IDS, `${high},${low},${quick}`);
    await flow.expect(200, 'by maker, Z–A', 'GET', `${list}&sort=manufacturer_name&order=desc`);
    flow.expectValue('ZZZ, AAA, none still last', IDS, `${low},${high},${quick}`);
    await flow.expect(200, 'by margin, two a page', 'GET', `${list}&sort=margin_percent&limit=2`);
    flow.expectValue('the first page', IDS, `${high},${low}`);
    const next = flow.last('.meta.pagination.next');
    await flow.expect(
      200,
      'the next page',
      'GET',
      `${list}&sort=margin_percent&limit=2&after=${encodeURIComponent(next)}`,
    );
    flow.expectValue('the medicine without a margin', IDS, quick);
  });

  it("the suppliers' payable footer and order total (MD30 (b))", async () => {
    flow.as('owner');
    const order = async (supplierId: string, quantity: number): Promise<string> => {
      await flow.expect(200, 'an order', 'POST', '/app/medical-purchase-orders', {
        supplier_id: supplierId,
        items: [{ medicine_id: glycolac, quantity, rate: 100 }],
      });
      return flow.last('.data.id');
    };
    await flow.expect(200, 'footer supplier one', 'POST', '/app/suppliers', {
      name: `Footer ${T} one`,
    });
    const one = flow.last('.data.id');
    await flow.expect(200, 'footer supplier two', 'POST', '/app/suppliers', {
      name: `Footer ${T} two`,
    });
    const two = flow.last('.data.id');
    const received = await order(one, 2);
    await flow.expect(
      200,
      'receive it',
      'POST',
      `/app/medical-purchase-orders/${received}/receive`,
      {},
    );
    await order(one, 3);
    const cancelled = await order(one, 1);
    await flow.expect(
      204,
      'cancel one',
      'DELETE',
      `/app/medical-purchase-orders/${cancelled}?reason=mistake`,
    );
    const second = await order(two, 1);
    await flow.expect(
      200,
      'receive the other',
      'POST',
      `/app/medical-purchase-orders/${second}/receive`,
      {},
    );
    await flow.expect(200, 'supplier one', 'GET', `/app/suppliers/${one}`);
    flow.expectValue(
      'two live orders worth 500, 200 owed (the cancelled one left out)',
      '[.data.order_count, .data.order_total, .data.payable] | map(tostring) | join(",")',
      '2,500,200',
    );
    await flow.expect(
      200,
      'the footer over every page',
      'GET',
      `/app/suppliers?q=Footer%20${T}&limit=1`,
    );
    flow.expectValue(
      'one row, both suppliers owed',
      '[(.data | length), .meta.payable_total] | map(tostring) | join(",")',
      '1,300',
    );
    await flow.expect(
      200,
      'the footer follows the filters',
      'GET',
      `/app/suppliers?q=Footer%20${T}%20two`,
    );
    flow.expectValue('only supplier two', '.meta.payable_total', 100);
  });

  it('/invoices refuses medical bills and medicine lines (MD28)', async () => {
    flow.as('owner');
    const medicineLine = { medicine_id: glycolac, quantity: 1 };
    await flow.expect(400, 'a medical bill by hand', 'POST', '/app/invoices', {
      branch_id: vesu,
      contact_id: asha,
      type: 'medical',
      items: [medicineLine],
    });
    flow.expectValue('sold through the store: the field', FIELDS, 'type');
    flow.expectValue('sold through the store: why', REASON, 'sold_through_store');
    await flow.expect(400, 'a medicine on a clinic bill', 'POST', '/app/invoices', {
      branch_id: vesu,
      contact_id: asha,
      items: [medicineLine],
    });
    flow.expectValue('the line named', FIELDS, 'items/0/medicine_id');
    await flow.expect(400, 'the bill preview too', 'POST', '/app/invoices/preview', {
      branch_id: vesu,
      items: [medicineLine],
    });
    flow.expectValue('the preview: why', REASON, 'sold_through_store');
    await flow.expect(200, 'an offering to bill', 'POST', '/app/offerings', {
      name: `Store guard ${T}`,
      price: 500,
      branch_ids: [vesu],
    });
    const offering = flow.last('.data.id');
    await flow.expect(200, 'a clinic bill', 'POST', '/app/invoices', {
      branch_id: vesu,
      contact_id: asha,
      items: [{ offering_id: offering, quantity: 1 }],
    });
    const clinicBill = flow.last('.data.id');
    const keptLine = flow.last('.data.items[0].id');
    const change = { items: [{ id: keptLine, quantity: 1 }, medicineLine] };
    await flow.expect(
      400,
      'a medicine added to it',
      'PATCH',
      `/app/invoices/${clinicBill}`,
      change,
    );
    flow.expectValue('the added line named', FIELDS, 'items/1/medicine_id');
    await flow.expect(
      400,
      'the change preview too',
      'POST',
      `/app/invoices/${clinicBill}/preview`,
      change,
    );
    await flow.expect(
      200,
      "the sales' bills still list",
      'GET',
      `/app/invoices?type=medical&contact_id=${asha}`,
    );
    flow.expectValue('medical invoices of sales', '[.data[].type] | unique | join(",")', 'medical');
    await flow.call('GET', `/app/medical-sales?contact_id=${asha}&status=unpaid&limit=1`);
    const saleInvoice = flow.last('.data[0].invoice.id');
    await flow.expect(
      409,
      "a sale's bill stays the sale's",
      'PATCH',
      `/app/invoices/${saleInvoice}`,
      {
        items: [medicineLine],
      },
    );
    flow.expectValue("the sale's: why", REASON, 'invoice_of_sale');
  });

  it('the prescription row names its patient (MD29)', async () => {
    flow.as('owner');
    await flow.expect(
      200,
      'the approved prescriptions',
      'GET',
      '/app/patient-prescriptions?status=approved&limit=100',
    );
    flow.expectValue(
      "Asha's prescription names her: the file, the contact, the name",
      `[.data[] | select(.patient_id == "${ashaFile}") | .patient] | first | [.id, .contact_id, .name, (.patient_number > 0)] | map(tostring) | join(",")`,
      `${ashaFile},${asha},Asha ${T},true`,
    );
  });

  it("a return as store credit and the store's customer credits (MD32, MD33, D90)", async () => {
    flow.as('owner');
    await flow.expect(200, 'Bela buys one, paid now', 'POST', '/app/medical-sales', {
      branch_id: vesu,
      contact_id: bela,
      items: [{ medicine_id: glycolac, quantity: 1 }],
      payment: { splits: [{ mode: 'cash', amount: 369 }] },
    });
    const sale = flow.last('.data.id');
    const invoice = flow.last('.data.invoice.id');
    const line = flow.last('.data.items[0].invoice_item_id');
    await flow.expect(
      200,
      'her refunds before',
      'GET',
      `/app/payments?contact_id=${bela}&kind=refund&limit=100`,
    );
    const refundsBefore = flow.last('.data | length');
    await flow.expect(
      200,
      'returned as store credit (MD33)',
      'POST',
      `/app/medical-sales/${sale}/returns`,
      {
        items: [{ invoice_item_id: line, quantity: 1 }],
        reason: 'unused',
        refund_mode: 'credit',
      },
    );
    flow.expectValue(
      'returned, the credit named, the bill paid in full',
      '[.data.status, .data.returns[0].refund_mode, (.data.returns[0].pending_credit_id | startswith("pcr_")), .data.returns[0].amount, .data.invoice.paid_amount, .data.invoice.due_amount] | map(tostring) | join(",")',
      'returned,credit,true,369,369,0',
    );
    const credit = flow.last('.data.returns[0].pending_credit_id');
    await flow.expect(
      200,
      'no money moved',
      'GET',
      `/app/payments?contact_id=${bela}&kind=refund&limit=100`,
    );
    flow.expectValue('no refund payment', '.data | length', Number(refundsBefore));
    await flow.expect(
      200,
      'the credit note lowers the bill',
      'GET',
      `/app/invoices/${invoice}/credit-notes`,
    );
    flow.expectValue(
      'one note, no refund payment',
      '[(.data | length), .data[0].amount, .data[0].payment_id] | map(tostring) | join(",")',
      '1,369,null',
    );
    await flow.expect(
      409,
      'the credit holds the money: no cash refund of it too (B16)',
      'POST',
      `/app/invoices/${invoice}/credit-notes`,
      { amount: 369, reason: 'Refund again', splits: [{ mode: 'cash', amount: 369 }] },
    );
    flow.expectValue('more than paid: why', '.error.reason', 'more_than_paid');
    await flow.expect(
      200,
      "the store's customer credits (route 56)",
      'GET',
      `/app/medical-pending-credits?contact_id=${bela}`,
    );
    flow.expectValue(
      'owed to Bela, open, no invoice',
      `.data[] | select(.id == "${credit}") | [.direction, .amount, .left_amount, .status, .invoice_id] | map(tostring) | join(",")`,
      'give,369,369,open,null',
    );
    await flow.expect(200, 'a credit added naming her sale', 'POST', '/app/pending-credits', {
      direction: 'take',
      contact_id: bela,
      amount: 10,
      reason: 'Strip short',
      invoice_id: invoice,
    });
    const named = flow.last('.data.id');
    await flow.expect(200, 'a credit of the clinic', 'POST', '/app/pending-credits', {
      direction: 'give',
      contact_id: bela,
      amount: 20,
      reason: 'Consult advance',
    });
    const clinic = flow.last('.data.id');
    await flow.expect(
      200,
      'the store keeps its own',
      'GET',
      `/app/medical-pending-credits?contact_id=${bela}&limit=100`,
    );
    flow.expectValue(
      "the sale's and the return's, never the clinic's",
      `[.data[].id | select(. == "${credit}" or . == "${named}" or . == "${clinic}")] | sort | join(",")`,
      [credit, named].sort().join(','),
    );
    flow.as('pharmacist');
    await flow.expect(
      200,
      'the pharmacist reads them (medicine:read)',
      'GET',
      '/app/medical-pending-credits',
    );
    flow.as('owner');
    await flow.expect(200, 'Bela buys again, unpaid', 'POST', '/app/medical-sales', {
      branch_id: vesu,
      contact_id: bela,
      items: [{ medicine_id: glycolac, quantity: 1 }],
    });
    const nextSale = flow.last('.data.id');
    const nextInvoice = flow.last('.data.invoice.id');
    await flow.expect(
      200,
      'the credit used on the next bill',
      'POST',
      `/app/pending-credits/${credit}/settle`,
      {
        amount: 369,
        method: 'use_on_bill',
        invoice_id: nextInvoice,
      },
    );
    flow.expectValue(
      'used',
      '[.data.status, .data.left_amount] | map(tostring) | join(",")',
      'used,0',
    );
    await flow.expect(200, 'the next sale paid by it', 'GET', `/app/medical-sales/${nextSale}`);
    flow.expectValue(
      'paid',
      '[.data.status, .data.invoice.due_amount] | map(tostring) | join(",")',
      'paid,0',
    );
  });
});
