/**
 * Project-identity generation policy.
 *
 * The template promise is that ONE edit to `tooling/setup/setup.config.json`
 * renames the whole project. These tests pin the two properties that make that
 * true and are easy to regress: renderers must be rename-safe (never anchored on
 * the current slug) and must not disturb fields another tool owns.
 */
import { describe, expect, it } from 'vitest';
import {
  buildProjectIdentitySnapshot,
  resolveDerivedNames,
} from '@tooling/setup/codegen/project-identity.util.js';
import {
  renderCodeowners,
  renderComposeContainerNames,
  renderPackageJson,
  renderProductionEnvironment,
  renderSonarProperties,
} from '@tooling/setup/codegen/repository-identity-artifacts.js';
import {
  applyTextRewrites,
  infraSlugFor,
  localDatabaseRules,
  mcpTemplateRules,
  replaceIdentityToken,
  rewritePreviousDatabaseName,
  rewritePreviousRedisKeyPrefix,
  rewritePreviousWordmark,
  slugSpellings,
  TEXT_REWRITE_TARGETS,
} from '@tooling/setup/codegen/text-identity-rewrites.js';
import { readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  identityLiterals,
  previousIdentityPatterns,
  scanProjectIdentityLiterals,
} from '@tooling/setup/codegen/validate-project-identity-literals.js';
import { INHERITED_GIT_REPOSITORY_VARIABLES } from '@tooling/setup/common/git-environment.js';
import type { SetupConfig } from '@tooling/setup/common/types.js';
import {
  createTestGitRepository,
  removeScratchFolders,
  runTestGit,
} from '@/tests/helpers/git-repository.helper.js';

function buildConfig(overrides?: {
  name?: string;
  owners?: string[];
  repository?: string;
  brandName?: string;
}): SetupConfig {
  return {
    project: {
      name: overrides?.name ?? 'acme-api',
      displayName: 'Acme API',
      ...(overrides?.brandName ? { brandName: overrides.brandName } : {}),
      packageName: overrides?.name ?? 'acme-api',
    },
    git: { protectedBranches: ['main'], defaultBranch: 'main' },
    environments: [
      {
        name: 'production',
        label: 'Production',
        nodeEnvironment: 'production',
        protected: true,
        isDefault: true,
      },
    ],
    providers: {
      github: {
        enabled: true,
        repository: overrides?.repository ?? 'acme-organization/acme-api',
        ...(overrides?.owners ? { owners: overrides.owners } : {}),
      },
    },
  } as SetupConfig;
}

const snapshot = buildProjectIdentitySnapshot(buildConfig());

describe('project identity — derived names', () => {
  it('derives every slug-bearing name from the manifest slug', () => {
    const derived = resolveDerivedNames(buildConfig({ name: 'acme-api' }));
    expect(derived.apiServerName).toBe('acme-api');
    expect(derived.webhookUserAgent).toBe('acme-api-webhook');
    expect(derived.sonarProjectKey).toBe('acme-api');
    expect(derived.dbmlPath).toBe('docs/database/acme-api.dbml');
    expect(derived.containers.postgres).toBe('acme-api-postgres');
    expect(derived.containers.sonarScanner).toBe('acme-api-sonar-scanner');
  });

  it('treats the slug, the GitHub owner and the display name as the forbidden literals', () => {
    // The display name is in the set because the slug alone does not cover the
    // BRAND: a rename leaves the base project's product name behind in places
    // that never contained the slug (mail sender fallback, OpenAPI description).
    expect(identityLiterals(snapshot)).toEqual(['acme-api', 'acme-organization', 'Acme API']);
  });
});

