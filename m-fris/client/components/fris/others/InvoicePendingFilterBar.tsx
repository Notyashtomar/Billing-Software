'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Download, Search } from 'lucide-react';
import { DatePicker } from '@/components/ui/DatePicker';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import {
  INVOICE_PENDING_FLIGHT_TYPE_OPTIONS,
  type InvoicePendingFlightTypeFilter,
} from '@/components/fris/others/invoice-pending-columns';
import { cn } from '@/lib/utils';

const LABEL_CLASS = 'mb-1.5 block text-sm font-medium text-emerald-950/85';
const DROPDOWN_CLASS =
  'box-border h-11 w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 transition-colors hover:border-emerald-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';

export type InvoicePendingFilterState = {
  fromDate: string;
  toDate: string;
  flightType: InvoicePendingFlightTypeFilter;
};

type Props = {
  filter: InvoicePendingFilterState;
  onChange: (next: InvoicePendingFilterState) => void;
  onSearch: () => void;
  onExportExcel: () => void;
  searching?: boolean;
  rowCount?: number;
  canExport?: boolean;
  fromDateMax?: Date;
  toDateMax?: Date;
};

export default function InvoicePendingFilterBar({
  filter,
  onChange,
  onSearch,
  onExportExcel,
  searching = false,
  rowCount = 0,
  canExport = false,
  fromDateMax,
  toDateMax,
}: Props) {
  const patch = (partial: Partial<InvoicePendingFilterState>) =>
    onChange({ ...filter, ...partial });

  return (
    <section className="overflow-visible rounded-2xl border border-emerald-100/90 bg-white shadow-sm shadow-emerald-900/[0.04] ring-1 ring-emerald-900/[0.03]">
      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:gap-5">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            <div className="min-w-0">
              <label className={LABEL_CLASS} htmlFor="invoice-pending-from">
                From Date
              </label>
              <div className="rounded-xl border border-emerald-100/80 bg-emerald-50/25 p-0.5">
                <DatePicker
                  id="invoice-pending-from"
                  value={filter.fromDate}
                  onChange={(fromDate) => patch({ fromDate: fromDate ?? '' })}
                  valueFormat="yyyy-MM-dd"
                  placeholder="From"
                  maxDate={fromDateMax}
                  className="h-10 w-full text-sm"
                />
              </div>
            </div>

            <div className="min-w-0">
              <label className={LABEL_CLASS} htmlFor="invoice-pending-to">
                To Date
              </label>
              <div className="rounded-xl border border-emerald-100/80 bg-emerald-50/25 p-0.5">
                <DatePicker
                  id="invoice-pending-to"
                  value={filter.toDate}
                  onChange={(toDate) => patch({ toDate: toDate ?? '' })}
                  valueFormat="yyyy-MM-dd"
                  placeholder="To"
                  maxDate={toDateMax}
                  className="h-10 w-full text-sm"
                />
              </div>
            </div>

            <div className="relative z-10 min-w-0">
              <label className={LABEL_CLASS} htmlFor="invoice-pending-flight-type">
                Flight Type
              </label>
              <AdminRadioDropdown
                id="invoice-pending-flight-type"
                value={filter.flightType}
                onChange={(v) =>
                  patch({ flightType: v as InvoicePendingFlightTypeFilter })
                }
                options={INVOICE_PENDING_FLIGHT_TYPE_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
                className={DROPDOWN_CLASS}
              />
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:pl-1">
            <motion.button
              type="button"
              onClick={onSearch}
              disabled={searching}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-white shadow-md shadow-emerald-500/25 transition-colors hover:bg-emerald-600 disabled:cursor-wait disabled:opacity-70',
              )}
            >
              <Search className="h-4 w-4 shrink-0" />
              {searching ? 'Searching…' : 'Search'}
            </motion.button>

            <motion.button
              type="button"
              onClick={onExportExcel}
              disabled={!canExport}
              whileHover={{ scale: canExport ? 1.02 : 1 }}
              whileTap={{ scale: canExport ? 0.98 : 1 }}
              className={cn(
                'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-emerald-200 bg-white px-5 text-sm font-semibold text-emerald-800 shadow-sm transition-colors hover:border-emerald-400 hover:bg-emerald-50',
                !canExport && 'cursor-not-allowed opacity-50',
              )}
            >
              <Download className="h-4 w-4 shrink-0" />
              Export in Excel
            </motion.button>
          </div>
        </div>

        {rowCount > 0 && (
          <p className="mt-3 text-xs text-gray-500 sm:text-sm">
            <span className="font-semibold text-emerald-700">{rowCount}</span> flight
            {rowCount === 1 ? '' : 's'} loaded
          </p>
        )}
      </div>
    </section>
  );
}
