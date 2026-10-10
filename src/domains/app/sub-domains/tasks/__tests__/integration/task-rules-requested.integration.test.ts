import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorSql } from '@/tests/helpers/operator-database.js';
import type { WorkerHandle } from '@/infrastructure/queue/bootstrap.js';
import { runOrganizationScopedWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { createTaskRulesWorker } from '@/domains/app/sub-domains/tasks/workers/task-rules.worker.js';
import { runTaskRulesJob } from '@/domains/app/sub-domains/tasks/workers/task-rules.processor.js';
import { TASK_DONE_BY_CLINOZY } from '@/domains/app/sub-domains/tasks/tasks.constants.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/** How long a requested run may take to land: the after-commit enqueue, then the job. */
const RUN_TIMEOUT_MS = 20_000;

/** How often the state is read while waiting for the run. */
const POLL_INTERVAL_MS = 200;

/**
 * The task rules run on request (D81 T7, WC-48): a write that changes what a rule reads asks for
 * the organization's `task-rules` job after its commit, so its task opens or closes at once rather
 * than at the next five-minute sweep. The real `task-rules` worker runs on BullMQ and no sweep is
 * scheduled — a task moving here moved only because a write asked for the run: a call received
 * opens the person's Reply task and the reply sent closes it; a booking's confirm closes its Confirm
 * task.
 */
describe('Task rules — the run a write asks for (D81 T7, WC-48)', () => {
  const S = String(Date.now());
  const lastName = `q${S}`;
  const digits = `6${S.slice(-7)}`;

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let rulesWorker: WorkerHandle | null = null;

  /** Reads `path` through `expression` until it prints `want` — the requested run landed. */
  async function untilRun(options: {
    label: string;
    path: string;
    expression: string;
    want: string;
  }): Promise<void> {
    const deadline = Date.now() + RUN_TIMEOUT_MS;
    const read = async () => {
      await flow.call('GET', options.path);
      return flow.last(options.expression);
    };
    let got = await read();
    while (got !== options.want && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      got = await read();
    }
    expect(got, options.label).toBe(options.want);
  }

  /** A contact of this run with its own number. */
  async function person(firstName: string, suffix: string): Promise<string> {
    await flow.expect(200, `contact ${firstName}`, 'POST', '/app/contacts', {
      first_name: firstName,
      last_name: lastName,
      phones: [{ phone: `+91${digits}${suffix}`, is_primary: true }],
    });
    return flow.last('.data.id');
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    rulesWorker = createTaskRulesWorker();
    await rulesWorker.worker?.waitUntilReady();
  });

  afterAll(async () => {
    await rulesWorker?.close();
    await app.close();
  });

  it('a call in opens the Reply task, the reply sent closes it', async () => {
    flow.as('front_desk');
    const dev = await person('Dev', '41');
    await flow.expect(200, "Dev's lead", 'POST', '/app/leads', {
      contact_id: dev,
      branch_id: fixture.branches.vesu,
    });
    await flow.expect(200, 'Dev called in', 'POST', `/app/contacts/${dev}/activities/log-call`, {
      direction: 'received',
      body: 'Asked about the price',
    });
    const replyTasks = `/app/tasks?scope=everyone&rule_key=reply&contact_id=${dev}`;
    await untilRun({
      label: 'the call asked for the run — a Reply task',
      path: replyTasks,
      expression: '[(.data | length), .data[0].status] | map(tostring) | join(",")',
      want: '1,open',
    });
    const replyTask = flow.last('.data[0].id');

    await flow.expect(
      200,
      'the front desk replies on WhatsApp',
      'POST',
      `/app/contacts/${dev}/activities/send-message`,
      { type: 'whatsapp', body: 'Hi <first>, the price list is on its way' },
    );
    await untilRun({
      label: 'the reply asked for the run — the Reply task closed by the app',
      path: `/app/tasks/${replyTask}`,
      expression: '[.data.status, .data.result_text] | join(",")',
      want: `done,${TASK_DONE_BY_CLINOZY}`,
    });
  });

  it("a booking's confirm closes its Confirm task", async () => {
    flow.as('owner');
    const esha = await person('Esha', '42');
    let visit = '';
    for (let offset = 30; offset <= 44 && visit === ''; offset += 1) {
      const booked = await flow.call('POST', '/app/appointments', {
        contact_id: esha,
        branch_id: fixture.branches.vesu,
        doctor_membership_id: fixture.members.doctor.membershipPublicId,
        appointment_date: calendarDay(fixture, offset),
        start_time: '11:00',
        service_label: 'Consultation',
      });
      if (booked.status === 200) visit = flow.last('.data.id');
    }
    expect(visit, 'book Esha').not.toBe('');
    // Tomorrow (moved in the database — any weekday), then one run opens its Confirm task.
    await getOperatorSql()`
      UPDATE app.appointments SET appointment_date = ${calendarDay(fixture, 1)}
      WHERE public_id = ${visit}
    `;
    const organizationPublicId = fixture.organization.publicId;
    await runOrganizationScopedWorkerJob({ organizationPublicId }, (databaseHandle) =>
      runTaskRulesJob(databaseHandle, organizationPublicId),
    );
    await flow.expect(
      200,
      'the Confirm task',
      'GET',
      `/app/tasks?scope=everyone&rule_key=confirm&appointment_id=${visit}`,
    );
    flow.expectValue('open', '[(.data | length), .data[0].status] | join(",")', '1,open');
    const confirmTask = flow.last('.data[0].id');

    flow.as('front_desk');
    await flow.expect(
      200,
      'Esha confirms on the phone',
      'POST',
      `/app/appointments/${visit}/confirm`,
    );
    await untilRun({
      label: 'the status change asked for the run — the Confirm task closed by the app',
      path: `/app/tasks/${confirmTask}`,
      expression: '[.data.status, .data.result_text] | join(",")',
      want: `done,${TASK_DONE_BY_CLINOZY}`,
    });
  });
});