describe('project identity — brand name', () => {
  it('defaults the brand users see to the display name', () => {
    expect(snapshot.brandName).toBe('Acme API');
  });

  it('writes the brand into the user-facing .env.example values, from any previous value', () => {
    const envTemplate = TEXT_REWRITE_TARGETS.find((target) => target.path === '.env.example');
    const branded = buildProjectIdentitySnapshot(buildConfig({ brandName: 'Acme' }));
    const rewritten = applyTextRewrites(
      'EMAIL_FROM_NAME=YourApp\nWEBAUTHN_RP_NAME=Previous Product\nAPI_DOCS_BASE_URL=https://docs.example.com',
      envTemplate?.rules ?? [],
      branded,
    );
    expect(rewritten).toBe(
      'EMAIL_FROM_NAME=Acme\nWEBAUTHN_RP_NAME=Acme\nAPI_DOCS_BASE_URL=https://docs.example.com',
    );
  });

  it('flags the brand typed out as a word, but not identifiers built from the same stem', () => {
    // A throwaway repository: the fixture brand appears nowhere in this one, so scanning the
    // real tree would pass whatever the scanner did.
    const scratch = createTestGitRepository({
      prefix: 'identity-brand-',
      files: {
        'sender.ts': "export const sender = 'Acme';\n",
        'helper.ts': 'export function executeAsAcmeBeAppTenant() {}\n',
      },
    });
    try {
      const { violations } = scanProjectIdentityLiterals({
        snapshot: buildProjectIdentitySnapshot(buildConfig({ brandName: 'Acme' })),
        projectRoot: scratch,
        generatedPaths: [],
      });
      const flagged = violations.map((violation) => `${violation.file}:${violation.literal}`);
      expect(flagged).toContain('sender.ts:Acme');
      expect(flagged.some((entry) => entry.startsWith('helper.ts'))).toBe(false);
    } finally {
      removeScratchFolders();
    }
  });

  it("leaves a design iteration's prototype export alone", () => {
    const scratch = createTestGitRepository({
      prefix: 'identity-iteration-',
      files: {
        'iterations/launch-x/intake-files/Prototype.html': '<span aria-label="Acme">Acme</span>\n',
        'sender.ts': "export const sender = 'Acme';\n",
      },
    });
    try {
      const { violations } = scanProjectIdentityLiterals({
        snapshot: buildProjectIdentitySnapshot(buildConfig({ brandName: 'Acme' })),
        projectRoot: scratch,
        generatedPaths: [],
      });
      const files = violations.map((violation) => violation.file);
      expect(files).toContain('sender.ts');
      expect(files.some((file) => file.startsWith('iterations/'))).toBe(false);
    } finally {
      removeScratchFolders();
    }
  });
});

