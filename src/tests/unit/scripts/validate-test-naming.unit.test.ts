import { describe, expect, it } from 'vitest';
import {
  detectTier,
  isExemptFromTierSuffix,
  isPathAllowedForTier,
} from '@/scripts/validators/tests/validate-test-naming.js';

describe('validate-test-naming helpers', () => {
  it('detects tier suffixes including db.unit', () => {
    expect(detectTier('user.service.unit.test.ts')).toBe('unit');
    expect(detectTier('user.repository.db.unit.test.ts')).toBe('unit');
    expect(detectTier('auth.test.ts')).toBeUndefined();
  });

  it('exempts only bundled domain e2e and sub-domain route suites', () => {
    expect(isExemptFromTierSuffix('domains/auth/__tests__/auth.test.ts')).toBe(true);
    expect(
      isExemptFromTierSuffix(
        'domains/auth/sub-domains/auth-mfa/__tests__/unit/auth-mfa.validator.test.ts',
      ),
    ).toBe(false);
    expect(
      isExemptFromTierSuffix(
        'infrastructure/database/__tests__/unit/principal-database-context.test.ts',
      ),
    ).toBe(false);
    expect(
      isExemptFromTierSuffix(
        'domains/auth/sub-domains/auth-method/events/__tests__/handler.test.ts',
      ),
    ).toBe(false);
  });

  it('allows unit tier under __tests__/unit and tests/unit', () => {
    expect(
      isPathAllowedForTier({
        relativePath: 'domains/user/sub-domains/user-settings/__tests__/unit/foo.unit.test.ts',
        tier: 'unit',
      }),
    ).toBe(true);
    expect(
      isPathAllowedForTier({
        relativePath: 'tests/unit/utils/http/response.util.unit.test.ts',
        tier: 'unit',
      }),
    ).toBe(true);
    expect(
      isPathAllowedForTier({ relativePath: 'domains/user/foo.unit.test.ts', tier: 'unit' }),
    ).toBe(false);
  });

  it('rejects a unit suite no Vitest project collects, wherever it lives', () => {
    // These sat outside `__tests__/unit/` and never ran in any lane.
    expect(
      isPathAllowedForTier({
        relativePath: 'infrastructure/mail/workers/__tests__/mail.worker.unit.test.ts',
        tier: 'unit',
      }),
    ).toBe(false);
    expect(
      isPathAllowedForTier({
        relativePath: 'scripts/validators/__tests__/constants-centralization.unit.test.ts',
        tier: 'unit',
      }),
    ).toBe(false);
    expect(
      isPathAllowedForTier({
        relativePath: 'scripts/foo.integration.test.ts',
        tier: 'integration',
      }),
    ).toBe(false);
  });

  it('allows db.unit and property.unit suites anywhere — their projects collect them anywhere', () => {
    expect(
      isPathAllowedForTier({
        relativePath: 'infrastructure/database/utils/batch-delete.db.unit.test.ts',
        tier: 'unit',
      }),
    ).toBe(true);
    expect(
      isPathAllowedForTier({
        relativePath: 'domains/billing/keys.property.unit.test.ts',
        tier: 'unit',
      }),
    ).toBe(true);
  });

  it('allows global tier only under tests/global', () => {
    expect(
      isPathAllowedForTier({
        relativePath: 'tests/global/import-paths.global.test.ts',
        tier: 'global',
      }),
    ).toBe(true);
    expect(
      isPathAllowedForTier({
        relativePath: 'tests/unit/import-paths.global.test.ts',
        tier: 'global',
      }),
    ).toBe(false);
  });
});
