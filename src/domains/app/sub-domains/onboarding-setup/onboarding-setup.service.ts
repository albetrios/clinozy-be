import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { MembershipService } from '@/domains/tenancy/sub-domains/membership/membership.service.js';
import type { OrganizationSettingsService } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.service.js';
import type { OrganizationSetupProgress } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.types.js';
import {
  assertTeamOrganization,
  isPersonalOrganization,
} from '@/domains/tenancy/sub-domains/organization/organization-capability.js';
import {
  type OrganizationPrincipalDatabaseScope,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { ConflictError, NotFoundError } from '@/shared/errors/index.js';
import { assertRecordNotChangedSince } from '@/shared/utils/validation/record-fields.util.js';
import { APP_BOOKABLE_ROLE_NAMES } from '@/domains/app/app-role-presets.js';
import type { BranchesRepository } from '@/domains/app/sub-domains/branches/branches.repository.js';
import type { OfferingsRepository } from '@/domains/app/sub-domains/offerings/offerings.repository.js';
import type { AppointmentsRepository } from '@/domains/app/sub-domains/appointments/appointments.repository.js';
import {
  ONBOARDING_SETUP_GUIDE_ITEM_VALUES,
  ONBOARDING_SETUP_LIVE_CHECK_VALUES,
  ONBOARDING_SETUP_STEP,
  ONBOARDING_SETUP_TREATMENTS_DONE_AT,
  type OnboardingSetupGuideItem,
  type OnboardingSetupLiveCheck,
  type OnboardingSetupStep,
} from './onboarding-setup.constants.js';
import { validateChangeOnboardingSetup } from './onboarding-setup.validator.js';
import { serializeOnboardingSetup } from './onboarding-setup.serializer.js';
import type {
  OnboardingSetupOutput,
  OnboardingSetupRecords,
  OnboardingSetupStatus,
} from './onboarding-setup.types.js';

/** The guide items a manager may skip (the first appointment cannot be). */
const SKIPPABLE_GUIDE_ITEMS: ReadonlySet<OnboardingSetupGuideItem> = new Set([
  'treatments',
  'invite_team',
]);

/**
 * Works out the setup from the stored progress and the clinic's records (routes-final §2.A.10):
 * the three live checks, the next step in the drawer's order, and the three guide items.
 */
function composeStatus(options: {
  progress: OrganizationSetupProgress;
  records: OnboardingSetupRecords;
}): OnboardingSetupStatus {
  const { progress, records } = options;
  const answered = new Set(progress.answered_steps);
  const liveChecks: Record<OnboardingSetupLiveCheck, boolean> = {
    clinic_type: answered.has('clinic_type'),
    main_branch: records.mainBranchPublicId !== null,
    services: records.activeServiceCount > 0,
  };
  const isLive = progress.completed_at !== null;
  let nextStep: OnboardingSetupStep | null = null;
  if (!isLive) {
    if (!liveChecks.clinic_type) nextStep = ONBOARDING_SETUP_STEP.CLINIC_TYPE;
    else if (!liveChecks.main_branch) nextStep = ONBOARDING_SETUP_STEP.LOCATION;
    else if (!answered.has('you')) nextStep = ONBOARDING_SETUP_STEP.YOU;
    else nextStep = ONBOARDING_SETUP_STEP.GO_LIVE;
  }
  const done: Record<OnboardingSetupGuideItem, boolean> = {
    treatments: records.activeServiceCount >= ONBOARDING_SETUP_TREATMENTS_DONE_AT,
    invite_team: records.hasTeammate,
    first_appointment: records.hasAppointment,
  };
  const skipped = new Set(progress.skipped_items);
  return {
    progress,
    records,
    liveChecks,
    nextStep,
    guideItems: ONBOARDING_SETUP_GUIDE_ITEM_VALUES.map((key) => ({
      key,
      isDone: done[key],
      isSkipped: skipped.has(key),
      canSkip: SKIPPABLE_GUIDE_ITEMS.has(key),
    })),
  };
}

/**
 * The clinic setup (feat-clinic-setup, routes-final §2): the status of the 3-tap setup drawer and
 * the short guide behind the profile icon, the answers and skips a manager saves, and going live.
 *
 * @remarks
 * - **Algorithm:** every call runs in the organization's context: refuses a personal workspace
 *   (`team_organization_required` — 404 on the read, 422 on the writes), reads the stored progress through the tenancy settings
 *   service and the records — the active main branch, active services (up to 2), any appointment,
 *   the team (someone besides the owner; a Doctor or Therapist) — and works out the live checks,
 *   `next_step` and the guide's ticks; nothing that has a record is stored (OS3).
 * - **Failure modes:** `NotFoundError` (read) or `UnprocessableEntityError` (writes) for a personal
 *   workspace; `ValidationError` for a
 *   bad change; `ConflictError` `record_changed` for a stale `expected_updated_at`; `ConflictError`
 *   `onboarding_setup_incomplete` when going live while a live check fails.
 * - **Side effects:** `change` merges into `tenancy.organization_settings`; `complete` sets the go-live
 *   time and member once; a read that first finds every guide item done or skipped (on a live
 *   clinic) stores that moment once (OS7). No events, no background work (D21).
 */
export class OnboardingSetupService {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly membershipService: MembershipService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly branchesRepository: BranchesRepository,
    private readonly offeringsRepository: OfferingsRepository,
    private readonly appointmentsRepository: AppointmentsRepository,
  ) {}

  /**
   * The clinic's setup — route 1, `GET /app/onboarding-setup`.
   *
   * @remarks
   * - **Algorithm:** reads progress and records, works out the status; on a live clinic whose three
   *   guide items are first all done or skipped, stores that moment, then answers.
   * - **Failure modes:** 404 `team_organization_required` for a personal workspace — it has no
   *   clinic setup, and the response-code policy keeps 422 for writes (user, 2026-10-13).
   * - **Side effects:** may create the settings row; may set `setup_guide_done_at` once.
   */
  async get(options: {
    scope: OrganizationPrincipalDatabaseScope;
    actingUserPublicId: string | undefined;
  }): Promise<OnboardingSetupOutput> {
    return withAppDatabaseContext({
      scope: options.scope,
      callback: async () => {
        const organization = await this.organizationService.requireOrganizationRecordByPublicId(
          options.scope.organizationPublicId,
        );
        if (isPersonalOrganization(organization)) {
          throw new NotFoundError('Onboarding setup').withReason('team_organization_required');
        }
        const status = await this.readStatus({ ...options, organization });
        return serializeOnboardingSetup(
          await this.withGuideDoneStored({ scope: options.scope, status }),
        );
      },
    });
  }

  /**
   * Answers a step, skips or un-skips a guide item, defers, hides or reopens the guide — route 2,
   * `PATCH /app/onboarding-setup`.
   *
   * @remarks
   * - **Algorithm:** validates the body; with `expected_updated_at`, locks the settings row and
   *   refuses a stale one (naming who changed it); merges the change in one statement through the
   *   settings service (OS5); answers with the new status.
   * - **Failure modes:** 400 for a bad body; 409 `record_changed`; 422 for a personal workspace.
   * - **Side effects:** writes the setup fields of the clinic's settings row.
   */
  async change(options: {
    scope: OrganizationPrincipalDatabaseScope;
    body: unknown;
    actingUserPublicId: string | undefined;
  }): Promise<OnboardingSetupOutput> {
    const parsed = validateChangeOnboardingSetup(options.body);
    return withAppDatabaseContext({
      scope: options.scope,
      callback: async () => {
        const organization = await this.requireTeamOrganization(options.scope);
        // Locked until this change commits: two changes sent with the same `expected_updated_at`
        // cannot both pass the check.
        const current = await this.organizationSettingsService.getSetupProgress({
          scope: options.scope,
          lock: parsed.expected_updated_at !== undefined,
        });
        await assertRecordNotChangedSince({
          row: { updated_at: current.updated_at, updated_by_user_id: current.updated_by_user_id },
          expected: parsed.expected_updated_at,
          resolveUserPublicId: (userId) =>
            this.organizationService.resolveUserPublicIdByInternalId(userId),
        });
        await this.organizationSettingsService.changeSetupProgress({
          scope: options.scope,
          change: {
            answered_steps_add: parsed.answered_steps_add,
            skipped_items_add: parsed.skipped_items_add,
            skipped_items_remove: parsed.skipped_items_remove,
            deferred: parsed.deferred,
            guide_hidden: parsed.guide_hidden,
          },
          actingUserPublicId: options.actingUserPublicId,
        });
        const status = await this.readStatus({ ...options, organization });
        return serializeOnboardingSetup(
          await this.withGuideDoneStored({ scope: options.scope, status }),
        );
      },
    });
  }

  /**
   * Takes the clinic live — route 3, `POST /app/onboarding-setup/complete` (OS6).
   *
   * @remarks
   * - **Algorithm:** a clinic already live answers as it stands (the first completer stays);
   *   otherwise every live check must hold — the clinic type answered, an active main branch, an
   *   active service — then the go-live time and the caller's membership are stored once.
   * - **Failure modes:** 409 `onboarding_setup_incomplete` naming each failing check; 422 for a
   *   personal workspace.
   * - **Side effects:** sets `setup_completed_at` and `setup_completed_by_membership_id` once.
   */
  async complete(options: {
    scope: OrganizationPrincipalDatabaseScope;
    actingUserPublicId: string | undefined;
  }): Promise<OnboardingSetupOutput> {
    return withAppDatabaseContext({
      scope: options.scope,
      callback: async () => {
        const status = await this.readStatus(options);
        if (status.progress.completed_at !== null) {
          return serializeOnboardingSetup(
            await this.withGuideDoneStored({ scope: options.scope, status }),
          );
        }
        const missing = ONBOARDING_SETUP_LIVE_CHECK_VALUES.filter(
          (check) => !status.liveChecks[check],
        );
        if (missing.length > 0) {
          throw new ConflictError('errors:onboardingSetupIncomplete', {
            missing: missing.join(', '),
          }).withReason('onboarding_setup_incomplete');
        }
        const team = await this.membershipService.summarizeTeamForSetup({
          scope: options.scope,
          bookableRoleNames: APP_BOOKABLE_ROLE_NAMES,
          actingUserPublicId: options.actingUserPublicId,
        });
        const progress = await this.organizationSettingsService.completeSetup({
          scope: options.scope,
          membershipId: team.actingMembershipId,
        });
        return serializeOnboardingSetup(
          await this.withGuideDoneStored({
            scope: options.scope,
            status: composeStatus({ progress, records: status.records }),
          }),
        );
      },
    });
  }

  /** The active organization, refused (422) when it is a personal workspace (OS4). */
  private async requireTeamOrganization(scope: OrganizationPrincipalDatabaseScope) {
    const organization = await this.organizationService.requireOrganizationRecordByPublicId(
      scope.organizationPublicId,
    );
    assertTeamOrganization({ organization, capability: 'SETUP' });
    return organization;
  }

  /** The stored progress, the records and what follows from them. */
  private async readStatus(options: {
    scope: OrganizationPrincipalDatabaseScope;
    actingUserPublicId: string | undefined;
    organization?: { id: number; type: string };
  }): Promise<OnboardingSetupStatus> {
    const organization =
      options.organization ?? (await this.requireTeamOrganization(options.scope));
    const progress = await this.organizationSettingsService.getSetupProgress({
      scope: options.scope,
    });
    const team = await this.membershipService.summarizeTeamForSetup({
      scope: options.scope,
      bookableRoleNames: APP_BOOKABLE_ROLE_NAMES,
      actingUserPublicId: options.actingUserPublicId,
    });
    const records: OnboardingSetupRecords = {
      mainBranchPublicId: await this.branchesRepository.findActiveMainPublicId(organization.id),
      activeServiceCount: await this.offeringsRepository.countActive(
        organization.id,
        ONBOARDING_SETUP_TREATMENTS_DONE_AT,
      ),
      hasAppointment: await this.appointmentsRepository.hasAnyLive(organization.id),
      hasTeammate: team.hasTeammate,
      hasBookableMember: team.hasBookableMember,
    };
    return composeStatus({ progress, records });
  }

  /**
   * Stores the first moment a live clinic's three guide items are all done or skipped (OS7), and
   * answers with that time; a status already stored, not live or not finished passes through.
   */
  private async withGuideDoneStored(options: {
    scope: OrganizationPrincipalDatabaseScope;
    status: OnboardingSetupStatus;
  }): Promise<OnboardingSetupStatus> {
    const { scope, status } = options;
    const finished = status.guideItems.every((item) => item.isDone || item.isSkipped);
    if (
      status.progress.completed_at === null ||
      status.progress.guide_done_at !== null ||
      !finished
    )
      return status;
    const progress = await this.organizationSettingsService.markSetupGuideDone(scope);
    return { ...status, progress };
  }
}
