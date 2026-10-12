import type { FastifyInstance } from 'fastify';
import type { ObjectStoragePort } from '@/infrastructure/storage/object-storage.port.js';
import { getDefaultS3ObjectStorageAdapter } from '@/infrastructure/storage/s3-adapter.js';
import type { UserService } from '@/domains/user/user.service.js';
import type { UserSettingsService } from '@/domains/user/sub-domains/user-settings/user-settings.service.js';
import { OrganizationRepository } from './sub-domains/organization/organization.repository.js';
import { OrganizationSettingsRepository } from './sub-domains/organization/organization-settings/organization-settings.repository.js';
import { OrganizationNotificationPolicyRepository } from './sub-domains/organization/organization-notification-policy/organization-notification-policy.repository.js';
import { OrganizationApiKeyRepository } from './sub-domains/organization/organization-api-key/organization-api-key.repository.js';
import { MembershipRepository } from './sub-domains/membership/membership.repository.js';
import { MembershipInvitationRepository } from './sub-domains/membership/membership-invitation/membership-invitation.repository.js';
import { MemberRoleRepository } from './sub-domains/member-roles/member-role.repository.js';
import { MemberRolePermissionRepository } from './sub-domains/member-roles/member-role-permission/member-role-permission.repository.js';
import { PermissionRepository } from './sub-domains/permission/permission.repository.js';
import { OrganizationService } from './sub-domains/organization/organization.service.js';
import { OrganizationSettingsService } from './sub-domains/organization/organization-settings/organization-settings.service.js';
import { OrganizationNotificationPolicyService } from './sub-domains/organization/organization-notification-policy/organization-notification-policy.service.js';
import { OrganizationApiKeyService } from './sub-domains/organization/organization-api-key/organization-api-key.service.js';
import { MembershipService } from './sub-domains/membership/membership.service.js';
import { MembershipInvitationService } from './sub-domains/membership/membership-invitation/membership-invitation.service.js';
import { MemberRoleService } from './sub-domains/member-roles/member-role.service.js';
import { MemberRolePermissionService } from './sub-domains/member-roles/member-role-permission/member-role-permission.service.js';
import { PermissionService } from './sub-domains/permission/permission.service.js';
import { AuthorizationService } from './sub-domains/permission/authorization.service.js';

/**
 * Composition-root bag of tenancy-domain services exposed to routes and
 * other domain containers. Built by {@link createTenancyContainer} and
 * decorated onto Fastify as `app.tenancyDomain` by {@link registerTenancyContainer}.
 */
export type TenancyContainer = {
  organizationService: OrganizationService;
  organizationSettingsService: OrganizationSettingsService;
  organizationNotificationPolicyService: OrganizationNotificationPolicyService;
  organizationApiKeyService: OrganizationApiKeyService;
  memberRoleService: MemberRoleService;
  memberRolePermissionService: MemberRolePermissionService;
  membershipService: MembershipService;
  membershipInvitationService: MembershipInvitationService;
  permissionService: PermissionService;
  authorizationService: AuthorizationService;
};

/**
 * Wires every tenancy repository and service together (organizations, settings,
 * notification policies, API keys, memberships, membership invitations, member
 * roles, role permissions, permissions, and the Redis-cached
 * `AuthorizationService`). Cross-domain dependencies — `UserService`, the S3
 * `ObjectStoragePort`, and the optional `UserSettingsService` — are passed in
 * by the parent composition root so this domain stays free of `application`
 * coupling. Membership construction depends on organization, role, role-
 * permission, and settings services, which is why instances are created top-
 * down before the membership service.
 */
export function createTenancyContainer({
  userService,
  objectStorage,
  userSettingsService,
}: {
  userService: UserService;
  objectStorage: ObjectStoragePort;
  userSettingsService?: UserSettingsService | undefined;
}): TenancyContainer {
  const organizationRepository = new OrganizationRepository();
  const organizationSettingsRepository = new OrganizationSettingsRepository();
  const organizationNotificationPolicyRepository = new OrganizationNotificationPolicyRepository();
  const organizationApiKeyRepository = new OrganizationApiKeyRepository();
  const membershipRepository = new MembershipRepository();
  const membershipInvitationRepository = new MembershipInvitationRepository();
  const memberRoleRepository = new MemberRoleRepository();
  const memberRolePermissionRepository = new MemberRolePermissionRepository();
  const permissionRepository = new PermissionRepository();

  const organizationService = new OrganizationService(organizationRepository, objectStorage);
  const organizationSettingsService = new OrganizationSettingsService(
    organizationRepository,
    organizationSettingsRepository,
  );
  const organizationNotificationPolicyService = new OrganizationNotificationPolicyService(
    organizationRepository,
    organizationNotificationPolicyRepository,
  );
  const permissionService = new PermissionService(permissionRepository);
  const authorizationService = new AuthorizationService(permissionRepository);
  const organizationApiKeyService = new OrganizationApiKeyService(
    organizationRepository,
    organizationApiKeyRepository,
    authorizationService,
    permissionRepository,
  );
  const memberRoleService = new MemberRoleService(
    organizationService,
    memberRoleRepository,
    memberRolePermissionRepository,
    authorizationService,
    permissionRepository,
  );
  const memberRolePermissionService = new MemberRolePermissionService(
    organizationRepository,
    memberRoleRepository,
    memberRolePermissionRepository,
    authorizationService,
    permissionRepository,
    membershipRepository,
  );
  // REQ-1: created before MembershipService so the add-member-by-email flow can issue invitations.
  const membershipInvitationService = new MembershipInvitationService(
    organizationRepository,
    membershipRepository,
    membershipInvitationRepository,
    userService,
    // D84: presign the clinic logo on the invitee's own invitation list.
    objectStorage,
    // An invitee has no language yet: invitations are written in the organization's.
    organizationSettingsService,
  );
  const membershipService = new MembershipService(
    organizationService,
    memberRoleService,
    memberRolePermissionService,
    membershipRepository,
    authorizationService,
    permissionRepository,
    organizationSettingsService,
    userSettingsService,
    // reaudit-#7: revoke a removed/departed member's API keys.
    organizationApiKeyRepository,
    // REQ-2: presign embedded member avatars in list/get responses.
    objectStorage,
    // REQ-1: add-member-by-email provisions/finds the invitee and issues the invitation.
    userService,
    membershipInvitationService,
  );
  // Accept changes a membership too; it emits through MembershipService's serializer.
  membershipInvitationService.wireMembershipEvents(membershipService);

  return {
    organizationService,
    organizationSettingsService,
    organizationNotificationPolicyService,
    organizationApiKeyService,
    memberRoleService,
    memberRolePermissionService,
    membershipService,
    membershipInvitationService,
    permissionService,
    authorizationService,
  };
}

/**
 * Decorates the Fastify instance with `tenancyDomain` by calling
 * {@link createTenancyContainer} with the default S3 object-storage adapter and
 * already-decorated `userDomain` services. Must be invoked after the user
 * domain container is registered.
 */
export function registerTenancyContainer(application: FastifyInstance): void {
  const objectStorage = getDefaultS3ObjectStorageAdapter();
  application.decorate(
    'tenancyDomain',
    createTenancyContainer({
      userService: application.userDomain.userService,
      objectStorage,
      userSettingsService: application.userDomain.userSettingsService,
    }),
  );
}
