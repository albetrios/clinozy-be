import { readFileSync } from 'node:fs';
import { BUILD_TYPE, provenancePredicate } from '@tooling/ci/slsa-provenance-predicate.mjs';
import { describe, expect, it } from 'vitest';

const imageWorkflow = readFileSync('.github/workflows/reusable-docker-build-trivy.yml', 'utf8');
const releaseDeploy = readFileSync('.github/workflows/release-deploy.yml', 'utf8');

const runEnvironment = {
  GITHUB_SERVER_URL: 'https://github.com',
  GITHUB_REPOSITORY: 'owner/repository',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_WORKFLOW_REF: 'owner/repository/.github/workflows/post-merge-ci.yml@refs/heads/main',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_REPOSITORY_ID: '1',
  GITHUB_REPOSITORY_OWNER_ID: '2',
  GITHUB_RUN_ID: '42',
  GITHUB_RUN_ATTEMPT: '1',
  SOURCE_COMMIT: 'a'.repeat(40),
};

/**
 * Locks in signed SBOMs and provenance that work on a private repository on any plan: cosign
 * attests both onto each image, and production deploys only what verifies.
 */
describe('supply-chain attestations', () => {
  it('builds an SLSA v1 predicate that names the run and the source commit', () => {
    const predicate = provenancePredicate(runEnvironment);
    expect(predicate.buildDefinition.buildType).toBe(BUILD_TYPE);
    expect(predicate.buildDefinition.externalParameters.workflow).toEqual({
      ref: 'refs/heads/main',
      repository: 'https://github.com/owner/repository',
      path: '.github/workflows/post-merge-ci.yml',
    });
    expect(predicate.buildDefinition.resolvedDependencies[0]?.digest.gitCommit).toBe(
      'a'.repeat(40),
    );
    expect(predicate.runDetails.metadata.invocationId).toBe(
      'https://github.com/owner/repository/actions/runs/42/attempts/1',
    );
  });

  it('refuses to build a predicate without the run it describes', () => {
    const { SOURCE_COMMIT: _omitted, ...withoutCommit } = runEnvironment;
    expect(() => provenancePredicate(withoutCommit)).toThrow('SOURCE_COMMIT');
  });

  it('attests a CycloneDX SBOM and the provenance onto both images by digest', () => {
    for (const image of ['API', 'WORKER']) {
      for (const type of ['cyclonedx', 'slsaprovenance1']) {
        expect(imageWorkflow).toMatch(
          new RegExp(
            `cosign attest --yes --type ${type} --predicate \\S+ "\\$\\{${image}_IMAGE_DIGEST_REF\\}"`,
          ),
        );
      }
    }
    expect(imageWorkflow).toContain('format: cyclonedx-json');
  });

  it('verifies the signature and both attestations before the production deploy', () => {
    const verify = releaseDeploy.slice(
      releaseDeploy.indexOf('\n  verify-supply-chain:'),
      releaseDeploy.indexOf('\n  deploy:'),
    );
    expect(verify).toContain('cosign verify --certificate-identity-regexp');
    expect(verify).toContain('for type in cyclonedx slsaprovenance1; do');
    expect(verify).toContain(
      '--certificate-oidc-issuer https://token.actions.githubusercontent.com',
    );
    const deploy = releaseDeploy.slice(releaseDeploy.indexOf('\n  deploy:'));
    expect(deploy).toContain(
      'needs: [resolve, build-if-missing, docs, verify-supply-chain, probe-development-api]',
    );
    expect(deploy).toContain("needs.verify-supply-chain.result == 'success'");
  });
});
