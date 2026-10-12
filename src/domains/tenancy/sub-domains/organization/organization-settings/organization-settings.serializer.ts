import type { OrganizationSettingsOutput } from './organization-settings.types.js';

/**
 * Maps an `organization_settings` row to the public
 * {@link OrganizationSettingsOutput}. Coerces unknown locales to `'en'`,
 * defaults `security_policy` to an empty object, and serialises timestamps
 * as ISO 8601 strings.
 */
export function serializeOrganizationSettings({
  organization_public_id,
  row,
}: {
  organization_public_id: string;
  row: {
    is_email_notifications_enabled: boolean;
    default_locale?: string | null;
    security_policy: unknown;
    default_day_float: string;
    lead_hold_days: number;
    reminder_hour: number;
    retarget_after_days: number;
    deleted_record_purge_days: number;
    created_at: Date;
    updated_at: Date;
  };
}): OrganizationSettingsOutput {
  const defaultLocale = row.default_locale === 'es' ? 'es' : 'en';
  return {
    organization_id: organization_public_id,
    is_email_notifications_enabled: row.is_email_notifications_enabled,
    default_locale: defaultLocale,
    security_policy: (row.security_policy ?? {}) as object,
    default_day_float: Number(row.default_day_float),
    lead_hold_days: row.lead_hold_days,
    reminder_hour: row.reminder_hour,
    retarget_after_days: row.retarget_after_days,
    deleted_record_purge_days: row.deleted_record_purge_days,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
