/**
 * Shape-based identity rewrites for files that name the project in free text.
 *
 * @remarks
 * These files carry the project name in a comment, a title, a config key or a
 * shell command, so there is nothing to import and no whole-file template worth
 * owning — only a handful of spans to keep current.
 *
 * Every pattern matches the SHAPE of its span (`title = "<something> gitleaks
 * config"`), never the current slug. Anchoring on the slug is self-disabling:
 * the first rename makes the pattern unmatchable and the rewrite silently stops
 * applying, which is precisely the bug this table exists to prevent. A
 * consequence worth stating: every rule is idempotent, so running the generator
 * twice is a no-op, and running it on an already-renamed fork still works.
 */
import type { ProjectIdentitySnapshot } from './project-identity.util.js';

/** One span to keep current within a text file. */
export interface TextRewriteRule {
  /** Shape-matching pattern. MUST NOT reference the current project slug. */
  readonly pattern: RegExp;
  /** Replacement, resolved against the snapshot. `$1`/`$2` back-references apply. */
  readonly replace: (snapshot: ProjectIdentitySnapshot) => string;
}

/** A file whose identity-bearing spans the generator keeps current. */
export interface TextRewriteTarget {
  /** Repository-relative path. */
  readonly path: string;
  /** Why this file names the project, for the generated-artifact listing. */
  readonly reason: string;
  readonly rules: readonly TextRewriteRule[];
}

/**
 * Files that name the project outside the generated surface.
 *
 * @remarks
 * Two entries fix genuine breakage rather than cosmetics: `release-please`'s
 * `package-name` must equal `package.json`'s `name` or release automation stops
 * matching, and the Sonar scanner's `-Dsonar.projectKey` must equal
 * `sonar-project.properties` or the local quality gate scans a different project
 * than the one configured.
 */
