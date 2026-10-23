import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { envSchemaDefaults } from '@/shared/config/env-schema.js';

/** A service container takes no `-c` flags and `max_connections` needs a restart: the image default. */
const SERVICE_POSTGRES_MAX_CONNECTIONS = 100;
/**
 * What `assertPostgresConnectionBudget` assumes with the flag off and no count: one API plus one
 * worker (`LOCAL_DEFAULT_API_PROCESS_COUNT` + `LOCAL_DEFAULT_WORKER_PROCESS_COUNT` in
 * `src/infrastructure/database/safety/assert-connection-budget.ts`, pinned by its own unit test).
 */
const INFERRED_LOCAL_PROCESS_COUNT = 2;

const dockerWorkflow = readFileSync(
  join(process.cwd(), '.github', 'workflows', 'reusable-docker-build-trivy.yml'),
  'utf8',
);
const startApiServer = readFileSync(
  join(process.cwd(), '.github', 'actions', 'start-api-server', 'action.yml'),
  'utf8',
);

/** The text of one `- name:` step of a workflow. */
function step(text: string, name: string): string {
  const block = text.split(/^ {6}- name: /m).find((candidate) => candidate.startsWith(`${name}\n`));
  return block ?? '';
}

/**
 * A value a boot states — `KEY=n` on a `docker run`, `KEY: 'n'` in an action's env. Literal
 * patterns, one per key: the static security scan refuses a RegExp built from a variable.
 */
const STATED = {
  DEPLOYMENT_TOTAL_REPLICA_COUNT: /DEPLOYMENT_TOTAL_REPLICA_COUNT(?:=|: )'?(\d+)/,
  DATABASE_POOL_MAX: /DATABASE_POOL_MAX(?:=|: )'?(\d+)/,
  DATABASE_MAINTENANCE_POOL_MAX: /DATABASE_MAINTENANCE_POOL_MAX(?:=|: )'?(\d+)/,
} as const;

/** Connections a boot asks for: stated (or inferred) processes × per-process pools. */
function connectionDemand(boot: string): { processes: number; perProcess: number } {
  const stated = (key: keyof typeof STATED): string | undefined => boot.match(STATED[key])?.[1];
  const processes = Number(
    stated('DEPLOYMENT_TOTAL_REPLICA_COUNT') ?? INFERRED_LOCAL_PROCESS_COUNT,
  );
  const pool = Number(stated('DATABASE_POOL_MAX') ?? envSchemaDefaults.DATABASE_POOL_MAX);
  const maintenance = Number(
    stated('DATABASE_MAINTENANCE_POOL_MAX') ?? envSchemaDefaults.DATABASE_MAINTENANCE_POOL_MAX,
  );
  return { processes, perProcess: pool + maintenance };
}

const allowed =
  SERVICE_POSTGRES_MAX_CONNECTIONS - Number(envSchemaDefaults.POSTGRES_RESERVED_CONNECTIONS);

/**
 * Every CI boot of the API fits the CI service Postgres BY ARITHMETIC, not by a pinned string
 * (OPS-01): the process count the boot states (or the one API plus one worker the budget assumes
 * when it states none) × the schema's per-process pools ≤ the service's `max_connections` −
 * reserved. #82 raised the pool default from 30 to 70 and every post-merge boot then exited before
 * /readyz (2 × 80 = 160 > 90); a later default above 80 would break even the one-process boot —
 * this fails first. `docker-api-smoke.policy.unit.test.ts` pins the strings.
 */
describe('CI API boots fit the service Postgres connection budget', () => {
  it.each([
    ['the Docker smoke boot', step(dockerWorkflow, 'Boot API container and verify /readyz')],
    ['the start-api-server action', startApiServer],
  ])('%s', (_label, boot) => {
    expect(boot).not.toBe('');
    const { processes, perProcess } = connectionDemand(boot);
    expect(
      processes * perProcess,
      `${processes} × ${perProcess} vs ${allowed}`,
    ).toBeLessThanOrEqual(allowed);
  });

  it('fails the 17 Oct boot: the Docker smoke without its process count asks for 160 of 90', () => {
    const boot = step(dockerWorkflow, 'Boot API container and verify /readyz').replace(
      /-e DEPLOYMENT_TOTAL_REPLICA_COUNT=1 \\\n/,
      '',
    );
    const { processes, perProcess } = connectionDemand(boot);
    expect(processes * perProcess).toBe(160);
    expect(processes * perProcess).toBeGreaterThan(allowed);
  });
});
