'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type {
  BillingDashboardKpis,
  BillingOperationalSourceStatus,
  BillingSetupItemStatus,
  BillingSetupStatus,
} from '@/lib/billing-shared/types';
import { billingUi } from '../billingUi';

export type BillingDashboardFocus = 'master' | 'prep' | 'sources';

/** Color Hunt: #1C0770 navy · #F1FF5E lemon · #261CC1 royal · #3A9AFF sky. */
const CC = {
  teal: '#1C0770',
  amber: '#F1FF5E',
  violet: '#261CC1',
  green: '#166534',
  sky: '#3A9AFF',
  red: '#E5484D',
  tealGrad: 'linear-gradient(135deg,#150558,#1C0770)',
  amberGrad: 'linear-gradient(135deg,#d9e84a,#F1FF5E)',
  violetGrad: 'linear-gradient(135deg,#1e1699,#261CC1)',
  greenGrad: 'linear-gradient(135deg,#1C0770,#261CC1)',
  onYellow: '#1C0770',
  onBlue: '#FFFFFF',
} as const;

const SOURCE_COLORS = [CC.teal, CC.amber, CC.violet, CC.sky, '#150558', '#9dcbff'] as const;

function formatInr(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatCompactInr(n: number) {
  if (!Number.isFinite(n) || n === 0) return '₹0';
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) {
    return `₹${(n / 1_00_00_000).toFixed(2)}Cr`;
  }
  if (abs >= 1_00_000) {
    return `₹${(n / 1_00_000).toFixed(1)}L`;
  }
  return formatInr(n);
}

function formatCount(n: number) {
  return new Intl.NumberFormat('en-IN').format(n);
}

function formatCompactCount(n: number) {
  if (n >= 1000) {
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`;
  }
  return formatCount(n);
}

function pct(part: number, whole: number) {
  if (!whole || whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}

function sourceAbbrev(label: string, sourceType: string) {
  const raw = (label || sourceType || '').replace(/_/g, ' ').trim();
  if (!raw) return 'SRC';
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/** Kept for any external imports; command-center views use CcKpi. */
export function KpiCard({
  label,
  value,
  sub,
  href,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
  tone?: 'default' | 'warning' | 'success' | 'danger';
}) {
  const toneCls =
    tone === 'warning'
      ? billingUi.kpiWarning
      : tone === 'success'
        ? billingUi.kpiSuccess
        : tone === 'danger'
          ? billingUi.kpiDanger
          : billingUi.kpiDefault;

  const inner = (
    <div className={toneCls}>
      <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--billing-text-muted)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-[color:var(--billing-heading)]">
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-[color:var(--billing-text-muted)]">{sub}</p> : null}
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        scroll={false}
        className="block transition-opacity duration-150 hover:opacity-90"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[14px] border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] p-5 shadow-[0_1px_2px_rgba(15,27,45,.04),0_8px_24px_-12px_rgba(15,27,45,.10)] ${className}`}
    >
      {children}
    </div>
  );
}

function SectionHead({
  title,
  description,
  swatch,
  route,
}: {
  title: string;
  description: string;
  swatch: string;
  route?: string;
}) {
  return (
    <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2.5">
        <div className="h-[26px] w-[9px] shrink-0 rounded" style={{ background: swatch }} aria-hidden />
        <div>
          <h2 className="m-0 text-lg font-semibold tracking-tight text-[color:var(--billing-heading)]">
            {title}
          </h2>
          <p className="m-0 mt-0.5 text-xs text-[color:var(--billing-text-muted)]">{description}</p>
        </div>
      </div>
      {route ? (
        <span className="rounded-md border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] px-2.5 py-1 font-mono text-[11px] text-[color:var(--billing-text-muted)]">
          {route}
        </span>
      ) : null}
    </div>
  );
}

