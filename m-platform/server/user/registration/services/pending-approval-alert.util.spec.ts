import {
  isPendingApprovalRecord,
  resolvePendingSubmittedAt,
  shouldAlertStalePending,
} from './pending-approval-alert.util';

describe('pending-approval-alert.util', () => {
  it('treats submitted registrations as pending and skips invites/rejects', () => {
    expect(
      isPendingApprovalRecord({
        approvalStatus: 'pending',
        accountStatus: 'pending',
      }),
    ).toBe(true);
    expect(
      isPendingApprovalRecord({
        accountStatus: 'invited',
        approvalStatus: 'pending',
      }),
    ).toBe(false);
    expect(
      isPendingApprovalRecord({
        approvalStatus: 'rejected',
        accountStatus: 'pending',
      }),
    ).toBe(false);
  });

  it('uses registration.submitted activity time when present', () => {
    const submittedAt = new Date('2026-09-20T10:00:00.000Z');
    expect(
      resolvePendingSubmittedAt({
        lastActivityAt: '2026-09-21T10:00:00.000Z',
        createdAt: '2026-09-01T00:00:00.000Z',
        registrationActivity: [
          { action: 'invite.sent', createdAt: '2026-09-01T00:00:00.000Z' },
          { action: 'registration.submitted', createdAt: submittedAt },
        ],
      }).toISOString(),
    ).toBe(submittedAt.toISOString());
  });

  it('alerts after 24 hours and again after another 24 hours', () => {
    const submittedAt = new Date('2026-09-19T10:00:00.000Z');
    const now = new Date('2026-09-21T11:00:00.000Z');
    expect(shouldAlertStalePending(submittedAt, undefined, now)).toBe(true);
    expect(
      shouldAlertStalePending(
        submittedAt,
        new Date('2026-09-20T10:30:00.000Z'),
        now,
      ),
    ).toBe(true);
    expect(
      shouldAlertStalePending(
        submittedAt,
        new Date('2026-09-21T10:30:00.000Z'),
        now,
      ),
    ).toBe(false);
    expect(
      shouldAlertStalePending(
        new Date('2026-09-21T00:00:00.000Z'),
        undefined,
        now,
      ),
    ).toBe(false);
  });
});
