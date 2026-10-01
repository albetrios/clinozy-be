/**
 * Repo-wide gate: project-identity literals (the slug and the GitHub owner) may
 * appear only in files that legitimately carry them.
 *
 * @remarks
 * Algorithm: walk every git-tracked file, skip the excluded categories, skip the
 * files the identity generator itself writes, then flag any remaining occurrence
 * of the manifest's slug or owner unless an allowlist entry covers it.
 *
 * The generator's own targets are exempt BY CONSTRUCTION — they are passed in
 * rather than restated here, so adding a generated artifact can never leave a
 * stale exemption behind.
 *
 * Failure modes: a new hardcoded literal fails the gate with the file and line.
 * A stale allowlist entry (the literal it covers is gone) ALSO fails, so the
 * allowlist cannot silently rot — the same self-validating shape used by
 * `src/tests/unit/ci/redis-set-ttl.policy.unit.test.ts`.
 *
 * Side effects: none; reads the working tree and returns findings.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { gitEnvironmentWithoutInheritedRepository } from '@tooling/setup/common/git-environment.js';

import type { ProjectIdentitySnapshot } from './project-identity.util.js';
import { identityTokenPattern, slugSpellings } from './text-identity-rewrites.js';

/** A file+reason pair permitting the identity literal to appear verbatim. */
export interface IdentityLiteralAllowance {
  /** Repository-relative path. */
  readonly file: string;
  /** Why the literal is legitimate here — shown when the entry goes stale. */
  readonly reason: string;
}

/** A literal occurrence the gate rejects. */
export interface IdentityLiteralViolation {
  readonly file: string;
  readonly line: number;
  readonly literal: string;
  readonly text: string;
}

/**
 * Path prefixes and suffixes scanned files are drawn from. Prose that names the
 * base project is expected and is not an identity defect, so all Markdown and
 * the agent-tooling mirrors are out of scope.
 */
const EXCLUDED_PREFIXES: readonly string[] = [
  'docs/',
  'agent-os/',
  '.claude/',
  '.cursor/',
  '.codex/',
  '.github/ISSUE_TEMPLATE/',
];

const EXCLUDED_SUFFIXES: readonly string[] = [
  '.md',
  '.mdc',
  '.dbml',
  '.snap',
  '.lock',
  '.png',
  '.jpg',
  '.svg',
  '.ico',
];

const EXCLUDED_FILES: readonly string[] = [
  'CHANGELOG.md',
  'pnpm-lock.yaml',
  'docs/routes.txt',
  'tooling/setup/setup.config.json',
  // Captured by `pnpm routes:examples` from real test-suite responses, which carry the
  // runtime brand (the WebAuthn relying-party name, for one). Regenerated, never hand-typed.
  'tooling/openapi/route-examples/route-examples.json',
];

/**
 * Files that legitimately carry the literal but are not generator outputs.
 *
 * @remarks
 * Intentionally EMPTY. Every non-prose file that names the project is a
 * generator target — either a whole-file output, a reconciled file, or a
 * shape-matched span in `text-identity-rewrites.ts`. An allowlist entry is
 * strictly worse than a rewrite rule: the file keeps the BASE project's name
 * after a fork, so the adopting team ships someone else's brand. Prefer adding
 * a rewrite rule; add an entry here only when a literal genuinely must survive
 * a rename, and say why.
 *
 * Entries are validated: one whose literal no longer appears fails the gate, so
 * a stale exemption cannot rot silently.
 */
export const IDENTITY_LITERAL_ALLOWLIST: readonly IdentityLiteralAllowance[] = [];

/**
 * Whether `text` contains `literal` as a whole word.
 *
 * @remarks
 * A short brand such as `Acme` is also the stem of generated identifiers like
 * `executeAsAcmeBeAppTenant`, which the rename keeps in step. Matching on word boundaries
 * keeps those out of the gate while still catching the brand typed out on its own. The
 * hyphenated slug and the owner behave as before: `-`, `/`, `@` and `.` are boundaries.
 */
