'use client';

import React from 'react';

type Props = {
  selectedCount: number;
  exportChoice: 'yes' | 'no';
  onExportChoiceChange: (value: 'yes' | 'no') => void;
  onExport: () => void;
  exporting?: boolean;
  /** `inline-row` — one row below the filter bar; `stacked` — vertical block. */
  variant?: 'stacked' | 'inline-row';
};

export default function InvoicingExportFooter({
  selectedCount,
  exportChoice,
  onExportChoiceChange,
  onExport,
  exporting = false,
  variant = 'stacked',
}: Props) {
  if (selectedCount <= 0) return null;

  const radioGroup = (
    <>
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
        <input
          type="radio"
          name="invoicing-export-choice"
          value="yes"
          checked={exportChoice === 'yes'}
          onChange={() => onExportChoiceChange('yes')}
          className="border-gray-300 text-emerald-600 focus:outline-none focus:ring-emerald-500"
        />
        Yes
      </label>
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
        <input
          type="radio"
          name="invoicing-export-choice"
          value="no"
          checked={exportChoice === 'no'}
          onChange={() => onExportChoiceChange('no')}
          className="border-gray-300 text-emerald-600 focus:outline-none focus:ring-emerald-500"
        />
        No
      </label>
    </>
  );

  const exportButton =
    exportChoice === 'yes' ? (
      <button
        type="button"
        onClick={onExport}
        disabled={exporting}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {exporting ? 'Exporting…' : 'Export'}
      </button>
    ) : null;

  if (variant === 'inline-row') {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <p className="text-sm font-medium text-gray-800">Do you want to export this data?</p>
          <div className="flex flex-wrap items-center gap-4">{radioGroup}</div>
          {exportButton ? <div className="shrink-0">{exportButton}</div> : null}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-gray-800">Do you want to export this data?</p>
      <div className="mt-3 flex flex-wrap items-center gap-6">{radioGroup}</div>
      {exportButton ? <div className="mt-4">{exportButton}</div> : null}
    </section>
  );
}
