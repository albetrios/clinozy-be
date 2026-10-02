import { describe, expect, it } from 'vitest';

import {
  type DesiredEnvironment,
  type RemoteEnvironment,
  buildEnvironmentPutBody,
  diffEnvironment,
  isRequiredReviewersPlanError,
  requiredReviewersSupport,
} from '@tooling/setup/github/sync-environment-protection.js';

/**
 * Guards the pure drift diff that drives `pnpm github:sync`'s environment
 * protection reconciliation — the mechanism that keeps `.github/environments/*.json`
 * (source of truth) applied to GitHub so the production deploy-branch-policy
 * drift (issues #924 / #877) self-heals instead of recurring.
 */
describe('diffEnvironment (github:sync environment protection)', () => {
  const reviewer = { type: 'User', id: 40_333_875 } as const;

  const desiredProduction: DesiredEnvironment = {
    reviewers: [reviewer],
    preventSelfReview: false,
    deploymentBranchPolicy: { protected_branches: false, custom_branch_policies: true },
    customBranches: [
      { name: 'main', type: 'branch' },
      { name: 'v*', type: 'tag' },
    ],
  };

  const remoteInSync: RemoteEnvironment = {
    exists: true,
    reviewers: [reviewer],
    preventSelfReview: false,
    deploymentBranchPolicy: { protected_branches: false, custom_branch_policies: true },
    customBranches: [
      { name: 'main', type: 'branch' },
      { name: 'v*', type: 'tag' },
    ],
  };

  it('reports no drift when config and remote match', () => {
    expect(diffEnvironment(desiredProduction, remoteInSync)).toEqual([]);
  });

  it('flags a missing environment', () => {
    const missing: RemoteEnvironment = { ...remoteInSync, exists: false };
    expect(diffEnvironment(desiredProduction, missing)).toEqual(['missing on remote']);
  });

  it('detects the production deploy-branch-policy drift (#924 / #877)', () => {
    // Exactly the drifted UI state: protected-branches only, no custom policies.
    const drifted: RemoteEnvironment = {
      exists: true,
      reviewers: [reviewer],
      preventSelfReview: false,
      deploymentBranchPolicy: { protected_branches: true, custom_branch_policies: false },
      customBranches: [],
    };
    const issues = diffEnvironment(desiredProduction, drifted);
    expect(issues).toContain('deploymentBranchPolicy.protectedBranches: config=false github=true');
    expect(issues).toContain(
      'deploymentBranchPolicy.customBranchPolicies: config=true github=false',
    );
    expect(issues).toContain('customBranch missing on github: branch:main');
    expect(issues).toContain('customBranch missing on github: tag:v*');
  });

  it('flags an unexpected custom branch present only on github', () => {
    const extra: RemoteEnvironment = {
      ...remoteInSync,
      customBranches: [
        { name: 'main', type: 'branch' },
        { name: 'v*', type: 'tag' },
        { name: 'hotfix/*', type: 'branch' },
      ],
    };
    expect(diffEnvironment(desiredProduction, extra)).toContain(
      'customBranch unexpected on github: branch:hotfix/*',
    );
  });

  it('flags reviewer and preventSelfReview drift', () => {
    const drifted: RemoteEnvironment = {
      ...remoteInSync,
      reviewers: [{ type: 'User', id: 999 }],
      preventSelfReview: true,
    };
    const issues = diffEnvironment(desiredProduction, drifted);
    expect(issues.some((issue) => issue.startsWith('requiredReviewers:'))).toBe(true);
    expect(issues).toContain('preventSelfReview: config=false github=true');
  });

  it('treats a null remote policy as protected=false/custom=false (all branches)', () => {
    const desiredEmpty: DesiredEnvironment = {
      reviewers: [],
      preventSelfReview: false,
      deploymentBranchPolicy: null,
      customBranches: [],
    };
    const remoteEmpty: RemoteEnvironment = {
      exists: true,
      reviewers: [],
      preventSelfReview: false,
      deploymentBranchPolicy: null,
      customBranches: [],
    };
    expect(diffEnvironment(desiredEmpty, remoteEmpty)).toEqual([]);
  });
});

/**
 * GitHub enforces required reviewers on a private repository's environments only on Enterprise —
 * on Team the PUT fails with HTTP 422 and used to abort the whole `github:sync` before any value
 * was pushed. These pin when the sync skips the reviewers instead of failing.
 */
describe('required reviewers plan support (github:sync environment protection)', () => {
  it('supports them on a public repository, whatever the plan', () => {
    expect(
      requiredReviewersSupport({ isPrivate: false, ownerType: 'Organization', ownerPlan: 'free' }),
    ).toBe('supported');
  });

  it('supports them on a private repository only on Enterprise', () => {
    expect(
      requiredReviewersSupport({
        isPrivate: true,
        ownerType: 'Organization',
        ownerPlan: 'enterprise',
      }),
    ).toBe('supported');
    expect(
      requiredReviewersSupport({ isPrivate: true, ownerType: 'Organization', ownerPlan: 'team' }),
    ).toBe('unsupported');
    expect(requiredReviewersSupport({ isPrivate: true, ownerType: 'User' })).toBe('unsupported');
  });

  it("is unknown when the token can't read the organization's plan", () => {
    expect(requiredReviewersSupport({ isPrivate: true, ownerType: 'Organization' })).toBe(
      'unknown',
    );
  });

  it("recognises GitHub's plan error and nothing else", () => {
    expect(
      isRequiredReviewersPlanError(
        'gh: Failed to create the environment protection rule. Please ensure the billing plan supports the required reviewers protection rule. (HTTP 422)',
      ),
    ).toBe(true);
    expect(isRequiredReviewersPlanError('gh: Validation Failed (HTTP 422)')).toBe(false);
  });

  it('leaves reviewers out of a branch-policy-only PUT, since GitHub rejects even [] on this plan', () => {
    const branchPolicyOnly: DesiredEnvironment = {
      reviewers: [],
      preventSelfReview: false,
      deploymentBranchPolicy: { protected_branches: true, custom_branch_policies: false },
      customBranches: [],
    };
    expect(buildEnvironmentPutBody(branchPolicyOnly, false)).toEqual({
      deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
    });
    // Reviewers that GitHub still has are cleared explicitly.
    expect(buildEnvironmentPutBody(branchPolicyOnly, true)).toMatchObject({ reviewers: [] });
    expect(
      buildEnvironmentPutBody({ ...branchPolicyOnly, reviewers: [{ type: 'User', id: 7 }] }, false),
    ).toEqual({
      deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
      reviewers: [{ type: 'User', id: 7 }],
      prevent_self_review: false,
    });
  });
});
