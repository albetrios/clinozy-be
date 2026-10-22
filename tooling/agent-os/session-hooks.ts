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
 * `deny` lists are merged in beside the root's own (a union without duplicates). The root's `ask`
 * list is the repositories' asks plus the ones added there by hand: each run records the asks it
 * took from the repositories in `.claude/session-hooks-asks.json`, so the next run replaces those
 * and keeps every other one; deny still beats ask and allow.
 *
 * Claude Code reads `.mcp.json` from the session root too, so no repository's MCP servers start
 * there. The script also writes `<parent>/.mcp.json` with each repository's codegraph server
 * (`<prefix>-codegraph` in its committed `.mcp.default.json`, there on a fresh clone before setup
 * writes `.mcp.json`), pointed at that repository with `--path`: codegraph
 * serves the index under `<repository>/.codegraph/`, and from the parent it would look for one
 * there. A `pnpm exec <bin>` launcher becomes the repository's `node_modules/.bin/<bin>`, which
 * runs from any directory. headroom keeps no repository state, so it is not copied: the one
 * user-level server `install-headroom.sh` registers (`headroom mcp install`) serves every
 * repository.
 *
 * Idempotent: the commands it writes (`CLAUDE_PROJECT_DIR="…" node "…/agent-os/hooks/…"`)
 * and the codegraph servers are rebuilt on every run, while any other hook, server and key in
 * the files are kept. Before a change, the previous settings file is copied to
 * `settings.json.bak`. Running it from either repository gives the same files.
 *
 * Writes nothing, and says why, when the parent directory sits inside a git checkout, or when
 * it holds fewer than two agent-os repositories (a
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
import { parseCommandLine } from '@tooling/setup/common/script.js';

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

/** A repository's codegraph server: the one MCP server that needs its repository's directory. */
const codegraphServerName = /-codegraph$/;

/** A stdio server, as `.mcp.json` declares one. */
interface McpServer {
  command: string;
  args?: string[];
  [key: string]: unknown;
}

interface McpConfig {
  mcpServers?: Record<string, McpServer>;
  [key: string]: unknown;
}

function log(message: string): void {
  console.log(`session-hooks: ${message}`);
}

function readJson<Shape extends object = ClaudeSettings>(path: string): Shape {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Shape) : ({} as Shape);
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
  const hooks = readJson(join(repository, claudeSettingsPath)).hooks ?? {};
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

/** Every ask rule the repositories declare, each once. */
function repositoryAsks(repositories: string[]): string[] {
  return [
    ...new Set(
      repositories.flatMap(
        (repository) => readJson(join(repository, claudeSettingsPath)).permissions?.ask ?? [],
      ),
    ),
  ];
}

/**
 * The session root's permission rules merged with every repository's, each list without duplicates.
 *
 * `allow` and `deny` keep the root's own rules (a session-wide approval, a deny no repository may
 * lift) beside the repositories'. `ask` keeps the root's hand-added rules beside the repositories':
 * `recordedAsks` are the asks the previous run took from the repositories, and only those are
 * replaced, because an ask outranks every allow and a rule a repository has since dropped would
 * otherwise keep prompting for the rest of the session. With no record (a root no run has written
 * yet) every ask is rebuilt from the repositories.
 */
function mergePermissions({
  existing,
  repositories,
  recordedAsks,
}: {
  existing: Permissions;
  repositories: string[];
  recordedAsks: string[] | null;
}): Permissions {
  const sources = [
    existing,
    ...repositories.map(
      (repository) => readJson(join(repository, claudeSettingsPath)).permissions ?? {},
    ),
  ];
  const handAddedAsks =
    recordedAsks === null
      ? []
      : (existing.ask ?? []).filter((rule) => !recordedAsks.includes(rule));
  const merged: Permissions = { ...existing };
  for (const list of permissionLists) {
    const from = list === 'ask' ? [{ ask: handAddedAsks }, ...sources.slice(1)] : sources;
    const rules = [...new Set(from.flatMap((source) => source[list] ?? []))];
    if (rules.length > 0) merged[list] = rules;
    else delete merged[list];
  }
  return merged;
}

/** The asks the previous run took from the repositories, or `null` when no run has recorded them. */
function readRecordedAsks(recordFile: string): string[] | null {
  if (!existsSync(recordFile)) return null;
  const record = JSON.parse(readFileSync(recordFile, 'utf8')) as { ask?: unknown };
  return Array.isArray(record.ask) ? record.ask.filter((rule) => typeof rule === 'string') : null;
}

/** A repository's codegraph server, started from the session root but serving the repository's index. */
function registerMcpServer({
  server,
  repository,
}: {
  server: McpServer;
  repository: string;
}): McpServer {
  const [first, binary, ...rest] = server.args ?? [];
  const launchedByPnpm = server.command === 'pnpm' && first === 'exec' && binary !== undefined;
  const command = launchedByPnpm
    ? join(repository, 'node_modules', '.bin', binary)
    : server.command;
  const launchArguments = launchedByPnpm ? rest : (server.args ?? []);
  return {
    ...server,
    command,
    args: launchArguments.includes('--path')
      ? launchArguments
      : [...launchArguments, '--path', repository],
  };
}

/**
 * The session root's MCP servers: every one it already has except the codegraph servers, which
 * are rebuilt from the repositories (a repository since removed leaves none behind).
 */
function buildMcpServers({
  existing,
  repositories,
}: {
  existing: Record<string, McpServer>;
  repositories: string[];
}): Record<string, McpServer> {
  const servers = Object.fromEntries(
    Object.entries(existing).filter(([name]) => !codegraphServerName.test(name)),
  );
  for (const repository of repositories) {
    const declared = readJson<McpConfig>(join(repository, '.mcp.default.json')).mcpServers ?? {};
    for (const [name, server] of Object.entries(declared)) {
      if (codegraphServerName.test(name)) servers[name] = registerMcpServer({ server, repository });
    }
  }
  return servers;
}

/** Writes through a temporary file, so Claude Code never reads a half-written one. */
function writeFileAtomically({ path, content }: { path: string; content: string }): void {
  const temporaryFile = `${path}.tmp`;
  writeFileSync(temporaryFile, content);
  renameSync(temporaryFile, path);
}

/** The session root's `.mcp.json` as this run writes it, and whether the file holds that already. */
function planMcpFile({
  path,
  current,
  repositories,
}: {
  path: string;
  current: McpConfig;
  repositories: string[];
}): { path: string; content: string; servers: string; isCurrent: boolean } {
  const mcpServers = buildMcpServers({ existing: current.mcpServers ?? {}, repositories });
  const content = `${JSON.stringify({ ...current, mcpServers }, null, 2)}\n`;
  const servers =
    Object.keys(mcpServers)
      .filter((name) => codegraphServerName.test(name))
      .join(', ') || 'none';
  // No file and nothing to declare is current too: the script never writes an empty server list.
  const isCurrent = existsSync(path)
    ? readFileSync(path, 'utf8') === content
    : Object.keys(mcpServers).length === 0;
  return { path, content, servers, isCurrent };
}

/** Writes the session root's settings and the asks record, or prints the settings on a dry run. */
function writeSettings({
  dryRun,
  settingsFile,
  recordFile,
  next,
  record,
  summary,
}: {
  dryRun: boolean;
  settingsFile: string;
  recordFile: string;
  next: string;
  record: string;
  summary: string;
}): void {
  if (dryRun) {
    log(`would write ${settingsFile} — hooks from ${summary}:`);
    process.stdout.write(next);
    return;
  }
  mkdirSync(dirname(settingsFile), { recursive: true });
  if (!existsSync(settingsFile) || readFileSync(settingsFile, 'utf8') !== next) {
    if (existsSync(settingsFile)) copyFileSync(settingsFile, `${settingsFile}.bak`);
    writeFileAtomically({ path: settingsFile, content: next });
  }
  writeFileSync(recordFile, record);
  log(`wrote ${settingsFile} — hooks from ${summary}.`);
}

/** Writes the session root's `.mcp.json`, or prints it on a dry run. */
function writeMcpFile({
  dryRun,
  plan,
}: {
  dryRun: boolean;
  plan: { path: string; content: string; servers: string };
}): void {
  if (dryRun) {
    log(`would write ${plan.path} — ${plan.servers}:`);
    process.stdout.write(plan.content);
    return;
  }
  writeFileAtomically({ path: plan.path, content: plan.content });
  log(`wrote ${plan.path} — ${plan.servers}.`);
}

function main(): void {
  const { values } = parseCommandLine({
    args: process.argv.slice(2),
    options: { 'dry-run': { type: 'boolean' }, 'session-root': { type: 'string' } },
    messages: { needsValue: () => 'session-hooks: --session-root needs a directory' },
  });
  const dryRun = values['dry-run'] === true;
  const sessionRootOption = values['session-root'];
  const sessionRoot = resolve(sessionRootOption ?? dirname(process.cwd()));

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
  const recordFile = join(settingsDirectory, 'session-hooks-asks.json');
  const mcpFile = join(sessionRoot, '.mcp.json');
  let current: ClaudeSettings;
  let recordedAsks: string[] | null;
  let currentMcp: McpConfig;
  try {
    current = readJson(settingsFile);
    recordedAsks = readRecordedAsks(recordFile);
    currentMcp = readJson<McpConfig>(mcpFile);
  } catch {
    console.error(
      `session-hooks: ${settingsFile}, ${recordFile} or ${mcpFile} is not valid JSON — fix or move it, then re-run.`,
    );
    process.exit(1);
  }
  const { hooks, counts } = buildHooks({ existing: current.hooks ?? {}, repositories });
  const permissions = mergePermissions({
    existing: current.permissions ?? {},
    repositories,
    recordedAsks,
  });
  const next = `${JSON.stringify({ ...current, permissions, hooks }, null, 2)}\n`;
  const record = `${JSON.stringify({ ask: repositoryAsks(repositories) }, null, 2)}\n`;
  const summary = repositories
    .map((repository) => `${repository} (${counts.get(repository) ?? 0})`)
    .join(', ');
  const recordIsCurrent = existsSync(recordFile) && readFileSync(recordFile, 'utf8') === record;
  const settingsIsCurrent =
    existsSync(settingsFile) && readFileSync(settingsFile, 'utf8') === next && recordIsCurrent;
  const mcp = planMcpFile({ path: mcpFile, current: currentMcp, repositories });

  if (settingsIsCurrent && mcp.isCurrent) {
    log(`${settingsFile} is up to date — hooks from ${summary}; MCP: ${mcp.servers}.`);
    return;
  }
  if (!settingsIsCurrent) {
    writeSettings({ dryRun, settingsFile, recordFile, next, record, summary });
  }
  if (!mcp.isCurrent) writeMcpFile({ dryRun, plan: mcp });
}

main();
