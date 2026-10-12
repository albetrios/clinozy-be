import { afterAll, beforeAll, describe, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/**
 * Household numbers moving (task C1, docs/reviews/launch-confidence-plan-2026-10-09.md;
 * routes-final 4.A, CT2, CT3): a contact moving between households takes its numbers along —
 * refused while it carries a number another member of the old household still holds; the primary
 * number taken away moves `primary_phone` and the search off it, frees it for another household,
 * and a set with no primary is refused.
 */
describe('Contacts — household numbers moving (CT2, CT3)', () => {
  const S = String(Date.now());
  const lastName = `h${S}`;
  const digits = `4${S.slice(-7)}`;
  const phone = (suffix: string) => `+91${digits}${suffix}`;
  const NAMES = '[.data[].first_name] | sort | join(",")';
  const FIELDS = '[.error.errors[].field] | join(",")';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;

  /** A contact of this run; answers its id. */
  async function contact(
    firstName: string,
    phones: { phone: string; is_primary?: boolean }[],
    extra: Record<string, unknown> = {},
  ): Promise<string> {
    await flow.expect(200, `contact ${firstName}`, 'POST', '/app/contacts', {
      first_name: firstName,
      last_name: lastName,
      phones,
      ...extra,
    });
    return flow.last('.data.id');
  }

  /** The run's contacts holding a number (the list's `phone` filter). */
  async function holders(number: string): Promise<void> {
    await flow.expect(
      200,
      `who holds ${number}`,
      'GET',
      `/app/contacts?phone=${encodeURIComponent(number)}&q=${lastName}`,
    );
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture).as('owner');
  });

  afterAll(async () => {
    await app.close();
  });

  it("a move takes its numbers along — refused while it carries the old household's shared one", async () => {
    const rita = await contact('Rita', [{ phone: phone('01'), is_primary: true }]);
    const mohan = await contact(
      'Mohan',
      [{ phone: phone('02'), is_primary: true }, { phone: phone('01') }],
      { household_contact_id: rita },
    );
    const sita = await contact('Sita', [{ phone: phone('03'), is_primary: true }]);

    await flow.expect(
      409,
      "Mohan to Sita's, still sharing Rita's number",
      'PATCH',
      `/app/contacts/${mohan}`,
      {
        household_contact_id: sita,
      },
    );
    flow.expectValue('the shared number: why', '.error.reason', 'contact_phone_exists');
    await flow.expect(200, 'Mohan', 'GET', `/app/contacts/${mohan}`);
    flow.expectValue("still Rita's", '.data.household_contact_id', rita);

    await flow.expect(
      200,
      "Mohan to Sita's with his own number only",
      'PATCH',
      `/app/contacts/${mohan}`,
      {
        household_contact_id: sita,
        phones: [{ phone: phone('02'), is_primary: true }],
      },
    );
    flow.expectValue("now Sita's", '.data.household_contact_id', sita);
    await flow.expect(200, "Sita's household", 'GET', `/app/contacts?household_contact_id=${sita}`);
    flow.expectValue('Mohan with Sita', NAMES, 'Mohan,Sita');
    await flow.expect(200, "Rita's household", 'GET', `/app/contacts?household_contact_id=${rita}`);
    flow.expectValue('Rita alone', NAMES, 'Rita');
    await holders(phone('02'));
    flow.expectValue('his number went with him', NAMES, 'Mohan');
    await holders(phone('01'));
    flow.expectValue("Rita's number stayed with her", NAMES, 'Rita');

    await flow.expect(409, "Sita takes Rita's number", 'PATCH', `/app/contacts/${sita}`, {
      phones: [{ phone: phone('03'), is_primary: true }, { phone: phone('01') }],
    });
    flow.expectValue("another household's: why", '.error.reason', 'contact_phone_exists');
  });

  it('the primary number taken away: primary_phone and the search move off it, and it is free again', async () => {
    const asha = await contact('Asha', [
      { phone: phone('11'), is_primary: true },
      { phone: phone('12') },
    ]);
    const other = await contact('Bina', [{ phone: phone('13'), is_primary: true }]);

    await flow.expect(400, 'a set with no primary', 'PATCH', `/app/contacts/${asha}`, {
      phones: [{ phone: phone('12') }, { phone: phone('14') }],
    });
    flow.expectValue('no primary: field', FIELDS, 'body.phones');

    await flow.expect(
      200,
      'the second number is the primary now',
      'PATCH',
      `/app/contacts/${asha}`,
      {
        phones: [{ phone: phone('12'), is_primary: true }],
      },
    );
    flow.expectValue(
      'primary_phone follows; one number',
      '[.data.primary_phone, (.data.phones | length)] | map(tostring) | join(",")',
      `${phone('12')},1`,
    );
    await holders(phone('11'));
    flow.expectValue('nobody holds the old one', '.data | length', 0);
    await flow.expect(200, 'search its digits', 'GET', `/app/contacts?q=${digits}11`);
    flow.expectValue('the search moved off it', '.data | length', 0);

    await flow.expect(200, 'another household takes it', 'PATCH', `/app/contacts/${other}`, {
      phones: [{ phone: phone('13'), is_primary: true }, { phone: phone('11') }],
    });
    await holders(phone('11'));
    flow.expectValue('Bina holds it now', NAMES, 'Bina');
  });
});
