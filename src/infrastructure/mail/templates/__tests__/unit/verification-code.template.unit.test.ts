import { describe, expect, it, beforeAll } from 'vitest';
import { initializeI18nextForBackgroundWork } from '@/shared/middlewares/core/i18n.middleware.js';
import { verificationCodeTemplate } from '@/infrastructure/mail/templates/verification-code.template.js';

// Email copy comes from the locale files, as in the API and the worker.
beforeAll(async () => {
  await initializeI18nextForBackgroundWork();
});

describe('verificationCodeTemplate', () => {
  it('renders the sign-in code and its TTL', () => {
    const html = verificationCodeTemplate({ code: 'AB2CD3', expiresInMinutes: 15 });

    expect(html).toContain('AB2CD3');
    expect(html).toContain('15 minutes');
  });

  it('HTML-escapes the code value as defence-in-depth', () => {
    const html = verificationCodeTemplate({ code: '<b>42</b>', expiresInMinutes: 15 });

    expect(html).not.toContain('<b>42</b>');
    expect(html).toContain('&lt;b&gt;42&lt;/b&gt;');
  });

  it("renders the copy in the recipient's language", () => {
    const html = verificationCodeTemplate({ code: 'AB2CD3', expiresInMinutes: 15, locale: 'es' });

    expect(html).toContain('<html lang="es">');
    expect(html).toContain('Inicia sesión en tu cuenta');
    expect(html).toContain('caduca en 15 minutos');
    expect(html).not.toContain('15 minutes');
  });
});