function CcKpi({
  label,
  value,
  sub,
  barPct,
  barColor,
  rank,
  href,
  valueAccent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  barPct?: number;
  barColor?: string;
  rank?: string;
  href?: string;
  valueAccent?: string;
}) {
  const body = (
    <div className="relative overflow-hidden rounded-[14px] border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] px-4 py-4 shadow-[0_1px_2px_rgba(15,27,45,.04),0_8px_24px_-12px_rgba(15,27,45,.10)] transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-px hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11.5px] font-semibold uppercase tracking-wide text-[color:var(--billing-text-muted)]">
          {label}
        </span>
        {rank ? (
          <span className="rounded bg-[color:var(--billing-bg)] px-1.5 py-0.5 text-[9.5px] font-bold text-[color:var(--billing-text-muted)]">
            {rank}
          </span>
        ) : null}
      </div>
      <div
        className="mt-2 font-semibold tabular-nums tracking-tight text-[27px] leading-none text-[color:var(--billing-heading)]"
        style={valueAccent ? { color: valueAccent } : undefined}
      >
        {value}
      </div>
      {sub ? (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-[color:var(--billing-text-muted)]">
          {sub}
        </div>
      ) : null}
      {typeof barPct === 'number' ? (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded bg-[color:var(--billing-bg)]" aria-hidden>
          <i
            className="block h-full rounded"
            style={{ width: `${Math.max(0, Math.min(100, barPct))}%`, background: barColor ?? CC.teal }}
          />
        </div>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} scroll={false} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--billing-accent)] focus-visible:ring-offset-2 rounded-[14px]">
        {body}
      </Link>
    );
  }
  return body;
}

function BillingFunnel({ kpis, highlight }: { kpis: BillingDashboardKpis; highlight?: BillingDashboardFocus }) {
  const md = kpis.masterData;
  const sources = kpis.operationalSources ?? [];
  const prepTotal = sources.reduce((n, s) => n + s.total, 0);
  const ready = kpis.readyForInvoice;
  const inComposition = kpis.draftsAwaitingApproval;
  const postedCount = kpis.postedThisMonth?.count ?? kpis.checker.postedThisMonth;
  const postedAmt = kpis.postedThisMonth?.totalInclTax ?? kpis.checker.postedTotalInclTax;

  const stages = [
    {
      id: 'master' as const,
      eyebrow: 'Stage 1 · Master Data',
      name: 'Setup Readiness',
      value: `${md.readinessPercent}%`,
      sub: `${formatCount(md.customers.active)} active customers · ${formatCount(md.rateCards)} rate rows`,
      grad: CC.tealGrad,
      ink: CC.onBlue,
      href: '/billing/insights/payables',
    },
    {
      id: 'sources' as const,
      eyebrow: 'Stage 2 · Billed Services',
      name: 'Ops Captured',
      value: formatCount(prepTotal || ready + kpis.pendingPreparation + kpis.validationErrors),
      sub: `${formatCount(ready)} ready for invoice`,
      grad: CC.amberGrad,
      ink: CC.onYellow,
      href: '/billing/billed-services',
    },
    {
      id: 'prep' as const,
      eyebrow: 'Stage 3 · Workflow',
      name: 'In Composition',
      value: formatCount(inComposition),
      sub: 'drafts awaiting approval',
      grad: CC.violetGrad,
      ink: CC.onBlue,
      href: '/billing/review',
    },
    {
      id: 'posted' as const,
      eyebrow: 'Stage 4 · Posted',
      name: 'Revenue Realized',
      value: formatCompactInr(postedAmt),
      sub: `${formatCount(postedCount)} invoices posted MTD`,
      grad: CC.greenGrad,
      ink: CC.onBlue,
      href: '/billing/invoices?status=posted',
    },
  ];

  return (
    <Panel className="!pt-5 !pb-4">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-1.5">
        <h2 className="m-0 text-[15.5px] font-semibold text-[color:var(--billing-heading)]">
          End-to-end billing funnel — this period
        </h2>
        <span className="text-[11.5px] text-[color:var(--billing-text-muted)]">
          Setup readiness → Ops capture → Invoice composition → Revenue posted
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4 xl:gap-0">
        {stages.map((stage, idx) => {
          const active =
            (highlight === 'master' && stage.id === 'master') ||
            (highlight === 'sources' && stage.id === 'sources') ||
            (highlight === 'prep' && (stage.id === 'prep' || stage.id === 'posted'));
          const ring =
            stage.ink === CC.onYellow
              ? 'ring-[#1C0770]/40'
              : 'ring-white/40';
          return (
            <Link
              key={stage.id}
              href={stage.href}
              scroll={false}
              className={`relative overflow-hidden px-[18px] py-4 transition-[filter,transform] duration-150 ease-out hover:brightness-105 active:scale-[0.99] ${
                idx === 0 ? 'xl:rounded-l-[10px]' : ''
              } ${idx === stages.length - 1 ? 'xl:rounded-r-[10px]' : ''} rounded-[10px] xl:rounded-none ${
                active ? `ring-2 ${ring} ring-offset-2 ring-offset-[color:var(--billing-bg)]` : ''
              }`}
              style={{ background: stage.grad, color: stage.ink }}
              aria-current={active ? 'page' : undefined}
            >
              {idx < stages.length - 1 ? (
                <span
                  className="pointer-events-none absolute right-[-1px] top-0 z-[2] hidden h-full w-[26px] xl:block"
                  style={{
                    background: stage.grad,
                    clipPath: 'polygon(0 0, 100% 50%, 0 100%)',
                  }}
                  aria-hidden
                />
              ) : null}
              <div className="text-[10px] font-semibold uppercase tracking-wider opacity-85">{stage.eyebrow}</div>
              <div className="mb-2.5 mt-0.5 text-[14.5px] font-semibold">{stage.name}</div>
              <div className="text-[26px] font-bold leading-none tabular-nums">{stage.value}</div>
              <div className="mt-1 text-[11px] opacity-90">{stage.sub}</div>
            </Link>
          );
        })}
      </div>
      <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-[color:var(--billing-text-muted)]">
        <div className="flex items-center gap-1.5">
          <i className="inline-block h-2 w-2 rounded-sm" style={{ background: CC.teal }} />
          Master Data — who / what / rates
        </div>
        <div className="flex items-center gap-1.5">
          <i className="inline-block h-2 w-2 rounded-sm" style={{ background: CC.amber }} />
          Billed Services — ops usage capture
        </div>
        <div className="flex items-center gap-1.5">
          <i className="inline-block h-2 w-2 rounded-sm" style={{ background: CC.violet }} />
          Workflow — prep → approve → post
        </div>
        <span className="hidden h-3 w-px bg-[color:var(--billing-border)] sm:inline-block" aria-hidden />
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[color:var(--billing-text)]">Insights</span>
          <Link
            href="/billing/insights/marketing"
            className="rounded-md border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] px-2 py-0.5 font-medium text-[color:var(--billing-blue)] hover:border-[color:var(--billing-blue)]"
          >
            Marketing
          </Link>
          <Link
            href="/billing/insights/payables"
            className="rounded-md border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] px-2 py-0.5 font-medium text-[color:var(--billing-blue)] hover:border-[color:var(--billing-blue)]"
          >
            Payables
          </Link>
          <Link
            href="/billing/insights/receivables"
            className="rounded-md border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] px-2 py-0.5 font-medium text-[color:var(--billing-blue)] hover:border-[color:var(--billing-blue)]"
          >
            Receivables
          </Link>
        </div>
        <div className="flex items-center gap-1.5">
          <i className="inline-block h-2 w-2 rounded-sm" style={{ background: CC.green }} />
          Posted — sequence-numbered revenue
        </div>
      </div>
    </Panel>
  );
}