describe('project identity — previous identity gate', () => {
  const renamed = buildProjectIdentitySnapshot({
    ...buildConfig(),
    project: {
      ...buildConfig().project,
      previousNames: ['legacy-be', 'legacy-fe'],
      previousOwners: ['legacy-organization'],
    },
  } as SetupConfig);
  const flags = (line: string): boolean =>
    previousIdentityPatterns(renamed).some(({ pattern }) => pattern.test(line));

  it('finds a previous slug in every casing and separator a rename can miss', () => {
    // Each of these survived a real rename: an UPPERCASE banner, an identifier, a role.
    for (const line of [
      'LEGACY-FE FULL JOURNEY',
      'grantLegacyBeAppRoleForTests()',
      'GRANT legacy_be_app TO x;',
      'LEGACY_BE_RUNTIME=1',
      'container legacy-be-postgres',
    ]) {
      expect(flags(line), line).toBe(true);
    }
  });

  it('finds the previous database name only where it is the database', () => {
    for (const line of [
      'POSTGRES_USER: legacy',
      'POSTGRES_DB=legacy',
      '--health-cmd="pg_isready -U legacy -d legacy"',
      'DATABASE_URL: postgresql://user:pass@localhost:5432/legacy_dryrun',
      'CREATE DATABASE legacy;',
      // Forms a rename once missed: libpq variables, the `postgres://` scheme, a URL without
      // credentials (an env-schema test fixture), and a `_test` database behind `-d`.
      'PGUSER=legacy',
      'PGDATABASE: legacy_test',
      "DATABASE_URL: 'postgres://localhost:5432/legacy'",
      'postgres://legacy@localhost/legacy_test',
      'psql -d legacy_test -c "select 1"',
      '# legacy:legacy, as in docker-compose.yml',
    ]) {
      expect(flags(line), line).toBe(true);
    }
    // The same word as a folder or in prose is not the database.
    for (const line of [
      'src/legacy/events/event-bus.ts',
      'the legacy layer',
      'POSTGRES_USER: postgres',
      'PGUSER=postgres',
      'postgres://localhost:5432/legacyish',
    ]) {
      expect(flags(line), line).toBe(false);
    }
  });

  it('finds a previous slug written as a display wordmark', () => {
    // The dashboards hub still titled itself with the old slug as a `<name>·<suffix>` wordmark (and
    // split it with a <span>) long after the rename — no slug spelling covers that separator.
    for (const line of [
      '<title>legacy·be — control room</title>',
      'LEGACY • BE',
      'legacy&middot;be',
      'legacy&#183;be',
      'Legacy∙BE',
      '<div>legacy<span class="text-brand">·</span>be</div>',
    ]) {
      expect(flags(line), line).toBe(true);
    }
    // The tail must end the word.
    for (const line of ['legacy·bean', 'legacy&middot;beans']) {
      expect(flags(line), line).toBe(false);
    }
  });

  it('flags a previous slug joined by a plain dot or a single space, for a human to reword', () => {
    // Detection only — the rename pass leaves this shape alone (see the next describe), because
    // prose shares it: a hit is a line someone rewords, never an automatic rewrite.
    for (const line of [
      'legacy.be',
      'https://legacy.be/docs',
      'Legacy BE control room',
      'LEGACY.FE',
      'let the legacy be',
    ]) {
      expect(flags(line), line).toBe(true);
    }
    // Exactly one separator character, and the halves must stand as whole words.
    for (const line of ['legacy..be', 'legacy  be', 'legacy.bean', 'xlegacy be', 'legacy.bed']) {
      expect(flags(line), line).toBe(false);
    }
  });

  it("finds the previous backend slug's sibling infrastructure repository", () => {
    // CI comments and two policy tests kept naming the old `<stem>-infra` repository after the
    // rename — no previous name covered it.
    for (const line of [
      'the deploy path calls legacy-infra',
      'LEGACY-INFRA PROVISIONING',
      'legacy_infra_bucket',
    ]) {
      expect(flags(line), line).toBe(true);
    }
    expect(flags('infra-only keys are dropped')).toBe(false);
    expect(infraSlugFor('legacy-be')).toBe('legacy-infra');
    expect(infraSlugFor('acme-api')).toBeNull();
  });

  it('finds the previous backend stem only where it is a Redis key prefix', () => {
    // resolveRedisKeyPrefix() kept the old stem as its `<stem>:<NODE_ENV>:` default after the
    // rename, so every Redis key and BullMQ queue carried the old name.
    for (const line of [
      `return \`legacy:\${environment.NODE_ENV}:\`;`,
      'REDIS_KEY_PREFIX=legacy:dev:',
      "process.env.REDIS_KEY_PREFIX = 'legacy:test:';",
      "keyPrefix: 'legacy:'",
      // The documented default in an env-schema comment.
      'Redis key prefix (default `legacy:<NODE_ENV>:`).',
    ]) {
      expect(flags(line), line).toBe(true);
    }
    for (const line of [
      'legacy: true',
      'src/legacy/events/event-bus.ts',
      '@scope/legacy:dev',
      'legacy::value',
    ]) {
      expect(flags(line), line).toBe(false);
    }
  });

  it('never flags a genuine word that merely starts like the previous slug', () => {
    // A folder, an English word or an identifier that only BEGINS like the old slug is not it.
    for (const line of [
      'legacyFeatures',
      'const legacy_features = [];',
      'class LegacyBehavior {}',
      'xlegacy-be',
      'src/legacy/events/event-bus.ts',
    ]) {
      expect(flags(line), line).toBe(false);
    }
  });

  it('finds a previous owner as a whole word', () => {
    expect(flags('authorize the app on `legacy-organization/acme-api`')).toBe(true);
    expect(flags('legacy-organizations-archive')).toBe(false);
  });

  it('lets a previous repository owner stay a code owner, flagging only <owner>/<repo>', () => {
    // The repo moved from a personal account to an organization, but that person still owns code.
    const moved = buildProjectIdentitySnapshot({
      ...buildConfig(),
      project: { ...buildConfig().project, previousOwners: ['jane-doe'] },
      providers: {
        ...buildConfig().providers,
        github: { ...buildConfig().providers.github, owners: ['jane-doe'] },
      },
    } as SetupConfig);
    const flagsMoved = (line: string): boolean =>
      previousIdentityPatterns(moved).some(({ pattern }) => pattern.test(line));
    expect(flagsMoved('*                        @jane-doe')).toBe(false);
    expect(flagsMoved('        "jane-doe"')).toBe(false);
    expect(flagsMoved('git clone https://github.com/jane-doe/acme-api')).toBe(true);
    expect(flagsMoved('authorize the app on `jane-doe/acme-api`')).toBe(true);
  });

  it('never flags the current identity, so the gate can pass', () => {
    const current = buildProjectIdentitySnapshot({
      ...buildConfig(),
      project: { ...buildConfig().project, previousNames: ['acme-api'] },
    } as SetupConfig);
    expect(previousIdentityPatterns(current)).toEqual([]);
  });
});

