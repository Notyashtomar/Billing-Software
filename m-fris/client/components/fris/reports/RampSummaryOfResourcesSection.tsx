'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  RAMP_RESOURCE_COL_GROUPS,
  RAMP_RESOURCE_DESCRIPTION_ROWS,
  RAMP_RESOURCE_TABLE_COL_COUNT,
  rampResourceGroupRowSpanOnly,
} from '@/components/fris/reports/rampShiftReportLayout';
import { ReportsResponsiveTable } from '@/components/fris/reports/ReportsResponsiveTable';

const DESCRIPTION_ROWS = RAMP_RESOURCE_DESCRIPTION_ROWS;
const COL_GROUPS = RAMP_RESOURCE_COL_GROUPS;

const colCount = COL_GROUPS.reduce((n, g) => n + g.subHeaders.length, 0);

/** Tints: sub-header row (th) and body (td) per logical group. */
const GROUP_TINT: {
  thSub: string;
  td: string;
}[] = [
  { thSub: 'bg-slate-200/95', td: 'bg-slate-50/90' },
  { thSub: 'bg-emerald-200/70', td: 'bg-emerald-50/50' },
  { thSub: 'bg-sky-200/70', td: 'bg-sky-50/50' },
  { thSub: 'bg-violet-200/55', td: 'bg-violet-50/40' },
  { thSub: 'bg-amber-200/50', td: 'bg-amber-50/35' },
  { thSub: 'bg-rose-200/50', td: 'bg-rose-50/35' },
];

type ColMeta = {
  groupIndex: number;
  subLabel: string;
  isTtl: boolean;
  isFirstInGroup: boolean;
};

const COLUMN_META: ColMeta[] = (() => {
  const out: ColMeta[] = [];
  COL_GROUPS.forEach((g, gIdx) => {
    g.subHeaders.forEach((sub, sIdx) => {
      out.push({
        groupIndex: gIdx,
        subLabel: sub,
        isTtl: sub.trim().toUpperCase() === 'TTL',
        isFirstInGroup: sIdx === 0,
      });
    });
  });
  return out;
})();

const mainHeader = 'bg-emerald-500 border-r border-emerald-400 text-white shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.08)]';
const descSticky = 'bg-emerald-500 text-white';
const groupSep = 'border-l-2 border-l-emerald-400/50';

const cellInputClass =
  'box-border w-full min-w-0 min-h-[2.5rem] max-w-full rounded-md border px-1.5 py-2 text-center text-sm text-slate-800 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200/50';

const ttlThClass = 'bg-amber-200/95 border-r border-emerald-400 text-amber-950 border-amber-300/80 ring-1 ring-amber-400/40';
const ttlTdClass = 'bg-amber-50/90 ring-1 ring-amber-200/60';
const ttlInputClass =
  'border-amber-300/70 bg-amber-50/40 font-medium text-amber-950 focus:border-amber-500 focus:ring-amber-200/50';

function sanitizeIntegerCell(v: string): string {
  const t = v.replace(/[^\d-]/g, '');
  if (t === '' || t === '-') return t;
  const m = /^-?\d+$/.exec(t);
  return m ? m[0] : t.slice(0, -1);
}

type Props = {
  values?: string[][];
  onValuesChange?: (values: string[][]) => void;
};

