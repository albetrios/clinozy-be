import { join } from 'node:path';

/** Absolute path to the locales root (`src/shared/locales/`) used by parity checks. */
export const LOCALES_ROOT = join(process.cwd(), 'src', 'shared', 'locales');

/** Locale code that all other locales must remain key-equivalent to. */
export const BASE_LOCALE = 'en';

/** Locale JSON files checked for en ↔ other locale key parity. */
export const LOCALE_PARITY_FILES = [
  'errors.json',
  'success.json',
  'common.json',
  'mail.json',
] as const;

/** String-literal union of locale JSON files covered by parity checks. */
export type LocaleParityFile = (typeof LOCALE_PARITY_FILES)[number];

/**
 * Recursively flattens a parsed JSON value into dot-separated leaf paths and
 * appends them to `keys`. Non-object values (and empty objects) become a leaf
 * at the caller-supplied `prefix`.
 */
export function collectLeafKeys({
  value,
  prefix,
  keys,
}: {
  value: unknown;
  prefix: string;
  keys: Set<string>;
}): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    if (prefix) keys.add(prefix);
    return;
  }
  const record = value as Record<string, unknown>;
  const entries = Object.entries(record);
  if (entries.length === 0 && prefix) {
    keys.add(prefix);
    return;
  }
  for (const [key, nested] of entries) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (nested !== null && typeof nested === 'object' && !Array.isArray(nested)) {
      collectLeafKeys({ value: nested, prefix: path, keys });
    } else {
      keys.add(path);
    }
  }
}
