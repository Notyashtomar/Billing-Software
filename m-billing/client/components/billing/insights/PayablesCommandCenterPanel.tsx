'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingDashboardKpis } from '@/lib/billing-shared/types';
import { billingUi } from '../billingUi';

type FunnelTone = 'navy' | 'lemon' | 'royal' | 'sky';

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

function formatCount(n: number) {
  return new Intl.NumberFormat('en-IN').format(n);
}

function formatCompactInr(n: number) {
  if (!Number.isFinite(n) || n === 0) return '₹0';
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

type Props = {
  api: BillingApi;
};

/**
 * Command Center KPIs / funnel — compact strip hosted inside Payables Insights.
 * Setup readiness checklist lives on Marketing Insights.
 */
export function PayablesCommandCenterPanel({ api }: Props) {
  const [kpis, setKpis] = useState<BillingDashboardKpis>(EMPTY_KPIS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getDashboard();
      setKpis((res.data as BillingDashboardKpis) ?? EMPTY_KPIS);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load command KPIs');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const md = kpis.masterData;
  const sources = kpis.operationalSources ?? [];
  const prepTotal = sources.reduce((n, s) => n + s.total, 0);
  const postedCount = kpis.postedThisMonth?.count ?? kpis.checker.postedThisMonth;
  const postedAmt = kpis.postedThisMonth?.totalInclTax ?? kpis.checker.postedTotalInclTax;

  const funnel: Array<{
    id: string;
    label: string;
    value: string;
    sub: string;
    href: string;
    tone: FunnelTone;
  }> = [
    {
      id: 'setup',
      label: 'Setup',
      value: `${md.readinessPercent}%`,
      sub: `${formatCount(md.customers.active)} customers`,
      href: '/billing/settings',
      tone: 'navy',
    },
    {
      id: 'ops',
      label: 'Ops capture',
      value: formatCount(prepTotal || kpis.readyForInvoice + kpis.pendingPreparation),
      sub: `${formatCount(kpis.readyForInvoice)} ready`,
      href: '/billing/billed-services',
      tone: 'lemon',
    },
    {
      id: 'compose',
      label: 'In composition',
      value: formatCount(kpis.draftsAwaitingApproval),
      sub: 'awaiting approval',
      href: '/billing/review',
      tone: 'royal',
    },
    {
      id: 'posted',
      label: 'Posted MTD',
      value: formatCompactInr(postedAmt),
      sub: `${formatCount(postedCount)} invoices`,
      href: '/billing/invoices?status=posted',
      tone: 'sky',
    },
  ];

  const actionKpis = [
    {
      id: 'ready',
      label: 'Ready for invoice',
      value: formatCount(kpis.readyForInvoice),
      href: '/billing/preparation?tab=ready',
      hint: 'Prep cleared',
    },
    {
      id: 'drafts',
      label: 'Drafts pending',
      value: formatCount(kpis.maker.draftInvoices),
      href: '/billing/invoice-drafts',
      hint: 'Maker queue',
    },
    {
      id: 'review',
      label: 'Pending approval',
      value: formatCount(kpis.checker.pendingApproval),
      href: '/billing/review',
      hint: 'Checker queue',
    },
    {
      id: 'contracts',
      label: 'Active contracts',
      value: formatCount(md.contracts.active),
      href: '/billing/contracts',
      hint: md.contracts.draft
        ? `+${formatCount(md.contracts.draft)} draft`
        : 'Commercial live',
    },
  ] as const;

  return (
    <section
      className="space-y-3 billing-tile-enter"
      aria-label="Billing command summary"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className={billingUi.sectionTitle}>Command summary</h2>
          <p className={billingUi.sectionDesc}>
            Live setup → ops → workflow funnel (merged from Command Center)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent)] px-2.5 py-1 font-semibold text-[color:var(--billing-accent-strong)]">
            Station {md.stationCode}
          </span>
          <span className="rounded-full border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] px-2.5 py-1 font-medium text-[color:var(--billing-text-muted)]">
            {loading
              ? 'Syncing…'
              : md.nativeBillingEnabled
                ? 'Native billing live'
                : 'Native billing off'}
          </span>
        </div>
      </div>

      {error ? (
        <div className={billingUi.alertDanger} role="alert">
          {error}{' '}
          <button type="button" onClick={() => void load()} className="underline">
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <div
          className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4"
          aria-busy="true"
        >
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-[88px] animate-pulse rounded-[var(--billing-radius-lg)] bg-[color:var(--billing-surface-muted)]"
            />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {funnel.map((stage, idx) => (
              <Link
                key={stage.id}
                href={stage.href}
                scroll={false}
                className={`billing-insights-funnel billing-insights-funnel--${stage.tone} billing-tile-glow billing-tile-enter billing-tile-enter-delay-${(idx % 4) + 1} relative overflow-hidden rounded-[var(--billing-radius-lg)] px-3.5 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--billing-info)]`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--billing-insights-funnel-ink)] opacity-70">
                      Funnel · {idx + 1}
                    </div>
                    <div className="mt-0.5 text-sm font-semibold text-[color:var(--billing-insights-funnel-ink)] sm:text-[15px]">
                      {stage.label}
                    </div>
                  </div>
                  <div className="shrink-0 text-2xl font-bold leading-none tabular-nums text-[color:var(--billing-insights-funnel-ink)] sm:text-[28px]">
                    {stage.value}
                  </div>
                </div>
                <div className="mt-1.5 text-xs text-[color:var(--billing-insights-funnel-ink)] opacity-75">
                  {stage.sub}
                </div>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {actionKpis.map((k, idx) => (
              <Link
                key={k.id}
                href={k.href}
                scroll={false}
                className={`${billingUi.insightsCard} ${billingUi.tileGlow} billing-tile-enter-delay-${(idx % 4) + 1} block p-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--billing-info)]`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="min-w-0 text-sm font-semibold leading-snug text-[color:var(--billing-text-muted)] sm:text-base">
                    {k.label}
                  </p>
                  <p className="shrink-0 text-2xl font-bold tabular-nums leading-none text-[color:var(--billing-heading)] sm:text-3xl">
                    {k.value}
                  </p>
                </div>
                <p className="mt-1.5 text-xs text-[color:var(--billing-text-muted)]">
                  {k.hint}
                </p>
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
