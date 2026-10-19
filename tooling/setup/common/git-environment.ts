/**
 * The one way tooling runs git: {@link git}, {@link tryGit} and {@link resolveBase}, each in an
 * environment detached from the repository its parent was pinned to.
 *
 * @remarks
 * Git exports {@link INHERITED_GIT_REPOSITORY_VARIABLES} into every hook it
 * runs, and a hook's whole process tree inherits them. They take precedence
 * over `cwd`, so an invocation that looks directory-scoped —
 * `execFileSync('git', […], { cwd })` — silently operates on the hook's
 * repository instead. Two ways that bites:
 *
 * - A throwaway repository built under `os.tmpdir()` never gets one: `git init`
 *   re-initializes the inherited gitdir and `git add` overwrites the real index,
 *   leaving the host repository with the fixture's files staged and everything
 *   else staged as a deletion.
 * - A read scoped to a `projectRoot` argument answers for the inherited
 *   repository instead, so a directory-scoped gate reports on a tree it was
 *   never pointed at — and passes vacuously when no path lines up.
 *
 * Do NOT use this in code that is *meant* to act on the hook's repository: the
 * pre-commit steps that read the staged index — `src/scripts/tooling/run-pre-commit-guard.ts`,
 * `src/scripts/validators/migration/lint-rls-policies.ts` and
 * `src/scripts/validators/routes/validate-route-access-diff.ts` — read the commit's own index
 * (a temporary one for `git commit <paths>`) on purpose, and stripping these there would read
 * the wrong one. They are the documented exception, commented in place.
 *
 * Command line, for the shell hooks: `tsx tooling/setup/common/git-environment.ts base` prints
 * {@link resolveBase}'s answer, `… trunk` the trunk branch.
 */
import { spawnSync } from 'node:child_process';
import { resolveGitMetadata } from '@tooling/setup/codegen/project-identity.util.js';
import { loadConfig } from './config.js';
import { isMain, parseCommandLine } from './script.js';

/** The variables git exports into hooks that pin a child `git` process to a repository. */
export const INHERITED_GIT_REPOSITORY_VARIABLES: readonly string[] = [
  'GIT_DIR',
  'GIT_INDEX_FILE',
  'GIT_WORK_TREE',
  'GIT_PREFIX',
  'GIT_OBJECT_DIRECTORY',
  'GIT_COMMON_DIR',
  'GIT_NAMESPACE',
];

/**
 * Build an environment for a `git` child process that honors `cwd` instead of
 * an inherited repository.
 *
 * @remarks
 * Algorithm: copy `process.env`, delete every name in
 * {@link INHERITED_GIT_REPOSITORY_VARIABLES}, return the copy. Removing them
 * rather than overriding them restores git's normal discovery — the repository
 * is found from `cwd`, which is what every call site already means. The rest of
 * the environment passes through untouched, so PATH, credential helpers and
 * proxy settings keep working.
 *
 * Failure modes: none — a variable that is already absent is simply not present.
 *
 * Side effects: none; `process.env` is not mutated.
 *
 * @example
 * ```ts
 * execFileSync('git', ['ls-files', '-z'], {
 *   cwd: projectRoot,
 *   env: gitEnvironmentWithoutInheritedRepository(),
 * });
 * ```
 */
export function gitEnvironmentWithoutInheritedRepository(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env };
  for (const variable of INHERITED_GIT_REPOSITORY_VARIABLES) {
    delete environment[variable];
  }
  return environment;
}

/** One git invocation: the arguments after `git`, and where and with what input it runs. */
export interface GitCommand {
  /** The arguments after `git`. */
  readonly args: readonly string[];
  /** The directory git runs in — the current one when omitted. */
  readonly cwd?: string | undefined;
  /** Text written to git's standard input (`check-ignore --stdin`). */
  readonly input?: string | undefined;
  /** Kill git after this many milliseconds — for a network call (`ls-remote`). */
  readonly timeoutMilliseconds?: number | undefined;
}

/** How a {@link tryGit} call went: `ok` when git exited 0, and its output. */
export interface GitResult {
  readonly ok: boolean;
  /** Standard output without its trailing newline. */
  readonly output: string;
}

