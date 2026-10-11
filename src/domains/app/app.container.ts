import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import type { FastifyInstance } from 'fastify';
import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { MembershipService } from '@/domains/tenancy/sub-domains/membership/membership.service.js';
import type { MemberRoleService } from '@/domains/tenancy/sub-domains/member-roles/member-role.service.js';
import type { OrganizationSettingsService } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.service.js';
import { ValidationError } from '@/shared/errors/index.js';
import type {
  BaseRecordConfirmedUpload,
  BaseRecordFileLink,
  BaseRecordPorts,
} from './base-record.types.js';
import { BranchesRepository } from './sub-domains/branches/branches.repository.js';
import { BranchesService } from './sub-domains/branches/branches.service.js';
import { BranchMembersRepository } from './sub-domains/branches/branch-members/branch-members.repository.js';
import { BranchMembersService } from './sub-domains/branches/branch-members/branch-members.service.js';
import { type AppRecordServices, createAppRecordServices } from './app-records.container.js';
import { MembershipPreferencesRepository } from './sub-domains/memberships/membership-preferences/membership-preferences.repository.js';
import { MembershipPreferencesService } from './sub-domains/memberships/membership-preferences/membership-preferences.service.js';
import { MembershipSavedViewsRepository } from './sub-domains/memberships/membership-saved-views/membership-saved-views.repository.js';
import { MembershipSavedViewsService } from './sub-domains/memberships/membership-saved-views/membership-saved-views.service.js';
import { TaskRuleSettingsRepository } from './sub-domains/tasks/task-rule-settings/task-rule-settings.repository.js';
import { TaskRuleSettingsService } from './sub-domains/tasks/task-rule-settings/task-rule-settings.service.js';
import { PatientIdeasRepository } from './sub-domains/patients/patient-ideas/patient-ideas.repository.js';
import { PatientIdeasService } from './sub-domains/patients/patient-ideas/patient-ideas.service.js';
import { AppMembershipsService } from './sub-domains/memberships/memberships.service.js';
import { ContactsRepository } from './sub-domains/contacts/contacts.repository.js';
import { ContactMembersRepository } from './sub-domains/contacts/contact-members/contact-members.repository.js';
import { ContactMembersService } from './sub-domains/contacts/contact-members/contact-members.service.js';
import { ContactMessagingWebhookRepository } from './sub-domains/contacts/contact-messaging-webhook/contact-messaging-webhook.repository.js';
import { ContactMessagingWebhookService } from './sub-domains/contacts/contact-messaging-webhook/contact-messaging-webhook.service.js';
import {
  type AppMembershipLeaveStep,
  createAppMembershipLeaveStep,
} from './app-membership-leave.js';

/** The app domain's services (the app's own records), decorated on Fastify as `appDomain`. */
export type AppContainer = {
  branchesService: BranchesService;
  branchMembersService: BranchMembersService;
  membershipPreferencesService: MembershipPreferencesService;
  membershipSavedViewsService: MembershipSavedViewsService;
  taskRuleSettingsService: TaskRuleSettingsService;
  patientIdeasService: PatientIdeasService;
  appMembershipsService: AppMembershipsService;
  contactMembersService: ContactMembersService;
  /** The platform Meta app's WhatsApp and Instagram webhook (launch D77). */
  contactMessagingWebhookService: ContactMessagingWebhookService;
  /** The app's part of the membership leave step (launch K4), wired into tenancy. */
  membershipLeaveStep: AppMembershipLeaveStep;
  /** The ports every app record rule calls outside the app (one object, shared by every service). */
  ports: BaseRecordPorts;
} & AppRecordServices;

