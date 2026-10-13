import type { SupportedLanguage } from '@/shared/constants/i18n.constants.js';

/** Locale tag exposed in serialized organization settings (mirrors the constrained DB column). */
export type OrganizationDefaultLocale = SupportedLanguage;

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

/**
 * A clinic's setup progress as stored on its settings row (feat-clinic-setup, routes-final §2.A.3):
 * only what has no record of its own. The app's onboarding-setup sub-domain reads it and works out
 * every tick from the clinic's records.
 */
export interface OrganizationSetupProgress {
  /** Setup steps answered that leave no record of their own: `clinic_type`, `you`. */
  answered_steps: string[];
  /** Guide items marked Skip: `treatments`, `invite_team`. */
  skipped_items: string[];
  /** "Explore first" — the drawer stops opening by itself. */
  deferred_at: Date | null;
  /** When the clinic went live. */
  completed_at: Date | null;
  /** Who took it live (a membership public id); null for clinics marked live at release. */
  completed_by_membership_public_id: string | null;
  /** "Hide this guide"; cleared when the guide is reopened. */
  guide_hidden_at: Date | null;
  /** The first time all three guide items were done or skipped. */
  guide_done_at: Date | null;
  /** The settings row's last change — for `expected_updated_at`. */
  updated_at: Date;
}

/** One merge into the setup progress: single values added or removed, a time set or cleared. */
export interface OrganizationSetupProgressChange {
  answered_steps_add?: readonly string[] | undefined;
  skipped_items_add?: readonly string[] | undefined;
  skipped_items_remove?: readonly string[] | undefined;
  /** `true` sets "Explore first" once; it is never cleared. */
  deferred?: true | undefined;
  /** `true` hides the guide, `false` reopens it. */
  guide_hidden?: boolean | undefined;
}
