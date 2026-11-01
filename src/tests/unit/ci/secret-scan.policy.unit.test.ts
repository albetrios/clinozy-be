import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const config = readFileSync('.gitleaks.toml', 'utf8');
const ignore = readFileSync('.gitleaksignore', 'utf8');
const workflow = readFileSync('.github/workflows/pr-ci.yml', 'utf8');

/**
 * Locks in a secret scan that has rules. A `.gitleaks.toml` with only an allowlist loads no rule,
 * so pre-commit and the PR CI secrets job passed every key from 2 Oct to 20 Oct 2026. The config
 * extends gitleaks' built-in rules, the CI job proves them on a planted key before it scans, and
 * .gitleaksignore holds only fingerprints of old commits (a new finding is marked inline instead).
 */
describe('.gitleaks.toml (the secret scan has rules)', () => {
  it("extends gitleaks' built-in rules", () => {
    expect(config).toMatch(/^\[extend\]\s*\nuseDefault = true$/m);
  });

  it('plants a key and checks the config finds it, before the CI scan', () => {
    const canary = workflow.indexOf('- name: Gitleaks canary (the config finds a planted key)');
    const scan = workflow.indexOf('- name: Gitleaks (secret detection)');
    expect(canary).toBeGreaterThan(-1);
    expect(canary).toBeLessThan(scan);
    const step = workflow.slice(canary, scan);
    expect(step).toContain('gitleaks detect --no-git --source "$canary" --config .gitleaks.toml');
    // H-5: the canary plants the key under .github/workflows/ (found) and node_modules/ (skipped).
    expect(step).toContain('.github/workflows/canary.yml');
    expect(step).toContain('node_modules/planted/canary.js');
    expect(step).toContain('"$found" != ".github/workflows/canary.yml,canary.ts"');
  });

  it('ignores only fingerprints of commits, never a file-and-line entry', () => {
    const entries = ignore
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.startsWith('#'));
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries)
      expect(entry, entry).toMatch(/^[0-9a-f]{40}:[^:]+:[a-z0-9-]+:\d+$/);
  });
});

/** The `[allowlist] paths` entries of .gitleaks.toml, as written (Go RE2 regular expressions). */
const allowlistPaths = [
  ...(/^paths = \[\n([\s\S]*?)^\]/m.exec(config)?.[1] ?? '').matchAll(/'''(.+?)'''/g),
].map((match) => match[1] ?? '');

/** Paths the scan must read: the ones the unanchored entries skipped. */
const SCANNED = [
  '.github/workflows/canary.yml',
  '.github/actions/setup-node-pnpm/action.yml',
  'src/build-tools/config.ts',
  'tooling/ci/build.mjs',
  'docs/deployment/coverage-report.md',
  'src/distance.ts',
  'docs/reference/openapi.json.md',
];

/** Paths the allowlist skips: installed, built and generated files. */
const SKIPPED = [
  'node_modules/planted/canary.js',
  'packages/app/node_modules/x/index.js',
  'dist/src/server.js',
  'build/index.js',
  'coverage/lcov.info',
  '.env.example',
  'pnpm-lock.yaml',
  'docs/openapi.json',
  'docs/postman-collection.json',
];

/**
 * H-5: an allowlist path entry is a regular expression matched anywhere in the path, so an
 * unanchored `\.git` skipped every file under .github/ and `build` every path holding the word.
 * Every entry names whole path segments. The binary check runs where gitleaks is installed (the
 * pre-commit guard needs it on every machine); the PR CI canary plants the same key in CI.
 */
describe('.gitleaks.toml (the allowlist skips whole path segments only)', () => {
  it('reads the allowlist (parser sanity)', () => {
    expect(allowlistPaths.length).toBeGreaterThanOrEqual(4);
  });

  it('anchors every entry to a path segment', () => {
    for (const pattern of allowlistPaths) {
      expect(pattern, pattern).toMatch(/^(?:\^|\(\^\|\/\))/);
      expect(pattern, pattern).toMatch(/[/$]$/);
    }
  });

  const gitleaks = spawnSync('gitleaks', ['version'], { encoding: 'utf8' });
  it.skipIf(gitleaks.status !== 0)(
    'the gitleaks binary finds a key under .github/ and src/build-tools/, and skips one under node_modules/',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'gitleaks-canary-'));
      const reports = mkdtempSync(join(tmpdir(), 'gitleaks-report-'));
      try {
        // A random tail each run, so no fixed fake key sits in the repository.
        const tail = Array.from({ length: 32 }, () =>
          'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'.charAt(
            Math.floor(Math.random() * 56),
          ),
        ).join('');
        const line = `export const STRIPE_SECRET_KEY = "${['sk', 'live', tail].join('_')}";\n`;
        for (const file of [...SCANNED, ...SKIPPED]) {
          mkdirSync(join(root, file, '..'), { recursive: true });
          writeFileSync(join(root, file), line);
        }
        const report = join(reports, 'report.json');
        const scan = spawnSync(
          'gitleaks',
          [
            'detect',
            '--no-git',
            '--source',
            root,
            '--config',
            '.gitleaks.toml',
            '--redact',
            '--no-banner',
            '--exit-code',
            '0',
            '--report-format',
            'json',
            '--report-path',
            report,
          ],
          { encoding: 'utf8' },
        );
        expect(scan.status, scan.stderr).toBe(0);
        const files = (JSON.parse(readFileSync(report, 'utf8')) as { File: string }[])
          .map((finding) => finding.File.slice(root.length + 1))
          .sort();
        expect(files).toEqual([...SCANNED].sort());
      } finally {
        rmSync(root, { recursive: true, force: true });
        rmSync(reports, { recursive: true, force: true });
      }
    },
  );
});
