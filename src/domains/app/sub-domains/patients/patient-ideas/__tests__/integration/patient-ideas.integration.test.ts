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
 * Launch ROUTE #152, ideas from history (routes-final 7.N): the prototype's rules on a patient's
 * history, the plan's offerings left out, and the route's 404 and 403 — over the fixture
 * organization.
 */
describe('Patient ideas — integration (routes-final 7.N, ROUTE #152)', () => {
  const S = String(Date.now());
  const lastName = `x${S}`;
  const digits = `7${S.slice(-7)}`;
  const PHONE = `+91${digits}61`;

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let consultation = '';
  let prp = '';
  let lhrPackage = '';
  let patient = '';
  let ideas = '';

  /** A new active offering; returns its public id. */
  async function offering(body: Record<string, unknown>): Promise<string> {
    await flow.expect(200, `offering ${String(body.name)}`, 'POST', '/app/offerings', body);
    return flow.last('.data.id');
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    flow.as('owner');
    consultation = await offering({ name: `Consultation ${S}`, price: 500 });
    // On the menu, but no complaint here asks for it
    await offering({ name: `Chemical peel ${S}`, price: 2500 });
    prp = await offering({ name: `PRP hair ${S}`, price: 6000 });
    lhrPackage = await offering({ name: `LHR full face package ${S}`, price: 18000, sessions: 6 });
    await flow.expect(200, 'a patient file with its contact', 'POST', '/app/patients', {
      contact: {
        first_name: 'Ideaa',
        last_name: lastName,
        phones: [{ phone: PHONE, is_primary: true }],
      },
      home_branch_id: fixture.branches.vesu,
    });
    patient = flow.last('.data.id');
    ideas = `/app/patients/${patient}/offering-ideas`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. rules: a first visit starts with a consultation', async () => {
    flow.as('front_desk');
    await flow.expect(200, 'the ideas', 'GET', ideas);
    flow.expectValue(
      'one idea: the consultation, from the rules',
      '[(.data | length), .data[0].offering_id, .data[0].source, .data[0].price] | map(tostring) | join(",")',
      `1,${consultation},first,500`,
    );
  });

  it('2. rules: complaints and history; the plan is left out', async () => {
    flow.as('owner');
    await flow.expect(200, 'a complaint', 'POST', `/app/patients/${patient}/clinical-notes`, {
      kind: 'complaint',
      text: 'Hair fall since June',
    });

    await flow.expect(200, 'the ideas', 'GET', ideas);
    flow.expectValue(
      'hair fall → PRP; with no visit, no consultation once an idea is found',
      '[.data[] | "\\(.offering_id)|\\(.source)|\\(.reason)"] | join(",")',
      `${prp}|history|Complaint · hair fall`,
    );

    await flow.expect(
      200,
      'PRP in the plan',
      'POST',
      `/app/patients/${patient}/offering-suggestions`,
      {
        offering_id: prp,
      },
    );
    await flow.expect(200, 'the ideas again', 'GET', ideas);
    flow.expectValue(
      'a planned offering is never an idea',
      `[.data[] | select(.offering_id == "${prp}")] | length`,
      0,
    );

    for (const name of ['LHR full face', 'LHR full face']) {
      await flow.expect(
        200,
        `a done treatment: ${name}`,
        'POST',
        `/app/patients/${patient}/treatments`,
        {
          name,
        },
      );
    }
    await flow.expect(200, 'the ideas after two sessions', 'GET', ideas);
    flow.expectValue(
      'two visits → the LHR package',
      `[.data[] | select(.offering_id == "${lhrPackage}") | .source] | join(",")`,
      'consistency',
    );
  });

  it('3. the route: unknown and other organizations are 404, no patient:read is 403', async () => {
    flow.as('owner');
    await flow.expect(
      404,
      'an unknown patient',
      'GET',
      '/app/patients/pat_aaaaaaaaaaaaaaaaaaaaa/offering-ideas',
    );
    const other = await createAppFixture(app);
    const otherFlow = new AppFlow(app, other);
    otherFlow.as('owner');
    await otherFlow.expect(404, "another clinic's patient", 'GET', ideas);

    flow.as('marketing');
    await flow.expect(200, 'marketing reads the ideas (patient:read)', 'GET', ideas);
    flow.as('owner');
    const permissions = `/tenancy/organization/roles/${fixture.roles.marketing}/permissions`;
    await flow.expect(200, "marketing's permissions", 'GET', permissions);
    const granted = flow.lastBody() as { data: { permission_code: string }[] };
    const kept = granted.data
      .map((permission) => permission.permission_code)
      .filter((code) => code !== 'patient:read');
    await flow.expect(200, 'marketing loses patient:read', 'PUT', permissions, {
      permission_codes: kept,
    });
    flow.as('marketing');
    await flow.expect(403, 'marketing reads no ideas', 'GET', ideas);
  });
});
