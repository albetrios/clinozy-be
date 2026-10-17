import {
  withAppDatabaseContext,
  type UserPrincipalDatabaseScope,
} from '@/infrastructure/database/contexts/database-context.js';
import type { GlobalRole } from '@/shared/constants/roles.constants.js';
import type { UserService } from '@/domains/user/user.service.js';
import type { MembershipService } from '@/domains/tenancy/sub-domains/membership/membership.service.js';
import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import type { AuthorizationService } from '@/domains/tenancy/sub-domains/permission/authorization.service.js';
import type { CallerMembershipContext } from '@/domains/tenancy/sub-domains/membership/membership.types.js';
import type { SubscriptionService } from '@/domains/billing/sub-domains/subscription/subscription.service.js';
import type { PlanAccess } from '@/domains/billing/sub-domains/subscription/subscription.types.js';
import { ACTIVE_PLAN_ACCESS } from '@/domains/billing/sub-domains/subscription/subscription.constants.js';
import { serializePlanAccess } from '@/domains/billing/sub-domains/subscription/subscription.serializer.js';
import type {
  AuthMeContextActiveOrganizationOutput,
  AuthMeContextData,
} from './auth-me-context.types.js';

/**
 * Aggregates the authenticated caller's "effective context" in one read: their
 * self profile, the active organization (with its `type` and `plan_access`), their
 * membership there and the roles it holds, the permission codes they hold in that
 * organization, and their global role.
 *
 * @remarks
 * - **Algorithm:** cross-domain reads through services (never repositories) —
 *   `UserService.getMe` and, when an active organization is in scope,
 *   `OrganizationService.getByPublicId` + `AuthorizationService.resolveUserOrganizationPermissions`
 *   + `MembershipService.getCallerMembershipContext` (the membership's public id and its roles,
 *   main role first — launch ROUTE #156, N10, S3) + `SubscriptionService.getPlanAccess` (the
 *   active organization's `plan_access`, owner decision D3 — read inside the same user context, so
 *   it adds no transaction of its own).
 * - **Failure modes:** propagates `NotFoundError` when the user or active organization is
 *   not accessible to the caller; an absent active-organization claim yields
 *   `activeOrganization: null` and empty permissions rather than an error.
 * - **Side effects:** none (read-only); permission resolution is Redis-cached.
 * - **Notes:** owns no tables — it composes the existing `/users/me`,
 *   `/tenancy/organization(s)`, and permission-resolution reads behind one call so
 *   the surface stays identical for personal and team organizations.
 */
export class AuthMeContextService {
  constructor(
    private readonly userService: UserService,
    private readonly organizationService: OrganizationService,
    private readonly authorizationService: AuthorizationService,
    // Launch ROUTE #4 / #156: the caller's membership and roles (D5, N10); absent in the worker
    // process and minimal harnesses.
    private readonly membershipService?: Pick<MembershipService, 'getCallerMembershipContext'>,
    // Owner decision D3: the active organization's plan access (grace, then read-only). Absent in
    // the worker process and minimal harnesses, where every organization reads `active`.
    private readonly planAccessService?: Pick<SubscriptionService, 'getPlanAccess'>,
  ) {}

  /** The organization's plan access — `active` when no plan access service is wired. */
  private async resolvePlanAccess(organizationPublicId: string): Promise<PlanAccess> {
    return this.planAccessService
      ? this.planAccessService.getPlanAccess({ organizationPublicId })
      : ACTIVE_PLAN_ACCESS;
  }

