'use client';

import { FileDown, Send } from 'lucide-react';

type Props = {
  selectedCount?: number;
  exporting?: boolean;
  sending?: boolean;
  onExportPdf: () => void;
  onSendToAirline: () => void;
  disabled?: boolean;
  /** When true, appends selection count to button labels (list page). */
  showSelectionCount?: boolean;
  hideExport?: boolean;
};

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold shadow-sm transition-[background-color,transform,box-shadow] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40';

export function InvoiceHeaderActionButtons({
  selectedCount = 0,
  exporting = false,
  sending = false,
  onExportPdf,
  onSendToAirline,
  disabled = false,
  showSelectionCount = false,
  hideExport = false,
}: Props) {
  const countSuffix = showSelectionCount && selectedCount > 0 ? ` (${selectedCount})` : '';
  const isDisabled = disabled;

  return (
    <>
      {!hideExport ? (
      <button
        type="button"
        disabled={isDisabled || exporting}
        onClick={onExportPdf}
        className={`${base} border border-[color:var(--billing-accent)] bg-[color:var(--billing-primary)] text-white hover:bg-[color:var(--billing-primary-hover)] hover:shadow-md hover:shadow-[color:var(--billing-primary)]/15`}
      >
        {exporting ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        ) : (
          <FileDown className="h-4 w-4 shrink-0" aria-hidden />
        )}
        {exporting ? 'Exporting…' : `Export to PDF${countSuffix}`}
      </button>
      ) : null}
      <button
        type="button"
        disabled={isDisabled || sending}
        onClick={onSendToAirline}
        className={`${base} border border-[color:var(--billing-accent-strong)] bg-[color:var(--billing-primary-hover)] text-white hover:bg-[color:var(--billing-primary)] hover:shadow-md hover:shadow-[color:var(--billing-primary)]/20`}
      >
        {sending ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        ) : (
          <Send className="h-4 w-4 shrink-0" aria-hidden />
        )}
        {sending ? 'Sending…' : `Send to airline${countSuffix}`}
      </button>
    </>
  );
}