function MetricRow({
  name,
  value,
  barPct,
  barColor = CC.teal,
  href,
}: {
  name: string;
  value: string;
  barPct: number;
  barColor?: string;
  href?: string;
}) {
  const row = (
    <div className="flex items-center gap-3 border-b border-[color:var(--billing-border)] py-2.5 last:border-b-0">
      <div className="w-[150px] shrink-0 text-[12.5px] font-semibold text-[color:var(--billing-text)]">
        {name}
      </div>
      <div className="h-2 flex-1 overflow-hidden rounded bg-[color:var(--billing-bg)]" aria-hidden>
        <i
          className="block h-full rounded transition-[width] duration-300 ease-out"
          style={{ width: `${Math.max(0, Math.min(100, barPct))}%`, background: barColor }}
        />
      </div>
      <div className="w-[90px] shrink-0 text-right font-mono text-xs text-[color:var(--billing-text-muted)]">
        {value}
      </div>
    </div>
  );
  if (href) {
    return (
      <Link href={href} scroll={false} className="block hover:bg-[color:var(--billing-surface-muted)]/60 rounded-md -mx-1 px-1">
        {row}
      </Link>
    );
  }
  return row;
}

function SetupCheckRow({ item }: { item: BillingSetupItemStatus }) {
  const done = item.status === 'complete';
  const partial = item.status === 'partial';
  return (
    <Link
      href={item.href}
      scroll={false}
      className="flex items-center gap-2.5 rounded-md px-1 py-1.5 transition-colors duration-150 hover:bg-[color:var(--billing-surface-muted)]"
    >
      <div
        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded text-[11px] font-bold text-white"
        style={{
          background: done ? CC.green : partial ? CC.amber : CC.red,
        }}
        aria-hidden
      >
        {done ? '✓' : partial ? '!' : '–'}
      </div>
      <div className="min-w-0 flex-1 text-[12.5px] font-medium text-[color:var(--billing-text)]">
        {item.label}
      </div>
      <div className="shrink-0 text-[11px] text-[color:var(--billing-text-muted)]">
        {item.detail ??
          (item.status === 'complete' ? 'Complete' : item.status === 'partial' ? 'Partial' : 'Missing')}
      </div>
    </Link>
  );
}

