import { describe, expect, it, beforeAll } from 'vitest';
import { initializeI18nextForBackgroundWork } from '@/shared/middlewares/core/i18n.middleware.js';
import { invitationTemplate } from '@/infrastructure/mail/templates/invitation.template.js';

// Email copy comes from the locale files, as in the API and the worker.
beforeAll(async () => {
  await initializeI18nextForBackgroundWork();
});

describe('invitationTemplate HTML escaping', () => {
  const baseData = {
    acceptUrl: 'https://app.example.com/accept-invite/abc?token=signed',
    expiresInDays: 7,
  };

  it('escapes a script-tag injection in the inviter name', () => {
    const html = invitationTemplate({
      ...baseData,
      inviterName: '<script>alert(1)</script>',
      organizationName: 'Acme',
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes markup and quotes in the organization name', () => {
    const html = invitationTemplate({
      ...baseData,
      inviterName: 'Alice',
      organizationName: '"><a href="https://evil.test">Acme</a>',
    });

    expect(html).not.toContain('<a href="https://evil.test">');
    expect(html).toContain('&quot;&gt;&lt;a href=&quot;https://evil.test&quot;&gt;');
  });

  it('renders ordinary names without altering safe text', () => {
    const html = invitationTemplate({
      ...baseData,
      inviterName: 'Alice Smith',
      organizationName: 'Acme Corporation',
    });

    expect(html).toContain('<strong>Alice Smith</strong>');
    expect(html).toContain('<strong>Acme Corporation</strong>');
  });

  it('encodes & in acceptUrl as &amp; in the href attribute and text node', () => {
    const html = invitationTemplate({
      inviterName: 'Alice',
      organizationName: 'Acme',
      acceptUrl: 'https://app.example.com/accept-invite/abc?token=t1&ref=email',
      expiresInDays: 7,
    });

    expect(html).not.toContain('?token=t1&ref=email');
    expect(html).toContain('?token=t1&amp;ref=email');
  });

  it("renders the copy in the recipient's language", () => {
    const html = invitationTemplate({
      ...baseData,
      inviterName: 'Ada Lovelace',
      organizationName: 'Acme',
      locale: 'es',
    });

    expect(html).toContain('<html lang="es">');
    expect(html).toContain('Has recibido una invitación');
    expect(html).toContain(
      '<strong>Ada Lovelace</strong> te ha invitado a unirte a <strong>Acme</strong>.',
    );
    expect(html).toContain('Aceptar invitación');
    expect(html).toContain('caduca en 7 días');
    expect(html).not.toContain('Accept Invitation');
  });
});
