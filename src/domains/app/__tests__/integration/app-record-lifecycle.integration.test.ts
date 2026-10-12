import { afterAll, beforeAll, describe, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow } from '@/domains/app/__tests__/factories/app-flow.factory.js';
import {
  addDaysToCalendarDate,
  calendarDateInTimeZone,
} from '@/shared/utils/validation/record-fields.util.js';

/** `YYYY-MM-DD` in the organization's time zone, `days` from today. */
function calendarDay(timeZone: string, days: number): string {
  return addDaysToCalendarDate({ date: calendarDateInTimeZone({ timeZone }), days });
}

/**
 * The change, delete and restore of the records no section flow walks end to end — a branch's
 * rooms, machines and holidays and its team (§1), the medical store's manufacturers and MRs
 * (§11), the diagnosis list, prescription kits and offering suggestions (§7), and a removed team
 * member and role (§2): each answers its declared success, and a restored record reads again.
 */
describe('App records — change, delete and restore', () => {
  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Creates through `collection`, changes, deletes (`?reason=mistake`) and restores one record. */
  async function walkLifecycle(options: {
    label: string;
    collection: string;
    create: Record<string, unknown>;
    change: Record<string, unknown>;
    changed: { expression: string; value: string };
  }): Promise<void> {
    const { label, collection } = options;
    await flow.expect(200, `add a ${label}`, 'POST', collection, options.create);
    const record = `${collection}/${flow.last('.data.id')}`;
    await flow.expect(200, `change the ${label}`, 'PATCH', record, options.change);
    flow.expectValue(`the ${label} changed`, options.changed.expression, options.changed.value);
    await flow.expect(204, `delete the ${label}`, 'DELETE', `${record}?reason=mistake`);
    await flow.expect(404, `the deleted ${label} is gone`, 'GET', record);
    await flow.expect(200, `restore the ${label}`, 'POST', `${record}/restore`);
    flow.expectValue(`the restored ${label} is live`, '.data.deleted_at', 'null');
    await flow.expect(200, `the restored ${label} reads again`, 'GET', record);
  }

  it("1. a branch's rooms, machines and holidays, and its team", async () => {
    const branch = `/app/branches/${fixture.branches.adajan}`;
    flow.as('owner');
    await walkLifecycle({
      label: 'room',
      collection: `${branch}/rooms`,
      create: { name: 'Room 4' },
      change: { name: 'Laser room' },
      changed: { expression: '.data.name', value: 'Laser room' },
    });
    await walkLifecycle({
      label: 'machine',
      collection: `${branch}/machines`,
      create: { name: 'Diode laser' },
      change: { name: 'Diode laser 2' },
      changed: { expression: '.data.name', value: 'Diode laser 2' },
    });
    await walkLifecycle({
      label: 'holiday',
      collection: `${branch}/holidays`,
      create: {
        holiday_date: calendarDay(fixture.organization.timezone, 40),
        label: 'Festival',
      },
      change: { label: 'Uttarayan' },
      changed: { expression: '.data.label', value: 'Uttarayan' },
    });

    await flow.expect(200, 'set who works at Adajan', 'PUT', `${branch}/members`, {
      membership_ids: [
        fixture.members.owner.membershipPublicId,
        fixture.members.front_desk.membershipPublicId,
      ],
    });
    await flow.expect(
      200,
      'who works at Adajan now',
      'GET',
      `/app/memberships?branch_id=${fixture.branches.adajan}`,
    );
    flow.expectValue(
      'the owner and the front desk',
      '[.data[].id] | sort | join(",")',
      [fixture.members.owner.membershipPublicId, fixture.members.front_desk.membershipPublicId]
        .sort()
        .join(','),
    );
  });

  it("2. the medical store's manufacturers and MRs", async () => {
    flow.as('owner');
    await walkLifecycle({
      label: 'manufacturer',
      collection: '/app/manufacturers',
      create: { name: 'Alvi Pharma' },
      change: { tone: 'mint' },
      changed: { expression: '.data.tone', value: 'mint' },
    });
    await walkLifecycle({
      label: 'medical rep',
      collection: '/app/medical-reps',
      create: { name: 'Rakesh Shah' },
      change: { name: 'Rakesh S.' },
      changed: { expression: '.data.name', value: 'Rakesh S.' },
    });
  });

  it('3. diagnoses, prescription kits and offering suggestions', async () => {
    flow.as('owner');
    await walkLifecycle({
      label: 'diagnosis',
      collection: '/app/patient-diagnoses',
      create: { name: 'Melasma' },
      change: { name: 'Melasma (epidermal)' },
      changed: { expression: '.data.name', value: 'Melasma (epidermal)' },
    });

    await flow.expect(200, 'a quick medicine', 'POST', '/app/medicines', {
      name: 'Kojic cream',
      is_quick: true,
    });
    const medicine = flow.last('.data.id');
    await walkLifecycle({
      label: 'prescription kit',
      collection: '/app/prescription-kits',
      create: {
        name: 'Melasma kit',
        items: [
          {
            medicine_name: 'Kojic cream',
            medicine_id: medicine,
            dose_night: 1,
            meal: 'after',
            quantity: 1,
          },
        ],
      },
      change: { name: 'Melasma kit (night)' },
      changed: { expression: '.data.name', value: 'Melasma kit (night)' },
    });

    await flow.expect(200, 'an offering', 'POST', '/app/offerings', {
      name: 'Glow peel',
      price: 2500,
    });
    const offering = flow.last('.data.id');
    await flow.expect(200, 'a patient', 'POST', '/app/patients', {
      contact: {
        first_name: 'Hetal',
        phones: [{ phone: '+919812377001', is_primary: true }],
      },
      home_branch_id: fixture.branches.vesu,
    });
    const patient = flow.last('.data.id');
    await walkLifecycle({
      label: 'offering suggestion',
      collection: `/app/patients/${patient}/offering-suggestions`,
      create: { offering_id: offering, quantity: 1 },
      change: { quantity: 2 },
      changed: { expression: '.data.quantity', value: '2' },
    });
  });

  it('4. a removed team member and a deleted role come back', async () => {
    flow.as('owner');
    const member = `/tenancy/organization/memberships/${fixture.members.marketing.membershipPublicId}`;
    await flow.expect(204, 'remove the marketing member', 'DELETE', `${member}?reason=mistake`);
    await flow.expect(200, 'restore them', 'POST', `${member}/restore`);
    await flow.expect(200, 'they read again', 'GET', member);
    flow.expectValue('active again', '.data.status', 'active');

    await flow.expect(200, 'a new role', 'POST', '/tenancy/organization/roles', {
      name: 'Night desk',
    });
    const role = `/tenancy/organization/roles/${flow.last('.data.id')}`;
    await flow.expect(204, 'delete the role', 'DELETE', `${role}?reason=not_needed`);
    await flow.expect(200, 'restore the role', 'POST', `${role}/restore`);
    await flow.expect(200, 'the role reads again', 'GET', role);
    flow.expectValue('its name', '.data.name', 'Night desk');
  });
});
