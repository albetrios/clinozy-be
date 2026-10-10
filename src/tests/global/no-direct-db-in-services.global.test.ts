import { promises as fs } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * sec-r5-architecture: enforce the codebase rule that
 *   "only repositories own the DB connection — services / controllers / utils
 *    may use `with*DatabaseContext` orchestration helpers but MUST go through
 *    a repository for the actual SQL."
 *
 * Until 2026-06-08 the rule lived only in `CLAUDE.md`; a single util
 * (`stripe-webhook-organization.util.ts`) had drifted to call raw `sql\`\``.
 * This test prevents the drift from happening again:
 *
 * Walks every `.ts` file under `src/domains/**` that is NOT a repository,
 * NOT a schema, NOT a test, NOT a seed. Fails if any such file imports one
 * of the DB-query primitives — the `database` connection singleton, the
 * raw postgres-js `sql` template, or `getRequestDatabase`. Context wrappers
 * (`withAppDatabaseContext`, `withMaintenanceDatabaseContext`,
 * `withTransaction`, etc.) and DB-handle TYPES are allowed because they
 * model service-layer orchestration; the SQL queries they wrap still go
 * through repositories.
 */
describe('Global: no direct DB-query primitives outside repositories (sec-r5-architecture)', () => {
  const FORBIDDEN_IMPORT_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
    {
      name: '`database` singleton from connection.js',
      pattern:
        /import\s*\{[^}]*\bdatabase\b[^}]*\}\s*from\s+['"]@\/infrastructure\/database\/connection\.js['"]/g,
    },
    {
      name: 'raw `sql` tagged-template from connection.js',
      pattern:
        /import\s*\{[^}]*\bsql\b[^}]*\}\s*from\s+['"]@\/infrastructure\/database\/connection\.js['"]/g,
    },
    {
      name: 'getRequestDatabase() from request-database.context.js',
      pattern: /\bgetRequestDatabase\b/g,
    },
  ];

  /**
   * Files that are intentionally allowed to import the DB primitives. Adding
   * a file here requires a comment explaining WHY the architecture rule does
   * not apply (typically: this file IS a repository / schema / migration
   * runner / context wrapper / very narrow infra glue).
   */
  const REPOSITORY_OR_SCHEMA_SUFFIXES = ['.repository.ts', '.schema.ts'];

  const JUSTIFIED_NON_REPO_DOMAIN_FILES = new Set<string>([
    // Each of these is a domain-level infra adapter that legitimately owns a
    // DB session / handle wiring; they are NOT services issuing queries.
    // Listed individually so any new addition gets reviewed.
    // (Empty today — every previously-direct call has been migrated to a
    // repository. If you must add a file, document why here.)
  ]);

  const SKIP_DIRECTORIES = new Set<string>([
    'node_modules',
    'dist',
    'build',
    'coverage',
    '.git',
    '__tests__',
    '__snapshots__',
    'seed',
  ]);

  async function* walkDomainFiles(root: string): AsyncGenerator<string> {
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(root, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        yield* walkDomainFiles(entryPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.ts')) continue;
      if (entry.name.endsWith('.test.ts')) continue;
      if (entry.name.endsWith('.d.ts')) continue;
      // Each guard chooses the layers it checks from these runtime domain files.
      yield entryPath;
    }
  }

  it('recognizes ordinary and multiline runtime connection imports while allowing type-only imports', () => {
    for (const primitive of ['database', 'sql']) {
      const scanner = FORBIDDEN_IMPORT_PATTERNS.find(({ name }) =>
        name.includes(`\`${primitive}\``),
      )?.pattern;
      expect(scanner).toBeDefined();
      for (const source of [
        `import { ${primitive} } from '@/infrastructure/database/connection.js';`,
        `import {
  ${primitive} as connectionPrimitive,
} from '@/infrastructure/database/connection.js';`,
      ]) {
        scanner!.lastIndex = 0;
        expect(scanner!.test(source), source).toBe(true);
      }
      scanner!.lastIndex = 0;
      expect(
        scanner!.test(
          `import type { ${primitive} } from '@/infrastructure/database/connection.js';`,
        ),
      ).toBe(false);
      scanner!.lastIndex = 0;
    }
  });

  it('forbids `database` / `sql` / `getRequestDatabase` outside repositories', async () => {
    const repositoryRoot = process.cwd();
    const domainsRoot = join(repositoryRoot, 'src', 'domains');
    const violations: string[] = [];

    for await (const absolutePath of walkDomainFiles(domainsRoot)) {
      if (REPOSITORY_OR_SCHEMA_SUFFIXES.some((suffix) => absolutePath.endsWith(suffix))) continue;
      const relativePath = relative(repositoryRoot, absolutePath);
      if (JUSTIFIED_NON_REPO_DOMAIN_FILES.has(relativePath)) continue;

      const fileText = await fs.readFile(absolutePath, 'utf8');

      for (const { name, pattern } of FORBIDDEN_IMPORT_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(fileText)) {
          violations.push(`  ${relativePath} — uses ${name}`);
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Found direct DB-query usage outside a repository — violates the codebase architecture rule (CLAUDE.md):\n${violations.join('\n')}\n\nFix: move the query to the relevant *.repository.ts and have the caller invoke the repository method instead. OR add the file to JUSTIFIED_NON_REPO_DOMAIN_FILES with a comment explaining why this is unavoidable.`,
      );
    }
    expect(violations).toEqual([]);
  });

  /**
   * Closes the gap that let `resolve-active-organization.ts` build a full `.select().from()` query
   * inline on the login path while still passing the check above (it imported `sql` from
   * `drizzle-orm` + a context wrapper, not from `connection.js`). Request-path domain files MUST
   * delegate SQL to a repository. Only repositories (`.repository.ts`, filtered below)
   * and the async maintenance layer (`*.worker.ts` / `*.processor.ts`, which bind a context handle
   * for retention jobs) may import the `drizzle-orm` query builder.
   */
  it('forbids drizzle-orm query builders in request-path domain files (only repositories and workers/processors may build SQL)', async () => {
    const repositoryRoot = process.cwd();
    const domainsRoot = join(repositoryRoot, 'src', 'domains');
    const DRIZZLE_ORM_IMPORT = /from\s+['"]drizzle-orm['"]/;
    const violations: string[] = [];

    for await (const absolutePath of walkDomainFiles(domainsRoot)) {
      if (REPOSITORY_OR_SCHEMA_SUFFIXES.some((suffix) => absolutePath.endsWith(suffix))) continue;
      const relativePath = relative(repositoryRoot, absolutePath);
      if (relativePath.endsWith('.worker.ts') || relativePath.endsWith('.processor.ts')) continue;

      const fileText = await fs.readFile(absolutePath, 'utf8');
      if (DRIZZLE_ORM_IMPORT.test(fileText)) {
        violations.push(
          `  ${relativePath} — imports the drizzle-orm query builder outside a repository`,
        );
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Found drizzle-orm query construction in request-path files — violates the codebase architecture rule (CLAUDE.md: only repositories own the actual SQL):\n${violations.join('\n')}\n\nFix: move the query into the relevant *.repository.ts and call the repository method from here.`,
      );
    }
    expect(violations).toEqual([]);
  });
  /**
   * Workers and processors may build a predicate for the shared batch-delete util
   * (`deleteInBatchesByCondition`), but the queries they run belong in a repository: four
   * processors had grown inline `.select()` / `.insert()` / `.execute()` calls on their context
   * handle (the offboarding reconciles, the audit outbox drain, the audit export).
   */
  it('forbids running queries on a database handle inside workers and processors', async () => {
    const repositoryRoot = process.cwd();
    const HANDLE_QUERY =
      /\b\w*(?:[Hh]andle|[Dd]atabase)\s*\.\s*(?:select|selectDistinct|insert|update|delete|execute)\s*\(/;
    const violations: string[] = [];
    let scanned = 0;
    for await (const absolutePath of walkDomainFiles(join(repositoryRoot, 'src', 'domains'))) {
      if (!(absolutePath.endsWith('.worker.ts') || absolutePath.endsWith('.processor.ts')))
        continue;
      scanned += 1;
      const fileText = await fs.readFile(absolutePath, 'utf8');
      if (HANDLE_QUERY.test(fileText)) {
        violations.push(`  ${relative(repositoryRoot, absolutePath)}`);
      }
    }
    expect(scanned, 'The policy must scan the worker/processor inventory').toBeGreaterThan(20);
    expect(
      violations,
      `Workers/processors run queries directly — move them into the repository:\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  it('repositories use pinned accessors instead of opening second checkouts through connection singletons', async () => {
    const violations: string[] = [];
    let scannedRepositories = 0;
    for await (const absolutePath of walkDomainFiles(join(process.cwd(), 'src', 'domains'))) {
      if (!absolutePath.endsWith('.repository.ts')) continue;
      scannedRepositories += 1;
      const source = await fs.readFile(absolutePath, 'utf8');
      for (const { name, pattern } of FORBIDDEN_IMPORT_PATTERNS.slice(0, 2)) {
        pattern.lastIndex = 0;
        if (pattern.test(source))
          violations.push(`${relative(process.cwd(), absolutePath)} — ${name}`);
      }
    }
    expect(
      scannedRepositories,
      'The policy must scan the actual repository inventory',
    ).toBeGreaterThan(20);
    expect(
      violations,
      'A direct global-pool query can deadlock a service that already holds a checkout. Use getRequestDatabase/getContextFreeDatabase or the supplied worker handle.',
    ).toEqual([]);
  });
});
