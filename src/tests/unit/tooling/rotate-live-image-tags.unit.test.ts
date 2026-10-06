import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Behaviour of `tooling/ci/rotate-live-image-tags.sh`, which the production deploy runs and
 * `rollback-deploy.yml` depends on: rollback redeploys `:previous`, so after every deploy
 * `:previous` must name the release BEFORE the live one. It used to name the just-deployed image,
 * so a rollback redeployed the release being rolled back.
 *
 * The real script runs against a fake `docker` that keeps a registry in a file — one
 * `<ref> <image id>` line per tag move, the last line for a ref winning.
 */
const SCRIPT = resolve('tooling/ci/rotate-live-image-tags.sh');

const FAKE_DOCKER = `#!/usr/bin/env bash
set -euo pipefail
lookup() { awk -v ref="$1" '$1 == ref { id = $2 } END { print id }' "$FAKE_REGISTRY"; }
resolve_id() { if [[ "$1" == sha256:* ]]; then echo "$1"; else lookup "$1"; fi; }
last="\${@: -1}"
case "$1" in
  pull) [ -n "$(lookup "$last")" ] ;;
  image) id="$(resolve_id "$last")"; [ -n "$id" ] && echo "$id" ;;
  tag) echo "$3 $(resolve_id "$2")" >> "$FAKE_REGISTRY" ;;
  push) echo "$last" >> "$FAKE_PUSHES" ;;
  *) echo "fake docker: unexpected $*" >&2; exit 64 ;;
esac
`;

const IMAGE = {
  previouslyLive: `sha256:${'a'.repeat(64)}`,
  deployed: `sha256:${'b'.repeat(64)}`,
  older: `sha256:${'c'.repeat(64)}`,
  workerLive: `sha256:${'d'.repeat(64)}`,
  workerDeployed: `sha256:${'e'.repeat(64)}`,
};

describe('rotate-live-image-tags.sh', () => {
  let workDirectory: string;

  beforeEach(() => {
    workDirectory = mkdtempSync(join(tmpdir(), 'rotate-live-image-tags-'));
    writeFileSync(join(workDirectory, 'docker'), FAKE_DOCKER);
    chmodSync(join(workDirectory, 'docker'), 0o755);
  });

  afterEach(() => {
    rmSync(workDirectory, { recursive: true, force: true });
  });

  /** Seeds the registry, runs the script on `images`, and returns the resulting tag → id map. */
  function rotate(registry: Record<string, string>, images: string[]) {
    const registryFile = join(workDirectory, 'registry');
    const pushesFile = join(workDirectory, 'pushes');
    writeFileSync(
      registryFile,
      Object.entries(registry)
        .map(([ref, id]) => `${ref} ${id}\n`)
        .join(''),
    );
    writeFileSync(pushesFile, '');
    const result = spawnSync('bash', [SCRIPT, ...images], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${workDirectory}:${process.env.PATH ?? ''}`,
        FAKE_REGISTRY: registryFile,
        FAKE_PUSHES: pushesFile,
      },
    });
    const tags = new Map<string, string>();
    for (const line of readFileSync(registryFile, 'utf8').split('\n').filter(Boolean)) {
      const [ref, id] = line.split(' ');
      tags.set(ref!, id!);
    }
    const pushes = readFileSync(pushesFile, 'utf8').split('\n').filter(Boolean);
    return { status: result.status, stderr: result.stderr, tags, pushes };
  }

  it('after a deploy, :previous is the image that was live and :current the deployed one', () => {
    const { status, tags, pushes } = rotate(
      {
        'registry/api:current': IMAGE.previouslyLive,
        'registry/api:previous': IMAGE.older,
        'registry/api:sha-new': IMAGE.deployed,
      },
      ['registry/api:sha-new'],
    );
    expect(status).toBe(0);
    expect(tags.get('registry/api:previous')).toBe(IMAGE.previouslyLive);
    expect(tags.get('registry/api:current')).toBe(IMAGE.deployed);
    expect(pushes).toEqual(['registry/api:previous', 'registry/api:current']);
  });

  it('redeploying the live image leaves :previous alone', () => {
    const { status, tags } = rotate(
      {
        'registry/api:current': IMAGE.deployed,
        'registry/api:previous': IMAGE.previouslyLive,
        'registry/api:sha-new': IMAGE.deployed,
      },
      ['registry/api:sha-new'],
    );
    expect(status).toBe(0);
    expect(tags.get('registry/api:previous')).toBe(IMAGE.previouslyLive);
    expect(tags.get('registry/api:current')).toBe(IMAGE.deployed);
  });

  it('the first run, with no :current yet, keeps the existing :previous', () => {
    const { status, tags } = rotate(
      { 'registry/api:previous': IMAGE.older, 'registry/api:sha-new': IMAGE.deployed },
      ['registry/api:sha-new'],
    );
    expect(status).toBe(0);
    expect(tags.get('registry/api:previous')).toBe(IMAGE.older);
    expect(tags.get('registry/api:current')).toBe(IMAGE.deployed);
  });

  it('a rollback that deploys :previous itself pins it by id before any tag moves', () => {
    // rollback-deploy.yml deploys the :previous tag, which this same run reassigns.
    const { status, tags } = rotate(
      {
        'registry/api:current': IMAGE.deployed,
        'registry/api:previous': IMAGE.previouslyLive,
      },
      ['registry/api:previous'],
    );
    expect(status).toBe(0);
    expect(tags.get('registry/api:current')).toBe(IMAGE.previouslyLive);
    expect(tags.get('registry/api:previous')).toBe(IMAGE.deployed);
  });

  it('rotates every image it is given independently (API and worker)', () => {
    const { status, tags } = rotate(
      {
        'registry/api:current': IMAGE.previouslyLive,
        'registry/api:sha-new': IMAGE.deployed,
        'registry/worker:current': IMAGE.workerLive,
        'registry/worker:sha-new': IMAGE.workerDeployed,
      },
      ['registry/api:sha-new', 'registry/worker:sha-new'],
    );
    expect(status).toBe(0);
    expect(tags.get('registry/api:previous')).toBe(IMAGE.previouslyLive);
    expect(tags.get('registry/api:current')).toBe(IMAGE.deployed);
    expect(tags.get('registry/worker:previous')).toBe(IMAGE.workerLive);
    expect(tags.get('registry/worker:current')).toBe(IMAGE.workerDeployed);
  });

  it('refuses to run without an image', () => {
    const { status, stderr, tags } = rotate({}, []);
    expect(status).toBe(2);
    expect(stderr).toContain('usage:');
    expect(tags.size).toBe(0);
  });
});
