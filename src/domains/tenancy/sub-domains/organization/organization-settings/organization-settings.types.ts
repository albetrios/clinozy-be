/** BCP 47 locale tag exposed in serialized organization settings (mirrors the constrained DB column). */
export type OrganizationDefaultLocale = 'en' | 'es';

/** Public shape returned by `/organization/settings` — produced by {@link serializeOrganizationSettings}. */
export interface OrganizationSettingsOutput {
  organization_id: string;
  is_email_notifications_enabled: boolean;
  default_locale: OrganizationDefaultLocale;
  security_policy: object;
  /** Opening cash a day starts with when there is no previous close, in rupees (launch #1). */
  default_day_float: number;
  /** Idle days after which a held lead opens to the team (D40). */
  lead_hold_days: number;
  /** Hour (0–23, the organization's time zone) the day-before reminder goes out (D34). */
  reminder_hour: number;
  /** Days without a visit before a consenting patient gets a re-target lead (D35). */
  retarget_after_days: number;
  /** Days a deleted record stays restorable before it is erased (D38). */
  deleted_record_purge_days: number;
  created_at: string;
  updated_at: string;
}
