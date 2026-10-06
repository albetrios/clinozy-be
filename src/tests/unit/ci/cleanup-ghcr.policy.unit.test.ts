import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Policy: the weekly GHCR cleanup never prunes an image a deploy or a rollback still reads.
 *
 * `tooling/ci/rotate-live-image-tags.sh` reads `:current` (the live image) on every production
 * deploy, and `rollback-deploy.yml` deploys `:previous`. `:current` is not always the newest build —
 * after a rollback, or a production deploy of an older SHA — so retention by SHA count alone could
 * prune it; the next rotation would then find no `:current` and leave `:previous` stale.
 *
 * The workflow matches its pattern against an image's tags joined with ",".
 */
const workflow = readFileSync('.github/workflows/cleanup-ghcr.yml', 'utf8');
const protectedPatternSource = workflow.match(/protected_regex='([^']+)'/)?.[1];

describe('GHCR cleanup protects every tag a deploy or rollback reads', () => {
  it('declares a protected-tag pattern', () => {
    expect(protectedPatternSource).toBeTruthy();
  });

  const protectedPattern = new RegExp(protectedPatternSource ?? '$^');

  it.each([
    'latest',
    'current',
    'previous',
    'v1.4.0',
    'v1.4.0-rc.1',
    'deploy-failed-2026-10-06',
    'sha-abc1234,current',
    'current,sha-abc1234',
  ])('keeps an image tagged %s', (tags) => {
    expect(protectedPattern.test(tags)).toBe(true);
  });

  it.each(['sha-abc1234', 'currently', 'previous-build', 'sha-abc1234,sha-def5678'])(
    'may prune an image tagged %s',
    (tags) => {
      expect(protectedPattern.test(tags)).toBe(false);
    },
  );
});
