import type { FastifyInstance } from 'fastify';
import { expect } from 'vitest';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import {
  type AppRouteReferences,
  placeholderAppRouteReferences,
} from '@/tests/helpers/app-route-requests.js';
import { operatorQuery } from '@/tests/helpers/operator-database.js';
import type { AppFixture } from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import {
  AppFlow,
  type AppFlowMethod,
  calendarDay,
} from '@/domains/app/__tests__/factories/app-flow.factory.js';

/**
 * The references a request body names, from {@link seedAppRecordOfEveryKind}'s records — so a
 * matrix can send every collection write without seeding a second set.
 */
export function appRouteReferencesOf(options: {
  fixture: AppFixture;
  ids: Readonly<Record<string, string>>;
}): AppRouteReferences {
  const { fixture, ids } = options;
  const id = (param: string): string => {
    const value = ids[param];
    if (value === undefined) throw new Error(`no seeded record for ${param}`);
    return value;
  };
  return {
    ...placeholderAppRouteReferences(fixture.organization.timezone),
    branchId: fixture.branches.vesu,
    membershipId: fixture.members.front_desk.membershipPublicId,
    doctorMembershipId: fixture.members.doctor.membershipPublicId,
    contactId: id('contact_id'),
    offeringId: id('offering_id'),
    medicineId: id('medicine_id'),
    medicineBatchId: id('medicine_batch_id'),
    supplierId: id('supplier_id'),
    stockItemId: id('stock_item_id'),
    stockVendorId: id('stock_vendor_id'),
    today: calendarDay(fixture, 0),
    yesterday: calendarDay(fixture, -1),
    tomorrow: calendarDay(fixture, 1),
  };
}

/**
 * Inserts a confirmed upload of `fixture`'s owner (the shape a finished upload leaves) and returns
 * its key — what a photo, a report or an attachment names.
 *
 * @remarks
 * - **Side effects:** one `upload.uploads` row, written on the operator connection.
 */
export async function insertConfirmedUpload(options: {
  fixture: AppFixture;
  name: string;
}): Promise<string> {
  const { fixture, name } = options;
  const key = `organizations/${fixture.organization.publicId}/uploads/${name}`;
  await operatorQuery`
    INSERT INTO upload.uploads (public_id, user_id, organization_id, file_name, file_key, mime_type,
      file_size, bucket, status, uploaded_at)
    VALUES (${generatePublicId('upload')}, ${fixture.members.owner.userId}, ${fixture.organization.id},
      ${name}, ${key}, 'image/jpeg', 2048, 'local', 'UPLOADED', now())
  `;
  return key;
}

/**
 * One of `fixture`'s app records of every kind a route names, created through the API as its
 * owner (the front desk for their own saved view) — answers each record's public id by the route
 * param that names it (`patient_id`, `branch_room_id`, …).
 *
 * @remarks
 * - **Algorithm:** the branch's rooms, machines and holiday; a contact with a note, a template, a
 *   lead and a booking; a patient file with every section; the medical store's records; offerings,
 *   an offer, a bill with its payment, a bought offering and a credit note; a pending credit, a
 *   day, stock, a task, a supplier credit, an order, a rep with a visit, a sale and a saved view.
 * - **Failure modes:** a write that does not answer 200 fails the calling test.
 * - **Side effects:** two confirmed uploads and one bought offering are written on the operator
 *   connection (no route creates them on their own).
 */
