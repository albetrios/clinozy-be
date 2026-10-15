import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/shared/errors/index.js';
import { validateUpdateUserSettings } from '@/domains/user/sub-domains/user-settings/user-settings.validator.js';

describe('user-settings.validator', () => {
  it('validateUpdateUserSettings accepts boolean flags', () => {
    expect(validateUpdateUserSettings({ is_dark_mode_enabled: true })).toEqual({
      is_dark_mode_enabled: true,
    });
  });

  it('validateUpdateUserSettings takes a clinic id or null for default_organization_id', () => {
    expect(validateUpdateUserSettings({ default_organization_id: 'org_clinic' })).toEqual({
      default_organization_id: 'org_clinic',
    });
    expect(validateUpdateUserSettings({ default_organization_id: null })).toEqual({
      default_organization_id: null,
    });
  });

  it('validateUpdateUserSettings refuses a blank or over-long default_organization_id', () => {
    for (const value of ['', '   ', 'x'.repeat(29), 7]) {
      expect(() => validateUpdateUserSettings({ default_organization_id: value })).toThrow(
        ValidationError,
      );
    }
  });

  it('validateUpdateUserSettings rejects unknown fields', () => {
    expect(() => validateUpdateUserSettings({ unknownField: true })).toThrow(ValidationError);
  });

  it('validateUpdateUserSettings takes a consent decision with its policy version (launch D85)', () => {
    expect(
      validateUpdateUserSettings({ analytics_consent: 'denied', analytics_consent_version: 1 }),
    ).toEqual({ analytics_consent: 'denied', analytics_consent_version: 1 });
  });

  it('validateUpdateUserSettings refuses a consent decision without its version, and the reverse', () => {
    for (const body of [{ analytics_consent: 'granted' }, { analytics_consent_version: 1 }]) {
      try {
        validateUpdateUserSettings(body);
        expect.unreachable('a lone consent field must be refused');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).errors?.[0]?.field).toBe('analytics_consent_version');
      }
    }
  });

  it('validateUpdateUserSettings refuses an unknown consent value or a version below one', () => {
    expect(() =>
      validateUpdateUserSettings({ analytics_consent: 'maybe', analytics_consent_version: 1 }),
    ).toThrow(ValidationError);
    expect(() =>
      validateUpdateUserSettings({ analytics_consent: 'granted', analytics_consent_version: 0 }),
    ).toThrow(ValidationError);
  });
});
