import nock from 'nock';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/** The AI ideas switch (`PATIENT_IDEAS_AI_ENABLED`, off in the harness) — each case sets it. */
const state = vi.hoisted(() => ({ aiEnabled: false }));
vi.mock('@/infrastructure/ai/anthropic-messages.config.js', () => ({
  isPatientIdeasAiEnabled: () => state.aiEnabled,
}));

import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { operatorQuery } from '@/tests/helpers/operator-database.js';
import { anthropicCircuit } from '@/infrastructure/resilience/circuit-breaker.js';
import { ProviderOutageError } from '@/infrastructure/queue/worker-runtime/provider-outage-pause.util.js';
import { runGlobalRetentionWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow } from '@/domains/app/__tests__/factories/app-flow.factory.js';
import { findOrganizationsWithStaleIdeas } from '@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.repository.js';
import { runPatientIdeasJob } from '@/domains/app/sub-domains/patients/patient-ideas/workers/patient-ideas.processor.js';

const ANTHROPIC = 'https://api.anthropic.com';

/**
 * Launch ROUTE #152, ideas from history (routes-final 7.N, D80, WC-47): the prototype's rules on a
 * patient's history, the plan's offerings left out, the writes that mark a patient stale, the
 * refresh job asking Claude (answered by nock) with a de-identified summary and storing its ideas,
 * Data consent withdrawn, a throttle, and the route's 404 and 403 — over the fixture organization.
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
  let peel = '';
  let prp = '';
  let lhrPackage = '';
  let patient = '';
  let ideas = '';

  /** A new active offering; returns its public id. */
  async function offering(body: Record<string, unknown>): Promise<string> {
    await flow.expect(200, `offering ${String(body.name)}`, 'POST', '/app/offerings', body);
    return flow.last('.data.id');
  }

  /** The patient's stale mark, or `null`. */
  async function staleSince(): Promise<string | null> {
    const [row] = await operatorQuery<{ stale_since: string | null }[]>`
      SELECT ideas_stale_since::text AS stale_since FROM app.patients WHERE public_id = ${patient}
    `;
    return row?.stale_since ?? null;
  }

  /** The organizations the sweep would add a job for. */
  async function sweptOrganizations(): Promise<string[]> {
    const rows = await runGlobalRetentionWorkerJob((databaseHandle) =>
      findOrganizationsWithStaleIdeas(databaseHandle, 0),
    );
    return rows.map((row) => row.publicId);
  }

  /** Claude answers the next request with these ideas; returns the captured request body. */
  function claudeAnswers(answer: { offering_id: string; reason: string }[]) {
    const captured: { body?: Record<string, unknown> } = {};
    nock(ANTHROPIC)
      .post('/v1/messages', (body: Record<string, unknown>) => {
        captured.body = body;
        return true;
      })
      .matchHeader('x-api-key', 'test-anthropic-api-key')
      .reply(200, { content: [{ type: 'text', text: JSON.stringify({ ideas: answer }) }] });
    return captured;
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    flow.as('owner');
    consultation = await offering({ name: `Consultation ${S}`, price: 500 });
    peel = await offering({ name: `Chemical peel ${S}`, price: 2500 });
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

  afterEach(async () => {
    state.aiEnabled = false;
    nock.cleanAll();
    await anthropicCircuit.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. rules: a first visit starts with a consultation', async () => {
    flow.as('front_desk');
    await flow.expect(200, 'the ideas', 'GET', ideas);
    flow.expectValue(
      'one idea: the consultation, from the rules',
      '[(.data | length), .data[0].offering_id, .data[0].source, .data[0].price, .meta.source, (.meta.ai_refreshed_at | tostring)] | map(tostring) | join(",")',
      `1,${consultation},first,500,rules,null`,
    );
  });

  it('2. rules: complaints and history; the plan is left out; each write marks the file stale', async () => {
    flow.as('owner');
    expect(await staleSince()).toBeNull();
    await flow.expect(200, 'a complaint', 'POST', `/app/patients/${patient}/clinical-notes`, {
      kind: 'complaint',
      text: 'Hair fall since June',
    });
    const afterNote = await staleSince();
    expect(afterNote).not.toBeNull();
    expect(await sweptOrganizations()).toContain(fixture.organization.publicId);

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
    expect(Date.parse((await staleSince()) ?? '')).toBeGreaterThanOrEqual(
      Date.parse(afterNote ?? ''),
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

  it('3. the refresh asks Claude with a de-identified summary and stores its ideas', async () => {
    flow.as('owner');
    await flow.expect(200, 'Data consent given', 'PATCH', `/app/patients/${patient}`, {
      has_data_consent: true,
    });
    state.aiEnabled = true;
    const captured = claudeAnswers([
      { offering_id: peel, reason: 'Keeps the skin clear between sessions' },
      { offering_id: prp, reason: 'Already planned — dropped' },
      { offering_id: 'ofr_notonthemenuaaaaaaa', reason: 'Invented — dropped' },
    ]);

    const counts = await runPatientIdeasJob(fixture.organization.publicId);

    expect(counts).toEqual({
      refreshedCount: 1,
      removedCount: 0,
      unreadCount: 0,
      supersededCount: 0,
      cappedCount: 0,
    });
    expect(await staleSince()).toBeNull();
    expect(await sweptOrganizations()).not.toContain(fixture.organization.publicId);
    const messages = (captured.body?.messages ?? []) as { content: string }[];
    const sent = JSON.parse(messages[0]?.content ?? '{}') as { patient: { complaints: string[] } };
    expect(sent.patient.complaints).toEqual(['hair fall']);
    const raw = JSON.stringify(captured.body);
    expect(raw).toContain(peel);
    // PI6: never the note's text, a name, a number or an id of the patient
    for (const identifying of ['since June', 'Ideaa', lastName, digits, patient]) {
      expect(raw).not.toContain(identifying);
    }

    flow.as('doctor');
    await flow.expect(200, 'the AI ideas', 'GET', ideas);
    flow.expectValue(
      "Claude's one usable idea, with the refresh time",
      '[(.data | length), .data[0].offering_id, .data[0].source, .data[0].reason, .meta.source, (.meta.ai_refreshed_at != null)] | map(tostring) | join(",")',
      `1,${peel},ai,Keeps the skin clear between sessions,ai,true`,
    );

    state.aiEnabled = false;
    await flow.expect(200, 'the AI switched off', 'GET', ideas);
    flow.expectValue('the rules again', '.meta.source', 'rules');
  });

  it('4. Data consent withdrawn: the rules at once, and the refresh deletes the stored ideas', async () => {
    flow.as('owner');
    state.aiEnabled = true;
    await flow.expect(200, 'Data consent withdrawn', 'PATCH', `/app/patients/${patient}`, {
      has_data_consent: false,
    });
    expect(await staleSince()).not.toBeNull();
    await flow.expect(200, 'the ideas', 'GET', ideas);
    flow.expectValue('never AI without consent', '.meta.source', 'rules');

    expect((await runPatientIdeasJob(fixture.organization.publicId)).removedCount).toBe(1);
    const [row] = await operatorQuery<{ count: string }[]>`
      SELECT count(*)::text AS count FROM app.patient_ideas i
        JOIN app.patients p ON p.id = i.patient_id WHERE p.public_id = ${patient}
    `;
    expect(row?.count).toBe('0');
  });

  it('5. a throttle pauses the queue and keeps the mark for the next run', async () => {
    flow.as('owner');
    await flow.expect(200, 'Data consent given again', 'PATCH', `/app/patients/${patient}`, {
      has_data_consent: true,
    });
    state.aiEnabled = true;
    nock(ANTHROPIC)
      .post('/v1/messages')
      .reply(
        429,
        { type: 'error', error: { type: 'rate_limit_error', message: 'Slow down' } },
        {
          'retry-after': '4',
        },
      );

    const error = await runPatientIdeasJob(fixture.organization.publicId).catch((caught) => caught);

    expect(error).toBeInstanceOf(ProviderOutageError);
    expect((error as ProviderOutageError).retryAfterMs).toBe(4_000);
    expect(await staleSince()).not.toBeNull();
  });

  it('6. the route: unknown and other organizations are 404, no patient:read is 403', async () => {
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
