/**
 * SLSA v1 build provenance predicate for `cosign attest --type slsaprovenance1`.
 *
 * GitHub's own artifact attestations need GitHub Enterprise Cloud on a private repository, so
 * the images also carry cosign attestations stored next to them in GHCR, which work on any plan:
 * the CycloneDX SBOM and this provenance. The predicate follows the buildType GitHub's
 * actions/attest-build-provenance writes (github-actions-buildtypes/workflow/v1), built from the
 * workflow run's own environment, so `cosign verify-attestation --type slsaprovenance1` before the
 * production deploy proves which workflow run, at which commit, built the image.
 *
 * Environment (set by GitHub Actions): GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_REF,
 * GITHUB_WORKFLOW_REF, GITHUB_EVENT_NAME, GITHUB_REPOSITORY_ID, GITHUB_REPOSITORY_OWNER_ID,
 * GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, plus SOURCE_COMMIT (the commit the image was built from).
 *
 * Usage: `node tooling/ci/slsa-provenance-predicate.mjs > provenance.slsa.json`.
 */

import { pathToFileURL } from 'node:url';

export const BUILD_TYPE = 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1';

/** The predicate for one workflow run; throws when a required variable is missing. */
export function provenancePredicate(environment) {
  const required = [
    'GITHUB_SERVER_URL',
    'GITHUB_REPOSITORY',
    'GITHUB_REF',
    'GITHUB_WORKFLOW_REF',
    'GITHUB_RUN_ID',
    'GITHUB_RUN_ATTEMPT',
    'SOURCE_COMMIT',
  ];
  const missing = required.filter((name) => !environment[name]);
  if (missing.length > 0) throw new Error(`missing ${missing.join(', ')}`);
  const server = environment.GITHUB_SERVER_URL;
  const repository = environment.GITHUB_REPOSITORY;
  // GITHUB_WORKFLOW_REF is `<owner>/<repo>/<path>@<ref>`; the path is what ran.
  const workflowPath = environment.GITHUB_WORKFLOW_REF.replace(`${repository}/`, '').replace(
    /@.*$/,
    '',
  );
  return {
    buildDefinition: {
      buildType: BUILD_TYPE,
      externalParameters: {
        workflow: {
          ref: environment.GITHUB_REF,
          repository: `${server}/${repository}`,
          path: workflowPath,
        },
      },
      internalParameters: {
        github: {
          event_name: environment.GITHUB_EVENT_NAME ?? '',
          repository_id: environment.GITHUB_REPOSITORY_ID ?? '',
          repository_owner_id: environment.GITHUB_REPOSITORY_OWNER_ID ?? '',
        },
      },
      resolvedDependencies: [
        {
          uri: `git+${server}/${repository}@${environment.GITHUB_REF}`,
          digest: { gitCommit: environment.SOURCE_COMMIT },
        },
      ],
    },
    runDetails: {
      builder: { id: `${server}/${environment.GITHUB_WORKFLOW_REF}` },
      metadata: {
        invocationId: `${server}/${repository}/actions/runs/${environment.GITHUB_RUN_ID}/attempts/${environment.GITHUB_RUN_ATTEMPT}`,
      },
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(provenancePredicate(process.env), null, 2)}\n`);
}