function StatusBadge({ status }: { status: BillingSetupStatus }) {
  const cls =
    status === 'complete'
      ? billingUi.badgeSuccess
      : status === 'partial'
        ? billingUi.badgeWarning
        : billingUi.badgeDanger;
  const label = status === 'complete' ? 'Ready' : status === 'partial' ? 'Partial' : 'Missing';
  return (
    <span className={`${cls} !text-[11px]`} aria-label={`Setup: ${label}`}>
      {label}
    </span>
  );
}

function SourceQueueChart({ sources }: { sources: BillingOperationalSourceStatus[] }) {
  const max = Math.max(
    1,
    ...sources.map((s) => s.eligible + s.pending + s.validationErrors + s.readyForInvoice),
  );

  if (sources.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-[color:var(--billing-text-muted)]">
        No operational source data yet.
      </p>
    );
  }

  return (
    <div className="space-y-3" role="img" aria-label="Queue health by source stacked bars">
      {sources.map((s, i) => {
        const open = s.eligible + s.pending + s.validationErrors + s.readyForInvoice;
        const segments = [
          { key: 'eligible', n: s.eligible, color: CC.violet, label: 'Eligible' },
          { key: 'pending', n: s.pending, color: CC.amber, label: 'Pending' },
          { key: 'errors', n: s.validationErrors, color: CC.red, label: 'Errors' },
          { key: 'ready', n: s.readyForInvoice, color: CC.sky, label: 'Ready' },
        ];
        return (
          <div key={s.sourceType}>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-2 font-semibold text-[color:var(--billing-text)]">
                <span
                  className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-md text-[10px] font-bold text-white"
                  style={{ background: SOURCE_COLORS[i % SOURCE_COLORS.length] }}
                >
                  {sourceAbbrev(s.label, s.sourceType)}
                </span>
                {s.label}
              </span>
              <span className="font-mono text-[color:var(--billing-text-muted)]">{formatCount(open)}</span>
            </div>
            <div className="flex h-3 overflow-hidden rounded bg-[color:var(--billing-bg)]">
              {segments.map((seg) =>
                seg.n > 0 ? (
                  <div
                    key={seg.key}
                    title={`${seg.label}: ${formatCount(seg.n)}`}
                    className="h-full transition-[width] duration-300 ease-out"
                    style={{ width: `${(seg.n / max) * 100}%`, background: seg.color }}
                  />
                ) : null,
              )}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-[color:var(--billing-text-muted)]">
        <span className="flex items-center gap-1">
          <i className="h-2 w-2 rounded-sm" style={{ background: CC.violet }} /> Eligible
        </span>
        <span className="flex items-center gap-1">
          <i className="h-2 w-2 rounded-sm" style={{ background: CC.amber }} /> Pending
        </span>
        <span className="flex items-center gap-1">
          <i className="h-2 w-2 rounded-sm" style={{ background: CC.red }} /> Errors
        </span>
        <span className="flex items-center gap-1">
          <i className="h-2 w-2 rounded-sm" style={{ background: CC.sky }} /> Ready
        </span>
      </div>
    </div>
  );
}

function WorkflowPipeline({ kpis }: { kpis: BillingDashboardKpis }) {
  const steps = [
    {
      label: 'Ready',
      value: kpis.readyForInvoice,
      color: CC.teal,
      href: '/billing/preparation?tab=ready',
    },
    {
      label: 'Drafted',
      value: kpis.maker.draftInvoices,
      color: CC.amber,
      href: '/billing/invoice-drafts',
    },
    {
      label: 'Pending Approval',
      value: kpis.checker.pendingApproval,
      color: CC.amber,
      href: '/billing/review',
    },
    {
      label: 'Approved',
      value: kpis.checker.approved,
      color: CC.violet,
      href: '/billing/review',
    },
    {
      label: 'PDF Generated',
      value: kpis.checker.generated,
      color: CC.violet,
      href: '/billing/invoices',
    },
    {
      label: 'Posted MTD',
      value: kpis.checker.postedThisMonth,
      color: CC.green,
      href: '/billing/invoices?status=posted',
    },
  ];

  return (
    <div className="flex items-start overflow-x-auto pb-1.5" role="list" aria-label="Invoice status pipeline">
      {steps.map((step, idx) => (
        <Link
          key={step.label}
          href={step.href}
          scroll={false}
          role="listitem"
          className="relative min-w-[120px] flex-1 px-1 text-center transition-opacity duration-150 hover:opacity-90"
        >
          {idx < steps.length - 1 ? (
            <span
              className="absolute left-1/2 top-[19px] z-[1] h-0.5 w-full bg-[color:var(--billing-border)]"
              aria-hidden
            />
          ) : null}
          <div
            className="relative z-[2] mx-auto mb-2 flex h-[38px] w-[38px] items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ background: step.color }}
          >
            {formatCompactCount(step.value)}
          </div>
          <div className="text-[11.5px] font-semibold text-[color:var(--billing-text)]">{step.label}</div>
          <div className="mt-0.5 text-[15px] font-bold tabular-nums text-[color:var(--billing-heading)]">
            {formatCount(step.value)}
          </div>
        </Link>
      ))}
    </div>
  );
}

function WorkspaceRow({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: ReactNode;
  href?: string;
  tone?: 'danger' | 'success' | 'muted';
}) {
  const color =
    tone === 'danger'
      ? CC.red
      : tone === 'success'
        ? CC.green
        : tone === 'muted'
          ? 'var(--billing-text-muted)'
          : undefined;
  const content = (
    <div className="flex items-center justify-between border-b border-dashed border-[color:var(--billing-border)] py-1.5 text-[12.5px] last:border-b-0">
      <span className="text-[color:var(--billing-text-secondary)]">{label}</span>
      <b className="font-mono font-bold tabular-nums" style={color ? { color } : undefined}>
        {value}
      </b>
    </div>
  );
  if (href) {
    return (
      <Link href={href} scroll={false} className="block hover:bg-[color:var(--billing-surface-muted)]/50 -mx-1 px-1 rounded">
        {content}
      </Link>
    );
  }
  return content;
}

function MasterDashboardBody({ kpis }: { kpis: BillingDashboardKpis }) {
  const { masterData: md } = kpis;
  const custPct = pct(md.customers.active, md.customers.total || md.customers.active);
  const svcPct = pct(md.serviceCatalog.active, md.serviceCatalog.total || md.serviceCatalog.active);
  const contractDenom = Math.max(md.contracts.total, md.contracts.active + md.contracts.draft, 1);
  const contractPct = pct(md.contracts.active, contractDenom);
  const seqReady =
    (md.sequences.hasInvoice ? 1 : 0) + (md.sequences.hasCreditMemo ? 1 : 0);
  const blocked = Math.max(0, md.customers.total - md.customers.active);
  const postedCount = kpis.postedThisMonth?.count ?? kpis.checker.postedThisMonth;
  const postedAmt = kpis.postedThisMonth?.totalInclTax ?? kpis.checker.postedTotalInclTax;

  return (
    <div className="space-y-6">
      <BillingFunnel kpis={kpis} highlight="master" />

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <CcKpi
          label="Setup Readiness"
          rank="#1"
          value={
            <>
              {md.readinessPercent}
              <small className="text-sm font-semibold text-[color:var(--billing-text-muted)]">%</small>
            </>
          }
          sub={
            md.readinessPercent >= 80 ? (
              <span style={{ color: CC.green }}>Ready for invoicing</span>
            ) : md.readinessPercent >= 40 ? (
              <span style={{ color: CC.amber }}>Setup incomplete</span>
            ) : (
              <span style={{ color: CC.red }}>Blocked — finish checklist</span>
            )
          }
          barPct={md.readinessPercent}
          barColor={CC.teal}
          href="/billing/settings"
        />
        <CcKpi
          label="Active Customers"
          rank="#2"
          value={
            <>
              {formatCount(md.customers.active)}
              <small className="text-sm font-semibold text-[color:var(--billing-text-muted)]">
                /{formatCount(md.customers.total)}
              </small>
            </>
          }
          sub={
            blocked > 0
              ? `${formatCount(blocked)} blocked · unbillable`
              : 'All customers billable'
          }
          barPct={custPct}
          barColor={CC.violet}
          href="/billing/customers"
        />
        <CcKpi
          label="Ready for Invoice"
          value={formatCount(kpis.readyForInvoice)}
          sub="Prep rows cleared for drafts"
          barPct={pct(kpis.readyForInvoice, Math.max(kpis.readyForInvoice + kpis.pendingPreparation + kpis.validationErrors, 1))}
          barColor={CC.amber}
          href="/billing/preparation?tab=ready"
        />
        <CcKpi
          label="Posted this Month"
          value={formatCount(postedCount)}
          sub={`${formatInr(postedAmt)} incl. tax`}
          barPct={postedCount > 0 ? 74 : 0}
          barColor={CC.green}
          href="/billing/invoices?status=posted"
        />
      </div>

      <section>
        <SectionHead
          title="1 · Master Data"
          description="Who / what / rates — the setup layer that gates everything downstream"
          swatch={CC.teal}
          route="/billing/insights/payables"
        />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_.85fr]">
          <Panel>
            <h3 className="mb-2 mt-0 text-[13.5px] font-semibold text-[color:var(--billing-heading)]">
              Top KPIs
            </h3>
            <MetricRow
              name="Active customers"
              value={`${formatCount(md.customers.active)} / ${formatCount(md.customers.total)}`}
              barPct={custPct || 0}
              href="/billing/customers"
            />
            <MetricRow
              name="Active services"
              value={`${formatCount(md.serviceCatalog.active)} / ${formatCount(md.serviceCatalog.total)}`}
              barPct={svcPct || 0}
              href="/billing/service-catalog"
            />
            <MetricRow
              name="Active contracts"
              value={`${formatCount(md.contracts.active)}${md.contracts.draft ? ` (+${formatCount(md.contracts.draft)} draft)` : ''}`}
              barPct={contractPct || 0}
              href="/billing/contracts"
            />
            <MetricRow
              name="Rate rows"
              value={formatCount(md.rateCards)}
              barPct={md.rateCards > 0 ? 100 : 0}
              href="/billing/rate-cards"
            />
            <MetricRow
              name="Tax rules"
              value={formatCount(md.taxRules)}
              barPct={md.taxRules > 0 ? Math.min(100, md.taxRules * 15) : 0}
              href="/billing/settings/taxes"
            />
            <MetricRow
              name="FX rates"
              value={formatCount(md.exchangeRates)}
              barPct={md.exchangeRates > 0 ? Math.min(100, md.exchangeRates * 10) : 0}
              href="/billing/conversion-rates"
            />
            <MetricRow
              name="Sequences"
              value={`${seqReady} / 2 ready`}
              barPct={pct(seqReady, 2)}
              barColor={seqReady === 2 ? CC.green : CC.amber}
              href="/billing/settings/sequences"
            />
            <MetricRow
              name="Native billing"
              value={
                md.nativeBillingEnabled
                  ? `Live · ${md.cutoverPhase.replace(/_/g, ' ')}`
                  : `Off · ${md.cutoverPhase.replace(/_/g, ' ')}`
              }
              barPct={md.nativeBillingEnabled ? 100 : 35}
              barColor={md.nativeBillingEnabled ? CC.green : CC.amber}
              href="/billing/settings"
            />
          </Panel>

          <Panel>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="m-0 text-[13.5px] font-semibold text-[color:var(--billing-heading)]">
                Setup checklist (drives readiness %)
              </h3>
              <StatusBadge status={md.stationProfile.status === 'complete' && md.readinessPercent >= 100 ? 'complete' : md.readinessPercent >= 40 ? 'partial' : 'missing'} />
            </div>
            <div className="flex flex-col gap-0.5">
              {md.setupItems.length > 0 ? (
                md.setupItems.map((item) => <SetupCheckRow key={item.id} item={item} />)
              ) : (
                <p className="text-sm text-[color:var(--billing-text-muted)]">No setup items returned.</p>
              )}
            </div>
            <div className="mt-3.5 border-t border-[color:var(--billing-border)] pt-3 text-[11.5px] text-[color:var(--billing-text-muted)]">
              Setup order: Station → Customer → Catalog → Contract → Rates → Tax → FX → Sequences, then
              Billed Services / Workflow opens.
            </div>
            {md.stationProfile.missingFields.length > 0 ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Station profile incomplete — missing:{' '}
                {md.stationProfile.missingFields.join(', ')}.{' '}
                <Link href="/billing/settings" scroll={false} className="underline">
                  Complete →
                </Link>
              </div>
            ) : null}
          </Panel>
        </div>
      </section>
    </div>
  );
}

function SourcesDashboardBody({ kpis }: { kpis: BillingDashboardKpis }) {
  const sources = kpis.operationalSources ?? [];
  const totals = sources.reduce(
    (acc, s) => {
      acc.eligible += s.eligible;
      acc.pending += s.pending;
      acc.validationErrors += s.validationErrors;
      acc.readyForInvoice += s.readyForInvoice;
      acc.invoiced += s.invoiced;
      acc.total += s.total;
      return acc;
    },
    {
      eligible: 0,
      pending: 0,
      validationErrors: 0,
      readyForInvoice: 0,
      invoiced: 0,
      total: 0,
    },
  );
  const openQueue = totals.eligible + totals.pending + totals.validationErrors;

  return (
    <div className="space-y-6">
      <BillingFunnel kpis={kpis} highlight="sources" />

      <section>
        <SectionHead
          title="2 · Billed Services"
          description="Ops usage capture — FRIS flights / FHR / MAAS escort rows matched to contract & rate"
          swatch={CC.amber}
          route="/billing/billed-services"
        />

        <div className="mb-4 grid grid-cols-2 gap-3.5 sm:grid-cols-3 xl:grid-cols-5">
          <CcKpi label="All Prep Rows" value={formatCount(totals.total)} href="/billing/preparation" />
          <CcKpi
            label="Eligible"
            value={formatCount(totals.eligible)}
            valueAccent={CC.violet}
            href="/billing/preparation?tab=eligible"
          />
          <CcKpi
            label="Pending"
            value={formatCount(totals.pending)}
            valueAccent={CC.amber}
            href="/billing/preparation?tab=pending"
          />
          <CcKpi
            label="Validation Errors"
            value={formatCount(totals.validationErrors)}
            valueAccent={CC.red}
            href="/billing/preparation?tab=errors"
          />
          <CcKpi
            label="Ready for Invoice"
            value={formatCount(totals.readyForInvoice)}
            valueAccent={CC.green}
            href="/billing/preparation?tab=ready"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_.85fr]">
          <Panel>
            <h3 className="mb-3 mt-0 text-[13.5px] font-semibold text-[color:var(--billing-heading)]">
              Queue health by source
            </h3>
            <SourceQueueChart sources={sources} />
          </Panel>

          <Panel className="overflow-auto">
            <h3 className="mb-3 mt-0 text-[13.5px] font-semibold text-[color:var(--billing-heading)]">
              Per-source detail
            </h3>
            {sources.length === 0 ? (
              <p className="py-8 text-center text-sm text-[color:var(--billing-text-muted)]">
                No sources configured for this station.
              </p>
            ) : (
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr>
                    {['Source', 'Eligible', 'Pending', 'Errors', 'Ready', 'Invoiced'].map((h) => (
                      <th
                        key={h}
                        className={`border-b border-[color:var(--billing-border)] px-2.5 py-2 text-[10.5px] font-bold uppercase tracking-wide text-[color:var(--billing-text-muted)] ${
                          h === 'Source' ? 'text-left' : 'text-right'
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s, i) => (
                    <tr key={s.sourceType}>
                      <td className="border-b border-[color:var(--billing-border)] px-2.5 py-2.5 last:border-0">
                        <Link
                          href={s.href}
                          scroll={false}
                          className="inline-flex items-center font-medium text-[color:var(--billing-text)] hover:underline"
                        >
                          <span
                            className="mr-2 inline-flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-[11px] font-bold text-white"
                            style={{ background: SOURCE_COLORS[i % SOURCE_COLORS.length] }}
                          >
                            {sourceAbbrev(s.label, s.sourceType)}
                          </span>
                          {s.label}
                        </Link>
                      </td>
                      {(
                        [
                          ['eligible', s.eligible],
                          ['pending', s.pending],
                          ['errors', s.validationErrors],
                          ['ready', s.readyForInvoice],
                          ['invoiced', s.invoiced],
                        ] as const
                      ).map(([tab, n]) => (
                        <td
                          key={tab}
                          className="border-b border-[color:var(--billing-border)] px-2.5 py-2.5 text-right font-mono tabular-nums"
                        >
                          <Link
                            href={
                              tab === 'invoiced'
                                ? `/billing/preparation?tab=invoiced&sourceType=${encodeURIComponent(s.sourceType)}`
                                : tab === 'errors'
                                  ? `/billing/preparation?tab=errors&sourceType=${encodeURIComponent(s.sourceType)}`
                                  : `/billing/preparation?tab=${tab}&sourceType=${encodeURIComponent(s.sourceType)}`
                            }
                            scroll={false}
                            className="hover:underline"
                          >
                            {formatCount(n)}
                          </Link>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mt-3 text-[11.5px] text-[color:var(--billing-text-muted)]">
              Open queue (eligible + pending + errors) ={' '}
              <b className="font-mono text-[color:var(--billing-text)]">{formatCount(openQueue)}</b> rows
              still outstanding across sources.
            </div>
          </Panel>
        </div>
      </section>
    </div>
  );
}

function PrepDashboardBody({ kpis }: { kpis: BillingDashboardKpis }) {
  const { maker, checker } = kpis;

  return (
    <div className="space-y-6">
      <BillingFunnel kpis={kpis} highlight="prep" />

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <CcKpi
          label="Pending preparation"
          value={formatCount(kpis.pendingPreparation)}
          sub="Eligible + pending backlog"
          href="/billing/preparation?tab=eligible"
        />
        <CcKpi
          label="Validation errors"
          value={formatCount(kpis.validationErrors)}
          valueAccent={kpis.validationErrors > 0 ? CC.red : undefined}
          sub={kpis.validationErrors > 0 ? 'Needs resolution' : 'Clear'}
          href="/billing/preparation?tab=errors"
        />
        <CcKpi
          label="Ready for invoice"
          value={formatCount(kpis.readyForInvoice)}
          valueAccent={CC.green}
          sub="Can create drafts now"
          href="/billing/preparation?tab=ready"
        />
        <CcKpi
          label="Drafts awaiting approval"
          value={formatCount(kpis.draftsAwaitingApproval)}
          valueAccent={CC.violet}
          sub="Checker backlog"
          href="/billing/invoice-drafts"
        />
      </div>

      <section>
        <SectionHead
          title="3 · Workflow"
          description="Prep → draft → approve → PDF → post — maker/checker invoice pipeline"
          swatch={CC.violet}
          route="/billing/prep-dashboard"
        />

        <Panel className="mb-4">
          <h3 className="mb-2 mt-0 text-[13.5px] font-semibold text-[color:var(--billing-heading)]">
            Status pipeline
          </h3>
          <WorkflowPipeline kpis={kpis} />
        </Panel>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-[color:var(--billing-border)] p-[15px]">
            <h3 className="mb-2.5 mt-0 flex items-center gap-2 text-[13px] font-semibold text-[color:var(--billing-heading)]">
              <span
                className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-md text-[11px] font-bold text-white"
                style={{ background: CC.teal }}
              >
                M
              </span>
              Maker workspace
            </h3>
            <WorkspaceRow label="Eligible" value={formatCount(maker.eligible)} href="/billing/preparation?tab=eligible" />
            <WorkspaceRow label="Pending review" value={formatCount(maker.pending)} href="/billing/preparation?tab=pending" />
            <WorkspaceRow
              label="Validation errors"
              value={formatCount(maker.validationErrors)}
              href="/billing/preparation?tab=errors"
              tone={maker.validationErrors > 0 ? 'danger' : undefined}
            />
            <WorkspaceRow
              label="Ready for invoice"
              value={formatCount(maker.readyForInvoice)}
              href="/billing/preparation?tab=ready"
              tone="success"
            />
            <WorkspaceRow label="Draft invoices" value={formatCount(maker.draftInvoices)} href="/billing/invoice-drafts" />
            {maker.rejected > 0 ? (
              <WorkspaceRow
                label="Rejected"
                value={formatCount(maker.rejected)}
                href="/billing/preparation?tab=rejected"
                tone="muted"
              />
            ) : (
              <WorkspaceRow label="Rejected" value={formatCount(maker.rejected)} tone="muted" />
            )}
          </div>

          <div className="rounded-xl border border-[color:var(--billing-border)] p-[15px]">
            <h3 className="mb-2.5 mt-0 flex items-center gap-2 text-[13px] font-semibold text-[color:var(--billing-heading)]">
              <span
                className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-md text-[11px] font-bold text-white"
                style={{ background: CC.violet }}
              >
                C
              </span>
              Checker workspace
            </h3>
            <WorkspaceRow
              label="Pending approval"
              value={formatCount(checker.pendingApproval)}
              href="/billing/review"
            />
            <WorkspaceRow label="Approved" value={formatCount(checker.approved)} href="/billing/review" />
            <WorkspaceRow label="Generated PDF" value={formatCount(checker.generated)} href="/billing/invoices" />
            <WorkspaceRow
              label="Posted this month"
              value={formatCount(checker.postedThisMonth)}
              href="/billing/invoices?status=posted"
              tone="success"
            />
            <WorkspaceRow
              label="Posted total (incl. tax)"
              value={formatInr(checker.postedTotalInclTax)}
              href="/billing/invoices?status=posted"
            />
            <WorkspaceRow
              label="Credit memos — draft / posted"
              value={`${formatCount(checker.creditMemosDraft)} / ${formatCount(checker.creditMemosPosted)}`}
              href="/billing/credit-memos"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

export function BillingDashboardView({
  kpis,
  focus = 'master',
}: {
  kpis: BillingDashboardKpis;
  focus?: BillingDashboardFocus;
}) {
  if (focus === 'prep') return <PrepDashboardBody kpis={kpis} />;
  if (focus === 'sources') return <SourcesDashboardBody kpis={kpis} />;
  return <MasterDashboardBody kpis={kpis} />;
}
