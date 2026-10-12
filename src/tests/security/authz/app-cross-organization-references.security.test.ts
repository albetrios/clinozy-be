import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';
import {
  type AppRouteReferences,
  appRouteBody,
  placeholderAppRouteReferences,
} from '@/tests/helpers/app-route-requests.js';

/** The statuses that refuse a request — anything but a write that went through. */
const REFUSED = [400, 403, 404, 409, 422];

/** The record references a body can name — every `AppRouteReferences` key that is an id. */
const REFERENCE_KEYS = [
  'branchId',
  'membershipId',
  'doctorMembershipId',
  'contactId',
  'offeringId',
  'medicineId',
  'medicineBatchId',
  'supplierId',
  'stockItemId',
  'stockVendorId',
] as const satisfies readonly (keyof AppRouteReferences)[];

/**
 * The app's collection writes: their bodies name records, their paths none. The patient comes
 * first: its own write files the attacker's contact as a patient, which an invoice needs.
 */
const COLLECTION_WRITES = [
  'POST /app/patients',
  'POST /app/appointments',
  'POST /app/contact-activities/message-batches',
  'POST /app/day-closes',
  'POST /app/invoices',
  'POST /app/invoices/preview',
  'POST /app/leads',
  'POST /app/medical-purchase-orders',
  'POST /app/medical-sales',
  'POST /app/offers',
  'POST /app/payments',
  'POST /app/pending-credits',
  'POST /app/prescription-kits',
  'POST /app/stock-counts',
  'POST /app/stock-purchases',
  'POST /app/supplier-credits',
] as const;

/**
 * Each list's id-valued filters (from the OpenAPI document) and the reference that fills them.
 * Exports, slot search and counts are left out: they answer files and figures, not records.
 */
const LIST_FILTERS: Record<string, Record<string, (typeof REFERENCE_KEYS)[number]>> = {
  '/app/appointments': {
    contact_id: 'contactId',
    branch_id: 'branchId',
    doctor_membership_id: 'doctorMembershipId',
    offering_id: 'offeringId',
  },
  '/app/day-closes': { branch_id: 'branchId' },
  '/app/invoices': { branch_id: 'branchId', contact_id: 'contactId' },
  '/app/payments': { branch_id: 'branchId', contact_id: 'contactId' },
  '/app/pending-credits': { contact_id: 'contactId' },
  '/app/contacts': { member_membership_id: 'membershipId' },
  '/app/leads': {
    contact_id: 'contactId',
    owner_membership_id: 'membershipId',
    team_membership_id: 'membershipId',
    branch_id: 'branchId',
  },
  '/app/medical-purchase-orders': { supplier_id: 'supplierId' },
  '/app/medical-sales': {
    contact_id: 'contactId',
    branch_id: 'branchId',
    medicine_id: 'medicineId',
  },
  '/app/medicines': { supplier_id: 'supplierId' },
  '/app/supplier-credits': { supplier_id: 'supplierId', medicine_id: 'medicineId' },
  '/app/memberships': { branch_id: 'branchId' },
  '/app/offerings': { branch_id: 'branchId' },
  '/app/offers': { offering_id: 'offeringId', branch_id: 'branchId' },
  '/app/patients': {
    home_branch_id: 'branchId',
    doctor_membership_id: 'doctorMembershipId',
    contact_id: 'contactId',
  },
  '/app/stock-item-movements': { stock_item_id: 'stockItemId' },
  '/app/stock-items': { stock_vendor_id: 'stockVendorId' },
  '/app/stock-purchases': { stock_vendor_id: 'stockVendorId' },
  '/app/tasks': {
    contact_id: 'contactId',
    branch_id: 'branchId',
    owner_membership_id: 'membershipId',
  },
};

/**
 * Cross-organization references in request bodies and list filters — the half the path matrix
 * (`app-cross-organization.security.test.ts`) does not reach.
 *
 * @remarks
 * - **Algorithm:** two organizations each get one real record of every kind a body or a filter
 *   can name. For each collection write, the attacker sends a body built from their own records
 *   with ONE reference swapped for the victim's — once per reference the body names — and every
 *   answer must refuse; then the unswapped body, which must go through, proving each refusal came
 *   from the swapped reference. For each list, the attacker filters by the victim's record: the
 *   answer is a refusal or an empty page, never the victim's rows nor the attacker's own.
 * - **Notes:** a write whose own unswapped body does not go through is reported, not skipped
 *   silently: its refusals would prove nothing.
 */
