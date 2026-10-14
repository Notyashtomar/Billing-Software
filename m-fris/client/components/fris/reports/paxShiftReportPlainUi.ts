/**
 * Themed table chrome for the Pax shift report **web** view (Flight Details + full report page).
 * Uses dashboard tokens from `app/globals.css` so light/dark match the rest of FRIS.
 * PDF generation stays black & white in `paxShiftReportPdf.ts`.
 */
export const paxShiftReportPlain = {
  page: 'min-h-[calc(100vh-3rem)] bg-[var(--dash-bg-primary)] px-3 pb-12 pt-4 text-[var(--dash-text)] print:min-h-0 sm:px-4 lg:px-6',
  maxWidth: 'mx-auto max-w-6xl',
  /** Top chrome (back link + title + actions). */
  headerBar:
    'mb-6 flex flex-col gap-4 border-b border-[color:var(--dash-border)] pb-6 sm:flex-row sm:items-start sm:justify-between',
  linkBack:
    'inline-flex items-center gap-1.5 text-sm font-medium text-[var(--dash-accent)] underline underline-offset-2 hover:text-[var(--dash-text-strong)] hover:no-underline',
  docTitle: 'text-center text-2xl font-bold text-[var(--dash-text-strong)] sm:text-3xl',
  btnPrimary:
    'inline-flex items-center gap-2 rounded-lg border border-transparent bg-[var(--dash-accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dash-accent)]',
  btnSecondary:
    'inline-flex items-center gap-2 rounded-lg border border-[color:var(--dash-border)] bg-[var(--dash-card)] px-4 py-2.5 text-sm font-semibold text-[var(--dash-text-strong)] shadow-[var(--dash-shadow-card)] transition-colors hover:bg-[var(--dash-hover-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dash-accent)]',
  btnDisabled:
    'inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-[color:var(--dash-border)] bg-[var(--dash-surface)] px-4 py-2.5 text-sm font-medium text-[var(--dash-text-soft)]',
  panel:
    'rounded-xl border border-[color:var(--dash-border)] bg-[var(--dash-card)] p-6 text-sm text-[var(--dash-text)] shadow-[var(--dash-shadow-card)]',
  panelLarge:
    'flex items-center gap-3 rounded-xl border border-[color:var(--dash-border)] bg-[var(--dash-card)] p-8 text-[var(--dash-text)] shadow-[var(--dash-shadow-card)]',
  spinner: 'h-8 w-8 shrink-0 animate-spin text-[var(--dash-accent)]',
  /** Centered section heading (web only; PDF uses its own draw). */
  sectionTitle: 'mb-2 text-center text-sm font-bold text-[var(--dash-text-strong)]',
  /** Left subheading above a nested table block. */
  blockLabel: 'mb-1.5 mt-4 text-left text-xs font-bold text-[var(--dash-text-strong)]',
  tableWrap:
    'overflow-x-auto overscroll-x-contain touch-pan-x rounded-lg border border-[color:var(--dash-table-border)] bg-[var(--dash-card)] shadow-[var(--dash-shadow-card)]',
  table:
    'w-full border-collapse border border-[color:var(--dash-table-border)] text-sm text-[var(--dash-text)]',
  th: 'border border-[color:var(--dash-table-border)] bg-[var(--dash-table-header)] px-1.5 py-1 text-left text-xs font-semibold text-[var(--dash-text-strong)] align-top whitespace-normal',
  td: 'border border-[color:var(--dash-table-border)] px-1.5 py-1 text-left text-xs text-[var(--dash-text)] align-top',
  note: 'mt-1.5 text-xs text-[var(--dash-text-muted)]',
  /** Free-text block inside the same chrome as tables (e.g. brief handling). */
  proseBox: 'px-2 py-2 text-xs whitespace-pre-wrap text-[var(--dash-text)]',
} as const;
