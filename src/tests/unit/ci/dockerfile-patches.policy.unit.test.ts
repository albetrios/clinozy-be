import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Policy: every Docker build stage that runs `pnpm install` copies `patches/` in first.
 *
 * pnpm applies the `patchedDependencies` listed in `pnpm-workspace.yaml` during install and fails
 * when a patch file is missing — adding the Stryker vitest-runner patch broke both image builds
 * (`ERR_PNPM_PATCH_NOT_FOUND`) until the Dockerfiles copied `patches/`. Every `Dockerfile*` at the
 * repository root is checked, so a new image cannot miss it either.
 */
const DOCKERFILES = readdirSync('.').filter((name) => /^Dockerfile(\..+)?$/.test(name));

/** Splits a Dockerfile into build stages, each starting at its `FROM` line. */
function buildStages(dockerfile: string): string[][] {
  const stages: string[][] = [];
  for (const line of dockerfile.split('\n')) {
    if (/^FROM\s/i.test(line)) stages.push([]);
    stages.at(-1)?.push(line);
  }
  return stages;
}

describe('Dockerfiles copy patches/ before pnpm install', () => {
  it('finds the Dockerfiles to check', () => {
    expect(DOCKERFILES).toEqual(expect.arrayContaining(['Dockerfile', 'Dockerfile.worker']));
  });

  it.each(DOCKERFILES)('%s: each installing stage has patches/ before the install', (path) => {
    const installingStages = buildStages(readFileSync(path, 'utf8')).filter((stage) =>
      stage.some((line) => /^RUN\b.*\bpnpm install\b/.test(line)),
    );
    expect(installingStages.length).toBeGreaterThan(0);
    for (const stage of installingStages) {
      const installAt = stage.findIndex((line) => /^RUN\b.*\bpnpm install\b/.test(line));
      const copyAt = stage.findIndex((line) => /^COPY\b.*\bpatches\b/.test(line));
      const copiedFirst = copyAt >= 0 && copyAt < installAt;
      expect(copiedFirst, `${path}: "${stage[0]}" installs without copying patches/ first`).toBe(
        true,
      );
    }
  });
});
