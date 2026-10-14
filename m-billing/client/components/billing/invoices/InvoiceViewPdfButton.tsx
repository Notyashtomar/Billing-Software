'use client';

import { Eye, FileDown } from 'lucide-react';

type Props = {
  loading?: boolean;
  onView: () => void;
  onDownload?: () => void;
  compact?: boolean;
  disabled?: boolean;
  disabledTitle?: string;
};

const btn =
  'inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold shadow-sm transition-[background-color,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';

export function InvoiceViewPdfButton({
  loading = false,
  onView,
  onDownload,
  compact = false,
  disabled = false,
  disabledTitle,
}: Props) {
  const isDisabled = loading || disabled;
  if (compact) {
    return (
      <button
        type="button"
        disabled={isDisabled}
        title={disabled ? disabledTitle : 'View invoice PDF (no approval required)'}
        onClick={onView}
        className={`${btn} bg-[color:var(--billing-primary)] px-2.5 py-1.5 text-white hover:bg-[color:var(--billing-primary-hover)]`}
      >
        {loading ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        ) : (
          <Eye className="h-3.5 w-3.5" aria-hidden />
        )}
        View PDF
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={isDisabled}
        title={disabled ? disabledTitle : undefined}
        onClick={onView}
        className={`${btn} border border-[color:var(--billing-accent)] bg-[color:var(--billing-primary)] px-4 py-2.5 text-sm text-white hover:bg-[color:var(--billing-primary-hover)]`}
      >
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden />
        )}
        {loading ? 'Opening…' : 'View PDF'}
      </button>
      {onDownload ? (
        <button
          type="button"
          disabled={isDisabled}
          title={disabled ? disabledTitle : undefined}
          onClick={onDownload}
          className={`${btn} border border-[color:var(--billing-accent)] bg-white px-4 py-2.5 text-sm text-[color:var(--billing-accent-strong)] hover:bg-[color:var(--billing-accent-soft)]`}
        >
          <FileDown className="h-4 w-4" aria-hidden />
          Download
        </button>
      ) : null}
    </>
  );
}
