/**
 * RLS policy lint for the tables a change touches — an early check at commit, when migrations or
 * Drizzle schemas are staged.
 *
 * Usage:
 *   pnpm validate:rls-policies                      # the staged files
 *   pnpm validate:rls-policies --files a.sql,b.ts   # these files
 *
 * It replays every migration into each table's final state (ENABLE / FORCE ROW LEVEL SECURITY,
 * its policies) and then checks the tables the changed files touch: a table a changed migration
 * creates, or whose RLS or policies it changes, and every table a changed `*.schema.ts` declares.
 * Each must be ENABLE and FORCE row level security, an organization-scoped table (it has an
 * `organization_id` column) must state WITH CHECK on every tenant policy (one that compares with
 * the request's organization, `app.current_organization_public_id`) that lets a row be written
 * (ALL, INSERT, UPDATE), and a declared table must have a migration that creates it. A partition
 * is checked through its parent. Policies built inside a `DO` block are not seen.
 *
 * Warn-only until `EARLY_CHECKS_BLOCK_FROM` (`src/scripts/tooling/early-checks.util.ts`).
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportEarlyCheck } from '@/scripts/tooling/early-checks.util.js';
import { splitSqlStatements } from '@/scripts/validators/migration/lint-migrations.js';

/** One policy on a table, as the migrations leave it. */
export interface RlsPolicy {
  name: string;
  command: 'all' | 'select' | 'insert' | 'update' | 'delete';
  /** Its expressions compare with the request's organization (`current_organization…` GUC). */
  isTenantPolicy: boolean;
  hasWithCheck: boolean;
}

/** A table's row-level-security state after every migration. */
export interface RlsTableState {
  createdIn: string;
  isPartition: boolean;
  isOrganizationScoped: boolean;
  isEnabled: boolean;
  isForced: boolean;
  policies: RlsPolicy[];
}

/** One migration file: its name and its SQL. */
export interface MigrationSource {
  name: string;
  content: string;
}

const IDENTIFIER = String.raw`((?:"[^"]+"|\w+)(?:\s*\.\s*(?:"[^"]+"|\w+))?)`;
const CREATE_TABLE = new RegExp(
  String.raw`^create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?${IDENTIFIER}\s*(\(|partition\s+of)`,
  'i',
);
const ROW_SECURITY = new RegExp(
  String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${IDENTIFIER}\s+(enable|disable|force|no\s+force)\s+row\s+level\s+security`,
  'i',
);
const ADD_ORGANIZATION_COLUMN = new RegExp(
  String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${IDENTIFIER}\s+add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?"?organization_id"?\s`,
  'i',
);
const RENAME_TABLE = new RegExp(
  String.raw`^alter\s+table\s+(?:if\s+exists\s+)?${IDENTIFIER}\s+rename\s+to\s+("[^"]+"|\w+)`,
  'i',
);
const CREATE_POLICY = new RegExp(
  String.raw`^create\s+policy\s+("[^"]+"|\w+)\s+on\s+${IDENTIFIER}(.*)$`,
  'is',
);
const ALTER_POLICY = new RegExp(
  String.raw`^alter\s+policy\s+("[^"]+"|\w+)\s+on\s+${IDENTIFIER}(.*)$`,
  'is',
);
const DROP_POLICY = new RegExp(
  String.raw`^drop\s+policy\s+(?:if\s+exists\s+)?("[^"]+"|\w+)\s+on\s+${IDENTIFIER}`,
  'i',
);
const DROP_TABLE = /^drop\s+table\s+(?:if\s+exists\s+)?(.+?)(?:\s+(?:cascade|restrict))?$/is;
const WRITE_COMMANDS = new Set(['all', 'insert', 'update']);

