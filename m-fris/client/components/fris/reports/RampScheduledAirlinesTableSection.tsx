'use client';

import React, { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { RampScheduledAirlineRow } from '@/types/fris/reports/rampScheduledAirline';
import { formatRampFlightCellDisplay } from '@/components/fris/reports/rampDisplayFormat';
import { ReportsResponsiveTable } from '@/components/fris/reports/ReportsResponsiveTable';

const DATA_KEYS = [
  'airline',
  'fltNo',
  'reportNo',
  'bayArr',
  'bayDep',
  'arrivalSta',
  'arrivalEta',
  'arrivalAta',
  'holdOpen',
  'holdClose',
  'diffAta1stBag',
  'diff1stBag',
  'diffLastBag',
  'diffLbAta',
  'depStd',
  'depEtd',
  'depAtd',
  'delay1',
  'delay1Mins',
  'delay2',
  'delay2Mins',
  'supvrName',
  'teamAtBay',
  'lastCargoLot',
  'brs',
  'chk',
] as const;

type DataKey = (typeof DATA_KEYS)[number];

const stickyAuthHeader =
  'sticky left-0 z-[50] w-14 min-w-[3.5rem] border-b border-r-2 border-r-amber-400 bg-amber-400 px-1 text-center text-[9px] font-bold uppercase text-white shadow-[6px_0_12px_-2px_rgba(15,23,42,0.18)] sm:px-2 sm:text-xs';
const stickySnoHeader =
  'sticky left-14 z-[49] w-9 min-w-9 border-b border-r-2 border-r-amber-400 bg-amber-400 px-0.5 text-center text-[9px] font-bold uppercase text-white shadow-[4px_0_10px_-2px_rgba(15,23,42,0.12)] sm:px-1 sm:text-xs';

function stickyAuthBody(authorized: boolean, upcoming: boolean): string {
  if (authorized) {
    return 'sticky left-0 z-[40] w-14 min-w-[3.5rem] border-b border-r-2 border-r-emerald-500 bg-emerald-200 shadow-[6px_0_12px_-2px_rgba(15,23,42,0.14)]';
  }
  if (upcoming) {
    return 'sticky left-0 z-[40] w-14 min-w-[3.5rem] border-b border-r-2 border-r-sky-400 bg-sky-100 shadow-[6px_0_12px_-2px_rgba(15,23,42,0.14)]';
  }
  return 'sticky left-0 z-[40] w-14 min-w-[3.5rem] border-b border-r-2 border-r-emerald-300 bg-white shadow-[6px_0_12px_-2px_rgba(15,23,42,0.14)]';
}

function stickySnoBody(authorized: boolean, upcoming: boolean): string {
  if (authorized) {
    return 'sticky left-14 z-[39] w-9 min-w-9 border-b border-r-2 border-r-emerald-400 bg-emerald-200 shadow-[4px_0_10px_-2px_rgba(15,23,42,0.1)]';
  }
  if (upcoming) {
    return 'sticky left-14 z-[39] w-9 min-w-9 border-b border-r-2 border-r-sky-300 bg-sky-100 shadow-[4px_0_10px_-2px_rgba(15,23,42,0.1)]';
  }
  return 'sticky left-14 z-[39] w-9 min-w-9 border-b border-r-2 border-r-emerald-200 bg-emerald-50 shadow-[4px_0_10px_-2px_rgba(15,23,42,0.1)]';
}

const cell =
  'min-w-0 max-w-[11rem] whitespace-pre-line break-words px-1.5 py-1.5 text-center text-xs text-slate-800 sm:text-sm';

const thGroup =
  'bg-amber-400 border-r border-amber-400 px-1.5 py-2 text-left text-[10px] font-bold uppercase leading-tight tracking-wide text-white first:pl-2 sm:px-2 sm:text-xs';
const thGroupCenter =
  'bg-amber-400 border-r border-amber-400 px-1.5 py-2 text-center text-[10px] font-bold uppercase leading-tight text-white sm:text-xs';
const thSub =
  'bg-amber-400 border-r border-amber-400 px-0.5 py-1.5 text-center text-[9px] font-semibold text-white sm:px-1.5 sm:text-xs';

const diffTh = cn(thSub, 'min-w-[5.5rem] text-white');
const diffCell = 'border-amber-200/40 bg-amber-50/10';

type Props = {
  rows: RampScheduledAirlineRow[];
  loading?: boolean;
  loadError?: string | null;
  onRowsChange: (rows: RampScheduledAirlineRow[]) => void;
};

export default function RampScheduledAirlinesTableSection({
  rows,
  loading = false,
  loadError = null,
  onRowsChange,
}: Props) {
  const toggleChecked = useCallback(
    (i: number) => {
      const copy = [...rows];
      const cur = copy[i];
      if (!cur) return;
      copy[i] = { ...cur, checked: !cur.checked };
      onRowsChange(copy);
    },
    [rows, onRowsChange],
  );

  const authorizeChecked = useCallback(() => {
    if (rows.length === 0) {
      toast.warning('No flights listed to authorize yet.');
      return;
    }
    const anyChecked = rows.some((r) => r.checked);
    if (!anyChecked) {
      toast.warning('Check one or more rows under Authorize, then click Authorize All.');
      return;
    }
    const next = rows.map((r) => (r.checked ? { ...r, authorized: true } : r));
    const n = next.filter((r) => r.authorized && r.checked).length;
    onRowsChange(next);
    toast.success(`${n} row(s) marked authorized.`);
  }, [rows, onRowsChange]);

  return (
    <div className="w-full min-w-0">
      <div className="overflow-hidden rounded-2xl border border-emerald-100/90 bg-white shadow-sm shadow-emerald-900/[0.03] ring-1 ring-emerald-900/[0.04]">
        <div className="border-b border-white/10 bg-emerald-500 px-4 py-3.5 shadow-sm">
          <h2 className="text-center text-base font-semibold tracking-tight text-white sm:text-left">
            Scheduled Airlines
          </h2>
        </div>

        <p className="border-b border-emerald-100/80 bg-emerald-50/50 px-4 py-2 text-xs text-slate-600 sm:text-sm">
          Flight data is <strong className="font-medium text-slate-800">read-only</strong> from{' '}
          <strong className="font-medium text-emerald-500">fhr_collection</strong> (main, ramp, terminal embeds).
          Upcoming arrivals (no ATA yet) use STA in the shift band. Check rows, then Authorize All to include them on
          the saved report.
        </p>

        {loadError && (
          <p className="border-b border-red-100 bg-red-50/80 px-4 py-2 text-sm text-red-800">{loadError}</p>
        )}

        <ReportsResponsiveTable scrollClassName="relative isolate border-t border-emerald-100/70 bg-white">
          <table className="w-full min-w-[130rem] border-separate border-spacing-0 bg-white text-sm">
            <caption className="sr-only">Scheduled airline movements and times</caption>
            <thead>
              <tr>
                <th rowSpan={2} className={stickyAuthHeader}>
                  Authorize
                </th>
                <th rowSpan={2} className={stickySnoHeader}>
                  Sno
                </th>
                <th rowSpan={2} className={cn(thGroup, 'min-w-[3.25rem]')}>
                  Airline
                </th>
                <th rowSpan={2} className={cn(thGroup, 'min-w-[4.5rem]')}>
                  Flt no
                </th>
                <th rowSpan={2} className={cn(thGroup, 'min-w-[4rem]')}>
                  Report no
                </th>
                <th colSpan={2} className={thGroupCenter}>
                  Bay
                </th>
                <th colSpan={3} className={thGroupCenter}>
                  Arrivals
                </th>
                <th rowSpan={2} className={cn(thGroup, 'min-w-[5.5rem]')}>
                  Hold open
                </th>
                <th rowSpan={2} className={cn(thGroup, 'min-w-[5.5rem]')}>
                  Hold close
                </th>
                <th rowSpan={2} className={cn(diffTh, 'min-w-[5.5rem]')}>
                  Diff ATA-1st BAG
                </th>
                <th rowSpan={2} className={cn(diffTh, 'min-w-[4.5rem]')}>
                  Diff 1st BAG
                </th>
                <th rowSpan={2} className={cn(diffTh, 'min-w-[4.5rem]')}>
                  Diff last BAG
                </th>
                <th rowSpan={2} className={cn(diffTh, 'min-w-[4.5rem]')}>
                  Diff LB-ATA
                </th>
                <th colSpan={3} className={thGroupCenter}>
                  Departure
                </th>
                <th colSpan={4} className={thGroupCenter}>
                  Delay
                </th>
                <th rowSpan={2} className={cn(thGroup, 'min-w-[4.5rem]')}>
                  Supvr name
                </th>
                <th rowSpan={2} className={cn(thGroup, 'min-w-[4.5rem]')}>
                  Team at bay
                </th>
                <th rowSpan={2} className={cn(thGroup, 'min-w-[4.5rem]')}>
                  Last cargo lot on bay
                </th>
                <th colSpan={2} className={thGroupCenter}>
                  Baggage count
                </th>
              </tr>
              <tr>
                <th className={thSub}>Arr</th>
                <th className={thSub}>Dep</th>
                <th className={thSub}>STA</th>
                <th className={thSub}>ETA</th>
                <th className={thSub}>ATA</th>
                <th className={thSub}>STD</th>
                <th className={thSub}>ETD</th>
                <th className={thSub}>ATD</th>
                <th className={thSub}>Delay-1</th>
                <th className={thSub}>Mins</th>
                <th className={thSub}>Delay-2</th>
                <th className={thSub}>Mins</th>
                <th className={thSub}>BRS</th>
                <th className={thSub}>CHK</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={28} className="px-4 py-8 text-center text-slate-500">
                    Loading scheduled flights…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={28} className="px-4 py-8 text-center text-slate-500">
                    No scheduled arrivals for this date and shift band.
                  </td>
                </tr>
              ) : (
                rows.map((row, r) => (
                  <tr
                    key={row.id}
                    className={cn(
                      'transition-colors',
                      row.authorized
                        ? 'bg-emerald-200/70 hover:bg-emerald-200/80'
                        : row.isUpcoming
                          ? 'bg-sky-50/60 hover:bg-sky-50/80'
                          : 'bg-white hover:bg-emerald-50/35',
                    )}
                  >
                    <td className={cn(stickyAuthBody(row.authorized, !!row.isUpcoming), 'p-0.5 align-middle')}>
                      <div className="flex min-h-[2.75rem] flex-col items-center justify-center gap-0.5 px-0.5 sm:px-1">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
                          checked={row.checked}
                          onChange={() => toggleChecked(r)}
                          aria-label={`Select row ${r + 1} for authorize`}
                        />
                      </div>
                    </td>
                    <td
                      className={cn(
                        stickySnoBody(row.authorized, !!row.isUpcoming),
                        'py-1.5 text-center text-xs font-medium text-emerald-950',
                      )}
                    >
                      {r + 1}
                      {row.isUpcoming && (
                        <span className="mt-0.5 block text-[9px] font-semibold uppercase text-sky-700">
                          Due
                        </span>
                      )}
                    </td>
                    {DATA_KEYS.map((key) => {
                      const isDiff = key.startsWith('diff');
                      const display = formatRampFlightCellDisplay(key, String(row[key as DataKey] ?? ''));
                      return (
                        <td
                          key={key}
                          className={cn(
                            'border-b border-emerald-100/50 p-0.5',
                            isDiff ? diffCell : row.authorized ? 'bg-emerald-100/50' : 'bg-white',
                          )}
                        >
                          <div
                            className={cn(cell, isDiff && 'text-amber-900/90')}
                            title={display}
                          >
                            {display}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ReportsResponsiveTable>

        <div className="border-t border-emerald-100/80 bg-emerald-50/50 p-3 sm:px-4 sm:py-3.5">
          <button
            type="button"
            onClick={authorizeChecked}
            className="w-full rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 focus-visible:outline focus-visible:ring-2 focus-visible:ring-red-500 sm:w-auto"
          >
            Authorize All
          </button>
        </div>
      </div>
    </div>
  );
}
