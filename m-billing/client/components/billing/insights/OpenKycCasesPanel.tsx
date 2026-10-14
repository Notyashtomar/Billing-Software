'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingKycCase } from '@/lib/billing-shared/types';
import { billingUi } from '../billingUi';
import { StatusBadge } from '../StatusBadge';

type Props = {
  api: BillingApi;
};

const OPEN_STATUSES = 'invited,in_progress,submitted';
const TRACKER_HREF = `/billing/kyc?status=${encodeURIComponent(OPEN_STATUSES)}`;
const MAX_ROWS = 6;

/**
 * Open airline KYC cases — Marketing Insights shortcut into the Master KYC tracker.
 */
export function OpenKycCasesPanel({ api }: Props) {
  const [rows, setRows] = useState<BillingKycCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.listKycCases({ status: OPEN_STATUSES, limit: 20 });
      const data = (res as { data?: BillingKycCase[] }).data ?? [];
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : 'Could not load KYC cases');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = rows.slice(0, MAX_ROWS);
  const extra = Math.max(0, rows.length - visible.length);

  return (
    <section
      className={`${billingUi.insightsCard} billing-tile-enter billing-tile-enter-delay-2 flex h-full min-h-[10.5rem] flex-col p-4 sm:min-h-[11.5rem] sm:p-5`}
      aria-label="Open airline KYC cases"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="m-0 text-sm font-semibold text-[color:var(--billing-heading)] sm:text-base">
            Airline KYC open
          </h2>
          <p className="m-0 mt-0.5 text-[11px] text-[color:var(--billing-text-muted)] sm:text-xs">
            Invited, in progress, or submitted — finish review in Master → KYC
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!loading && !error ? (
            <span className="rounded-full border border-[color:var(--billing-warning-border)] bg-[color:var(--billing-warning-soft)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[color:var(--billing-warning)]">
              {rows.length}
            </span>
          ) : null}
          <Link href={TRACKER_HREF} scroll={false} className={`${billingUi.link} text-sm`}>
            Open KYC
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 flex-col gap-2" aria-busy="true" aria-label="Loading KYC cases">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-11 animate-pulse rounded-[var(--billing-radius)] bg-[color:var(--billing-surface-muted)]"
            />
          ))}
        </div>
      ) : null}

      {!loading && error ? (
        <div
          className="flex flex-1 flex-col justify-center rounded-[var(--billing-radius)] border border-[color:var(--billing-danger-border)] bg-[color:var(--billing-surface-muted)] p-3"
          role="alert"
        >
          <p className="m-0 text-sm font-medium text-[color:var(--billing-heading)]">
            KYC list unavailable
          </p>
          <p className="m-0 mt-1 text-xs text-[color:var(--billing-text-muted)]">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className={`${billingUi.btnSecondary} mt-2 self-start px-3 py-1.5 text-xs`}
          >
            Retry
          </button>
        </div>
      ) : null}

      {!loading && !error && visible.length === 0 ? (
        <div className="flex flex-1 flex-col items-start justify-center rounded-[var(--billing-radius)] border border-dashed border-[color:var(--billing-border-strong)] bg-[color:var(--billing-surface-muted)] px-3 py-4">
          <p className="m-0 text-sm font-semibold text-[color:var(--billing-heading)]">
            No open KYC cases
          </p>
          <p className="m-0 mt-1 text-xs text-[color:var(--billing-text-muted)]">
            Start a case from Master → KYC when onboarding an airline.
          </p>
          <Link href="/billing/kyc" scroll={false} className={`${billingUi.link} mt-2 text-sm`}>
            Go to KYC tracker
          </Link>
        </div>
      ) : null}

      {!loading && !error && visible.length > 0 ? (
        <ul className="m-0 flex flex-1 list-none flex-col gap-1.5 p-0">
          {visible.map((row) => (
            <li key={row._id}>
              <Link
                href={`/billing/kyc/${row._id}`}
                scroll={false}
                className="flex items-center justify-between gap-2 rounded-[var(--billing-radius)] border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] px-2.5 py-2 text-sm transition hover:border-[color:var(--billing-border-strong)] hover:bg-[color:var(--billing-surface-muted)]"
              >
                <span className="min-w-0 truncate font-medium text-[color:var(--billing-heading)]">
                  {row.customerName || row.customerCode}
                  <span className="ml-1.5 font-normal text-[color:var(--billing-text-muted)]">
                    {row.customerCode}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums text-[11px] text-[color:var(--billing-text-muted)]">
                    {Math.round(row.completenessPercent ?? 0)}%
                  </span>
                  <StatusBadge status={row.status} />
                </span>
              </Link>
            </li>
          ))}
          {extra > 0 ? (
            <li className="pt-1 text-center text-xs text-[color:var(--billing-text-muted)]">
              <Link href={TRACKER_HREF} scroll={false} className={billingUi.link}>
                +{extra} more in tracker
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}
