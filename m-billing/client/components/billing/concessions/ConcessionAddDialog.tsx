'use client';

import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { BillingContract } from '@/lib/billing-shared/types';
import { formatBillingDateRange } from '@/lib/billing-shared/billing-date-format';
import { billingUi } from '../billingUi';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contracts: BillingContract[];
  onPick: (contract: BillingContract) => void;
};

export function ConcessionAddDialog({ open, onOpenChange, contracts, onPick }: Props) {
  const [query, setQuery] = useState('');

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = contracts.filter((row) => {
      if (!q) return true;
      return (
        row.customerCode.toLowerCase().includes(q) ||
        row.contractNumber.toLowerCase().includes(q) ||
        row.stationCode.toLowerCase().includes(q)
      );
    });
    return list.sort((a, b) => {
      const statusOrder = (s: string) => (s === 'active' ? 0 : s === 'draft' ? 1 : 2);
      const byStatus = statusOrder(a.status) - statusOrder(b.status);
      if (byStatus !== 0) return byStatus;
      return `${a.stationCode} ${a.customerCode}`.localeCompare(`${b.stationCode} ${b.customerCode}`);
    });
  }, [contracts, query]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery('');
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add concession</DialogTitle>
          <DialogDescription>
            Choose a contract to configure scenario percents or an Exclusive BHS ceiling rate.
          </DialogDescription>
        </DialogHeader>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Search
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Customer, contract #, station…"
            className={billingUi.input}
            autoFocus
          />
        </label>

        <ul
          className="mt-2 max-h-[min(20rem,50vh)] overflow-y-auto overscroll-y-contain rounded-lg border border-gray-200 divide-y divide-gray-100"
          role="listbox"
          aria-label="Contracts"
        >
          {options.length === 0 ? (
            <li className="px-3 py-4 text-sm text-gray-500">No contracts match your search.</li>
          ) : (
            options.map((row) => (
              <li key={row._id}>
                <button
                  type="button"
                  role="option"
                  className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm hover:bg-[color:var(--billing-primary-soft)] focus-visible:bg-[color:var(--billing-primary-soft)] focus-visible:outline-none"
                  onClick={() => {
                    onPick(row);
                    setQuery('');
                    onOpenChange(false);
                  }}
                >
                  <span className="font-medium text-[color:var(--billing-heading)]">
                    {row.stationCode} · {row.customerCode} · {row.contractNumber}
                  </span>
                  <span className="text-xs text-gray-600">
                    {formatBillingDateRange(row.priceValidFrom, row.priceValidTo)} ·{' '}
                    <span className="capitalize">{row.status}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
