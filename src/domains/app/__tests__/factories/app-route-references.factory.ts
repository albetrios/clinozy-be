import type { FastifyInstance } from 'fastify';
import type { AppFixture } from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';
import {
  type AppRouteReferences,
  placeholderAppRouteReferences,
} from '@/tests/helpers/app-route-requests.js';

/**
 * The app's collection writes: their bodies name records, their paths none. The patient comes
 * first: its own write files the contact as a patient, which an invoice needs.
 */
export const APP_COLLECTION_WRITES = [
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
 * One real record of every kind a request body names, made through the API as `fixture`'s owner —
 * the references a cross-organization test swaps in, or a matrix fills its tables from.
 *
 * @remarks
 * - **Algorithm:** a contact (`phone` keeps it unique across fixtures), an offering, a
 *   manufacturer, its supplier, a medicine with one batch a year out, a stock vendor and a stock
 *   item; the branch and members come from the fixture; `today` / `yesterday` / `tomorrow` are the
 *   organization's calendar days. `laterDay` stays the placeholder's — see
 *   {@link findBookableDay}.
 * - **Failure modes:** a write that does not answer 200 fails the calling test.
 */
export async function seedAppRouteReferences(options: {
  app: FastifyInstance;
  fixture: AppFixture;
  phone: string;
}): Promise<AppRouteReferences> {
  const { fixture } = options;
  const flow = new AppFlow(options.app, fixture).as('owner');
  const created = async (path: string, body: unknown): Promise<string> => {
    await flow.expect(200, `${fixture.organization.publicId}: POST ${path}`, 'POST', path, body);
    return flow.last('.data.id');
  };
  const [year = 0, month = 1] = calendarDay(fixture, 0).split('-').map(Number);
  const contactId = await created('/app/contacts', {
    first_name: 'Asha',
    last_name: 'Reference',
    phones: [{ phone: options.phone, is_primary: true }],
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

/**
 * A day 30–44 days out on which `references`' doctor takes a booking — found with a probe booking
 * at 15:00 (so a later booking at 11:00 that day is clear of it).
 *
 * @remarks
 * - **Failure modes:** throws when the doctor takes no booking in those two weeks.
 * - **Side effects:** leaves the probe booking in place.
 */
export async function findBookableDay(options: {
  flow: AppFlow;
  fixture: AppFixture;
  references: AppRouteReferences;
}): Promise<string> {
  for (let offset = 30; offset <= 44; offset += 1) {
    const day = calendarDay(options.fixture, offset);
    const probe = await options.flow.call('POST', '/app/appointments', {
      contact_id: options.references.contactId,
      branch_id: options.references.branchId,
      doctor_membership_id: options.references.doctorMembershipId,
      appointment_date: day,
      start_time: '15:00',
      service_label: 'Probe',
    });
    if (probe.status === 200) return day;
  }
  throw new Error('the doctor takes no booking in the next weeks');
}
