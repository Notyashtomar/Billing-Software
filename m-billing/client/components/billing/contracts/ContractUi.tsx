'use client';

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { billingUi } from '../billingUi';

/**
 * Contracts UI — Safety layout patterns, Calm Ledger billing colors.
 */
export const contractUi = {
  hero: 'contract-hero mb-0 shrink-0',
  heroTitle: 'text-3xl font-extrabold tracking-tight text-slate-900',
  heroSubtitle: 'mt-1 text-sm font-medium text-slate-500',

  kpiStrip: 'grid w-full grid-cols-2 gap-3 sm:grid-cols-4',
  kpi:
    'contract-kpi relative min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-xs',
  kpiLabel: 'text-xs font-semibold uppercase tracking-wide text-slate-500',
  kpiValue: 'mt-1 text-2xl font-bold tabular-nums text-[color:var(--billing-primary)]',
  kpiHint: 'mt-0.5 text-[11px] text-slate-500',

  toolbar:
    'billing-filter-toolbar contract-toolbar flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-xs backdrop-blur-md sm:flex-row sm:items-center sm:justify-between',
  toolbarGroup: 'flex flex-wrap items-center gap-2',
  search:
    'w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-xs placeholder:text-slate-400 transition-[border-color,box-shadow] duration-150 hover:border-[color:var(--billing-border-strong)] focus:border-[color:var(--billing-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--billing-accent)]/40 sm:max-w-xs',

  chip:
    'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--billing-accent)]/40',
  chipIdle:
    'border-slate-200 bg-slate-50 text-slate-600 hover:border-[color:var(--billing-border-strong)] hover:bg-[color:var(--billing-primary-soft)] hover:text-[color:var(--billing-primary)]',
  chipActive: 'border-[color:var(--billing-primary)] bg-[color:var(--billing-primary)] text-white',

  panel:
    'contract-panel overflow-hidden rounded-2xl border border-slate-200 border-l-4 border-l-[color:var(--billing-primary)] bg-white shadow-xs',
  panelHeader:
    'flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 sm:px-6',
  panelBody: 'bg-white p-5 sm:p-6',
  panelTitle: 'text-sm font-bold tracking-wide text-slate-900',
  panelDesc: 'mt-0.5 text-xs font-medium text-slate-500',

  section:
    'contract-section overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs',
  sectionTitle: 'text-sm font-bold tracking-wide text-white sm:text-[15px]',
  sectionDesc: 'mt-0.5 text-[11px] font-medium text-[#F1FF5E]',

  rail:
    'flex shrink-0 flex-row flex-wrap gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 sm:w-52 sm:flex-col',
  railCollapsed:
    'flex shrink-0 flex-row flex-wrap gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 sm:w-14 sm:flex-col sm:items-center',
  railItem:
    'rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--billing-accent)]/40',
  railItemCollapsed:
    'flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold transition-[background-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--billing-accent)]/40',
  railItemIdle:
    'text-slate-600 hover:bg-white hover:text-[#1C0770]',
  railItemActive:
    'bg-[#1C0770] text-white shadow-sm',
  railItemHint: 'mt-0.5 block text-[11px] font-medium opacity-80',
  railToggle:
    'inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--billing-accent)]/40 sm:justify-start sm:px-3',

  toggleCard:
    'flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 transition-colors duration-150 hover:border-[#F1FF5E] hover:bg-[#F1FF5E]/25 has-[:checked]:border-[#1C0770] has-[:checked]:bg-[#1C0770] has-[:checked]:text-white',

  identityCell: 'min-w-0',
  identityPrimary: 'truncate text-[15px] font-bold tracking-tight text-slate-900',
  identitySecondary: 'mt-0.5 truncate text-sm font-medium text-slate-500',
  coverageBadge:
    'mt-1 inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[11px] font-bold tracking-wide',
  coverageComprehensive: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  coverageSeparate: 'border-amber-200 bg-amber-50 text-amber-900',
  coverageMixed: 'border-slate-200 bg-slate-100 text-slate-700',

  pill:
    'inline-flex items-center rounded-full border border-[#1C0770]/20 bg-[#F1FF5E]/35 px-2.5 py-0.5 text-xs font-bold tracking-wide text-[#1C0770]',
  pillMuted:
    'inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-bold tracking-wide text-slate-700',
  categoryCell: 'flex flex-col items-start gap-1.5',
  validity:
    'inline-flex flex-col gap-0.5 text-sm tabular-nums text-slate-600 sm:flex-row sm:items-center sm:gap-1.5',
  validityArrow: 'hidden text-slate-400 sm:inline',

  /** SGHA terms — compact readable rows in contracts table. */
  sghaStack: 'flex min-w-[13.5rem] max-w-[20rem] flex-col gap-1.5',
  sghaRow:
    'flex items-center justify-between gap-3 rounded-lg border border-slate-200/90 bg-slate-50/80 px-2.5 py-1.5',
  sghaLabel: 'min-w-0 flex-1 text-[12px] font-semibold leading-snug text-slate-600',
  sghaValue:
    'shrink-0 rounded-md bg-white px-2 py-0.5 text-[13px] font-bold tabular-nums tracking-tight text-[#1C0770] ring-1 ring-slate-200',
  sghaEmpty: 'text-sm text-slate-400',

  validityCell: 'min-w-[10.5rem] space-y-1',
  validityRange: 'text-sm font-semibold tabular-nums leading-snug text-slate-800',
  validityRangeArrow: 'mx-1 text-slate-400',
  validityCountdown: 'text-[13px] font-bold tabular-nums leading-snug',
  endingWarn: 'text-amber-700',
  endingDanger: 'text-red-600',
  endingMuted: 'text-slate-500',

  aircraftCell: 'max-w-[18rem]',
  aircraftList: 'flex flex-wrap gap-1',
  aircraftChip:
    'inline-flex max-w-full truncate rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[13px] font-semibold tabular-nums text-slate-800',

  empty:
    'flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-16 text-center',
  emptyTitle: 'text-sm font-bold text-slate-900',
  emptyDesc: 'max-w-sm text-sm text-slate-500',

  skeleton: 'h-24 animate-pulse rounded-2xl bg-slate-100',

  dialogShell:
    'contract-dialog !flex h-[min(92vh,56rem)] w-[min(96vw,80rem)] max-w-[80rem] !flex-col gap-0 overflow-hidden !border-slate-200 !bg-white p-0 !text-slate-800 shadow-lg sm:rounded-2xl',
  dialogHeader:
    'contract-dialog-header shrink-0 space-y-1 border-b border-[#1C0770] !bg-[#1C0770] px-5 py-4 pr-12 text-left sm:px-6',
  dialogFooter:
    'sticky bottom-0 z-20 flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 !bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6',

  nestedCard:
    'rounded-xl border border-slate-200 bg-white p-4 shadow-xs',
  fieldCard:
    'min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm shadow-xs',

  fieldError: 'text-xs font-semibold text-red-600',
  dirtyDot: 'inline-block h-2 w-2 rounded-full bg-[#F1FF5E]',

  /** Primary / secondary buttons — billing Calm Ledger colors */
  btnPrimary:
    'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#1C0770] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#150558] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F1FF5E]/60 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]',
  btnSecondary:
    'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F1FF5E]/60 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]',
  btnOutline:
    'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#1C0770] bg-white px-5 py-2.5 text-sm font-semibold text-[#1C0770] transition-colors hover:bg-[#1C0770]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F1FF5E]/60 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]',
  btnGold:
    'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#1C0770]/20 bg-[#F1FF5E] px-5 py-2.5 text-sm font-bold text-[#1C0770] shadow-sm transition-colors hover:bg-[#dce948] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1C0770]/40 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]',
  btnGhost:
    'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-[#F1FF5E]/25 hover:text-[#1C0770] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F1FF5E]/60 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]',
  btnDangerOutline:
    'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-5 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]',
  iconBtn:
    'inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white text-[color:var(--billing-primary)] shadow-xs transition-colors hover:border-[color:var(--billing-accent)] hover:bg-[color:var(--billing-accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--billing-accent)]/40 disabled:cursor-not-allowed disabled:opacity-50',
  iconDanger:
    'inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 shadow-xs transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-50',
} as const;