describe('project identity — the rename pass rewrites what the previous-identity gate flags', () => {
  const renamed = buildProjectIdentitySnapshot({
    ...buildConfig(),
    project: {
      ...buildConfig().project,
      previousNames: ['legacy-be', 'legacy-fe'],
      previousOwners: [],
    },
  } as SetupConfig);
  const flags = (line: string): boolean =>
    previousIdentityPatterns(renamed).some(({ pattern }) => pattern.test(line));
  const slugPairs = [
    ['legacy-fe', 'globex-fe'],
    ['legacy-be', 'globex-be'],
  ] as const;

  /** The `pnpm init:project` prose transforms for legacy-* → globex-*, in the order it runs them. */
  const rename = (line: string): string => {
    let updated = line;
    for (const [previous, next] of [['legacy-infra', 'globex-infra'], ...slugPairs] as const) {
      const nextSpellings = slugSpellings(next);
      updated = slugSpellings(previous).reduce(
        (text, from, index) => replaceIdentityToken(text, from, nextSpellings[index] ?? from),
        updated,
      );
    }
    updated = rewritePreviousDatabaseName(updated, {
      previousDatabaseName: 'legacy',
      nextDatabaseName: 'globex',
    });
    updated = rewritePreviousRedisKeyPrefix(updated, {
      previousStem: 'legacy',
      nextStem: 'globex',
    });
    for (const [previousSlug, nextSlug] of slugPairs) {
      updated = rewritePreviousWordmark(updated, { previousSlug, nextSlug });
    }
    return updated;
  };

  it('renames a wordmark, keeping its separator, markup and casing', () => {
    const renameWordmark = (value: string): string =>
      rewritePreviousWordmark(value, { previousSlug: 'legacy-be', nextSlug: 'globex-be' });
    expect(renameWordmark('<title>legacy·be — control room</title>')).toBe(
      '<title>globex·be — control room</title>',
    );
    expect(renameWordmark('LEGACY • BE')).toBe('GLOBEX • BE');
    expect(renameWordmark('Legacy·be')).toBe('Globex·be');
    expect(renameWordmark('legacy&middot;be')).toBe('globex&middot;be');
    expect(renameWordmark('<div>legacy<span class="text-brand">·</span>be</div>')).toBe(
      '<div>globex<span class="text-brand">·</span>be</div>',
    );
    for (const untouched of ['let the legacy be', 'legacy.be', 'legacy·bean']) {
      expect(renameWordmark(untouched)).toBe(untouched);
    }
  });

  it('renames the stem only where it is a Redis key prefix', () => {
    const renameStem = (value: string): string =>
      rewritePreviousRedisKeyPrefix(value, { previousStem: 'legacy', nextStem: 'globex' });
    expect(renameStem(`return \`legacy:\${environment.NODE_ENV}:\`;`)).toBe(
      `return \`globex:\${environment.NODE_ENV}:\`;`,
    );
    expect(renameStem('REDIS_KEY_PREFIX=legacy:dev:')).toBe('REDIS_KEY_PREFIX=globex:dev:');
    expect(renameStem("process.env.REDIS_KEY_PREFIX = 'legacy:test:';")).toBe(
      "process.env.REDIS_KEY_PREFIX = 'globex:test:';",
    );
    expect(renameStem("keyPrefix: 'legacy:'")).toBe("keyPrefix: 'globex:'");
    for (const untouched of [
      'legacy: true',
      'src/legacy/events/event-bus.ts',
      '@scope/legacy:dev',
      'legacy::value',
    ]) {
      expect(renameStem(untouched)).toBe(untouched);
    }
  });

  it('leaves nothing behind that the gate flags', () => {
    // One line for every form the gate detects — slug spellings, the database, the wordmark, the
    // Redis key prefix. A form added to the gate without a rewrite in the rename pass fails here.
    for (const line of [
      'LEGACY-FE FULL JOURNEY',
      'grantLegacyBeAppRoleForTests()',
      'GRANT legacy_be_app TO x;',
      'LEGACY_BE_RUNTIME=1',
      'container legacy-be-postgres',
      'POSTGRES_USER: legacy',
      'POSTGRES_DB=legacy',
      '--health-cmd="pg_isready -U legacy -d legacy"',
      'DATABASE_URL: postgresql://user:pass@localhost:5432/legacy_dryrun',
      'CREATE DATABASE legacy;',
      '<title>legacy·be — control room</title>',
      'LEGACY • BE',
      'legacy&middot;be',
      '<div>legacy<span class="text-brand">·</span>fe</div>',
      `return \`legacy:\${environment.NODE_ENV}:\`;`,
      'REDIS_KEY_PREFIX=legacy:dev:',
      "process.env.REDIS_KEY_PREFIX = 'legacy:test:';",
      "keyPrefix: 'legacy:'",
      'Redis key prefix (default `legacy:<NODE_ENV>:`).',
      'PGUSER=legacy',
      'PGDATABASE: legacy_test',
      "DATABASE_URL: 'postgres://localhost:5432/legacy'",
      'postgres://legacy@localhost/legacy_test',
      'psql -d legacy_test -c "select 1"',
      'the deploy path calls legacy-infra',
      'LEGACY-INFRA PROVISIONING',
      '# legacy:legacy, as in docker-compose.yml',
    ]) {
      expect(flags(line), line).toBe(true);
      expect(flags(rename(line)), `${line} → ${rename(line)}`).toBe(false);
    }
  });
});

