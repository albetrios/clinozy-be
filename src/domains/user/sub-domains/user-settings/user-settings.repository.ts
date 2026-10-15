import { eq } from 'drizzle-orm';
import { databaseNowTimestamp } from '@/shared/utils/infrastructure/database-timestamp.util.js';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { user_settings } from '@/domains/user/sub-domains/user-settings/user-settings.schema.js';

/**
 * Drizzle data-access for `auth.user_settings`. Implements an upsert-merge for the singleton
 * row keyed by `user_id`: missing fields fall back to the existing row, then to the platform
 * factory defaults (light mode, notifications on, `en` language, `['en']` preferred locales, no
 * analytics consent receipt, no pinned clinic). A consent receipt writes its three columns together, stamped by the
 * database.
 */
export class UserSettingsRepository {
  async getByUserId(user_id: number) {
    const rows = await getRequestDatabase()
      .select()
      .from(user_settings)
      .where(eq(user_settings.user_id, user_id))
      .limit(1);
    return rows[0] ?? null;
  }

  async upsert(
    user_id: number,
    data: {
      is_dark_mode_enabled?: boolean;
      is_notifications_enabled?: boolean;
      language?: string;
      preferred_locales?: unknown;
      analytics_consent?: string;
      analytics_consent_version?: number;
      default_organization_id?: number | null;
    },
  ) {
    // A consent decision is stamped by the database clock, never the client's (launch D85).
    const consent =
      data.analytics_consent !== undefined && data.analytics_consent_version !== undefined
        ? {
            analytics_consent: data.analytics_consent,
            analytics_consent_version: data.analytics_consent_version,
            analytics_consent_at: databaseNowTimestamp,
          }
        : null;
    // audit #12: single atomic INSERT ... ON CONFLICT DO UPDATE. The prior read-branch-write
    // (getByUserId → UPDATE or INSERT) raced under concurrency: two concurrent first-time writes
    // both read `existing = null`, both INSERT, and one hit the user_id PK (23505) → HTTP 500;
    // concurrent partial updates also lost fields. The INSERT carries factory defaults for a brand
    // new row; the conflict SET touches ONLY the fields this call actually supplied (others keep
    // their stored value), so concurrent partial updates compose instead of clobbering.
    const rows = await getRequestDatabase()
      .insert(user_settings)
      .values({
        user_id,
        is_dark_mode_enabled: data.is_dark_mode_enabled ?? false,
        is_notifications_enabled: data.is_notifications_enabled ?? true,
        language: data.language ?? 'en',
        preferred_locales: (data.preferred_locales as string[] | undefined) ?? ['en'],
        default_organization_id: data.default_organization_id ?? null,
        ...consent,
      })
      .onConflictDoUpdate({
        target: user_settings.user_id,
        set: {
          ...(data.is_dark_mode_enabled !== undefined && {
            is_dark_mode_enabled: data.is_dark_mode_enabled,
          }),
          ...(data.is_notifications_enabled !== undefined && {
            is_notifications_enabled: data.is_notifications_enabled,
          }),
          ...(data.language !== undefined && { language: data.language }),
          ...(data.preferred_locales !== undefined && {
            preferred_locales: data.preferred_locales as string[],
          }),
          ...(data.default_organization_id !== undefined && {
            default_organization_id: data.default_organization_id,
          }),
          ...consent,
          updated_at: databaseNowTimestamp,
        },
      })
      .returning();
    return rows[0]!;
  }
}
