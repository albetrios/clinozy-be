import type { OrganizationSetupProgress } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.types.js';
import type {
  OnboardingSetupGuideItem,
  OnboardingSetupLiveCheck,
  OnboardingSetupStep,
} from './onboarding-setup.constants.js';

/** What the setup reads from the clinic's records on every read (routes-final §2.A.10). */
export interface OnboardingSetupRecords {
  /** The active main branch's public id, or null. */
  mainBranchPublicId: string | null;
  /** Active services, counted up to the guide's threshold. */
  activeServiceCount: number;
  /** Any live appointment, any status. */
  hasAppointment: boolean;
  /** Someone besides the owner, invited or active. */
  hasTeammate: boolean;
  /** An active member holds Doctor or Therapist (main or extra role). */
  hasBookableMember: boolean;
}

/** The setup worked out from the stored progress and the records. */
export interface OnboardingSetupStatus {
  progress: OrganizationSetupProgress;
  records: OnboardingSetupRecords;
  liveChecks: Record<OnboardingSetupLiveCheck, boolean>;
  nextStep: OnboardingSetupStep | null;
  guideItems: {
    key: OnboardingSetupGuideItem;
    isDone: boolean;
    isSkipped: boolean;
    canSkip: boolean;
  }[];
}

/** One guide item as the API returns it. */
export interface OnboardingSetupGuideItemOutput {
  key: OnboardingSetupGuideItem;
  is_done: boolean;
  is_skipped: boolean;
  can_skip: boolean;
}

/** The Onboarding setup object (routes-final §2.A.6) — routes 1, 2 and 3. */
export interface OnboardingSetupOutput {
  answered_steps: string[];
  skipped_items: string[];
  main_branch_id: string | null;
  next_step: OnboardingSetupStep | null;
  live_checks: Record<OnboardingSetupLiveCheck, boolean>;
  is_live: boolean;
  has_someone_to_book: boolean;
  guide_items: OnboardingSetupGuideItemOutput[];
  guide_done_count: number;
  guide_total_count: number;
  deferred_at: string | null;
  completed_at: string | null;
  guide_hidden_at: string | null;
  guide_done_at: string | null;
  completed_by_membership_id: string | null;
  updated_at: string;
}
