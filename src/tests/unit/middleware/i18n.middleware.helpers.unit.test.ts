import { describe, expect, it, vi } from 'vitest';
import type * as nodeFs from 'node:fs';
import { existsSync } from 'node:fs';
import type { FastifyRequest } from 'fastify';
import {
  attachRequestI18nHelpers,
  resolveRequestLanguageFromHeader,
  verifyLocalesAvailable,
} from '@/shared/middlewares/core/i18n.middleware.js';

vi.mock('i18next', () => ({
  default: {
    t: (key: string) => `i18n:${key}`,
    getFixedT: (language: string) => (key: string) => `i18n:${language}:${key}`,
  },
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof nodeFs>();
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
  };
});

describe('i18n.middleware helpers', () => {
  it('resolveRequestLanguageFromHeader maps Spanish and defaults', () => {
    expect(resolveRequestLanguageFromHeader({ acceptLanguageHeader: undefined })).toBe('en');
    expect(
      resolveRequestLanguageFromHeader({
        organizationDefaultLocale: 'es',
        acceptLanguageHeader: undefined,
      }),
    ).toBe('es');
    expect(resolveRequestLanguageFromHeader({ acceptLanguageHeader: ',es-ES' })).toBe('en');
    expect(resolveRequestLanguageFromHeader({ acceptLanguageHeader: 'es-ES,es;q=0.9' })).toBe('es');
    expect(resolveRequestLanguageFromHeader({ acceptLanguageHeader: 'en-US,en;q=0.9' })).toBe('en');
    expect(resolveRequestLanguageFromHeader({ acceptLanguageHeader: 'fr-FR,fr;q=0.9' })).toBe('en');
    expect(resolveRequestLanguageFromHeader({ acceptLanguageHeader: ['es-ES', 'en'] })).toBe('es');
    expect(resolveRequestLanguageFromHeader({ acceptLanguageHeader: 'fr' })).toBe('en');
    expect(resolveRequestLanguageFromHeader({ acceptLanguageHeader: 'de-DE,de;q=0.9' })).toBe('en');
  });

  it('verifyLocalesAvailable throws when locales directory is missing', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(() => verifyLocalesAvailable()).toThrow(/Locales directory not found/);
  });

  it('attachRequestI18nHelpers sets the resolved language and a translator fixed to it', () => {
    const request = { headers: { 'accept-language': 'es-ES' } } as FastifyRequest;
    attachRequestI18nHelpers({ request });
    expect(request.language).toBe('es');
    expect(request.t?.('errors:invalidInput')).toBe('i18n:es:errors:invalidInput');
  });

  it('attachRequestI18nHelpers falls back to English when no language is named', () => {
    const request = { headers: {} } as FastifyRequest;
    attachRequestI18nHelpers({ request });
    expect(request.language).toBe('en');
    expect(request.t?.('errors:invalidInput')).toBe('i18n:en:errors:invalidInput');
  });

  it('attachRequestI18nHelpers applies the organization default locale when the header is absent', () => {
    const request = { headers: {} } as FastifyRequest;
    attachRequestI18nHelpers({ request, organizationDefaultLocale: 'es' });
    expect(request.language).toBe('es');
    expect(request.t?.('errors:invalidInput')).toBe('i18n:es:errors:invalidInput');
  });

  it('attachRequestI18nHelpers never hands an unsupported code to i18next', () => {
    const request = { headers: { 'accept-language': 'zz-audit' } } as FastifyRequest;
    attachRequestI18nHelpers({ request });
    expect(request.language).toBe('en');
    expect(request.t?.('errors:invalidInput')).toBe('i18n:en:errors:invalidInput');
  });

  it('verifyLocalesAvailable throws when a required namespace file is missing', () => {
    vi.mocked(existsSync).mockImplementation((path) => !String(path).endsWith('en/errors.json'));
    expect(() => verifyLocalesAvailable()).toThrow(/Required locale file not found/);
  });
});
