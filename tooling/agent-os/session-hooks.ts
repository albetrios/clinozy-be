#!/usr/bin/env tsx
/**
 * Session-root hook registration — lets the agent-os hooks of every repository in a
 * multi-repository Claude Code web session load.
 *
 * A cloud session that holds several repositories runs from their parent directory
 * (`/home/user`), so Claude Code takes its hooks from `<parent>/.claude/settings.json`; a
 * repository's own `.claude/settings.json` then contributes its plugins, never its hooks or
 * permission rules. This script writes that parent file: every hook of every agent-os
 * repository found in the parent, read from its generated
 * `agent-os/platforms/claude/settings.json`, with `$CLAUDE_PROJECT_DIR` replaced by the
 * repository's absolute path and the command prefixed with `CLAUDE_PROJECT_DIR="<repository>"`,
 * so each hook still resolves its own repository root, and a relative `if` file rule anchored to
 * the repository (`Edit(**)` → `Edit(//<repository>/**)`), so one repository's edits do not spawn
 * another's hooks. Each repository's `permissions.allow` /
 * `ask` / `deny` lists are merged in too (a union without duplicates; deny still beats ask and
 * allow).
 *
 * Idempotent: the commands it writes (`CLAUDE_PROJECT_DIR="…" <runtime> "…/agent-os/hooks/…"`)
 * are rebuilt on every run, while any other hook and every non-hook key in the file are kept.
 * Before a change, the previous file is copied to `settings.json.bak`. Running it from either
 * repository gives the same file.
 *
 * Writes nothing, and says why, when `AGENT_SESSION_HOOKS=0`, when the parent directory sits
 * inside a git checkout, or when it holds fewer than two agent-os repositories (a
 * single-repository session loads that repository's settings directly).
 *
 * Usage: `pnpm agent-os:session-hooks [--dry-run] [--session-root <directory>]`.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const claudeSettingsPath = join('agent-os', 'platforms', 'claude', 'settings.json');
const projectDirectoryToken = '$CLAUDE_PROJECT_DIR';
/** The command shape this script writes, and so the only commands it replaces on a later run. */
const registeredCommand =
  /^CLAUDE_PROJECT_DIR="[^"]+" (?:bash|node) "[^"]+\/agent-os\/hooks\/[^"]+"$/;
/** A repository path must stay literal inside double quotes: no `"`, `$`, backtick or space. */
const safePath = /^[\w./-]+$/;

interface HookCommand {
  type: string;
  command: string;
  [key: string]: unknown;
}

interface HookGroup {
  matcher?: string;
  hooks: HookCommand[];
  [key: string]: unknown;
}

type HookMap = Record<string, HookGroup[]>;

/** One matcher group of one event: `[event, group]`. */
type HookEntry = [event: string, group: HookGroup];

type PermissionList = 'allow' | 'ask' | 'deny';

type Permissions = Partial<Record<PermissionList, string[]>> & Record<string, unknown>;

interface ClaudeSettings {
  hooks?: HookMap;
  permissions?: Permissions;
  [key: string]: unknown;
}

const permissionLists: PermissionList[] = ['allow', 'ask', 'deny'];

function log(message: string): void {
  console.log(`session-hooks: ${message}`);
}

function readSettings(path: string): ClaudeSettings {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as ClaudeSettings) : {};
}

