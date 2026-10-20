import pg from 'pg';
import { afterAll } from 'vitest';
import {
  isUnkeyedRowStatement,
  normalizeStatement,
  organizationContextChange,
  statementFingerprint,
  tablesNamed,
} from '@/tests/helpers/organization-filter-audit.js';
import { RLS_ONLY_STATEMENTS } from '@/tests/helpers/organization-filter-audit.allowlist.js';

/*
 * Every app request and tenant job runs as the RLS-subject role, so RLS returns the same rows with
 * or without a repository's organization_id filter and no database test can see the filter go
 * missing (planted-bug drill A3-2 and A3-10, 20 Oct 2026). This setup file watches every statement
 * the e2e and integration lanes send: one run inside an organization context that reads or changes
 * a tenant table without naming the organization or an internal id fails the test file.
 */

/** The live audit of this test file; the patched `query` hands each statement to it. */
interface StatementSink {
  inspect(options: { client: object; text: string; values: readonly unknown[] }): void;
}

const SINK = Symbol.for('organization-filter-audit.sink');
const prototype = pg.Client.prototype as unknown as { [SINK]?: StatementSink };

if (!prototype[SINK]) {
  // Patched once per worker process: node-postgres is loaded once and shared by every test file.
  const originalQuery = pg.Client.prototype.query as (...parameters: unknown[]) => unknown;
  pg.Client.prototype.query = function auditedQuery(this: object, ...parameters: unknown[]) {
    const [config, values] = parameters;
    const text = typeof config === 'string' ? config : (config as { text?: unknown } | null)?.text;
    const bound =
      typeof config === 'string'
        ? values
        : ((config as { values?: unknown } | null)?.values ?? values);
    if (typeof text === 'string') {
      prototype[SINK]?.inspect({ client: this, text, values: Array.isArray(bound) ? bound : [] });
    }
    return originalQuery.apply(this, parameters);
  } as typeof pg.Client.prototype.query;
}

const insideOrganization = new WeakSet<object>();
const unkeyed = new Map<string, string>();

prototype[SINK] = {
  inspect({ client, text, values }) {
    const change = organizationContextChange({ text, values });
    if (change === 'enter') insideOrganization.add(client);
    else if (change === 'leave') insideOrganization.delete(client);
    else if (insideOrganization.has(client) && isUnkeyedRowStatement(text)) {
      unkeyed.set(statementFingerprint(text), text);
    }
  },
};

/** The FORCE RLS tables that carry an `organization_id`, as `schema.table`. */
async function tenantTables(): Promise<Set<string>> {
  const { operatorQuery } = await import('@/tests/helpers/operator-database.js');
  const rows = await operatorQuery<{ name: string }[]>`
    SELECT n.nspname || '.' || c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p') AND c.relforcerowsecurity
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped
      )`;
  return new Set(rows.map((row) => row.name));
}

afterAll(async () => {
  const candidates = [...unkeyed].filter(([fingerprint]) => !(fingerprint in RLS_ONLY_STATEMENTS));
  if (candidates.length === 0) return;
  const tenant = await tenantTables();
  const leaks = candidates.flatMap(([fingerprint, text]) => {
    const tables = [...tablesNamed(text)].filter((table) => tenant.has(table));
    return tables.length === 0 ? [] : [{ fingerprint, text, tables }];
  });
  if (leaks.length === 0) return;
  throw new Error(
    [
      `${leaks.length} statement(s) ran inside an organization without naming it or an internal id, so RLS was their only filter:`,
      ...leaks.map(
        (leak) =>
          `  [${leak.fingerprint}] ${leak.tables.join(', ')}: ${normalizeStatement(leak.text).slice(0, 400)}`,
      ),
      'Add the organization_id filter in the repository. A statement that is safe another way goes in RLS_ONLY_STATEMENTS',
      '(src/tests/helpers/organization-filter-audit.allowlist.ts) with its fingerprint and why.',
    ].join('\n'),
  );
});
