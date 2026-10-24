'use client';

import { FileText } from 'lucide-react';

type Props = {
  busy?: boolean;
  compact?: boolean;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
};

const btnBase =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold shadow-sm transition-[background-color,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';

const btnDefault = `${btnBase} border border-emerald-600 bg-emerald-600 px-4 py-2.5 text-sm text-white hover:bg-emerald-700`;

const btnCompact = `${btnBase} border border-emerald-600 bg-emerald-600 px-3 py-2 text-xs text-white hover:bg-emerald-700`;

/** True for every ADS invoice, any airline, any station. */
export function invoiceShowsAdsAnnexure(invoiceCategory: string | undefined): boolean {
  return String(invoiceCategory ?? '').trim().toUpperCase() === 'ADS';
}

export function InvoiceViewAnnexureButton({
  busy = false,
  compact = false,
  disabled = false,
  className,
  onClick,
}: Props) {
  const btnClass = [compact ? btnCompact : btnDefault, className].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      disabled={busy || disabled}
      onClick={onClick}
      className={btnClass}
      title="Open the additional equipment annexure generated from this invoice and the contract Clauses equipment rules"
      aria-label="Annexure"
    >
      {busy ? (
        <span
          className={`${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} animate-spin rounded-full border-2 border-white/30 border-t-white`}
        />
      ) : (
        <FileText className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />
      )}
      {busy ? 'Opening…' : 'Annexure'}
    </button>
  );
}
