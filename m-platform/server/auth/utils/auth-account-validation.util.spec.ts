import { UnauthorizedException } from '@nestjs/common';
import {
  assertUserEligibleForAuthentication,
  isActiveUserStatus,
} from './auth-account-validation.util';

describe('auth-account-validation.util', () => {
  const activeUser = {
    accountStatus: 'active',
    isActive: true,
    approvalStatus: 'approved',
    registrationStatus: 'approved',
    status: 'Active',
  };

  it('allows active users', () => {
    expect(() => assertUserEligibleForAuthentication(activeUser)).not.toThrow();
  });

  it('rejects non-active accountStatus', () => {
    expect(() =>
      assertUserEligibleForAuthentication({
        ...activeUser,
        accountStatus: 'rejected',
      }),
    ).toThrow(UnauthorizedException);
  });

  it('rejects inactive isActive flag', () => {
    expect(() =>
      assertUserEligibleForAuthentication({ ...activeUser, isActive: false }),
    ).toThrow(UnauthorizedException);
  });

  it('rejects pending approvalStatus', () => {
    expect(() =>
      assertUserEligibleForAuthentication({
        ...activeUser,
        approvalStatus: 'pending',
      }),
    ).toThrow(UnauthorizedException);
  });

  it('rejects invited registrationStatus', () => {
    expect(() =>
      assertUserEligibleForAuthentication({
        ...activeUser,
        registrationStatus: 'invited',
      }),
    ).toThrow(UnauthorizedException);
  });

  it('rejects blocked legacy status values', () => {
    expect(isActiveUserStatus('blocked')).toBe(false);
    expect(() =>
      assertUserEligibleForAuthentication({ ...activeUser, status: 'blocked' }),
    ).toThrow(UnauthorizedException);
  });
});
