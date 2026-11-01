import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// H-12: every tool CI or a cloud session installs is a pinned version, and a downloaded binary is
// checked against a pinned SHA-256 (tooling/setup/agent/tool-versions.sh). A moving tag
// (`:latest`, `@latest`) or a package with no version installs whatever its registry serves that
// day, inside a job that may hold deploy secrets. clinozy-fe pins its own in
// tests/ci/pinned-installs.policy.test.ts.

/** Every file under `directory`, recursively. */
function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

/** Lines of `text` that are not comments, each with its line number. */
function codeLines(text: string): Array<{ line: string; number: number }> {
  return text
    .split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => !line.trimStart().startsWith('#'));
}

const ciFiles = [...listFiles('.github/workflows'), ...listFiles('.github/actions')].filter(
  (path) => /\.ya?ml$/.test(path),
);
const setupScripts = listFiles('tooling/setup/agent').filter((path) => path.endsWith('.sh'));
const pins = readFileSync('tooling/setup/agent/tool-versions.sh', 'utf8');

/** The pinned value of `key` in tool-versions.sh. */
function pin(key: string): string {
  return (
    pins
      .split('\n')
      .find((line) => line.startsWith(`${key}=`))
      ?.slice(key.length + 1) ?? ''
  );
}

/** A package runner (`npx`, `pnpm dlx`, …) and where it starts in a line. */
const RUNNER = /\b(?:npx|pnpx|bunx|pnpm dlx|yarn dlx)\b/;
/** True when `prefix`, the text before a runner, ends where a command starts: nothing, `run:`, `;`, `&&`, `|`, `$(`. */
function atCommandStart(prefix: string): boolean {
  const trimmed = prefix.trim();
  return ['', '-', 'run:', '- run:'].includes(trimmed) || /[;&|(]$/.test(trimmed);
}

/** The package a runner at `index` in `line` starts, its flags skipped. */
function runnerPackage(line: string, index: number): string {
  const words = line.slice(index).split(/\s+/);
  const afterRunner = words[0] === 'pnpm' || words[0] === 'yarn' ? 2 : 1;
  return words.slice(afterRunner).find((word) => !word.startsWith('-')) ?? '';
}

/**
 * True when a `:latest` on `line` publishes the tag rather than pulling it: this repository's
 * image build pushes its own `:latest` alias (reusable-docker-build-trivy.yml), and the GHCR
 * cleanup names the tags it keeps.
 */
const publishesLatestTag = (line: string) => /\bdocker (?:tag|push)\b|^\s*echo\b/.test(line);

/** Why one code line installs or runs an unpinned version, or `''` when it does not. */
function unpinnedInstall(line: string): string {
  if (/:latest\b/.test(line) && !publishesLatestTag(line)) return 'an image by its :latest tag';
  if (/@latest\b/.test(line)) return 'a package at @latest';
  const runner = RUNNER.exec(line);
  if (runner && atCommandStart(line.slice(0, runner.index))) {
    const spec = runnerPackage(line, runner.index);
    const version = spec.slice(spec.lastIndexOf('@') + 1);
    if (spec.lastIndexOf('@') <= 0 || !/^\d+\.\d+\.\d+$/.test(version)) {
      return `${spec} runs without an exact version`;
    }
  }
  // A `$variable` spec is checked where the variable is set (install-semgrep.sh: semgrep==<pin>);
  // `==${X_VERSION}` names a tool-versions.sh pin.
  const pip = /\bpip3? install (?:--\S+ )*["']?([^\s"']+)/.exec(line)?.[1] ?? '';
  if (pip && !pip.startsWith('$') && !/==(?:\d+\.\d+\.\d+|\$\{[A-Z_]+_VERSION\})$/.test(pip)) {
    return `pip installs ${pip} without ==version`;
  }
  // A global npm install runs its package's install scripts as well (H-2: `@railway/cli`).
  const npmGlobal = /\bnpm (?:install|i) (?:-g|--global)\b(?:\s+--?\S+)*\s+["']?([^\s"']+)/.exec(
    line,
  )?.[1];
  if (npmGlobal && !npmGlobal.startsWith('$') && !/.@\d+\.\d+\.\d+$/.test(npmGlobal)) {
    return `npm installs ${npmGlobal} globally without an exact version`;
  }
  if (/\bcurl\b[^|]*\|\s*(?:ba)?sh\b/.test(line)) return 'pipes a download into a shell';
  return '';
}

/**
 * Files exempt from the line check, with the reason. ensure-docker-daemon.sh is a byte-identical
 * copy of clinozy-fe's (src/tests/unit/ci/mirrored-files.policy.unit.test.ts): its probe image
 * (`hello-world:latest`, run only to see that the daemon can start a container) is pinned in both
 * repositories in one change.
 */
const LINE_CHECK_EXEMPT = new Map([
  ['tooling/setup/agent/ensure-docker-daemon.sh', 'mirrored from clinozy-fe; pinned together'],
]);

describe('pinned installs (H-12)', () => {
  it('finds the CI files and setup scripts (parser sanity)', () => {
    expect(ciFiles.length).toBeGreaterThan(10);
    expect(setupScripts.length).toBeGreaterThan(5);
  });

  it.each([
    ['image: x/y:latest', true],
    ['BACKEND_IMAGE: ghcr.io/a/b:latest', true],
    ['run: pnpm dlx @lhci/cli@0.15.x autorun', true],
    ['run: pnpm dlx @lhci/cli autorun', true],
    ['npx --yes netlify-cli deploy', true],
    ['npx --yes markdownlint-cli2@0.15.0 \\', false],
    ['run: pip install zizmor', true],
    ['run: pip install "zizmor==1.30.1"', false],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the shell variable, asserted verbatim
    ['run: pip install "semgrep==${SEMGREP_VERSION}"', false],
    ['curl -fsSL https://example.test/install.sh | sh', true],
    ['runs-on: ubuntu-latest', false],
    ['  for tool in node npm npx corepack pnpm pnpx; do', false],
    ['  value=$(npx --yes some-tool --flag)', true],
    ['            docker push "${API_IMAGE}:latest"', false],
    ['        run: npm install -g @railway/cli', true],
    ['  npm install -g "${package}" >&2 2>&1', false],
    ['npm install --global --ignore-scripts netlify-cli@27.13.0', false],
  ])('reads %s as unpinned: %s', (line, unpinned) => {
    expect(unpinnedInstall(line) !== '').toBe(unpinned);
  });

  it.each([...ciFiles, ...setupScripts].filter((file) => !LINE_CHECK_EXEMPT.has(file)))(
    '%s installs and runs pinned versions only',
    (file) => {
      const offences = codeLines(readFileSync(file, 'utf8'))
        .map(({ line, number }) => ({ number, why: unpinnedInstall(line) }))
        .filter(({ why }) => why !== '')
        .map(({ number, why }) => `${file}:${number} ${why}`);
      expect(offences).toEqual([]);
    },
  );

  it('checks every downloaded binary against a pinned SHA-256', () => {
    for (const [script, key] of [
      ['tooling/setup/agent/install-node.sh', 'NODE_SHA256_LINUX_'],
      ['tooling/setup/agent/install-gh.sh', 'GH_SHA256_LINUX_'],
      ['tooling/setup/agent/install-gitleaks.sh', 'GITLEAKS_SHA256_LINUX_'],
      ['tooling/setup/agent/install-k6.sh', 'K6_SHA256_LINUX_'],
      ['tooling/setup/agent/install-railway.sh', 'RAILWAY_SHA256_LINUX_'],
    ] as const) {
      const source = codeLines(readFileSync(script, 'utf8'))
        .map(({ line }) => line)
        .join('\n');
      expect(source, script).toContain('download_verified');
      expect(source, script).toContain(key);
      // Never the moving "latest release" (install-gh.sh resolved it, unverified).
      expect(source, script).not.toContain('releases/latest');
    }
    for (const key of [
      'NODE_SHA256_LINUX_X64',
      'NODE_SHA256_LINUX_ARM64',
      'GH_SHA256_LINUX_AMD64',
      'GH_SHA256_LINUX_ARM64',
    ]) {
      expect(pin(key), key).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('pins Node at .nvmrc, and gh at an exact version', () => {
    expect(pin('NODE_VERSION')).toBe(readFileSync('.nvmrc', 'utf8').trim());
    expect(pin('GH_VERSION')).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
