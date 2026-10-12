import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import {
  loadRouteAuthorizationModel,
  MODEL_EXPECTED_ATTACKER_STATUS,
} from '@/tests/helpers/route-authorization-model.js';
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
  insertConfirmedUpload,
  seedAppRecordOfEveryKind,
} from '@/domains/app/__tests__/factories/app-records.factory.js';
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

  /**
   * A read with each signed link cut to the object it points at: a photo's or report file's link
   * is signed afresh on every read (D86), so an unchanged record answers a new signature each time.
   */
  function withoutSignatures(data: unknown): unknown {
    if (data === undefined) return undefined;
    return JSON.parse(JSON.stringify(data), (_key, field: unknown) =>
      typeof field === 'string' && field.includes('X-Amz-Signature=') ? field.split('?')[0] : field,
    );
  }

  /** Every modelled GET as the victim's owner (the front desk for their own saved view). */
  async function snapshotVictim(): Promise<Record<string, unknown>> {
    const snapshot: Record<string, unknown> = {};
    for (const route of routes.filter((candidate) => candidate.method === 'GET')) {
      victimFlow.as(route.entry.model === 'user' ? 'front_desk' : 'owner');
      const response = await victimFlow.call('GET', victimPath(route.path));
      snapshot[route.key] = {
        status: response.status,
        data: withoutSignatures((response.body as { data?: unknown } | null)?.data),
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
    Object.assign(victimIds, await seedAppRecordOfEveryKind({ app, fixture: victim }));

    attackFlow.as('owner');
    await attackFlow.expect(200, 'attacker: an offering of their own', 'POST', '/app/offerings', {
      name: 'Attacker consult',
      price: 100,
    });
    attackerOffering = attackFlow.last('.data.id');
    attackerUpload = await insertConfirmedUpload({ fixture: attacker, name: 'attacker-photo.jpg' });
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