describe('project identity — whole-token rename', () => {
  it('lists every spelling a slug takes', () => {
    expect(slugSpellings('legacy-be')).toEqual([
      'LEGACY-BE',
      'LEGACY_BE',
      'LegacyBe',
      'legacyBe',
      'legacybe',
      'legacy_be',
      'legacy-be',
      'Legacy-be',
      'Legacy_be',
      'Legacybe',
    ]);
  });

  it('renames the slug inside identifiers but leaves genuine words alone', () => {
    const rename = (value: string): string =>
      slugSpellings('legacy-fe').reduce(
        (text, from, index) =>
          replaceIdentityToken(text, from, slugSpellings('globex-fe')[index] ?? from),
        value,
      );
    expect(rename('LEGACY-FE FULL JOURNEY')).toBe('GLOBEX-FE FULL JOURNEY');
    expect(rename('grantLegacyFeAppRole(); legacy_fe_app')).toBe(
      'grantGlobexFeAppRole(); globex_fe_app',
    );
    // Genuine words that only begin like the old slug: untouched.
    for (const genuine of [
      'legacyFeatures',
      'legacy_features',
      'LegacyFeedback',
      'src/legacy/fe.ts',
    ]) {
      expect(rename(genuine)).toBe(genuine);
    }
  });
});

describe('project identity — local database rename', () => {
  const stem = snapshot.derived.databaseName;

  it('generator rule rewrites the all-stem local URL and keeps a database suffix', () => {
    const rewritten = applyTextRewrites(
      'A=postgresql://legacy:legacy@localhost:5432/legacy\nB=postgresql://legacy:legacy@localhost:5432/legacy_dryrun',
      localDatabaseRules(),
      snapshot,
    );
    expect(rewritten).toBe(
      `A=postgresql://${stem}:${stem}@localhost:5432/${stem}\nB=postgresql://${stem}:${stem}@localhost:5432/${stem}_dryrun`,
    );
  });

  it('generator rule leaves placeholders and restricted-role URLs exactly as written', () => {
    // Each of these was once rewritten to `<stem>:<stem>@…/<stem>`: the placeholders became
    // look-alike credentials (a SonarQube BLOCKER) and the role URL was pointed at the
    // superuser, which bypasses RLS.
    const untouched = [
      'postgresql://user:password@host:5432/db',
      'postgresql://u:p@host:5432/db',
      'postgresql://legacy_be_operator:parity-canary@localhost:5432/legacy',
    ].join('\n');
    expect(applyTextRewrites(untouched, localDatabaseRules(), snapshot)).toBe(untouched);
  });

  it('prose pass renames only the URL parts that equal the previous database name', () => {
    const rename = (value: string): string =>
      rewritePreviousDatabaseName(value, {
        previousDatabaseName: 'legacy',
        nextDatabaseName: 'globex',
      });
    expect(rename('postgresql://legacy:legacy@localhost:5432/legacy')).toBe(
      'postgresql://globex:globex@localhost:5432/globex',
    );
    expect(rename('postgresql://legacy:legacy@localhost:5432/legacy_dryrun')).toBe(
      'postgresql://globex:globex@localhost:5432/globex_dryrun',
    );
    // A role keeps its own name and secret; only the database moves.
    expect(rename('postgresql://legacy_be_operator:parity-canary@localhost:5432/legacy')).toBe(
      'postgresql://legacy_be_operator:parity-canary@localhost:5432/globex',
    );
    // Placeholders and unrelated examples never contained the previous name.
    for (const untouched of [
      'postgresql://user:password@host:5432/db',
      'postgresql://test:test@localhost:5432/test',
      'postgresql://user:pass@ep-aged.neon.tech:5432/neondb',
    ]) {
      expect(rename(untouched)).toBe(untouched);
    }
  });

  it('prose pass keeps CI service settings in step with the URLs beside them', () => {
    const rename = (value: string): string =>
      rewritePreviousDatabaseName(value, {
        previousDatabaseName: 'legacy',
        nextDatabaseName: 'globex',
      });
    expect(rename('POSTGRES_USER: legacy\nPOSTGRES_PASSWORD: legacy\nPOSTGRES_DB: legacy')).toBe(
      'POSTGRES_USER: globex\nPOSTGRES_PASSWORD: globex\nPOSTGRES_DB: globex',
    );
    expect(rename('pg_isready -U legacy -d legacy')).toBe('pg_isready -U globex -d globex');
    expect(rename('CREATE DATABASE legacy_dryrun;')).toBe('CREATE DATABASE globex_dryrun;');
    // A `_test` database behind `-d`, libpq variables, and URLs without credentials or port.
    expect(rename('psql -U legacy -d legacy_test')).toBe('psql -U globex -d globex_test');
    expect(rename('PGUSER=legacy PGPASSWORD=legacy PGDATABASE=legacy_test')).toBe(
      'PGUSER=globex PGPASSWORD=globex PGDATABASE=globex_test',
    );
    expect(rename('postgres://localhost:5432/legacy')).toBe('postgres://localhost:5432/globex');
    expect(rename('postgres://legacy@localhost/legacy_test')).toBe(
      'postgres://globex@localhost/globex_test',
    );
    expect(rename('postgres://user:pass@host/db')).toBe('postgres://user:pass@host/db');
    // The same word outside those anchors is not the database.
    expect(rename('POSTGRES_USER: postgres')).toBe('POSTGRES_USER: postgres');
    expect(rename('the legacy layer')).toBe('the legacy layer');
  });
});

