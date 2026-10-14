'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingInvoiceHeader } from '@/lib/billing-shared/types';
import { BILLING_QUERY_PARTS, billingQueryKey } from './query-keys';
import { useBillingWorkspaceIdentity } from './store';

type Row = Record<string, unknown>;

export function useBillingCreditMemosQuery(api: BillingApi) {
  const identity = useBillingWorkspaceIdentity();
  return useQuery({
    queryKey: billingQueryKey(identity, BILLING_QUERY_PARTS.creditMemos),
    queryFn: async () => {
      const res = await api.listCreditMemos();
      return (res.data ?? []) as Row[];
    },
    enabled: Boolean(identity?.userId),
  });
}

export function useBillingReportsQuery(api: BillingApi) {
  const identity = useBillingWorkspaceIdentity();
  return useQuery({
    queryKey: billingQueryKey(identity, BILLING_QUERY_PARTS.reports),
    queryFn: async () => {
      const res = await api.listReports();
      return (res.data ?? []) as Row[];
    },
    enabled: Boolean(identity?.userId),
  });
}

export function useBillingAuditLogsQuery(api: BillingApi) {
  const identity = useBillingWorkspaceIdentity();
  return useQuery({
    queryKey: billingQueryKey(identity, BILLING_QUERY_PARTS.auditLogs),
    queryFn: async () => {
      const res = await api.listAuditLogs();
      return ((res as { data?: { items?: unknown[] } }).data?.items ?? []) as Row[];
    },
    enabled: Boolean(identity?.userId),
  });
}

export function useBillingBackingSheetsQuery(api: BillingApi) {
  const identity = useBillingWorkspaceIdentity();
  return useQuery({
    queryKey: billingQueryKey(identity, BILLING_QUERY_PARTS.backingSheets),
    queryFn: async () => {
      const res = await api.listBackingSheets();
      return (res.data ?? []) as Row[];
    },
    enabled: Boolean(identity?.userId),
  });
}

export function useBillingReviewQueueQuery(
  api: BillingApi,
  showApproved: boolean,
) {
  const identity = useBillingWorkspaceIdentity();
  return useQuery({
    queryKey: billingQueryKey(
      identity,
      BILLING_QUERY_PARTS.reviewQueue,
      showApproved ? 'all' : 'pending',
    ),
    queryFn: async () => {
      const res = await api.listReviewQueue(
        showApproved ? { status: 'all' } : undefined,
      );
      return (res.data ?? []) as Array<
        BillingInvoiceHeader & { review?: { passed?: boolean } }
      >;
    },
    enabled: Boolean(identity?.userId),
  });
}

/** Invalidate after mutations that change shared billing lists. */
export function useInvalidateBillingQueries() {
  const identity = useBillingWorkspaceIdentity();
  const qc = useQueryClient();

  return {
    invalidateReports: () =>
      qc.invalidateQueries({
        queryKey: billingQueryKey(identity, BILLING_QUERY_PARTS.reports),
      }),
    invalidateReview: () =>
      qc.invalidateQueries({
        queryKey: billingQueryKey(identity, BILLING_QUERY_PARTS.reviewQueue),
      }),
    invalidateAudit: () =>
      qc.invalidateQueries({
        queryKey: billingQueryKey(identity, BILLING_QUERY_PARTS.auditLogs),
      }),
    invalidateBackingSheets: () =>
      qc.invalidateQueries({
        queryKey: billingQueryKey(identity, BILLING_QUERY_PARTS.backingSheets),
      }),
    invalidateCreditMemos: () =>
      qc.invalidateQueries({
        queryKey: billingQueryKey(identity, BILLING_QUERY_PARTS.creditMemos),
      }),
  };
}