describe('Security: app bodies and filters never reach another organization’s records', () => {
  let app: FastifyInstance;
  let victim: AppFixture;
  let attacker: AppFixture;
  let attackFlow: AppFlow;
  let victimReferences: AppRouteReferences;
  let attackerReferences: AppRouteReferences;

  /** One record of every kind a body names, made through the API as `fixture`'s owner. */
  async function seedReferences(fixture: AppFixture, phone: string): Promise<AppRouteReferences> {
    const flow = new AppFlow(app, fixture).as('owner');
    const created = async (path: string, body: unknown): Promise<string> => {
      await flow.expect(200, `${fixture.organization.publicId}: POST ${path}`, 'POST', path, body);
      return flow.last('.data.id');
    };
    const [year = 0, month = 1] = calendarDay(fixture, 0).split('-').map(Number);
    const contactId = await created('/app/contacts', {
      first_name: 'Asha',
      last_name: 'Reference',
      phones: [{ phone, is_primary: true }],
    });
    const offeringId = await created('/app/offerings', { name: 'Consultation', price: 500 });
    const manufacturer = await created('/app/manufacturers', { name: 'Alvi' });
    const supplierId = await created('/app/suppliers', {
      name: 'Shree Agency',
      manufacturer_ids: [manufacturer],
    });
    const medicineId = await created('/app/medicines', {
      name: 'Glycolac',
      manufacturer_id: manufacturer,
      mrp: 369,
      batches: [
        {
          batch_number: 'B1',
          expiry_month: `${year + 1}-${String(month).padStart(2, '0')}`,
          quantity: 10,
          purchase_rate: 246,
          supplier_id: supplierId,
        },
      ],
    });
    const medicineBatchId = flow.last('.data.batches[0].id');
    const stockVendorId = await created('/app/stock-vendors', { name: 'Skin Supplies' });
    const stockItemId = await created('/app/stock-items', { name: 'Gauze' });
    return {
      ...placeholderAppRouteReferences(fixture.organization.timezone),
      branchId: fixture.branches.vesu,
      membershipId: fixture.members.front_desk.membershipPublicId,
      doctorMembershipId: fixture.members.doctor.membershipPublicId,
      contactId,
      offeringId,
      medicineId,
      medicineBatchId,
      supplierId,
      stockItemId,
      stockVendorId,
      today: calendarDay(fixture, 0),
      yesterday: calendarDay(fixture, -1),
      tomorrow: calendarDay(fixture, 1),
    };
  }

  /** A day the attacker's doctor takes bookings — found with a booking at 15:00, clear of 11:00. */
  async function bookableDay(): Promise<string> {
    for (let offset = 30; offset <= 44; offset += 1) {
      const day = calendarDay(attacker, offset);
      const probe = await attackFlow.call('POST', '/app/appointments', {
        contact_id: attackerReferences.contactId,
        branch_id: attackerReferences.branchId,
        doctor_membership_id: attackerReferences.doctorMembershipId,
        appointment_date: day,
        start_time: '15:00',
        service_label: 'Probe',
      });
      if (probe.status === 200) return day;
    }
    throw new Error('the attacker’s doctor takes no booking in the next weeks');
  }

  /** The route's `METHOD /path` split. */
  function split(route: string): { method: 'POST'; path: string } {
    const [, path = ''] = route.split(' ');
    return { method: 'POST', path };
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    victim = await createAppFixture(app);
    attacker = await createAppFixture(app);
    attackFlow = new AppFlow(app, attacker).as('owner');
    victimReferences = await seedReferences(victim, '+919812300011');
    attackerReferences = await seedReferences(attacker, '+919812300022');
    attackerReferences.laterDay = await bookableDay();
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses every collection write that names another organization’s record', async () => {
    attackFlow.as('owner');
    const unproven: string[] = [];
    let swaps = 0;
    for (const route of COLLECTION_WRITES) {
      const { method, path } = split(route);
      const base = JSON.stringify(appRouteBody({ method, path, references: attackerReferences }));
      for (const key of REFERENCE_KEYS) {
        const references = { ...attackerReferences, [key]: victimReferences[key] };
        const body = appRouteBody({ method, path, references });
        if (JSON.stringify(body) === base) continue; // the body does not name this reference
        swaps += 1;
        const response = await attackFlow.call(method, path, body);
        expect
          .soft(
            REFUSED,
            `${route} with the victim's ${key} → ${response.status} ${JSON.stringify(response.body).slice(0, 300)}`,
          )
          .toContain(response.status);
      }
      const own = await attackFlow.call(method, path, JSON.parse(base));
      if (own.status !== 200) {
        unproven.push(`${route} → ${own.status} ${JSON.stringify(own.body).slice(0, 200)}`);
      }
    }
    expect(swaps).toBeGreaterThan(25);
    expect.soft(unproven, 'each write goes through with the attacker’s own records').toEqual([]);
  });

  it('answers a filter naming another organization’s record with nothing of anyone’s', async () => {
    attackFlow.as('owner');
    let filters = 0;
    for (const [path, params] of Object.entries(LIST_FILTERS)) {
      for (const [param, key] of Object.entries(params)) {
        filters += 1;
        const response = await attackFlow.call(
          'GET',
          `${path}?${param}=${encodeURIComponent(victimReferences[key])}`,
        );
        const label = `GET ${path}?${param}=<victim ${key}> → ${response.status} ${JSON.stringify(response.body).slice(0, 300)}`;
        if (response.status === 200) {
          // An empty page: neither the victim's rows nor the attacker's own, unfiltered.
          expect.soft((response.body as { data?: unknown } | null)?.data, label).toEqual([]);
        } else {
          expect.soft(REFUSED, label).toContain(response.status);
        }
      }
    }
    expect(filters).toBeGreaterThan(30);
  });
});
