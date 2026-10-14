'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import {
  annexurePublicUrl,
  getAdsAnnexuresForCustomer,
  invoiceShowsAirlineAnnexure,
  type AdsAirlineAnnexureFile,
} from './adsAirlineAnnexures';

type Props = {
  customerCode?: string | null;
  className?: string;
  /** Smaller control for nested panels (e.g. calculation details). */
  compact?: boolean;
};

const btnBase =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold shadow-sm transition-[background-color,transform] duration-150 active:scale-[0.98]';

const btnDefault = `${btnBase} border border-emerald-600 bg-emerald-600 px-4 py-2.5 text-sm text-white hover:bg-emerald-700`;

const btnCompact = `${btnBase} border border-emerald-600 bg-emerald-600 px-3 py-2 text-xs text-white hover:bg-emerald-700`;

export function openAnnexurePdf(file: AdsAirlineAnnexureFile): void {
  const url = annexurePublicUrl(file.file);
  window.open(url, '_blank', 'noopener,noreferrer');
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.file;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** True when this invoice should expose airline annexures (ADS + BHS + Custom). */
export function invoiceShowsAdsAnnexure(
  invoiceCategory: string | undefined,
  lines?: Array<{ sourceType?: string | null }>,
  customerCode?: string | null,
): boolean {
  return invoiceShowsAirlineAnnexure(invoiceCategory, lines, customerCode);
}

export function InvoiceViewAnnexureButton({
  customerCode,
  className,
  compact = false,
}: Props) {
  const entry = getAdsAnnexuresForCustomer(customerCode);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!entry || entry.files.length === 0) return null;

  const btnClass = [compact ? btnCompact : btnDefault, className].filter(Boolean).join(' ');
  const label = entry.files.length === 1 ? 'View Annexure' : `View Annexure (${entry.files.length})`;

  if (entry.files.length === 1) {
    const only = entry.files[0]!;
    return (
      <button
        type="button"
        onClick={() => openAnnexurePdf(only)}
        className={btnClass}
        title={`View and download ${entry.airline} annexure — ${only.title}`}
        aria-label={`View and download ${entry.airline} annexure`}
      >
        <FileText className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />
        {label}
      </button>
    );
  }

  return (
    <div className="relative inline-flex" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={btnClass}
        title={`View and download ${entry.airline} annexures`}
        aria-label={`View and download ${entry.airline} annexures`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
      >
        <FileText className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />
        {label}
        <ChevronDown className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 min-w-[16rem] overflow-hidden rounded-lg border border-emerald-200 bg-white py-1 shadow-lg"
        >
          <p className="border-b border-gray-100 px-3 py-1.5 text-[11px] font-medium text-gray-500">
            {entry.airline}
          </p>
          {entry.files.map((file) => (
            <button
              key={file.file}
              type="button"
              role="menuitem"
              className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm text-gray-900 hover:bg-emerald-50"
              onClick={() => {
                openAnnexurePdf(file);
                setOpen(false);
              }}
            >
              <span className="font-medium">{file.title}</span>
              <span className="text-[11px] text-gray-500">{file.file}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
