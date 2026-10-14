/**
 * Billing UI class tokens — Calm Ledger Light
 * Prefer these over ad-hoc emerald/indigo Tailwind in billing surfaces.
 */

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--billing-info)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--billing-bg)]';

const transition = 'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out';

export const billingUi = {
  page: 'billing-app min-h-0',

  pageTitle:
    'text-xl font-semibold tracking-tight text-[color:var(--billing-heading)] sm:text-2xl',
  pageSubtitle: 'mt-1 text-sm text-[color:var(--billing-text-muted)]',

  pageHeaderActions:
    'billing-page-header-actions flex w-full min-w-0 flex-wrap items-center gap-2',

  filterBar:
    'billing-filter-toolbar flex flex-col gap-3 rounded-[var(--billing-radius-xl)] border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] p-3 shadow-[var(--billing-shadow-sm)] sm:flex-row sm:flex-wrap sm:items-end sm:p-4',

  filterField:
    'billing-filter-field flex min-w-0 w-full flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)] sm:min-w-[9rem] sm:w-auto sm:flex-1',

  sectionTitle: 'text-sm font-semibold text-[color:var(--billing-heading)]',
  sectionDesc: 'mt-0.5 text-xs text-[color:var(--billing-text-muted)]',

  card: 'rounded-[var(--billing-radius-xl)] border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] shadow-[var(--billing-shadow-sm)]',
  /**
   * Insights KPI / hero / chart / CTA tiles — soft sky tint on white shell.
   * Remaps surface + ink via `.billing-insights-tile`.
   */
  insightsCard:
    'billing-insights-tile rounded-[var(--billing-radius-xl)] border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] shadow-[var(--billing-shadow-sm)] text-[color:var(--billing-text)]',
  /** Clickable insight / command tiles — hover glow in billing-design-system.css */
  tileGlow: 'billing-tile-glow billing-tile-enter',
  cardMuted:
    'rounded-[var(--billing-radius-xl)] border border-[color:var(--billing-border)] bg-[color:var(--billing-surface-muted)]',

  btnPrimary: `inline-flex items-center justify-center gap-1.5 rounded-[var(--billing-radius)] bg-[color:var(--billing-primary)] px-4 py-2 text-sm font-semibold text-[color:var(--billing-text-inverse)] shadow-[var(--billing-shadow-sm)] ${transition} hover:bg-[color:var(--billing-primary-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`,

  btnSecondary: `inline-flex items-center justify-center gap-1.5 rounded-[var(--billing-radius)] border border-[color:var(--billing-border-strong)] bg-[color:var(--billing-surface)] px-4 py-2 text-sm font-medium text-[color:var(--billing-text-secondary)] ${transition} hover:bg-[color:var(--billing-surface-muted)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`,

  btnAccent: `inline-flex items-center justify-center gap-1.5 rounded-[var(--billing-radius)] bg-[color:var(--billing-accent)] px-4 py-2 text-sm font-semibold text-[color:var(--billing-accent-strong)] shadow-[var(--billing-shadow-sm)] ${transition} hover:bg-[color:var(--billing-accent-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`,

  btnOutline: `inline-flex items-center justify-center gap-1.5 rounded-[var(--billing-radius)] border border-[color:var(--billing-primary)] bg-[color:var(--billing-surface)] px-4 py-2 text-sm font-medium text-[color:var(--billing-primary)] ${transition} hover:bg-[color:var(--billing-primary-soft)] hover:text-[color:var(--billing-primary-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`,

  btnGhost: `inline-flex items-center justify-center gap-1.5 rounded-[var(--billing-radius)] px-3 py-2 text-sm font-medium text-[color:var(--billing-text-secondary)] ${transition} hover:bg-[color:var(--billing-primary-soft)] hover:text-[color:var(--billing-primary)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`,

  btnDanger: `inline-flex items-center justify-center gap-1.5 rounded-[var(--billing-radius)] bg-[color:var(--billing-danger)] px-4 py-2 text-sm font-semibold text-[color:var(--billing-text-inverse)] ${transition} hover:bg-[color:var(--billing-danger-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`,

  btnDangerOutline: `inline-flex items-center justify-center gap-1.5 rounded-[var(--billing-radius)] border border-[color:var(--billing-danger-border)] bg-[color:var(--billing-surface)] px-4 py-2 text-sm font-medium text-[color:var(--billing-danger)] ${transition} hover:bg-[color:var(--billing-danger-soft)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`,

  link: `text-sm font-medium text-[color:var(--billing-info)] ${transition} hover:text-[color:var(--billing-primary)] hover:underline underline-offset-2`,

  input:
    'w-full min-w-0 rounded-[var(--billing-radius)] border border-[color:var(--billing-border-strong)] bg-[color:var(--billing-surface)] px-3 py-2 text-sm text-[color:var(--billing-text)] shadow-[var(--billing-shadow-sm)] placeholder:text-[color:var(--billing-text-muted)] transition-[border-color,box-shadow] duration-150 hover:border-[color:var(--billing-secondary)] focus:border-[color:var(--billing-info)] focus:outline-none focus:ring-2 focus:ring-[color:var(--billing-info)]/25 disabled:cursor-not-allowed disabled:opacity-50',

  select:
    'w-full min-w-0 cursor-pointer appearance-none rounded-[var(--billing-radius)] border border-[color:var(--billing-border-strong)] bg-[color:var(--billing-surface)] px-3 py-2 text-sm text-[color:var(--billing-text)] shadow-[var(--billing-shadow-sm)] transition-[border-color,box-shadow] duration-150 hover:border-[color:var(--billing-secondary)] focus:border-[color:var(--billing-info)] focus:outline-none focus:ring-2 focus:ring-[color:var(--billing-info)]/25 disabled:cursor-not-allowed disabled:opacity-50',

  label: 'text-sm font-medium text-[color:var(--billing-text-secondary)]',
  hint: 'text-xs text-[color:var(--billing-text-muted)]',

  alertSuccess:
    'rounded-[var(--billing-radius-lg)] border border-[color:var(--billing-success-border)] bg-[color:var(--billing-success-soft)] px-4 py-3 text-sm text-[color:var(--billing-success)]',
  alertWarning:
    'rounded-[var(--billing-radius-lg)] border border-[color:var(--billing-warning-border)] bg-[color:var(--billing-warning-soft)] px-4 py-3 text-sm text-[color:var(--billing-warning)]',
  alertDanger:
    'rounded-[var(--billing-radius-lg)] border border-[color:var(--billing-danger-border)] bg-[color:var(--billing-danger-soft)] px-4 py-3 text-sm text-[color:var(--billing-danger)]',
  alertInfo:
    'rounded-[var(--billing-radius-lg)] border border-[color:var(--billing-info-border)] bg-[color:var(--billing-info-soft)] px-4 py-3 text-sm text-[color:var(--billing-info)]',
  alertAccent:
    'rounded-[var(--billing-radius-lg)] border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] px-4 py-3 text-sm text-[color:var(--billing-accent-strong)]',

  checkbox:
    'h-4 w-4 rounded border-[color:var(--billing-border-strong)] text-[color:var(--billing-primary)] focus:ring-[color:var(--billing-info)]',

  badgeNeutral:
    'inline-flex rounded-full bg-[color:var(--billing-secondary-soft)] px-2.5 py-0.5 text-xs font-medium capitalize text-[color:var(--billing-info)]',
  badgeSuccess:
    'inline-flex rounded-full bg-[color:var(--billing-success-soft)] px-2.5 py-0.5 text-xs font-medium capitalize text-[color:var(--billing-success)]',
  badgeWarning:
    'inline-flex rounded-full bg-[color:var(--billing-warning-soft)] px-2.5 py-0.5 text-xs font-medium capitalize text-[color:var(--billing-warning)]',
  badgeDanger:
    'inline-flex rounded-full bg-[color:var(--billing-danger-soft)] px-2.5 py-0.5 text-xs font-medium capitalize text-[color:var(--billing-danger)]',
  badgeInfo:
    'inline-flex rounded-full bg-[color:var(--billing-info-soft)] px-2.5 py-0.5 text-xs font-medium capitalize text-[color:var(--billing-info)]',
  badgeAccent:
    'inline-flex rounded-full bg-[color:var(--billing-accent-soft)] px-2.5 py-0.5 text-xs font-medium capitalize text-[color:var(--billing-accent-strong)]',

  tableWrap:
    'min-w-0 w-full max-w-full overflow-hidden rounded-[var(--billing-radius-xl)] border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] shadow-[var(--billing-shadow-sm)]',
  table: 'billing-table w-max min-w-full text-left text-sm',
  tableHeadCell:
    'px-4 py-3 align-top text-xs font-semibold uppercase tracking-wide text-[color:var(--billing-heading)]',
  tableCell: 'px-4 py-3 text-[color:var(--billing-text-secondary)]',
  tableEmpty: 'px-4 py-10 text-center text-sm text-[color:var(--billing-text-muted)]',
  tableFooter:
    'border-t border-[color:var(--billing-border)] px-4 py-2 text-xs text-[color:var(--billing-text-muted)]',

  tabActive:
    'border-b-2 border-[color:var(--billing-primary)] px-3 py-2 text-sm font-semibold text-[color:var(--billing-primary)]',
  tabIdle:
    'border-b-2 border-transparent px-3 py-2 text-sm font-medium text-[color:var(--billing-text-muted)] hover:text-[color:var(--billing-text-secondary)]',

  iconAction:
    `inline-flex h-8 w-8 items-center justify-center rounded-[var(--billing-radius)] text-[color:var(--billing-info)] ${transition} hover:bg-[color:var(--billing-surface-muted)] hover:text-[color:var(--billing-primary)] ${focusRing}`,
  iconDanger:
    `inline-flex h-8 w-8 items-center justify-center rounded-[var(--billing-radius)] text-[color:var(--billing-danger)] ${transition} hover:bg-[color:var(--billing-danger-soft)] ${focusRing}`,

  spinner:
    'h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--billing-info-border)] border-t-[color:var(--billing-info)]',

  kpiDefault:
    'rounded-[var(--billing-radius-xl)] border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] p-4 shadow-[var(--billing-shadow-sm)]',
  kpiSuccess:
    'rounded-[var(--billing-radius-xl)] border border-[color:var(--billing-success-border)] bg-[color:var(--billing-success-soft)] p-4 shadow-[var(--billing-shadow-sm)]',
  kpiWarning:
    'rounded-[var(--billing-radius-xl)] border border-[color:var(--billing-warning-border)] bg-[color:var(--billing-warning-soft)] p-4 shadow-[var(--billing-shadow-sm)]',
  kpiDanger:
    'rounded-[var(--billing-radius-xl)] border border-[color:var(--billing-danger-border)] bg-[color:var(--billing-danger-soft)] p-4 shadow-[var(--billing-shadow-sm)]',
} as const;

