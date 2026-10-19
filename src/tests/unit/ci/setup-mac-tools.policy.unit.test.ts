import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SCRIPT = readFileSync(join(ROOT, 'tooling/dev/setup-mac-tools.sh'), 'utf8');
const MANIFEST = readFileSync(
  join(ROOT, 'tooling/dev/setup-prerequisites-mac-tools.manifest'),
  'utf8',
);
const SETUP_LOCAL = readFileSync(join(ROOT, 'tooling/dev/setup-local.ts'), 'utf8');
const PACKAGE_JSON = readFileSync(join(ROOT, 'package.json'), 'utf8');

/**
 * Guards the macOS external-tool prerequisites installer used by `pnpm setup:local`:
 * it is data-driven from a single manifest, installs/upgrades from AUTHENTICATED
 * sources only, runs NON-INTERACTIVELY (no pause), is macOS-gated, and is wired into
 * setup:local with a dry-run (`--check`) path and a skip flag.
 */
describe('setup:local macOS prerequisites installer policy', () => {
  it('is macOS-gated and offers a --check dry-run', () => {
    expect(SCRIPT).toContain('uname -s');
    expect(SCRIPT).toContain('Darwin');
    expect(SCRIPT).toMatch(/--check\s*\|\s*--dry-run/);
  });

  it('bootstraps Homebrew non-interactively from the official source', () => {
    expect(SCRIPT).toContain('NONINTERACTIVE=1');
    expect(SCRIPT).toContain('raw.githubusercontent.com/Homebrew/install/HEAD/install.sh');
    expect(SCRIPT).toContain('HOMEBREW_NO_AUTO_UPDATE=1');
  });

  it('is driven by the single manifest, which lists every tool', () => {
    // The script reads the manifest and dispatches by method — no hard-coded list.
    expect(SCRIPT).toContain('setup-prerequisites-mac-tools.manifest');
    for (const handler of ['node_ensure', 'brew_ensure', 'docker_ensure']) {
      expect(SCRIPT).toContain(handler);
    }
    // The manifest is the source of truth for which tools are installed.
    for (const tool of ['gitleaks', 'gh', 'jq', 'uv', 'pipx', 'colima']) {
      expect(MANIFEST).toContain(tool);
    }
    expect(MANIFEST).toMatch(/^node\|/m);
  });

  it('leaves the pinned agent tools to setup:local — never an upgrade-to-latest here', () => {
    // codegraph + headroom are pinned in tooling/setup/agent/tool-versions.sh; an
    // install-or-upgrade line here would move them off that pin on every run.
    const entries = MANIFEST.split('\n').filter((line) => line.trim() && !line.startsWith('#'));
    for (const entry of entries) {
      expect(entry).not.toContain('@latest');
      expect(entry).not.toMatch(/codegraph|headroom-ai/);
    }
    expect(SETUP_LOCAL).toContain("AGENT_TOOLS.find((tool) => tool.name === 'codegraph')");
    expect(SETUP_LOCAL).toContain("AGENT_TOOLS.find((tool) => tool.name === 'headroom')");
  });

  it('install-or-upgrades from authenticated sources (Homebrew)', () => {
    expect(SCRIPT).toContain('brew upgrade');
    expect(SCRIPT).toContain('brew install');
    // Node matches the pinned .nvmrc major.
    expect(SCRIPT).toContain('.nvmrc');
  });

  it('is wired into setup:local: darwin-gated, skippable, and passes --check through', () => {
    expect(SETUP_LOCAL).toContain("process.platform === 'darwin'");
    expect(SETUP_LOCAL).toContain('options.skipMacTools');
    expect(SETUP_LOCAL).toContain('tooling/dev/setup-mac-tools.sh');
    expect(SETUP_LOCAL).toContain("'skip-mac-tools': { type: 'boolean' }");
  });

  it('exposes a standalone pnpm setup:mac-tools script', () => {
    expect(PACKAGE_JSON).toContain('"setup:mac-tools": "bash tooling/dev/setup-mac-tools.sh"');
  });
});
