/** Types for slsa-provenance-predicate.mjs — the SLSA v1 predicate cosign attests (see that file). */

/** The SLSA v1 provenance predicate (https://slsa.dev/spec/v1.0/provenance). */
export interface ProvenancePredicate {
  readonly buildDefinition: {
    readonly buildType: string;
    readonly externalParameters: {
      readonly workflow: {
        readonly ref: string;
        readonly repository: string;
        readonly path: string;
      };
    };
    readonly internalParameters: {
      readonly github: {
        readonly event_name: string;
        readonly repository_id: string;
        readonly repository_owner_id: string;
      };
    };
    readonly resolvedDependencies: ReadonlyArray<{
      readonly uri: string;
      readonly digest: { readonly gitCommit: string };
    }>;
  };
  readonly runDetails: {
    readonly builder: { readonly id: string };
    readonly metadata: { readonly invocationId: string };
  };
}

/** The buildType GitHub's actions/attest-build-provenance writes. */
export const BUILD_TYPE: string;

/** The predicate for one workflow run; throws when a required variable is missing. */
export function provenancePredicate(
  environment: Readonly<Record<string, string | undefined>>,
): ProvenancePredicate;