export function ContractHero({
  title,
  subtitle,
  actions,
  meta,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className={cn(contractUi.hero, 'mb-6')}>
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className={contractUi.heroTitle}>{title}</h1>
          {subtitle ? <p className={contractUi.heroSubtitle}>{subtitle}</p> : null}
          {meta ? <div className="mt-3">{meta}</div> : null}
        </div>
        {actions ? (
          <div className={`${billingUi.pageHeaderActions} lg:w-auto lg:flex-row lg:justify-end`}>
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function ContractKpi({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const bar =
    tone === 'success'
      ? 'bg-[color:var(--billing-primary)]'
      : tone === 'warning' || tone === 'info'
        ? 'bg-[color:var(--billing-accent)]'
        : tone === 'danger'
          ? 'bg-red-500'
          : 'bg-[color:var(--billing-accent)]';
  const border =
    tone === 'success' || tone === 'default'
      ? 'border-[color:var(--billing-border-strong)]'
      : 'border-[color:var(--billing-accent-border)]';

  return (
    <div className={cn(contractUi.kpi, border, 'billing-tile-enter')}>
      <span className={cn('absolute inset-x-0 top-0 h-1', bar)} aria-hidden />
      <p className={contractUi.kpiLabel}>{label}</p>
      <p className={contractUi.kpiValue}>{value}</p>
      {hint ? <p className={contractUi.kpiHint}>{hint}</p> : null}
    </div>
  );
}

export function ContractChip({
  active,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        contractUi.chip,
        active ? contractUi.chipActive : contractUi.chipIdle,
        className,
      )}
      aria-pressed={active}
      {...props}
    >
      {children}
    </button>
  );
}

export function ContractPanel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(contractUi.panel, className)}>
      {title || actions ? (
        <div className={contractUi.panelHeader}>
          <div className="min-w-0">
            {title ? <h2 className={contractUi.panelTitle}>{title}</h2> : null}
            {description ? <p className={contractUi.panelDesc}>{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={contractUi.panelBody}>{children}</div>
    </section>
  );
}

/** Form section — navy header + gold subtitle (ReportIncidentForm Section). */
export function ContractSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(contractUi.section, className)}>
      <header className="border-b border-[#1C0770] bg-[#1C0770] px-4 py-3 sm:px-5">
        <h3 className={contractUi.sectionTitle}>{title}</h3>
        {description ? <p className={contractUi.sectionDesc}>{description}</p> : null}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

export function ContractField({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-slate-700">
        {label}
      </label>
      {children}
      {error ? (
        <p className={contractUi.fieldError} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs font-medium text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

const safetyInput =
  'w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-xs placeholder:text-slate-400 transition-[border-color,box-shadow] duration-150 hover:border-[color:var(--billing-border-strong)] focus:border-[color:var(--billing-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--billing-accent)]/40 disabled:cursor-not-allowed disabled:opacity-50';

export function ContractInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(safetyInput, props.className)} />;
}

export function ContractSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(safetyInput, 'cursor-pointer appearance-none', props.className)} />;
}

export function ContractAlert({
  tone = 'danger',
  children,
}: {
  tone?: 'danger' | 'warning' | 'success' | 'info' | 'accent';
  children: ReactNode;
}) {
  const cls =
    tone === 'danger'
      ? 'rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700'
      : tone === 'warning'
        ? 'rounded-xl border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] px-4 py-3 text-sm font-medium text-[color:var(--billing-primary)]'
        : tone === 'success'
          ? 'rounded-xl border border-[color:var(--billing-border-strong)] bg-[color:var(--billing-primary-soft)] px-4 py-3 text-sm font-medium text-[color:var(--billing-primary)]'
          : tone === 'info'
            ? 'rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700'
            : 'rounded-xl border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] px-4 py-3 text-sm font-bold text-[color:var(--billing-primary)]';
  return (
    <div className={cn(cls, 'mb-4')} role={tone === 'danger' || tone === 'warning' ? 'alert' : undefined}>
      {children}
    </div>
  );
}

export function ContractEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className={contractUi.empty}>
      <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-[color:var(--billing-accent-soft)] text-[color:var(--billing-primary)]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M7 7h10M7 12h10M7 17h6"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <rect x="3.75" y="3.75" width="16.5" height="16.5" rx="3" stroke="currentColor" strokeWidth="1.75" />
        </svg>
      </div>
      <p className={contractUi.emptyTitle}>{title}</p>
      {description ? <p className={contractUi.emptyDesc}>{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ContractLoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={cn(contractUi.skeleton, i === 0 ? 'h-28' : 'h-16')}
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  );
}

export function ContractToggleCard({
  checked,
  onChange,
  title,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  title: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn(contractUi.toggleCard, disabled && 'opacity-50', checked && '[&_span]:text-inherit')}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className={cn(
          billingUi.checkbox,
          'mt-0.5 shrink-0 rounded border-slate-300 text-[color:var(--billing-primary)] focus:ring-[color:var(--billing-accent)]',
        )}
      />
      <span className="min-w-0">
        <span className={cn('block text-sm font-bold', checked ? 'text-white' : 'text-slate-800')}>
          {title}
        </span>
        {description ? (
          <span className={cn('mt-0.5 block text-xs font-medium', checked ? 'text-white/80' : 'text-slate-500')}>
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}
