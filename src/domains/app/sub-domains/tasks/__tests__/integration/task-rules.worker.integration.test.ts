import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Queue, QueueEvents } from 'bullmq';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorSql } from '@/tests/helpers/operator-database.js';
import {
  getBullMQConnectionOptions,
  getBullMQKeyPrefix,
} from '@/infrastructure/queue/connection.js';
import type { WorkerHandle } from '@/infrastructure/queue/bootstrap.js';
import { TASK_RULES_QUEUE_NAME } from '@/domains/app/sub-domains/tasks/queues/task-rules.queue.js';
import { TASK_RULES_SWEEP_QUEUE_NAME } from '@/domains/app/sub-domains/tasks/workers/task-rules.constants.js';
import { createTaskRulesSweepWorker } from '@/domains/app/sub-domains/tasks/workers/task-rules-sweep.worker.js';
import { createTaskRulesWorker } from '@/domains/app/sub-domains/tasks/workers/task-rules.worker.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow } from '@/domains/app/__tests__/factories/app-flow.factory.js';
import { TASK_DONE_BY_CLINOZY } from '@/domains/app/sub-domains/tasks/tasks.constants.js';

/** How long one tick may take: the sweep, then the organization's job. */
const TICK_TIMEOUT_MS = 20_000;

/**
 * A lead's hold running out on the real clock, released by the real workers (task A3,
 * docs/reviews/launch-confidence-plan-2026-10-09.md; D40, L9, TK4): the five-minute sweep job and
 * the organization's task rules job run on BullMQ as in production. A hold three seconds long:
 * while it runs, another member's claim is a 409 and a tick opens nothing; once it has passed —
 * by waiting, not by moving the clock — a tick opens the Claim task, the other member takes the
 * lead, and the next tick closes the task as done by the app.
 */
describe('Task rules worker — a lead hold running out (A3, D40)', () => {
  const S = String(Date.now());

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let sweepWorker: WorkerHandle | null = null;
  let rulesWorker: WorkerHandle | null = null;
  let sweepQueue: Queue | null = null;
  let rulesEvents: QueueEvents | null = null;

  /**
   * One tick of the five-minute schedule: a sweep job, then waits for this organization's task
   * rules job (`task-rules-<organization>-<uuid>`) to finish.
   */
  async function tick(): Promise<void> {
    const prefix = `task-rules-${fixture.organization.publicId}-`;
    const finished = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('no task rules job finished')),
        TICK_TIMEOUT_MS,
      );
      const done = ({ jobId }: { jobId: string }) => {
        if (!jobId.startsWith(prefix)) return;
        clearTimeout(timer);
        rulesEvents?.off('completed', done);
        rulesEvents?.off('failed', done);
        resolve();
      };
      rulesEvents?.on('completed', done);
      rulesEvents?.on('failed', done);
    });
    await sweepQueue?.add('sweep', {}, { jobId: `task-rules-sweep-${randomUUID()}`, attempts: 1 });
    await finished;
  }

  /** The lead's Claim tasks on a tab, everyone's. */
  async function claimTasks(lead: string, tab: string): Promise<void> {
    flow.as('owner');
    await flow.expect(
      200,
      `the claim tasks (${tab})`,
      'GET',
      `/app/tasks?scope=everyone&tab=${tab}&rule_key=claim&lead_id=${lead}`,
    );
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    sweepWorker = createTaskRulesSweepWorker();
    rulesWorker = createTaskRulesWorker();
    sweepQueue = new Queue(TASK_RULES_SWEEP_QUEUE_NAME, {
      connection: getBullMQConnectionOptions(),
      prefix: getBullMQKeyPrefix(),
    });
    rulesEvents = new QueueEvents(TASK_RULES_QUEUE_NAME, {
      connection: getBullMQConnectionOptions(),
      prefix: getBullMQKeyPrefix(),
    });
    await rulesEvents.waitUntilReady();
    await sweepWorker.worker?.waitUntilReady();
    await rulesWorker.worker?.waitUntilReady();
  });

  afterAll(async () => {
    await sweepWorker?.close();
    await rulesWorker?.close();
    await sweepQueue?.close();
    await rulesEvents?.close();
    await app.close();
  });

  it('holds while the hold runs, opens the Claim task once it has passed, closes it when taken', async () => {
    flow.as('owner');
    await flow.expect(200, 'a contact', 'POST', '/app/contacts', {
      first_name: 'Sana',
      last_name: `h${S}`,
      phones: [{ phone: `+918${S.slice(-7)}21`, is_primary: true }],
    });
    await flow.expect(200, "the counsellor's lead", 'POST', '/app/leads', {
      contact_id: flow.last('.data.id'),
      source: 'walk_in',
      branch_id: fixture.branches.vesu,
      owner_membership_id: fixture.members.counsellor.membershipPublicId,
    });
    const lead = flow.last('.data.id');
    const [hold] = await getOperatorSql()<{ ends_at: string }[]>`
      UPDATE app.leads SET held_until = now() + interval '3 seconds'
      WHERE public_id = ${lead} RETURNING to_char(held_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS ends_at
    `;
    const endsAt = Date.parse(hold?.ends_at ?? '');

    flow.as('front_desk');
    await flow.expect(409, 'another member, while it runs', 'POST', `/app/leads/${lead}/claim`);
    flow.expectValue('held: why', '.error.reason', 'lead_held');
    await tick();
    await claimTasks(lead, 'open');
    flow.expectValue('a tick while held — no Claim task', '.data | length', 0);

    await new Promise((resolve) => setTimeout(resolve, Math.max(0, endsAt - Date.now()) + 500));
    await tick();
    await claimTasks(lead, 'open');
    flow.expectValue(
      'the hold has passed — a Claim task in the counsellor queue',
      '[(.data | length), .data[0].owner_role] | map(tostring) | join(",")',
      '1,counsellor',
    );
    const claimTask = flow.last('.data[0].id');

    flow.as('front_desk');
    await flow.expect(200, 'now the front desk takes it', 'POST', `/app/leads/${lead}/claim`);
    flow.expectValue(
      'the new owner',
      '.data.owner_membership_id',
      fixture.members.front_desk.membershipPublicId,
    );
    await tick();
    flow.as('owner');
    await flow.expect(200, 'the Claim task', 'GET', `/app/tasks/${claimTask}`);
    flow.expectValue(
      'held again — closed by the app',
      '[.data.status, .data.result_text] | join(",")',
      `done,${TASK_DONE_BY_CLINOZY}`,
    );
  });
});