export async function seedAppRecordOfEveryKind(options: {
  app: FastifyInstance;
  fixture: AppFixture;
}): Promise<Record<string, string>> {
  const { fixture } = options;
  const flow = new AppFlow(options.app, fixture);
  const ids: Record<string, string> = {};
  const make = async (
    param: string | undefined,
    method: AppFlowMethod,
    path: string,
    body?: unknown,
  ): Promise<string> => {
    await flow.expect(
      200,
      `${fixture.organization.publicId}: ${method} ${path}`,
      method,
      path,
      body,
    );
    const id = flow.last('.data.id');
    if (param !== undefined) ids[param] = id;
    return id;
  };
  const vesu = fixture.branches.vesu;
  const doctor = fixture.members.doctor.membershipPublicId;
  const today = calendarDay(fixture, 0);
  const yesterday = calendarDay(fixture, -1);
  const tomorrow = calendarDay(fixture, 1);
  const [year = 0, month = 1] = today.split('-').map(Number);
  const nextYear = `${year + 1}-${String(month).padStart(2, '0')}`;
  ids.branch_id = vesu;
  flow.as('owner');

  await make('branch_room_id', 'POST', `/app/branches/${vesu}/rooms`, { name: 'Room one' });
  await make('branch_machine_id', 'POST', `/app/branches/${vesu}/machines`, { name: 'Laser' });
  await make('branch_holiday_id', 'POST', `/app/branches/${vesu}/holidays`, {
    holiday_date: calendarDay(fixture, 40),
    label: 'Festival',
  });

  const contact = await make('contact_id', 'POST', '/app/contacts', {
    first_name: 'Asha',
    last_name: 'Every kind',
    phones: [{ phone: '+919812300001', is_primary: true }],
  });
  await make('contact_activity_id', 'POST', `/app/contacts/${contact}/activities/add-note`, {
    body: 'Prefers mornings',
  });
  await make('contact_message_template_id', 'POST', '/app/contact-message-templates', {
    name: 'Hello',
    body: 'Hi <first>',
  });
  await make('lead_id', 'POST', '/app/leads', { contact_id: contact, branch_id: vesu });

  let appointment = '';
  for (let offset = 30; offset <= 44 && appointment === ''; offset += 1) {
    const booked = await flow.call('POST', '/app/appointments', {
      contact_id: contact,
      branch_id: vesu,
      doctor_membership_id: doctor,
      appointment_date: calendarDay(fixture, offset),
      start_time: '11:00',
      service_label: 'Consultation',
    });
    if (booked.status === 200) appointment = flow.last('.data.id');
  }
  expect(appointment, `${fixture.organization.publicId}: a booking`).not.toBe('');
  ids.appointment_id = appointment;

  const patient = await make('patient_id', 'POST', '/app/patients', {
    contact_id: contact,
    home_branch_id: vesu,
  });
  const files = `/app/patients/${patient}`;
  await make('patient_treatment_id', 'POST', `${files}/treatments`, { name: 'Glycolic peel' });
  await make('patient_check_in_id', 'POST', `${files}/check-ins`, { feel: 'better', score: 8 });
  await make('patient_review_id', 'POST', `${files}/reviews`, { source: 'google', rating: 5 });
  await make('patient_clinical_note_id', 'POST', `${files}/clinical-notes`, {
    kind: 'complaint',
    text: 'Breakouts',
  });
  await make('patient_diagnosis_id', 'POST', '/app/patient-diagnoses', { name: 'Acne' });
  await make('patient_image_id', 'POST', `${files}/images`, {
    file_key: await insertConfirmedUpload({ fixture, name: 'photo.jpg' }),
    album: 'lhr',
    body_part: 'full_body',
  });
  await make('patient_report_id', 'POST', `${files}/reports`, {
    name: 'CBC',
    report_date: today,
    file_keys: [await insertConfirmedUpload({ fixture, name: 'report.jpg' })],
  });

  const manufacturer = await make('manufacturer_id', 'POST', '/app/manufacturers', {
    name: 'Alvi',
  });
  const supplier = await make('supplier_id', 'POST', '/app/suppliers', {
    name: 'Shree Agency',
    manufacturer_ids: [manufacturer],
  });
  const medicine = await make('medicine_id', 'POST', '/app/medicines', {
    name: 'Glycolac',
    manufacturer_id: manufacturer,
    mrp: 369,
    batches: [
      {
        batch_number: 'B1',
        expiry_month: nextYear,
        quantity: 10,
        purchase_rate: 246,
        supplier_id: supplier,
      },
    ],
  });
  const batch = flow.last('.data.batches[0].id');
  ids.medicine_batch_id = batch;
  const medicineLine = {
    medicine_name: 'Glycolac',
    medicine_id: medicine,
    dose_night: 1,
    meal: 'after',
    quantity: 1,
  };
  await make('patient_prescription_id', 'POST', `${files}/prescriptions`, {
    doctor_membership_id: doctor,
    prescription_date: today,
    items: [medicineLine],
  });
  await make('prescription_kit_id', 'POST', '/app/prescription-kits', {
    name: 'Acne kit',
    items: [medicineLine],
  });

  await make('offering_group_id', 'POST', '/app/offering-groups', { name: 'Peels' });
  const offering = await make('offering_id', 'POST', '/app/offerings', {
    name: 'Consultation',
    category: 'consultation',
    price: 500,
  });
  await make('offer_id', 'POST', '/app/offers', {
    name: 'Glow week',
    value: 10,
    offering_ids: [offering],
    starts_on: yesterday,
    ends_on: calendarDay(fixture, 10),
  });
  await make('patient_offering_suggestion_id', 'POST', `${files}/offering-suggestions`, {
    offering_id: offering,
    quantity: 1,
  });
  const invoice = await make('invoice_id', 'POST', '/app/invoices', {
    branch_id: vesu,
    contact_id: contact,
    items: [{ offering_id: offering, quantity: 1 }],
  });
  // The bill is ₹450: billing applies the live 10% offer (M26, D81)
  await make('payment_id', 'POST', '/app/payments', {
    kind: 'receipt',
    branch_id: vesu,
    contact_id: contact,
    invoice_id: invoice,
    splits: [{ mode: 'cash', amount: 450 }],
  });
  // The patient offering a bill's line sold (the shape an invoice save writes for a package).
  const boughtOffering = generatePublicId('patientOffering');
  await operatorQuery`
    INSERT INTO app.patient_offerings (public_id, organization_id, patient_id, offering_id,
      invoice_item_id, sessions_total)
    SELECT ${boughtOffering}, p.organization_id, p.id, line.offering_id, line.id, 3
    FROM app.patients p, app.invoice_items line JOIN app.invoices i ON i.id = line.invoice_id
    WHERE p.public_id = ${patient} AND i.public_id = ${invoice}
  `;
  ids.patient_offering_id = boughtOffering;
  await make('invoice_credit_note_id', 'POST', `/app/invoices/${invoice}/credit-notes`, {
    amount: 50,
    reason: 'Part refund',
    splits: [{ mode: 'cash', amount: 50 }],
  });
  await make('pending_credit_id', 'POST', '/app/pending-credits', {
    direction: 'give',
    amount: 100,
    reason: 'Advance to return',
    contact_id: contact,
    settle_by: tomorrow,
  });
  await make('day_close_id', 'POST', '/app/day-closes', {
    branch_id: fixture.branches.adajan,
    close_date: yesterday,
  });

  const vendor = await make('stock_vendor_id', 'POST', '/app/stock-vendors', {
    name: 'Skin Supplies',
  });
  const stockItem = await make('stock_item_id', 'POST', '/app/stock-items', {
    name: 'Gauze',
    opening_quantity: 5,
  });
  await make('stock_item_movement_id', 'POST', `/app/stock-items/${stockItem}/movements`, {
    type: 'used',
    quantity: 1,
  });
  await make('stock_count_id', 'POST', '/app/stock-counts', {
    lines: [{ stock_item_id: stockItem, counted_quantity: 2 }],
  });
  await make('stock_purchase_id', 'POST', '/app/stock-purchases', {
    stock_vendor_id: vendor,
    items: [{ stock_item_id: stockItem, quantity: 2, rate: 10 }],
  });
  await make('task_id', 'POST', '/app/tasks', {
    title: 'Call the lab',
    due_at: new Date(Date.now() + 3_600_000).toISOString(),
    owner_role: 'front_desk',
  });

  await make('supplier_credit_id', 'POST', '/app/supplier-credits', {
    medicine_batch_id: batch,
    supplier_id: supplier,
    quantity: 1,
  });
  await make('medical_purchase_order_id', 'POST', '/app/medical-purchase-orders', {
    supplier_id: supplier,
    items: [{ medicine_id: medicine, quantity: 2, rate: 100 }],
  });
  const rep = await make('medical_rep_id', 'POST', '/app/medical-reps', { name: 'Rakesh' });
  await make('medical_rep_visit_id', 'POST', `/app/medical-reps/${rep}/visits`, {
    samples: 'Brochure',
  });
  await make('medical_sale_id', 'POST', '/app/medical-sales', {
    branch_id: vesu,
    contact_id: contact,
    items: [{ medicine_id: medicine, quantity: 1 }],
  });
  ids.invoice_item_id = flow.last('.data.items[0].invoice_item_id');

  flow.as('front_desk');
  await make('membership_saved_view_id', 'POST', '/app/memberships/me/saved-views', {
    list_key: 'leads',
    label: 'Hot leads',
    filters: {},
  });
  flow.as('owner');
  return ids;
}
