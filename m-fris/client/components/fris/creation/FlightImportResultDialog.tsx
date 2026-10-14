'use client';

import React from 'react';
import { AlertCircle, Download, FileWarning } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { resolveImportErrorFileUrl } from '@/lib/api';

export type FlightImportDialogError = {
  row: number;
  column: string;
  message: string;
  value?: unknown;
};

export type FlightImportResultDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName?: string;
  totalRows?: number;
  importedRows?: number;
  failedRows?: number;
  message?: string;
  errors?: FlightImportDialogError[];
  missingHeaders?: string[];
  duplicateHeaders?: string[];
  errorFileUrl?: string;
};

function formatCellValue(value: unknown): string {
  if (value == null || value === '') return '—';
  return String(value);
}

export function FlightImportResultDialog({
  open,
  onOpenChange,
  fileName,
  totalRows = 0,
  importedRows = 0,
  failedRows = 0,
  message,
  errors = [],
  missingHeaders = [],
  duplicateHeaders = [],
  errorFileUrl,
}: FlightImportResultDialogProps) {
  const isPartial = importedRows > 0 && failedRows > 0;
  const isFullFailure = importedRows === 0 && (failedRows > 0 || errors.length > 0 || missingHeaders.length > 0);

  const title = isPartial
    ? 'Import completed with errors'
    : isFullFailure
      ? 'Import could not be completed'
      : 'Import validation failed';

  const description =
    message ??
    (isPartial
      ? `${importedRows} of ${totalRows} row${totalRows === 1 ? '' : 's'} imported. Fix the issues below and re-upload the failed rows.`
      : failedRows > 0
        ? `${failedRows} row${failedRows === 1 ? '' : 's'} failed validation. Please correct your file and try again.`
        : 'The uploaded file could not be processed. Check the details below.');

  const handleDownloadReport = () => {
    if (!errorFileUrl) return;
    window.open(resolveImportErrorFileUrl(errorFileUrl), '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden sm:rounded-2xl">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                isPartial ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
              }`}
            >
              {isPartial ? (
                <FileWarning className="h-5 w-5" />
              ) : (
                <AlertCircle className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 text-left">
              <DialogTitle className="text-left text-slate-900">{title}</DialogTitle>
              <DialogDescription className="mt-1.5 text-left text-slate-600">
                {description}
              </DialogDescription>
              {fileName ? (
                <p className="mt-2 truncate text-xs text-slate-500">File: {fileName}</p>
              ) : null}
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
          {(totalRows > 0 || importedRows > 0 || failedRows > 0) && (
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-center text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
                <p className="font-semibold text-slate-900">{totalRows}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Imported</p>
                <p className="font-semibold text-emerald-700">{importedRows}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Failed</p>
                <p className="font-semibold text-red-600">{failedRows}</p>
              </div>
            </div>
          )}

          {missingHeaders.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
              <p className="text-sm font-medium text-red-800">Missing required columns</p>
              <p className="mt-1 text-sm text-red-700">
                {missingHeaders.join(', ')}
              </p>
              <p className="mt-2 text-xs text-red-600">
                Download the Excel template and ensure all column headers match exactly.
              </p>
            </div>
          )}

          {duplicateHeaders.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <p className="text-sm font-medium text-amber-900">Duplicate columns detected</p>
              <p className="mt-1 text-sm text-amber-800">{duplicateHeaders.join(', ')}</p>
            </div>
          )}

          {errors.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-3 py-2 text-left font-medium text-slate-700">Row</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-700">Field</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-700">Value</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-700">Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.slice(0, 50).map((err, idx) => (
                    <tr key={`${err.row}-${err.column}-${idx}`} className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-900">{err.row || '—'}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{err.column}</td>
                      <td className="max-w-[100px] truncate px-3 py-2 text-slate-600" title={formatCellValue(err.value)}>
                        {formatCellValue(err.value)}
                      </td>
                      <td className="px-3 py-2 text-red-700">{err.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {errors.length > 50 && (
                <p className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  Showing first 50 errors. Download the error report for the full list.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {errorFileUrl ? (
            <button
              type="button"
              onClick={handleDownloadReport}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Download error report
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center justify-center rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-medium text-white shadow transition hover:bg-slate-700"
          >
            Close
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
