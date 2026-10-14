'use client';

import { useCallback, useEffect, useState } from 'react';
import { BillingPageHeader } from '../BillingLayout';
import {
  BillingDashboardView,
  type BillingDashboardFocus,
} from './BillingDashboardView';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingDashboardKpis } from '@/lib/billing-shared/types';

const EMPTY_KPIS: BillingDashboardKpis = {
  pendingPreparation: 0,
  validationErrors: 0,
  draftsAwaitingApproval: 0,
  readyForInvoice: 0,
  postedThisMonth: { count: 0, totalInclTax: 0 },
  maker: {
    eligible: 0,
    pending: 0,
    validationErrors: 0,
    rejected: 0,
    readyForInvoice: 0,
    invoiced: 0,
    draftInvoices: 0,
  },
  checker: {
    pendingApproval: 0,
    approved: 0,
    generated: 0,
    postedThisMonth: 0,
    postedTotalInclTax: 0,
    creditMemosDraft: 0,
    creditMemosPosted: 0,
  },
  masterData: {
    stationCode: '—',
    cutoverPhase: 'parallel',
    nativeBillingEnabled: false,
    customers: { total: 0, active: 0 },
    serviceCatalog: { total: 0, active: 0 },
    contracts: { total: 0, active: 0, draft: 0 },
    rateCards: 0,
    taxRules: 0,
    exchangeRates: 0,
    sequences: { total: 0, hasInvoice: false, hasCreditMemo: false },
    stationProfile: { status: 'missing', missingFields: [] },
    setupItems: [],
    readinessPercent: 0,
  },
  operationalSources: [],
};

const FOCUS_COPY: Record<
  BillingDashboardFocus,
  { title: string; description: string }
> = {
  master: {
    title: 'Billing Command Center',
    description:
      'Master Data → Billed Services → Workflow — setup readiness, ops capture, and revenue in one funnel',
  },
  prep: {
    title: 'Workflow dashboard',
    description:
      'Prep → draft → approve → PDF → post — maker and checker queues for the invoice pipeline',
  },
  sources: {
    title: 'Billed Services dashboard',
    description:
      'Ops usage capture — queue health by source (BHS, ADS, Equipment, Manpower, RAF, MAAS) and readiness for invoice',
  },
};

type Props = {
  api: BillingApi;
  focus?: BillingDashboardFocus;
};

/**
 * BC: Role center
 * Audit: BC_DATA_FLOW.md
 * FRIS: /billing/prep-dashboard | /billing/billed-services
 * (Master Command Center merged into /billing/insights/payables; /billing/dashboard redirects there.)
 * API: GET /billing/dashboard
 */
export function BillingDashboardPage({ api, focus = 'master' }: Props) {
  const [kpis, setKpis] = useState<BillingDashboardKpis>(EMPTY_KPIS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const copy = FOCUS_COPY[focus];

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getDashboard();
      setKpis((res.data as BillingDashboardKpis) ?? EMPTY_KPIS);
      setSyncedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const station = kpis.masterData.stationCode;
  const native = kpis.masterData.nativeBillingEnabled;

  return (
    <>
      <BillingPageHeader title={copy.title} description={copy.description} />

      <div className="mb-4 flex flex-wrap items-center gap-2" aria-live="polite">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F1FF5E] bg-[#F1FF5E] px-2.5 py-1 text-[11.5px] font-semibold text-[#1C0770]">
          Station {station}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] px-2.5 py-1 text-[11.5px] font-semibold text-[color:var(--billing-text-muted)] shadow-sm">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: native ? '#1C0770' : '#F1FF5E' }}
            aria-hidden
          />
          {loading
            ? 'Syncing…'
            : syncedAt
              ? `Live · synced ${syncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Waiting for data'}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] px-2.5 py-1 text-[11.5px] font-semibold text-[color:var(--billing-text-muted)] shadow-sm">
          {native ? 'Native billing live' : 'Native billing off'} ·{' '}
          {kpis.masterData.cutoverPhase.replace(/_/g, ' ')}
        </span>
      </div>

      {error ? (
        <div
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
          <button type="button" onClick={() => void load()} className="ml-2 underline">
            Retry
          </button>
        </div>
      ) : null}
      {loading ? (
        <div className="space-y-6" aria-busy="true" aria-live="polite">
          <div className="h-[140px] animate-pulse rounded-[14px] bg-gray-200" />
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-[14px] bg-gray-200" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-72 animate-pulse rounded-[14px] bg-gray-200" />
            ))}
          </div>
        </div>
      ) : (
        <BillingDashboardView kpis={kpis} focus={focus} />
      )}
    </>
  );
}
