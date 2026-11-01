import http from 'node:http';
import {
  isMetricsEnabled,
  refreshMetricsBeforeScrape,
  renderMetrics,
} from '@/infrastructure/observability/metrics/metrics.js';
import { env, getEnv } from '@/shared/config/env.config.js';
import {
  isBearerTokenValid,
  isMetricsScrapeTokenPresented,
} from '@/shared/utils/security/bearer-token.util.js';
import { getQueuesWaitingJobCount } from '@/infrastructure/observability/metrics/bullmq-metrics.js';
import {
  isWorkerStalled,
  isWorkerThroughputStalled,
  readWorkerQueueHeartbeats,
  type WorkerQueueHeartbeat,
} from '@/infrastructure/queue/worker-runtime/worker-queue-heartbeat.js';
import {
  WORKER_QUEUE_NAMES,
  WORKER_THROUGHPUT_QUEUE_NAMES,
} from '@/infrastructure/queue/queue-catalog.js';
import {
  getCachedDependencyReadinessProbes,
  type ReadinessProbeSummary,
} from '@/shared/utils/infrastructure/readiness-probes.util.js';
import { HEALTH_READINESS_PROBE_CACHE_TTL_MS } from '@/shared/constants/ttl.constants.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';

let healthServer: http.Server | null = null;
let workerReady = false;
let registeredWorkerCount = 0;

/**
 * Flips the `/readyz` probe from `starting` to ready once every worker is registered.
 * `workerCount` is reflected back as `workersRegistered` in the probe response so
 * deployment automation can confirm the expected fleet size has bound to BullMQ.
 */
export function markWorkerHealthReady(workerCount?: number): void {
  workerReady = true;
  if (workerCount !== undefined) {
    registeredWorkerCount = workerCount;
  }
}

/** Marks the process unready (graceful shutdown begins) so load balancers stop sending traffic. */
export function markWorkerHealthNotReady(): void {
  workerReady = false;
}

function resolveAuthorizationHeader(
  authorizationHeader: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(authorizationHeader)) {
    return authorizationHeader[0];
  }
  return authorizationHeader;
}

function authorizeMetricsRequest(authorizationHeader: string | string[] | undefined): boolean {
  const resolvedAuthorizationHeader = resolveAuthorizationHeader(authorizationHeader);
  const environment = getEnv();
  const bearerToken = environment.METRICS_SCRAPE_TOKEN;
  if (environment.METRICS_AUTH_REQUIRED && environment.METRICS_ENABLED) {
    return Boolean(
      bearerToken &&
        isBearerTokenValid({
          authorizationHeader: resolvedAuthorizationHeader,
          expectedBearerToken: bearerToken,
        }),
    );
  }
  if (bearerToken) {
    return isBearerTokenValid({
      authorizationHeader: resolvedAuthorizationHeader,
      expectedBearerToken: bearerToken,
    });
  }
  return true;
}

