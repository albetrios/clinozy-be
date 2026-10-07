import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/shared/errors/index.js';
import {
  validateCreateMembership,
  validateListMembershipsQuery,
  validateTransferOwnership,
  validateUpdateMembership,
} from '@/domains/tenancy/sub-domains/membership/membership.validator.js';

describe('membership validators', () => {
  it('validateCreateMembership accepts email + role_ids, normalizes the email, and defaults expires_in_days', () => {
    const result = validateCreateMembership({
      email: '  Invitee@Example.com ',
      role_ids: ['rolepublicid1234567'],
    });
    expect(result.email).toBe('invitee@example.com');
    expect(result.role_ids).toEqual(['rolepublicid1234567']);
    expect(result.expires_in_days).toBe(7);
  });

  it('validateCreateMembership rejects a malformed email', () => {
    expect(() =>
      validateCreateMembership({ email: 'not-an-email', role_ids: ['rolepublicid1234567'] }),
    ).toThrow(ValidationError);
  });

  it('validateCreateMembership rejects the legacy user_id field (REQ-1: body is now email-based)', () => {
    expect(() =>
      validateCreateMembership({
        user_id: 'userpublicid1234567',
        role_ids: ['rolepublicid1234567'],
      }),
    ).toThrow(ValidationError);
  });

  it('validateUpdateMembership accepts status', () => {
    expect(validateUpdateMembership({ status: 'ACTIVE' })).toEqual({ status: 'ACTIVE' });
  });

  it('validateListMembershipsQuery applies defaults', () => {
    expect(validateListMembershipsQuery({})).toMatchObject({ limit: 25 });
  });

  it('validateListMembershipsQuery accepts and trims a q search term', () => {
    expect(validateListMembershipsQuery({ q: '  alice  ' })).toMatchObject({ q: 'alice' });
  });

  it('validateListMembershipsQuery rejects an over-long q term and unknown keys (strict)', () => {
    expect(() => validateListMembershipsQuery({ q: 'a'.repeat(201) })).toThrow(ValidationError);
    expect(() => validateListMembershipsQuery({ bogus: 1 })).toThrow(ValidationError);
  });

  it('validateListMembershipsQuery rejects rejects a page query parameter (cursor-only, strict query)', () => {
    // `page` is not a parameter of any list query — the strict schema refuses it like any other
    // unknown key.
    expect(() => validateListMembershipsQuery({ page: '1', limit: '10' })).toThrow(ValidationError);
  });

  it('validateTransferOwnership accepts new_owner_user_id', () => {
    expect(validateTransferOwnership({ new_owner_user_id: 'newownerpublicid12' })).toEqual({
      new_owner_user_id: 'newownerpublicid12',
    });
  });

  it('validateCreateMembership throws for missing fields', () => {
    expect(() => validateCreateMembership({})).toThrow(ValidationError);
  });

  it('validateUpdateMembership rejects invalid status', () => {
    expect(() => validateUpdateMembership({ status: 'DELETED' })).toThrow(ValidationError);
  });

  it('validateUpdateMembership accepts a role_id-only update (REQ-3)', () => {
    expect(validateUpdateMembership({ role_ids: ['rolepublicid1234567'] })).toMatchObject({
      role_ids: ['rolepublicid1234567'],
    });
  });

  it('validateUpdateMembership accepts status + role_id together (REQ-3)', () => {
    expect(
      validateUpdateMembership({ status: 'SUSPENDED', role_ids: ['rolepublicid1234567'] }),
    ).toMatchObject({ status: 'SUSPENDED', role_ids: ['rolepublicid1234567'] });
  });

  it('validateUpdateMembership rejects an empty body (at least one of status/role_id)', () => {
    expect(() => validateUpdateMembership({})).toThrow(ValidationError);
  });
});
