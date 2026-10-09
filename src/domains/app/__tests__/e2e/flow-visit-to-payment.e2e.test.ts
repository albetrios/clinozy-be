import { afterAll, beforeAll, describe, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/** One prescription line as the API answers it. */
type PrescriptionLine = {
  medicine_id: string | null;
  quantity: number;
};

/**
 * Launch ROUTE #149 — Flow 2, visit → prescription → sale → payment (flow-visit-to-payment.1, PRD
 * 3.2; the medicine sale is back with D75): the doctor sees the patient from Today and saves a
 * quick-line prescription (`adapalene 0-0-1 face 4w`, parsed by the app into a line); Save & sell
 * opens the sale prefilled from its lines and the stock leaves by earliest expiry (MD5); the
 * front desk receives it by UPI and the ledger shows the receipt.
 */
describe('Flow 2 — visit, prescription, sale, payment (launch ROUTE #149)', () => {
  const S = String(Date.now());
  const T = `v${S}`;
  const digits = `9${S.slice(-7)}`;
  const MRP = 450;

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let vesu = '';
  let doctor = '';
  let today = '';
  let adapalene = '';
  let contact = '';

  /** `YYYY-MM` of the month `months` after today's. */
  function monthFrom(months: number): string {
    const [year = 0, month = 1] = today.split('-').map(Number);
    const total = year * 12 + (month - 1) + months;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    vesu = fixture.branches.vesu;
    doctor = fixture.members.doctor.membershipPublicId;
    today = calendarDay(fixture, 0);

    flow.as('owner');
    await flow.expect(200, 'a manufacturer', 'POST', '/app/manufacturers', {
      name: `Galderma ${T}`,
    });
    const manufacturer = flow.last('.data.id');
    // The later batch is listed first: the sale must still take the earlier expiry first.
    await flow.expect(200, 'a medicine in two batches', 'POST', '/app/medicines', {
      name: `Adapalene ${T}`,
      composition: 'Adapalene 0.1%',
      manufacturer_id: manufacturer,
      mrp: MRP,
      batches: [
        { batch_number: 'L1', expiry_month: monthFrom(18), quantity: 5, purchase_rate: 300 },
        { batch_number: 'E1', expiry_month: monthFrom(6), quantity: 1, purchase_rate: 300 },
      ],
    });
    adapalene = flow.last('.data.id');
    await flow.expect(200, 'the patient', 'POST', '/app/contacts', {
      first_name: 'Neel',
      last_name: T,
      phones: [{ phone: `+91${digits}01`, is_primary: true }],
    });
    contact = flow.last('.data.id');
  });

  afterAll(async () => {
    await app.close();
  });

  it('flow-visit-to-payment.1: quick-line prescription → Save & sell by earliest expiry → UPI receipt in the ledger', async () => {
    // The visit is on Today: a walk-in, checked in on arrival (the check-in opens the file).
    flow.as('front_desk');
    await flow.expect(200, 'a walk-in at Vesu', 'POST', '/app/appointments', {
      contact_id: contact,
      branch_id: vesu,
      doctor_membership_id: doctor,
      service_label: 'Consultation',
      is_walk_in: true,
    });
    const visit = flow.last('.data.id');
    flow.expectValue(
      'on the floor today',
      '[.data.status, .data.appointment_date] | join(",")',
      `checked_in,${today}`,
    );
    const patient = flow.last('.data.patient_id');

    // 1. The doctor opens the patient from Today → Prescriptions → New prescription.
    flow.as('doctor');
    await flow.expect(
      200,
      "Today's floor",
      'GET',
      `/app/appointments?status=checked_in&appointment_date_from=${today}&appointment_date_to=${today}&branch_id=${vesu}`,
    );
    flow.expectValue('the visit is on the floor', `[.data[].id] | index("${visit}") != null`, true);
    await flow.expect(200, 'the patient file', 'GET', `/app/patients/${patient}`);

    // 2. Quick line `adapalene 0-0-1 face 4w` ↵ → one line: dose, where, quantity. Save & sell.
    const prescriptions = `/app/patients/${patient}/prescriptions`;
    await flow.expect(200, 'the quick-line prescription', 'POST', prescriptions, {
      doctor_membership_id: doctor,
      prescription_date: today,
      appointment_id: visit,
      items: [
        {
          medicine_name: `Adapalene ${T}`,
          medicine_id: adapalene,
          dose_morning: 0,
          dose_afternoon: 0,
          dose_night: 1,
          body_part: 'face',
          quantity: 2,
          remarks: '4 weeks',
        },
      ],
    });
    const prescription = flow.last('.data.id');
    flow.expectValue(
      'the line as typed',
      '[.data.items[0].dose_morning, .data.items[0].dose_afternoon, .data.items[0].dose_night, .data.items[0].body_part, .data.items[0].quantity] | map(tostring) | join(",")',
      '0,0,1,face,2',
    );
    await flow.expect(200, 'save: approved', 'POST', `${prescriptions}/${prescription}/approve`);
    flow.expectValue('approved', '.data.status', 'approved');

    // 3. The sale drawer opens prefilled from the prescription; stock leaves by earliest expiry.
    flow.as('pharmacist');
    await flow.expect(
      200,
      'the pharmacy queue',
      'GET',
      `/app/patient-prescriptions?status=approved&is_filled=false&patient_id=${patient}`,
    );
    flow.expectValue(
      'the prescription is to fill',
      `[.data[].id] | index("${prescription}") != null`,
      true,
    );
    await flow.expect(200, 'the prescription to sell', 'GET', `${prescriptions}/${prescription}`);
    const lines = (flow.lastBody() as { data: { items: PrescriptionLine[] } }).data.items;
    await flow.expect(200, 'sell it, prefilled', 'POST', '/app/medical-sales', {
      branch_id: vesu,
      contact_id: contact,
      patient_prescription_id: prescription,
      member_ids: [doctor],
      items: lines.map((line) => ({ medicine_id: line.medicine_id, quantity: line.quantity })),
    });
    const sale = flow.last('.data.id');
    const invoice = flow.last('.data.invoice.id');
    flow.expectValue(
      'unpaid, on its prescription and the patient',
      '[.data.status, .data.patient_prescription_id, .data.patient_id, .data.invoice.total, .data.invoice.due_amount] | map(tostring) | join(",")',
      `unpaid,${prescription},${patient},${MRP * 2},${MRP * 2}`,
    );
    flow.expectValue(
      'E1 (the earliest expiry) first, then L1 (MD5)',
      '[.data.items[] | "\\(.batch_number)x\\(.quantity)"] | join(",")',
      'E1x1,L1x1',
    );
    await flow.expect(200, 'the medicine after', 'GET', `/app/medicines/${adapalene}`);
    flow.expectValue(
      'E1 empty, L1 four left',
      '[.data.quantity, ([.data.batches[] | select(.batch_number == "L1") | .quantity] | first)] | map(tostring) | join(",")',
      '4,4',
    );

    // 4. Front desk → Receive → amount, mode UPI → Save. The ledger shows it Received.
    flow.as('front_desk');
    await flow.expect(200, 'receive by UPI', 'POST', '/app/payments', {
      kind: 'receipt',
      branch_id: vesu,
      contact_id: contact,
      invoice_id: invoice,
      splits: [{ mode: 'upi', amount: MRP * 2 }],
    });
    const receipt = flow.last('.data.id');
    flow.expectValue(
      'PAY-n, received, UPI',
      '[(.data.payment_number > 0), .data.direction, .data.amount, (.data.splits | map("\\(.mode):\\(.amount)") | join("+"))] | map(tostring) | join(",")',
      `true,received,${MRP * 2},upi:${MRP * 2}`,
    );
    await flow.expect(
      200,
      "the ledger — today's UPI",
      'GET',
      `/app/payments?mode=upi&paid_date_from=${today}&paid_date_to=${today}&contact_id=${contact}`,
    );
    flow.expectValue('the receipt is in the ledger', '[.data[].id] | join(",")', receipt);
    flow.as('pharmacist');
    await flow.expect(200, 'the sale after', 'GET', `/app/medical-sales/${sale}`);
    flow.expectValue(
      'paid in full',
      '[.data.status, .data.invoice.paid_amount, .data.invoice.due_amount] | map(tostring) | join(",")',
      `paid,${MRP * 2},0`,
    );
    await flow.expect(
      200,
      'filled prescriptions',
      'GET',
      `/app/patient-prescriptions?is_filled=true&patient_id=${patient}`,
    );
    flow.expectValue(
      'the prescription is filled',
      `[.data[].id] | index("${prescription}") != null`,
      true,
    );
  });
});
