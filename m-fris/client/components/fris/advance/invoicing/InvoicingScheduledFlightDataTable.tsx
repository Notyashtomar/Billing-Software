'use client';

import React from 'react';
import {
  SCHEDULED_FLIGHT_DATA_COLUMNS,
  type ScheduledFlightDataRow,
} from '@/components/fris/advance/invoicing/scheduled-flight-data-columns';
import {
  dataModeLabel,
  dateBasisLabel,
  type InvoicingFilterState,
} from '@/components/fris/advance/invoicing/invoicing-filter.types';

const HIDDEN_SCROLLBAR_CLASS =
  '[scrollbar-width:thin] [scrollbar-color:rgb(16_185_129)_transparent] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-emerald-400/70';

type Props = {
  filter: InvoicingFilterState;
  rows?: ScheduledFlightDataRow[];
  loading?: boolean;
  onToggleRow?: (serialNumber: string, selected: boolean) => void;
  onToggleAll?: (selected: boolean) => void;
};

export default function InvoicingScheduledFlightDataTable({
  filter,
  rows = [],
  loading = false,
  onToggleRow,
  onToggleAll,
}: Props) {
  const allSelected =
    rows.length > 0 && rows.every((row) => Boolean(row.selectData));

  return (
    <section className="flex min-h-[12rem] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-emerald-50/60 px-4 py-2.5">
        <p className="text-sm text-gray-700">
          <span className="font-semibold text-emerald-800">{dataModeLabel(filter.dataMode)}</span>
          <span className="text-gray-500">
            {' '}
            · {dateBasisLabel(filter.dateBasis)} · {filter.fromDate} → {filter.toDate}
          </span>
        </p>
        <p className="text-xs text-gray-500">
          {loading ? 'Loading…' : `${rows.length} row(s)`}
        </p>
      </div>

      <div
        className={`min-h-0 flex-1 overflow-auto overscroll-y-auto [-webkit-overflow-scrolling:touch] ${HIDDEN_SCROLLBAR_CLASS}`}
      >
        <table className="w-max min-w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-emerald-600 text-white">
              {SCHEDULED_FLIGHT_DATA_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="border-r border-emerald-500/40 px-3 py-2.5 text-xs font-semibold whitespace-nowrap last:border-r-0"
                  style={{ minWidth: col.minWidth }}
                >
                  {col.key === 'selectData' ? (
                    <span className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        disabled={loading || rows.length === 0}
                        onChange={(e) => onToggleAll?.(e.target.checked)}
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        aria-label="Select all rows"
                      />
                      {col.label}
                    </span>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={SCHEDULED_FLIGHT_DATA_COLUMNS.length}
                  className="px-4 py-12 text-center text-gray-500"
                >
                  Loading scheduled flight data…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={SCHEDULED_FLIGHT_DATA_COLUMNS.length}
                  className="px-4 py-12 text-center text-gray-500"
                >
                  No records for this date range.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const serial = String(row.serialNumber ?? '');
                return (
                  <tr
                    key={serial || `row-${row.flightNoEquipmentNo}`}
                    className="border-b border-gray-100 hover:bg-emerald-50/40 even:bg-gray-50/40"
                  >
                    {SCHEDULED_FLIGHT_DATA_COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className="whitespace-nowrap px-3 py-2.5 text-gray-800"
                        style={{ minWidth: col.minWidth }}
                      >
                        {col.key === 'selectData' ? (
                          <input
                            type="checkbox"
                            checked={Boolean(row.selectData)}
                            onChange={(e) =>
                              onToggleRow?.(serial, e.target.checked)
                            }
                            disabled={!serial}
                            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                            aria-label={`Select flight ${serial}`}
                          />
                        ) : (
                          String(row[col.key] ?? '')
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
