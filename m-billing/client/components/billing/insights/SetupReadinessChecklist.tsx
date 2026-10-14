'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { BillingApi } from '@/lib/billing-api';
import type {
  BillingDashboardKpis,
  BillingSetupItemStatus,
} from '@/lib/billing-shared/types';
import { billingUi } from '../billingUi';

const CC = {
  navy: '#1C0770',
  lemon: '#F1FF5E',
  green: '#22c55e',
  red: '#f87171',
} as const;

type Props = {
  api: BillingApi;
};

/**
 * Live setup readiness checklist from GET /billing/dashboard.
 * Hosted on Marketing Insights (moved off Payables).
 */
export function SetupReadinessChecklist({ api }: Props) {
  const [items, setItems] = useState<BillingSetupItemStatus[]>([]);
  const [readinessPercent, setReadinessPercent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getDashboard();
      const md = (res.data as BillingDashboardKpis | undefined)?.masterData;
      setItems(md?.setupItems ?? []);
      setReadinessPercent(md?.readinessPercent ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load setup checklist');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div
        className={`${billingUi.insightsCard} h-[140px] animate-pulse`}
        aria-busy="true"
        aria-label="Loading setup readiness checklist"
      />
    );
  }

  if (error) {
    return (
      <div className={billingUi.alertDanger} role="alert">
        {error}{' '}
        <button type="button" onClick={() => void load()} className="underline">
          Retry
        </button>
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className={`${billingUi.insightsCard} billing-tile-enter p-4`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-[13px] font-semibold text-[color:var(--billing-heading)] sm:text-sm">
          Setup readiness checklist
        </h3>
        <span className="text-xs font-semibold tabular-nums text-[color:var(--billing-info)] sm:text-sm">
          {readinessPercent}% ready
        </span>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <SetupTile key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function SetupTile({ item }: { item: BillingSetupItemStatus }) {
  const done = item.status === 'complete';
  const partial = item.status === 'partial';
  const mark = done ? '✓' : partial ? '!' : '–';
  const bg = done ? CC.green : partial ? CC.lemon : CC.red;
  const ink = done || partial ? CC.navy : '#0b1020';
  return (
    <Link
      href={item.href}
      scroll={false}
      className="billing-tile-glow flex items-center gap-2.5 rounded-[var(--billing-radius)] border border-[color:var(--billing-border)] bg-[color:var(--billing-surface-muted)] px-2.5 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--billing-info)]"
    >
      <span
        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded text-[11px] font-bold"
        style={{ background: bg, color: ink }}
        aria-hidden
      >
        {mark}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[color:var(--billing-text)]">
        {item.label}
      </span>
      <span className="shrink-0 text-[11px] text-[color:var(--billing-text-muted)]">
        {item.detail ?? (done ? 'Done' : partial ? 'Partial' : 'Missing')}
      </span>
    </Link>
  );
}
