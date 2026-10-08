import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/shared/errors/index.js';
import {
  validateAcceptMembershipInvitation,
  validateResendMembershipInvitation,
} from '@/domains/tenancy/sub-domains/membership/membership-invitation/membership-invitation.validator.js';

describe('membership-invitation validators', () => {
  it('validateAcceptMembershipInvitation accepts a token', () => {
    expect(validateAcceptMembershipInvitation({ token: 'invite-token' })).toEqual({
      token: 'invite-token',
    });
  });

  it('validateAcceptMembershipInvitation rejects an empty token (strict)', () => {
    expect(() => validateAcceptMembershipInvitation({ token: '' })).toThrow(ValidationError);
  });

  it('validateResendMembershipInvitation applies default expires_in_days', () => {
    expect(validateResendMembershipInvitation({})).toEqual({ expires_in_days: 7 });
  });

  it('validateResendMembershipInvitation rejects expires_in_days outside 1..365', () => {
    expect(() => validateResendMembershipInvitation({ expires_in_days: 0 })).toThrow(
      ValidationError,
    );
    expect(() => validateResendMembershipInvitation({ expires_in_days: 366 })).toThrow(
      ValidationError,
    );
  });

  it('validateResendMembershipInvitation rejects unknown keys (strict)', () => {
    expect(() => validateResendMembershipInvitation({ foo: 'bar' })).toThrow(ValidationError);
  });
});
