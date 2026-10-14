import type { BillingWorkspaceIdentity } from './types';

/**
 * Every Billing query key starts with userId + stationCode so a shared
 * QueryClient can never serve another user's cached rows.
 */
export function billingQueryKey(
  identity: BillingWorkspaceIdentity | null | undefined,
  ...parts: unknown[]
) {
  return [
    'billing',
    identity?.userId ?? '',
    identity?.stationCode ?? '',
    ...parts,
  ] as const;
}

export const BILLING_QUERY_PARTS = {
  creditMemos: 'credit-memos',
  reports: 'reports',
  auditLogs: 'audit-logs',
  backingSheets: 'backing-sheets',
  reviewQueue: 'review-queue',
} as const;