/** Builds the app domain container from its repositories and the tenancy services it reads. */
export function createAppContainer({
  organizationService,
  membershipService,
  organizationSettingsService,
  memberRoleService,
}: {
  organizationService: OrganizationService;
  membershipService: MembershipService;
  organizationSettingsService: OrganizationSettingsService;
  memberRoleService: MemberRoleService;
}): AppContainer {
  const branchesRepository = new BranchesRepository();
  const branchMembersRepository = new BranchMembersRepository();
  const records = createAppRecordServices(organizationService);
  // What table rules may call outside the app records (BaseRecordPorts) — wired once here.
  const ports: BaseRecordPorts = {
    organizationSettings: async (scope) => {
      const settings = await organizationSettingsService.get(scope);
      const timezone = await organizationService.requireOrganizationTimeZone(
        scope.organizationPublicId,
      );
      return {
        default_day_float: settings.default_day_float,
        lead_hold_days: settings.lead_hold_days,
        reminder_hour: settings.reminder_hour,
        retarget_after_days: settings.retarget_after_days,
        deleted_record_purge_days: settings.deleted_record_purge_days,
        timezone,
      };
    },
    // Late-wired by the composition root (`wireAppUploads`) — the upload domain registers after app.
    findConfirmedUpload: () => {
      throw new Error('App uploads are not wired (domain-containers.plugin.ts → wireAppUploads)');
    },
    removeImageLocation: () => {
      throw new Error('App uploads are not wired (domain-containers.plugin.ts → wireAppUploads)');
    },
    fileReadUrls: () => {
      throw new Error('App uploads are not wired (domain-containers.plugin.ts → wireAppUploads)');
    },
  };
  for (const service of Object.values(records)) service.usePorts(ports);
  return {
    branchesService: new BranchesService(
      organizationService,
      membershipService,
      branchesRepository,
      branchMembersRepository,
    ),
    branchMembersService: new BranchMembersService(
      organizationService,
      membershipService,
      branchesRepository,
      branchMembersRepository,
    ),
    membershipPreferencesService: new MembershipPreferencesService(
      organizationService,
      branchesRepository,
      new MembershipPreferencesRepository(),
    ),
    membershipSavedViewsService: new MembershipSavedViewsService(
      organizationService,
      new MembershipSavedViewsRepository(),
    ),
    taskRuleSettingsService: new TaskRuleSettingsService(
      organizationService,
      new TaskRuleSettingsRepository(),
    ),
    patientIdeasService: new PatientIdeasService(organizationService, new PatientIdeasRepository()),
    appMembershipsService: new AppMembershipsService(membershipService, memberRoleService),
    contactMembersService: new ContactMembersService(
      organizationService,
      membershipService,
      new ContactsRepository(),
      new ContactMembersRepository(),
    ),
    contactMessagingWebhookService: new ContactMessagingWebhookService(
      new ContactMessagingWebhookRepository(),
    ),
    membershipLeaveStep: createAppMembershipLeaveStep(),
    ports,
    ...records,
  };
}

/** What the app's upload port needs of the upload domain. */
export interface AppUploadChecker {
  assertKeyConfirmedForOwner(options: {
    fileKey: string;
    organizationInternalId?: number;
  }): Promise<BaseRecordConfirmedUpload>;
  removeImageLocation(options: {
    scope: OrganizationPrincipalDatabaseScope;
    fileKey: string;
    organizationInternalId: number;
  }): Promise<void>;
  createReadUrls(options: {
    organizationInternalId: number;
    fileKeys: readonly string[];
  }): Promise<ReadonlyMap<string, BaseRecordFileLink>>;
}

/**
 * Wires the app's upload ports (`findConfirmedUpload`, `removeImageLocation`, `fileReadUrls`) to
 * the upload domain — called by the
 * composition root once both containers exist (the upload container registers after the app's).
 *
 * @remarks
 * - **Failure modes:** the port answers null for a key that is missing, unconfirmed or another
 *   organization's (the upload service's `ValidationError`); any other error propagates.
 */
export function wireAppUploads({
  container,
  uploads,
}: {
  container: AppContainer;
  uploads: AppUploadChecker;
}): void {
  container.ports.findConfirmedUpload = async ({ organizationId, fileKey }) => {
    try {
      return await uploads.assertKeyConfirmedForOwner({
        fileKey,
        organizationInternalId: organizationId,
      });
    } catch (error) {
      if (error instanceof ValidationError) return null;
      throw error;
    }
  };
  container.ports.removeImageLocation = ({ scope, organizationId, fileKey }) =>
    uploads.removeImageLocation({ scope, fileKey, organizationInternalId: organizationId });
  container.ports.fileReadUrls = ({ organizationId, fileKeys }) =>
    uploads.createReadUrls({ organizationInternalId: organizationId, fileKeys });
}

/** Decorates `appDomain` on the Fastify instance (after the tenancy container). */
export function registerAppContainer(application: FastifyInstance): void {
  const { organizationService, membershipService, organizationSettingsService, memberRoleService } =
    application.tenancyDomain;
  application.decorate(
    'appDomain',
    createAppContainer({
      organizationService,
      membershipService,
      organizationSettingsService,
      memberRoleService,
    }),
  );
}