export const TEXT_REWRITE_TARGETS: readonly TextRewriteTarget[] = [
  {
    path: '.codacy.yaml',
    reason: 'Comment naming the project.',
    rules: [
      {
        pattern: /^# Codacy analysis scope for \S+\.$/m,
        replace: (snapshot) => `# Codacy analysis scope for ${snapshot.slug}.`,
      },
    ],
  },
  {
    path: '.gitleaks.toml',
    reason: 'Config title naming the project.',
    rules: [
      {
        pattern: /^title = "\S+ gitleaks config"$/m,
        replace: (snapshot) => `title = "${snapshot.slug} gitleaks config"`,
      },
    ],
  },
  {
    path: '.github/codeql/codeql-config.yml',
    reason: 'CodeQL config display name.',
    rules: [
      {
        pattern: /^# CodeQL analysis configuration for \S+\.$/m,
        replace: (snapshot) => `# CodeQL analysis configuration for ${snapshot.slug}.`,
      },
      {
        pattern: /^name: \S+ CodeQL config$/m,
        replace: (snapshot) => `name: ${snapshot.slug} CodeQL config`,
      },
    ],
  },
  {
    path: '.github/release-please/config.json',
    reason: 'release-please package-name, which must equal package.json name.',
    rules: [
      {
        pattern: /("package-name":\s*)"[^"]*"/,
        replace: (snapshot) => `$1"${snapshot.packageName}"`,
      },
    ],
  },
  {
    path: 'tooling/db-viewer/config.json',
    reason: 'DB Viewer display name for the local ER board.',
    rules: [
      {
        pattern: /("name":\s*)"[^"]*"/,
        replace: (snapshot) => `$1"${snapshot.slug}"`,
      },
    ],
  },
  {
    path: '.env.example',
    reason: 'Header comment, OTEL service-name default, and the Scalar slug default.',
    rules: [
      {
        pattern: /^# \S+ environment variables$/m,
        replace: (snapshot) => `# ${snapshot.slug} environment variables`,
      },
      {
        pattern: /^# Default: \S+-api \/ \S+-worker$/m,
        replace: (snapshot) =>
          `# Default: ${snapshot.artifacts.apiImage} / ${snapshot.artifacts.workerImage}`,
      },
      {
        pattern: /^OTEL_SERVICE_NAME=\S+$/m,
        replace: (snapshot) => `OTEL_SERVICE_NAME=${snapshot.artifacts.apiImage}`,
      },
      {
        pattern: /(the upload script defaults to `)[^`]*(`)/,
        replace: (snapshot) => `$1${snapshot.derived.scalarSlug}$2`,
      },
      {
        pattern: /(Default `)[a-z0-9_-]+(:<NODE_ENV>:`)/,
        replace: (snapshot) => `$1${snapshot.derived.redisKeyPrefix}$2`,
      },
      {
        // The name end users see. Generated from the manifest's brand so a rebrand
        // carries it; a typed value would match neither the slug nor the display name,
        // so no later rename would ever find it.
        pattern: /^(EMAIL_FROM_NAME|WEBAUTHN_RP_NAME)=.*$/gm,
        replace: (snapshot) => `$1=${snapshot.brandName}`,
      },
      {
        // The example VALUE beside the comment above (commented out: the prefix is derived from
        // the identity stem and NODE_ENV by default). Without this rule the template shipped the
        // base project's stem while its own comment named the new one.
        pattern: /^(# )?REDIS_KEY_PREFIX=[a-z0-9_-]+(:[a-z0-9_-]+:)$/m,
        replace: (snapshot) => `$1REDIS_KEY_PREFIX=${snapshot.derived.redisKeyPrefix}$2`,
      },
      ...localDatabaseRules(),
    ],
  },
  {
    path: 'docker-compose.yml',
    reason: 'Toxiproxy image tag and the local Postgres credentials.',
    rules: [
      {
        pattern: /^(\s*image:\s*)\S+-toxiproxy:/m,
        replace: (snapshot) => `$1${snapshot.derived.containers.toxiproxy}:`,
      },
      ...localDatabaseRules(),
    ],
  },
  {
    path: 'docker-compose.sonar.yml',
    reason: 'Scanner project key, which must equal sonar-project.properties.',
    rules: [
      {
        pattern: /-Dsonar\.projectKey=\S+/,
        replace: (snapshot) => `-Dsonar.projectKey=${snapshot.derived.sonarProjectKey}`,
      },
      {
        pattern: /-Dsonar\.projectName="[^"]*"/,
        replace: (snapshot) => `-Dsonar.projectName="${snapshot.derived.sonarProjectKey}"`,
      },
    ],
  },
  {
    path: 'tooling/ci/restore-drill-neon.sh',
    reason: 'Last-resort Neon project-name fallback when PROJECT_SLUG is unset.',
    rules: [
      {
        pattern: /(\$\{PROJECT_SLUG:-)[^}]*(\})/,
        replace: (snapshot) => `$1${snapshot.slug}$2`,
      },
    ],
  },
  {
    path: 'src/tests/load/k6/setup-loadtest.sh',
    reason: 'docker exec/restart container names and psql database arguments.',
    rules: [...containerCommandRules(), ...localDatabaseRules()],
  },
  {
    path: 'src/tests/load/k6/check-prereqs.mjs',
    reason: 'Operator guidance strings naming the Compose containers.',
    rules: containerCommandRules(),
  },
  {
    path: 'src/tests/chaos/bootstrap-env.ts',
    reason:
      'Chaos DB/Redis URLs, forced with `=` so traffic cannot bypass Toxiproxy. This module must resolve before Vitest wires `@/` aliases, so it cannot import the generated constants.',
    rules: [
      ...localDatabaseRules(),
      {
        pattern: /(REDIS_KEY_PREFIX = ')[a-z0-9_-]+(:test:')/,
        replace: (snapshot) => `$1${snapshot.derived.redisKeyPrefix}$2`,
      },
    ],
  },
  {
    path: 'migrations/00000000000000_init.sql',
    reason: 'Postgres roles the app and migrations connect as.',
    rules: sqlIdentityRules(),
  },
  {
    path: '.github/workflows/pr-migration-verify.yml',
    reason: 'Dry-run database name and the local Postgres connection string.',
    rules: [...sqlIdentityRules(), ...localDatabaseRules()],
  },
];

/**
 * MCP template files, which must stay byte-identical to one another.
 *
 * @remarks
 * The `mcp-config` global test pins them as exact mirrors, so they are rewritten
 * with one shared rule set rather than three drifting entries.
 */
export const MCP_TEMPLATE_PATHS: readonly string[] = [
  '.mcp.example.json',
  '.cursor/mcp.example.json',
  'agent-os/mcp/mcp.example.json',
];

/** Rewrite the `"<slug>:api"` MCP server key that names this project's API. */
export function mcpTemplateRules(): readonly TextRewriteRule[] {
  return [
    {
      pattern: /"[a-z0-9][a-z0-9-]*:api":/g,
      replace: (snapshot) => `"${snapshot.slug}:api":`,
    },
  ];
}

/**
 * Postgres identifiers built from the slug: the two roles, the local database,
 * its user and password, and the CI dry-run database.
 *
 * @remarks
 * The roles live in the baseline migration, so a fork's FIRST migration run
 * creates them under the fork's own name — there is no rename of a live database.
 * For this repository the derived values equal the committed ones, so the
 * generator produces no diff here.
 *
 * Matched by SHAPE (`<anything>_app`, `postgresql://x:y@host/db`) rather than by
 * the current stem, so the rules survive a rename and stay idempotent.
 */
export function sqlIdentityRules(): readonly TextRewriteRule[] {
  return [
    {
      pattern: /\b[a-z][a-z0-9]*_be_app\b/g,
      replace: (snapshot) => snapshot.derived.databaseAppRole,
    },
    {
      pattern: /\b[a-z][a-z0-9]*_be_runtime\b/g,
      replace: (snapshot) => snapshot.derived.databaseRuntimeRole,
    },
    {
      pattern: /\b[a-z][a-z0-9]*_dryrun\b/g,
      replace: (snapshot) => snapshot.derived.dryRunDatabaseName,
    },
  ];
}

/** Local Postgres credentials in Compose and the env template. */
export function localDatabaseRules(): readonly TextRewriteRule[] {
  return [
    {
      pattern: /(POSTGRES_(?:USER|PASSWORD|DB):\s*)\S+/g,
      replace: (snapshot) => `$1${snapshot.derived.databaseName}`,
    },
    {
      // postgresql://<stem>:<stem>@host:port/<stem> — the project's OWN local URL,
      // recognised by user, password and database being the SAME word (the `\1`
      // backreferences). A URL whose parts differ is someone else's: a placeholder
      // (`user:password@host/db`), a role with its own password
      // (`<stem>_be_operator:canary@…`), or an unrelated example. Rewriting those
      // turned documentation placeholders into what reads as a real credential
      // (a SonarQube BLOCKER) and collapsed restricted-role CI URLs onto the
      // superuser, which bypasses RLS.
      // The trailing `(_[a-z0-9_]+)?` PRESERVES a database suffix such as
      // `_dryrun`; without it this rule silently rewrote the CI dry-run database
      // back to the primary one, destroying the isolation the workflow relies on.
      pattern: /postgresql:\/\/([a-z0-9]+):\1@([^:/\s]+):(\d+)\/\1(_[a-z0-9_]+)?/g,
      replace: (snapshot) => {
        const name = snapshot.derived.databaseName;
        return `postgresql://${name}:${name}@$2:$3/${name}$4`;
      },
    },
    {
      pattern: /(pg_isready -U )[a-zA-Z0-9_]+( -d )[a-zA-Z0-9_]+/g,
      replace: (snapshot) => `$1${snapshot.derived.databaseName}$2${snapshot.derived.databaseName}`,
    },
  ];
}

/**
 * Rename the local database from `previousDatabaseName` to `nextDatabaseName`, touching only
 * the parts of a connection string or Postgres setting that ARE that name.
 *
 * @remarks
 * `init-project` runs this over every tracked file, so it must be exact rather than
 * shape-matched: it knows the previous name, and a shape-matched rule over the whole tree
 * cannot tell the project's database from anyone else's.
 *
 * - `postgresql://user:password@host:port/database` — each of user, password and database
 *   is renamed only when it equals `previousDatabaseName`. `<stem>:<stem>@…/<stem>` becomes
 *   the new stem; `<role>:<secret>@…/<stem>` keeps its role and secret and gets the new
 *   database; `user:password@host/db` is left exactly as written.
 * - `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` set to the previous name, so a CI
 *   service container keeps matching the URLs beside it.
 * - `-U` / `-d` flags (`pg_isready`, `psql`) and `CREATE DATABASE`, with any `_suffix`
 *   such as `_dryrun` preserved.
 */
export function rewritePreviousDatabaseName(
  contents: string,
  options: { readonly previousDatabaseName: string; readonly nextDatabaseName: string },
): string {
  const { previousDatabaseName: previous, nextDatabaseName: next } = options;
  if (!(previous && next) || previous === next) {
    return contents;
  }
  const renamePart = (part: string): string => (part === previous ? next : part);
  const escaped = previous.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return contents
    .replace(
      /postgresql:\/\/([^:@/\s]+):([^@/\s]+)@([^:/\s]+):(\d+)\/([a-z0-9]+)(_[a-z0-9_]+)?/g,
      (
        _match,
        user: string,
        password: string,
        host: string,
        port: string,
        database: string,
        suffix = '',
      ) =>
        `postgresql://${renamePart(user)}:${renamePart(password)}@${host}:${port}/${renamePart(database)}${suffix}`,
    )
    .replace(
      new RegExp(`(POSTGRES_(?:USER|PASSWORD|DB)\\s*[:=]\\s*['"]?)${escaped}\\b`, 'g'),
      `$1${next}`,
    )
    .replace(new RegExp(`(\\s-[Ud]\\s+)${escaped}\\b`, 'g'), `$1${next}`)
    .replace(new RegExp(`(CREATE DATABASE\\s+)${escaped}(?=\\b|_)`, 'g'), `$1${next}`);
}

function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Matches `<stem>:` where it IS a Redis key prefix: directly followed by a template placeholder,
 * an environment name or a quote (`` `acme:${NODE_ENV}:` ``, `acme:dev:`, `'acme:'`). Only the
 * `<stem>:` itself is consumed.
 *
 * @remarks
 * - **Algorithm:** the stem must start a token (not after a letter, digit, `_`, `/`, `@`, `.` or
 *   `-`), so `acme: true`, `src/acme/…` and `@scope/acme:dev` never match.
 * - **Failure modes:** none — pure regex builder.
 * - **Side effects:** none.
 * - **Notes:** the one definition the leftover check (detects a previous stem) and the rename
 *   pass ({@link rewritePreviousRedisKeyPrefix}) share, so whatever the check flags, the rename
 *   rewrites.
 */
export function redisKeyPrefixStemPattern(stem: string, flags = ''): RegExp {
  return new RegExp(
    `(?<![A-Za-z0-9_/@.-])${escapeRegExpLiteral(stem)}:(?=\\$\\{|(?:local|development|production|dev|prod|test|staging)(?![A-Za-z0-9])|['"\`])`,
    flags,
  );
}

/**
 * Matches a slug written as a display wordmark: its halves around the last `-` joined by a
 * typographic separator, markup around the separator allowed (`acme·be`, `ACME • BE`,
 * `acme&middot;be`, `acme<span class="…">·</span>be`); case-insensitive. Null for a slug without
 * a `-`.
 *
 * @remarks
 * - **Algorithm:** captures the head, everything between head and tail (separator plus markup),
 *   and the tail. Plain spaces and dots are not separators — "let the legacy be" is English — and
 *   the tail must end the word (`acme·bean` does not match).
 * - **Failure modes:** none — pure regex builder.
 * - **Side effects:** none.
 * - **Notes:** shared by the leftover check and the rename pass ({@link rewritePreviousWordmark}).
 */
export function wordmarkPattern(slug: string, flags = ''): RegExp | null {
  const separatorIndex = slug.lastIndexOf('-');
  if (separatorIndex <= 0) return null;
  const head = escapeRegExpLiteral(slug.slice(0, separatorIndex));
  const tail = escapeRegExpLiteral(slug.slice(separatorIndex + 1));
  const markup = '(?:<[^>]*>)?';
  return new RegExp(
    `(?<![A-Za-z0-9])(${head})(\\s*${markup}\\s*(?:·|•|∙|&middot;|&#183;)\\s*${markup}\\s*)(${tail})(?![A-Za-z0-9])`,
    `i${flags}`,
  );
}

/** Spells `next` in the casing of `matched`: all capitals, a leading capital, or as given. */
function inCasingOf(matched: string, next: string): string {
  if (matched === matched.toUpperCase() && matched !== matched.toLowerCase()) {
    return next.toUpperCase();
  }
  if (matched.charAt(0) !== matched.charAt(0).toLowerCase()) {
    return next.charAt(0).toUpperCase() + next.slice(1);
  }
  return next;
}

/**
 * Renames a previous stem where it is a Redis key prefix (`acme:dev:` → `globex:dev:`).
 *
 * @remarks
 * - **Algorithm:** replaces each {@link redisKeyPrefixStemPattern} match of the previous stem;
 *   the environment part and every other `acme` are left as they are.
 * - **Failure modes:** none — a no-op when either stem is empty or they are equal.
 * - **Side effects:** none — returns the rewritten text.
 * - **Notes:** run by the `pnpm init:project` prose pass. No slug spelling covers a bare stem,
 *   so before this a rename left `resolveRedisKeyPrefix()` and every example key on the old name.
 */
export function rewritePreviousRedisKeyPrefix(
  contents: string,
  options: { readonly previousStem: string; readonly nextStem: string },
): string {
  const { previousStem, nextStem } = options;
  if (!(previousStem && nextStem) || previousStem === nextStem) return contents;
  return contents.replace(redisKeyPrefixStemPattern(previousStem, 'g'), () => `${nextStem}:`);
}

/**
 * Renames a previous slug's display wordmark (`acme·be` → `globex·be`), keeping its separator,
 * markup and casing.
 *
 * @remarks
 * - **Algorithm:** replaces head and tail of each {@link wordmarkPattern} match with the next
 *   slug's halves, each spelled in the casing it replaces (`ACME • BE` → `GLOBEX • BE`).
 * - **Failure modes:** none — a no-op when either slug is empty, they are equal, or either has
 *   no `-`.
 * - **Side effects:** none — returns the rewritten text.
 * - **Notes:** run by the `pnpm init:project` prose pass. No slug spelling covers the separator,
 *   so before this a rename left the dashboards hub titled with the old name.
 */
export function rewritePreviousWordmark(
  contents: string,
  options: { readonly previousSlug: string; readonly nextSlug: string },
): string {
  const { previousSlug, nextSlug } = options;
  if (!(previousSlug && nextSlug) || previousSlug === nextSlug) return contents;
  const pattern = wordmarkPattern(previousSlug, 'g');
  const nextSeparatorIndex = nextSlug.lastIndexOf('-');
  if (!pattern || nextSeparatorIndex <= 0) return contents;
  const nextHead = nextSlug.slice(0, nextSeparatorIndex);
  const nextTail = nextSlug.slice(nextSeparatorIndex + 1);
  return contents.replace(
    pattern,
    (_match, head: string, separator: string, tail: string) =>
      `${inCasingOf(head, nextHead)}${separator}${inCasingOf(tail, nextTail)}`,
  );
}

/**
 * Every spelling a slug takes across code, config and prose.
 *
 * @remarks
 * `acme-be` → `ACME-BE`, `ACME_BE`, `AcmeBe`, `acmeBe`, `acmebe`, `acme_be`, `acme-be`, and the
 * sentence-case `Acme-be`, `Acme_be`, `Acmebe`. Most specific first, so a caller replacing in
 * order never rewrites half of a longer form.
 */
export function slugSpellings(slug: string): string[] {
  const segments = slug.split('-');
  const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);
  const pascal = segments.map(capitalize).join('');
  const snake = segments.join('_');
  const joined = segments.join('');
  return [
    ...new Set([
      slug.toUpperCase(),
      snake.toUpperCase(),
      pascal,
      pascal.charAt(0).toLowerCase() + pascal.slice(1),
      joined,
      snake,
      slug,
      capitalize(slug),
      capitalize(snake),
      capitalize(joined),
    ]),
  ];
}

/**
 * Match `spelling` only as a whole identity token — never inside a longer, ordinary word.
 *
 * @remarks
 * A spelling may not continue into a letter of the same case: `AcmeBe` matches in
 * `grantAcmeBeAppRole` (the capital `A` starts a new word) but not in `AcmeBehavior`, and
 * `acme_fe` does not match in `acme_features`. On the left, a lowercase-initial spelling needs a
 * non-letter before it (`xacme-be` is not `acme-be`), while a capital-initial one may follow a
 * lowercase letter, which is how a camelCase hump begins.
 *
 * Plain substring matching once made the rename and the previous-identity gate both able to
 * reach a genuine word that merely starts like the old slug.
 */
export function identityTokenPattern(spelling: string, flags = ''): RegExp {
  const isUpper = (character: string): boolean =>
    character !== character.toLowerCase() && character === character.toUpperCase();
  const escaped = spelling.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const before = isUpper(spelling.charAt(0)) ? '(?<![A-Z0-9])' : '(?<![A-Za-z0-9])';
  const after = isUpper(spelling.charAt(spelling.length - 1)) ? '(?![A-Z0-9])' : '(?![a-z0-9])';
  return new RegExp(`${before}${escaped}${after}`, flags);
}

/** Replace every whole-token occurrence of `from` with `to` (see {@link identityTokenPattern}). */
export function replaceIdentityToken(contents: string, from: string, to: string): string {
  return contents.replace(identityTokenPattern(from, 'g'), () => to);
}

/** `docker exec|restart <slug>-postgres|redis` spans in load-test scripts. */
function containerCommandRules(): readonly TextRewriteRule[] {
  return [
    {
      pattern: /\b(docker (?:exec|restart) )\S+-postgres\b/g,
      replace: (snapshot) => `$1${snapshot.derived.containers.postgres}`,
    },
    {
      pattern: /\b(docker (?:exec|restart) )\S+-redis\b/g,
      replace: (snapshot) => `$1${snapshot.derived.containers.redis}`,
    },
  ];
}

/** Apply a target's rules to file contents. Idempotent by construction. */
export function applyTextRewrites(
  contents: string,
  rules: readonly TextRewriteRule[],
  snapshot: ProjectIdentitySnapshot,
): string {
  let updated = contents;
  for (const rule of rules) {
    updated = updated.replace(rule.pattern, rule.replace(snapshot));
  }
  return updated;
}
