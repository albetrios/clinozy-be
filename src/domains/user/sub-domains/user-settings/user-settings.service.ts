import { NotFoundError, UnprocessableEntityError } from '@/shared/errors/index.js';
import { omitUndefined } from '@/shared/utils/validation/omit-undefined.util.js';
import type { UserService } from '@/domains/user/user.service.js';
import {
  findUserActiveOrganizationByPublicId,
  findUserActiveOrganizationPublicIdByInternalId,
} from '@/domains/tenancy/sub-domains/organization/resolve-active-organization.js';
import type { UserSettingsRepository } from './user-settings.repository.js';
import { serializeUserSettings, type UserSettingsRow } from './user-settings.serializer.js';
import type { UserSettingsOutput } from './user-settings.types.js';
import type { UpdateUserSettingsInput } from './user-settings.dto.js';
import { validateUpdateUserSettings } from './user-settings.validator.js';
import {
  PRINCIPAL_SCOPE,
  withAppDatabaseContext,
  type UserPrincipalDatabaseScope,
} from '@/infrastructure/database/contexts/database-context.js';

/**
 * Read or merge the authenticated user's personalization toggles and locale preferences.
 *
 * @remarks
 * - **Algorithm:** resolve the owner's internal id via
 *   {@link UserService.resolveInternalIdByPublicId}, **inside** the database context the read or
 *   write already opens, so one transaction and one pooled checkout serve the whole request; `get`
 *   returns the serialized row (or platform defaults if no row exists); `update` validates the
 *   patch, drops `undefined` fields, and asks the repository to upsert-merge over the existing row.
 * - **Failure modes:** unknown user → {@link NotFoundError}; invalid body →
 *   {@link ValidationError} from the validator; a `default_organization_id` that is not an active
 *   clinic the caller actively belongs to → {@link UnprocessableEntityError}
 *   (`reason: default_organization_unavailable`).
 * - **Side effects:** writes to `auth.user_settings`. No event emission today.
 * - **Notes:** the repository handles defaulting on first write so this service stays patch-only;
 *   `omitUndefined` avoids accidentally clearing fields the client did not send. The pinned clinic
 *   (feat-choose-default-clinic) is checked and resolved through the tenancy membership lookups,
 *   inside the same user context (nested contexts reuse the transaction).
 */
export class UserSettingsService {
  constructor(
    private readonly userService: UserService,
    private readonly repository: UserSettingsRepository,
  ) {}

  /**
   * Resolves the owner's internal id. MUST be called inside the caller's database context — it
   * joins that transaction instead of opening a second one for a value the caller already holds
   * the public id for (the pooled-checkout amplification described on
   * {@link UserService.resolveInternalIdByPublicId}).
   */
  private async requireUserIdInContext(user_public_id: string): Promise<number> {
    const userId = await this.userService.resolveInternalIdByPublicId(user_public_id);
    if (userId === null) throw new NotFoundError('User');
    return userId;
  }

  /**
   * Turns the validated body into the repository's patch. A `default_organization_id` is checked
   * against the caller's memberships: only an ACTIVE membership in an ACTIVE clinic (TEAM) may be
   * pinned, and it is stored by internal id; `null` clears the pin. Every other miss — an unknown
   * id, someone else's clinic, a suspended membership, a personal workspace — is the same 422, so
   * the route never confirms that a clinic exists (feat-choose-default-clinic CD6).
   */
  private async toRepositoryPatch({
    parsed,
    userId,
  }: {
    parsed: UpdateUserSettingsInput;
    userId: number;
  }) {
    const { default_organization_id: defaultOrganizationPublicId, ...rest } = parsed;
    const patch = omitUndefined(rest);
    if (defaultOrganizationPublicId === undefined) return patch;
    if (defaultOrganizationPublicId === null) return { ...patch, default_organization_id: null };
    const organization = await findUserActiveOrganizationByPublicId({
      userInternalId: userId,
      organizationPublicId: defaultOrganizationPublicId,
    });
    if (organization?.type !== 'TEAM') {
      throw new UnprocessableEntityError('errors:defaultOrganizationUnavailable').withReason(
        'default_organization_unavailable',
      );
    }
    return { ...patch, default_organization_id: organization.id };
  }