/** Room for `ls-files -z` and a whole-branch `diff --unified=0` on a large repository. */
const GIT_OUTPUT_LIMIT_BYTES = 64 * 1024 * 1024;

function runGit(command: GitCommand) {
  return spawnSync('git', [...command.args], {
    cwd: command.cwd,
    input: command.input,
    timeout: command.timeoutMilliseconds,
    encoding: 'utf8',
    maxBuffer: GIT_OUTPUT_LIMIT_BYTES,
    env: gitEnvironmentWithoutInheritedRepository(),
  });
}

/**
 * Run `git <args>` and return its standard output, throwing when git fails.
 *
 * @remarks
 * Always runs with {@link gitEnvironmentWithoutInheritedRepository}, so `cwd` decides the
 * repository even inside a git hook. The output loses its trailing newline only — leading
 * whitespace stays, so the `status --porcelain` columns survive.
 *
 * Failure modes: throws `git <args>: <stderr>` on a non-zero exit or a failed spawn.
 *
 * @example
 * ```ts
 * const head = git({ args: ['rev-parse', 'HEAD'] });
 * ```
 */
export function git(command: GitCommand): string {
  const result = runGit(command);
  if (result.status !== 0) {
    const detail =
      (result.stderr ?? '').trim() ||
      result.error?.message ||
      `exited ${result.status ?? 'without a code'}`;
    throw new Error(`git ${command.args.join(' ')}: ${detail}`);
  }
  return (result.stdout ?? '').trimEnd();
}

/**
 * Run `git <args>` and report how it went instead of throwing.
 *
 * @remarks
 * For a command whose failure is an answer (`merge-base` with an unfetched ref, `@{u}` on a
 * branch without one, `show` of a path a revision lacks) or whose non-zero exit carries output
 * (`diff --no-index` exits 1 when the files differ). Same environment and output rule as
 * {@link git}.
 *
 * Failure modes: never throws.
 */
export function tryGit(command: GitCommand): GitResult {
  const result = runGit(command);
  return { ok: result.status === 0, output: (result.stdout ?? '').trimEnd() };
}

/**
 * The trunk branch — `git.defaultBranch` in `tooling/setup/setup.config.json`.
 *
 * @remarks
 * Read from the setup manifest every call, never hardcoded, so a renamed trunk needs no code
 * change. Failure modes: throws when the manifest is missing or invalid.
 */
export function trunkBranch(): string {
  return resolveGitMetadata(loadConfig()).defaultBranch;
}

/**
 * The ref a change is measured from: `base` when given, else the branch's upstream (`@{u}`),
 * else `origin/<trunk>`.
 *
 * @remarks
 * The one answer for every diff-scoped gate (pre-push tests, push Semgrep, the affected-tests
 * list, the test selector, patch coverage, the iteration freeze check). Without an upstream — a
 * branch's first push — the trunk stands in, so a gate never diffs against nothing and skips.
 * CI always passes `base` (the pull request's base).
 *
 * Failure modes: throws only when no `base` is given, there is no upstream and the manifest
 * cannot be read ({@link trunkBranch}).
 */
export function resolveBase(
  options: { readonly base?: string | undefined; readonly cwd?: string | undefined } = {},
): string {
  if (options.base) return options.base;
  const upstream = tryGit({
    args: ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
    cwd: options.cwd,
  });
  if (upstream.ok && upstream.output !== '') return upstream.output;
  return `origin/${trunkBranch()}`;
}

/** The command-line answers for the shell hooks, by name. */
const COMMAND_LINE_ANSWERS = new Map<string, () => string>([
  ['base', () => resolveBase()],
  ['trunk', trunkBranch],
]);

if (isMain(import.meta.url)) {
  const usage = 'Usage: tsx tooling/setup/common/git-environment.ts <base|trunk>';
  const [question] = parseCommandLine({
    args: process.argv.slice(2),
    maxPositionals: 1,
    usage,
  }).positionals;
  const answer = COMMAND_LINE_ANSWERS.get(question ?? '');
  if (answer === undefined) {
    console.error(usage);
    process.exitCode = 2;
  } else process.stdout.write(answer());
}
