import { describe, it, expect, beforeAll } from 'vitest';
import { initializeI18nextForBackgroundWork } from '@/shared/middlewares/core/i18n.middleware.js';
import { verificationCodeTemplate } from '@/infrastructure/mail/templates/verification-code.template.js';
import { invitationTemplate } from '@/infrastructure/mail/templates/invitation.template.js';

// Email copy comes from the locale files, as in the API and the worker.
beforeAll(async () => {
  await initializeI18nextForBackgroundWork();
});

describe('mail templates (snapshots)', () => {
  it('verificationCodeTemplate matches snapshot', () => {
    const html = verificationCodeTemplate({
      code: 'AB2CD3',
      expiresInMinutes: 15,
    });
    expect(html).toMatchSnapshot();
  });

  it('invitationTemplate matches snapshot', () => {
    const html = invitationTemplate({
      organizationName: 'Acme Corp',
      inviterName: 'Jane Doe',
      acceptUrl: 'https://app.example.com/invite/abc',
      expiresInDays: 7,
    });
    expect(html).toMatchSnapshot();
  });
});
