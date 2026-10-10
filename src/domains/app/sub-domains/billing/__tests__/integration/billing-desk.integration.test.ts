import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/** An invoice or ledger row as the lists answer it — the fields the totals check reads. */
interface MoneyRow {
  due_amount: number;
  paid_amount: number;
}

/**
 * Billing for the desk (launch D81 (6), ROUTE #159): the best live offer billed (M26), the line a
 * `below_lowest_price` names, the bill and change previews (Q2), `q` by the person, who recorded a
 * row, the ledger's link numbers and the invoice list's due and paid totals — one flow over the
 * fixture organization, with offers of its own.
 */
describe('Billing — the desk (D81, ROUTE #159)', () => {
  const S = String(Date.now());
  const lastName = `d${S}`;
  const digits = `6${S.slice(-7)}`;
  const FIELDS = '[.error.errors[].field] | join(",")';
  const REASON = '.error.reason';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let vesu = '';
  let adajan = '';
  let today = '';
  let tomorrow = '';

  let kavya = '';
  let kavyaFile = '';
  let meera = '';
  let ravi = '';
  let facial = '';
  let pack = '';
  let peel = '';
  let tenOff = '';
  let extraTwo = '';
  let invoiceFacial = '';
  let invoiceFacialLine = '';
  let invoicePack = '';
  let invoicePaid = '';
  let invoicePaidLine = '';

  /** A contact of this run with its own number. */
  async function person(firstName: string, suffix: string): Promise<string> {
    await flow.expect(200, `contact ${firstName}`, 'POST', '/app/contacts', {
      first_name: firstName,
      last_name: lastName,
      phones: [{ phone: `+91${digits}${suffix}`, is_primary: true }],
    });
    return flow.last('.data.id');
  }

  /** A patient file for a contact; its id. */
  async function patientFile(contact: string): Promise<string> {
    await flow.expect(200, 'a patient file', 'POST', '/app/patients', {
      contact_id: contact,
      home_branch_id: vesu,
    });
    return flow.last('.data.id');
  }

  /** An offer on one offering; its id. */
  async function offer(label: string, body: Record<string, unknown>): Promise<string> {
    await flow.expect(200, `offer ${label}`, 'POST', '/app/offers', { name: label, ...body });
    return flow.last('.data.id');
  }

  /** A bill body of offering lines. */
  function bill(
    branch: string,
    contact: string | undefined,
    lines: Record<string, unknown>[],
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      branch_id: branch,
      ...(contact === undefined ? {} : { contact_id: contact }),
      items: lines.map((line) => ({ quantity: 1, ...line })),
      ...extra,
    };
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    vesu = fixture.branches.vesu;
    adajan = fixture.branches.adajan;
    today = calendarDay(fixture, 0);
    tomorrow = calendarDay(fixture, 1);

    flow.as('owner');
    kavya = await person('Kavya', '31');
    meera = await person('Meera', '32');
    ravi = await person('Ravi', '33');
    kavyaFile = await patientFile(kavya);
    await patientFile(meera);
    await flow.expect(200, 'offering Facial', 'POST', '/app/offerings', {
      name: `Desk facial ${S}`,
      category: 'treatment',
      price: 1000,
      min_price: 800,
      gst_percent: 18,
      is_gst_inclusive: false,
    });
    facial = flow.last('.data.id');
    await flow.expect(200, 'offering Glow pack', 'POST', '/app/offerings', {
      name: `Desk glow pack ${S}`,
      category: 'package',
      price: 6000,
      sessions: 6,
      validity_days: 90,
      gst_percent: 18,
      is_gst_inclusive: true,
    });
    pack = flow.last('.data.id');
    await flow.expect(200, 'offering Peel', 'POST', '/app/offerings', {
      name: `Desk peel ${S}`,
      category: 'treatment',
      price: 2000,
      offer_price: 1800,
      min_price: 1500,
      gst_percent: 0,
    });
    peel = flow.last('.data.id');
    tenOff = await offer('Ten off', { kind: 'percent', value: 10, offering_ids: [facial] });
    await offer('Adajan fixed', {
      kind: 'fixed',
      value: 850,
      offering_ids: [facial],
      branch_ids: [adajan],
    });
    await offer('Paused half', {
      kind: 'percent',
      value: 50,
      offering_ids: [facial],
      is_active: false,
    });
    await offer('Tomorrow third', {
      kind: 'percent',
      value: 30,
      offering_ids: [facial],
      starts_on: tomorrow,
    });
    extraTwo = await offer('Two free', { kind: 'extra', value: 2, offering_ids: [pack] });
    await offer('Peel 500 off', { kind: 'amount', value: 500, offering_ids: [peel] });
  });

  afterAll(async () => {
    await app.close();
  });

  it('bills the best live offer at the branch, never below the lowest price (M26)', async () => {
    flow.as('front_desk');
    await flow.expect(
      200,
      'a facial at Vesu',
      'POST',
      '/app/invoices',
      bill(vesu, kavya, [{ offering_id: facial }]),
    );
    invoiceFacial = flow.last('.data.id');
    invoiceFacialLine = flow.last('.data.items[0].id');
    flow.expectValue(
      'ten off at Vesu — not the paused, tomorrow or Adajan-only offers',
      '[.data.items[0].rate, .data.items[0].amount, .data.total] | map(tostring) | join(",")',
      '900,1062,1062',
    );
    flow.expectValue(
      'who billed it (D81)',
      '.data.created_by_membership_id',
      fixture.members.front_desk.membershipPublicId,
    );
    await flow.expect(
      200,
      'a glow pack',
      'POST',
      '/app/invoices',
      bill(vesu, kavya, [{ offering_id: pack }]),
    );
    invoicePack = flow.last('.data.id');
    flow.expectValue('no price offer: the list price', '.data.items[0].rate', 6000);
    await flow.expect(
      200,
      "Kavya's pack",
      'GET',
      `/app/patients/${kavyaFile}/offerings?offering_id=${pack}`,
    );
    flow.expectValue('six sessions and two free', '.data[0].sessions_total', 8);
    await flow.expect(
      200,
      'a peel',
      'POST',
      '/app/invoices',
      bill(vesu, meera, [{ offering_id: peel }]),
    );
    flow.expectValue('₹500 off the offer price, raised to the lowest', '.data.items[0].rate', 1500);

    flow.as('owner');
    await flow.expect(
      200,
      'a facial at Adajan',
      'POST',
      '/app/invoices',
      bill(adajan, kavya, [{ offering_id: facial }]),
    );
    flow.expectValue('the Adajan fixed price wins there', '.data.items[0].rate', 850);
    await flow.expect(200, 'a discount on the pack', 'PATCH', `/app/invoices/${invoicePack}`, {
      overall_discount: 100,
    });
    await flow.expect(
      200,
      "Kavya's pack again",
      'GET',
      `/app/patients/${kavyaFile}/offerings?offering_id=${pack}`,
    );
    flow.expectValue('a kept line keeps its free sessions (B12)', '.data[0].sessions_total', 8);
    await flow.expect(200, 'pause ten off', 'PATCH', `/app/offers/${tenOff}`, {
      is_active: false,
    });
    await flow.expect(200, 'two facials', 'PATCH', `/app/invoices/${invoiceFacial}`, {
      items: [{ id: invoiceFacialLine, quantity: 2 }],
    });
    flow.expectValue(
      'a kept line keeps its rate once the offer is paused',
      '[.data.items[0].rate, .data.total] | map(tostring) | join(",")',
      '900,2124',
    );
    await flow.expect(200, 'resume ten off', 'PATCH', `/app/offers/${tenOff}`, {
      is_active: true,
    });
  });

  it('names the line under its lowest price (D81, PAY-M1)', async () => {
    flow.as('front_desk');
    await flow.expect(
      400,
      'the second line below its lowest price',
      'POST',
      '/app/invoices',
      bill(vesu, kavya, [{ offering_id: facial }, { offering_id: facial, discount_percent: 20 }]),
    );
    flow.expectValue('below: why', REASON, 'below_lowest_price');
    flow.expectValue('below: the line', FIELDS, 'items/1');
    // The floor is a guarded figure: the front desk (no offering:lower_price:read) is told the
    // line is below it, never what it is; the owner is told the figure.
    flow.expectValue(
      'below: no figure without the code',
      '.error.errors[0].message | test("lowest price of")',
      'false',
    );
    flow.as('owner');
    await flow.expect(
      400,
      'the owner sends the same bill',
      'POST',
      '/app/invoices',
      bill(vesu, kavya, [{ offering_id: facial }, { offering_id: facial, discount_percent: 20 }]),
    );
    flow.expectValue(
      'below: the figure for a holder of the code',
      '.error.errors[0].message | test("lowest price of [0-9]")',
      'true',
    );
  });

  it('previews a bill — the lines and totals POST would write, nothing written (Q2)', async () => {
    flow.as('front_desk');
    await flow.expect(200, "Meera's bills before", 'GET', `/app/invoices?contact_id=${meera}`);
    const before = flow.last('.meta.pagination.estimated_total');
    await flow.expect(
      200,
      'a preview before the patient is picked, with no idempotency key',
      'POST',
      '/app/invoices/preview',
      bill(vesu, undefined, [{ offering_id: facial }, { offering_id: pack }]),
      { idempotencyKey: false },
    );
    flow.expectValue(
      'the defaults it would set',
      '[.data.type, .data.invoice_date] | join(",")',
      `clinic,${today}`,
    );
    flow.expectValue(
      'the facial: new, ten off',
      '[(.data.items[0].id == null), .data.items[0].rate, (.data.items[0].offer_ids | join("|")), .data.items[0].sessions_total] | map(tostring) | join(",")',
      `true,900,${tenOff},1`,
    );
    flow.expectValue(
      'the pack: eight sessions, the extra offer',
      '[.data.items[1].sessions_total, (.data.items[1].offer_ids | join("|"))] | map(tostring) | join(",")',
      `8,${extraTwo}`,
    );
    flow.expectValue(
      'the totals',
      '[.data.subtotal, .data.total, .data.paid_amount, .data.due_amount] | map(tostring) | join(",")',
      '6900,7062,0,7062',
    );

    const draft = bill(vesu, meera, [{ offering_id: facial, discount_percent: 5 }], {
      overall_discount: 20,
    });
    await flow.expect(200, "a preview of Meera's bill", 'POST', '/app/invoices/preview', draft);
    const previewed = flow.last(
      '[.data.items[0].rate, .data.items[0].discount_amount, .data.items[0].amount, .data.discount_total, .data.gst_total, .data.total] | map(tostring) | join(",")',
    );
    await flow.expect(200, "Meera's bills after", 'GET', `/app/invoices?contact_id=${meera}`);
    flow.expectValue('nothing written', '.meta.pagination.estimated_total', before);
    await flow.expect(200, 'the same bill, saved', 'POST', '/app/invoices', draft);
    flow.expectEqual(
      'the bill comes to what the preview said',
      flow.last(
        '[.data.items[0].rate, .data.items[0].discount_amount, .data.items[0].amount, .data.discount_total, .data.gst_total, .data.total] | map(tostring) | join(",")',
      ),
      previewed,
    );

    await flow.expect(
      400,
      'a contact with no patient file',
      'POST',
      '/app/invoices/preview',
      bill(vesu, ravi, [{ offering_id: facial }]),
    );
    flow.expectValue('no file: why', REASON, 'patient_file_required');
    await flow.expect(
      400,
      'below the lowest price',
      'POST',
      '/app/invoices/preview',
      bill(vesu, undefined, [{ offering_id: facial, discount_percent: 30 }]),
    );
    flow.expectValue('preview below: the line', FIELDS, 'items/0');
    await flow.expect(
      400,
      'no "Paid now" on a preview',
      'POST',
      '/app/invoices/preview',
      bill(vesu, kavya, [{ offering_id: facial }], {
        payment: { splits: [{ mode: 'cash', amount: 10 }] },
      }),
    );
    flow.expectValue('payment: field', FIELDS, 'body.payment');
    await flow.expect(
      400,
      'a branch that is not hers',
      'POST',
      '/app/invoices/preview',
      bill(adajan, undefined, [{ offering_id: facial }]),
    );
    flow.expectValue('branch: field', FIELDS, 'branch_id');
    flow.as('doctor');
    await flow.expect(
      403,
      'a doctor does not bill',
      'POST',
      '/app/invoices/preview',
      bill(vesu, undefined, [{ offering_id: facial }]),
    );
  });

  it('previews a change — what PATCH would write, nothing written (D81)', async () => {
    flow.as('owner');
    await flow.expect(
      200,
      'a facial paid in part',
      'POST',
      '/app/invoices',
      bill(vesu, kavya, [{ offering_id: facial }], {
        payment: { splits: [{ mode: 'cash', amount: 1000 }] },
      }),
    );
    invoicePaid = flow.last('.data.id');
    invoicePaidLine = flow.last('.data.items[0].id');

    flow.as('front_desk');
    await flow.expect(
      200,
      'the stored lines',
      'POST',
      `/app/invoices/${invoicePaid}/preview`,
      {},
      { idempotencyKey: false },
    );
    flow.expectValue(
      'as stored',
      '[.data.items[0].id, .data.total, .data.paid_amount, .data.due_amount] | map(tostring) | join(",")',
      `${invoicePaidLine},1062,1000,62`,
    );
    await flow.expect(200, 'two on the line', 'POST', `/app/invoices/${invoicePaid}/preview`, {
      items: [{ id: invoicePaidLine, quantity: 2 }],
    });
    flow.expectValue(
      'the kept rate, twice',
      '[.data.items[0].rate, (.data.items[0].offer_ids | length), .data.total, .data.due_amount] | map(tostring) | join(",")',
      '900,0,2124,1124',
    );
    await flow.expect(200, 'the invoice', 'GET', `/app/invoices/${invoicePaid}`);
    flow.expectValue(
      'nothing written',
      '[.data.total, (.data.items | length)] | map(tostring) | join(",")',
      '1062,1',
    );
    await flow.expect(409, 'under what is paid', 'POST', `/app/invoices/${invoicePaid}/preview`, {
      overall_discount: 100,
    });
    flow.expectValue('below paid: why', REASON, 'below_paid');
    await flow.expect(
      400,
      'the line under its lowest price',
      'POST',
      `/app/invoices/${invoicePaid}/preview`,
      { items: [{ id: invoicePaidLine, quantity: 1, discount_percent: 30 }] },
    );
    flow.expectValue('change below: the line', FIELDS, 'items/0');
    await flow.expect(
      404,
      'an invoice that is not here',
      'POST',
      '/app/invoices/invc_000000000000000000000/preview',
      {},
    );
    flow.as('doctor');
    await flow.expect(
      403,
      'a doctor does not change bills',
      'POST',
      `/app/invoices/${invoicePaid}/preview`,
      {},
    );
  });

  it('finds the person with q on invoices, payments and pending credits (D81, G-P1)', async () => {
    flow.as('owner');
    await flow.expect(200, 'a credit for Kavya', 'POST', '/app/pending-credits', {
      direction: 'give',
      amount: 50,
      reason: 'Charged twice',
      contact_id: kavya,
      invoice_id: invoicePaid,
    });
    await flow.expect(200, 'a credit for a typed party', 'POST', '/app/pending-credits', {
      direction: 'take',
      amount: 20,
      reason: 'Lent a tray',
      party_name: `Kavya Traders ${S}`,
    });

    await flow.expect(200, 'invoices by her name', 'GET', '/app/invoices?q=kavya');
    flow.expectValue(
      'only hers, every one',
      `[(.data | length >= 4), (.data | all(.contact.id == "${kavya}"))] | map(tostring) | join(",")`,
      'true,true',
    );
    await flow.expect(200, 'invoices by her phone', 'GET', `/app/invoices?q=${digits}31`);
    flow.expectValue(
      'the phone finds hers',
      `[(.data | length >= 4), (.data | all(.contact.id == "${kavya}"))] | map(tostring) | join(",")`,
      'true,true',
    );
    await flow.expect(200, 'payments by her name', 'GET', '/app/payments?q=Kavya');
    flow.expectValue(
      'her receipt',
      `[(.data | length >= 1), (.data | all(.contact.id == "${kavya}"))] | map(tostring) | join(",")`,
      'true,true',
    );
    await flow.expect(200, 'credits by her name', 'GET', '/app/pending-credits?q=Kavya');
    flow.expectValue(
      'her credit, and the typed party still by its name',
      `[([.data[] | select(.contact.id == "${kavya}")] | length), ([.data[] | select(.party_name != null)] | length)] | map(tostring) | join(",")`,
      '1,1',
    );
    await flow.expect(200, 'credits by the other name', 'GET', '/app/pending-credits?q=Meera');
    flow.expectValue('none for Meera', '.data | length', 0);
  });

  it('serves who recorded each row and the numbers of what a ledger row points at (D81, G-P2, G-P3)', async () => {
    flow.as('front_desk');
    await flow.expect(200, 'a receipt on the facial', 'POST', '/app/payments', {
      kind: 'receipt',
      branch_id: vesu,
      contact_id: kavya,
      invoice_id: invoiceFacial,
      splits: [{ mode: 'upi', amount: 100 }],
    });
    const receipt = flow.last('.data.id');
    flow.expectValue(
      'by the front desk',
      '.data.created_by_membership_id',
      fixture.members.front_desk.membershipPublicId,
    );
    await flow.expect(200, 'the facial bill', 'GET', `/app/invoices/${invoiceFacial}`);
    const facialNumbers = flow.last(
      '[.data.invoice_sequence, .data.invoice_number, .data.type, .data.due_amount] | map(tostring) | join(",")',
    );
    await flow.expect(
      200,
      'the receipt in the ledger',
      'GET',
      `/app/payments?invoice_id=${invoiceFacial}`,
    );
    flow.expectEqual(
      'the invoice it pays: its numbers, type and due',
      flow.last(
        '.data[0] | [.invoice.invoice_sequence, .invoice.invoice_number, .invoice.type, .invoice.due_amount] | map(tostring) | join(",")',
      ),
      facialNumbers,
    );
    flow.expectValue(
      'no other link',
      '.data[0] | [.invoice_credit_note_number, .pending_credit_number, .stock_purchase, .medical_purchase_order] | map(tostring) | join(",")',
      'null,null,null,null',
    );
    flow.expectValue('the receipt is the row', '.data[0].id', receipt);

    flow.as('owner');
    await flow.expect(200, "Kavya's credit", 'GET', `/app/pending-credits?contact_id=${kavya}`);
    const credit = flow.last('.data[0].id');
    const creditNumber = flow.last('.data[0].pending_credit_number');
    flow.expectValue(
      'recorded by the owner',
      '.data[0].created_by_membership_id',
      fixture.members.owner.membershipPublicId,
    );
    await flow.expect(200, 'give it back', 'POST', `/app/pending-credits/${credit}/settle`, {
      amount: 50,
      method: 'money',
      branch_id: vesu,
      splits: [{ mode: 'cash', amount: 50 }],
    });
    const refund = flow.last('.data.payment_ids[0]');
    await flow.expect(200, 'its credit note', 'GET', `/app/invoices/${invoicePaid}/credit-notes`);
    const creditNoteNumber = flow.last('.data[0].credit_note_number');
    await flow.expect(200, 'the refund', 'GET', `/app/payments/${refund}`);
    flow.expectValue(
      'the refund names its credit note, credit and invoice',
      '[.data.invoice_credit_note_number, .data.pending_credit_number, (.data.invoice.invoice_sequence != null)] | map(tostring) | join(",")',
      `${creditNoteNumber},${creditNumber},true`,
    );

    await flow.expect(200, 'a vendor', 'POST', '/app/stock-vendors', { name: `Desk vendor ${S}` });
    const vendor = flow.last('.data.id');
    await flow.expect(200, 'a purchase paid in part', 'POST', '/app/stock-purchases', {
      stock_vendor_id: vendor,
      bill_number: `DB-${S.slice(-6)}`,
      items: [{ new_item: { name: `Desk gauze ${S}` }, quantity: 2, rate: 50 }],
      payment: { branch_id: vesu, splits: [{ mode: 'cash', amount: 40 }] },
    });
    const purchase = flow.last('.data.id');
    const purchaseNumber = flow.last('.data.stock_purchase_number');
    await flow.expect(
      200,
      'its supplier bill',
      'GET',
      `/app/payments?stock_purchase_id=${purchase}`,
    );
    flow.expectValue(
      "the purchase's number and bill number",
      '.data[0].stock_purchase | [.stock_purchase_number, .bill_number] | map(tostring) | join(",")',
      `${purchaseNumber},DB-${S.slice(-6)}`,
    );
  });

  it("sums the list's due and paid over every page (D81, G-P8)", async () => {
    flow.as('owner');
    await flow.expect(200, "Kavya's bills", 'GET', `/app/invoices?contact_id=${kavya}&limit=100`);
    const body = flow.lastBody() as unknown as {
      data: MoneyRow[];
      meta: { due_total: number; paid_total: number };
    };
    const sum = (pick: (row: MoneyRow) => number) =>
      Math.round(body.data.reduce((total, row) => total + pick(row) * 100, 0)) / 100;
    expect.soft(body.data.length, 'her bills').toBeGreaterThanOrEqual(4);
    expect.soft(body.meta.due_total, 'due over her bills').toBe(sum((row) => row.due_amount));
    expect.soft(body.meta.paid_total, 'paid over her bills').toBe(sum((row) => row.paid_amount));
    await flow.expect(200, 'one page of one', 'GET', `/app/invoices?contact_id=${kavya}&limit=1`);
    flow.expectValue(
      'the totals cover every page',
      '[.meta.due_total, .meta.paid_total] | map(tostring) | join(",")',
      `${body.meta.due_total},${body.meta.paid_total}`,
    );
  });
});
