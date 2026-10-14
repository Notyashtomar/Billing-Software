'use client';

import React from 'react';
import InvoicingExportFooter from '@/components/fris/advance/invoicing/InvoicingExportFooter';
import InvoicingFilterBar from '@/components/fris/advance/invoicing/InvoicingFilterBar';
import InvoicingResultsPanel from '@/components/fris/advance/invoicing/InvoicingResultsPanel';
import type { InvoicingFilterState } from '@/components/fris/advance/invoicing/invoicing-filter.types';
import type { ScheduledFlightDataRow } from '@/components/fris/advance/invoicing/scheduled-flight-data-columns';

type Props = {
  sectionId: string;
  sectionLabel: string;
  filter: InvoicingFilterState;
  onFilterChange: (next: InvoicingFilterState) => void;
  onFindInvoice: () => void;
  onExportExcel: () => void;
  searching: boolean;
  hasSearched: boolean;
  rows: ScheduledFlightDataRow[];
  exportChoice: 'yes' | 'no';
  onExportChoiceChange: (value: 'yes' | 'no') => void;
  onToggleRow: (serialNumber: string, selected: boolean) => void;
  onToggleAll: (selected: boolean) => void;
  onExportNav: () => void;
  exportingNav: boolean;
};

export default function InvoicingSectionPage({
  sectionId,
  sectionLabel,
  filter,
  onFilterChange,
  onFindInvoice,
  onExportExcel,
  searching,
  hasSearched,
  rows,
  exportChoice,
  onExportChoiceChange,
  onToggleRow,
  onToggleAll,
  onExportNav,
  exportingNav,
}: Props) {
  const showExportConfirm =
    sectionId === 'scheduled-flight-data' && filter.dataMode === 'flight-report';
  const selectedCount = rows.filter((row) => row.selectData).length;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 flex-col gap-3">
        <InvoicingFilterBar
          filter={filter}
          onChange={onFilterChange}
          onFindInvoice={onFindInvoice}
          onExportExcel={onExportExcel}
          searching={searching}
          radioName={`invoicing-data-mode-${sectionId}`}
        />
        {showExportConfirm ? (
          <InvoicingExportFooter
            variant="inline-row"
            selectedCount={selectedCount}
            exportChoice={exportChoice}
            onExportChoiceChange={onExportChoiceChange}
            onExport={onExportNav}
            exporting={exportingNav}
          />
        ) : null}
      </div>
      <InvoicingResultsPanel
        sectionId={sectionId}
        sectionLabel={sectionLabel}
        filter={filter}
        hasSearched={hasSearched}
        searching={searching}
        rows={rows}
        onToggleRow={onToggleRow}
        onToggleAll={onToggleAll}
      />
    </div>
  );
}
