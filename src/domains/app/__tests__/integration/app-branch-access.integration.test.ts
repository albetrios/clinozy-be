import { afterAll, beforeAll, describe, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import {
  type AppFixture,
  type AppFixtureRole,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/**
 * Branch access in every branch-scoped section (task P2,
 * docs/reviews/launch-confidence-plan-2026-10-09.md; D9 — a member sees and writes their own
 * branches, all of them only with `branch:read`): the fixture's members work at Vesu only, so a
 * record the owner writes at Adajan is a 404 to them, absent from their lists, and their own write
 * at Adajan is a 400 on `branch_id` — while the same write at Vesu goes through (the control).
 */
describe('Branch access — integration (D9)', () => {
  const S = String(Date.now());
  const T = `b${S}`;
  const digits = `1${S.slice(-7)}`;
  const FIELDS = '[.error.errors[].field] | join(",")';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let owner: AppFlow;
  let vesu = '';
  let adajan = '';
  let doctor = '';
  let workDay = '';
  let contactSuffix = 10;

  /** A flow acting as one fixture member. */
  const as = (role: AppFixtureRole) => new AppFlow(app, fixture).as(role);

  /** A contact (with a patient file) of this run, made by the owner. */
  async function person(firstName: string): Promise<string> {
    contactSuffix += 1;
    await owner.expect(200, `contact ${firstName}`, 'POST', '/app/contacts', {
      first_name: firstName,
      last_name: T,
      phones: [{ phone: `+91${digits}${contactSuffix}`, is_primary: true }],
    });
    const contact = owner.last('.data.id');
    await owner.expect(200, `${firstName}'s file`, 'POST', '/app/patients', {
      contact_id: contact,
      home_branch_id: vesu,
    });
    return contact;
  }

  /**
   * The three checks for one section: the Adajan record is a 404 to `role`, missing from its list,
   * and `role`'s own write at Adajan is a 400 on `branch_id` — while the same write at Vesu works.
   */
  async function expectBranchWalled(options: {
    role: AppFixtureRole;
    path: string;
    adajanRecord: string;
    write: (branch: string) => Record<string, unknown>;
  }): Promise<void> {
    const member = as(options.role);
    await member.expect(404, 'the Adajan record', 'GET', `${options.path}/${options.adajanRecord}`);
    await member.expect(200, 'the list', 'GET', `${options.path}?limit=100`);
    member.expectValue(
      'the list leaves it out',
      `[.data[] | select(.id == "${options.adajanRecord}")] | length`,
      0,
    );
    await member.expect(400, 'a write at Adajan', 'POST', options.path, options.write(adajan));
    member.expectValue('Adajan: field', FIELDS, 'branch_id');
    await member.expect(
      200,
      'the same write at Vesu (control)',
      'POST',
      options.path,
      options.write(vesu),
    );
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    owner = new AppFlow(app, fixture).as('owner');
    vesu = fixture.branches.vesu;
    adajan = fixture.branches.adajan;
    doctor = fixture.members.doctor.membershipPublicId;
    const timeZone = fixture.organization.timezone;
    for (let offset = 3; workDay === '' && offset < 10; offset += 1) {
      const at = new Date(Date.now() + offset * 86_400_000);
      if (new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(at) !== 'Sun') {
        workDay = new Intl.DateTimeFormat('en-CA', { timeZone }).format(at);
      }
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('appointments', async () => {
    const contact = await person('Anu');
    const booking = (branch: string, start: string) => ({
      contact_id: contact,
      branch_id: branch,
      doctor_membership_id: doctor,
      appointment_date: workDay,
      start_time: start,
      service_label: 'Consultation',
    });
    await owner.expect(
      200,
      'a booking at Adajan',
      'POST',
      '/app/appointments',
      booking(adajan, '10:00'),
    );
    const starts = ['12:00', '13:00'];
    await expectBranchWalled({
      role: 'front_desk',
      path: '/app/appointments',
      adajanRecord: owner.last('.data.id'),
      write: (branch) => booking(branch, starts.shift() ?? '14:00'),
    });
  });

  it('leads', async () => {
    await owner.expect(200, 'a lead at Adajan', 'POST', '/app/leads', {
      contact_id: await person('Bina'),
      source: 'walk_in',
      branch_id: adajan,
    });
    const adajanLead = owner.last('.data.id');
    const contacts = [await person('Charu'), await person('Disha')];
    await expectBranchWalled({
      role: 'front_desk',
      path: '/app/leads',
      adajanRecord: adajanLead,
      write: (branch) => ({ contact_id: contacts.shift(), source: 'walk_in', branch_id: branch }),
    });
  });

  it('invoices', async () => {
    owner.as('owner');
    await owner.expect(200, 'an offering', 'POST', '/app/offerings', {
      name: `Consult ${T}`,
      price: 500,
    });
    const offering = owner.last('.data.id');
    const contact = await person('Esha');
    const bill = (branch: string) => ({
      branch_id: branch,
      contact_id: contact,
      items: [{ offering_id: offering, quantity: 1 }],
    });
    await owner.expect(200, 'a bill at Adajan', 'POST', '/app/invoices', bill(adajan));
    await expectBranchWalled({
      role: 'front_desk',
      path: '/app/invoices',
      adajanRecord: owner.last('.data.id'),
      write: bill,
    });
  });

  it('payments', async () => {
    const contact = await person('Gita');
    const receipt = (branch: string) => ({
      kind: 'receipt',
      branch_id: branch,
      contact_id: contact,
      splits: [{ mode: 'cash', amount: 100 }],
    });
    await owner.expect(200, 'a receipt at Adajan', 'POST', '/app/payments', receipt(adajan));
    await expectBranchWalled({
      role: 'front_desk',
      path: '/app/payments',
      adajanRecord: owner.last('.data.id'),
      write: receipt,
    });
  });

  it('day closes', async () => {
    let daysBack = 5;
    const open = (branch: string) => {
      const at = new Date(Date.now() - daysBack * 86_400_000);
      daysBack += 1;
      return {
        branch_id: branch,
        close_date: new Intl.DateTimeFormat('en-CA', {
          timeZone: fixture.organization.timezone,
        }).format(at),
      };
    };
    await owner.expect(200, 'a day opened at Adajan', 'POST', '/app/day-closes', open(adajan));
    await expectBranchWalled({
      role: 'front_desk',
      path: '/app/day-closes',
      adajanRecord: owner.last('.data.id'),
      write: open,
    });
  });

  it('medical sales', async () => {
    await owner.expect(200, 'a manufacturer', 'POST', '/app/manufacturers', { name: `Sun ${T}` });
    await owner.expect(200, 'a medicine', 'POST', '/app/medicines', {
      name: `Azelaic ${T}`,
      composition: 'Azelaic acid 20%',
      manufacturer_id: owner.last('.data.id'),
      mrp: 250,
      batches: [{ batch_number: 'A1', expiry_month: '2031-06', quantity: 10, purchase_rate: 150 }],
    });
    const medicine = owner.last('.data.id');
    const contact = await person('Hema');
    const sale = (branch: string) => ({
      branch_id: branch,
      contact_id: contact,
      items: [{ medicine_id: medicine, quantity: 1 }],
    });
    await owner.expect(200, 'a sale at Adajan', 'POST', '/app/medical-sales', sale(adajan));
    await expectBranchWalled({
      role: 'pharmacist',
      path: '/app/medical-sales',
      adajanRecord: owner.last('.data.id'),
      write: sale,
    });
  });
});
