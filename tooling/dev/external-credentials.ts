import dotenv from 'dotenv';
import { formatEnvValue, upsertEnvAssignment } from './env-file.util.js';

/**
 * One value `.env.local` cannot generate for itself: a credential (or the setting tied to it) that
 * belongs to a real third-party account.
 */
export type ExternalCredential = {
  /** The env variable. */
  key: string;
  /** The integration that stays broken while it holds the `.env.example` placeholder. */
  integration: string;
  /**
   * `true` — the integration needs a real value and the `.env.example` value is never one (an API
   * key, a placeholder endpoint), so a key still on it is reported as missing. `false` — the
   * template value may be real (`S3_REGION=us-east-1`, the PostHog host) or the key is optional
   * (collector auth headers): it is copied when a source has a different value, never reported.
   */
  reportMissing: boolean;
};

/**
 * The values `.env.local` needs from a real account — `.env.example` ships placeholders for them,
 * and `pnpm setup:local` copies each one from {@link EXTERNAL_CREDENTIAL_SOURCE} (the hosted
 * development target's file) when the developer has it, else from the process environment.
 *
 * @remarks
 * Deliberately not listed: `SENTRY_DSN` (local errors would count against the hosted project's
 * quota), OAuth clients (their redirect URIs are registered per environment, so a
 * copied client would not complete a local login), and CAPTCHA (local CAPTCHA uses Cloudflare's test
 * keys — `--with-captcha`). Add a key here when a new integration needs an account value locally.
 */
export const EXTERNAL_CREDENTIALS: readonly ExternalCredential[] = [
  {
    key: 'STRIPE_SECRET_KEY',
    integration: 'Stripe — payments and subscriptions',
    reportMissing: true,
  },
  {
    key: 'STRIPE_WEBHOOK_SECRET',
    integration: 'Stripe — webhook signature verification',
    reportMissing: true,
  },
  {
    key: 'RESEND_API_KEY',
    integration: 'Resend — outbound email (verification codes, invitations)',
    reportMissing: true,
  },
  {
    key: 'EMAIL_FROM_ADDRESS',
    integration: 'Resend — sender, must be on a domain verified in that account',
    reportMissing: false,
  },
  {
    key: 'S3_BUCKET',
    integration: 'S3 — uploads (bucket the credentials can access)',
    reportMissing: false,
  },
  { key: 'S3_REGION', integration: 'S3 — the bucket’s region', reportMissing: false },
  { key: 'S3_ACCESS_KEY_ID', integration: 'S3 — access key', reportMissing: true },
  { key: 'S3_SECRET_ACCESS_KEY', integration: 'S3 — secret key', reportMissing: true },
  {
    key: 'POSTHOG_KEY',
    integration: 'PostHog — product analytics project key',
    reportMissing: true,
  },
  {
    key: 'POSTHOG_HOST',
    integration: 'PostHog — the project’s region host',
    reportMissing: false,
  },
];

/**
 * The env file the {@link EXTERNAL_CREDENTIALS} are copied from: the hosted development target's
 * file (gitignored, provisioned per developer). `pnpm setup:local` reads it only to copy these keys.
 */
export const EXTERNAL_CREDENTIAL_SOURCE = '.env.development';

/**
 * One place a real value can come from, in priority order — an env file's parsed contents, or the
 * process environment (shell exports, CI or cloud environment variables).
 */
export type ExternalCredentialSource = {
  /** Shown in the report (`copied from <label>`). */
  label: string;
  values: Readonly<Record<string, string | undefined>>;
};

/** What {@link fillExternalCredentials} did, by key — never values. */
export type ExternalCredentialFill = {
  /** The updated `.env.local` contents. */
  content: string;
  /** Keys filled, with the label of the source each came from. */
  copied: { key: string; source: string }[];
  /** Keys that already held a real value and were left alone. */
  kept: string[];
  /** Keys still on the placeholder (or unset) because no source has a real value either. */
  missing: string[];
};

/** A value that is unset, blank, or still the `.env.example` placeholder. */
function isPlaceholder(value: string | undefined, exampleValue: string | undefined): boolean {
  return value === undefined || value.trim() === '' || value === exampleValue;
}

/**
 * Fills the {@link EXTERNAL_CREDENTIALS} that `.env.local` still holds as placeholders with real
 * values from the given sources, first source first (`pnpm setup:local` passes the hosted
 * development target's env file, then the process environment).
 *
 * @remarks
 * - **Never overwrites a real value:** a key is filled only while `.env.local` has it unset, blank,
 *   or equal to the `.env.example` placeholder — a credential the developer set stays.
 * - **Never copies a placeholder:** a source value that is itself the placeholder (or blank) is not
 *   a real value, so the next source is tried; with none left the key is reported as missing when
 *   its `reportMissing` is set (an optional key, or one whose template value may be real, is not).
 * - **Reports keys, never values,** so the caller can print the outcome safely.
 * - Pure: no file I/O — the caller reads and writes the files.
 */
export function fillExternalCredentials(options: {
  local: string;
  example: string;
  sources: readonly ExternalCredentialSource[];
}): ExternalCredentialFill {
  const localValues = dotenv.parse(options.local);
  const exampleValues = dotenv.parse(options.example);
  const fill: ExternalCredentialFill = {
    content: options.local,
    copied: [],
    kept: [],
    missing: [],
  };
  for (const { key, reportMissing } of EXTERNAL_CREDENTIALS) {
    const exampleValue = exampleValues[key];
    const localValue = localValues[key];
    if (!isPlaceholder(localValue, exampleValue)) {
      fill.kept.push(key);
      continue;
    }
    const source = options.sources.find(
      (candidate) => !isPlaceholder(candidate.values[key], exampleValue),
    );
    const sourceValue = source?.values[key];
    if (source === undefined || sourceValue === undefined) {
      if (reportMissing) fill.missing.push(key);
      continue;
    }
    fill.content = upsertEnvAssignment(fill.content, key, formatEnvValue(sourceValue));
    fill.copied.push({ key, source: source.label });
  }
  return fill;
}
