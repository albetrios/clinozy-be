import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Policy: the dependency patches in `pnpm-workspace.yaml` are installed, pinned, and still carry
 * their fixes — so a dependency bump, a re-cut patch or a dropped entry cannot quietly bring a
 * fixed defect back.
 *
 * The one that guards the test harness: `@mswjs/interceptors@0.44.0` (nock 15) — loopback sockets
 * must reach Node.js as-is, or a refused Postgres or Redis connection is reported as established.
 * Behaviour: `harness-network-isolation.unit.test.ts`.
 *
 * This suite needs no database, so it runs in the fast lane on every pre-commit, pre-push and PR.
 */

const ROOT = process.cwd();
const workspace = readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf8');
const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};
const directDependencies: Record<string, string> = {
  ...packageJson.dependencies,
  ...packageJson.devDependencies,
  ...packageJson.optionalDependencies,
};

/** `name@version: patches/file.patch` lines of the `patchedDependencies:` block. */
const patchedDependencies = [
  ...(workspace.split(/^patchedDependencies:\s*$/m)[1] ?? '').matchAll(
    /^\s+'?((?:@[^/\s]+\/)?[^@\s']+)@([\d.]+)'?:\s*(patches\/\S+\.patch)\s*$/gm,
  ),
].map(([, name, version, patchPath]) => ({
  name: name as string,
  version: version as string,
  patchPath: patchPath as string,
}));

/**
 * The installed copy of `name` that resolution actually uses: the real path behind
 * `node_modules/<name>` for a direct dependency, else the sibling of a direct dependency that
 * depends on it (pnpm places a package's dependencies next to it).
 */
function installedPackageDirectory(name: string): string | undefined {
  const direct = join(ROOT, 'node_modules', name);
  if (existsSync(direct)) return realpathSync(direct);
  for (const parent of Object.keys(directDependencies)) {
    const parentDirectory = join(ROOT, 'node_modules', parent);
    if (!existsSync(parentDirectory)) continue;
    const sibling = join(realpathSync(parentDirectory), '..', ...name.split('/'));
    if (existsSync(sibling)) return realpathSync(sibling);
  }
  return undefined;
}

function installedFile(directory: string, relativePath: string): string {
  return readFileSync(join(directory, relativePath), 'utf8');
}

describe('patched dependencies', () => {
  it('finds the patch entries, the interceptors one included', () => {
    const names = patchedDependencies.map((entry) => entry.name);
    expect(names).toEqual(expect.arrayContaining(['@mswjs/interceptors']));
  });

  it.each(patchedDependencies)(
    '$name@$version: patch file present, installed at that version, patched copy in use',
    ({ name, version, patchPath }) => {
      expect(existsSync(join(ROOT, patchPath)), `${patchPath} exists`).toBe(true);
      const directory = installedPackageDirectory(name);
      expect(directory, `${name} is installed`).toBeDefined();
      const installed = JSON.parse(installedFile(directory as string, 'package.json')) as {
        version: string;
      };
      expect(installed.version, `${name} installed at the patched version`).toBe(version);
      expect(directory, `${name} resolves to the patched copy`).toContain('_patch_hash=');
      // A version-keyed patch only applies to that exact version: a range would let an install
      // move past it.
      if (name in directDependencies) {
        expect(directDependencies[name], `${name} pinned exactly in package.json`).toBe(version);
      }
    },
  );

  it('@mswjs/interceptors: loopback sockets bypass interception', () => {
    const directory = installedPackageDirectory('@mswjs/interceptors') as string;
    const netBuild = readdirSync(join(directory, 'lib/node')).find((file) =>
      /^net-.*\.js$/.test(file),
    );
    expect(netBuild, 'the socket interceptor build').toBeDefined();
    const source = installedFile(directory, `lib/node/${netBuild}`);
    expect(source).toContain('if (isLocalConnection(transportConnectionOptions))');
  });

  it.each(['pr-ci.yml', 'post-merge-ci.yml'])(
    '%s: a change to a patch or its registration runs the full test matrix and the image build',
    (workflow) => {
      const source = readFileSync(join(ROOT, '.github/workflows', workflow), 'utf8');
      for (const filter of ['src-code', 'docker']) {
        const paths =
          source
            .split(new RegExp(`^\\s+${filter}:\\s*$`, 'm'))[1]
            ?.split(/^\s+\w[\w-]*:\s*$/m)[0] ?? '';
        for (const path of ["'pnpm-workspace.yaml'", "'patches/**'", "'pnpm-lock.yaml'"]) {
          expect(paths, `${filter} filter lists ${path}`).toContain(path);
        }
      }
    },
  );
});
