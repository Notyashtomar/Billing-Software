'use client';

import { FileText } from 'lucide-react';

type Props = {
  loading?: boolean;
  onView: () => void;
};

const btn =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-[color:var(--billing-accent-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[color:var(--billing-accent-strong)] shadow-sm transition-[background-color,transform] duration-150 hover:border-[color:var(--billing-accent-muted)] hover:bg-[color:var(--billing-accent-soft)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';

/** Opens the finance reference invoice PDF (SI/MA/326/001896) for layout review. */
export function InvoiceSamplePdfButton({ loading = false, onView }: Props) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onView}
      className={btn}
      title="Preview sample tax invoice PDF structure (SpiceJet ADS reference)"
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--billing-accent-border)] border-t-[color:var(--billing-accent)]" />
      ) : (
        <FileText className="h-4 w-4 shrink-0" aria-hidden />
      )}
      {loading ? 'Opening…' : 'Sample invoice PDF'}
    </button>
  );
}
