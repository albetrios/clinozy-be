import { createHash } from 'node:crypto';

/** The setting `withAppDatabaseContext` pins for a unit of work run inside one organization. */
export const ORGANIZATION_CONTEXT_SETTING = 'app.current_organization_public_id';

/** Settings whose unit of work handles rows of many organizations, each by id, so it is not audited. */
const MULTI_ORGANIZATION_SETTINGS: ReadonlySet<string> = new Set(['app.audit_outbox_drain']);

/** `set_config(<key>, <value>, …)` with each argument a literal or a bound parameter. */
const SET_CONFIG = /set_config\(\s*(?:'([^']+)'|\$(\d+))\s*,\s*(?:'([^']*)'|\$(\d+))/g;

/** `select`, `update`, `delete` or a CTE: the statements that read or change existing rows. */
const READS_OR_CHANGES_ROWS = /^\s*(?:select|update|delete|with)\b/i;

/**
 * `organization_id`, `id` or another internal `*_id` column compared with a bound parameter.
 * `public_id` is the value a client sends, so a statement keyed only by it is not keyed.
 */
const KEYED =
  /(?<!\w)"?(?!public_id\b)(?:id|\w+_id)"?\s*(?:=\s*any\s*\(|=|in\s*\()\s*(?:array\[)?\s*\$\d/i;

/** The organization's own public id compared with a bound parameter, which names the organization too. */
const ORGANIZATION_PUBLIC_ID = /organizations"?\."?public_id"?\s*=\s*\$\d/i;

/**
 * A `"schema"."table"` reference (two quoted parts, so never part of a `"schema"."table"."column"`),
 * or an unquoted `schema.table` after a FROM, JOIN or UPDATE.
 */
const QUOTED_TABLE = /(?<![."\w])"(\w+)"\."(\w+)"(?!\.)/g;
const UNQUOTED_TABLE = /\b(?:from|join|update)\s+(\w+)\.(\w+)\b/gi;

/**
 * What a statement does to the connection's organization context: `enter` when it pins an
 * organization, `leave` when it ends the transaction, clears the organization or starts a
 * many-organization unit of work, `none` otherwise.
 */
export function organizationContextChange(options: {
  text: string;
  values: readonly unknown[];
}): 'enter' | 'leave' | 'none' {
  if (/^\s*(?:commit|rollback)\b/i.test(options.text)) return 'leave';
  if (!options.text.includes('set_config(')) return 'none';
  let change: 'enter' | 'leave' | 'none' = 'none';
  for (const match of options.text.matchAll(SET_CONFIG)) {
    const key = match[1] ?? options.values[Number(match[2]) - 1];
    const value = match[3] ?? options.values[Number(match[4]) - 1];
    if (typeof key !== 'string') continue;
    if (MULTI_ORGANIZATION_SETTINGS.has(key)) return 'leave';
    if (key === ORGANIZATION_CONTEXT_SETTING) {
      change = typeof value === 'string' && value !== '' ? 'enter' : 'leave';
    }
  }
  return change;
}

/**
 * Whether a statement run inside an organization reads or changes rows without naming the
 * organization or an internal id, so Postgres RLS is the only thing that keeps it inside the
 * organization.
 */
export function isUnkeyedRowStatement(text: string): boolean {
  return (
    READS_OR_CHANGES_ROWS.test(text) && !KEYED.test(text) && !ORGANIZATION_PUBLIC_ID.test(text)
  );
}

/** A statement with its whitespace, parameter numbers and parameter-list lengths made uniform. */
export function normalizeStatement(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\$\d+/g, '$')
    .replace(/\(\$(?:, \$)*\)/g, '($..)')
    .replace(/ARRAY\[\$(?:, \$)*\]/gi, 'ARRAY[$..]');
}

/** A short stable id for a statement: the first 12 hex digits of its normalized text's SHA-256. */
export function statementFingerprint(text: string): string {
  return createHash('sha256').update(normalizeStatement(text)).digest('hex').slice(0, 12);
}

/** The `schema.table` names a statement reads or changes. */
export function tablesNamed(text: string): Set<string> {
  const tables = new Set<string>();
  for (const match of text.matchAll(QUOTED_TABLE)) tables.add(`${match[1]}.${match[2]}`);
  for (const match of text.matchAll(UNQUOTED_TABLE)) tables.add(`${match[1]}.${match[2]}`);
  return tables;
}
