import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { operatorQuery } from '@/tests/helpers/operator-database.js';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { injectAuthenticated } from '@/tests/helpers/test-http-inject.helper.js';
import { withRedisSemaphore } from '@/infrastructure/cache/redis-semaphore.util.js';
import {
  APP_EXPORT_CONCURRENCY_PER_ORGANIZATION,
  appExportSlotKey,
} from '@/domains/app/app-export-gate.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/** One staged audit row of the fixture organization. */
interface OutboxRow {
  action: string;
  actor_user_public_id: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Exports and clinical reads leave a trail (B1-3, G2-3) and exports are throttled (D-4): every
 * download stages an `app.<resource>.export` audit row — who, the filters (free text only as
 * `has_search`), the row count, whether the medical cells were in it, never a row — and a
 * clinical record's list and read stage `.list` / `.read` rows with their counts; a clinic builds
 * at most two exports at once, a third is a 429 with `Retry-After`.
 */
describe('App exports and clinical reads — integration (B1-3, G2-3, D-4)', () => {
  const S = String(Date.now());

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let patient = '';

  /** The organization's staged audit rows of `action`, newest first. */
  async function staged(action: string): Promise<OutboxRow[]> {
    return operatorQuery<OutboxRow[]>`
      SELECT action, actor_user_public_id, metadata FROM audit.outbox
      WHERE organization_public_id = ${fixture.organization.publicId} AND action = ${action}
      ORDER BY id DESC
    `;
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture).as('owner');
    await flow.expect(200, 'a contact', 'POST', '/app/contacts', {
      first_name: 'Ojas',
      last_name: `e${S}`,
      phones: [{ phone: `+915${S.slice(-7)}61`, is_primary: true }],
    });
    await flow.expect(200, 'a file with medical details', 'POST', '/app/patients', {
      contact_id: flow.last('.data.id'),
      home_branch_id: fixture.branches.vesu,
      allergies: ['Sulfa'],
    });
    patient = flow.last('.data.id');
  });

  afterAll(async () => {
    await app.close();
  });

  it('B1-3: an export stages who, the filters and the count — never a row', async () => {
    flow.as('accountant');
    await flow.expect(
      200,
      'the accountant exports',
      'GET',
      `/app/patients/exports?q=e${S}&status=new`,
    );
    flow.expectValue('one row', '.data.row_count', 1);
    const [row] = await staged('app.patient.export');
    expect(row?.actor_user_public_id).toBe(fixture.members.accountant.userPublicId);
    expect(row?.metadata).toMatchObject({
      row_count: 1,
      is_truncated: false,
      medical_columns: false,
      filters: { status: 'new', has_search: true },
    });
    expect(JSON.stringify(row?.metadata), 'no search text, no row data').not.toMatch(
      new RegExp(`e${S}|Ojas|Sulfa`),
    );
  });

  it('G2-3: a clinical list and read stage their counts', async () => {
    flow.as('doctor');
    const notes = `/app/patients/${patient}/clinical-notes`;
    await flow.expect(200, 'a note', 'POST', notes, { kind: 'finding', text: 'Dry patches' });
    const note = flow.last('.data.id');
    await flow.expect(200, 'the notes', 'GET', `${notes}?kind=finding`);
    await flow.expect(200, 'the note', 'GET', `${notes}/${note}`);

    const [list] = await staged('app.patient_clinical_note.list');
    expect(list?.metadata).toMatchObject({
      row_count: 1,
      parent_public_id: patient,
      filters: { kind: 'finding' },
      file_links_issued: 0,
    });
    const [read] = await staged('app.patient_clinical_note.read');
    expect(read?.metadata).toMatchObject({ patient_clinical_note_public_id: note });
    expect(read?.actor_user_public_id).toBe(fixture.members.doctor.userPublicId);
  });

  it('D-4: a third export while two are being built is a 429 with Retry-After', async () => {
    flow.as('owner');
    let releaseHeld: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      releaseHeld = resolve;
    });
    let slotsTaken = 0;
    let bothTaken: () => void = () => undefined;
    const taken = new Promise<void>((resolve) => {
      bothTaken = resolve;
    });
    const holders = Array.from({ length: APP_EXPORT_CONCURRENCY_PER_ORGANIZATION }, () =>
      withRedisSemaphore({
        options: {
          key: appExportSlotKey(fixture.organization.publicId),
          limit: APP_EXPORT_CONCURRENCY_PER_ORGANIZATION,
          ttlSeconds: 60,
        },
        fn: async () => {
          slotsTaken += 1;
          if (slotsTaken === APP_EXPORT_CONCURRENCY_PER_ORGANIZATION) bothTaken();
          await held;
        },
      }),
    );
    await taken;
    try {
      const refused = await flow.call('GET', '/app/offerings/exports');
      expect(refused.status).toBe(429);
      flow.expectValue('why', '.error.reason', 'export_busy');
    } finally {
      releaseHeld();
      await Promise.all(holders);
    }
    await flow.expect(200, 'a slot is free again', 'GET', '/app/offerings/exports');
  });

  it('D-4: the 429 carries Retry-After', async () => {
    let releaseHeld: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      releaseHeld = resolve;
    });
    const key = appExportSlotKey(fixture.organization.publicId);
    const holders = Array.from({ length: APP_EXPORT_CONCURRENCY_PER_ORGANIZATION }, () =>
      withRedisSemaphore({
        options: { key, limit: APP_EXPORT_CONCURRENCY_PER_ORGANIZATION, ttlSeconds: 60 },
        fn: () => held,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      const response = await injectAuthenticated(app, {
        method: 'GET',
        url: testApiPath('/app/tasks/exports'),
        token: fixture.members.owner.token,
      });
      expect(response.statusCode).toBe(429);
      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    } finally {
      releaseHeld();
      await Promise.all(holders);
    }
  });
});
