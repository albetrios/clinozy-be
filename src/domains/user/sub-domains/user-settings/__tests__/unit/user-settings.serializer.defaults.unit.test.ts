import { describe, expect, it } from 'vitest';
import { serializeUserSettings } from '@/domains/user/sub-domains/user-settings/user-settings.serializer.js';

describe('user-settings.serializer defaults', () => {
  it('serializeUserSettings returns defaults when row is null', () => {
    expect(serializeUserSettings(null)).toEqual({
      is_dark_mode_enabled: false,
      is_notifications_enabled: true,
      language: 'en',
      preferred_locales: ['en'],
      analytics_consent: null,
      analytics_consent_version: null,
      analytics_consent_at: null,
    });
  });

  it('serializeUserSettings preserves explicit false toggles', () => {
    const result = serializeUserSettings({
      is_dark_mode_enabled: false,
      is_notifications_enabled: false,
      language: 'es',
      preferred_locales: ['es', 'en'],
      analytics_consent: null,
      analytics_consent_version: null,
      analytics_consent_at: null,
    });

    expect(result.is_dark_mode_enabled).toBe(false);
    expect(result.is_notifications_enabled).toBe(false);
    expect(result.language).toBe('es');
    expect(result.preferred_locales).toEqual(['es', 'en']);
  });

  it('serializeUserSettings falls back to default preferred_locales when nullable column is null', () => {
    const result = serializeUserSettings({
      is_dark_mode_enabled: true,
      is_notifications_enabled: true,
      language: 'en',
      preferred_locales: null,
      analytics_consent: null,
      analytics_consent_version: null,
      analytics_consent_at: null,
    });

    expect(result.preferred_locales).toEqual(['en']);
  });

  it('serializeUserSettings preserves an empty preferred_locales array (non-null) without falling back', () => {
    const result = serializeUserSettings({
      is_dark_mode_enabled: false,
      is_notifications_enabled: true,
      language: 'en',
      preferred_locales: [],
      analytics_consent: null,
      analytics_consent_version: null,
      analytics_consent_at: null,
    });

    expect(result.preferred_locales).toEqual([]);
  });

  it('serializeUserSettings returns the consent decision, its version and when (launch D85)', () => {
    const result = serializeUserSettings({
      is_dark_mode_enabled: false,
      is_notifications_enabled: true,
      language: 'en',
      preferred_locales: ['en'],
      analytics_consent: 'granted',
      analytics_consent_version: 2,
      analytics_consent_at: new Date('2026-10-10T08:00:00.000Z'),
    });

    expect(result.analytics_consent).toBe('granted');
    expect(result.analytics_consent_version).toBe(2);
    expect(result.analytics_consent_at).toBe('2026-10-10T08:00:00.000Z');
  });
});