  /** Assembles the caller's effective context for `GET /auth/me/context`. */
  async getContext(options: {
    scope: UserPrincipalDatabaseScope;
    globalRole: GlobalRole | undefined;
  }): Promise<AuthMeContextData> {
    const { scope, globalRole } = options;
    const userPublicId = scope.userPublicId;
    const activeOrganizationPublicId: string | undefined = scope.organizationPublicId;

    // `getMe` and `getByPublicId` both open the user-scoped principal context: the
    // SAME guc, the SAME value. Called separately that is two transactions, two
    // `SELECT set_config(...)` round trips and two pooled checkouts held at once.
    // Opening the user context ONCE lets both take the reuse branch in
    // `withAppDatabaseContext` and share a single checkout — the amplification that
    // made a 50-connection pool starve at 50 users. They serialize on that one
    // connection, trading a little latency at low load for connections, the resource
    // that runs out first.
    //
    // `resolveUserOrganizationPermissions` stays outside: it drives a DIFFERENT guc
    // (`app.current_organization_public_id`), so it must keep its own transaction and
    // can still overlap with the block below.
    const [userScoped, myPermissions, membership] = await Promise.all([
      withAppDatabaseContext({
        scope,
        callback: async () => ({
          user: await this.userService.getMe(scope),
          activeOrganization: activeOrganizationPublicId
            ? await this.organizationService.getByPublicId({
                public_id: activeOrganizationPublicId,
                user_public_id: userPublicId,
              })
            : null,
          // Same organization as this context: reuses its connection, no transaction of its own.
          planAccess: activeOrganizationPublicId
            ? await this.resolvePlanAccess(activeOrganizationPublicId)
            : null,
        }),
      }),
      activeOrganizationPublicId
        ? this.authorizationService.resolveUserOrganizationPermissions({
            userPublicId,
            organizationPublicId: activeOrganizationPublicId,
          })
        : Promise.resolve<string[]>([]),
      this.membershipService
        ? this.membershipService.getCallerMembershipContext(scope)
        : Promise.resolve<CallerMembershipContext | null>(null),
    ]);
    const { user, activeOrganization, planAccess } = userScoped;
    const myRoles = membership?.roles ?? [];

    return {
      user,
      activeOrganization,
      planAccess: activeOrganization ? planAccess : null,
      membershipId: membership?.membership_id ?? null,
      myPermissions,
      myRoleIds: myRoles.map((role) => role.id),
      myRoles,
      globalRole: globalRole ?? null,
    };
  }

  /**
   * Resolves the active-organization slice of the context for one organization — the
   * `active_organization` (with its `type` and `plan_access`) and the caller's
   * `my_permissions` in it — without the heavier `user` payload.
   *
   * @remarks
   * - **Algorithm:** the same reads `getContext` performs for the active organization —
   *   `OrganizationService.getByPublicId` + `AuthorizationService.resolveUserOrganizationPermissions`
   *   + `SubscriptionService.getPlanAccess` (its `plan_access`) — issued concurrently, since none
   *   consumes another's result.
   * - **Failure modes:** propagates `NotFoundError` when the organization is not
   *   accessible to the caller.
   * - **Side effects:** none (read-only); permission resolution is Redis-cached.
   * - **Notes:** returned inline by `POST /auth/switch-to-organization` and
   *   `POST /auth/switch-to-personal` so the client repaints the dashboard for the
   *   newly active organization without a follow-up `GET /auth/me/context`. The omitted
   *   `user` is stable across a switch, so the client reuses the one from its initial
   *   `/me/context`.
   */
  async getActiveOrganizationContext(options: {
    userPublicId: string;
    organizationPublicId: string;
    globalRole: GlobalRole | undefined;
  }): Promise<{
    active_organization: AuthMeContextActiveOrganizationOutput;
    my_permissions: string[];
    global_role: GlobalRole | null;
  }> {
    const { userPublicId, organizationPublicId, globalRole } = options;
    // Independent of each other — all read from `options` only — so they go out together
    // rather than one after the other. This runs inline on every organization switch.
    const [activeOrganization, myPermissions, planAccess] = await Promise.all([
      this.organizationService.getByPublicId({
        public_id: organizationPublicId,
        user_public_id: userPublicId,
      }),
      this.authorizationService.resolveUserOrganizationPermissions({
        userPublicId,
        organizationPublicId,
      }),
      this.resolvePlanAccess(organizationPublicId),
    ]);
    return {
      // The same `plan_access` `GET /auth/me/context` carries, so a switch repaints it too.
      active_organization: { ...activeOrganization, plan_access: serializePlanAccess(planAccess) },
      my_permissions: myPermissions,
      global_role: globalRole ?? null,
    };
  }
}