describe('project identity — CODEOWNERS', () => {
  it('defaults the roster to the repository owner', () => {
    const codeowners = renderCodeowners(snapshot);
    expect(codeowners).toContain('*                        @acme-organization');
    expect(codeowners).toContain('# GENERATED by pnpm tool:generate-project-identity');
  });

  it('emits every configured owner so team governance mode can be satisfied', () => {
    const multiOwner = buildProjectIdentitySnapshot(
      buildConfig({ owners: ['first-owner', 'second-owner'] }),
    );
    const codeowners = renderCodeowners(multiOwner);
    expect(codeowners).toContain('@first-owner @second-owner');
  });
});

describe('project identity — production environment reconcile', () => {
  const baseEnvironment = JSON.stringify(
    {
      name: 'production',
      protection: {
        requiredReviewers: { users: ['previous-owner'], teams: [], preventSelfReview: false },
        deploymentBranchPolicy: { protectedBranches: true, customBranchPolicies: false },
      },
    },
    null,
    2,
  );

  it('replaces a stale owner handle with the manifest roster', () => {
    const result = JSON.parse(renderProductionEnvironment(snapshot, baseEnvironment));
    expect(result.protection.requiredReviewers.users).toEqual(['acme-organization']);
  });

  it('never changes fields owned by github:tool:governance-mode', () => {
    const teamEnvironment = JSON.stringify({
      name: 'production',
      protection: {
        requiredReviewers: {
          users: ['stale-one', 'stale-two'],
          teams: [],
          preventSelfReview: true,
        },
        deploymentBranchPolicy: { protectedBranches: true, customBranchPolicies: false },
      },
    });
    const multiOwner = buildProjectIdentitySnapshot(
      buildConfig({ owners: ['first-owner', 'second-owner'] }),
    );
    const result = JSON.parse(renderProductionEnvironment(multiOwner, teamEnvironment));
    // Reviewer COUNT is preserved, so the encoded governance mode is unchanged.
    expect(result.protection.requiredReviewers.users).toHaveLength(2);
    expect(result.protection.requiredReviewers.preventSelfReview).toBe(true);
    expect(result.protection.deploymentBranchPolicy.protectedBranches).toBe(true);
  });
});

