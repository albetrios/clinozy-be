import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { runOrganizationScopedWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { RETENTION_WORKER_CONCURRENCY } from '@/infrastructure/queue/worker-runtime/worker-options.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';
import {
  runTaskRulesJob,
  type TaskRulesRunCounts,
} from '@/domains/app/sub-domains/tasks/workers/task-rules.processor.js';

/** Records that keep a rule's task open in the organization — the "50 open rules" of R2. */
const OPEN_RECORD_COUNT = 50;
/** The organizations one sweep adds a job for, at the scale R2 asks about. */
const ORGANIZATION_COUNT = 500;
/** The sweep's cron interval. */
const SWEEP_INTERVAL_MS = 5 * 60_000;

/**
 * The task rules at scale (task R2, docs/reviews/launch-confidence-plan-2026-10-09.md; TK4): one
 * organization with 50 records keeping rule tasks open — half leads to follow up, half unpaid bills —
 * runs its rules once to open them and again at rest. The run at rest is what each of the 500
 * organizations costs every five minutes: one worker (concurrency 1) runs them one after another,
 * so 500 runs at rest must fit well inside the interval. The measured times are logged for the plan.
 */
describe('Performance: the task rules sweep at 500 organizations', () => {
  const S = String(Date.now());
  const T = `r${S}`;
  const digits = `5${S.slice(-7)}`;
  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;

  /** One timed run of the organization's rules. */
  async function timedRun(): Promise<{ elapsedMs: number; counts: TaskRulesRunCounts }> {
    const organizationPublicId = fixture.organization.publicId;
    const started = performance.now();
    const counts = await runOrganizationScopedWorkerJob({
      job: { organizationPublicId },
      processor: (handle) => runTaskRulesJob({ databaseHandle: handle, organizationPublicId }),
    });
    return { elapsedMs: performance.now() - started, counts };
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture).as('owner');
    await flow.expect(200, 'an offering', 'POST', '/app/offerings', {
      name: `Consult ${T}`,
      price: 500,
    });
    const consult = flow.last('.data.id');
    for (let index = 0; index < OPEN_RECORD_COUNT; index += 1) {
      const suffix = String(10 + index).padStart(2, '0');
      await flow.expect(200, `contact ${index}`, 'POST', '/app/contacts', {
        first_name: `Load${index}`,
        last_name: T,
        phones: [{ phone: `+91${digits}${suffix}`, is_primary: true }],
      });
      const contact = flow.last('.data.id');
      if (index % 2 === 0) {
        await flow.expect(200, `lead ${index}`, 'POST', '/app/leads', {
          contact_id: contact,
          branch_id: fixture.branches.vesu,
          owner_membership_id: fixture.members.counsellor.membershipPublicId,
          follow_up_at: new Date(Date.now() - 86_400_000).toISOString(),
        });
      } else {
        await flow.expect(200, `file ${index}`, 'POST', '/app/patients', {
          contact_id: contact,
          home_branch_id: fixture.branches.vesu,
        });
        await flow.expect(200, `bill ${index}`, 'POST', '/app/invoices', {
          branch_id: fixture.branches.vesu,
          contact_id: contact,
          invoice_date: calendarDay(fixture, -2),
          items: [{ offering_id: consult, quantity: 1 }],
        });
      }
    }
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  it('opens the 50 tasks once, then runs at rest fast enough for 500 organizations every five minutes', async () => {
    const first = await timedRun();
    expect(first.counts.openedCount, 'every record opened its task').toBeGreaterThanOrEqual(
      OPEN_RECORD_COUNT,
    );
    const atRest = [];
    for (let run = 0; run < 5; run += 1) atRest.push(await timedRun());
    expect(atRest.every((run) => run.counts.openedCount === 0)).toBe(true);
    const restMs = atRest.map((run) => run.elapsedMs).sort((a, b) => a - b)[2] ?? 0;
    const projectedSweepMs = (ORGANIZATION_COUNT * restMs) / RETENTION_WORKER_CONCURRENCY;
    process.stdout.write(
      `task-rules scale: first run ${first.elapsedMs.toFixed(0)} ms (opened ${first.counts.openedCount}), at rest ${restMs.toFixed(0)} ms (median of 5); ${ORGANIZATION_COUNT} organizations ≈ ${(projectedSweepMs / 1000).toFixed(0)} s per sweep on one worker\n`,
    );
    expect(projectedSweepMs, 'half the interval, with margin').toBeLessThan(SWEEP_INTERVAL_MS / 2);
  }, 120_000);
});