function isInsideGitCheckout(directory: string): boolean {
  let current = directory;
  for (;;) {
    if (existsSync(join(current, '.git'))) return true;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

function findRepositories(sessionRoot: string): string[] {
  return readdirSync(sessionRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(sessionRoot, entry.name))
    .filter(
      (directory) =>
        existsSync(join(directory, '.git')) && existsSync(join(directory, claudeSettingsPath)),
    )
    .sort((left, right) => left.localeCompare(right));
}

function registerCommand({
  command,
  repository,
}: {
  command: string;
  repository: string;
}): string | null {
  if (!command.includes(projectDirectoryToken)) return null;
  const registered = `CLAUDE_PROJECT_DIR="${repository}" ${command.replaceAll(projectDirectoryToken, repository)}`;
  return registeredCommand.test(registered) ? registered : null;
}

/** A file-path rule (`Edit(**)`) whose pattern is relative: Claude Code reads it from the working directory. */
const relativePathRule = /^(Edit|Write|Read|NotebookEdit)\((?![/~])(.+)\)$/;

/**
 * Anchors a hook's `if` rule to its repository: from the session root, `Edit(**)` would match
 * every repository's files, so `Edit(**)` becomes `Edit(//<repository>/**)` (the `//` anchor is
 * an absolute path). Any other rule is kept as it is.
 */
function registerRule({ rule, repository }: { rule: string; repository: string }): string {
  const match = relativePathRule.exec(rule);
  return match ? `${match[1]}(/${repository}/${match[2]})` : rule;
}

/** Every hook this script did not write (a hand-added one, another tool's), by event. */
function unregisteredHooks(existing: HookMap): HookEntry[] {
  return Object.entries(existing).flatMap(([event, groups]) =>
    groups
      .map((group) => ({
        ...group,
        hooks: group.hooks.filter((hook) => !registeredCommand.test(hook.command)),
      }))
      .filter((group) => group.hooks.length > 0)
      .map((group): HookEntry => [event, group]),
  );
}

/** One repository's hooks with every command registered for the session root, by event. */
function repositoryHooks(repository: string): HookEntry[] {
  const hooks = readSettings(join(repository, claudeSettingsPath)).hooks ?? {};
  return Object.entries(hooks).flatMap(([event, groups]) =>
    groups.flatMap((group): HookEntry[] => {
      const registered = group.hooks.flatMap((hook) => {
        const command = registerCommand({ command: hook.command, repository });
        if (command && typeof hook.if === 'string') {
          return [{ ...hook, command, if: registerRule({ rule: hook.if, repository }) }];
        }
        if (command) return [{ ...hook, command }];
        log(`skipped an unexpected command in ${repository} (${event}): ${hook.command}`);
        return [];
      });
      return registered.length > 0 ? [[event, { ...group, hooks: registered }]] : [];
    }),
  );
}

function buildHooks({ existing, repositories }: { existing: HookMap; repositories: string[] }): {
  hooks: HookMap;
  counts: Map<string, number>;
} {
  const hooks: HookMap = {};
  const counts = new Map<string, number>();
  const add = ([event, group]: HookEntry) => {
    hooks[event] ??= [];
    hooks[event].push(group);
  };
  for (const entry of unregisteredHooks(existing)) add(entry);
  for (const repository of repositories) {
    const entries = repositoryHooks(repository);
    for (const entry of entries) add(entry);
    counts.set(
      repository,
      entries.reduce((total, [, group]) => total + group.hooks.length, 0),
    );
  }
  return { hooks, counts };
}

/** The session root's permission rules plus every repository's, each list without duplicates. */
function mergePermissions({
  existing,
  repositories,
}: {
  existing: Permissions;
  repositories: string[];
}): Permissions {
  const sources = [
    existing,
    ...repositories.map(
      (repository) => readSettings(join(repository, claudeSettingsPath)).permissions ?? {},
    ),
  ];
  const merged: Permissions = { ...existing };
  for (const list of permissionLists) {
    const rules = [...new Set(sources.flatMap((source) => source[list] ?? []))];
    if (rules.length > 0) merged[list] = rules;
  }
  return merged;
}

function main(): void {
  const options = process.argv.slice(2);
  const dryRun = options.includes('--dry-run');
  const sessionRootIndex = options.indexOf('--session-root');
  const sessionRootOption = sessionRootIndex >= 0 ? options[sessionRootIndex + 1] : undefined;
  if (sessionRootIndex >= 0 && !sessionRootOption) {
    console.error('session-hooks: --session-root needs a directory');
    process.exit(2);
  }
  const sessionRoot = resolve(sessionRootOption ?? dirname(process.cwd()));

  if (process.env.AGENT_SESSION_HOOKS === '0') {
    log('skipped (AGENT_SESSION_HOOKS=0).');
    return;
  }
  if (isInsideGitCheckout(sessionRoot)) {
    log(
      `skipped: ${sessionRoot} is inside a git checkout, so it is no multi-repository session root.`,
    );
    return;
  }
  const found = findRepositories(sessionRoot);
  const repositories = found.filter((repository) => safePath.test(repository));
  for (const repository of found.filter((candidate) => !safePath.test(candidate))) {
    log(`skipped ${repository}: its path needs shell quoting.`);
  }
  if (repositories.length < 2) {
    log(
      `skipped: ${sessionRoot} holds ${repositories.length} agent-os repository — a single-repository session loads its own .claude/settings.json.`,
    );
    return;
  }

  const settingsDirectory = join(sessionRoot, '.claude');
  const settingsFile = join(settingsDirectory, 'settings.json');
  let current: ClaudeSettings;
  try {
    current = readSettings(settingsFile);
  } catch {
    console.error(
      `session-hooks: ${settingsFile} is not valid JSON — fix or move it, then re-run.`,
    );
    process.exit(1);
  }
  const { hooks, counts } = buildHooks({ existing: current.hooks ?? {}, repositories });
  const permissions = mergePermissions({ existing: current.permissions ?? {}, repositories });
  const next = `${JSON.stringify({ ...current, permissions, hooks }, null, 2)}\n`;
  const summary = repositories
    .map((repository) => `${repository} (${counts.get(repository) ?? 0})`)
    .join(', ');

  if (existsSync(settingsFile) && readFileSync(settingsFile, 'utf8') === next) {
    log(`${settingsFile} is up to date — hooks from ${summary}.`);
    return;
  }
  if (dryRun) {
    log(`would write ${settingsFile} — hooks from ${summary}:`);
    process.stdout.write(next);
    return;
  }
  mkdirSync(settingsDirectory, { recursive: true });
  if (existsSync(settingsFile)) copyFileSync(settingsFile, `${settingsFile}.bak`);
  const temporaryFile = `${settingsFile}.tmp`;
  writeFileSync(temporaryFile, next);
  renameSync(temporaryFile, settingsFile);
  log(`wrote ${settingsFile} — hooks from ${summary}.`);
}

main();
