import { describe, expect, it } from 'vitest';
import {
  buildAuthHeaders,
  evaluateBootLogs,
  isAuthorizationError,
  isRetryableHttpStatus,
  isRetryableNetworkError,
  parseOptions,
} from '@tooling/setup/railway/deploy-image.js';

const REQUIRED = ['--service', 'svc-1', '--image', 'ghcr.io/owner/api:sha'];

describe('parseOptions', () => {
  it('requires --service and --image', () => {
    expect(() => parseOptions(['--image', 'ghcr.io/owner/api:sha'])).toThrow(/--service/);
    expect(() => parseOptions(['--service', 'svc-1'])).toThrow(/--image/);
  });

  it('parses the required flags', () => {
    const options = parseOptions(REQUIRED);
    expect(options.serviceId).toBe('svc-1');
    expect(options.image).toBe('ghcr.io/owner/api:sha');
  });

  it('defaults --label to the service id so logs are never ambiguous', () => {
    expect(parseOptions(REQUIRED).label).toBe('svc-1');
    expect(parseOptions([...REQUIRED, '--label', 'worker']).label).toBe('worker');
  });

  it('defaults skipWait to false — CD must wait for terminal status', () => {
    // If this ever defaulted true, a CRASHED deployment would exit 0 and report a
    // green deploy. The workflow relies on the default; it never passes the flag.
    expect(parseOptions(REQUIRED).skipWait).toBe(false);
    expect(parseOptions([...REQUIRED, '--skip-wait']).skipWait).toBe(true);
  });

  it('rejects non-positive or non-numeric timings instead of silently coercing', () => {
    expect(() => parseOptions([...REQUIRED, '--timeout-seconds', 'abc'])).toThrow();
    expect(() => parseOptions([...REQUIRED, '--timeout-seconds', '0'])).toThrow();
    expect(() => parseOptions([...REQUIRED, '--poll-interval-seconds', '-5'])).toThrow();
  });

  it('accepts explicit timings', () => {
    const options = parseOptions([
      ...REQUIRED,
      '--timeout-seconds',
      '120',
      '--poll-interval-seconds',
      '3',
    ]);
    expect(options.timeoutSeconds).toBe(120);
    expect(options.pollIntervalSeconds).toBe(3);
  });

  it('leaves environment resolution unset unless supplied', () => {
    const options = parseOptions(REQUIRED);
    expect(options.environmentName).toBeNull();
    expect(options.environmentId).toBeNull();
    expect(parseOptions([...REQUIRED, '--environment-id', 'env-9']).environmentId).toBe('env-9');
  });

  it('turns boot verification off unless a ready marker is given, with a 90s default window', () => {
    const options = parseOptions(REQUIRED);
    expect(options.bootReadyMarker).toBeNull();
    expect(options.bootCrashMarkers).toEqual([]);
    expect(options.bootWindowSeconds).toBe(90);
  });

  it('collects every --boot-crash-marker and trims the ready marker', () => {
    const options = parseOptions([
      ...REQUIRED,
      '--boot-ready-marker',
      ' Worker started ',
      '--boot-crash-marker',
      'Worker failed to start',
      '--boot-crash-marker',
      'uncaughtException',
      '--boot-window-seconds',
      '45',
    ]);
    expect(options.bootReadyMarker).toBe('Worker started');
    expect(options.bootCrashMarkers).toEqual(['Worker failed to start', 'uncaughtException']);
    expect(options.bootWindowSeconds).toBe(45);
  });

  it('rejects crash markers without a ready marker and a non-positive boot window', () => {
    // A crash marker alone would make the gate pass a container that never booted (no
    // positive signal is ever required), so the pair is enforced at parse time.
    expect(() => parseOptions([...REQUIRED, '--boot-crash-marker', 'x'])).toThrow(
      /--boot-ready-marker/,
    );
    expect(() =>
      parseOptions([...REQUIRED, '--boot-ready-marker', 'ok', '--boot-window-seconds', '0']),
    ).toThrow(/--boot-window-seconds/);
  });
});

