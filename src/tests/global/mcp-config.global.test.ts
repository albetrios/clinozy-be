/**
 * Policy: the committed MCP templates stay consistent (no drift between the two files).
 *
 * - `.mcp.example.json` is the full agent-only set; `.mcp.default.json` is the default
 *   auto-start pair (codegraph + headroom). The pair must mirror its entries in the full
 *   set exactly, so deriving the default from a separate committed file cannot drift.
 * - Both templates are mirrored under `agent-os/mcp/` (the agent-os source of truth); the
 *   root file and its mirror must be equal.
 * - H-7: every server runs a pinned version — a `uvx` package spec names `==<version>` (semgrep
 *   equal to tooling/setup/agent/tool-versions.sh) or a git commit, an `npx` package names
 *   `@<version>`, a docker image its digest, and nothing names `@latest`. The default pair runs the
 *   codegraph and headroom CLIs the installers pin (tool-versions.sh), as clinozy-fe's
 *   tests/ci/mcp-config.policy.test.ts holds its own.
 *
 * See docs/integrations/agentic-third-party-tooling.md and CLAUDE.md (MCP servers).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = process.cwd();

type McpServers = Record<string, Record<string, unknown>>;

function readMcpServers(relativePath: string): McpServers {
  const raw = readFileSync(join(PROJECT_ROOT, relativePath), 'utf-8');
  const parsed = JSON.parse(raw) as { mcpServers?: McpServers };
  return parsed.mcpServers ?? {};
}

const EXPECTED_DEFAULT_KEYS = ['be-codegraph', 'be-headroom'];

describe('MCP template consistency', () => {
  const fullSet = readMcpServers('.mcp.example.json');
  const defaultPair = readMcpServers('.mcp.default.json');

  it('mirrors .mcp.example.json under agent-os/mcp/', () => {
    expect(readMcpServers('agent-os/mcp/mcp.example.json')).toEqual(fullSet);
  });

  it('mirrors .mcp.default.json under agent-os/mcp/', () => {
    expect(readMcpServers('agent-os/mcp/mcp.default.json')).toEqual(defaultPair);
  });

  it('default pair is exactly codegraph + headroom', () => {
    expect(Object.keys(defaultPair).sort()).toEqual([...EXPECTED_DEFAULT_KEYS].sort());
  });

  it('every default-pair server matches its full-set definition (no drift)', () => {
    for (const [key, definition] of Object.entries(defaultPair)) {
      expect(fullSet, `${key} missing from .mcp.example.json`).toHaveProperty(key);
      expect(definition, `${key} definition differs from .mcp.example.json`).toEqual(fullSet[key]);
    }
  });
});

/** The pinned value of `key` in tooling/setup/agent/tool-versions.sh. */
function toolVersion(key: string): string {
  const pins = readFileSync(join(PROJECT_ROOT, 'tooling/setup/agent/tool-versions.sh'), 'utf-8');
  return (
    pins
      .split('\n')
      .find((line) => line.startsWith(`${key}=`))
      ?.slice(key.length + 1) ?? ''
  );
}

/** The servers of `file` launched by `command`. */
function serversRunBy({ file, command }: { file: string; command: string }) {
  return Object.entries(readMcpServers(file)).filter(
    ([, definition]) => definition.command === command,
  );
}

describe('MCP servers run pinned versions (H-7)', () => {
  const templates = ['.mcp.example.json', '.mcp.default.json'];

  it('pins every uvx package spec to an exact version or a git commit', () => {
    const servers = serversRunBy({ file: '.mcp.example.json', command: 'uvx' });
    expect(servers.length).toBeGreaterThan(0);
    for (const [name, definition] of servers) {
      const args = definition.args as string[];
      expect(args, name).toContain('--from');
      const spec = args[args.indexOf('--from') + 1] ?? '';
      // A git commit only where the package has no registry release (ast-grep-mcp).
      expect(spec, name).toMatch(
        /^(?:[\w.-]+(?:\[[\w,-]+\])?==\d+\.\d+\.\d+|git\+https:\/\/github\.com\/[\w.-]+\/[\w.-]+@[0-9a-f]{40})$/,
      );
    }
  });

  it('pins every npx package to an exact version', () => {
    const servers = serversRunBy({ file: '.mcp.example.json', command: 'npx' });
    expect(servers.length).toBeGreaterThan(0);
    for (const [name, definition] of servers) {
      const spec = (definition.args as string[]).find((arg) => !arg.startsWith('-')) ?? '';
      expect(spec, name).toMatch(/^(?:@[\w.-]+\/)?[\w.-]+@\d+\.\d+\.\d+$/);
    }
  });

  it('runs semgrep at the tool-versions.sh pin, and the default pair from the pinned CLIs', () => {
    const fullSet = readMcpServers('.mcp.example.json');
    expect(String(fullSet['be-semgrep']?.args ?? '')).toContain(
      `semgrep==${toolVersion('SEMGREP_VERSION')}`,
    );
    // install-codegraph.sh and install-headroom.sh install the CLIs at CODEGRAPH_VERSION and
    // HEADROOM_VERSION; the servers run those binaries, never a package runner.
    expect(fullSet['be-codegraph']?.command).toBe('codegraph');
    expect(fullSet['be-headroom']?.command).toBe('headroom');
    for (const key of ['CODEGRAPH_VERSION', 'HEADROOM_VERSION', 'SEMGREP_VERSION']) {
      expect(toolVersion(key), key).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it.each(templates)('%s names no floating version or unpinned image', (file) => {
    const raw = readFileSync(join(PROJECT_ROOT, file), 'utf-8');
    expect(raw).not.toMatch(/@latest\b/);
    expect(raw).not.toContain('--pull=always');
    for (const [name, definition] of serversRunBy({ file, command: 'docker' })) {
      const image = (definition.args as string[]).find(
        (arg) => /[/:]/.test(arg) && !arg.startsWith('-'),
      );
      expect(image, name).toMatch(/@sha256:[0-9a-f]{64}$/);
    }
  });

  it('runs the SonarQube server on the host network, where SonarQube listens on loopback only', () => {
    // docker-compose.sonar.yml publishes SonarQube on 127.0.0.1 (H-8): from a bridge container
    // neither localhost nor host.docker.internal reaches it.
    const args = readMcpServers('.mcp.example.json')['be-sonarqube']?.args as string[];
    expect(args.join(' ')).toContain('--network host');
  });
});
