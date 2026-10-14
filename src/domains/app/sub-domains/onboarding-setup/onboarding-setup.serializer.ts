import type { OnboardingSetupOutput, OnboardingSetupStatus } from './onboarding-setup.types.js';

/** An optional time as the API speaks it (ISO 8601) or null. */
function isoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

/** Maps the worked-out {@link OnboardingSetupStatus} to the public Onboarding setup object (routes-final §2.A.6). */
export function serializeOnboardingSetup(status: OnboardingSetupStatus): OnboardingSetupOutput {
  const { progress, records } = status;
  return {
    answered_steps: progress.answered_steps,
    skipped_items: progress.skipped_items,
    main_branch_id: records.mainBranchPublicId,
    next_step: status.nextStep,
    live_checks: status.liveChecks,
    is_live: progress.completed_at !== null,
    has_someone_to_book: records.hasBookableMember,
    guide_items: status.guideItems.map((item) => ({
      key: item.key,
      is_done: item.isDone,
      is_skipped: item.isSkipped,
      can_skip: item.canSkip,
    })),
    guide_done_count: status.guideItems.filter((item) => item.isDone || item.isSkipped).length,
    guide_total_count: status.guideItems.length,
    deferred_at: isoOrNull(progress.deferred_at),
    completed_at: isoOrNull(progress.completed_at),
    guide_hidden_at: isoOrNull(progress.guide_hidden_at),
    guide_done_at: isoOrNull(progress.guide_done_at),
    completed_by_membership_id: progress.completed_by_membership_public_id,
    updated_at: progress.updated_at.toISOString(),
  };
}