describe('evaluateBootLogs', () => {
  const readyMarker = 'Worker started';
  const crashMarkers = ['Worker failed to start', 'uncaughtException'];
  const line = (message: string) => ({ message });

  it('reports ready when the ready marker was logged and nothing crashed', () => {
    const verdict = evaluateBootLogs({
      lines: [
        line('{"level":30,"msg":"worker.health.server.started"}'),
        line('{"level":30,"workerCount":36,"msg":"Worker started"}'),
      ],
      readyMarker,
      crashMarkers,
    });
    expect(verdict).toEqual({ ready: true, crashLine: null });
  });

  it('returns the first crash line — the boot-guard failure the operator needs to read', () => {
    // The production incident: assertPostgresConnectionBudget threw, the worker logged
    // "Worker failed to start" and exited 1 while the deployment read SUCCESS.
    const crash =
      '{"level":50,"errorMessage":"Postgres connection budget exceeded — DATABASE_POOL_MAX is too high for this database.","msg":"Worker failed to start"}';
    const verdict = evaluateBootLogs({
      lines: [line('Starting Container'), line(crash), line('Starting Container'), line(crash)],
      readyMarker,
      crashMarkers,
    });
    expect(verdict.ready).toBe(false);
    expect(verdict.crashLine).toBe(crash);
  });

  it('reports BOTH ready and a crash for a process that booted and then died', () => {
    // A restart loop after a successful boot logs the ready marker and then the crash;
    // the caller fails on the crash regardless of the ready flag.
    const verdict = evaluateBootLogs({
      lines: [line('"msg":"Worker started"'), line('"msg":"uncaughtException"')],
      readyMarker,
      crashMarkers,
    });
    expect(verdict).toEqual({ ready: true, crashLine: '"msg":"uncaughtException"' });
  });

  it('is neither ready nor crashed on an empty or unrelated log', () => {
    expect(evaluateBootLogs({ lines: [], readyMarker, crashMarkers })).toEqual({
      ready: false,
      crashLine: null,
    });
    expect(
      evaluateBootLogs({ lines: [line('Starting Container')], readyMarker, crashMarkers }),
    ).toEqual({ ready: false, crashLine: null });
  });
});

describe('buildAuthHeaders', () => {
  it('sends a project token as Project-Access-Token, not Bearer', () => {
    // Railway rejects a project token presented as Bearer. This branch decides
    // whether deployment-status polling is even permitted, so it is load-bearing.
    const headers = buildAuthHeaders({ token: 'tok', authMode: 'project' });
    expect(headers['Project-Access-Token']).toBe('tok');
    expect(headers.Authorization).toBeUndefined();
  });

  it('sends an account token as Bearer', () => {
    const headers = buildAuthHeaders({ token: 'tok', authMode: 'bearer' });
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers['Project-Access-Token']).toBeUndefined();
  });

  it('always declares a JSON content type', () => {
    for (const authMode of ['project', 'bearer'] as const) {
      expect(buildAuthHeaders({ token: 'tok', authMode })['Content-Type']).toBe('application/json');
    }
  });
});

describe('isRetryableHttpStatus', () => {
  it('retries rate limits and server errors', () => {
    for (const status of [429, 500, 502, 503, 504]) {
      expect(isRetryableHttpStatus(status)).toBe(true);
    }
  });

  it('does not retry client errors — a bad token or service id must fail fast', () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(isRetryableHttpStatus(status)).toBe(false);
    }
  });
});

describe('isRetryableNetworkError', () => {
  it('retries transient transport failures', () => {
    for (const message of [
      'fetch failed',
      'request timed out',
      'ECONNRESET',
      'ENOTFOUND backboard.railway.com',
      'EAI_AGAIN',
    ]) {
      expect(isRetryableNetworkError(new Error(message))).toBe(true);
    }
  });

  it('does not retry a genuine application error', () => {
    expect(isRetryableNetworkError(new Error('Service not found'))).toBe(false);
  });

  it('handles a non-Error throw without crashing the retry loop', () => {
    expect(isRetryableNetworkError('fetch failed')).toBe(true);
    expect(isRetryableNetworkError(undefined)).toBe(false);
  });
});

describe('isAuthorizationError', () => {
  it('detects the auth-failure phrasings that trigger the token fallback', () => {
    expect(isAuthorizationError('Not Authorized')).toBe(true);
    expect(isAuthorizationError('unauthorized')).toBe(true);
    expect(isAuthorizationError('Forbidden resource')).toBe(true);
  });

  it('does not treat an unrelated error as an auth failure', () => {
    expect(isAuthorizationError('Deployment not found')).toBe(false);
  });
});