/** Common Tailwind emerald → Calm Ledger replacements for bulk migration. */
export const BILLING_CLASS_REPLACEMENTS: Array<[string, string]> = [
  ['bg-emerald-600', 'bg-[color:var(--billing-primary)]'],
  ['hover:bg-emerald-700', 'hover:bg-[color:var(--billing-primary-hover)]'],
  ['bg-emerald-700', 'bg-[color:var(--billing-primary-hover)]'],
  ['bg-emerald-500', 'bg-[color:var(--billing-accent)]'],
  ['bg-emerald-50/70', 'bg-[color:var(--billing-accent-soft)]'],
  ['bg-emerald-50/40', 'bg-[color:var(--billing-accent-soft)]'],
  ['bg-emerald-50', 'bg-[color:var(--billing-accent-soft)]'],
  ['bg-emerald-100', 'bg-[color:var(--billing-accent-soft)]'],
  ['text-emerald-950', 'text-[color:var(--billing-primary)]'],
  ['text-emerald-900', 'text-[color:var(--billing-primary)]'],
  ['text-emerald-800', 'text-[color:var(--billing-accent-strong)]'],
  ['text-emerald-700', 'text-[color:var(--billing-accent-strong)]'],
  ['hover:text-emerald-900', 'hover:text-[color:var(--billing-primary)]'],
  ['border-emerald-600', 'border-[color:var(--billing-accent)]'],
  ['border-emerald-500', 'border-[color:var(--billing-accent)]'],
  ['border-emerald-400', 'border-[color:var(--billing-accent-muted)]'],
  ['border-emerald-300', 'border-[color:var(--billing-accent-border)]'],
  ['border-emerald-200', 'border-[color:var(--billing-accent-border)]'],
  ['border-emerald-100', 'border-[color:var(--billing-accent-border)]'],
  ['hover:border-emerald-400', 'hover:border-[color:var(--billing-accent)]'],
  ['hover:border-emerald-300', 'hover:border-[color:var(--billing-accent)]'],
  ['hover:bg-emerald-100', 'hover:bg-[color:var(--billing-accent-soft)]'],
  ['hover:bg-emerald-50', 'hover:bg-[color:var(--billing-accent-soft)]'],
  ['focus:border-emerald-500', 'focus:border-[color:var(--billing-accent)]'],
  ['focus:ring-emerald-500', 'focus:ring-[color:var(--billing-accent)]'],
  ['focus:ring-emerald-600', 'focus:ring-[color:var(--billing-accent)]'],
  ['focus:ring-emerald-600/40', 'focus:ring-[color:var(--billing-accent)]/40'],
  ['focus-visible:ring-emerald-600/40', 'focus-visible:ring-[color:var(--billing-accent)]/40'],
  ['focus-visible:outline-emerald-600', 'focus-visible:outline-[color:var(--billing-accent)]'],
  ['ring-emerald-500', 'ring-[color:var(--billing-accent)]'],
  ['shadow-emerald-500/25', 'shadow-[color:var(--billing-primary)]/15'],
  ['border-t-emerald-700', 'border-t-[color:var(--billing-accent)]'],
  ['border-emerald-300', 'border-[color:var(--billing-accent-border)]'],
  ['text-indigo-800', 'text-[color:var(--billing-info)]'],
  ['bg-indigo-100', 'bg-[color:var(--billing-info-soft)]'],
  ['text-violet-800', 'text-[color:var(--billing-secondary-hover)]'],
  ['bg-violet-100', 'bg-[color:var(--billing-secondary-soft)]'],
  ['text-sky-800', 'text-[color:var(--billing-info)]'],
  ['bg-sky-100', 'bg-[color:var(--billing-info-soft)]'],
  ['bg-[#f7f8fa]', 'bg-[color:var(--billing-bg)]'],
];
