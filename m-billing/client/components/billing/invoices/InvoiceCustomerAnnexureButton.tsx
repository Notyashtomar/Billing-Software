'use client';

import { FileText } from 'lucide-react';

type Props = {
  busy?: boolean;
  compact?: boolean;
  title?: string;
  onClick: () => void;
};

const btn =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-600 font-semibold text-white shadow-sm transition-[background-color,transform] duration-150 hover:bg-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';

export function InvoiceCustomerAnnexureButton({
  busy = false,
  compact = false,
  title = 'Open the annexure saved for this airline and invoice category',
  onClick,
}: Props) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      title={title}
      aria-label="Annexure"
      className={compact ? `${btn} px-3 py-2 text-xs` : `${btn} px-4 py-2.5 text-sm`}
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