export default function RampSummaryOfResourcesSection({ values: controlled, onValuesChange }: Props) {
  const [internal, setInternal] = useState(() =>
    Array.from({ length: DESCRIPTION_ROWS.length }, () => Array<string>(colCount).fill('')),
  );
  const values = controlled ?? internal;

  const setCell = useCallback(
    (row: number, col: number, v: string) => {
      const next = values.map((r) => [...r]);
      if (!next[row]) return;
      next[row] = [...next[row]!];
      next[row]![col] = sanitizeIntegerCell(v);
      if (onValuesChange) onValuesChange(next);
      else setInternal(next);
    },
    [values, onValuesChange],
  );

  const groupStartCols = useMemo(() => {
    let c = 0;
    const starts: { title: string; colSpan: number; start: number }[] = [];
    for (const g of COL_GROUPS) {
      starts.push({ title: g.title, colSpan: g.subHeaders.length, start: c });
      c += g.subHeaders.length;
    }
    return starts;
  }, []);

  return (
    <div className="w-full min-w-0">
      <div className="overflow-hidden rounded-2xl border border-emerald-100/90 bg-white shadow-sm shadow-emerald-900/[0.03] ring-1 ring-emerald-900/[0.04]">
        <div>
          <p className="border-b border-emerald-100/80 bg-emerald-50/50 px-4 py-2.5 text-xs leading-relaxed text-slate-600 sm:text-sm">
            Integer values only. Column groups are color-banded by role.{' '}
            <span className="font-medium text-amber-800">TTL</span> columns are highlighted for totals. This
            section is saved with the <span className="font-medium text-emerald-500">Save report</span> button at
            the top of the form.
          </p>
        </div>
        <ReportsResponsiveTable scrollClassName="relative isolate border-t border-emerald-100/70 bg-white">
          <table className="w-full min-w-[85rem] border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Resource counts by description row and role column</caption>
            <thead>
              <tr>
                <th
                  colSpan={RAMP_RESOURCE_TABLE_COL_COUNT}
                  className="border-b border-emerald-500 bg-emerald-500 px-2 py-2 text-center text-sm font-bold text-white"
                >
                  Summary of Resources
                </th>
              </tr>
              <tr className="shadow-sm">
                <th
                  rowSpan={2}
                  scope="col"
                  className={cn(
                    'sticky left-0 z-30 w-[6.25rem] min-w-[6.25rem] border-b border-r-2 border-emerald-500 px-2 py-2.5 text-left text-xs font-bold align-middle sm:w-32 sm:min-w-[8rem] sm:text-sm',
                    descSticky,
                    'shadow-[6px_0_12px_-2px_rgba(15,23,42,0.16)]',
                  )}
                >
                  Description
                </th>
                {groupStartCols.map((g, gi) => {
                  const group = COL_GROUPS[gi]!;
                  const rowSpan = rampResourceGroupRowSpanOnly(group) ? 2 : undefined;
                  return (
                    <th
                      key={g.title}
                      colSpan={g.colSpan}
                      rowSpan={rowSpan}
                      className={cn(
                        'border-b border-slate-300/80 px-1.5 py-2.5 text-center text-[11px] font-bold uppercase leading-tight tracking-wide sm:text-xs',
                        mainHeader,
                        gi > 0 && groupSep,
                      )}
                    >
                      {g.title}
                    </th>
                  );
                })}
              </tr>
              <tr>
                {COL_GROUPS.flatMap((group, gi) =>
                  rampResourceGroupRowSpanOnly(group)
                    ? []
                    : group.subHeaders.map((sub, si) => {
                        const g = GROUP_TINT[gi]!;
                        const showSep = si === 0 && gi > 0;
                        return (
                          <th
                            key={`${group.title}-${si}`}
                            scope="col"
                            className={cn(
                              'min-w-[3.75rem] max-w-[6rem] border-b border-r border-emerald-400 px-1.5 py-2 text-center text-[10px] font-semibold leading-tight sm:min-w-[4rem] sm:max-w-[7rem] sm:text-xs',
                              sub.trim().toUpperCase() === 'TTL' ? ttlThClass : g.thSub,
                              showSep && !sub.trim().toUpperCase().includes('TTL') && groupSep,
                              showSep && sub.trim().toUpperCase() === 'TTL' && groupSep,
                            )}
                          >
                            {sub || '\u00a0'}
                          </th>
                        );
                      }),
                )}
              </tr>
            </thead>
            <tbody>
              {DESCRIPTION_ROWS.map((rowLabel, r) => (
                <tr key={rowLabel} className="transition-colors hover:brightness-[0.99]">
                  <th
                    scope="row"
                    className="sticky left-0 z-20 w-[6.25rem] min-w-[6.25rem] border-b border-r-2 border-emerald-200 bg-emerald-50 px-2 py-2 text-left text-xs font-semibold text-emerald-950 shadow-[6px_0_10px_-2px_rgba(15,23,42,0.12)] sm:w-32 sm:min-w-[8rem] sm:text-sm"
                  >
                    {rowLabel}
                  </th>
                  {COLUMN_META.map((m, c) => {
                    const g = GROUP_TINT[m.groupIndex]!;
                    return (
                      <td
                        key={c}
                        className={cn(
                          'border-b border-slate-200/80 p-0.5 align-middle',
                          m.isTtl ? ttlTdClass : g.td,
                          m.isFirstInGroup && c > 0 && groupSep,
                        )}
                      >
                        <input
                          type="text"
                          inputMode="numeric"
                          value={values[r]?.[c] ?? ''}
                          onChange={(e) => setCell(r, c, e.target.value)}
                          className={cn(
                            cellInputClass,
                            m.isTtl ? ttlInputClass : 'border-slate-200/80 bg-white/90',
                          )}
                          aria-label={`${rowLabel}, ${COL_GROUPS[m.groupIndex]?.title ?? 'column'}, ${m.subLabel || 'value'}`}
                          autoComplete="off"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </ReportsResponsiveTable>
        <div className="border-t border-emerald-100/80 bg-emerald-50/50 p-3 sm:px-4 sm:py-3.5">
          <p className="text-[11px] text-slate-500 sm:text-xs">
            Totals (TTL) use an amber style. Use Save report above to persist this grid to the database.
          </p>
        </div>
      </div>
    </div>
  );
}
