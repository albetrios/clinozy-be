import { afterAll, beforeAll, describe, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';
import {
  addDaysToCalendarDate,
  subtractYearsFromCalendarDate,
} from '@/shared/utils/validation/record-fields.util.js';

/**
 * A contact registered by age (feat-approximate-age AG1–AG4): a typed `age` stores an approximate
 * birth date and its flag, a real date clears the flag, `null` clears both, both at once is a 400;
 * every Contact answers its `age` on the organization's today; the contacts, patients and leads
 * lists filter by an age range, real and approximate dates alike.
 */
describe('Contacts — age instead of a birth date (feat-approximate-age)', () => {
  const S = String(Date.now());
  /** This run's last name — `q=${lastName}` lists only this run's people. */
  const lastName = `y${S}`;
  const digits = `8${S.slice(-7)}`;
  const NAMES = '[.data[].first_name] | join(",")';
  const FIELDS = '[.error.errors[].field] | join(",")';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let today = '';
  let asha = '';
  let bina = '';
  let chitra = '';
  let dina = '';

  /** A create body for this run with one primary number ending in `ending`. */
  function contactBody(firstName: string, ending: string, extra: Record<string, unknown> = {}) {
    return {
      first_name: firstName,
      last_name: lastName,
      phones: [{ phone: `+91${digits}${ending}`, is_primary: true }],
      ...extra,
    };
  }

  /** The birth date of someone `years` old today. */
  const yearsAgo = (years: number) => subtractYearsFromCalendarDate({ date: today, years });

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    today = calendarDay(fixture, 0);
  });

  afterAll(async () => {
    await app.close();
  });

  it('create: a typed age is an approximate birth date (AG1, AG2, AG3)', async () => {
    flow.as('owner');
    await flow.expect(200, 'create Asha, 34', 'POST', '/app/contacts', {
      ...contactBody('Asha', '01', { age: 34 }),
    });
    asha = flow.last('.data.id');
    flow.expectValue('Asha: today − 34 years', '.data.date_of_birth', yearsAgo(34));
    flow.expectValue('Asha: approximate', '.data.date_of_birth_is_approximate', true);
    flow.expectValue('Asha: age 34', '.data.age', 34);

    await flow.expect(200, 'create Bina, born 40 years ago', 'POST', '/app/contacts', {
      ...contactBody('Bina', '02', { date_of_birth: yearsAgo(40) }),
    });
    bina = flow.last('.data.id');
    flow.expectValue('Bina: a real date', '.data.date_of_birth_is_approximate', false);
    flow.expectValue('Bina: age 40', '.data.age', 40);

    await flow.expect(200, 'create Chitra, no birth date', 'POST', '/app/contacts', {
      ...contactBody('Chitra', '03'),
    });
    chitra = flow.last('.data.id');
    flow.expectValue('Chitra: no age', '.data.age == null', true);
    flow.expectValue('Chitra: not approximate', '.data.date_of_birth_is_approximate', false);

    await flow.expect(200, 'create Dina, a day short of 61', 'POST', '/app/contacts', {
      ...contactBody('Dina', '04', {
        date_of_birth: addDaysToCalendarDate({ date: yearsAgo(61), days: 1 }),
      }),
    });
    dina = flow.last('.data.id');
    flow.expectValue('Dina: still 60', '.data.age', 60);

    await flow.expect(400, 'age and date_of_birth both', 'POST', '/app/contacts', {
      ...contactBody('Both', '05', { age: 30, date_of_birth: yearsAgo(30) }),
    });
    flow.expectValue('both: field', FIELDS, 'body.age');
    await flow.expect(400, 'age 121', 'POST', '/app/contacts', {
      ...contactBody('Old', '05', { age: 121 }),
    });
    flow.expectValue('age 121: field', FIELDS, 'body.age');
    await flow.expect(400, 'age 3.5', 'POST', '/app/contacts', {
      ...contactBody('Half', '05', { age: 3.5 }),
    });
    flow.expectValue('age 3.5: field', FIELDS, 'body.age');
  });

  it('change: age turns the flag on, a date off, null clears both (AG2)', async () => {
    flow.as('owner');
    await flow.expect(200, 'Chitra: age 25', 'PATCH', `/app/contacts/${chitra}`, { age: 25 });
    flow.expectValue('Chitra: today − 25 years', '.data.date_of_birth', yearsAgo(25));
    flow.expectValue('Chitra: approximate', '.data.date_of_birth_is_approximate', true);
    flow.expectValue('Chitra: age 25', '.data.age', 25);

    await flow.expect(200, 'Chitra: cleared', 'PATCH', `/app/contacts/${chitra}`, {
      date_of_birth: null,
    });
    flow.expectValue('cleared: no date', '.data.date_of_birth == null', true);
    flow.expectValue('cleared: no flag', '.data.date_of_birth_is_approximate', false);
    flow.expectValue('cleared: no age', '.data.age == null', true);

    await flow.expect(200, 'Chitra: age 25 again', 'PATCH', `/app/contacts/${chitra}`, {
      age: 25,
    });
    await flow.expect(200, 'Dina: age 60', 'PATCH', `/app/contacts/${dina}`, { age: 60 });
    flow.expectValue('Dina: approximate', '.data.date_of_birth_is_approximate', true);
    await flow.expect(200, 'Dina: her real date', 'PATCH', `/app/contacts/${dina}`, {
      date_of_birth: addDaysToCalendarDate({ date: yearsAgo(61), days: 1 }),
    });
    flow.expectValue('Dina: a real date again', '.data.date_of_birth_is_approximate', false);
    flow.expectValue('Dina: 60', '.data.age', 60);

    await flow.expect(400, 'PATCH age and date_of_birth', 'PATCH', `/app/contacts/${dina}`, {
      age: 61,
      date_of_birth: null,
    });
    flow.expectValue('PATCH both: field', FIELDS, 'body.age');

    await flow.expect(200, 'read Asha', 'GET', `/app/contacts/${asha}`);
    flow.expectValue('read: age', '.data.age', 34);
    flow.expectValue('read: approximate', '.data.date_of_birth_is_approximate', true);
    await flow.expect(200, 'Asha preview', 'GET', `/app/contacts/${asha}/preview`);
    flow.expectValue('preview: age', '.data.age', 34);
  });

  it('the contacts list filters by age, real and approximate alike (AG4)', async () => {
    flow.as('owner');
    const list = `/app/contacts?q=${lastName}`;
    await flow.expect(200, '30–40', 'GET', `${list}&age_from=30&age_to=40`);
    flow.expectValue('30–40: Asha (approx.), Bina (real)', NAMES, 'Asha,Bina');
    flow.expectValue('list items carry age', '[.data[].age] | join(",")', '34,40');
    await flow.expect(200, 'from 41', 'GET', `${list}&age_from=41`);
    flow.expectValue('from 41: Dina', NAMES, 'Dina');
    await flow.expect(200, 'from 60 to 60', 'GET', `${list}&age_from=60&age_to=60`);
    flow.expectValue('exactly 60: Dina, a day before 61', NAMES, 'Dina');
    await flow.expect(200, 'up to 29', 'GET', `${list}&age_to=29`);
    flow.expectValue('up to 29: Chitra', NAMES, 'Chitra');
    await flow.expect(200, 'from 41 to 40', 'GET', `${list}&age_from=41&age_to=40`);
    flow.expectValue('an empty range: none', '.data | length', 0);
    await flow.expect(400, 'age_from abc', 'GET', `${list}&age_from=abc`);
    await flow.expect(400, 'age_to 121', 'GET', `${list}&age_to=121`);
  });

  it('the patients and leads lists filter by their contact’s age (AG4)', async () => {
    flow.as('owner');
    for (const contact of [asha, bina]) {
      await flow.expect(200, 'a patient file', 'POST', '/app/patients', {
        contact_id: contact,
        home_branch_id: fixture.branches.vesu,
      });
    }
    await flow.expect(200, 'patients up to 35', 'GET', `/app/patients?q=${lastName}&age_to=35`);
    flow.expectValue('patients up to 35: Asha', '[.data[].contact_id] | join(",")', asha);
    await flow.expect(200, 'patients from 36', 'GET', `/app/patients?q=${lastName}&age_from=36`);
    flow.expectValue('patients from 36: Bina', '[.data[].contact_id] | join(",")', bina);

    for (const contact of [bina, dina]) {
      await flow.expect(200, 'a lead', 'POST', '/app/leads', { contact_id: contact });
    }
    await flow.expect(200, 'leads 40', 'GET', `/app/leads?q=${lastName}&age_from=40&age_to=40`);
    flow.expectValue('leads exactly 40: Bina', '[.data[].contact_id] | join(",")', bina);
    await flow.expect(200, 'leads from 50', 'GET', `/app/leads?q=${lastName}&age_from=50`);
    flow.expectValue('leads from 50: Dina', '[.data[].contact_id] | join(",")', dina);
  });
});
