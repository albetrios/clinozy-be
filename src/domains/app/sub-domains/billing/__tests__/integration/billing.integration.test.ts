import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorSql } from '@/tests/helpers/operator-database.js';
import {
  runGlobalRetentionWorkerJob,
  runOrganizationScopedWorkerJob,
} from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { findOrganizationsWithDaysToClose } from '@/domains/app/sub-domains/billing/day-closes/day-close-auto-close.repository.js';
import { runDayCloseAutoCloseJob } from '@/domains/app/sub-domains/billing/day-closes/workers/day-close-auto-close.processor.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/**
 * Sub-domain 8, Billing 8.A–8.E (routes-final §8, launch ROUTE #136): invoices with the server's
 * amounts, "Paid now", the patient offerings a line sells; credit notes and their refund; the
 * ledger's kinds, splits, edits, delete and reverse; pending credits settled in parts; day closes,
 * the day lock and the auto-close worker (WC-39) — one flow over the fixture organization. The day
 * closes run on a branch of their own.
 */
describe('Billing — integration (routes-final §8)', () => {
  const S = String(Date.now());
  const lastName = `v${S}`;
  const digits = `5${S.slice(-7)}`;
  const FIELDS = '[.error.errors[].field] | join(",")';
  const REASON = '.error.reason';
  /** A payment's splits as `mode:amount` joined by `+`. */
  const SPLITS = '(.data.splits | map("\\(.mode):\\(.amount)") | join("+"))';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let vesu = '';
  let owner = '';
  let today = '';
  let yesterday = '';
  let threeDaysAgo = '';
  let fourDaysAgo = '';
  let tomorrow = '';
  let longAgo = '';
  let inNinetyDays = '';

  let asha = '';
  let bina = '';
  let ravi = '';
  let ashaFile = '';
  let binaFile = '';
  let billingBranch = '';
  let facial = '';
  let pack = '';
  let consult = '';
  let adajanOnly = '';
  let invoiceAsha = '';
  let invoiceAshaLine = '';
  let invoiceAshaNumber = '';
  let invoiceBina = '';
  let invoicePackage = '';
  let invoiceConsultation = '';
  let firstReceipt = '';
  let expensePayment = '';
  let pendingCreditAsha = '';
  let recountedDay = '';

  /** A contact of this run with its own number. */
  async function person(firstName: string, suffix: string): Promise<string> {
    await flow.expect(200, `contact ${firstName}`, 'POST', '/app/contacts', {
      first_name: firstName,
      last_name: lastName,
      phones: [{ phone: `+91${digits}${suffix}`, is_primary: true }],
    });
    return flow.last('.data.id');
  }

  /** A `POST /app/payments` body. */
  function payment(
    kind: string,
    branch: string,
    splits: unknown[],
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return { kind, branch_id: branch, splits, ...extra };
  }

  /** 10:00 on `day` in the fixture's time zone (India). */
  const at = (day: string) => `${day}T10:00:00+05:30`;

  /** A bill body of one offering line. */
  function invoiceBody(
    branch: string,
    contact: string | undefined,
    offering: string,
    extra: Record<string, unknown> = {},
    line: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      branch_id: branch,
      ...(contact === undefined ? {} : { contact_id: contact }),
      items: [{ offering_id: offering, quantity: 1, ...line }],
      ...extra,
    };
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    vesu = fixture.branches.vesu;
    owner = fixture.members.owner.membershipPublicId;
    today = calendarDay(fixture, 0);
    yesterday = calendarDay(fixture, -1);
    threeDaysAgo = calendarDay(fixture, -3);
    fourDaysAgo = calendarDay(fixture, -4);
    tomorrow = calendarDay(fixture, 1);
    longAgo = calendarDay(fixture, -121);
    inNinetyDays = calendarDay(fixture, 90);

    flow.as('owner');
    asha = await person('Asha', '21');
    bina = await person('Bina', '22');
    ravi = await person('Ravi', '23');
    await flow.expect(200, "Asha's file", 'POST', '/app/patients', {
      contact_id: asha,
      home_branch_id: vesu,
    });
    ashaFile = flow.last('.data.id');
    await flow.expect(200, "Bina's file", 'POST', '/app/patients', {
      contact_id: bina,
      home_branch_id: vesu,
    });
    binaFile = flow.last('.data.id');
    await flow.expect(200, 'a branch of this run (the day closes)', 'POST', '/app/branches', {
      name: `Billing ${S}`,
      address_line_one: '12 Ring Road',
      area: 'Athwa',
      city: 'Surat',
      postal_code: '395007',
      phone: '+919876543210',
      email: `billing.${S}@fixture.example`,
    });
    billingBranch = flow.last('.data.id');
    await flow.expect(200, 'offering Facial', 'POST', '/app/offerings', {
      name: `Billing facial ${S}`,
      category: 'treatment',
      price: 1000,
      min_price: 800,
      gst_percent: 18,
      is_gst_inclusive: false,
    });
    facial = flow.last('.data.id');
    await flow.expect(200, 'offering Glow pack', 'POST', '/app/offerings', {
      name: `Billing glow pack ${S}`,
      category: 'package',
      price: 6000,
      sessions: 6,
      validity_days: 90,
      gst_percent: 18,
      is_gst_inclusive: true,
    });
    pack = flow.last('.data.id');
    await flow.expect(200, 'offering Consult', 'POST', '/app/offerings', {
      name: `Billing consult ${S}`,
      category: 'consultation',
      price: 500,
    });
    consult = flow.last('.data.id');
    await flow.expect(200, 'offering Adajan peel', 'POST', '/app/offerings', {
      name: `Billing Adajan peel ${S}`,
      category: 'treatment',
      price: 700,
      branch_ids: [fixture.branches.adajan],
    });
    adajanOnly = flow.last('.data.id');
  });

  afterAll(async () => {
    await app.close();
  });

  it('8.A invoices (routes 1–7)', async () => {
    flow.as('owner');
    await flow.expect(
      200,
      'bill Asha a facial',
      'POST',
      '/app/invoices',
      invoiceBody(vesu, asha, facial),
    );
    invoiceAsha = flow.last('.data.id');
    invoiceAshaLine = flow.last('.data.items[0].id');
    invoiceAshaNumber = flow.last('.data.invoice_number');
    flow.expectValue(
      'amounts from the server (B9)',
      '[.data.subtotal, .data.taxable_total, .data.gst_total, .data.total, .data.paid_amount, .data.due_amount, .data.payment_status] | map(tostring) | join(",")',
      '1000,1000,180,1180,0,1180,unpaid',
    );
    flow.expectValue(
      'the billed contact and file (B3)',
      '[.data.contact.id, .data.patient_id, .data.type, (.data.financial_year | test("^[0-9]{4}-[0-9]{2}$")), (.data.invoice_number | length > 0)] | map(tostring) | join(",")',
      `${asha},${ashaFile},clinic,true,true`,
    );
    flow.expectValue(
      'the line: rate, GST, the patient offering it sold (PK4)',
      '[(.data.items[0].id | startswith("iitm_")), .data.items[0].rate, .data.items[0].gst_percent, .data.items[0].amount, (.data.items[0].patient_offering_id != null)] | map(tostring) | join(",")',
      'true,1000,18,1180,true',
    );
    await flow.expect(
      200,
      'bill Bina two with discounts and Paid now (B13)',
      'POST',
      '/app/invoices',
      invoiceBody(
        vesu,
        bina,
        facial,
        { overall_discount: 100, payment: { splits: [{ mode: 'cash', amount: 500 }] } },
        { quantity: 2, discount_percent: 10 },
      ),
    );
    invoiceBina = flow.last('.data.id');
    flow.expectValue(
      'discounts, GST, paid and due',
      '[.data.subtotal, .data.discount_total, .data.taxable_total, .data.gst_total, .data.total, .data.paid_amount, .data.due_amount, .data.payment_status] | map(tostring) | join(",")',
      '2000,300,1700,306,2006,500,1506,partial',
    );
    await flow.expect(
      200,
      'bill Asha a package (inclusive GST)',
      'POST',
      '/app/invoices',
      invoiceBody(vesu, asha, pack),
    );
    invoicePackage = flow.last('.data.id');
    flow.expectValue(
      'inclusive: the price exactly',
      '[.data.taxable_total, .data.gst_total, .data.total] | map(tostring) | join(",")',
      '5084.75,915.25,6000',
    );
    await flow.expect(
      200,
      'what Asha bought',
      'GET',
      `/app/patients/${ashaFile}/offerings?offering_id=${pack}`,
    );
    flow.expectValue(
      'the package: six sessions, 90 days, its bill and line (PK4)',
      '[.data[0].sessions_total, .data[0].valid_until, .data[0].invoice_id, (.data[0].invoice_item_id | startswith("iitm_"))] | map(tostring) | join(",")',
      `6,${inNinetyDays},${invoicePackage},true`,
    );
    await flow.expect(
      200,
      'a consultation bill',
      'POST',
      '/app/invoices',
      invoiceBody(vesu, bina, consult, { type: 'consultation' }),
    );
    invoiceConsultation = flow.last('.data.id');
    flow.expectValue(
      'consultation: no GST',
      '[.data.type, .data.gst_total, .data.total] | map(tostring) | join(",")',
      'consultation,0,500',
    );
    await flow.expect(
      400,
      'a clinic bill needs a contact',
      'POST',
      '/app/invoices',
      invoiceBody(vesu, undefined, facial),
    );
    flow.expectValue('no contact: field', FIELDS, 'contact_id');
    await flow.expect(
      400,
      'a contact with no patient file (B3)',
      'POST',
      '/app/invoices',
      invoiceBody(vesu, ravi, facial),
    );
    flow.expectValue('no file: why', REASON, 'patient_file_required');
    await flow.expect(
      400,
      'an offering not at this branch',
      'POST',
      '/app/invoices',
      invoiceBody(vesu, asha, adajanOnly),
    );
    flow.expectValue('not here: field', FIELDS, 'items');
    await flow.expect(
      400,
      'a consultation bill takes consultations only',
      'POST',
      '/app/invoices',
      invoiceBody(vesu, asha, facial, { type: 'consultation' }),
    );
    await flow.expect(
      400,
      'a medical bill takes medicines only',
      'POST',
      '/app/invoices',
      invoiceBody(vesu, undefined, facial, { type: 'medical' }),
    );
    await flow.expect(
      400,
      'below the lowest price (B10)',
      'POST',
      '/app/invoices',
      invoiceBody(vesu, asha, facial, {}, { discount_percent: 30 }),
    );
    flow.expectValue('below: why', REASON, 'below_lowest_price');
    await flow.expect(
      400,
      'an overall discount over the lines',
      'POST',
      '/app/invoices',
      invoiceBody(vesu, asha, facial, { overall_discount: 5000 }),
    );
    flow.expectValue('overall discount: field', FIELDS, 'overall_discount');
    await flow.expect(
      409,
      'Paid now over the total',
      'POST',
      '/app/invoices',
      invoiceBody(vesu, asha, facial, { payment: { splits: [{ mode: 'upi', amount: 2000 }] } }),
    );
    flow.expectValue('over the total: why', REASON, 'more_than_due');
    await flow.expect(400, 'an empty bill', 'POST', '/app/invoices', {
      branch_id: vesu,
      contact_id: asha,
      items: [],
    });
    flow.expectValue('empty: field', FIELDS, 'body.items');

    await flow.expect(200, "Asha's bills", 'GET', `/app/invoices?contact_id=${asha}`);
    flow.expectValue(
      'two, newest first',
      '[.data[].id] | join(",")',
      `${invoicePackage},${invoiceAsha}`,
    );
    await flow.expect(200, 'by the number', 'GET', `/app/invoices?q=${invoiceAshaNumber}`);
    flow.expectValue(
      'the number finds it',
      `[.data[].id | select(. == "${invoiceAsha}")] | length`,
      1,
    );
    await flow.expect(
      200,
      "Bina's file's bills (patient_id)",
      'GET',
      `/app/invoices?patient_id=${binaFile}`,
    );
    flow.expectValue(
      'Bina: the Paid-now bill and the consultation',
      '[.data[].id] | join(",")',
      `${invoiceConsultation},${invoiceBina}`,
    );
    await flow.expect(
      200,
      'partly paid',
      'GET',
      `/app/invoices?contact_id=${bina}&payment_status=partial`,
    );
    flow.expectValue('partial: the Paid-now bill', '[.data[].id] | join(",")', invoiceBina);
    await flow.expect(
      200,
      'by due, highest first',
      'GET',
      `/app/invoices?contact_id=${asha}&sort=due_amount&order=desc`,
    );
    flow.expectValue('the package first', '.data[0].id', invoicePackage);
    await flow.expect(200, 'the invoices CSV', 'GET', `/app/invoices/exports?contact_id=${asha}`);
    flow.expectValue(
      'CSV: name, rows',
      '[(.data.file_name | startswith("invoices-")), .data.row_count] | map(tostring) | join(",")',
      'true,2',
    );
    await flow.expect(200, 'the print preview', 'GET', `/app/invoices/${invoiceBina}`);
    flow.expectValue(
      'preview: one line, not settled',
      '[(.data.items | length), .data.is_settled] | map(tostring) | join(",")',
      '1,false',
    );

    await flow.expect(200, 'change the remark', 'PATCH', `/app/invoices/${invoiceAsha}`, {
      remark: 'Window seat',
    });
    await flow.expect(
      200,
      'two facials on the line (B12)',
      'PATCH',
      `/app/invoices/${invoiceAsha}`,
      {
        items: [{ id: invoiceAshaLine, quantity: 2 }],
      },
    );
    flow.expectValue(
      'recomputed, the line kept',
      '[.data.total, .data.items[0].id, .data.items[0].quantity] | map(tostring) | join(",")',
      `2360,${invoiceAshaLine},2`,
    );
    await flow.expect(
      400,
      'a paid bill keeps its contact',
      'PATCH',
      `/app/invoices/${invoiceBina}`,
      {
        contact_id: asha,
      },
    );
    flow.expectValue('contact fixed: field', FIELDS, 'contact_id');
    await flow.expect(
      400,
      'the date stays in its financial year (B11)',
      'PATCH',
      `/app/invoices/${invoiceAsha}`,
      { invoice_date: '2026-03-31' },
    );
    flow.expectValue('year: field', FIELDS, 'invoice_date');
    await flow.expect(
      200,
      'a consultation paid in full',
      'POST',
      '/app/invoices',
      invoiceBody(vesu, bina, consult, {
        type: 'consultation',
        payment: { splits: [{ mode: 'upi', amount: 500 }] },
      }),
    );
    const paidConsultation = flow.last('.data.id');
    flow.expectValue(
      'paid',
      '[.data.paid_amount, .data.due_amount, .data.payment_status] | map(tostring) | join(",")',
      '500,0,paid',
    );
    await flow.expect(
      409,
      'the total under what is paid',
      'PATCH',
      `/app/invoices/${paidConsultation}`,
      { overall_discount: 100 },
    );
    flow.expectValue('below paid: why', REASON, 'below_paid');
    await flow.expect(400, 'the branch never changes', 'PATCH', `/app/invoices/${invoiceAsha}`, {
      branch_id: vesu,
    });
    await flow.expect(
      409,
      'a paid bill is never deleted (B14)',
      'DELETE',
      `/app/invoices/${invoiceBina}?reason=mistake`,
    );
    flow.expectValue('paid: why', REASON, 'invoice_paid');
    await flow.expect(
      204,
      'delete the unpaid consultation',
      'DELETE',
      `/app/invoices/${invoiceConsultation}?reason=duplicate`,
    );
    await flow.expect(404, 'gone', 'GET', `/app/invoices/${invoiceConsultation}`);
    await flow.expect(200, 'restore it', 'POST', `/app/invoices/${invoiceConsultation}/restore`);
    await flow.expect(
      409,
      'restore a live bill',
      'POST',
      `/app/invoices/${invoiceConsultation}/restore`,
    );
    flow.expectValue('live: why', REASON, 'record_not_deleted');
    await flow.expect(
      204,
      'delete the package bill',
      'DELETE',
      `/app/invoices/${invoicePackage}?reason=mistake`,
    );
    await flow.expect(
      200,
      'its patient offering goes with it',
      'GET',
      `/app/patients/${ashaFile}/offerings?offering_id=${pack}`,
    );
    flow.expectValue('none left', '.data | length', 0);
    await flow.expect(200, 'and comes back', 'POST', `/app/invoices/${invoicePackage}/restore`);
    await flow.expect(
      200,
      'the package again',
      'GET',
      `/app/patients/${ashaFile}/offerings?offering_id=${pack}`,
    );
    flow.expectValue('one', '.data | length', 1);
    flow.as('front_desk');
    await flow.expect(
      403,
      'the front desk deletes no bill (payment:delete)',
      'DELETE',
      `/app/invoices/${invoiceAsha}?reason=mistake`,
    );
    await flow.expect(200, 'the front desk bills', 'GET', `/app/invoices/${invoiceAsha}`);
    flow.as('counsellor');
    await flow.expect(
      403,
      'the counsellor exports nothing (payment:export)',
      'GET',
      '/app/invoices/exports',
    );
    flow.as('doctor');
    await flow.expect(
      200,
      "the doctor reads the file's bills (payment:read, D83 (4))",
      'GET',
      '/app/invoices',
    );
    await flow.expect(
      403,
      'but bills nothing (payment:create)',
      'POST',
      '/app/invoices',
      invoiceBody(vesu, asha, consult, { type: 'consultation' }),
    );
    flow.as('marketing');
    await flow.expect(403, 'marketing reads no bills (payment:read)', 'GET', '/app/invoices');
  });

  it('8.C payments (routes 12–20)', async () => {
    flow.as('owner');
    await flow.expect(
      200,
      "receive 300 on Asha's bill",
      'POST',
      '/app/payments',
      payment('receipt', vesu, [{ mode: 'cash', amount: 300 }], {
        contact_id: asha,
        invoice_id: invoiceAsha,
      }),
    );
    firstReceipt = flow.last('.data.id');
    flow.expectValue(
      'a receipt: received, splits, the contact (B17, B18)',
      `[(.data.id | startswith("pay_")), .data.direction, .data.amount, ${SPLITS}, .data.contact.id, .data.is_settled, .data.edit_count] | map(tostring) | join(",")`,
      `true,received,300,cash:300,${asha},false,0`,
    );
    await flow.expect(200, "the bill's paid amount moved", 'GET', `/app/invoices/${invoiceAsha}`);
    flow.expectValue(
      'paid 300 of 2360',
      '[.data.paid_amount, .data.due_amount, .data.payment_status] | map(tostring) | join(",")',
      '300,2060,partial',
    );
    await flow.expect(
      400,
      'a receipt needs its contact',
      'POST',
      '/app/payments',
      payment('receipt', vesu, [{ mode: 'cash', amount: 10 }]),
    );
    flow.expectValue('no contact: field', FIELDS, 'contact_id');
    await flow.expect(
      400,
      "a receipt from the bill's contact (B19)",
      'POST',
      '/app/payments',
      payment('receipt', vesu, [{ mode: 'cash', amount: 10 }], {
        contact_id: bina,
        invoice_id: invoiceAsha,
      }),
    );
    flow.expectValue('other contact: field', FIELDS, 'contact_id');
    await flow.expect(
      409,
      'more than the due',
      'POST',
      '/app/payments',
      payment('receipt', vesu, [{ mode: 'card', amount: 5000 }], {
        contact_id: asha,
        invoice_id: invoiceAsha,
      }),
    );
    flow.expectValue('over the due: why', REASON, 'more_than_due');
    await flow.expect(
      400,
      'an expense names who was paid',
      'POST',
      '/app/payments',
      payment('expense', vesu, [{ mode: 'upi', amount: 250 }], { expense_category: 'maintenance' }),
    );
    flow.expectValue('no payee: field', FIELDS, 'payee_name');
    await flow.expect(
      400,
      'an expense has a category',
      'POST',
      '/app/payments',
      payment('expense', vesu, [{ mode: 'upi', amount: 250 }], { payee_name: 'Raj' }),
    );
    flow.expectValue('no category: field', FIELDS, 'expense_category');
    await flow.expect(
      400,
      'only an expense has a category',
      'POST',
      '/app/payments',
      payment('money_back', vesu, [{ mode: 'cash', amount: 10 }], { expense_category: 'rent' }),
    );
    await flow.expect(
      400,
      'money back is against no bill',
      'POST',
      '/app/payments',
      payment('money_back', vesu, [{ mode: 'cash', amount: 10 }], {
        contact_id: asha,
        invoice_id: invoiceAsha,
      }),
    );
    flow.expectValue('money back: field', FIELDS, 'invoice_id');
    await flow.expect(
      400,
      'a refund has its own route (B17)',
      'POST',
      '/app/payments',
      payment('refund', vesu, [{ mode: 'cash', amount: 10 }]),
    );
    flow.expectValue('refund: field', FIELDS, 'body.kind');
    await flow.expect(
      400,
      'credit only through a pending credit',
      'POST',
      '/app/payments',
      payment('money_back', vesu, [{ mode: 'credit', amount: 10 }]),
    );
    await flow.expect(
      400,
      'a mode once',
      'POST',
      '/app/payments',
      payment('money_back', vesu, [
        { mode: 'cash', amount: 10 },
        { mode: 'cash', amount: 5 },
      ]),
    );
    await flow.expect(
      400,
      'nothing is not money',
      'POST',
      '/app/payments',
      payment('money_back', vesu, [{ mode: 'cash', amount: 0 }]),
    );
    flow.expectValue('zero: field', FIELDS, 'body.splits/0/amount');
    await flow.expect(
      200,
      'pay an expense',
      'POST',
      '/app/payments',
      payment('expense', vesu, [{ mode: 'upi', amount: 250 }], {
        payee_name: `Raj Electricals ${S}`,
        expense_category: 'maintenance',
        reference: 'UPI-1',
      }),
    );
    expensePayment = flow.last('.data.id');
    flow.expectValue(
      'an expense: paid',
      '[.data.kind, .data.direction, .data.expense_category] | join(",")',
      'expense,paid,maintenance',
    );

    await flow.expect(
      200,
      'split the receipt and raise it (B20)',
      'PATCH',
      `/app/payments/${firstReceipt}`,
      {
        splits: [
          { mode: 'cash', amount: 200 },
          { mode: 'upi', amount: 150 },
        ],
      },
    );
    flow.expectValue(
      '350, two modes, one edit',
      '[.data.amount, (.data.splits | map(.mode) | join("+")), .data.edit_count, (.data.last_edit.id | startswith("pedit_"))] | map(tostring) | join(",")',
      '350,cash+upi,1,true',
    );
    await flow.expect(200, 'the bill follows', 'GET', `/app/invoices/${invoiceAsha}`);
    flow.expectValue('paid 350', '.data.paid_amount', 350);
    await flow.expect(200, 'what changed', 'GET', `/app/payments/${firstReceipt}/edits`);
    flow.expectValue(
      'the splits, before → after, by the owner',
      '[(.data | length), (.data[0].changes.splits.from | map("\\(.mode):\\(.amount)") | join("+")), (.data[0].changes.splits.to | map("\\(.mode):\\(.amount)") | join("+")), .data[0].author_membership_id] | map(tostring) | join(",")',
      `1,cash:300,cash:200+upi:150,${owner}`,
    );
    await flow.expect(200, 'make it an advance', 'PATCH', `/app/payments/${firstReceipt}`, {
      invoice_id: null,
    });
    await flow.expect(200, 'the bill drops it', 'GET', `/app/invoices/${invoiceAsha}`);
    flow.expectValue('paid 0', '.data.paid_amount', 0);
    await flow.expect(
      200,
      'move the advance onto the bill (8.10)',
      'PATCH',
      `/app/payments/${firstReceipt}`,
      { invoice_id: invoiceAsha },
    );
    await flow.expect(
      200,
      'two changes recorded',
      'GET',
      `/app/payments/${firstReceipt}/edits?limit=1`,
    );
    flow.expectValue(
      'newest first, paged',
      '[(.data | length), .data[0].changes.invoice_id.to, .meta.pagination.has_more] | map(tostring) | join(",")',
      `1,${invoiceAsha},true`,
    );
    await flow.expect(400, 'the kind never changes', 'PATCH', `/app/payments/${firstReceipt}`, {
      kind: 'money_back',
    });
    flow.as('front_desk');
    await flow.expect(
      403,
      'the front desk deletes no payment',
      'DELETE',
      `/app/payments/${expensePayment}?reason=mistake`,
    );
    flow.as('owner');
    await flow.expect(
      204,
      'delete the expense (open day)',
      'DELETE',
      `/app/payments/${expensePayment}?reason=mistake`,
    );
    await flow.expect(200, 'restore it', 'POST', `/app/payments/${expensePayment}/restore`);
    await flow.expect(
      200,
      "Asha's receipts",
      'GET',
      `/app/payments?contact_id=${asha}&kind=receipt`,
    );
    flow.expectValue('the receipt', `[.data[].id | select(. == "${firstReceipt}")] | length`, 1);
    await flow.expect(
      200,
      'has a UPI split, today, not settled',
      'GET',
      `/app/payments?mode=upi&paid_date_from=${today}&paid_date_to=${today}&is_settled=false&contact_id=${asha}`,
    );
    flow.expectValue('the split receipt', '[.data[].id] | join(",")', firstReceipt);
    await flow.expect(200, 'by payee', 'GET', `/app/payments?q=Raj%20Electricals%20${S}`);
    flow.expectValue('the expense', '[.data[].id] | join(",")', expensePayment);
    await flow.expect(
      200,
      "Asha's file's payments (patient_id)",
      'GET',
      `/app/payments?patient_id=${ashaFile}`,
    );
    flow.expectValue("Asha's", `[.data[] | select(.contact.id != "${asha}")] | length`, 0);
    await flow.expect(200, 'the payments CSV', 'GET', `/app/payments/exports?contact_id=${asha}`);
    flow.expectValue('CSV name', '.data.file_name | startswith("payments-")', true);
    flow.as('counsellor');
    await flow.expect(403, 'the counsellor exports no payments', 'GET', '/app/payments/exports');
    flow.as('pharmacist');
    await flow.expect(
      403,
      'the pharmacist changes no payment (payment:update — the counsellor does, D83 (4))',
      'PATCH',
      `/app/payments/${firstReceipt}`,
      { note: 'x' },
    );
  });

  it('8.B credit notes (routes 8–11)', async () => {
    flow.as('owner');
    const creditNotes = `/app/invoices/${invoiceBina}/credit-notes`;
    await flow.expect(200, 'refund Bina 200 (B16)', 'POST', creditNotes, {
      amount: 200,
      reason: 'Unhappy with the result',
      splits: [{ mode: 'cash', amount: 200 }],
    });
    const creditNote = flow.last('.data.id');
    const creditNotePayment = flow.last('.data.payment_id');
    flow.expectValue(
      'a credit note with its refund',
      '[(.data.id | startswith("cn_")), (.data.credit_note_number > 0), .data.invoice_id, .data.amount, (.data.payment_id | startswith("pay_"))] | map(tostring) | join(",")',
      `true,true,${invoiceBina},200,true`,
    );
    await flow.expect(200, "the bill's paid amount fell", 'GET', `/app/invoices/${invoiceBina}`);
    flow.expectValue('paid 300', '.data.paid_amount', 300);
    await flow.expect(200, 'the refund payment', 'GET', `/app/payments/${creditNotePayment}`);
    flow.expectValue(
      'refund: paid, the credit note, the contact',
      '[.data.kind, .data.direction, .data.invoice_credit_note_id, .data.contact.id] | join(",")',
      `refund,paid,${creditNote},${bina}`,
    );
    await flow.expect(409, 'more than is paid', 'POST', creditNotes, {
      amount: 1000,
      reason: 'Too much',
      splits: [{ mode: 'cash', amount: 1000 }],
    });
    flow.expectValue('more than paid: why', REASON, 'more_than_paid');
    await flow.expect(400, "splits that don't add up", 'POST', creditNotes, {
      amount: 100,
      reason: 'x',
      splits: [{ mode: 'cash', amount: 50 }],
    });
    flow.expectValue('splits: field', FIELDS, 'body.splits');
    await flow.expect(400, 'no refund in credit', 'POST', creditNotes, {
      amount: 100,
      reason: 'x',
      splits: [{ mode: 'credit', amount: 100 }],
    });
    await flow.expect(200, "the bill's credit notes", 'GET', creditNotes);
    flow.expectValue('one', '[.data[].id] | join(",")', creditNote);
    await flow.expect(200, 'one credit note', 'GET', `${creditNotes}/${creditNote}`);
    await flow.expect(
      404,
      'under another bill',
      'GET',
      `/app/invoices/${invoiceAsha}/credit-notes/${creditNote}`,
    );
    await flow.expect(
      200,
      'every credit note, by bill',
      'GET',
      `/app/invoice-credit-notes?invoice_id=${invoiceBina}`,
    );
    flow.expectValue('by bill: one', '.data | length', 1);
    await flow.expect(
      200,
      "by the bill's contact",
      'GET',
      `/app/invoice-credit-notes?contact_id=${bina}`,
    );
    flow.expectValue("Bina's", `[.data[].id | select(. == "${creditNote}")] | length`, 1);
    await flow.expect(
      400,
      "a refund's amount is fixed",
      'PATCH',
      `/app/payments/${creditNotePayment}`,
      { splits: [{ mode: 'cash', amount: 150 }] },
    );
    flow.expectValue('fixed: field', FIELDS, 'splits');
    await flow.expect(200, 'its mode may move', 'PATCH', `/app/payments/${creditNotePayment}`, {
      splits: [{ mode: 'upi', amount: 200 }],
    });
    await flow.expect(
      400,
      'a refund keeps its contact',
      'PATCH',
      `/app/payments/${creditNotePayment}`,
      { contact_id: asha },
    );
    flow.expectValue('link fixed: field', FIELDS, 'contact_id');
    await flow.expect(
      204,
      'delete the refund (open day)',
      'DELETE',
      `/app/payments/${creditNotePayment}?reason=mistake`,
    );
    await flow.expect(404, 'its credit note goes too (B16)', 'GET', `${creditNotes}/${creditNote}`);
    await flow.expect(200, 'the money is back on the bill', 'GET', `/app/invoices/${invoiceBina}`);
    flow.expectValue('paid 500', '.data.paid_amount', 500);
    await flow.expect(
      200,
      'restore the refund',
      'POST',
      `/app/payments/${creditNotePayment}/restore`,
    );
    await flow.expect(200, 'its credit note is back', 'GET', `${creditNotes}/${creditNote}`);
    await flow.expect(
      200,
      "bill Asha at the run's branch, paid now",
      'POST',
      '/app/invoices',
      invoiceBody(billingBranch, asha, facial, {
        payment: { splits: [{ mode: 'cash', amount: 100 }] },
      }),
    );
    const branchInvoice = flow.last('.data.id');
    await flow.expect(200, 'refund there', 'POST', `/app/invoices/${branchInvoice}/credit-notes`, {
      amount: 50,
      reason: 'Part refund',
      splits: [{ mode: 'cash', amount: 50 }],
    });
    const branchCreditNote = flow.last('.data.id');
    flow.as('front_desk');
    await flow.expect(
      404,
      "another branch's bill: no credit notes (B4)",
      'GET',
      `/app/invoices/${branchInvoice}/credit-notes`,
    );
    await flow.expect(
      404,
      'nor one of them',
      'GET',
      `/app/invoices/${branchInvoice}/credit-notes/${branchCreditNote}`,
    );
    await flow.expect(
      403,
      'nor a refund on it — the front desk refunds nothing (payment:delete, D83 (1))',
      'POST',
      `/app/invoices/${branchInvoice}/credit-notes`,
      { amount: 10, reason: 'x', splits: [{ mode: 'cash', amount: 10 }] },
    );
    await flow.expect(
      200,
      "every credit note — the caller's branches",
      'GET',
      `/app/invoice-credit-notes?invoice_id=${branchInvoice}`,
    );
    flow.expectValue("the other branch's hidden", '.data | length', 0);
    const [branchReceipt] = await getOperatorSql()<{ public_id: string }[]>`
      SELECT p.public_id FROM app.payments p JOIN app.invoices i ON i.id = p.invoice_id
      WHERE i.public_id = ${branchInvoice} AND p.kind = 'receipt'
    `;
    await flow.expect(
      404,
      "another branch's payment (B4)",
      'GET',
      `/app/payments/${branchReceipt?.public_id}`,
    );
  });

  it('8.D pending credits (routes 21–27)', async () => {
    flow.as('owner');
    await flow.expect(200, 'owe Asha 500, for her bill (B23)', 'POST', '/app/pending-credits', {
      direction: 'give',
      amount: 500,
      reason: 'Advance to return',
      contact_id: asha,
      invoice_id: invoiceAsha,
      settle_by: tomorrow,
    });
    pendingCreditAsha = flow.last('.data.id');
    const pendingCreditAshaNumber = flow.last('.data.pending_credit_number');
    flow.expectValue(
      'open, nothing settled',
      '[(.data.id | startswith("pcr_")), .data.status, .data.settled_amount, .data.left_amount, .data.contact.id, .data.patient_id] | map(tostring) | join(",")',
      `true,open,0,500,${asha},${ashaFile}`,
    );
    await flow.expect(400, 'a contact or a name', 'POST', '/app/pending-credits', {
      direction: 'give',
      amount: 10,
      reason: 'x',
    });
    flow.expectValue('no party: field', FIELDS, 'party_name');
    await flow.expect(400, "the bill is the contact's", 'POST', '/app/pending-credits', {
      direction: 'give',
      amount: 10,
      reason: 'x',
      contact_id: bina,
      invoice_id: invoiceAsha,
    });
    flow.expectValue("other contact's bill: field", FIELDS, 'invoice_id');
    const settle = `/app/pending-credits/${pendingCreditAsha}/settle`;
    await flow.expect(200, 'give back 200 in cash (B24)', 'POST', settle, {
      amount: 200,
      method: 'money',
      branch_id: vesu,
      splits: [{ mode: 'cash', amount: 200 }],
    });
    flow.expectValue(
      '200 settled, still open',
      '[.data.settled_amount, .data.left_amount, .data.status, (.data.payment_ids | length)] | map(tostring) | join(",")',
      '200,300,open,1',
    );
    await flow.expect(
      200,
      'the refund carries a credit note on the bill',
      'GET',
      `/app/invoices/${invoiceAsha}/credit-notes`,
    );
    flow.expectValue(
      'one credit note of 200',
      '[(.data | length), .data[0].amount] | map(tostring) | join(",")',
      '1,200',
    );
    await flow.expect(400, 'more than is left', 'POST', settle, {
      amount: 400,
      method: 'money',
      branch_id: vesu,
      splits: [{ mode: 'cash', amount: 400 }],
    });
    flow.expectValue('left: field', FIELDS, 'amount');
    await flow.expect(400, 'money needs a branch and splits', 'POST', settle, {
      amount: 10,
      method: 'money',
    });
    flow.expectValue('money: fields', FIELDS, 'body.branch_id,body.splits');
    await flow.expect(
      409,
      'change it once settled',
      'PATCH',
      `/app/pending-credits/${pendingCreditAsha}`,
      { note: 'x' },
    );
    flow.expectValue('settled: why', REASON, 'credit_settled');
    await flow.expect(
      409,
      'delete it once settled',
      'DELETE',
      `/app/pending-credits/${pendingCreditAsha}?reason=mistake`,
    );
    await flow.expect(200, 'use the rest on her bill', 'POST', settle, {
      amount: 300,
      method: 'use_on_bill',
      invoice_id: invoiceAsha,
    });
    flow.expectValue(
      'used up',
      '[.data.settled_amount, .data.left_amount, .data.status, (.data.payment_ids | length)] | map(tostring) | join(",")',
      '500,0,used,2',
    );
    await flow.expect(
      200,
      'the bill took the credit',
      'GET',
      `/app/payments?invoice_id=${invoiceAsha}&mode=credit`,
    );
    flow.expectValue(
      'a receipt paid by credit',
      '[(.data | length), .data[0].kind, (.data[0].splits | map(.mode) | join("+"))] | map(tostring) | join(",")',
      '1,receipt,credit',
    );
    await flow.expect(409, 'settled in full', 'POST', settle, {
      amount: 1,
      method: 'use_on_bill',
      invoice_id: invoiceAsha,
    });
    flow.expectValue('closed: why', REASON, 'credit_closed');
    await flow.expect(200, 'a supplier owes the clinic 400', 'POST', '/app/pending-credits', {
      direction: 'take',
      amount: 400,
      reason: 'Returned stock',
      party_name: `Supplier ${S}`,
    });
    const supplierCredit = flow.last('.data.id');
    await flow.expect(
      400,
      'a take is never used on a bill',
      'POST',
      `/app/pending-credits/${supplierCredit}/settle`,
      { amount: 100, method: 'use_on_bill', invoice_id: invoiceAsha },
    );
    flow.expectValue('take: field', FIELDS, 'method');
    await flow.expect(
      200,
      'get it back in cash',
      'POST',
      `/app/pending-credits/${supplierCredit}/settle`,
      { amount: 400, method: 'money', branch_id: vesu, splits: [{ mode: 'cash', amount: 400 }] },
    );
    flow.expectValue('got back', '.data.status', 'got_back');
    await flow.expect(
      200,
      'its settlement is money back',
      'GET',
      `/app/payments?pending_credit_id=${supplierCredit}`,
    );
    flow.expectValue(
      'money back, received',
      '[.data[0].kind, .data[0].direction] | join(",")',
      'money_back,received',
    );
    await flow.expect(200, 'owe Bina 300, by tomorrow', 'POST', '/app/pending-credits', {
      direction: 'give',
      amount: 300,
      reason: 'Goodwill',
      contact_id: bina,
      settle_by: tomorrow,
    });
    const pendingCreditBina = flow.last('.data.id');
    await flow.expect(
      409,
      'not her bill (nothing due for her)',
      'POST',
      `/app/pending-credits/${pendingCreditBina}/settle`,
      { amount: 100, method: 'use_on_bill', invoice_id: invoiceAsha },
    );
    flow.expectValue('not hers: why', REASON, 'nothing_due');
    await flow.expect(
      200,
      'change it while unsettled',
      'PATCH',
      `/app/pending-credits/${pendingCreditBina}`,
      { amount: 350 },
    );
    await flow.expect(
      204,
      'delete it while unsettled',
      'DELETE',
      `/app/pending-credits/${pendingCreditBina}?reason=not_needed`,
    );
    await flow.expect(
      200,
      'restore it',
      'POST',
      `/app/pending-credits/${pendingCreditBina}/restore`,
    );
    await flow.expect(
      200,
      'by the number',
      'GET',
      `/app/pending-credits?q=CR-${pendingCreditAshaNumber}`,
    );
    flow.expectValue(
      'the number finds it',
      `[.data[].id | select(. == "${pendingCreditAsha}")] | length`,
      1,
    );
    await flow.expect(
      200,
      'used or got back, by contact',
      'GET',
      `/app/pending-credits?status=used,got_back&contact_id=${asha}`,
    );
    flow.expectValue("Asha's used one", '[.data[].id] | join(",")', pendingCreditAsha);
    await flow.expect(
      200,
      'open, settle by tomorrow',
      'GET',
      `/app/pending-credits?direction=give&status=open&contact_id=${bina}&sort=settle_by`,
    );
    flow.expectValue("Bina's open one", '[.data[].id] | join(",")', pendingCreditBina);
    flow.as('counsellor');
    await flow.expect(
      200,
      'the counsellor reads one (payment:read)',
      'GET',
      `/app/pending-credits/${pendingCreditBina}`,
    );
    await flow.expect(
      403,
      'the counsellor deletes none',
      'DELETE',
      `/app/pending-credits/${pendingCreditBina}?reason=mistake`,
    );
  });

  it("8.E day closes (routes 28–32) — on the run's branch", async () => {
    flow.as('owner');
    await flow.expect(
      200,
      "yesterday's receipt there",
      'POST',
      '/app/payments',
      payment('receipt', billingBranch, [{ mode: 'cash', amount: 400 }], {
        contact_id: asha,
        paid_at: at(yesterday),
      }),
    );
    const yesterdayReceipt = flow.last('.data.id');
    await flow.expect(
      200,
      'and an expense',
      'POST',
      '/app/payments',
      payment('expense', billingBranch, [{ mode: 'cash', amount: 100 }], {
        payee_name: 'Tea',
        expense_category: 'misc',
        paid_at: at(yesterday),
      }),
    );
    await flow.expect(200, 'open yesterday (carried, B25)', 'POST', '/app/day-closes', {
      branch_id: billingBranch,
      close_date: yesterday,
    });
    const yesterdayClose = flow.last('.data.id');
    flow.expectValue(
      'open, carried 0, who accepted',
      '[(.data.id | startswith("dcl_")), .data.status, .data.opening_source, .data.opening_cash, .data.opening_accepted_by_membership_id, (.data.events | map(.kind) | join("+"))] | map(tostring) | join(",")',
      `true,open,carried,0,${owner},opened`,
    );
    await flow.expect(409, 'one per branch and day', 'POST', '/app/day-closes', {
      branch_id: billingBranch,
      close_date: yesterday,
    });
    flow.expectValue('twice: why', REASON, 'record_already_exists');
    await flow.expect(400, 'never in the future', 'POST', '/app/day-closes', {
      branch_id: billingBranch,
      close_date: tomorrow,
    });
    flow.expectValue('future: field', FIELDS, 'close_date');
    await flow.expect(400, 'never more than 120 days back', 'POST', '/app/day-closes', {
      branch_id: billingBranch,
      close_date: longAgo,
    });
    await flow.expect(400, 'a recount needs its cash', 'POST', '/app/day-closes', {
      branch_id: billingBranch,
      close_date: threeDaysAgo,
      opening_source: 'recounted',
    });
    flow.expectValue('recount: field', FIELDS, 'body.opening_cash');
    await flow.expect(400, "the carried cash is the server's", 'POST', '/app/day-closes', {
      branch_id: billingBranch,
      close_date: threeDaysAgo,
      opening_cash: 5,
    });
    await flow.expect(
      200,
      "the day's live figures (B27)",
      'GET',
      `/app/day-closes/${yesterdayClose}`,
    );
    flow.expectValue(
      'in 400, out 100, expected 300',
      '[.data.cash_in, .data.cash_out, .data.expected_cash, .data.entry_count, .data.net_by_mode.cash, (.data.by_member | length), .data.by_member[0].membership_id] | map(tostring) | join(",")',
      `400,100,300,2,300,1,${owner}`,
    );
    flow.as('pharmacist');
    await flow.expect(
      403,
      'the pharmacist closes no day (payment:update)',
      'POST',
      `/app/day-closes/${yesterdayClose}/close`,
      { counted_cash: 300 },
    );
    flow.as('owner');
    const close = `/app/day-closes/${yesterdayClose}/close`;
    await flow.expect(400, 'a short count needs a reason', 'POST', close, { counted_cash: 250 });
    flow.expectValue('difference: field', FIELDS, 'difference_reason');
    await flow.expect(200, 'count and close', 'POST', close, {
      counted_cash: 250,
      difference_reason: 'Short by 50',
    });
    flow.expectValue(
      'closed: expected, difference, manual, events',
      '[.data.status, .data.expected_cash, .data.counted_cash, .data.difference, .data.close_kind, .data.closed_by_membership_id, (.data.events | map(.kind) | join("+"))] | map(tostring) | join(",")',
      `closed,300,250,-50,manual,${owner},opened+closed`,
    );
    await flow.expect(409, 'close it twice', 'POST', close, { counted_cash: 250 });
    flow.expectValue('twice: why', REASON, 'transition_not_allowed');
    await flow.expect(
      409,
      "a closed day's payment never changes (B6)",
      'PATCH',
      `/app/payments/${yesterdayReceipt}`,
      { note: 'late' },
    );
    flow.expectValue('closed day: why', REASON, 'day_closed');
    await flow.expect(
      409,
      'nor is deleted',
      'DELETE',
      `/app/payments/${yesterdayReceipt}?reason=mistake`,
    );
    await flow.expect(
      409,
      'nothing is added to it',
      'POST',
      '/app/payments',
      payment('money_back', billingBranch, [{ mode: 'cash', amount: 10 }], {
        paid_at: at(yesterday),
      }),
    );
    flow.expectValue('added: why', REASON, 'day_closed');
    await flow.expect(200, 'it is settled', 'GET', `/app/payments/${yesterdayReceipt}`);
    flow.expectValue('settled', '.data.is_settled', true);
    await flow.expect(
      409,
      "an open day's payment is deleted, not reversed",
      'POST',
      `/app/payments/${firstReceipt}/reverse`,
      { reason: 'x' },
    );
    flow.expectValue('open: why', REASON, 'day_open');
    await flow.expect(
      200,
      'reverse the settled receipt (B21)',
      'POST',
      `/app/payments/${yesterdayReceipt}/reverse`,
      { reason: 'Wrong patient' },
    );
    const reversal = flow.last('.data.id');
    flow.expectValue(
      'a reversal: opposite, pointing at it, the reason',
      '[.data.kind, .data.direction, .data.amount, .data.reverses_payment_id, .data.note] | map(tostring) | join(",")',
      `reversal,paid,400,${yesterdayReceipt},Wrong patient`,
    );
    await flow.expect(200, 'shown reversed', 'GET', `/app/payments/${yesterdayReceipt}`);
    flow.expectValue('reversed by it', '.data.reversed_by_payment_id', reversal);
    await flow.expect(
      409,
      'reverse it twice',
      'POST',
      `/app/payments/${yesterdayReceipt}/reverse`,
      { reason: 'again' },
    );
    flow.expectValue('twice: why', REASON, 'already_reversed');
    await flow.expect(409, 'reverse a reversal', 'POST', `/app/payments/${reversal}/reverse`, {
      reason: 'again',
    });
    flow.as('front_desk');
    await flow.expect(
      403,
      'the front desk reverses nothing (payment:delete)',
      'POST',
      `/app/payments/${firstReceipt}/reverse`,
      { reason: 'x' },
    );
    await flow.expect(
      403,
      'nor reopens a day',
      'POST',
      `/app/day-closes/${yesterdayClose}/reopen`,
      { reason: 'x' },
    );
    await flow.expect(
      200,
      "the front desk's days — its branches only (B4)",
      'GET',
      `/app/day-closes?branch_id=${billingBranch}`,
    );
    flow.expectValue("the run's branch hidden", '.data | length', 0);
    await flow.expect(404, "another branch's day", 'GET', `/app/day-closes/${yesterdayClose}`);
    flow.as('owner');
    const reopen = `/app/day-closes/${yesterdayClose}/reopen`;
    await flow.expect(200, 'reopen with a reason', 'POST', reopen, {
      reason: 'Recount the drawer',
    });
    flow.expectValue(
      'open, the count cleared, reopened',
      '[.data.status, .data.counted_cash, .data.close_kind, (.data.events | map(.kind) | join("+")), .data.events[-1].text] | map(tostring) | join(",")',
      'open,null,null,opened+closed+reopened,Recount the drawer',
    );
    await flow.expect(409, 'reopen an open day', 'POST', reopen, { reason: 'x' });
    await flow.expect(400, 'a reason to reopen', 'POST', reopen, {});
    await flow.expect(200, 'close again, the count right', 'POST', close, { counted_cash: 300 });
    flow.expectValue(
      'no difference, no reason',
      '[.data.difference, .data.difference_reason] | map(tostring) | join(",")',
      '0,null',
    );
    await flow.expect(200, 'open today, carried from yesterday', 'POST', '/app/day-closes', {
      branch_id: billingBranch,
    });
    flow.expectValue(
      'today, 300 carried',
      '[.data.close_date, .data.opening_cash, .data.opening_source] | map(tostring) | join(",")',
      `${today},300,carried`,
    );
    await flow.expect(200, 'open three days ago, recounted', 'POST', '/app/day-closes', {
      branch_id: billingBranch,
      close_date: threeDaysAgo,
      opening_source: 'recounted',
      opening_cash: 1000,
    });
    recountedDay = flow.last('.data.id');
    flow.expectValue(
      'recounted: two events',
      '[.data.opening_source, .data.opening_cash, (.data.events | map(.kind) | join("+"))] | map(tostring) | join(",")',
      'recounted,1000,opened+recounted',
    );
    await flow.expect(
      200,
      'the days, newest first',
      'GET',
      `/app/day-closes?branch_id=${billingBranch}`,
    );
    flow.expectValue(
      'today, yesterday, three days ago',
      '[.data[].close_date] | join(",")',
      `${today},${yesterday},${threeDaysAgo}`,
    );
    await flow.expect(
      200,
      'closed ones in a range',
      'GET',
      `/app/day-closes?branch_id=${billingBranch}&status=closed&close_date_from=${yesterday}&close_date_to=${yesterday}`,
    );
    flow.expectValue('yesterday', '[.data[].id] | join(",")', yesterdayClose);
  });

  it('WC-39: the auto-close worker (B26)', async () => {
    flow.as('owner');
    await flow.expect(
      200,
      'money on a day nobody opened',
      'POST',
      '/app/payments',
      payment('money_back', billingBranch, [{ mode: 'cash', amount: 200 }], {
        paid_at: at(fourDaysAgo),
      }),
    );
    const organizationPublicId = fixture.organization.publicId;
    const due = await runGlobalRetentionWorkerJob((databaseHandle) =>
      findOrganizationsWithDaysToClose(databaseHandle),
    );
    expect.soft(due, 'the sweep finds the organization').toContain(organizationPublicId);
    await runOrganizationScopedWorkerJob({ organizationPublicId }, (databaseHandle) =>
      runDayCloseAutoCloseJob(databaseHandle, organizationPublicId),
    );
    await flow.expect(
      200,
      'the past days after the sweep',
      'GET',
      `/app/day-closes?branch_id=${billingBranch}&close_date_from=${fourDaysAgo}&close_date_to=${threeDaysAgo}`,
    );
    flow.expectValue(
      'both closed by the worker, counted as expected',
      '[.data[] | "\\(.close_date):\\(.status):\\(.close_kind):\\(.opening_cash):\\(.expected_cash):\\(.counted_cash)"] | join(",")',
      `${threeDaysAgo}:closed:auto:1000:1000:1000,${fourDaysAgo}:closed:auto:0:200:200`,
    );
    await flow.expect(200, "the recounted day's story", 'GET', `/app/day-closes/${recountedDay}`);
    flow.expectValue(
      'opened, recounted, auto-closed',
      '.data.events | map(.kind) | join("+")',
      'opened+recounted+auto_closed',
    );
    await flow.expect(
      200,
      'today and yesterday untouched',
      'GET',
      `/app/day-closes?branch_id=${billingBranch}&close_date_from=${yesterday}`,
    );
    flow.expectValue(
      'today still open',
      '[.data[] | "\\(.close_date):\\(.close_kind)"] | join(",")',
      `${today}:null,${yesterday}:manual`,
    );
  });

  it('D83: who gives money back (#166) and who closes the day (#167)', async () => {
    const CASH = (amount: number) => [{ mode: 'cash', amount }];
    flow.as('owner');
    const dina = await person('Dina', '24');
    await flow.expect(200, "Dina's file", 'POST', '/app/patients', {
      contact_id: dina,
      home_branch_id: vesu,
    });
    await flow.expect(
      200,
      'bill Dina a facial, 1000 paid now',
      'POST',
      '/app/invoices',
      invoiceBody(vesu, dina, facial, { payment: { splits: CASH(1000) } }),
    );
    const dinaInvoice = flow.last('.data.id');
    const creditNotes = `/app/invoices/${dinaInvoice}/credit-notes`;
    const refund = { amount: 100, reason: 'Charged twice', splits: CASH(100) };

    // #166: a credit note is a refund — payment:delete.
    for (const role of ['front_desk', 'counsellor', 'pharmacist'] as const) {
      flow.as(role);
      await flow.expect(403, `${role} refunds nothing`, 'POST', creditNotes, refund);
      flow.expectValue(`${role}: why`, REASON, 'missing_permission');
    }
    flow.as('accountant');
    await flow.expect(
      200,
      'the accountant refunds with a credit note',
      'POST',
      creditNotes,
      refund,
    );
    flow.expectValue('the credit note of 100', '.data.amount', 100);

    // #166: settling a give-back credit is a refund too; taking money back is not.
    flow.as('owner');
    await flow.expect(200, 'owe Dina 300', 'POST', '/app/pending-credits', {
      direction: 'give',
      amount: 300,
      reason: 'Session cancelled',
      contact_id: dina,
    });
    const giveSettle = `/app/pending-credits/${flow.last('.data.id')}/settle`;
    await flow.expect(200, 'Dina owes 200', 'POST', '/app/pending-credits', {
      direction: 'take',
      amount: 200,
      reason: 'Balance on the peel',
      contact_id: dina,
    });
    const takeSettle = `/app/pending-credits/${flow.last('.data.id')}/settle`;
    await flow.expect(
      200,
      'a second bill to use the credit on',
      'POST',
      '/app/invoices',
      invoiceBody(vesu, dina, consult, { type: 'consultation' }),
    );
    const dinaConsultation = flow.last('.data.id');
    flow.as('front_desk');
    await flow.expect(403, 'the front desk gives no money back', 'POST', giveSettle, {
      amount: 100,
      method: 'money',
      branch_id: vesu,
      splits: CASH(100),
    });
    flow.expectValue('give back: why', REASON, 'missing_permission');
    await flow.expect(403, 'nor uses the credit on a bill', 'POST', giveSettle, {
      amount: 100,
      method: 'use_on_bill',
      invoice_id: dinaConsultation,
    });
    flow.expectValue('use on bill: why', REASON, 'missing_permission');
    await flow.expect(200, 'but takes money back (payment:create)', 'POST', takeSettle, {
      amount: 200,
      method: 'money',
      branch_id: vesu,
      splits: CASH(200),
    });
    flow.expectValue('got back', '.data.status', 'got_back');
    await flow.expect(
      200,
      'and records money coming back to the clinic (money_back — B17)',
      'POST',
      '/app/payments',
      payment('money_back', vesu, CASH(50), { note: 'Vendor returned money' }),
    );
    flow.as('accountant');
    await flow.expect(200, 'the accountant gives the money back', 'POST', giveSettle, {
      amount: 100,
      method: 'money',
      branch_id: vesu,
      splits: CASH(100),
    });
    await flow.expect(200, 'and uses the rest on the bill', 'POST', giveSettle, {
      amount: 200,
      method: 'use_on_bill',
      invoice_id: dinaConsultation,
    });
    flow.expectValue('settled', '.data.status', 'used');

    // #167: the counter closes the day (payment:update); reopening is payment:delete.
    const longBack = calendarDay(fixture, -30);
    flow.as('front_desk');
    await flow.expect(200, 'the front desk opens a past day', 'POST', '/app/day-closes', {
      branch_id: vesu,
      close_date: longBack,
    });
    const pastDay = flow.last('.data.id');
    const opening = Number(flow.last('.data.opening_cash'));
    await flow.expect(200, 'and closes it', 'POST', `/app/day-closes/${pastDay}/close`, {
      counted_cash: opening,
    });
    flow.expectValue('closed', '.data.status', 'closed');
    for (const role of ['front_desk', 'counsellor'] as const) {
      flow.as(role);
      await flow.expect(
        403,
        `${role} reopens no day`,
        'POST',
        `/app/day-closes/${pastDay}/reopen`,
        {
          reason: 'Recount',
        },
      );
      flow.expectValue(`${role} reopen: why`, REASON, 'missing_permission');
    }
    flow.as('accountant');
    await flow.expect(
      200,
      'the accountant reopens it',
      'POST',
      `/app/day-closes/${pastDay}/reopen`,
      {
        reason: 'Recount the drawer',
      },
    );
    flow.as('counsellor');
    await flow.expect(
      200,
      'the counsellor closes the day too (its preset, D83 (4))',
      'POST',
      `/app/day-closes/${pastDay}/close`,
      { counted_cash: opening },
    );
    flow.as('pharmacist');
    await flow.expect(
      403,
      'the pharmacist closes none',
      'POST',
      `/app/day-closes/${pastDay}/close`,
      {
        counted_cash: opening,
      },
    );
  });
});
