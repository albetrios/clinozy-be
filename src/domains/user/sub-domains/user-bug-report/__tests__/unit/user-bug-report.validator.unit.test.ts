import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/shared/errors/index.js';
import { validateCreateUserBugReport } from '@/domains/user/sub-domains/user-bug-report/user-bug-report.validator.js';
import { USER_BUG_REPORT_DESCRIPTION_MAX_LENGTH } from '@/domains/user/sub-domains/user-bug-report/user-bug-report.constants.js';

function fieldOf(body: unknown): string | undefined {
  try {
    validateCreateUserBugReport(body);
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return (error as ValidationError).errors?.[0]?.field;
  }
  return expect.unreachable('the body must be refused');
}

describe('user-bug-report.validator', () => {
  it('accepts a typed description alone and trims it', () => {
    expect(
      validateCreateUserBugReport({ description: '  The total is wrong  ', input_method: 'typed' }),
    ).toEqual({ description: 'The total is wrong', input_method: 'typed' });
  });

  it('accepts every input method and the optional context', () => {
    for (const input_method of ['typed', 'voice', 'mixed'] as const) {
      expect(
        validateCreateUserBugReport({
          description: 'Froze',
          input_method,
          page_path: '/organization/acme/today',
          app_version: '1.13.0',
        }),
      ).toMatchObject({
        input_method,
        page_path: '/organization/acme/today',
        app_version: '1.13.0',
      });
    }
  });

  it('accepts null context fields', () => {
    expect(
      validateCreateUserBugReport({
        description: 'Froze',
        input_method: 'voice',
        page_path: null,
        app_version: null,
      }),
    ).toMatchObject({ page_path: null, app_version: null });
  });

  it('refuses a missing, blank or too-long description', () => {
    expect(fieldOf({ input_method: 'typed' })).toBe('description');
    expect(fieldOf({ description: '   ', input_method: 'typed' })).toBe('description');
    expect(
      fieldOf({
        description: 'x'.repeat(USER_BUG_REPORT_DESCRIPTION_MAX_LENGTH + 1),
        input_method: 'typed',
      }),
    ).toBe('description');
  });

  it('refuses an unknown input method', () => {
    expect(fieldOf({ description: 'Froze', input_method: 'telepathy' })).toBe('input_method');
  });

  it('refuses a page path that is not an in-app path', () => {
    expect(
      fieldOf({ description: 'Froze', input_method: 'typed', page_path: 'https://evil.example' }),
    ).toBe('page_path');
  });

  // feat-bug-report BR4: the reporter comes from the session — a body naming one is refused.
  it('refuses a body that names the reporter', () => {
    for (const extra of [{ user_id: 'usr_x' }, { name: 'Someone else' }, { email: 'a@b.c' }]) {
      expect(() =>
        validateCreateUserBugReport({ description: 'Froze', input_method: 'typed', ...extra }),
      ).toThrow(ValidationError);
    }
  });
});