  /**
   * Adds the pinned clinic's public id to the row while the pin is usable — an ACTIVE membership in
   * an ACTIVE clinic — and `null` otherwise, so a clinic the caller has left reads as automatic
   * while the stored id waits for a rejoin (feat-choose-default-clinic CD7).
   */
  private async withDefaultOrganization({
    row,
    userId,
  }: {
    row: (UserSettingsRow & { default_organization_id: number | null }) | null;
    userId: number;
  }): Promise<UserSettingsRow | null> {
    if (row?.default_organization_id == null) return row;
    const publicId = await findUserActiveOrganizationPublicIdByInternalId({
      userInternalId: userId,
      organizationInternalId: row.default_organization_id,
    });
    return { ...row, default_organization_public_id: publicId ?? null };
  }

  async get(scope: UserPrincipalDatabaseScope): Promise<UserSettingsOutput> {
    const user_public_id = scope.userPublicId;
    // auth.user_settings is FORCE RLS keyed on app.current_user_public_id — read inside the user context.
    const settings = await withAppDatabaseContext({
      scope,
      callback: async () => {
        const userId = await this.requireUserIdInContext(user_public_id);
        return this.withDefaultOrganization({
          row: await this.repository.getByUserId(userId),
          userId,
        });
      },
    });
    return serializeUserSettings(settings);
  }

  async update({
    scope,
    body,
  }: {
    scope: UserPrincipalDatabaseScope;
    body: unknown;
  }): Promise<UserSettingsOutput> {
    const user_public_id = scope.userPublicId;
    const parsed = validateUpdateUserSettings(body);
    // auth.user_settings is FORCE RLS keyed on app.current_user_public_id — upsert inside the user context.
    const result = await withAppDatabaseContext({
      scope,
      callback: async () => {
        const userId = await this.requireUserIdInContext(user_public_id);
        const row = await this.repository.upsert(
          userId,
          await this.toRepositoryPatch({ parsed, userId }),
        );
        return this.withDefaultOrganization({ row, userId });
      },
    });
    return serializeUserSettings(result);
  }

  /**
   * Invite-flow port: reads the INVITED user's settings during membership
   * creation — a cross-user read authorized by the invitation write path, where
   * the request principal is the inviter, so no token scope for the invitee can
   * exist. Stays on the user-context wrapper until the pre-token minter lands
   * (Phase 6b of the principal campaign).
   */
  async getForInvitedUser(user_public_id: string): Promise<UserSettingsOutput> {
    const settings = await withAppDatabaseContext({
      scope: PRINCIPAL_SCOPE.VERIFIED({ userPublicId: user_public_id }),
      callback: async () => {
        const userId = await this.requireUserIdInContext(user_public_id);
        return this.withDefaultOrganization({
          row: await this.repository.getByUserId(userId),
          userId,
        });
      },
    });
    return serializeUserSettings(settings);
  }

  /**
   * Invite-flow port: writes locale defaults onto the INVITED user's settings —
   * see {@link UserSettingsService.getForInvitedUser} for why this cross-user
   * write cannot carry a token scope (absorbed in Phase 6b).
   */
  async updateForInvitedUser({
    user_public_id,
    body,
  }: {
    user_public_id: string;
    body: unknown;
  }): Promise<UserSettingsOutput> {
    const parsed = validateUpdateUserSettings(body);
    const result = await withAppDatabaseContext({
      scope: PRINCIPAL_SCOPE.VERIFIED({ userPublicId: user_public_id }),
      callback: async () => {
        const userId = await this.requireUserIdInContext(user_public_id);
        const row = await this.repository.upsert(
          userId,
          await this.toRepositoryPatch({ parsed, userId }),
        );
        return this.withDefaultOrganization({ row, userId });
      },
    });
    return serializeUserSettings(result);
  }
}
