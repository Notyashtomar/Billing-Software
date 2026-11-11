'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { billingUi } from '../billingUi';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingCustomer } from '@/lib/billing-shared/types';
import {
  PRICE_CARD_AIRLINE_CATEGORY_LABELS,
  type PriceCardHandlingType,
} from '@/lib/billing-shared/enums';
import {
  downloadPriceCardImportTemplate,
  parsePriceCardImportWorkbook,
  type PriceCardImportRow,
} from './priceCardImportExcel';

type Props = {
  api: BillingApi;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  handling: PriceCardHandlingType;
  stationCode: string;
  customers: BillingCustomer[];
  onImported: (count: number) => void;
  onError: (message: string) => void;
};

const ACCEPT =
  '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function PriceCardImportDialog({
  api,
  open,
  onOpenChange,
  handling,
  stationCode,
  customers,
  onImported,
  onError,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<PriceCardImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (open) return;
    setFileName('');
    setRows([]);
    setErrors([]);
    setParsing(false);
    setImporting(false);
    setDragOver(false);
  }, [open]);

  const busy = downloading || parsing || importing;

  const downloadFormat = async () => {
    setDownloading(true);
    try {
      await downloadPriceCardImportTemplate({ handling, stationCode, customers });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not download the import format.');
    } finally {
      setDownloading(false);
    }
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setRows([]);
    setErrors([]);
    setParsing(true);
    try {
      const result = await parsePriceCardImportWorkbook(file, handling, customers);
      setRows(result.rows);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not read this file.';
      setErrors(message.split('\n').filter(Boolean));
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const runImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    try {
      await api.createPriceCardAirlinesBulk({
        handlingType: handling,
        rows: rows.map((row) => ({
          customerCode: row.customerCode,
          airlineName: row.airlineName,
          aircraftType: row.aircraftType,
          category: row.category,
          validFrom: row.validFrom,
          validTo: row.validTo,
          remarks: row.remarks,
          ...(handling === 'BHS'
            ? { price: row.price, flightOperation: row.flightOperation }
            : {}),
        })),
      });
      onImported(rows.length);
      onOpenChange(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const airlineCount = new Set(rows.map((row) => row.customerCode)).size;
  const preview = rows.slice(0, 8);

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="billing-app flex max-h-[90vh] w-[calc(100vw-2rem)] !max-w-[34rem] flex-col gap-0 overflow-hidden rounded-2xl !border-[color:var(--billing-border-strong)] !bg-[color:var(--billing-surface)] p-0 text-[color:var(--billing-text)]">
        <DialogHeader className="border-b border-[color:var(--billing-border)] px-6 py-4">
          <DialogTitle className="text-[color:var(--billing-heading)]">
            Import {handling} rate cards
          </DialogTitle>
          <DialogDescription className="text-[color:var(--billing-text-muted)]">
            Download the format, fill one row per airline and aircraft type, then upload the
            file. Only files in this format are accepted.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <ol className="grid gap-3">
            <li className="flex flex-col gap-3 rounded-[var(--billing-radius)] border border-[color:var(--billing-border)] bg-[color:var(--billing-surface-muted)] p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--billing-text-muted)]">
                  Step 1
                </p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--billing-heading)]">
                  Download the format
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[color:var(--billing-text-secondary)]">
                  A blank Excel file with the required columns, drop-downs for flight category
                  {handling === 'BHS' ? ' and flight operation' : ''}, and the airline codes at{' '}
                  {stationCode.toUpperCase()}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void downloadFormat()}
                disabled={busy}
                className={`${billingUi.btnSecondary} mt-auto w-full justify-center`}
              >
                <Download className="h-4 w-4" aria-hidden />
                {downloading ? 'Preparing…' : 'Download format'}
              </button>
            </li>

            <li className="flex flex-col gap-3 rounded-[var(--billing-radius)] border border-[color:var(--billing-border)] bg-[color:var(--billing-surface-muted)] p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--billing-text-muted)]">
                  Step 2
                </p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--billing-heading)]">
                  Upload the filled file
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[color:var(--billing-text-secondary)]">
                  Rows are checked before anything is saved. Fix any reported row and upload
                  again.
                </p>
              </div>
              <div
                role="button"
                tabIndex={0}
                aria-label="Upload filled rate card file"
                onClick={() => !busy && fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (!busy) fileInputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!busy) setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (busy) return;
                  void readFile(e.dataTransfer.files?.[0]);
                }}
                className={`mt-auto flex cursor-pointer items-center justify-center gap-2 rounded-[var(--billing-radius)] border border-dashed px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--billing-info)] ${
                  dragOver
                    ? 'border-[color:var(--billing-primary)] bg-[color:var(--billing-primary-soft)] text-[color:var(--billing-primary)]'
                    : 'border-[color:var(--billing-border-strong)] bg-[color:var(--billing-surface)] text-[color:var(--billing-text)] hover:border-[color:var(--billing-primary)] hover:text-[color:var(--billing-primary)]'
                } ${busy ? 'pointer-events-none opacity-60' : ''}`}
              >
                <Upload className="h-4 w-4" aria-hidden />
                {parsing ? 'Reading…' : 'Choose file or drop here'}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => void readFile(e.target.files?.[0])}
              />
            </li>
          </ol>

          {fileName ? (
            <div className="flex items-center gap-2 text-sm text-[color:var(--billing-text-secondary)]">
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-[color:var(--billing-success)]" aria-hidden />
              <span className="truncate font-medium text-[color:var(--billing-text)]">{fileName}</span>
              {!parsing ? (
                <button
                  type="button"
                  onClick={() => {
                    setFileName('');
                    setRows([]);
                    setErrors([]);
                  }}
                  className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full text-[color:var(--billing-text-muted)] hover:bg-[color:var(--billing-surface-muted)] hover:text-[color:var(--billing-text)]"
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </div>
          ) : null}

          {errors.length > 0 ? (
            <div className={billingUi.alertDanger} role="alert">
              <p className="font-semibold">
                {errors.length === 1
                  ? 'This file cannot be imported'
                  : `${errors.length} problems found — nothing was imported`}
              </p>
              <ul className="mt-2 max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-xs leading-relaxed">
                {errors.map((error, index) => (
                  <li key={`${index}-${error}`}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {rows.length > 0 ? (
            <div className="overflow-hidden rounded-[var(--billing-radius)] border border-[color:var(--billing-border)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--billing-border)] bg-[color:var(--billing-surface-muted)] px-4 py-2.5">
                <p className="text-sm font-semibold text-[color:var(--billing-heading)]">
                  Ready to import
                </p>
                <p className="text-xs text-[color:var(--billing-text-secondary)]">
                  {rows.length} rate card{rows.length === 1 ? '' : 's'} · {airlineCount} airline
                  {airlineCount === 1 ? '' : 's'}
                </p>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="text-[color:var(--billing-text-muted)]">
                  <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
                    <th>Airline</th>
                    <th>Aircraft</th>
                    <th>Category</th>
                    {handling === 'BHS' ? <th className="text-right">Price</th> : null}
                    <th>Valid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--billing-border)] text-[color:var(--billing-text)]">
                  {preview.map((row, index) => (
                    <tr key={`${row.customerCode}-${row.aircraftType}-${index}`} className="[&>td]:px-3 [&>td]:py-1.5">
                      <td className="font-medium">
                        {row.customerCode}
                        <span className="ml-1 font-normal text-[color:var(--billing-text-muted)]">
                          {row.airlineName}
                        </span>
                      </td>
                      <td className="tabular-nums">{row.aircraftType}</td>
                      <td>{PRICE_CARD_AIRLINE_CATEGORY_LABELS[row.category]}</td>
                      {handling === 'BHS' ? (
                        <td className="text-right tabular-nums">
                          {row.price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          {row.flightOperation === 'additional' ? (
                            <span className="ml-1 text-[color:var(--billing-text-muted)]">(Addl.)</span>
                          ) : null}
                        </td>
                      ) : null}
                      <td className="whitespace-nowrap tabular-nums text-[color:var(--billing-text-secondary)]">
                        {row.validFrom} → {row.validTo.startsWith('2099') ? 'Open' : row.validTo}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > preview.length ? (
                <p className="border-t border-[color:var(--billing-border)] px-4 py-2 text-xs text-[color:var(--billing-text-muted)]">
                  …and {rows.length - preview.length} more row
                  {rows.length - preview.length === 1 ? '' : 's'}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t border-[color:var(--billing-border)] px-6 py-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className={billingUi.btnSecondary}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void runImport()}
            disabled={busy || rows.length === 0}
            className={billingUi.btnPrimary}
          >
            <Upload className="h-4 w-4" aria-hidden />
            {importing
              ? 'Importing…'
              : rows.length > 0
                ? `Import ${rows.length} rate card${rows.length === 1 ? '' : 's'}`
                : 'Import'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
