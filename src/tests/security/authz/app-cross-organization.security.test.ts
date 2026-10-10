import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorSql } from '@/tests/helpers/operator-database.js';
import {
  loadRouteAuthorizationModel,
  MODEL_EXPECTED_ATTACKER_STATUS,
} from '@/tests/helpers/route-authorization-model.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import {
  AppFlow,
  type AppFlowMethod,
  calendarDay,
} from '@/domains/app/__tests__/factories/app-flow.factory.js';
import {
  appRouteBody,
  appRouteDeleteQuery,
  placeholderAppRouteReferences,
} from '@/tests/helpers/app-route-requests.js';

/** The public API prefix every catalog key carries. */
const API_PREFIX = '/api/v1';

/**
 * Cross-organization isolation matrix for the app's own records (launch ROUTE #125–#153) —
 * models `organization` and `user` in route-authorization-model.json, every `/app` route that
 * names a record by id.
 *
 * @remarks
 * - **Algorithm:** a victim organization gets one real record of every kind through the API; an
 *   attacker organization's owner — every permission in their own organization — then calls each
 *   modelled route with the victim's ids (path params) and a body their own organization would
 *   accept, so a refusal is the record lookup scoped to the caller's organization, not a 400 over
 *   the body. Every answer must be 403 or 404. The victim's records are read back before and after
 *   the matrix (every modelled GET, as the victim's owner): no attack changed anything.
 * - **Notes:** the attacker's body names the attacker's own branch, members, offering and upload
 *   where a route takes one; the victim's ids appear only in the path.
 */
