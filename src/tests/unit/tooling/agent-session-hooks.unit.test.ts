import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = join(process.cwd(), 'tooling', 'agent-os', 'session-hooks.ts');
const TSX = join(process.cwd(), 'node_modules', '.bin', 'tsx');
const CLAUDE_SETTINGS = join('agent-os', 'platforms', 'claude', 'settings.json');
const REAL_SETTINGS = readFileSync(CLAUDE_SETTINGS, 'utf8');
const REGISTERED = /^CLAUDE_PROJECT_DIR="([^"]+)" (?:bash|node) "([^"]+)\/agent-os\/hooks\/[^"]+"$/;

interface Settings {
  hooks?: Record<
    string,
    Array<{ matcher?: string; hooks: Array<{ command: string; if?: string }> }>
  >;
  [key: string]: unknown;
}

const temporaryDirectories: string[] = [];

/** A session root holding fake checkouts (a `.git` directory and the generated Claude settings). */
function makeSessionRoot(repositories: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'session-hooks-'));
  temporaryDirectories.push(root);
  for (const [name, settings] of Object.entries(repositories)) {
    mkdirSync(join(root, name, '.git'), { recursive: true });
    mkdirSync(join(root, name, 'agent-os', 'platforms', 'claude'), { recursive: true });
    writeFileSync(join(root, name, CLAUDE_SETTINGS), settings);
  }
  return root;
}

function runScript({ sessionRoot, options = [] }: { sessionRoot: string; options?: string[] }) {
  return spawnSync(TSX, [SCRIPT, '--session-root', sessionRoot, ...options], { encoding: 'utf8' });
}

const sessionSettingsPath = (sessionRoot: string) => join(sessionRoot, '.claude', 'settings.json');
const sessionMcpPath = (sessionRoot: string) => join(sessionRoot, '.mcp.json');
const readSessionSettings = (sessionRoot: string) =>
  JSON.parse(readFileSync(sessionSettingsPath(sessionRoot), 'utf8')) as Settings;
const commandsOf = (settings: Settings) =>
  Object.values(settings.hooks ?? {}).flatMap((groups) =>
    groups.flatMap((group) => group.hooks.map((hook) => hook.command)),
  );

const OTHER_SETTINGS = JSON.stringify({
  permissions: { allow: ['Bash(pnpm test*)'] },
  hooks: {
    SessionStart: [
      {
        hooks: [
          {
            type: 'command',
            command: 'node "$CLAUDE_PROJECT_DIR/agent-os/hooks/be-session-start.mjs"',
          },
        ],
      },
    ],
    PreToolUse: [
      {
        matcher: 'Edit|Write',
        hooks: [
          {
            type: 'command',
            command: 'node "$CLAUDE_PROJECT_DIR/agent-os/hooks/be-guardrails.mjs"',
          },
        ],
      },
    ],
  },
});

const REAL_MCP = readFileSync('.mcp.json', 'utf8');