function containsWholeWord(text: string, literal: string): boolean {
  const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`).test(text);
}

function isExcluded(repositoryRelativePath: string): boolean {
  if (EXCLUDED_FILES.includes(repositoryRelativePath)) return true;
  if (EXCLUDED_PREFIXES.some((prefix) => repositoryRelativePath.startsWith(prefix))) return true;
  return EXCLUDED_SUFFIXES.some((suffix) => repositoryRelativePath.endsWith(suffix));
}

function listTrackedFiles(projectRoot: string): string[] {
  const stdout = execFileSync('git', ['ls-files', '-z'], {
    cwd: projectRoot,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
    // `projectRoot` is only honored once the inherited GIT_DIR/GIT_INDEX_FILE
    // are gone. Run from a hook (pre-commit, pre-push) they win over `cwd`, and
    // this lists the hook's repository instead — which makes the gate scan a
    // tree it was never pointed at, and pass vacuously when no path lines up.
    env: gitEnvironmentWithoutInheritedRepository(),
  });
  return stdout.split('\0').filter((entry) => entry.length > 0);
}

/**
 * Literals a fork must not hardcode: the project slug, the GitHub owner, and the
 * display name.
 *
 * @remarks
 * The display name is here because the slug alone does not cover the BRAND. A
 * fork that renames the slug still shipped the BASE project's brand as the mail
 * sender fallback and inside the OpenAPI description — neither of those contains
 * the slug, so neither was caught. Prose (`.md`) is exempt via
 * EXCLUDED_SUFFIXES, so this only binds code and config, where the brand must be
 * imported from the generated constants instead of typed out.
 */
export function identityLiterals(snapshot: ProjectIdentitySnapshot): string[] {
  return [
    snapshot.slug,
    snapshot.repository.owner,
    snapshot.displayName,
    snapshot.brandName,
  ].filter((literal, index, all) => literal.length > 0 && all.indexOf(literal) === index);
}

/**
 * Paths allowed to keep a PREVIOUS name: records of what happened under it, and the manifest
 * that lists it.
 */
const PREVIOUS_IDENTITY_EXEMPT_PREFIXES: readonly string[] = [
  'CHANGELOG.md',
  'docs/reviews/',
  'tooling/setup/setup.config.json',
];

const BINARY_SUFFIXES: readonly string[] = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.webp',
  '.pdf',
];

/** One previous-identity form found in the tree. */
export interface PreviousIdentityLeftover {
  readonly file: string;
  readonly line: number;
  /** The previous name or owner the match belongs to. */
  readonly previous: string;
  readonly text: string;
}

/**
 * Patterns that find a previous identity in every form a rename must reach.
 *
 * @remarks
 * - A previous slug in every spelling a rename rewrites (`slugSpellings`: `acme-be`, `ACME-BE`,
 *   `acme_be`, `ACME_BE`, `AcmeBe`, `acmeBe`, `acmebe`), as a whole identity token
 *   (`identityTokenPattern`): found inside `grantAcmeBeAppRole`, never inside an ordinary word
 *   such as `acmeFeatures` or `AcmeBehavior`.
 * - A previous BACKEND slug's database name (`acme-be` → `acme`) only where it IS the database:
 *   `POSTGRES_USER/PASSWORD/DB`, `-U`/`-d` flags, a connection string's database segment and
 *   `CREATE DATABASE`. The bare word is left alone, so a folder or English word spelled the same is never flagged.
 * - A previous owner, case-sensitive, as a whole token.
 *
 * A previous value the CURRENT identity still contains is skipped, or the gate could never pass.
 */
export function previousIdentityPatterns(
  snapshot: ProjectIdentitySnapshot,
): Array<{ readonly previous: string; readonly pattern: RegExp }> {
  const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const current = [snapshot.slug, snapshot.frontendSlug].join(' ').toLowerCase();
  const patterns: Array<{ previous: string; pattern: RegExp }> = [];

  for (const name of snapshot.previousNames) {
    if (current.includes(name.toLowerCase())) continue;
    for (const spelling of slugSpellings(name)) {
      patterns.push({ previous: name, pattern: identityTokenPattern(spelling) });
    }

    if (!name.endsWith('-be')) continue;
    const database = name.slice(0, -'-be'.length);
    if (database === snapshot.derived.databaseName) continue;
    const word = `${escapeRegExp(database)}(?![A-Za-z0-9])`;
    patterns.push({
      previous: name,
      pattern: new RegExp(
        [
          `POSTGRES_(?:USER|PASSWORD|DB)\\s*[:=]\\s*['"]?${word}`,
          `\\s-[Ud]\\s+${word}`,
          `postgresql://[^\\s'"\`]*@[^/\\s]+/${word}`,
          `CREATE DATABASE\\s+${word}`,
        ].join('|'),
      ),
    });
  }

  for (const owner of snapshot.previousOwners) {
    if (owner === snapshot.repository.owner) continue;
    patterns.push({ previous: owner, pattern: identityTokenPattern(owner) });
  }
  return patterns;
}

