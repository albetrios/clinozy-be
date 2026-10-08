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
 * Sub-domain 9, Stock 9.A–9.E (routes-final §9, launch ROUTE #137): items with their opening
 * quantity, level and how long they last; the movement ledger — every change one row, the guarded
 * balance, reverts; counts that adjust what differs; purchases that receive their lines and are paid
 * by supplier bills; vendors and what they are owed — one flow over the fixture organization (the
 * launch's curl checks, `tooling/dev/live-api/checks/stock.checks.sh`).
 */
describe('Stock — integration (routes-final §9)', () => {
  const S = String(Date.now());
  const lastName = `s${S}`;
  const digits = `6${S.slice(-7)}`;
  const FIELDS = '[.error.errors[].field] | join(",")';
  const REASON = '.error.reason';
  const IDS = '[.data[].id] | join(",")';
  const NOWHERE_ITEM = 'sitm_000000000000000000000';
  const NOWHERE_VENDOR = 'svnd_000000000000000000000';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let vesu = '';
  let tomorrow = '';
  let today = '';

  let meera = '';
  let meeraFile = '';
  let session = '';
  let reversedSession = '';
  let vendor = '';
  let quickVendor = '';
  let peel = '';
  let peelNumber = '';
  let gauze = '';
  let used = '';
  let opening = '';
  let count = '';
  let firstPurchase = '';
  let secondPurchase = '';
  let cotton = '';
  let firstPurchasePayment = '';

  /** Adds a stock item of this run and returns its id. */
  async function item(name: string, extra: Record<string, unknown> = {}): Promise<string> {
    await flow.expect(200, `item ${name}`, 'POST', '/app/stock-items', {
      name: `${name} ${S}`,
      ...extra,
    });
    return flow.last('.data.id');
  }

  /** A `POST /app/stock-items/{stock_item_id}/movements` body. */
  function move(
    type: string,
    quantity: number,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return { type, quantity, ...extra };
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    vesu = fixture.branches.vesu;
    today = calendarDay(fixture, 0);
    tomorrow = calendarDay(fixture, 1);

    flow.as('owner');
    // A patient file with one session done and one reversed — what a use can name (S14).
    await flow.expect(200, 'contact Meera', 'POST', '/app/contacts', {
      first_name: 'Meera',
      last_name: lastName,
      phones: [{ phone: `+91${digits}31`, is_primary: true }],
    });
    meera = flow.last('.data.id');
    await flow.expect(200, "Meera's file", 'POST', '/app/patients', {
      contact_id: meera,
      home_branch_id: vesu,
    });
    meeraFile = flow.last('.data.id');
    await flow.expect(200, 'a peel session', 'POST', `/app/patients/${meeraFile}/treatments`, {
      name: 'Glycolic peel',
    });
    session = flow.last('.data.id');
    await flow.expect(
      200,
      'a session to reverse',
      'POST',
      `/app/patients/${meeraFile}/treatments`,
      {
        name: 'Glycolic peel',
      },
    );
    reversedSession = flow.last('.data.id');
    await flow.expect(
      200,
      'reverse it',
      'POST',
      `/app/patients/${meeraFile}/treatments/${reversedSession}/reverse`,
      { reason: 'Wrong patient' },
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('9.E stock vendors (routes 23–26)', async () => {
    flow.as('owner');
    await flow.expect(200, 'add a vendor', 'POST', '/app/stock-vendors', {
      name: `Skin Supplies ${S}`,
      phone: `+91${digits}41`,
    });
    vendor = flow.last('.data.id');
    flow.expectValue(
      'the vendor: prefix, phone, not quick, nothing owed',
      '[(.data.id | startswith("svnd_")), .data.phone, .data.is_quick, .data.payable] | map(tostring) | join(",")',
      `true,+91${digits}41,false,0`,
    );
    await flow.expect(409, 'the name in another case (S13)', 'POST', '/app/stock-vendors', {
      name: `SKIN SUPPLIES ${S}`,
    });
    flow.expectValue('taken: why', REASON, 'record_already_exists');
    await flow.expect(400, 'a phone without +91', 'POST', '/app/stock-vendors', {
      name: `Bad phone ${S}`,
      phone: '9876543210',
    });
    flow.expectValue('bad phone: field', FIELDS, 'body.phone');
    await flow.expect(400, 'a vendor without a name', 'POST', '/app/stock-vendors', {});
    flow.expectValue('no name: field', FIELDS, 'body.name');
    await flow.expect(200, 'a vendor added inline', 'POST', '/app/stock-vendors', {
      name: `Quick vendor ${S}`,
      is_quick: true,
    });
    quickVendor = flow.last('.data.id');
    flow.expectValue('inline: is_quick', '.data.is_quick', 'true');
    await flow.expect(200, 'the picker by name', 'GET', `/app/stock-vendors?q=${S}`);
    flow.expectValue('A–Z: both', IDS, `${quickVendor},${vendor}`);
    await flow.expect(
      200,
      'newest first',
      'GET',
      `/app/stock-vendors?q=${S}&sort=created_at&order=desc`,
    );
    flow.expectValue('newest: the inline one', '.data[0].id', quickVendor);
    await flow.expect(200, 'get the vendor', 'GET', `/app/stock-vendors/${vendor}`);
    await flow.expect(200, 'clear the phone', 'PATCH', `/app/stock-vendors/${vendor}`, {
      phone: null,
    });
    flow.expectValue('no phone', '.data.phone', 'null');
    await flow.expect(409, 'rename to a taken name', 'PATCH', `/app/stock-vendors/${quickVendor}`, {
      name: `Skin supplies ${S}`,
    });
    await flow.expect(
      400,
      'a change with nothing in it',
      'PATCH',
      `/app/stock-vendors/${vendor}`,
      {},
    );
    await flow.expect(400, 'is_quick is set once', 'PATCH', `/app/stock-vendors/${vendor}`, {
      is_quick: true,
    });
    await flow.expect(404, 'a vendor not here', 'GET', `/app/stock-vendors/${NOWHERE_VENDOR}`);
  });

  it('9.A stock items (routes 1–5)', async () => {
    flow.as('owner');
    peel = await item('Glycolic peel', {
      category: 'peels',
      unit: 'bottle',
      size_per_unit: 30,
      measure_unit: 'ml',
      min_quantity: 2,
      max_quantity: 6,
      usage_per_week: 1.5,
      stock_vendor_id: vendor,
      opening_quantity: 5,
    });
    flow.expectValue(
      'the opening moved in (S6): quantity, level, lasts',
      '[(.data.id | startswith("sitm_")), .data.quantity, .data.stock_level, .data.lasts_days, .data.stock_vendor_id, (.data.stock_item_number > 0)] | map(tostring) | join(",")',
      `true,5,ok,23,${vendor},true`,
    );
    peelNumber = flow.last('.data.stock_item_number');
    gauze = await item('Gauze');
    flow.expectValue(
      'defaults: consumables, piece, 1–10, out, no usage',
      '[.data.category, .data.unit, .data.min_quantity, .data.max_quantity, .data.quantity, .data.stock_level, .data.lasts_days, .data.last_rate] | map(tostring) | join(",")',
      'consumables,piece,1,10,0,out,null,null',
    );
    await flow.expect(400, 'a size without its measure', 'POST', '/app/stock-items', {
      name: `Sized ${S}`,
      size_per_unit: 30,
    });
    flow.expectValue('no measure: field', FIELDS, 'measure_unit');
    await flow.expect(400, 'a measure without its size', 'POST', '/app/stock-items', {
      name: `Measured ${S}`,
      measure_unit: 'g',
    });
    flow.expectValue('no size: field', FIELDS, 'size_per_unit');
    await flow.expect(400, 'a size of 0', 'POST', '/app/stock-items', {
      name: `Zero ${S}`,
      size_per_unit: 0,
      measure_unit: 'g',
    });
    flow.expectValue('size 0: field', FIELDS, 'body.size_per_unit');
    await flow.expect(400, 'a maximum under the minimum', 'POST', '/app/stock-items', {
      name: `Levels ${S}`,
      min_quantity: 5,
      max_quantity: 2,
    });
    flow.expectValue('levels: field', FIELDS, 'max_quantity');
    await flow.expect(400, 'a maximum under the default minimum', 'POST', '/app/stock-items', {
      name: `Levels two ${S}`,
      max_quantity: 0.5,
    });
    flow.expectValue('default minimum: field', FIELDS, 'max_quantity');
    await flow.expect(400, 'four decimals', 'POST', '/app/stock-items', {
      name: `Fine ${S}`,
      opening_quantity: 1.2345,
    });
    flow.expectValue('decimals: field', FIELDS, 'body.opening_quantity');
    await flow.expect(409, 'the name in another case', 'POST', '/app/stock-items', {
      name: `GAUZE ${S}`,
    });
    flow.expectValue('taken: why', REASON, 'record_already_exists');
    await flow.expect(400, 'an unknown vendor', 'POST', '/app/stock-items', {
      name: `Vendorless ${S}`,
      stock_vendor_id: NOWHERE_VENDOR,
    });
    flow.expectValue('unknown vendor: field', FIELDS, 'stock_vendor_id');
    await flow.expect(
      400,
      'the quantity is never patched (S5)',
      'PATCH',
      `/app/stock-items/${peel}`,
      {
        quantity: 9,
      },
    );
    await flow.expect(400, 'nor the opening', 'PATCH', `/app/stock-items/${peel}`, {
      opening_quantity: 9,
    });
    await flow.expect(400, 'nor the last rate', 'PATCH', `/app/stock-items/${peel}`, {
      last_rate: 9,
    });
    await flow.expect(200, 'raise the minimum to 6', 'PATCH', `/app/stock-items/${peel}`, {
      min_quantity: 6,
    });
    flow.expectValue(
      'low now',
      '[.data.min_quantity, .data.stock_level] | map(tostring) | join(",")',
      '6,low',
    );
    await flow.expect(
      400,
      'a maximum under the stored minimum',
      'PATCH',
      `/app/stock-items/${peel}`,
      { max_quantity: 1 },
    );
    flow.expectValue('stored minimum: field', FIELDS, 'max_quantity');
    await flow.expect(
      400,
      'clearing the size keeps the measure',
      'PATCH',
      `/app/stock-items/${peel}`,
      { size_per_unit: null },
    );
    flow.expectValue('size cleared alone: field', FIELDS, 'size_per_unit');
    await flow.expect(200, 'clear both', 'PATCH', `/app/stock-items/${peel}`, {
      size_per_unit: null,
      measure_unit: null,
    });
    await flow.expect(200, 'low items', 'GET', `/app/stock-items?q=${S}&stock_level=low`);
    flow.expectValue('low: the peel', IDS, peel);
    await flow.expect(200, 'out of stock', 'GET', `/app/stock-items?q=${S}&stock_level=out`);
    flow.expectValue('out: the gauze', IDS, gauze);
    await flow.expect(
      200,
      'low or out — Reorder',
      'GET',
      `/app/stock-items?q=${S}&stock_level=low,out`,
    );
    flow.expectValue('both, A–Z', IDS, `${gauze},${peel}`);
    await flow.expect(200, 'by category', 'GET', `/app/stock-items?q=${S}&category=peels`);
    flow.expectValue('peels', IDS, peel);
    await flow.expect(200, 'by the number', 'GET', `/app/stock-items?q=%23${peelNumber}`);
    flow.expectValue('the number finds it', `[.data[].id | select(. == "${peel}")] | length`, 1);
    await flow.expect(200, 'by vendor', 'GET', `/app/stock-items?stock_vendor_id=${vendor}`);
    flow.expectValue("the vendor's", IDS, peel);
    await flow.expect(
      200,
      'by quantity, most first',
      'GET',
      `/app/stock-items?q=${S}&sort=quantity&order=desc`,
    );
    flow.expectValue('the peel first', '.data[0].id', peel);
    await flow.expect(
      200,
      'by how long it lasts, none last',
      'GET',
      `/app/stock-items?q=${S}&sort=lasts_days&order=desc`,
    );
    flow.expectValue('the peel, then the gauze', IDS, `${peel},${gauze}`);
    await flow.expect(
      200,
      'by number, newest first',
      'GET',
      `/app/stock-items?q=${S}&sort=stock_item_number`,
    );
    flow.expectValue('the gauze first', '.data[0].id', gauze);
    await flow.expect(400, 'an unknown level', 'GET', '/app/stock-items?stock_level=empty');
    await flow.expect(200, 'the items CSV', 'GET', `/app/stock-items/exports?q=${S}`);
    flow.expectValue(
      'CSV: name, rows',
      '[(.data.file_name | startswith("stock-items-")), .data.row_count] | map(tostring) | join(",")',
      'true,2',
    );
    await flow.expect(
      409,
      'delete an item with stock (S6)',
      'DELETE',
      `/app/stock-items/${peel}?reason=mistake`,
    );
    flow.expectValue('has stock: why', REASON, 'item_has_stock');
  });

  it('9.B stock item movements (routes 8–12)', async () => {
    flow.as('owner');
    const movements = `/app/stock-items/${peel}/movements`;
    await flow.expect(
      200,
      "use 1.5 in Meera's session (S14)",
      'POST',
      movements,
      move('used', 1.5, {
        used_for: 'Peel session',
        patient_treatment_id: session,
        note: 'Left cheek',
      }),
    );
    used = flow.last('.data.id');
    flow.expectValue(
      'signed by the server, the balance left, the author',
      '[(.data.id | startswith("smov_")), .data.type, .data.quantity_change, .data.quantity_after, .data.patient_treatment_id, (.data.author_membership_id != null), .data.reverted_by_stock_item_movement_id] | map(tostring) | join(",")',
      `true,used,-1.5,3.5,${session},true,null`,
    );
    await flow.expect(
      400,
      'a use in a reversed session',
      'POST',
      movements,
      move('used', 1, { patient_treatment_id: reversedSession }),
    );
    flow.expectValue('reversed session: field', FIELDS, 'patient_treatment_id');
    await flow.expect(
      400,
      'an unknown session',
      'POST',
      movements,
      move('used', 1, { patient_treatment_id: 'ptrt_000000000000000000000' }),
    );
    flow.expectValue('unknown session: field', FIELDS, 'patient_treatment_id');
    await flow.expect(
      400,
      'Used for on a receipt',
      'POST',
      movements,
      move('received', 1, { used_for: 'X' }),
    );
    flow.expectValue('used_for: field', FIELDS, 'body.used_for');
    await flow.expect(
      400,
      'a session on damage',
      'POST',
      movements,
      move('damaged', 1, { patient_treatment_id: session }),
    );
    flow.expectValue('session on damage: field', FIELDS, 'body.patient_treatment_id');
    await flow.expect(400, 'a receipt of 0', 'POST', movements, move('received', 0));
    flow.expectValue('0: field', FIELDS, 'body.quantity');
    await flow.expect(400, 'an opening by hand', 'POST', movements, move('opening', 1));
    await flow.expect(409, 'damage more than is left (S5)', 'POST', movements, move('damaged', 10));
    flow.expectValue('not enough: why', REASON, 'not_enough_stock');
    await flow.expect(400, 'an adjust to what is there', 'POST', movements, move('adjust', 3.5));
    flow.expectValue('nothing to adjust: field', FIELDS, 'quantity');
    await flow.expect(
      200,
      'adjust to the counted 4',
      'POST',
      movements,
      move('adjust', 4, { note: 'Shelf count' }),
    );
    flow.expectValue(
      'the difference written',
      '[.data.type, .data.quantity_change, .data.quantity_after] | map(tostring) | join(",")',
      'adjust,0.5,4',
    );
    await flow.expect(200, 'return 1 to the vendor', 'POST', movements, move('returned', 1));
    flow.expectValue(
      'returned: −1, 3 left',
      '[.data.quantity_change, .data.quantity_after] | map(tostring) | join(",")',
      '-1,3',
    );
    await flow.expect(200, "the item's history", 'GET', movements);
    flow.expectValue(
      'newest first: returned, adjust, used, opening',
      '[.data[].type] | join(",")',
      'returned,adjust,used,opening',
    );
    opening = flow.last('.data[3].id');
    await flow.expect(
      200,
      "the Movements tab: this item's uses",
      'GET',
      `/app/stock-item-movements?stock_item_id=${peel}&type=used`,
    );
    flow.expectValue('one use', IDS, used);
    await flow.expect(
      200,
      "a session's stock",
      'GET',
      `/app/stock-item-movements?patient_treatment_id=${session}`,
    );
    flow.expectValue("the session's use", IDS, used);
    await flow.expect(
      200,
      'by author',
      'GET',
      `/app/stock-item-movements?stock_item_id=${peel}&author_membership_id=${fixture.members.admin.membershipPublicId}`,
    );
    flow.expectValue('the admin wrote none', '.data | length', 0);
    await flow.expect(
      400,
      'the Movements tab has no search',
      'GET',
      '/app/stock-item-movements?q=peel',
    );
    await flow.expect(200, 'one movement', 'GET', `${movements}/${used}`);
    await flow.expect(
      404,
      "another item's movement",
      'GET',
      `/app/stock-items/${gauze}/movements/${used}`,
    );
    await flow.expect(404, 'a movement is never patched', 'PATCH', `${movements}/${used}`, {
      note: 'x',
    });
    await flow.expect(404, 'nor deleted', 'DELETE', `${movements}/${used}?reason=mistake`);
    await flow.expect(400, 'a revert without a reason', 'POST', `${movements}/${used}/revert`, {});
    await flow.expect(400, 'other needs a note', 'POST', `${movements}/${used}/revert`, {
      reason: 'other',
    });
    flow.expectValue('other: field', FIELDS, 'body.note');
    await flow.expect(200, 'revert the use (S8)', 'POST', `${movements}/${used}/revert`, {
      reason: 'wrong_quantity',
    });
    const revert = flow.last('.data.id');
    flow.expectValue(
      'the revert: opposite, pointing at it',
      '[.data.type, .data.quantity_change, .data.quantity_after, .data.reverts_stock_item_movement_id, .data.revert_reason] | map(tostring) | join(",")',
      `reverted,1.5,4.5,${used},wrong_quantity`,
    );
    await flow.expect(200, 'the use, reverted', 'GET', `${movements}/${used}`);
    flow.expectValue('reverted by', '.data.reverted_by_stock_item_movement_id', revert);
    await flow.expect(409, 'revert it twice', 'POST', `${movements}/${used}/revert`, {
      reason: 'mistake',
    });
    flow.expectValue('twice: why', REASON, 'already_reverted');
    await flow.expect(409, 'revert a revert', 'POST', `${movements}/${revert}/revert`, {
      reason: 'mistake',
    });
    flow.expectValue('a revert: why', REASON, 'already_reverted');
    await flow.expect(200, 'use 4 (0.5 left)', 'POST', movements, move('used', 4));
    await flow.expect(
      409,
      'reverting the opening would go below zero',
      'POST',
      `${movements}/${opening}/revert`,
      { reason: 'mistake' },
    );
    flow.expectValue('below zero: why', REASON, 'not_enough_stock');
    await flow.expect(404, 'an item not here', 'GET', `/app/stock-items/${NOWHERE_ITEM}/movements`);
  });

  it('9.C stock counts (routes 13–15)', async () => {
    flow.as('owner');
    await flow.expect(200, 'count the peel and the gauze (S9)', 'POST', '/app/stock-counts', {
      lines: [
        { stock_item_id: peel, counted_quantity: 2 },
        { stock_item_id: gauze, counted_quantity: 0 },
      ],
    });
    count = flow.last('.data.id');
    flow.expectValue(
      'the count: lines, system quantities, one changed',
      `[(.data.id | startswith("scnt_")), (.data.lines | length), .data.changed_item_count, ([.data.lines[] | select(.stock_item_id == "${peel}") | .system_quantity, .counted_quantity, .difference] | map(tostring) | join("/")), (.data.author_membership_id != null)] | map(tostring) | join(",")`,
      'true,2,1,0.5/2/1.5,true',
    );
    await flow.expect(200, 'the peel after the count', 'GET', `/app/stock-items/${peel}`);
    flow.expectValue('counted to 2', '.data.quantity', 2);
    await flow.expect(
      200,
      'its newest movement',
      'GET',
      `/app/stock-items/${peel}/movements?limit=1`,
    );
    flow.expectValue(
      'an adjust for the count, noted',
      '[.data[0].type, .data[0].quantity_change, .data[0].stock_count_id, .data[0].note] | map(tostring) | join(",")',
      `adjust,1.5,${count},Stock check`,
    );
    await flow.expect(400, 'a count where nothing differs', 'POST', '/app/stock-counts', {
      lines: [{ stock_item_id: peel, counted_quantity: 2 }],
    });
    flow.expectValue('nothing differs: field', FIELDS, 'lines');
    await flow.expect(400, 'an unknown item', 'POST', '/app/stock-counts', {
      lines: [{ stock_item_id: NOWHERE_ITEM, counted_quantity: 1 }],
    });
    flow.expectValue('unknown item: field', FIELDS, 'lines');
    await flow.expect(400, 'an item twice', 'POST', '/app/stock-counts', {
      lines: [
        { stock_item_id: peel, counted_quantity: 1 },
        { stock_item_id: peel, counted_quantity: 3 },
      ],
    });
    flow.expectValue('twice: field', FIELDS, 'body.lines');
    await flow.expect(400, 'no lines', 'POST', '/app/stock-counts', { lines: [] });
    flow.expectValue('empty: field', FIELDS, 'body.lines');
    await flow.expect(400, 'a negative count', 'POST', '/app/stock-counts', {
      lines: [{ stock_item_id: peel, counted_quantity: -1 }],
    });
    await flow.expect(200, 'past stock checks', 'GET', '/app/stock-counts?limit=1');
    flow.expectValue('the newest is this one', '.data[0].id', count);
    await flow.expect(200, 'get the count', 'GET', `/app/stock-counts/${count}`);
    await flow.expect(
      404,
      'a count is never deleted',
      'DELETE',
      `/app/stock-counts/${count}?reason=mistake`,
    );
    await flow.expect(404, 'nor changed', 'PATCH', `/app/stock-counts/${count}`, { lines: [] });
    await flow.expect(
      404,
      'a count not here',
      'GET',
      '/app/stock-counts/scnt_000000000000000000000',
    );
  });

  it('9.D stock purchases (routes 16–22)', async () => {
    flow.as('owner');
    /** A purchase body of one gauze line. */
    const gauzeLine = (extra: Record<string, unknown> = {}) => ({
      stock_vendor_id: vendor,
      items: [{ stock_item_id: gauze, quantity: 1, rate: 10 }],
      ...extra,
    });
    await flow.expect(
      200,
      'a purchase: gauze and a new item (S10)',
      'POST',
      '/app/stock-purchases',
      {
        stock_vendor_id: vendor,
        bill_number: `B-${S}`,
        items: [
          { stock_item_id: gauze, quantity: 10, rate: 12.5 },
          { new_item: { name: `Cotton ${S}`, unit: 'roll' }, quantity: 3, rate: 40 },
        ],
      },
    );
    firstPurchase = flow.last('.data.id');
    cotton = flow.last('.data.items[1].stock_item_id');
    flow.expectValue(
      'the bill from the lines, unpaid',
      '[(.data.id | startswith("spur_")), (.data.items | length), .data.items[0].amount, .data.items[1].amount, .data.bill_amount, .data.paid_amount, .data.due_amount, .data.payment_status, (.data.payment_ids | length)] | map(tostring) | join(",")',
      'true,2,125,120,245,0,245,unpaid,0',
    );
    await flow.expect(200, 'the gauze received', 'GET', `/app/stock-items/${gauze}`);
    flow.expectValue(
      '10 in, the latest rate',
      '[.data.quantity, .data.last_rate, .data.stock_level] | map(tostring) | join(",")',
      '10,12.5,ok',
    );
    await flow.expect(200, 'the new item', 'GET', `/app/stock-items/${cotton}`);
    flow.expectValue(
      'added as typed, 3 rolls',
      '[.data.unit, .data.quantity, .data.last_rate] | map(tostring) | join(",")',
      'roll,3,40',
    );
    await flow.expect(
      200,
      "the gauze's receipt",
      'GET',
      `/app/stock-items/${gauze}/movements?type=received`,
    );
    flow.expectValue('points at the purchase', '.data[0].stock_purchase_id', firstPurchase);
    await flow.expect(200, 'a purchase paid in part (S11)', 'POST', '/app/stock-purchases', {
      stock_vendor_id: vendor,
      items: [{ stock_item_id: gauze, quantity: 4, rate: 50 }],
      payment: { branch_id: vesu, splits: [{ mode: 'cash', amount: 100 }], reference: 'Counter' },
    });
    secondPurchase = flow.last('.data.id');
    flow.expectValue(
      'paid in part',
      '[.data.bill_amount, .data.paid_amount, .data.due_amount, .data.payment_status, (.data.payment_ids | length)] | map(tostring) | join(",")',
      '200,100,100,partial,1',
    );
    const secondPurchasePayment = flow.last('.data.payment_ids[0]');
    await flow.expect(
      200,
      'the supplier bill it recorded',
      'GET',
      `/app/payments/${secondPurchasePayment}`,
    );
    flow.expectValue(
      'paid to the vendor, pointing at the purchase',
      '[.data.kind, .data.direction, .data.amount, .data.stock_purchase_id, .data.payee_name, .data.reference] | map(tostring) | join(",")',
      `supplier_bill,paid,100,${secondPurchase},Skin Supplies ${S},Counter`,
    );
    await flow.expect(
      409,
      'Paid above the bill',
      'POST',
      '/app/stock-purchases',
      gauzeLine({ payment: { branch_id: vesu, splits: [{ mode: 'upi', amount: 50 }] } }),
    );
    flow.expectValue('above the bill: why', REASON, 'more_than_due');
    await flow.expect(
      400,
      'Paid from a branch not here',
      'POST',
      '/app/stock-purchases',
      gauzeLine({
        payment: { branch_id: 'brn_000000000000000000000', splits: [{ mode: 'upi', amount: 5 }] },
      }),
    );
    flow.expectValue('branch: field', FIELDS, 'payment.branch_id');
    await flow.expect(400, 'an unknown item', 'POST', '/app/stock-purchases', {
      stock_vendor_id: vendor,
      items: [{ stock_item_id: NOWHERE_ITEM, quantity: 1, rate: 10 }],
    });
    flow.expectValue('unknown item: field', FIELDS, 'items');
    await flow.expect(400, 'an item and a new item on one line', 'POST', '/app/stock-purchases', {
      stock_vendor_id: vendor,
      items: [{ stock_item_id: gauze, new_item: { name: 'X' }, quantity: 1, rate: 10 }],
    });
    flow.expectValue('both: field', FIELDS, 'body.items/0');
    await flow.expect(400, 'a quantity of 0', 'POST', '/app/stock-purchases', {
      stock_vendor_id: vendor,
      items: [{ stock_item_id: gauze, quantity: 0, rate: 10 }],
    });
    flow.expectValue('0: field', FIELDS, 'body.items/0/quantity');
    await flow.expect(400, 'no lines', 'POST', '/app/stock-purchases', {
      stock_vendor_id: vendor,
      items: [],
    });
    flow.expectValue('empty: field', FIELDS, 'body.items');
    await flow.expect(
      400,
      'a purchase dated tomorrow',
      'POST',
      '/app/stock-purchases',
      gauzeLine({ purchase_date: tomorrow }),
    );
    flow.expectValue('tomorrow: field', FIELDS, 'purchase_date');
    await flow.expect(400, 'an unknown vendor', 'POST', '/app/stock-purchases', {
      stock_vendor_id: NOWHERE_VENDOR,
      items: [{ stock_item_id: gauze, quantity: 1, rate: 10 }],
    });
    flow.expectValue('unknown vendor: field', FIELDS, 'stock_vendor_id');
    await flow.expect(
      409,
      'the lines are fixed (S10)',
      'PATCH',
      `/app/stock-purchases/${firstPurchase}`,
      { items: [] },
    );
    flow.expectValue('fixed: why', REASON, 'purchase_received');
    await flow.expect(
      400,
      'a bill under what is paid',
      'PATCH',
      `/app/stock-purchases/${secondPurchase}`,
      { bill_amount: 50 },
    );
    flow.expectValue('under paid: field', FIELDS, 'bill_amount');
    await flow.expect(200, 'a bill of 250', 'PATCH', `/app/stock-purchases/${firstPurchase}`, {
      bill_amount: 250,
      bill_number: null,
    });
    flow.expectValue(
      'the bill and its due',
      '[.data.bill_amount, .data.due_amount, .data.bill_number, (.data.items | length)] | map(tostring) | join(",")',
      '250,250,null,2',
    );
    await flow.expect(
      200,
      "the vendor's purchases",
      'GET',
      `/app/stock-purchases?stock_vendor_id=${vendor}`,
    );
    flow.expectValue(
      "newest first, the footer's due",
      '[([.data[].id] | join("/")), .meta.due_total] | map(tostring) | join(",")',
      `${secondPurchase}/${firstPurchase},350`,
    );
    const firstPurchaseNumber = flow.last('.data[1].stock_purchase_number');
    await flow.expect(
      200,
      "by the vendor's name",
      'GET',
      `/app/stock-purchases?q=Skin%20Supplies%20${S}`,
    );
    flow.expectValue('both', '.data | length', 2);
    await flow.expect(
      200,
      'by the number',
      'GET',
      `/app/stock-purchases?q=%23${firstPurchaseNumber}`,
    );
    flow.expectValue(
      'the number finds it',
      `[.data[].id | select(. == "${firstPurchase}")] | length`,
      1,
    );
    await flow.expect(
      200,
      'partly paid',
      'GET',
      `/app/stock-purchases?stock_vendor_id=${vendor}&payment_status=partial`,
    );
    flow.expectValue(
      'partial: the second, due 100',
      '[([.data[].id] | join("/")), .meta.due_total] | map(tostring) | join(",")',
      `${secondPurchase},100`,
    );
    await flow.expect(
      200,
      'most due first',
      'GET',
      `/app/stock-purchases?stock_vendor_id=${vendor}&sort=due_amount&order=desc`,
    );
    flow.expectValue('the first purchase', '.data[0].id', firstPurchase);
    await flow.expect(
      200,
      "today's purchases",
      'GET',
      `/app/stock-purchases?stock_vendor_id=${vendor}&purchase_date_from=${today}&purchase_date_to=${today}`,
    );
    flow.expectValue('both today', '.data | length', 2);
    await flow.expect(
      200,
      'the purchases CSV',
      'GET',
      `/app/stock-purchases/exports?stock_vendor_id=${vendor}`,
    );
    flow.expectValue(
      'CSV: name, rows',
      '[(.data.file_name | startswith("stock-purchases-")), .data.row_count] | map(tostring) | join(",")',
      'true,2',
    );
    await flow.expect(200, 'the vendor owes', 'GET', `/app/stock-vendors/${vendor}`);
    flow.expectValue('payable: the open dues', '.data.payable', 350);
    await flow.expect(400, 'a receipt cannot pay a purchase', 'POST', '/app/payments', {
      kind: 'receipt',
      branch_id: vesu,
      contact_id: meera,
      splits: [{ mode: 'cash', amount: 10 }],
      stock_purchase_id: firstPurchase,
    });
    flow.expectValue('receipt: field', FIELDS, 'stock_purchase_id');
    await flow.expect(409, 'a supplier bill over the due', 'POST', '/app/payments', {
      kind: 'supplier_bill',
      branch_id: vesu,
      payee_name: 'Skin Supplies',
      splits: [{ mode: 'cash', amount: 150 }],
      stock_purchase_id: secondPurchase,
    });
    flow.expectValue('over the due: why', REASON, 'more_than_due');
    await flow.expect(200, 'pay the first purchase in full', 'POST', '/app/payments', {
      kind: 'supplier_bill',
      branch_id: vesu,
      payee_name: 'Skin Supplies',
      splits: [{ mode: 'upi', amount: 250 }],
      stock_purchase_id: firstPurchase,
    });
    firstPurchasePayment = flow.last('.data.id');
    await flow.expect(
      200,
      'the first purchase, paid',
      'GET',
      `/app/stock-purchases/${firstPurchase}`,
    );
    flow.expectValue(
      'paid in full',
      '[.data.paid_amount, .data.due_amount, .data.payment_status, (.data.payment_ids | join(","))] | map(tostring) | join(",")',
      `250,0,paid,${firstPurchasePayment}`,
    );
    await flow.expect(
      200,
      'pay 200 of it instead (B20)',
      'PATCH',
      `/app/payments/${firstPurchasePayment}`,
      { splits: [{ mode: 'upi', amount: 200 }] },
    );
    await flow.expect(200, 'the purchase follows', 'GET', `/app/stock-purchases/${firstPurchase}`);
    flow.expectValue(
      'paid 200, partial',
      '[.data.paid_amount, .data.payment_status] | map(tostring) | join(",")',
      '200,partial',
    );
    await flow.expect(
      409,
      'delete a paid purchase (S12)',
      'DELETE',
      `/app/stock-purchases/${firstPurchase}?reason=mistake`,
    );
    flow.expectValue('paid: why', REASON, 'purchase_paid');
    await flow.expect(
      204,
      'delete its payment (open day)',
      'DELETE',
      `/app/payments/${firstPurchasePayment}?reason=mistake`,
    );
    await flow.expect(200, 'nothing paid again', 'GET', `/app/stock-purchases/${firstPurchase}`);
    flow.expectValue(
      'unpaid',
      '[.data.paid_amount, .data.payment_status, (.data.payment_ids | length)] | map(tostring) | join(",")',
      '0,unpaid,0',
    );
    await flow.expect(
      200,
      'use 1 of the cotton',
      'POST',
      `/app/stock-items/${cotton}/movements`,
      move('used', 1),
    );
    await flow.expect(
      409,
      'delete it after some was used',
      'DELETE',
      `/app/stock-purchases/${firstPurchase}?reason=duplicate`,
    );
    flow.expectValue('used since: why', REASON, 'not_enough_stock');
    await flow.expect(
      200,
      'receive 1 more by hand',
      'POST',
      `/app/stock-items/${cotton}/movements`,
      move('received', 1),
    );
    await flow.expect(
      204,
      'delete the first purchase',
      'DELETE',
      `/app/stock-purchases/${firstPurchase}?reason=duplicate`,
    );
    await flow.expect(200, 'its stock taken back', 'GET', `/app/stock-items/${gauze}`);
    flow.expectValue('gauze: 14 − 10', '.data.quantity', 4);
    await flow.expect(200, 'the cotton too', 'GET', `/app/stock-items/${cotton}`);
    flow.expectValue('cotton: 3 − 1 + 1 − 3', '.data.quantity', 0);
    await flow.expect(
      200,
      "the gauze's reverts",
      'GET',
      `/app/stock-items/${gauze}/movements?type=reverted`,
    );
    flow.expectValue(
      'a revert of the receipt, for the purchase',
      '[.data[0].quantity_change, .data[0].stock_purchase_id, .data[0].revert_reason] | map(tostring) | join(",")',
      `-10,${firstPurchase},other`,
    );
    await flow.expect(404, 'the deleted purchase', 'GET', `/app/stock-purchases/${firstPurchase}`);
    await flow.expect(
      200,
      'restore it — received again',
      'POST',
      `/app/stock-purchases/${firstPurchase}/restore`,
    );
    await flow.expect(200, 'the gauze back', 'GET', `/app/stock-items/${gauze}`);
    flow.expectValue('gauze: 14', '.data.quantity', 14);
    await flow.expect(
      409,
      'restore a live one',
      'POST',
      `/app/stock-purchases/${firstPurchase}/restore`,
    );
    flow.expectValue('live: why', REASON, 'record_not_deleted');
    await flow.expect(
      404,
      'a purchase not here',
      'GET',
      '/app/stock-purchases/spur_000000000000000000000',
    );
  });

  it('9.E stock vendors — delete with dues and restore (routes 27–28)', async () => {
    flow.as('owner');
    await flow.expect(
      409,
      'delete a vendor who is owed (S13)',
      'DELETE',
      `/app/stock-vendors/${vendor}?reason=mistake`,
    );
    flow.expectValue('dues: why', REASON, 'vendor_has_dues');
    await flow.expect(
      204,
      'delete the inline vendor',
      'DELETE',
      `/app/stock-vendors/${quickVendor}?reason=duplicate`,
    );
    await flow.expect(404, 'gone', 'GET', `/app/stock-vendors/${quickVendor}`);
    await flow.expect(200, 'restore it', 'POST', `/app/stock-vendors/${quickVendor}/restore`);
    await flow.expect(409, 'restore it again', 'POST', `/app/stock-vendors/${quickVendor}/restore`);
    flow.expectValue('live: why', REASON, 'record_not_deleted');
    await flow.expect(
      204,
      'delete it once more',
      'DELETE',
      `/app/stock-vendors/${quickVendor}?reason=not_needed`,
    );
    await flow.expect(200, 'its name taken meanwhile', 'POST', '/app/stock-vendors', {
      name: `Quick vendor ${S}`,
    });
    await flow.expect(
      409,
      'restore over the reused name',
      'POST',
      `/app/stock-vendors/${quickVendor}/restore`,
    );
    flow.expectValue('reused: why', REASON, 'record_restore_conflict');
  });

  it('9.A stock items — delete at zero and restore (routes 6–7)', async () => {
    flow.as('owner');
    await flow.expect(400, 'a delete without a reason', 'DELETE', `/app/stock-items/${cotton}`);
    await flow.expect(
      200,
      'write the cotton off',
      'POST',
      `/app/stock-items/${cotton}/movements`,
      move('damaged', 3, { note: 'Wet' }),
    );
    await flow.expect(
      204,
      'delete the cotton at zero',
      'DELETE',
      `/app/stock-items/${cotton}?reason=not_needed`,
    );
    await flow.expect(404, 'gone', 'GET', `/app/stock-items/${cotton}`);
    await flow.expect(200, 'restore it', 'POST', `/app/stock-items/${cotton}/restore`);
    await flow.expect(409, 'restore it again', 'POST', `/app/stock-items/${cotton}/restore`);
    flow.expectValue('live: why', REASON, 'record_not_deleted');
    await flow.expect(
      204,
      'delete it once more',
      'DELETE',
      `/app/stock-items/${cotton}?reason=other&note=Old%20stock`,
    );
    await flow.expect(200, 'its name taken meanwhile', 'POST', '/app/stock-items', {
      name: `Cotton ${S}`,
    });
    await flow.expect(
      409,
      'restore over the reused name',
      'POST',
      `/app/stock-items/${cotton}/restore`,
    );
    flow.expectValue('reused: why', REASON, 'record_restore_conflict');
  });

  it('who may (S2)', async () => {
    flow.as('therapist');
    await flow.expect(200, 'a therapist reads the items', 'GET', `/app/stock-items?q=${S}`);
    await flow.expect(
      200,
      'a therapist uses stock',
      'POST',
      `/app/stock-items/${gauze}/movements`,
      move('used', 1),
    );
    await flow.expect(403, 'a therapist has no export', 'GET', '/app/stock-items/exports');
    await flow.expect(403, 'nor deletes', 'DELETE', `/app/stock-items/${gauze}?reason=mistake`);
    flow.as('pharmacist');
    await flow.expect(200, 'a pharmacist adds an item', 'POST', '/app/stock-items', {
      name: `Pharmacist item ${S}`,
    });
    await flow.expect(200, 'a pharmacist records a purchase', 'POST', '/app/stock-purchases', {
      stock_vendor_id: vendor,
      items: [{ stock_item_id: gauze, quantity: 1, rate: 10 }],
    });
    // The pharmacist holds payment:create since #153 (MD2); the therapist records purchases without it.
    flow.as('therapist');
    await flow.expect(
      403,
      "a therapist's purchase, but not its Paid — that is payment:create",
      'POST',
      '/app/stock-purchases',
      {
        stock_vendor_id: vendor,
        items: [{ stock_item_id: gauze, quantity: 1, rate: 10 }],
        payment: { branch_id: vesu, splits: [{ mode: 'cash', amount: 5 }] },
      },
    );
    flow.expectValue('Paid: why', REASON, 'field_permission_required');
    flow.as('pharmacist');
    await flow.expect(200, 'a pharmacist counts', 'POST', '/app/stock-counts', {
      lines: [{ stock_item_id: gauze, counted_quantity: 20 }],
    });
    flow.as('accountant');
    await flow.expect(
      200,
      'an accountant reads purchases',
      'GET',
      `/app/stock-purchases?stock_vendor_id=${vendor}`,
    );
    await flow.expect(
      200,
      'and exports them',
      'GET',
      `/app/stock-purchases/exports?stock_vendor_id=${vendor}`,
    );
    await flow.expect(200, 'and the items', 'GET', `/app/stock-items/exports?q=${S}`);
    await flow.expect(
      403,
      'but moves no stock',
      'POST',
      `/app/stock-items/${gauze}/movements`,
      move('used', 1),
    );
    await flow.expect(403, 'nor adds a vendor', 'POST', '/app/stock-vendors', {
      name: `Accountant vendor ${S}`,
    });
    flow.as('doctor');
    await flow.expect(403, 'a doctor has no stock', 'GET', '/app/stock-items');
    await flow.expect(403, 'nor its movements', 'GET', '/app/stock-item-movements');
  });
});