describe('project identity — package.json reconcile', () => {
  it('rewrites the name and derives repository coordinates', () => {
    const result = JSON.parse(renderPackageJson(snapshot, JSON.stringify({ name: 'old-name' })));
    expect(result.name).toBe('acme-api');
    expect(result.repository.url).toBe('git+https://github.com/acme-organization/acme-api.git');
    expect(result.bugs.url).toBe('https://github.com/acme-organization/acme-api/issues');
  });

  it('keeps the committed description when the manifest does not set one', () => {
    const result = JSON.parse(
      renderPackageJson(snapshot, JSON.stringify({ name: 'old', description: 'Keep me' })),
    );
    expect(result.description).toBe('Keep me');
  });
});

describe('project identity — rename safety', () => {
  it('rewrites compose container names from ANY previous slug', () => {
    const compose = [
      'services:',
      '  postgres:',
      '    container_name: totally-different-postgres',
      '  redis:',
      '    container_name: legacy-redis',
      '  sonar-scanner:',
      '    container_name: legacy-sonar-scanner',
    ].join('\n');
    const rewritten = renderComposeContainerNames(snapshot, compose);
    expect(rewritten).toContain('container_name: acme-api-postgres');
    expect(rewritten).toContain('container_name: acme-api-redis');
    // Longest-suffix-first ordering: `-sonar-scanner` must not be shortened.
    expect(rewritten).toContain('container_name: acme-api-sonar-scanner');
  });

  it('is idempotent — re-running produces no further change', () => {
    const once = renderComposeContainerNames(snapshot, '    container_name: old-postgres\n');
    expect(renderComposeContainerNames(snapshot, once)).toBe(once);
  });

  it('rewrites sonar keys regardless of the previous value', () => {
    const properties = renderSonarProperties(
      snapshot,
      'sonar.projectKey=whatever-was-here\nsonar.projectName=whatever-was-here\nsonar.sources=src\n',
    );
    expect(properties).toContain('sonar.projectKey=acme-api');
    expect(properties).toContain('sonar.projectName=acme-api');
    expect(properties).toContain('sonar.sources=src');
  });
});

