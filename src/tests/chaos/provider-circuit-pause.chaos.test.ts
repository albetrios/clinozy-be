import { randomUUID } from 'node:crypto';
import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { type Job, Queue, type Worker } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import { env } from '@/shared/config/env.config.js';
import { redisConnection } from '@/infrastructure/cache/redis.client.js';
import {
  getBullMQConnectionOptions,
  getBullMQKeyPrefix,
} from '@/infrastructure/queue/connection.js';
import { getDefaultWorkerOptions } from '@/infrastructure/queue/worker-runtime/worker-options.js';
import {
  createProviderPausableWorker,
  type QueueProvider,
} from '@/infrastructure/queue/worker-runtime/provider-outage-pause.util.js';
import { getProviderPauseLeftMs } from '@/infrastructure/queue/worker-runtime/provider-pause.util.js';
import {
  anthropicCircuit,
  type CircuitBreaker,
  metaCircuit,
} from '@/infrastructure/resilience/circuit-breaker.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { operatorQuery } from '@/tests/helpers/operator-database.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow } from '@/domains/app/__tests__/factories/app-flow.factory.js';
import { runContactMessageDeliveryJob } from '@/domains/app/sub-domains/contacts/contact-activities/workers/contact-message-delivery.processor.js';
import { runPatientIdeasJob } from '@/domains/app/sub-domains/patients/patient-ideas/workers/patient-ideas.processor.js';

const GRAPH = 'https://graph.facebook.com';
const ANTHROPIC = 'https://api.anthropic.com';
/** The pause the replicas take on an outage — five minutes in production, short here. */
const PAUSE_MS = 2_000;

