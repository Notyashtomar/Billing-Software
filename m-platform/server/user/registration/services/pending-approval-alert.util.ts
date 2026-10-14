export const PENDING_APPROVAL_STALE_MS = 24 * 60 * 60 * 1000;

export type PendingApprovalAlertCandidate = {
  approvalStatus?: string;
  accountStatus?: string;
  registrationStatus?: string;
  inviteStatus?: string;
  registrationActivity?: Array<{
    action?: string;
    createdAt?: Date | string;
  }>;
  lastActivityAt?: Date | string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  staleApprovalAlertSentAt?: Date | string;
};

export function isPendingApprovalRecord(
  user: PendingApprovalAlertCandidate,
): boolean {
  const rejected =
    user.approvalStatus === 'rejected' ||
    user.accountStatus === 'rejected' ||
    user.registrationStatus === 'rejected';
  if (rejected) return false;
  if (user.accountStatus === 'invited') return false;
  return (
    user.approvalStatus === 'pending' ||
    user.accountStatus === 'pending' ||
    user.registrationStatus === 'pending'
  );
}

export function resolvePendingSubmittedAt(
  user: PendingApprovalAlertCandidate,
): Date {
  const submitted = [...(user.registrationActivity ?? [])]
    .reverse()
    .find((entry) => entry.action === 'registration.submitted');
  const raw =
    submitted?.createdAt ??
    user.lastActivityAt ??
    user.updatedAt ??
    user.createdAt;
  const parsed = raw ? new Date(raw) : new Date(0);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

export function shouldAlertStalePending(
  submittedAt: Date,
  alertSentAt: Date | undefined,
  now: Date,
  windowMs = PENDING_APPROVAL_STALE_MS,
): boolean {
  if (now.getTime() - submittedAt.getTime() < windowMs) return false;
  if (!alertSentAt) return true;
  return now.getTime() - alertSentAt.getTime() >= windowMs;
}
