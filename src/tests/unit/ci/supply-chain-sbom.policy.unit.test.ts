import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function readWorkflow(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

describe('supply chain SBOM policy (#94 p3-sbom-syft)', () => {
  it('runs pnpm audit in ci:quality via deps:audit', () => {
    const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts['deps:audit']).toBe('pnpm audit');
    expect(packageJson.scripts['deps:audit:prod']).toBe('pnpm audit --prod');
    expect(packageJson.scripts['ci:quality']).toMatch(/pnpm deps:audit/);
  });

  it('runs dependency audit in the PR CI security-scan job', () => {
    const prCi = readWorkflow('.github/workflows/pr-ci.yml');
    expect(prCi).toContain('pnpm deps:audit');
    expect(prCi).toContain('pnpm deps:audit:prod');
  });

  it('generates CycloneDX SBOM post-merge and attaches it when release-please publishes', () => {
    const postMergeWorkflow = readWorkflow('.github/workflows/post-merge-ci.yml');
    expect(postMergeWorkflow).toMatch(/anchore\/sbom-action@[0-9a-f]{40}/);
    expect(postMergeWorkflow).toContain('cyclonedx-json');
    expect(postMergeWorkflow).toContain('sbom.cyclonedx.json');
    expect(postMergeWorkflow).toContain('release-sbom');
    expect(postMergeWorkflow).toMatch(/softprops\/action-gh-release@[0-9a-f]{40}/);
    expect(postMergeWorkflow).toContain('Release SBOM');
  });

  // GitHub stores artifact attestations for a private repository only on Enterprise Cloud; on
  // other plans every attest step fails the job. ARTIFACT_ATTESTATIONS=disabled skips them —
  // so every attest step must honour the switch, and a disabled run must say so.
  it('gates every attest step on ARTIFACT_ATTESTATIONS and warns when it is disabled', () => {
    for (const workflow of [
      '.github/workflows/post-merge-ci.yml',
      '.github/workflows/reusable-docker-build-trivy.yml',
    ]) {
      const text = readWorkflow(workflow);
      const attestSteps = text
        .split(/\n(?=\s+- name: )/)
        .filter((step) => step.includes('uses: actions/attest-'));
      expect(attestSteps.length, workflow).toBeGreaterThan(0);
      for (const step of attestSteps) {
        expect(step, `${workflow}: ${step.split('\n')[0]?.trim()}`).toContain(
          "vars.ARTIFACT_ATTESTATIONS != 'disabled'",
        );
      }
      expect(text, workflow).toContain("vars.ARTIFACT_ATTESTATIONS == 'disabled'");
      expect(text, workflow).toContain('title=Artifact attestations skipped');
    }
  });
});
