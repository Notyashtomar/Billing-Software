'use client';

import type { AdsMisPreviewSheet } from './misAdsTypes';
import { MisSheetInnerScroll } from './MisSheetInnerScroll';

function cellClass(kind: AdsMisPreviewSheet['rowKinds'][number]): string {
  if (kind === 'airline') return 'font-semibold text-slate-900';
  return 'text-slate-700';
}

/**
 * Excel-style preview for each ADS MIS sheet. Same headers as export; rows are
 * station × airline × month values.
 */
export function MisAdsWorkbookPreview({
  sheets,
  loading,
}: {
  sheets: AdsMisPreviewSheet[] | null;
  loading: boolean;
}) {
  if (loading && !sheets?.length) {
    return (
      <section
        className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6"
        aria-busy="true"
        aria-label="Loading workbook preview"
      >
        <div className="mb-3 h-5 w-48 animate-pulse rounded bg-slate-200" />
        <div className="h-48 animate-pulse rounded-xl bg-slate-100" />
      </section>
    );
  }

  if (!sheets?.length) return null;

  return (
    <div className="space-y-4">
      {sheets.map((sheet) => (
        <section
          key={sheet.id}
          className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6"
          aria-label={`${sheet.label} preview`}
        >
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">{sheet.label}</h2>
            <p className="text-xs tabular-nums text-slate-500">
              {sheet.rows.length} row{sheet.rows.length === 1 ? '' : 's'}
            </p>
          </div>
          {sheet.rows.length === 0 ? (
            <p className="text-sm text-slate-500">No rows for this station, airline set, and month.</p>
          ) : (
            <MisSheetInnerScroll
              label={`${sheet.label} rows, ${sheet.rows.length} total. Six visible at a time.`}
            >
              <table className="min-w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="h-9 bg-slate-50">
                    {sheet.headers.map((header) => (
                      <th
                        key={header}
                        scope="col"
                        className="whitespace-nowrap border-b border-slate-200 px-2 py-0 font-semibold text-slate-600"
                      >
                        {header.trim()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.map((row, rowIndex) => {
                    const kind = sheet.rowKinds[rowIndex] ?? 'normal';
                    return (
                      <tr
                        key={`${sheet.id}-${rowIndex}`}
                        className={`h-7 ${cellClass(kind)}`}
                      >
                        {row.map((cell, colIndex) => (
                          <td
                            key={`${sheet.id}-${rowIndex}-${colIndex}`}
                            className={`whitespace-nowrap border-b border-slate-100 px-2 py-0 tabular-nums ${
                              colIndex === 0 ? 'text-left' : 'text-right'
                            }`}
                          >
                            {cell === '' || cell == null ? '-' : String(cell)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </MisSheetInnerScroll>
          )}
        </section>
      ))}
    </div>
  );
}
