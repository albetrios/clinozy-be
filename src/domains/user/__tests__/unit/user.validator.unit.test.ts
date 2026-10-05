import { describe, expect, it } from 'vitest';
import { PAGINATION } from '@/shared/constants/pagination.constants.js';
import { ValidationError } from '@/shared/errors/index.js';
import {
  validateAdminUpdateUser,
  validateListUsers,
  validateUpdateMe,
  validateUploadAvatar,
} from '@/domains/user/user.validator.js';

describe('user.validator', () => {
  it('validateUpdateMe accepts partial profile fields', () => {
    expect(validateUpdateMe({ first_name: 'Jane' })).toEqual({ first_name: 'Jane' });
  });

  it('validateUpdateMe accepts first_name, last_name and job_title together', () => {
    expect(validateUpdateMe({ first_name: 'Nik', last_name: 'Patel', job_title: 'CEO' })).toEqual({
      first_name: 'Nik',
      last_name: 'Patel',
      job_title: 'CEO',
    });
  });

  it('validateUpdateMe rejects job_title longer than 150 characters', () => {
    expect(() => validateUpdateMe({ job_title: 'a'.repeat(151) })).toThrow(ValidationError);
  });

  it('validateUpdateMe rejects avatar_url (use avatar_key via upload flow)', () => {
    expect(() => validateUpdateMe({ avatar_url: 'https://example.com/a.png' })).toThrow(
      ValidationError,
    );
  });

  it('validateUpdateMe rejects avatar_key without avatars/ prefix', () => {
    expect(() => validateUpdateMe({ avatar_key: 'uploads/photo.png' })).toThrow(ValidationError);
  });

  it('R13: validateUpdateMe rejects avatar_key containing path traversal (..)', () => {
    expect(() => validateUpdateMe({ avatar_key: 'avatars/user-1/../../etc/passwd' })).toThrow(
      ValidationError,
    );
  });

  it('validateListUsers applies pagination defaults', () => {
    expect(validateListUsers({})).toMatchObject({ limit: 25 });
  });

  it('validateAdminUpdateUser accepts status', () => {
    expect(validateAdminUpdateUser({ status: 'SUSPENDED' })).toEqual({ status: 'SUSPENDED' });
  });

  it('validateListUsers rejects invalid status filter', () => {
    expect(() => validateListUsers({ status: 'INVALID' })).toThrow(ValidationError);
  });

  it('sec-new-U1: validateListUsers rejects an after cursor longer than PAGINATION.MAX_CURSOR_LENGTH', () => {
    expect(() =>
      validateListUsers({ after: 'a'.repeat(PAGINATION.MAX_CURSOR_LENGTH + 1) }),
    ).toThrow(ValidationError);
  });

  it('sec-new-U1: validateListUsers accepts an after cursor of exactly PAGINATION.MAX_CURSOR_LENGTH', () => {
    const result = validateListUsers({ after: 'a'.repeat(PAGINATION.MAX_CURSOR_LENGTH) });
    expect(result.after).toHaveLength(PAGINATION.MAX_CURSOR_LENGTH);
  });

  it('validateListUsers rejects rejects a page query parameter (cursor-only, strict query)', () => {
    // `page` is not a parameter of any list query — the strict schema refuses it like any other
    // unknown key.
    expect(() => validateListUsers({ page: '1', limit: '10' })).toThrow(ValidationError);
  });

  it('validateUpdateMe rejects strict unknown keys', () => {
    expect(() => validateUpdateMe({ first_name: 'Jane', unknown: true })).toThrow(ValidationError);
  });

  it('validateUploadAvatar accepts avatar_key with avatars/ prefix', () => {
    expect(validateUploadAvatar({ avatar_key: 'avatars/user-1/photo.png' })).toEqual({
      avatar_key: 'avatars/user-1/photo.png',
    });
  });

  it('validateUploadAvatar rejects missing avatar_key', () => {
    expect(() => validateUploadAvatar({})).toThrow(ValidationError);
  });

  it('validateUploadAvatar rejects avatar_key without avatars/ prefix', () => {
    expect(() => validateUploadAvatar({ avatar_key: 'uploads/photo.png' })).toThrow(
      ValidationError,
    );
  });

  it('R13: validateUploadAvatar rejects avatar_key with a control character', () => {
    expect(() => validateUploadAvatar({ avatar_key: 'avatars/user-1/x\u0001.png' })).toThrow(
      ValidationError,
    );
  });

  it('validateUploadAvatar rejects strict unknown keys', () => {
    expect(() =>
      validateUploadAvatar({ avatar_key: 'avatars/user-1/photo.png', extra: true }),
    ).toThrow(ValidationError);
  });
});