/**
 * Scan the tree for any previous slug, database name or owner left behind by a rename.
 *
 * @remarks
 * The hardcoded-literal scan guards the CURRENT identity; nothing guarded the PREVIOUS one, so a
 * form the rename did not know about (an UPPERCASE hyphenated banner, an owner the rename never
 * reached) survived silently. Unlike that scan this one covers prose too: a stale owner in a
 * setup guide is a real defect. Historical records are exempt
 * (PREVIOUS_IDENTITY_EXEMPT_PREFIXES).
 */
export function scanPreviousIdentityLeftovers(options: {
  readonly snapshot: ProjectIdentitySnapshot;
  readonly projectRoot: string;
}): PreviousIdentityLeftover[] {
  const patterns = previousIdentityPatterns(options.snapshot);
  if (patterns.length === 0) return [];
  const leftovers: PreviousIdentityLeftover[] = [];
  for (const file of listTrackedFiles(options.projectRoot)) {
    if (PREVIOUS_IDENTITY_EXEMPT_PREFIXES.some((prefix) => file.startsWith(prefix))) continue;
    if (BINARY_SUFFIXES.some((suffix) => file.toLowerCase().endsWith(suffix))) continue;
    const absolute = resolve(options.projectRoot, file);
    if (!(existsSync(absolute) && lstatSync(absolute).isFile())) continue;
    const contents = readFileSync(absolute, 'utf-8');
    if (!patterns.some(({ pattern }) => pattern.test(contents))) continue;
    for (const [index, text] of contents.split('\n').entries()) {
      const hit = patterns.find(({ pattern }) => pattern.test(text));
      if (hit) {
        leftovers.push({ file, line: index + 1, previous: hit.previous, text: text.trim() });
      }
    }
  }
  return leftovers;
}

export interface IdentityLiteralScanResult {
  readonly violations: IdentityLiteralViolation[];
  /** Allowlist entries whose file no longer contains any identity literal. */
  readonly staleAllowances: IdentityLiteralAllowance[];
}

/**
 * Scan the working tree for hardcoded identity literals.
 *
 * @param options.generatedPaths - Absolute paths the identity generator writes;
 *   exempt by construction so the exemption cannot drift from the generator.
 */
export function scanProjectIdentityLiterals(options: {
  readonly snapshot: ProjectIdentitySnapshot;
  readonly projectRoot: string;
  readonly generatedPaths: readonly string[];
}): IdentityLiteralScanResult {
  const { snapshot, projectRoot } = options;
  const literals = identityLiterals(snapshot);
  const generated = new Set(
    options.generatedPaths.map((path) => relative(projectRoot, path).replaceAll('\\', '/')),
  );
  const allowedFiles = new Map(
    IDENTITY_LITERAL_ALLOWLIST.map((allowance) => [allowance.file, allowance]),
  );
  const allowancesSeen = new Set<string>();

  const violations: IdentityLiteralViolation[] = [];
  for (const file of listTrackedFiles(projectRoot)) {
    if (isExcluded(file) || generated.has(file)) continue;
    const absolute = resolve(projectRoot, file);
    // lstat, NOT stat: a tracked symlink's git content is its target PATH, so scanning it says
    // nothing about identity, while stat() follows the link and reads whatever sits at the other
    // end. `.mcp.json` is exactly that — a tracked symlink to the gitignored, developer-specific
    // `agent-os/mcp/mcp.json`. Following it made this gate read a private config that may hold API
    // keys, and fail `pnpm ci:quality` on every machine that has scaffolded one, while passing in
    // CI where the target is absent and the link dangles. A tracked target is scanned via its own
    // entry; an untracked one is out of scope by definition.
    if (!existsSync(absolute)) continue;
    if (!lstatSync(absolute).isFile()) continue;

    const contents = readFileSync(absolute, 'utf-8');
    const matched = literals.filter((literal) => containsWholeWord(contents, literal));
    if (matched.length === 0) continue;

    if (allowedFiles.has(file)) {
      allowancesSeen.add(file);
      continue;
    }
    for (const [index, text] of contents.split('\n').entries()) {
      for (const literal of matched) {
        if (containsWholeWord(text, literal)) {
          violations.push({ file, line: index + 1, literal, text: text.trim() });
        }
      }
    }
  }

  const staleAllowances = IDENTITY_LITERAL_ALLOWLIST.filter(
    (allowance) => !allowancesSeen.has(allowance.file),
  );
  return { violations, staleAllowances };
}
