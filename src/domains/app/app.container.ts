import type { FastifyInstance } from 'fastify';
import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { MembershipService } from '@/domains/tenancy/sub-domains/membership/membership.service.js';
import type { OrganizationSettingsService } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.service.js';
import type { BaseRecordPorts } from './base-record.types.js';
import { BranchesRepository } from './sub-domains/branches/branches.repository.js';
import { BranchesService } from './sub-domains/branches/branches.service.js';
import { BranchUserAccessesRepository } from './sub-domains/branches/branch-user-accesses/branch-user-accesses.repository.js';
import { BranchUserAccessesService } from './sub-domains/branches/branch-user-accesses/branch-user-accesses.service.js';
import { type AppRecordServices, createAppRecordServices } from './app-records.container.js';
import { UserPreferencesRepository } from './sub-domains/user-preferences/user-preferences.repository.js';
import { UserPreferencesService } from './sub-domains/user-preferences/user-preferences.service.js';
import { TaskRuleSettingsRepository } from './sub-domains/task-rule-settings/task-rule-settings.repository.js';
import { TaskRuleSettingsService } from './sub-domains/task-rule-settings/task-rule-settings.service.js';
import { AppUsersService } from './sub-domains/users/users.service.js';
import { SearchesService } from './sub-domains/searches/searches.service.js';
import { ContactsService } from './sub-domains/contacts/contacts.service.js';

/** The app domain's services (the app's own records), decorated on Fastify as `appDomain`. */
export type AppContainer = {
  branchesService: BranchesService;
  branchUserAccessesService: BranchUserAccessesService;
  userPreferencesService: UserPreferencesService;
  taskRuleSettingsService: TaskRuleSettingsService;
  appUsersService: AppUsersService;
  searchesService: SearchesService;
  contactsService: ContactsService;
} & AppRecordServices;

/** Builds the app domain container from its repositories and the tenancy services it reads. */
export function createAppContainer(
  organizationService: OrganizationService,
  membershipService: MembershipService,
  organizationSettingsService: OrganizationSettingsService,
): AppContainer {
  const branchesRepository = new BranchesRepository();
  const branchUserAccessesRepository = new BranchUserAccessesRepository();
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
  };
  for (const service of Object.values(records)) service.usePorts(ports);
  return {
    branchesService: new BranchesService(
      organizationService,
      membershipService,
      branchesRepository,
      branchUserAccessesRepository,
    ),
    branchUserAccessesService: new BranchUserAccessesService(
      organizationService,
      membershipService,
      branchesRepository,
      branchUserAccessesRepository,
    ),
    userPreferencesService: new UserPreferencesService(
      organizationService,
      new UserPreferencesRepository(),
    ),
    taskRuleSettingsService: new TaskRuleSettingsService(
      organizationService,
      new TaskRuleSettingsRepository(),
    ),
    appUsersService: new AppUsersService(membershipService),
    searchesService: new SearchesService(records),
    contactsService: new ContactsService(organizationService, records),
    ...records,
  };
}

/** Decorates `appDomain` on the Fastify instance (after the tenancy container). */
export function registerAppContainer(application: FastifyInstance): void {
  const { organizationService, membershipService, organizationSettingsService } =
    application.tenancyDomain;
  application.decorate(
    'appDomain',
    createAppContainer(organizationService, membershipService, organizationSettingsService),
  );
}
