import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const imageWorkflow = readFileSync('.github/workflows/reusable-docker-build-trivy.yml', 'utf8');
const postMergeWorkflow = readFileSync('.github/workflows/post-merge-ci.yml', 'utf8');

/** The `run:` script of the step whose `id:` is `patch_epoch`. */
function epochStep(): string {
  return imageWorkflow.match(/ {8}id: patch_epoch\n([\s\S]*?)\n {6}- name:/)?.[1] ?? '';
}

/**
 * Policy: the image's apk upgrade layer is rebuilt once per UTC day, not on every build, and
 * Trivy still scans every build. A run id as the epoch rebuilt that layer (and every layer after
 * it) on each push; a fixed value would never pick up a patch again (issue #1119).
 */
describe('Docker security patch epoch', () => {
  it('derives the epoch from the UTC day, or from the run id when fresh_security_patches is set', () => {
    const step = epochStep();
    expect(step).not.toBe('');
    expect(step).toContain('date -u +%Y-%m-%d');
    expect(step).toContain(`if [ "\${FRESH}" = "true" ]`);
    expect(step).toContain(`epoch="run-\${RUN_ID}"`);
    expect(step).toContain(`echo "epoch=\${epoch}" >> "$GITHUB_OUTPUT"`);
  });

  it('passes the epoch step output to both image builds, never the run id directly', () => {
    const buildArgs = imageWorkflow.match(/SECURITY_PATCH_EPOCH=.*/g) ?? [];
    expect(buildArgs).toEqual([
      `SECURITY_PATCH_EPOCH=\${{ steps.patch_epoch.outputs.epoch }}`,
      `SECURITY_PATCH_EPOCH=\${{ steps.patch_epoch.outputs.epoch }}`,
    ]);
  });

  it('offers fresh_security_patches on the reusable workflow and the post-merge dispatch', () => {
    expect(imageWorkflow.match(/^ {6}fresh_security_patches:$/gm)).toHaveLength(2);
    expect(postMergeWorkflow).toMatch(/^ {6}fresh_security_patches:$/m);
    expect(postMergeWorkflow).toContain(
      `fresh_security_patches: \${{ inputs.fresh_security_patches == true }}`,
    );
  });

  it('keeps Trivy failing the build and points a failure at the fresh epoch', () => {
    expect(imageWorkflow.match(/exit-code: 1/g)?.length).toBeGreaterThanOrEqual(2);
    expect(imageWorkflow).toMatch(
      /- name: Point at a fresh patch epoch when Trivy fails\n {8}if: failure\(\)/,
    );
  });
});