describe('Security: app records are isolated per organization (models organization, user)', () => {
  const model = loadRouteAuthorizationModel();
  const routes = Object.entries(model)
    .filter(([key]) => key.includes(` ${API_PREFIX}/app/`))
    .map(([key, entry]) => {
      const [method = 'GET', path = ''] = key.split(' ');
      return { key, method: method as AppFlowMethod, path: path.slice(API_PREFIX.length), entry };
    });

  let app: FastifyInstance;
  let victim: AppFixture;
  let attacker: AppFixture;
  let victimFlow: AppFlow;
  let attackFlow: AppFlow;
  /** The victim's record of every kind, by the route param that names it. */
  const victimIds: Record<string, string> = {};
  /** The attacker's own references a body may name. */
  let attackerOffering = '';
  let attackerUpload = '';

  /** Inserts a confirmed upload of `fixture`'s owner and returns its key. */
  async function confirmedUpload(fixture: AppFixture, name: string): Promise<string> {
    const key = `organizations/${fixture.organization.publicId}/uploads/${name}`;
    await getOperatorSql()`
      INSERT INTO upload.uploads (public_id, user_id, organization_id, file_name, file_key, mime_type,
        file_size, bucket, status, uploaded_at)
      VALUES (${generatePublicId('upload')}, ${fixture.members.owner.userId}, ${fixture.organization.id},
        ${name}, ${key}, 'image/jpeg', 2048, 'local', 'UPLOADED', now())
    `;
    return key;
  }

  /** The victim's call that must answer 200; records `.data.id` under `param` (when given). */
  async function make(
    param: string | undefined,
    method: AppFlowMethod,
    path: string,
    body?: unknown,
  ): Promise<string> {
    await victimFlow.expect(200, `victim: ${method} ${path}`, method, path, body);
    const id = victimFlow.last('.data.id');
    if (param !== undefined) victimIds[param] = id;
    return id;
  }

  /** The victim's records, created through the API — one of every kind a modelled route names. */
  async function seedVictimRecords(): Promise<void> {
    const vesu = victim.branches.vesu;
    const doctor = victim.members.doctor.membershipPublicId;
    const today = calendarDay(victim, 0);
    const yesterday = calendarDay(victim, -1);
    const tomorrow = calendarDay(victim, 1);
    const [year = 0, month = 1] = today.split('-').map(Number);
    const nextYear = `${year + 1}-${String(month).padStart(2, '0')}`;
    victimIds.branch_id = vesu;
    victimFlow.as('owner');

    await make('branch_room_id', 'POST', `/app/branches/${vesu}/rooms`, { name: 'Room one' });
    await make('branch_machine_id', 'POST', `/app/branches/${vesu}/machines`, { name: 'Laser' });
    await make('branch_holiday_id', 'POST', `/app/branches/${vesu}/holidays`, {
      holiday_date: calendarDay(victim, 40),
      label: 'Festival',
    });

    const contact = await make('contact_id', 'POST', '/app/contacts', {
      first_name: 'Asha',
      last_name: 'Victim',
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
      const booked = await victimFlow.call('POST', '/app/appointments', {
        contact_id: contact,
        branch_id: vesu,
        doctor_membership_id: doctor,
        appointment_date: calendarDay(victim, offset),
        start_time: '11:00',
        service_label: 'Consultation',
      });
      if (booked.status === 200) appointment = victimFlow.last('.data.id');
    }
    expect(appointment, 'victim: a booking').not.toBe('');
    victimIds.appointment_id = appointment;

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
      file_key: await confirmedUpload(victim, 'victim-photo.jpg'),
      album: 'lhr',
      body_part: 'full_body',
    });
    await make('patient_report_id', 'POST', `${files}/reports`, {
      name: 'CBC',
      report_date: today,
      file_keys: [await confirmedUpload(victim, 'victim-report.jpg')],
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
    const batch = victimFlow.last('.data.batches[0].id');
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
      ends_on: calendarDay(victim, 10),
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
    await getOperatorSql()`
      INSERT INTO app.patient_offerings (public_id, organization_id, patient_id, offering_id,
        invoice_item_id, sessions_total)
      SELECT ${boughtOffering}, p.organization_id, p.id, line.offering_id, line.id, 3
      FROM app.patients p, app.invoice_items line JOIN app.invoices i ON i.id = line.invoice_id
      WHERE p.public_id = ${patient} AND i.public_id = ${invoice}
    `;
    victimIds.patient_offering_id = boughtOffering;
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
      branch_id: victim.branches.adajan,
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
    victimIds.invoice_item_id = victimFlow.last('.data.items[0].invoice_item_id');

    victimFlow.as('front_desk');
    await make('membership_saved_view_id', 'POST', '/app/memberships/me/saved-views', {
      list_key: 'leads',
      label: 'Hot leads',
      filters: {},
    });
    victimFlow.as('owner');
  }

  /**
   * A body the attacker's own organization accepts on the route (path params aside), so the
   * refusal is the scoped lookup: the shared route table, naming the attacker's own branch,
   * members, offering and upload, and the victim's sale line where a return names one.
   */
  function attackBody(method: AppFlowMethod, path: string): unknown {
    return appRouteBody({
      method,
      path,
      references: {
        ...placeholderAppRouteReferences(attacker.organization.timezone),
        branchId: attacker.branches.vesu,
        membershipId: attacker.members.front_desk.membershipPublicId,
        doctorMembershipId: attacker.members.doctor.membershipPublicId,
        offeringId: attackerOffering,
        uploadKey: attackerUpload,
        invoiceItemId: victimIds.invoice_item_id ?? '',
        today: calendarDay(attacker, 0),
        laterDay: calendarDay(attacker, 41),
      },
    });
  }

  /** The route's path with the victim's ids in it. */
  function victimPath(template: string): string {
    return template.replaceAll(/:(\w+)/g, (_match, param: string) => {
      const id = victimIds[param];
      if (id === undefined || id === '') throw new Error(`no victim record for :${param}`);
      return id;
    });
  }

  /** Every modelled GET as the victim's owner (the front desk for their own saved view). */
  async function snapshotVictim(): Promise<Record<string, unknown>> {
    const snapshot: Record<string, unknown> = {};
    for (const route of routes.filter((candidate) => candidate.method === 'GET')) {
      victimFlow.as(route.entry.model === 'user' ? 'front_desk' : 'owner');
      const response = await victimFlow.call('GET', victimPath(route.path));
      snapshot[route.key] = {
        status: response.status,
        data: (response.body as { data?: unknown } | null)?.data,
      };
    }
    victimFlow.as('owner');
    return snapshot;
  }

  let before: Record<string, unknown> = {};

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    victim = await createAppFixture(app);
    attacker = await createAppFixture(app);
    victimFlow = new AppFlow(app, victim);
    attackFlow = new AppFlow(app, attacker);
    await seedVictimRecords();

    attackFlow.as('owner');
    await attackFlow.expect(200, 'attacker: an offering of their own', 'POST', '/app/offerings', {
      name: 'Attacker consult',
      price: 100,
    });
    attackerOffering = attackFlow.last('.data.id');
    attackerUpload = await confirmedUpload(attacker, 'attacker-photo.jpg');
    before = await snapshotVictim();
  });

  afterAll(async () => {
    await app.close();
  });

  it('covers every modelled app route', () => {
    expect(routes.length).toBeGreaterThan(200);
  });

  it('refuses every modelled app route on the victim organization’s records', async () => {
    attackFlow.as('owner');
    for (const route of routes) {
      const path = victimPath(route.path);
      const expected = MODEL_EXPECTED_ATTACKER_STATUS[route.entry.model];
      let response: { status: number; body: unknown };
      if (route.method === 'GET') {
        response = await attackFlow.call('GET', path);
      } else if (route.method === 'DELETE') {
        response = await attackFlow.call('DELETE', `${path}${appRouteDeleteQuery(route.path)}`);
      } else if (route.path.endsWith('/restore')) {
        response = await attackFlow.call(route.method, path);
      } else {
        response = await attackFlow.call(route.method, path, attackBody(route.method, route.path));
      }
      expect
        .soft(
          expected,
          `${route.key} as the attacker → ${response.status} ${JSON.stringify(response.body).slice(0, 300)}`,
        )
        .toContain(response.status);
    }
  });

  it('changed none of the victim organization’s records', async () => {
    const after = await snapshotVictim();
    for (const [key, value] of Object.entries(before)) {
      expect.soft(after[key], `${key} reads the same after the attacks`).toEqual(value);
    }
    expect
      .soft(
        Object.entries(before)
          .filter(([, value]) => (value as { status: number }).status !== 200)
          .map(([key]) => key),
        'every snapshot read answered 200',
      )
      .toEqual([]);
  });
});
