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
  hooks?: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>>;
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

function runScript({
  sessionRoot,
  options = [],
  environment = {},
}: {
  sessionRoot: string;
  options?: string[];
  environment?: Record<string, string>;
}) {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key !== 'AGENT_SESSION_HOOKS'),
  );
  return spawnSync(TSX, [SCRIPT, '--session-root', sessionRoot, ...options], {
    encoding: 'utf8',
    env: { ...inherited, ...environment },
  });
}

const sessionSettingsPath = (sessionRoot: string) => join(sessionRoot, '.claude', 'settings.json');
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
            command: 'bash "$CLAUDE_PROJECT_DIR/agent-os/hooks/session-start.sh"',
          },
        ],
      },
    ],
    PreToolUse: [
      {
        matcher: 'Edit|Write',
        hooks: [
          { type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/agent-os/hooks/guardrails.mjs"' },
        ],
      },
    ],
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
    // Hooks only: a repository's permissions stay its own.
    expect(readSessionSettings(sessionRoot).permissions).toBeUndefined();
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

  it.each([
    ['a single repository', { own: REAL_SETTINGS }, {}, 'holds 1 agent-os repository'],
    [
      'AGENT_SESSION_HOOKS=0',
      { own: REAL_SETTINGS, other: OTHER_SETTINGS },
      { AGENT_SESSION_HOOKS: '0' },
      'AGENT_SESSION_HOOKS=0',
    ],
  ])('writes nothing for %s', (_case, repositories, environment, reason) => {
    const sessionRoot = makeSessionRoot(repositories);
    const result = runScript({ sessionRoot, environment });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(reason);
    expect(existsSync(sessionSettingsPath(sessionRoot))).toBe(false);
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
});
