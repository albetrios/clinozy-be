import type { SupportedLanguage } from '@/shared/constants/i18n.constants.js';

/** Locale tag exposed in serialized organization settings (mirrors the constrained DB column). */
export type OrganizationDefaultLocale = SupportedLanguage;

/** Public shape returned by `/organization/settings` — produced by {@link serializeOrganizationSettings}. */
export interface OrganizationSettingsOutput {
  organization_id: string;
  is_email_notifications_enabled: boolean;
  default_locale: OrganizationDefaultLocale;
  security_policy: object;
  created_at: string;
  updated_at: string;
}
