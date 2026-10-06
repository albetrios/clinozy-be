import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/shared/errors/index.js';
import {
  validateCreateOrganization,
  validateListOrganizationsQuery,
  validateUpdateOrganization,
  validateUploadLogo,
} from '@/domains/tenancy/sub-domains/organization/organization.validator.js';

describe('organization.validator', () => {
  it('validateCreateOrganization accepts name and slug', () => {
    expect(validateCreateOrganization({ name: 'Acme', slug: 'acme-corp' })).toEqual({
      name: 'Acme',
      slug: 'acme-corp',
    });
  });

  it('validateCreateOrganization rejects invalid slug', () => {
    expect(() => validateCreateOrganization({ name: 'Acme', slug: 'Invalid Slug!' })).toThrow(
      ValidationError,
    );
  });

  it('validateUpdateOrganization accepts partial fields', () => {
    expect(validateUpdateOrganization({ status: 'SUSPENDED' })).toEqual({
      status: 'SUSPENDED',
    });
  });

  it('validateListOrganizationsQuery applies pagination defaults', () => {
    expect(validateListOrganizationsQuery({})).toMatchObject({ limit: 25 });
  });

  it('validateListOrganizationsQuery rejects rejects a page query parameter (cursor-only, strict query)', () => {
    // `page` is not a parameter of any list query — the strict schema refuses it like any other
    // unknown key.
    expect(() => validateListOrganizationsQuery({ page: '2', limit: '5' })).toThrow(
      ValidationError,
    );
  });

  it('validateUploadLogo accepts organization-logos key prefix', () => {
    expect(validateUploadLogo({ key: 'organization-logos/abc.png' })).toEqual({
      key: 'organization-logos/abc.png',
    });
  });

  it('validateUploadLogo rejects key without required prefix', () => {
    expect(() => validateUploadLogo({ key: 'avatars/abc.png' })).toThrow(ValidationError);
  });

  it('R13: validateUploadLogo rejects key containing path traversal (..)', () => {
    expect(() => validateUploadLogo({ key: 'organization-logos/../../secret.png' })).toThrow(
      ValidationError,
    );
  });

  it('validateUpdateOrganization rejects invalid status', () => {
    expect(() => validateUpdateOrganization({ status: 'DELETED' })).toThrow(ValidationError);
  });

  it('validateUpdateOrganization rejects logo_url (use PUT logo with upload key)', () => {
    expect(() => validateUpdateOrganization({ logo_url: 'https://example.com/logo.png' })).toThrow(
      ValidationError,
    );
  });
});