/** Polls until `condition` holds. */
async function waitFor(condition: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * The circuit's reset window passes: its last failure moved a minute and more into the past in
 * Redis, where every replica reads it — what the 60-second wait would do, without the wait.
 */
async function letResetWindowPass(circuitName: QueueProvider): Promise<void> {
  const key = `circuit:${circuitName}`;
  const raw = await redisConnection.get(key);
  if (raw === null) throw new Error(`no ${circuitName} circuit state`);
  const state = JSON.parse(raw) as { lastFailureTime: number };
  await redisConnection.set(
    key,
    JSON.stringify({ ...state, lastFailureTime: Date.now() - 2 * 60_000 }),
  );
}

/** Opens a circuit the way an outage does: its failure threshold reached by calls that fail. */
async function failUntilOpen(circuit: CircuitBreaker, call: () => Promise<unknown>): Promise<void> {
  for (let attempt = 0; attempt < 10 && (await circuit.getState()) !== 'OPEN'; attempt += 1) {
    await call().catch(() => undefined);
  }
  expect(await circuit.getState()).toBe('OPEN');
}

/**
 * Provider outages against real BullMQ and Redis (tasks M3 and I5,
 * docs/reviews/launch-confidence-plan-2026-10-09.md; launch D77 WC-2, D80): two replicas of a
 * provider-pausable worker run the real job — the WhatsApp delivery (`meta`) or the AI ideas refresh
 * (`anthropic`). The provider down: its circuit opens on the failed calls, the next job parks without
 * spending an attempt, the queue pauses for both replicas and the work stays queued. The provider
 * back and the reset window past: the first job probes, the circuit closes and everything is done.
 */
describe('Chaos: a provider down pauses its queue; back, the first job probes', () => {
  const workers: Worker[] = [];
  let queue: Queue | null = null;
  let app: FastifyInstance | null = null;

  /** Two replicas on a queue of this test's own, running `processor`. */
  async function startReplicas(
    provider: QueueProvider,
    processor: (job: Job<{ organizationPublicId: string }>) => Promise<unknown>,
  ): Promise<Queue> {
    const connection = getBullMQConnectionOptions();
    queue = new Queue(`chaos-${provider}-${randomUUID()}`, {
      connection,
      prefix: getBullMQKeyPrefix(),
    });
    await queue.waitUntilReady();
    for (let replica = 0; replica < 2; replica += 1) {
      workers.push(
        createProviderPausableWorker<{ organizationPublicId: string }>({
          queueName: queue.name,
          provider,
          processor,
          workerOptions: { connection, concurrency: 1, ...getDefaultWorkerOptions() },
          pauseMs: PAUSE_MS,
        }),
      );
    }
    await Promise.all(workers.map((worker) => worker.waitUntilReady()));
    return queue;
  }

  /** The fixture organization, with the app to drive it. */
  async function organization(): Promise<{ fixture: AppFixture; flow: AppFlow }> {
    ({ app } = await createTestApp());
    const fixture = await createAppFixture(app);
    return { fixture, flow: new AppFlow(app, fixture).as('owner') };
  }

  afterEach(async () => {
    await Promise.all(workers.splice(0).map((worker) => worker.close()));
    await queue?.obliterate({ force: true });
    await queue?.close();
    queue = null;
    await app?.close();
    app = null;
    nock.cleanAll();
    await metaCircuit.reset();
    await anthropicCircuit.reset();
  });

  it('M3: Meta down — the delivery queue pauses and the messages stay queued; back, they go', async () => {
    const deliveryWasEnabled = env.MESSAGING_DELIVERY_ENABLED;
    env.MESSAGING_DELIVERY_ENABLED = true;
    try {
      const S = String(Date.now());
      const { fixture, flow } = await organization();
      const organizationPublicId = fixture.organization.publicId;
      await flow.expect(200, 'connect WhatsApp', 'PATCH', '/tenancy/organization/settings', {
        whatsapp_phone_number_id: `12${S.slice(-10)}`,
      });
      await flow.expect(200, 'a contact', 'POST', '/app/contacts', {
        first_name: 'Gauri',
        last_name: `c${S}`,
        phones: [{ phone: `+919${S.slice(-7)}41`, is_primary: true }],
      });
      const contact = flow.last('.data.id');
      for (const body of ['First', 'Second', 'Third']) {
        await flow.expect(
          200,
          `send ${body}`,
          'POST',
          `/app/contacts/${contact}/activities/send-message`,
          {
            type: 'whatsapp',
            body,
          },
        );
      }
      const statuses = async () =>
        (
          await operatorQuery<{ delivery_status: string; claimed: boolean }[]>`
            SELECT delivery_status, delivery_claimed_at IS NOT NULL AS claimed
            FROM app.contact_activities activity
            JOIN app.contacts person ON person.id = activity.contact_id
            WHERE person.public_id = ${contact} AND activity.direction = 'sent'
            ORDER BY activity.id
          `
        ).map((row) => `${row.delivery_status}${row.claimed ? '+claimed' : ''}`);

      // Meta down: every send answers 503 until the circuit opens.
      nock(GRAPH)
        .persist()
        .post(/\/messages$/)
        .reply(503, { error: { message: 'Service down' } });
      await failUntilOpen(metaCircuit, () => runContactMessageDeliveryJob(organizationPublicId));

      const deliveryQueue = await startReplicas('meta', (job) =>
        runContactMessageDeliveryJob(job.data.organizationPublicId),
      );
      const parked = await deliveryQueue.add('deliver', { organizationPublicId }, { attempts: 3 });
      await waitFor(async () => (await parked.getState()) === 'delayed', 10_000);
      expect(
        (await deliveryQueue.getJob(String(parked.id)))?.attemptsMade,
        'no attempt spent',
      ).toBe(0);
      expect(await getProviderPauseLeftMs(deliveryQueue), 'the queue is paused').toBeGreaterThan(0);
      const arrived = await deliveryQueue.add('deliver', { organizationPublicId }, { attempts: 3 });
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS / 3));
      expect(await arrived.getState(), 'neither replica takes a job while paused').toBe('waiting');
      expect(await statuses(), 'nothing dropped, nothing failed, no claim held').toEqual([
        'queued',
        'queued',
        'queued',
      ]);

      // Meta back, and the reset window past: the next job probes and the queue resumes.
      nock.cleanAll();
      let sent = 0;
      nock(GRAPH)
        .persist()
        .post(/\/messages$/)
        .reply(200, () => {
          sent += 1;
          return { messages: [{ id: `wamid.chaos.${sent}.${S}` }] };
        });
      await letResetWindowPass('meta');
      await waitFor(
        async () =>
          (await parked.getState()) === 'completed' && (await arrived.getState()) === 'completed',
        PAUSE_MS * 6,
      );
      expect(await statuses(), 'all three sent').toEqual(['sent', 'sent', 'sent']);
      expect(sent).toBe(3);
      expect(await metaCircuit.getState(), 'the probe closed the circuit').toBe('CLOSED');
    } finally {
      env.MESSAGING_DELIVERY_ENABLED = deliveryWasEnabled;
    }
  }, 60_000);

  it('I5: Anthropic down — the ideas queue pauses and the patient stays marked; back, the ideas are stored', async () => {
    const S = String(Date.now());
    const { fixture, flow } = await organization();
    const organizationPublicId = fixture.organization.publicId;
    await flow.expect(200, 'an offering', 'POST', '/app/offerings', {
      name: `Chemical peel ${S}`,
      price: 2500,
    });
    const peel = flow.last('.data.id');
    await flow.expect(200, 'a patient file with Data consent', 'POST', '/app/patients', {
      contact: {
        first_name: 'Hiral',
        last_name: `c${S}`,
        phones: [{ phone: `+919${S.slice(-7)}51`, is_primary: true }],
      },
      home_branch_id: fixture.branches.vesu,
    });
    const patient = flow.last('.data.id');
    await flow.expect(200, 'Data consent', 'PATCH', `/app/patients/${patient}`, {
      has_data_consent: true,
    });
    const staleSince = async () => {
      const [row] = await operatorQuery<{ stale_since: string | null }[]>`
        SELECT ideas_stale_since::text AS stale_since FROM app.patients WHERE public_id = ${patient}
      `;
      return row?.stale_since ?? null;
    };
    expect(await staleSince(), 'the consent marked the file').not.toBeNull();

    // Anthropic down: 503s until the circuit opens.
    nock(ANTHROPIC)
      .persist()
      .post('/v1/messages')
      .reply(503, {
        type: 'error',
        error: { type: 'api_error', message: 'Service down' },
      });
    await failUntilOpen(anthropicCircuit, () => runPatientIdeasJob(organizationPublicId));

    const ideasQueue = await startReplicas('anthropic', (job) =>
      runPatientIdeasJob(job.data.organizationPublicId),
    );
    const parked = await ideasQueue.add('refresh', { organizationPublicId }, { attempts: 3 });
    await waitFor(async () => (await parked.getState()) === 'delayed', 10_000);
    expect((await ideasQueue.getJob(String(parked.id)))?.attemptsMade, 'no attempt spent').toBe(0);
    expect(await getProviderPauseLeftMs(ideasQueue), 'the queue is paused').toBeGreaterThan(0);
    expect(await staleSince(), 'the patient waits, still marked').not.toBeNull();

    // Anthropic back, and the reset window past: the probe stores the ideas.
    nock.cleanAll();
    nock(ANTHROPIC)
      .persist()
      .post('/v1/messages')
      .reply(200, {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ideas: [{ offering_id: peel, reason: 'Evens the tone' }] }),
          },
        ],
      });
    await letResetWindowPass('anthropic');
    await waitFor(async () => (await parked.getState()) === 'completed', PAUSE_MS * 6);
    expect(await staleSince(), 'refreshed: the mark is cleared').toBeNull();
    const stored = await operatorQuery<{ offering: string }[]>`
      SELECT offering.public_id AS offering FROM app.patient_ideas idea
      JOIN app.patients file ON file.id = idea.patient_id
      JOIN app.offerings offering ON offering.id = idea.offering_id
      WHERE file.public_id = ${patient}
    `;
    expect(
      stored.map((row) => row.offering),
      "Claude's idea stored",
    ).toEqual([peel]);
    expect(await anthropicCircuit.getState(), 'the probe closed the circuit').toBe('CLOSED');
  }, 60_000);
});
