// hand-edited — a singleton per person and organization, not the generated CRUD.
import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import {
  USER_PREFERENCE_BRANCHES_LINK,
  type UserPreferencesRepository,
} from './user-preferences.repository.js';
import { serializeUserPreference } from './user-preferences.serializer.js';
import type { UserPreferenceOutput } from './user-preferences.types.js';
import {
  validateCreateUserPreference,
  validateListUserPreferencesQuery,
  validateUpdateUserPreference,
} from './user-preferences.validator.js';
import {
  USER_PREFERENCE_PATIENT_FILE_PINS_VALUES,
  USER_PREFERENCE_PINNED_SECTIONS_VALUES,
} from './user-preferences.constants.js';

/** What a person who never saved a preference gets (the drop's defaults). */
const DEFAULT_PREFERENCES: Omit<UserPreferenceOutput, 'id' | 'created_at' | 'updated_at'> = {
  pinned_sections: USER_PREFERENCE_PINNED_SECTIONS_VALUES.filter((section) =>
    ['appointments', 'leads', 'patients', 'payments'].includes(section),
  ),
  branch_filter_ids: [],
  theme: 'light',
  patient_file_pins: USER_PREFERENCE_PATIENT_FILE_PINS_VALUES.filter((section) =>
    ['overview', 'prescriptions', 'treatments', 'images', 'invoices'].includes(section),
  ),
  recent_picks: [],
};

/**
 * A person's preferences, or the defaults (`id: null`) before their first save.
 *
 * @remarks
 * - **Notes:** the defaults are the drop's (pinned appointments, leads, patients, payments; light).
 */
export type MyPreferencesOutput =
  | UserPreferenceOutput
  | (Omit<UserPreferenceOutput, 'id' | 'created_at' | 'updated_at'> & {
      id: null;
      created_at: null;
      updated_at: null;
    });

/**
 * Each person's own settings in the active organization (launch ROUTE #8, RC-8/RC-9): pinned
 * sections, branch filter (D40, per organization), theme, patient-file pins and recent picks.
 *
 * @remarks
 * - **Algorithm:** the shared app record service in owner mode — a person reads and writes only
 *   their own row; `getMine` returns the defaults until the first save, `updateMine` creates the
 *   row on the first save and updates it after.
 * - **Failure modes:** `ValidationError` for a bad body or a branch that is no live branch here;
 *   `ConflictError` for a stale save (`expected_updated_at`, D43).
 * - **Side effects:** the first save inserts the person's row.
 */
export class UserPreferencesService extends BaseRecordService<UserPreferenceOutput> {
  constructor(organizationService: OrganizationService, repository: UserPreferencesRepository) {
    super(organizationService, {
      label: 'User preference',
      repository,
      parseCreate: validateCreateUserPreference,
      parseUpdate: validateUpdateUserPreference,
      parseList: validateListUserPreferencesQuery,
      serialize: serializeUserPreference,
      referenceLists: [
        { field: 'branch_filter_ids', link: USER_PREFERENCE_BRANCHES_LINK, label: 'branch' },
      ],
      ownedByActor: true,
    });
  }

  /**
   * The caller's preferences in the active organization, or the defaults before the first save.
   *
   * @remarks
   * - **Algorithm:** one owner-scoped read of the caller's row.
   * - **Failure modes:** none beyond the read.
   */
  async getMine(
    scope: OrganizationPrincipalDatabaseScope,
    actingUserPublicId: string | undefined,
  ): Promise<MyPreferencesOutput> {
    const page = await this.list(scope, { limit: 1 }, { actingUserPublicId });
    return (
      page.items[0] ?? { id: null, created_at: null, updated_at: null, ...DEFAULT_PREFERENCES }
    );
  }

  /**
   * Saves any of the caller's preferences — creates their row on the first save.
   *
   * @remarks
   * - **Algorithm:** owner-scoped read; update the row when it exists, else create it with the
   *   sent fields over the defaults.
   * - **Failure modes:** `ValidationError`; `ConflictError` for a stale save.
   */
  async updateMine(
    scope: OrganizationPrincipalDatabaseScope,
    body: unknown,
    actingUserPublicId: string | undefined,
  ): Promise<UserPreferenceOutput> {
    const page = await this.list(scope, { limit: 1 }, { actingUserPublicId });
    const existing = page.items[0];
    if (existing) return this.update(scope, existing.id, body, actingUserPublicId);
    validateUpdateUserPreference(body);
    const { expected_updated_at: _ignored, ...fields } = (body ?? {}) as Record<string, unknown>;
    return this.create(scope, fields, actingUserPublicId);
  }
}