/** `"app"."leads"` → `app.leads`. */
function normalizeIdentifier(identifier: string): string {
  return identifier.replace(/"/g, '').replace(/\s+/g, '').toLowerCase();
}

/** The statement without comments, on one line. */
function normalizeStatement(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The text inside the parenthesis that opens at `start` (the CREATE TABLE column list). */
function parenthesized(options: { text: string; start: number }): string {
  let depth = 1;
  let index = options.start;
  while (index < options.text.length && depth > 0) {
    const character = options.text[index];
    if (character === '(') depth += 1;
    else if (character === ')') depth -= 1;
    index += 1;
  }
  return options.text.slice(options.start, index - 1);
}

function policyCommand(clauses: string): RlsPolicy['command'] {
  const beforeExpressions = clauses.split(/\b(?:using|with\s+check)\b/i)[0] ?? '';
  const match = /\bfor\s+(all|select|insert|update|delete)\b/i.exec(beforeExpressions);
  return (match?.[1]?.toLowerCase() as RlsPolicy['command'] | undefined) ?? 'all';
}

/** The tables one statement names, and what it does to their RLS state. */
function applyStatement(options: {
  statement: string;
  migration: string;
  tables: Map<string, RlsTableState>;
}): string[] {
  const { statement, migration, tables } = options;
  const stateOf = (table: string): RlsTableState => {
    let state = tables.get(table);
    if (!state) {
      state = {
        createdIn: '',
        isPartition: false,
        isOrganizationScoped: false,
        isEnabled: false,
        isForced: false,
        policies: [],
      };
      tables.set(table, state);
    }
    return state;
  };

  const create = CREATE_TABLE.exec(statement);
  if (create?.[1] && create[2]) {
    const table = normalizeIdentifier(create[1]);
    const state = stateOf(table);
    state.createdIn = migration;
    state.isPartition = create[2].toLowerCase().startsWith('partition');
    if (!state.isPartition) {
      const columns = parenthesized({
        text: statement,
        start: (create.index ?? 0) + create[0].length,
      });
      state.isOrganizationScoped = /(?:^|[\s,(])"?organization_id"?\s/i.test(columns);
    }
    return [table];
  }
  const rowSecurity = ROW_SECURITY.exec(statement);
  if (rowSecurity?.[1] && rowSecurity[2]) {
    const table = normalizeIdentifier(rowSecurity[1]);
    const state = stateOf(table);
    const action = rowSecurity[2].toLowerCase().replace(/\s+/g, ' ');
    if (action === 'enable') state.isEnabled = true;
    else if (action === 'disable') state.isEnabled = false;
    else if (action === 'force') state.isForced = true;
    else state.isForced = false;
    return [table];
  }
  const addOrganization = ADD_ORGANIZATION_COLUMN.exec(statement);
  if (addOrganization?.[1]) {
    stateOf(normalizeIdentifier(addOrganization[1])).isOrganizationScoped = true;
    return [];
  }
  const rename = RENAME_TABLE.exec(statement);
  if (rename?.[1] && rename[2]) {
    const from = normalizeIdentifier(rename[1]);
    const schema = from.includes('.') ? `${from.split('.')[0]}.` : '';
    const to = `${schema}${normalizeIdentifier(rename[2])}`;
    const state = tables.get(from);
    if (state) {
      tables.delete(from);
      tables.set(to, state);
    }
    return [to];
  }
  const createPolicy = CREATE_POLICY.exec(statement);
  if (createPolicy?.[1] && createPolicy[2]) {
    const table = normalizeIdentifier(createPolicy[2]);
    const clauses = createPolicy[3] ?? '';
    const name = normalizeIdentifier(createPolicy[1]);
    const state = stateOf(table);
    state.policies = state.policies.filter((policy) => policy.name !== name);
    state.policies.push({
      name,
      command: policyCommand(clauses),
      isTenantPolicy: /current_organization/i.test(clauses),
      hasWithCheck: /\bwith\s+check\b/i.test(clauses),
    });
    return [table];
  }
  const alterPolicy = ALTER_POLICY.exec(statement);
  if (alterPolicy?.[1] && alterPolicy[2]) {
    const table = normalizeIdentifier(alterPolicy[2]);
    const name = normalizeIdentifier(alterPolicy[1]);
    const policy = stateOf(table).policies.find((candidate) => candidate.name === name);
    if (policy && /\bwith\s+check\b/i.test(alterPolicy[3] ?? '')) policy.hasWithCheck = true;
    return [table];
  }
  const dropPolicy = DROP_POLICY.exec(statement);
  if (dropPolicy?.[1] && dropPolicy[2]) {
    const table = normalizeIdentifier(dropPolicy[2]);
    const name = normalizeIdentifier(dropPolicy[1]);
    const state = stateOf(table);
    state.policies = state.policies.filter((policy) => policy.name !== name);
    return [table];
  }
  const dropTable = DROP_TABLE.exec(statement);
  if (dropTable?.[1]) {
    for (const table of dropTable[1].split(',')) tables.delete(normalizeIdentifier(table));
    return [];
  }
  return [];
}

/**
 * Replays the migrations, in name order, into each table's final RLS state, and returns which
 * tables each migration touched.
 *
 * @remarks
 * Only top-level statements are read (a `DO` block is one statement and is skipped).
 */
export function buildRlsState(migrations: readonly MigrationSource[]): {
  tables: Map<string, RlsTableState>;
  touchedBy: Map<string, Set<string>>;
} {
  const tables = new Map<string, RlsTableState>();
  const touchedBy = new Map<string, Set<string>>();
  const ordered = [...migrations].sort((left, right) => left.name.localeCompare(right.name));
  for (const migration of ordered) {
    const touched = new Set<string>();
    for (const { text } of splitSqlStatements(migration.content)) {
      const statement = normalizeStatement(text);
      for (const table of applyStatement({ statement, migration: migration.name, tables })) {
        touched.add(table);
      }
    }
    touchedBy.set(migration.name, touched);
  }
  return { tables, touchedBy };
}

/** `<schema>.<table>` for every `xSchema.table('name', …)` in a Drizzle schema file. */
export function declaredTables(options: {
  schemaSource: string;
  pgSchemasSource: string;
}): string[] {
  const schemas = new Map<string, string>();
  for (const match of options.pgSchemasSource.matchAll(
    /export const (\w+) = pgSchema\('(\w+)'\)/g,
  )) {
    if (match[1] && match[2]) schemas.set(match[1], match[2]);
  }
  const tables: string[] = [];
  for (const match of options.schemaSource.matchAll(/(\w+)\s*\.table\(\s*'([a-z_]+)'/g)) {
    const schema = match[1] ? schemas.get(match[1]) : undefined;
    if (schema && match[2]) tables.push(`${schema}.${match[2]}`);
  }
  return tables;
}

/**
 * The findings for `tables` in the final state: not ENABLE, not FORCE, a tenant write policy on
 * an organization-scoped table without WITH CHECK, or a declared table no migration creates.
 *
 * @remarks
 * A partition (`PARTITION OF`) is skipped — its parent carries the policies.
 */
export function lintRlsTables(options: {
  state: Map<string, RlsTableState>;
  tables: Iterable<string>;
}): string[] {
  const findings: string[] = [];
  for (const table of [...new Set(options.tables)].sort()) {
    const state = options.state.get(table);
    if (!state?.createdIn) {
      findings.push(`${table}: declared or changed, but no migration creates it`);
      continue;
    }
    if (state.isPartition) continue;
    if (!state.isEnabled) findings.push(`${table}: no ENABLE ROW LEVEL SECURITY`);
    if (!state.isForced) findings.push(`${table}: no FORCE ROW LEVEL SECURITY`);
    if (!state.isOrganizationScoped) continue;
    for (const policy of state.policies) {
      if (policy.isTenantPolicy && WRITE_COMMANDS.has(policy.command) && !policy.hasWithCheck) {
        findings.push(
          `${table}: tenant policy ${policy.name} (FOR ${policy.command.toUpperCase()}) has no WITH CHECK`,
        );
      }
    }
  }
  return findings;
}

/** The tables the changed files touch: changed migrations' tables and changed schemas' tables. */
export function touchedTables(options: {
  changedFiles: readonly string[];
  touchedBy: Map<string, Set<string>>;
  readFile: (path: string) => string;
}): string[] {
  const tables = new Set<string>();
  const pgSchemasSource = options.readFile('src/infrastructure/database/pg-schemas.ts');
  for (const file of options.changedFiles) {
    const migration = /^migrations\/([^/]+\.sql)$/.exec(file)?.[1];
    if (migration) {
      for (const table of options.touchedBy.get(migration) ?? []) tables.add(table);
    } else if (file.endsWith('.schema.ts')) {
      const schemaSource = options.readFile(file);
      for (const table of declaredTables({ schemaSource, pgSchemasSource })) tables.add(table);
    }
  }
  return [...tables];
}

function main(): void {
  const root = process.cwd();
  const filesArgument = process.argv.indexOf('--files');
  const changedFiles =
    filesArgument === -1
      ? execSync('git diff --cached --name-only', { encoding: 'utf8' }).split('\n')
      : (process.argv[filesArgument + 1] ?? '').split(',');
  const existing = changedFiles
    .map((file) => file.trim())
    .filter((file) => file !== '' && existsSync(join(root, file)));
  const directory = join(root, 'migrations');
  const migrations = readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => ({ name, content: readFileSync(join(directory, name), 'utf8') }));
  const { tables, touchedBy } = buildRlsState(migrations);
  const touched = touchedTables({
    changedFiles: existing,
    touchedBy,
    readFile: (path) => readFileSync(join(root, path), 'utf8'),
  });
  process.exitCode = reportEarlyCheck({
    check: `RLS policy lint (${touched.length} table(s) touched)`,
    findings: lintRlsTables({ state: tables, tables: touched }),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
