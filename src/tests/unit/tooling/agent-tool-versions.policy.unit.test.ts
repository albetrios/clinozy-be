import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AGENT_TOOLS,
  compareVersions,
  parseToolVersions,
  TOOL_VERSIONS_PATH,
} from '@tooling/dev/agent-tools.js';

const ROOT = process.cwd();
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const pinFile = readFileSync(TOOL_VERSIONS_PATH, 'utf8');
const pins = parseToolVersions(pinFile);

/**
 * Locks in pinned agent tooling: one file (`tooling/setup/agent/tool-versions.sh`) holds
 * every version, every installer moves the machine to it, CI installs the same pins, and the
 * bootstrap + session-start banner report drift. A floating "latest" install, a second
 * hardcoded copy of a version, or a tool added to one place but not the others fails here.
 */
describe('agent tool versions policy', () => {
  it('the pin file holds only plain KEY=value lines — safe for bash `source` and $GITHUB_ENV', () => {
    const lines = pinFile.split('\n').filter((line) => line.trim() && !line.startsWith('#'));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).toMatch(/^[A-Z][A-Z0-9_]*=[A-Za-z0-9._-]+$/);
  });

  it('every tool has an x.y.z pin and, for a downloaded binary, a SHA-256 per architecture', () => {
    for (const tool of AGENT_TOOLS) {
      expect(pins[tool.versionKey], tool.versionKey).toMatch(/^\d+\.\d+\.\d+$/);
      if (tool.latestRelease.kind !== 'github') continue;
      for (const key of Object.keys(tool.latestRelease.checksumAssets)) {
        expect(pins[key], key).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });

  it('no pin is orphaned — each *_VERSION key belongs to a tool in AGENT_TOOLS', () => {
    const versionKeys = Object.keys(pins).filter((key) => key.endsWith('_VERSION'));
    expect(versionKeys.sort()).toEqual(AGENT_TOOLS.map((tool) => tool.versionKey).sort());
  });

  it('each installer reads its version from the pin file and never hardcodes one', () => {
    for (const tool of AGENT_TOOLS) {
      const script = read(`tooling/setup/agent/install-${tool.name}.sh`);
      expect(script, tool.name).toContain('tool-install.lib.sh');
      expect(script, tool.name).toContain(`pinned_version ${tool.versionKey}`);
      expect(script, tool.name).not.toMatch(/readonly [A-Z0-9_]*VERSION=/);
      expect(script, tool.name).not.toContain('@latest');
      // A version check, not "already present — nothing to do": a cached install moves to the pin.
      expect(script, tool.name).toContain('installed_version');
    }
  });

  it('downloaded binaries are installed only when their SHA-256 matches the pin', () => {
    for (const tool of AGENT_TOOLS) {
      if (tool.latestRelease.kind !== 'github') continue;
      expect(read(`tooling/setup/agent/install-${tool.name}.sh`), tool.name).toContain(
        'download_verified',
      );
    }
  });

  it('CI installs the same pins — no second copy of a version in the workflows', () => {
    const pullRequestWorkflow = read('.github/workflows/pr-ci.yml');
    const loadWorkflow = read('.github/workflows/scheduled-k6-load-slo.yml');
    expect(pullRequestWorkflow).toContain('tooling/setup/agent/tool-versions.sh >> "$GITHUB_ENV"');
    expect(pullRequestWorkflow).toContain('tooling/setup/agent/install-gitleaks.sh');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: asserts the literal ${SEMGREP_VERSION} shell variable in pr-ci.yml
    expect(pullRequestWorkflow).toContain('semgrep==${SEMGREP_VERSION}');
    expect(loadWorkflow).toContain('tooling/setup/agent/install-k6.sh');
    expect(loadWorkflow).not.toContain('setup-k6-action');
    for (const tool of AGENT_TOOLS) {
      const version = pins[tool.versionKey] ?? '';
      expect(pullRequestWorkflow, tool.name).not.toContain(version);
      expect(loadWorkflow, tool.name).not.toContain(version);
    }
  });

  it('the bootstrap installs every tool and reports pins, MCP smoke and upgrades', () => {
    const bootstrap = read('tooling/setup/agent/bootstrap.sh');
    for (const tool of AGENT_TOOLS)
      expect(bootstrap, tool.name).toContain(`install-${tool.name}.sh`);
    expect(bootstrap).toContain('pnpm tool:agent-tools --smoke --outdated');
  });

  it('the session-start banner checks every tool against its pin', () => {
    const sessionStart = read('agent-os/hooks/be-session-start.mjs');
    for (const tool of AGENT_TOOLS) {
      expect(sessionStart, tool.name).toContain(`${tool.name}:${tool.versionKey}:`);
    }
  });

  it('codegraph is linked onto the PATH Claude Code launches MCP servers with', () => {
    const script = read('tooling/setup/agent/install-codegraph.sh');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: asserts literal shell variables in install-codegraph.sh
    expect(script).toContain('ln -sf "${codegraph_path}" "${user_bin}/codegraph"');
  });
});

describe('agent tool version helpers', () => {
  it('parseToolVersions reads KEY=value lines and skips comments and blanks', () => {
    expect(parseToolVersions('# note\n\nK6_VERSION=2.3.0\n  SEMGREP_VERSION=1.2.3  \n')).toEqual({
      K6_VERSION: '2.3.0',
      SEMGREP_VERSION: '1.2.3',
    });
  });

  it('compareVersions orders numerically, not lexically', () => {
    expect(compareVersions({ left: '1.10.0', right: '1.9.9' })).toBeGreaterThan(0);
    expect(compareVersions({ left: '2.3.0', right: '2.3.0' })).toBe(0);
    expect(compareVersions({ left: '0.9.0', right: '1.0.0' })).toBeLessThan(0);
  });
});
