'use client';

import React from 'react';
import InvoicingScheduledFlightDataTable from '@/components/fris/advance/invoicing/InvoicingScheduledFlightDataTable';
import {
  dataModeLabel,
  validateInvoicingFilter,
  type InvoicingFilterState,
} from '@/components/fris/advance/invoicing/invoicing-filter.types';
import type { ScheduledFlightDataRow } from '@/components/fris/advance/invoicing/scheduled-flight-data-columns';

type Props = {
  sectionId: string;
  sectionLabel: string;
  filter: InvoicingFilterState;
  hasSearched: boolean;
  searching?: boolean;
  rows: ScheduledFlightDataRow[];
  onToggleRow: (serialNumber: string, selected: boolean) => void;
  onToggleAll: (selected: boolean) => void;
};

function hasDateRangeSelected(filter: InvoicingFilterState): boolean {
  return Boolean(filter.fromDate.trim() && filter.toDate.trim());
}

function shouldShowScheduledFlightTable(
  sectionId: string,
  filter: InvoicingFilterState,
): boolean {
  if (sectionId !== 'scheduled-flight-data') return false;
  if (!hasDateRangeSelected(filter)) return false;
  if (validateInvoicingFilter(filter)) return false;
  return filter.dataMode === 'flight-report';
}

export default function InvoicingResultsPanel({
  sectionId,
  filter,
  hasSearched,
  searching = false,
  rows,
  onToggleRow,
  onToggleAll,
}: Props) {
  const showScheduledTable = shouldShowScheduledFlightTable(sectionId, filter);
  const dateValidationError = hasDateRangeSelected(filter)
    ? validateInvoicingFilter(filter)
    : null;

  if (showScheduledTable && (hasSearched || searching)) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <InvoicingScheduledFlightDataTable
          filter={filter}
          rows={rows}
          loading={searching}
          onToggleRow={onToggleRow}
          onToggleAll={onToggleAll}
        />
      </div>
    );
  }

  const modeLabel = dataModeLabel(filter.dataMode);

  return (
    <section className="flex min-h-[16rem] flex-1 flex-col rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-1 items-center justify-center p-8">
        {dateValidationError ? (
          <p className="max-w-md text-center text-sm text-red-600">{dateValidationError}</p>
        ) : (
          <p className="max-w-md text-center text-sm text-gray-500">
            Select <span className="font-medium">Flight Report Data</span>, then choose{' '}
            <span className="font-medium">From</span> and <span className="font-medium">To</span>{' '}
            dates and click <span className="font-medium">Find Invoice</span> to load the{' '}
            <span className="font-medium">{modeLabel}</span> table.
          </p>
        )}
      </div>
    </section>
  );
}