function sendJson({
  response,
  statusCode,
  body,
}: {
  response: http.ServerResponse;
  statusCode: number;
  body: unknown;
}): void {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function resolveWorkerHealthStatus({
  isReady,
  isStalled,
  dependencyStatus,
}: {
  isReady: boolean;
  isStalled: boolean;
  dependencyStatus: string;
}): string {
  if (!isReady) return 'starting';
  if (isStalled) return 'stalled';
  return dependencyStatus;
}

/**
 * Liveness: the process and its HTTP server are responsive. Runs no dependency probes and is
 * independent of worker registration, so a healthy-but-still-warming-up worker is not killed.
 */
function handleLivenessProbe(response: http.ServerResponse): void {
  sendJson({ response, statusCode: 200, body: { status: 'live', role: 'worker' } });
}

/** One round of the worker's readiness inputs, reused for {@link HEALTH_READINESS_PROBE_CACHE_TTL_MS}. */
type WorkerReadinessSnapshot = {
  readiness: ReadinessProbeSummary;
  worker_queues: WorkerQueueHeartbeat[];
  throughputWaiting: number;
  stalled: boolean;
};

let cachedWorkerReadiness: {
  snapshot: WorkerReadinessSnapshot;
  cachedAtMilliseconds: number;
} | null = null;
let inFlightWorkerReadiness: Promise<WorkerReadinessSnapshot> | null = null;

async function readWorkerReadinessSnapshot(): Promise<WorkerReadinessSnapshot> {
  const [readiness, worker_queues, throughputHeartbeats] = await Promise.all([
    getCachedDependencyReadinessProbes(),
    readWorkerQueueHeartbeats(WORKER_QUEUE_NAMES),
    readWorkerQueueHeartbeats(WORKER_THROUGHPUT_QUEUE_NAMES),
  ]);
  const throughputStalled = isWorkerThroughputStalled({
    heartbeats: throughputHeartbeats,
    stallTimeoutMs: env.WORKER_HEALTH_STALL_TIMEOUT_MS,
  });
  // A worker is only "stalled" when heartbeats are stale AND there is queued work waiting — an
  // idle worker with an empty queue is healthy. Queue depth is read only when heartbeats are
  // already stale, so the healthy hot path adds no Redis round-trip; a depth-read failure fails
  // safe to "work exists" so a genuine stall is still surfaced.
  let throughputWaiting = 0;
  if (throughputStalled) {
    try {
      throughputWaiting = await getQueuesWaitingJobCount(WORKER_THROUGHPUT_QUEUE_NAMES);
    } catch (error) {
      logger.warn({ error }, 'worker.health.throughput_waiting.failed');
      throughputWaiting = 1;
    }
  }
  const stalled = isWorkerStalled({
    isThroughputStalled: throughputStalled,
    waitingJobCount: throughputWaiting,
  });
  return { readiness, worker_queues, throughputWaiting, stalled };
}

/**
 * D-5: the readiness inputs (dependency probes, heartbeats, queue depth) are read at most once per
 * {@link HEALTH_READINESS_PROBE_CACHE_TTL_MS}; concurrent misses share one in-flight round, so an
 * unauthenticated `/readyz` flood cannot fan out into Postgres and Redis load. A rejected round is
 * not cached.
 */
async function getCachedWorkerReadinessSnapshot(): Promise<WorkerReadinessSnapshot> {
  const nowMilliseconds = performance.now();
  if (
    cachedWorkerReadiness &&
    nowMilliseconds - cachedWorkerReadiness.cachedAtMilliseconds <
      HEALTH_READINESS_PROBE_CACHE_TTL_MS
  ) {
    return cachedWorkerReadiness.snapshot;
  }
  if (inFlightWorkerReadiness) return inFlightWorkerReadiness;
  inFlightWorkerReadiness = (async () => {
    try {
      const snapshot = await readWorkerReadinessSnapshot();
      cachedWorkerReadiness = { snapshot, cachedAtMilliseconds: performance.now() };
      return snapshot;
    } finally {
      inFlightWorkerReadiness = null;
    }
  })();
  return inFlightWorkerReadiness;
}

/**
 * Test-only reset of the worker readiness cache, so one Vitest case's probe round does not answer
 * the next.
 *
 * @remarks
 * - **Side effects:** clears the module-level cached snapshot and in-flight round.
 */
export function resetWorkerReadinessCacheForTests(): void {
  cachedWorkerReadiness = null;
  inFlightWorkerReadiness = null;
}

async function handleReadinessProbe({
  request,
  response,
}: {
  request: http.IncomingMessage;
  response: http.ServerResponse;
}): Promise<void> {
  const { readiness, worker_queues, throughputWaiting, stalled } =
    await getCachedWorkerReadinessSnapshot();
  const processReady = workerReady && !stalled && readiness.status === 'ok';
  const status = resolveWorkerHealthStatus({
    isReady: workerReady,
    isStalled: stalled,
    dependencyStatus: readiness.status,
  });
  const statusCode = processReady ? 200 : 503;

  // D-5: the dependency, fleet and queue detail is reconnaissance for an unauthenticated caller
  // (as on the API, sec-C4). Probes get the status code and status; the verbose body needs the
  // metrics scrape token, the same check the API's /metrics uses.
  if (!isMetricsScrapeTokenPresented(resolveAuthorizationHeader(request.headers.authorization))) {
    sendJson({ response, statusCode, body: { status, role: 'worker' } });
    return;
  }

  sendJson({
    response,
    statusCode,
    body: {
      status,
      role: 'worker',
      database: readiness.database,
      redis: readiness.redis,
      bullmq: readiness.bullmq,
      latencyMs: readiness.latencyMs,
      workersRegistered: registeredWorkerCount,
      worker_queues,
      throughput_waiting: throughputWaiting,
    },
  });
}

async function handleMetrics({
  request,
  response,
}: {
  request: http.IncomingMessage;
  response: http.ServerResponse;
}): Promise<void> {
  if (!authorizeMetricsRequest(request.headers.authorization)) {
    sendJson({
      response,
      statusCode: 401,
      body: { status: 'error', detail: 'Invalid metrics bearer token' },
    });
    return;
  }
  await refreshMetricsBeforeScrape();
  const body = await renderMetrics();
  response.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
  response.end(body);
}

async function handleHealthRequest({
  request,
  response,
  url,
}: {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: string;
}): Promise<void> {
  if (request.method !== 'GET') {
    response.writeHead(404);
    response.end();
    return;
  }

  if (url === '/livez') {
    handleLivenessProbe(response);
    return;
  }
  if (url === '/readyz') {
    await handleReadinessProbe({ request, response });
    return;
  }
  if (url === '/metrics' && isMetricsEnabled()) {
    await handleMetrics({ request, response });
    return;
  }

  response.writeHead(404);
  response.end();
}

/**
 * Boots a lightweight Node HTTP server (no Fastify) exposing `/livez` (liveness), `/readyz`
 * (readiness — deps + worker registration + stall, cached for a short window; the verbose body
 * only with the metrics scrape token) and (when metrics are enabled) `/metrics`
 * on `WORKER_HEALTH_PORT`. Idempotent — subsequent calls are no-ops while the server is
 * already listening. Listens on `HTTP_BIND_HOST` so the same binding rules as the API apply.
 * `/metrics` is gated by `METRICS_SCRAPE_TOKEN` (required in production when metrics are enabled).
 */
export async function startWorkerHealthServer(): Promise<void> {
  if (healthServer) return;

  const { WORKER_HEALTH_PORT: port, HTTP_BIND_HOST: host } = getEnv();

  healthServer = http.createServer((request, response) => {
    const url = request.url?.split('?')[0] ?? '';
    void handleHealthRequest({ request, response, url }).catch((error) => {
      logger.error({ error, url }, 'worker.health.request.failed');
      if (!response.headersSent) {
        sendJson({ response, statusCode: 500, body: { status: 'error' } });
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    healthServer?.once('error', reject);
    healthServer?.listen(port, host, () => resolve());
  });

  logger.info({ port, host }, 'worker.health.server.started');
}

/**
 * Stops the worker health/metrics HTTP server and resets the readiness counters so the
 * process can be safely restarted in-place (e.g. during integration tests). No-op when
 * the server is not running.
 */
export async function stopWorkerHealthServer(): Promise<void> {
  if (!healthServer) return;

  const server = healthServer;
  healthServer = null;
  workerReady = false;
  registeredWorkerCount = 0;
  cachedWorkerReadiness = null;
  inFlightWorkerReadiness = null;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  logger.info('worker.health.server.stopped');
}
