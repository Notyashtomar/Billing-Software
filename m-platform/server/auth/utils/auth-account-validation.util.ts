import { UnauthorizedException } from '@nestjs/common';

const INACTIVE_USER_STATUSES = new Set([
  'inactive',
  'disabled',
  'deactivated',
  'blocked',
  'deleted',
]);

export type UserAuthEligibilityInput = {
  accountStatus?: string | null;
  isActive?: boolean | null;
  approvalStatus?: string | null;
  registrationStatus?: string | null;
  status?: string | null;
};

export function isActiveUserStatus(raw: string | null | undefined): boolean {
  const status = String(raw ?? 'active').trim().toLowerCase();
  return !INACTIVE_USER_STATUSES.has(status);
}

export function isSessionInvalidatingUserStatus(
  raw: string | null | undefined,
): boolean {
  return !isActiveUserStatus(raw);
}

/** Shared login + per-request rules for FRIS user accounts. */
export function assertUserEligibleForAuthentication(
  user: UserAuthEligibilityInput,
): void {
  if (
    user.accountStatus !== 'active' ||
    user.isActive === false ||
    user.approvalStatus === 'pending' ||
    user.registrationStatus === 'invited'
  ) {
    throw new UnauthorizedException('Account is not active');
  }

  if (!isActiveUserStatus(user.status)) {
    throw new UnauthorizedException('Account is not active');
  }
}
