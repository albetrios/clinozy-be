import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/shared/errors/index.js';
import {
  validateCreateMemberRole,
  validateListMemberRolesQuery,
  validateUpdateMemberRole,
} from '@/domains/tenancy/sub-domains/member-roles/member-role.validator.js';

describe('member-role validators', () => {
  it('validateCreateMemberRole accepts name', () => {
    expect(validateCreateMemberRole({ name: 'Editor' })).toEqual({ name: 'Editor' });
  });

  it('validateUpdateMemberRole accepts optional name', () => {
    expect(validateUpdateMemberRole({ name: 'Admin' })).toEqual({ name: 'Admin' });
  });

  it('validateListMemberRolesQuery applies defaults', () => {
    expect(validateListMemberRolesQuery({})).toMatchObject({ limit: 25 });
  });

  it('validateListMemberRolesQuery rejects rejects a page query parameter (cursor-only, strict query)', () => {
    // `page` is not a parameter of any list query — the strict schema refuses it like any other
    // unknown key.
    expect(() => validateListMemberRolesQuery({ page: '1', limit: '10' })).toThrow(ValidationError);
  });

  it('validateCreateMemberRole throws for empty name', () => {
    expect(() => validateCreateMemberRole({ name: '' })).toThrow(ValidationError);
  });

  it('validateCreateMemberRole rejects name over max length', () => {
    expect(() => validateCreateMemberRole({ name: 'x'.repeat(101) })).toThrow(ValidationError);
  });
});
