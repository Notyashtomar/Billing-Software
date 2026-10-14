'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { BillingContract } from '@/lib/billing-shared/types';
import { formatBillingDateRange } from '@/lib/billing-shared/billing-date-format';
import { exportContractsToExcel } from './exportContractExcel';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contracts: BillingContract[];
  onExported?: () => void;
};

export function ContractExcelExportDialog({
  open,
  onOpenChange,
  contracts,
  onExported,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setExporting(false);
    setError('');
  }, [open]);

  const sortedContracts = useMemo(
    () =>
      [...contracts].sort((a, b) =>
        a.contractNumber.localeCompare(b.contractNumber, undefined, { sensitivity: 'base' }),
      ),
    [contracts],
  );

  const allSelected =
    sortedContracts.length > 0 && selected.size === sortedContracts.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(sortedContracts.map((contract) => contract._id)));
  };

  const selectedContracts = sortedContracts.filter((contract) =>
    selected.has(contract._id),
  );

  const runExport = async () => {
    if (selectedContracts.length === 0) return;
    setExporting(true);
    setError('');
    try {
      await exportContractsToExcel(selectedContracts);
      onExported?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!exporting) onOpenChange(next);
      }}
    >
      <DialogContent className="!flex max-h-[min(92vh,44rem)] max-w-lg !flex-col gap-0 overflow-hidden !border-[color:var(--billing-border-strong)] !bg-[#ffffff] p-0 !text-[color:var(--billing-text)] sm:rounded-xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-gray-100 px-6 py-4 text-left">
          <DialogTitle>Export contracts to Excel</DialogTitle>
          <DialogDescription>
            Select contracts to export. The file uses the same layout as the import template
            (Contracts, ADS Rules, and Clauses sheets).
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain px-6 py-4 [-webkit-overflow-scrolling:touch]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-600">
              {selected.size} of {sortedContracts.length} selected
            </p>
            <button
              type="button"
              onClick={toggleAll}
              disabled={sortedContracts.length === 0 || exporting}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          {sortedContracts.length === 0 ? (
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-600">
              No contracts available to export.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              <li className="flex items-center gap-3 bg-gray-50 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                  disabled={exporting}
                  aria-label="Select all contracts for export"
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Select all contracts
                </span>
              </li>
              {sortedContracts.map((contract) => (
                <li
                  key={contract._id}
                  className="flex items-start gap-3 px-3 py-2.5 hover:bg-gray-50/80"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(contract._id)}
                    onChange={() => toggleOne(contract._id)}
                    disabled={exporting}
                    aria-label={`Select ${contract.contractNumber} for export`}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {contract.contractNumber}
                    </p>
                    <p className="text-xs text-gray-600">
                      {contract.customerCode} · {contract.category} ·{' '}
                      {formatBillingDateRange(contract.priceValidFrom, contract.priceValidTo)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-gray-100 px-6 py-4 sm:justify-between">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={exporting}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={exporting || selectedContracts.length === 0}
            onClick={() => void runExport()}
            className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--billing-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Exporting…
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Export {selectedContracts.length} contract
                {selectedContracts.length === 1 ? '' : 's'}
              </>
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