/** The other repository's servers, as clinozy-fe declares them: codegraph through `pnpm exec`. */
const OTHER_MCP = JSON.stringify({
  mcpServers: {
    'fe-codegraph': { command: 'pnpm', args: ['exec', 'codegraph', 'serve', '--mcp'] },
    'fe-headroom': {
      command: 'uvx',
      args: ['--from', 'headroom-ai[mcp]', 'headroom', 'mcp', 'serve'],
    },
  },
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('tooling/agent-os/session-hooks.ts', () => {
  it("registers every repository's hooks with absolute paths and its own CLAUDE_PROJECT_DIR", () => {
    const sessionRoot = makeSessionRoot({ own: REAL_SETTINGS, other: OTHER_SETTINGS });
    const result = runScript({ sessionRoot });

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('skipped an unexpected command');
    const commands = commandsOf(readSessionSettings(sessionRoot));
    const ownCount = commandsOf(JSON.parse(REAL_SETTINGS) as Settings).length;
    expect(commands).toHaveLength(ownCount + 2);
    for (const command of commands) {
      const match = REGISTERED.exec(command);
      expect(match, command).not.toBeNull();
      expect(match?.[1]).toBe(match?.[2]);
      expect(command).not.toContain('$CLAUDE_PROJECT_DIR');
    }
    expect(commands.filter((command) => command.includes('/own/'))).toHaveLength(ownCount);
    // Permission rules are merged too: every repository's, each once.
    const permissions = readSessionSettings(sessionRoot).permissions as Record<string, string[]>;
    const own = (JSON.parse(REAL_SETTINGS) as { permissions: Record<string, string[]> })
      .permissions;
    for (const list of ['allow', 'ask', 'deny']) {
      for (const rule of own[list] ?? []) expect(permissions[list]).toContain(rule);
    }
    expect((permissions.allow ?? []).filter((rule) => rule === 'Bash(pnpm test*)')).toHaveLength(1);
  });

  it("with no record yet, rebuilds the root's ask rules from the repositories, and keeps its own allow and deny", () => {
    const sessionRoot = makeSessionRoot({ own: REAL_SETTINGS, other: OTHER_SETTINGS });
    mkdirSync(join(sessionRoot, '.claude'), { recursive: true });
    writeFileSync(
      sessionSettingsPath(sessionRoot),
      JSON.stringify({
        permissions: {
          allow: ['Bash'],
          ask: ['Bash(pnpm exec *)'],
          deny: ['Bash(rm -rf /)'],
        },
      }),
    );
    expect(runScript({ sessionRoot }).status).toBe(0);
    const permissions = readSessionSettings(sessionRoot).permissions as Record<string, string[]>;
    // A dropped ask rule would outrank every allow for the rest of the session.
    expect(permissions.ask).not.toContain('Bash(pnpm exec *)');
    expect(permissions.ask).toContain('Bash(gh pr create *)');
    expect(permissions.allow).toContain('Bash');
    expect(permissions.deny).toContain('Bash(rm -rf /)');
  });

  it('keeps an ask rule added to the root by hand, and drops one a repository has dropped', () => {
    const withAsk = (rules: string[]) =>
      JSON.stringify({ ...JSON.parse(OTHER_SETTINGS), permissions: { ask: rules } });
    const sessionRoot = makeSessionRoot({
      own: REAL_SETTINGS,
      other: withAsk(['Bash(deploy *)', 'Bash(release *)']),
    });
    expect(runScript({ sessionRoot }).status).toBe(0);
    const recorded = JSON.parse(
      readFileSync(join(sessionRoot, '.claude', 'session-hooks-asks.json'), 'utf8'),
    ) as { ask: string[] };
    expect(recorded.ask).toEqual(expect.arrayContaining(['Bash(deploy *)', 'Bash(release *)']));

    // By hand: one more ask in the root. In the repository: `Bash(release *)` dropped.
    const settings = readSessionSettings(sessionRoot);
    const permissions = settings.permissions as Record<string, string[]>;
    writeFileSync(
      sessionSettingsPath(sessionRoot),
      JSON.stringify({
        ...settings,
        permissions: {
          ...permissions,
          ask: [...(permissions.ask ?? []), 'Bash(terraform apply *)'],
        },
      }),
    );
    writeFileSync(join(sessionRoot, 'other', CLAUDE_SETTINGS), withAsk(['Bash(deploy *)']));
    expect(runScript({ sessionRoot }).status).toBe(0);

    const ask = (readSessionSettings(sessionRoot).permissions as Record<string, string[]>).ask;
    expect(ask).toContain('Bash(terraform apply *)');
    expect(ask).toContain('Bash(deploy *)');
    expect(ask).not.toContain('Bash(release *)');
    // The run is still idempotent with the record in place.
    expect(runScript({ sessionRoot }).stdout).toContain('is up to date');
  });

  it('is idempotent', () => {
    const sessionRoot = makeSessionRoot({ own: REAL_SETTINGS, other: OTHER_SETTINGS });
    runScript({ sessionRoot });
    const first = readFileSync(sessionSettingsPath(sessionRoot), 'utf8');
    const second = runScript({ sessionRoot });

    expect(second.stdout).toContain('is up to date');
    expect(readFileSync(sessionSettingsPath(sessionRoot), 'utf8')).toBe(first);
    expect(existsSync(`${sessionSettingsPath(sessionRoot)}.bak`)).toBe(false);
  });

  it('keeps other hooks and settings, replaces its own stale entries and backs the file up', () => {
    const sessionRoot = makeSessionRoot({ own: REAL_SETTINGS, other: OTHER_SETTINGS });
    const handAdded = 'echo hand-added';
    const stale =
      'CLAUDE_PROJECT_DIR="/gone/repository" bash "/gone/repository/agent-os/hooks/x.sh"';
    const previous = JSON.stringify({
      model: 'kept',
      hooks: {
        Stop: [
          {
            hooks: [
              { type: 'command', command: handAdded },
              { type: 'command', command: stale },
            ],
          },
        ],
      },
    });
    mkdirSync(join(sessionRoot, '.claude'));
    writeFileSync(sessionSettingsPath(sessionRoot), previous);
    runScript({ sessionRoot });

    const settings = readSessionSettings(sessionRoot);
    expect(settings.model).toBe('kept');
    expect(commandsOf(settings)).toContain(handAdded);
    expect(commandsOf(settings)).not.toContain(stale);
    expect(readFileSync(`${sessionSettingsPath(sessionRoot)}.bak`, 'utf8')).toBe(previous);
  });

  it("declares each repository's codegraph server at the session root, pointed at its repository", () => {
    const sessionRoot = makeSessionRoot({ own: REAL_SETTINGS, other: OTHER_SETTINGS });
    const own = join(sessionRoot, 'own');
    const other = join(sessionRoot, 'other');
    writeFileSync(join(own, '.mcp.json'), REAL_MCP);
    writeFileSync(join(other, '.mcp.json'), OTHER_MCP);
    const handAdded = { command: 'echo', args: ['hand-added'] };
    const stale = { command: 'codegraph', args: ['serve', '--mcp', '--path', '/gone/repository'] };
    writeFileSync(
      sessionMcpPath(sessionRoot),
      JSON.stringify({ mcpServers: { 'hand-added': handAdded, 'gone-codegraph': stale } }),
    );
    expect(runScript({ sessionRoot }).status).toBe(0);

    const { mcpServers } = JSON.parse(readFileSync(sessionMcpPath(sessionRoot), 'utf8')) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    // codegraph serves `<repository>/.codegraph/`; from the session root it needs `--path`.
    expect(mcpServers['be-codegraph']).toMatchObject({
      command: 'codegraph',
      args: ['serve', '--mcp', '--path', own],
    });
    // A `pnpm exec` launcher only resolves inside its repository: it becomes the binary itself.
    expect(mcpServers['fe-codegraph']).toEqual({
      command: join(other, 'node_modules', '.bin', 'codegraph'),
      args: ['serve', '--mcp', '--path', other],
    });
    // headroom keeps no repository state: the one user-level server serves every repository.
    expect(Object.keys(mcpServers).filter((name) => name.endsWith('-headroom'))).toEqual([]);
    expect(mcpServers['hand-added']).toEqual(handAdded);
    expect(mcpServers['gone-codegraph']).toBeUndefined();
    expect(runScript({ sessionRoot }).stdout).toContain('is up to date');
  });

  it('writes nothing for a single repository', () => {
    const sessionRoot = makeSessionRoot({ own: REAL_SETTINGS });
    writeFileSync(join(sessionRoot, 'own', '.mcp.json'), REAL_MCP);
    const result = runScript({ sessionRoot });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('holds 1 agent-os repository');
    expect(existsSync(sessionSettingsPath(sessionRoot))).toBe(false);
    expect(existsSync(sessionMcpPath(sessionRoot))).toBe(false);
  });

  it('writes nothing when the session root is itself inside a git checkout', () => {
    const sessionRoot = makeSessionRoot({ own: REAL_SETTINGS, other: OTHER_SETTINGS });
    mkdirSync(join(sessionRoot, '.git'));
    const result = runScript({ sessionRoot });

    expect(result.stdout).toContain('inside a git checkout');
    expect(existsSync(sessionSettingsPath(sessionRoot))).toBe(false);
  });

  it('--dry-run prints the file and writes nothing', () => {
    const sessionRoot = makeSessionRoot({ own: REAL_SETTINGS, other: OTHER_SETTINGS });
    const result = runScript({ sessionRoot, options: ['--dry-run'] });

    expect(result.stdout).toContain('would write');
    expect(result.stdout).toContain('CLAUDE_PROJECT_DIR=');
    expect(existsSync(sessionSettingsPath(sessionRoot))).toBe(false);
  });

  it('anchors a relative file rule to its repository and keeps a command rule as it is', () => {
    const sessionRoot = makeSessionRoot({ own: REAL_SETTINGS, other: OTHER_SETTINGS });
    expect(runScript({ sessionRoot }).status).toBe(0);
    const repository = join(sessionRoot, 'own');
    const rules = Object.values(readSessionSettings(sessionRoot).hooks ?? {}).flatMap((groups) =>
      groups.flatMap((group) =>
        group.hooks.flatMap((hook) => (hook.if === undefined ? [] : [hook.if])),
      ),
    );
    // `Bash(git push*)` names a command, not a path: be-push-ci-watch.mjs checks the repository itself.
    expect(rules).toEqual([
      `Edit(/${repository}/**)`,
      `Write(/${repository}/**)`,
      'Bash(git push*)',
    ]);
  });
});
