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

/**
 * Policy: the cleanup addresses the packages the build pushes, and a run is green only when it pruned.
 *
 * The build pushes `ghcr.io/<owner>/<repository>/<image>`, so GHCR names each package
 * `<repository>/<image>`, and the packages API files it under `/orgs/` for an organization owner and
 * `/users/` for a personal one. The cleanup called `/users/<owner>/packages/container/<image>` and got
 * 404 on every run from 09-27, because this repository's owner is an organization and the name had no
 * repository prefix. A delete that failed was also counted as deleted (`|| true`).
 */
describe('GHCR cleanup addresses the packages the build pushes', () => {
  it('names each package <repository>/<image>, the slash URL-encoded', () => {
    expect(workflow).toMatch(/\/packages\/container\/\$\{repository_name\}%2F\$\{PACKAGE\}/);
  });

  it('chooses /orgs/ or /users/ by the owner account type instead of assuming a user', () => {
    expect(workflow).toContain('.owner.type');
    expect(workflow).not.toMatch(/gh api "\/users\//);
  });

  it('fails the run when a delete fails instead of counting it as deleted', () => {
    expect(workflow).not.toMatch(/\/versions\/\$\{version_id\}" \|\| true/);
    expect(workflow).toContain('failed=$((failed + 1))');
  });

  it('offers a dry run that deletes nothing', () => {
    expect(workflow).toMatch(
      /dry_run:\n\s+description: .+\n\s+required: false\n\s+type: boolean\n\s+default: false/,
    );
  });
});

/**
 * Policy: an image's cosign signature and attestations are deleted only with the image.
 *
 * cosign stores them as a separate version tagged `sha256-<image digest>` (optionally `.sig`,
 * `.att`, `.sbom`), and `release-deploy.yml` runs `cosign verify` / `cosign verify-attestation`
 * before a production deploy. The first working dry run (10-30) listed the artifacts of `:current`,
 * `:previous`, `:latest` and every kept SHA image for deletion, because none of their tags matched
 * the protected pattern; a real run would have left those images unverifiable.
 */
describe('GHCR cleanup keeps the signature of every image it keeps', () => {
  const signaturePatternSource = workflow.match(/signature_regex='([^']+)'/)?.[1];
  const signaturePattern = new RegExp(signaturePatternSource ?? '$^');
  const digest = 'a'.repeat(64);

  it('declares a signature-artifact pattern', () => {
    expect(signaturePatternSource).toBeTruthy();
  });

  it.each([`sha256-${digest}`, `sha256-${digest}.sig`, `sha256-${digest}.att`])(
    'recognises %s as a signature artifact',
    (tags) => {
      expect(signaturePattern.test(tags)).toBe(true);
    },
  );

  it.each(['latest', 'c'.repeat(40), `sha256-${digest},latest`])(
    'does not treat %s as a signature artifact',
    (tags) => {
      expect(signaturePattern.test(tags)).toBe(false);
    },
  );

  it('deletes an artifact only when the image it signs was deleted in the same run', () => {
    expect(workflow).toContain('digest: .name');
    expect(workflow).toMatch(/if prune "\$version_id" "\$tags"; then\n\s+deleted_digests\+=/);
    expect(workflow).toMatch(
      /grep -qxF "sha256:\$\{subject_hex%%\.\*\}" <<< "\$\{deleted_digests\}"/,
    );
  });
});
