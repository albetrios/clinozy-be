import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stepsFor } from '@tooling/validate/gates.js';

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
    expect(stepsFor('quality').map((step) => step.command.join(' '))).toContain(
      'pnpm deps:audit:prod',
    );
  });

  it('runs dependency audit in the PR CI security-scan job', () => {
    const prCi = readWorkflow('.github/workflows/pr-ci.yml');
    expect(prCi).toContain('pnpm deps:audit');
    expect(prCi).toContain('pnpm deps:audit:prod');
  });

  it('gates on the production tree first; the full tree is report-only', () => {
    // A dev-only advisory with no published fix must not wedge every PR, and must never
    // again SKIP the production audit by failing before it (same policy as clinozy-fe).
    const prCi = readWorkflow('.github/workflows/pr-ci.yml');
    const production = prCi.indexOf('- name: Production dependency audit');
    const fullTree = prCi.indexOf('- name: Dependency audit (all deps, advisory)');
    expect(production).toBeGreaterThan(-1);
    expect(fullTree).toBeGreaterThan(production);
    const productionStep = prCi.slice(production, fullTree);
    expect(productionStep).toContain('run: pnpm deps:audit:prod');
    expect(productionStep).not.toContain('continue-on-error');
    const fullTreeStep = prCi.slice(fullTree, prCi.indexOf('\n\n', fullTree));
    expect(fullTreeStep).toContain('continue-on-error: true');
    expect(fullTreeStep).toContain('run: pnpm deps:audit');

    expect(
      stepsFor('quality')
        .map((step) => step.command.join(' '))
        .slice(0, 2),
    ).toEqual(['pnpm deps:audit:prod', 'pnpm deps:audit:report']);
  });

  it('accepts an advisory only with its reason, and only when no fix exists', () => {
    const workspace = readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf8');
    const block = workspace.slice(
      workspace.indexOf('auditConfig:'),
      workspace.indexOf('overrides:'),
    );
    const ignored = [...block.matchAll(/^\s+- (GHSA-[a-z0-9-]+)$/gm)].map((match) => match[1]);
    expect(ignored).toEqual(['GHSA-vfj7-8cjw-p6xm']);
    // Every waiver carries its path and its removal condition right above it.
    expect(block).toContain('No patched release');
    expect(block).toContain('Remove when braces publishes a fix');
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