describe('project identity — text rewrites', () => {
  const snapshot = buildProjectIdentitySnapshot(buildConfig({ name: 'acme-api' }));

  /**
   * Regression: `docker-compose.yml` is touched by TWO rules — container names
   * and the Toxiproxy image tag. When each transform was computed from a fresh
   * read of the file, the second silently discarded the first, so container
   * names kept the base project's slug after an otherwise successful adoption.
   * Transforms must compose.
   */
  it('composes multiple rewrites of the same file instead of clobbering', () => {
    const original = [
      'services:',
      '  postgres:',
      '    container_name: old-postgres',
      '  toxiproxy:',
      '    image: old-toxiproxy:2.12.0',
      '    container_name: old-toxiproxy',
      '',
    ].join('\n');

    const toxiproxyRules = TEXT_REWRITE_TARGETS.find(
      (target) => target.path === 'docker-compose.yml',
    )?.rules;
    expect(toxiproxyRules).toBeDefined();

    // Same order the generator applies them: container names, then text rules,
    // each building on the previous result.
    const afterContainers = renderComposeContainerNames(snapshot, original);
    const composed = applyTextRewrites(afterContainers, toxiproxyRules ?? [], snapshot);

    expect(composed).toContain('container_name: acme-api-postgres');
    expect(composed).toContain('container_name: acme-api-toxiproxy');
    expect(composed).toContain('image: acme-api-toxiproxy:2.12.0');
    expect(composed).not.toContain('old-');
  });

  it('rewrites every target from an arbitrary previous slug and is idempotent', () => {
    const samples: ReadonlyArray<readonly [string, string, string]> = [
      ['.gitleaks.toml', 'title = "whatever gitleaks config"\n', 'acme-api gitleaks config'],
      ['.codacy.yaml', '# Codacy analysis scope for whatever.\n', 'scope for acme-api.'],
      ['.github/release-please/config.json', '{ "package-name": "whatever" }', '"acme-api"'],
      ['tooling/db-viewer/config.json', '{ "name": "whatever" }', '"acme-api"'],
      [
        'src/tests/load/k6/setup-loadtest.sh',
        'docker exec whatever-postgres pg_isready\n',
        'docker exec acme-api-postgres',
      ],
    ];

    for (const [path, original, expected] of samples) {
      const rules = TEXT_REWRITE_TARGETS.find((target) => target.path === path)?.rules ?? [];
      const once = applyTextRewrites(original, rules, snapshot);
      expect(once, `${path} should be rewritten`).toContain(expected);
      expect(applyTextRewrites(once, rules, snapshot), `${path} should be idempotent`).toBe(once);
    }
  });

  it('renames the MCP server key from any previous slug', () => {
    const once = applyTextRewrites('{ "whatever:api": {} }', mcpTemplateRules(), snapshot);
    expect(once).toContain('"acme-api:api"');
    expect(applyTextRewrites(once, mcpTemplateRules(), snapshot)).toBe(once);
  });

  it('never follows a tracked symlink into an untracked file', () => {
    // `.mcp.json` is a tracked symlink to the gitignored, developer-specific
    // `agent-os/mcp/mcp.json`. A stat() that follows links made this gate read a private config
    // (possibly holding API keys) and fail `pnpm ci:quality` on every machine that had scaffolded
    // one — while passing in CI, where the target is absent and the link dangles. That local-only
    // asymmetry is exactly what a repo-wide gate must not have.
    //
    // Built as a throwaway repo rather than asserted against this one: the fixture slug is
    // `acme-api`, which appears nowhere in this repository, so scanning the real tree would pass
    // no matter what the scanner does. A test that cannot fail is worse than no test.
    //
    // Run under a POISONED git environment — the shape `git` hands every hook it spawns, which is
    // how `pnpm test:unit` sees the world from `.husky/pre-push`. Those variables outrank `cwd`,
    // so an unsanitized `git init`/`git add` here would re-target the decoy (in the hook's case,
    // the developer's own repository, whose index it overwrites), and an unsanitized `git ls-files`
    // inside the scanner would list the decoy's files, none of which resolve under `scratch` —
    // leaving the symlink assertion below passing vacuously, over zero scanned files.
    const restoreGitEnvironment = new Map(
      INHERITED_GIT_REPOSITORY_VARIABLES.map((variable) => [variable, process.env[variable]]),
    );
    try {
      // A real repository with its own tracked file, so a regression re-targets somewhere
      // plausible rather than just making `git` error out.
      const decoy = createTestGitRepository({
        prefix: 'identity-decoy-',
        files: { 'decoy.json': '{ "server": "decoy" }\n' },
      });

      // The exact shape `git` hands a hook running inside a worktree (git 2.54).
      process.env.GIT_DIR = join(decoy, '.git');
      process.env.GIT_INDEX_FILE = join(decoy, '.git', 'index');
      process.env.GIT_WORK_TREE = decoy;
      process.env.GIT_COMMON_DIR = join(decoy, '.git');
      process.env.GIT_OBJECT_DIRECTORY = join(decoy, '.git', 'objects');
      process.env.GIT_PREFIX = '';

      // Built under the poisoned environment: the fixture's git calls must shed it too.
      const scratch = createTestGitRepository({ prefix: 'identity-symlink-' });
      writeFileSync(join(scratch, 'private.json'), '{ "server": "acme-api" }\n');
      writeFileSync(join(scratch, 'tracked.json'), '{ "server": "acme-api" }\n');
      writeFileSync(join(scratch, '.gitignore'), 'private.json\n');
      symlinkSync('private.json', join(scratch, 'link.json'));
      runTestGit({ repositoryRoot: scratch, gitArguments: ['add', '-A'] });

      const { violations } = scanProjectIdentityLiterals({
        snapshot: buildProjectIdentitySnapshot(buildConfig()),
        projectRoot: scratch,
        generatedPaths: [],
      });
      const flagged = violations.map((violation) => violation.file);

      // Sanity: the literal really is reachable through the link, so a passing assertion below
      // means the scanner skipped it — not that the fixture was inert.
      expect(readFileSync(join(scratch, 'link.json'), 'utf-8')).toContain('acme-api');
      // Anti-vacuity: the scan reached THIS repository's tracked files. Without it the symlink
      // assertion holds just as well over an empty scan of somebody else's tree.
      expect(flagged).toContain('tracked.json');
      expect(flagged).not.toContain('link.json');
    } finally {
      for (const [variable, value] of restoreGitEnvironment) {
        if (value === undefined) delete process.env[variable];
        else process.env[variable] = value;
      }
      removeScratchFolders();
    }
  });

  it('never anchors a rewrite pattern on the current project slug', () => {
    // A pattern containing the live slug is self-disabling: after the first
    // rename it stops matching and the rewrite silently no longer applies.
    const live = identityLiterals(buildProjectIdentitySnapshot(buildConfig()));
    for (const target of TEXT_REWRITE_TARGETS) {
      for (const rule of target.rules) {
        for (const literal of live) {
          expect(
            rule.pattern.source,
            `${target.path} pattern must not contain "${literal}"`,
          ).not.toContain(literal);
        }
      }
    }
  });
});
