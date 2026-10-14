'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { RichTextEditor } from '@/components/ui/RichTextEditor';
import type { NonScheduledAirlineTableRow } from '@/components/fris/reports/rampNonScheduledMappers';
import { formatRampFlightCellDisplay } from '@/components/fris/reports/rampDisplayFormat';
import { ReportsResponsiveTable } from '@/components/fris/reports/ReportsResponsiveTable';

const DATA_KEYS: (keyof NonScheduledAirlineTableRow)[] = [
  'airline',
  'fltNo',
  'reportNo',
  'bayArr',
  'bayDep',
  'arrivalSta',
  'arrivalEtaAta',
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

const thGroup =
  'bg-amber-400 border-r border-amber-400 px-1.5 py-2 text-left text-[10px] font-bold uppercase leading-tight tracking-wide text-white first:pl-2 sm:px-2 sm:text-xs';
const thGroupCenter =
  'bg-amber-400 border-r border-amber-400 px-1.5 py-2 text-center text-[10px] font-bold uppercase leading-tight text-white sm:text-xs';
const thSub = 'bg-amber-400 border-r border-amber-400 px-0.5 py-1.5 text-center text-[9px] font-semibold text-white sm:px-1.5 sm:text-xs';
const diffTh = cn(thSub, 'min-w-[5.5rem] text-white');
const diffCell = 'border-amber-200/40 bg-amber-50/10';

const cell =
  'min-w-0 max-w-[11rem] whitespace-pre-line break-words px-1.5 py-1.5 text-left text-xs text-slate-800 sm:text-sm';

type Props = {
  rows: NonScheduledAirlineTableRow[];
  loading: boolean;
  loadError?: string | null;
  operationalNotes: string;
  irregularitiesNotes: string;
  onOperationalNotesChange: (v: string) => void;
  onIrregularitiesNotesChange: (v: string) => void;
  onSave: () => void;
  saving?: boolean;
};

export function RampNonScheduledAirlinesAndNotesSection({
  rows,
  loading,
  loadError = null,
  operationalNotes,
  irregularitiesNotes,
  onOperationalNotesChange,
  onIrregularitiesNotesChange,
  onSave,
  saving = false,
}: Props) {
  return (
    <div className="w-full min-w-0 space-y-5">
      <div className="overflow-hidden rounded-2xl border border-emerald-100/90 bg-white shadow-sm shadow-emerald-900/[0.03] ring-1 ring-emerald-900/[0.04]">
        <div className="border-b border-white/10 bg-emerald-500 px-4 py-3.5 shadow-sm">
          <h2 className="text-center text-base font-semibold tracking-tight text-white sm:text-left">
            Non-Scheduled Airlines
          </h2>
        </div>
        <p className="border-b border-emerald-100/80 bg-emerald-50/50 px-4 py-2.5 text-xs text-slate-600 sm:text-sm">
          This grid is <strong className="font-medium text-slate-800">read-only</strong> and is filled from the
          non-scheduled movement register for the report date. Column headers match the full ramp form; more fields
          will populate as operational data is linked. Scroll horizontally to view all columns. There is no
          <strong> Add row</strong> on this table.
        </p>
        <ReportsResponsiveTable scrollClassName="border-t border-emerald-100/70 bg-emerald-50/30">
          <table className="w-full min-w-[130rem] border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Non-scheduled airline movements for the report date and shift</caption>
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 z-30 w-14 min-w-[3.5rem] border-b border-amber-400/40 border-r-2 border-r-amber-400/60 bg-amber-400 px-1 text-center text-[9px] font-bold uppercase text-white sm:px-2 sm:text-xs"
                >
                  Authorize
                </th>
                <th
                  rowSpan={2}
                  className="sticky left-14 z-20 w-9 min-w-9 border-b border-amber-400/35 border-r-2 border-r-amber-400/45 bg-amber-400 px-0.5 text-center text-[9px] font-bold uppercase text-white sm:px-1 sm:text-xs"
                >
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
                <th colSpan={2} className={thGroupCenter}>
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
                <th className={thSub}>ETA/ATA</th>
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
              {loadError && !loading ? (
                <tr>
                  <td
                    colSpan={27}
                    className="border-b border-amber-200/60 bg-amber-50/30 px-4 py-6 text-center text-sm text-amber-900"
                  >
                    {loadError}
                  </td>
                </tr>
              ) : loading ? (
                <tr>
                  <td
                    colSpan={27}
                    className="border-b border-slate-200/60 bg-white px-4 py-10 text-center text-sm text-slate-500"
                  >
                    Loading non-scheduled movements for this date…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={27}
                    className="border-b border-slate-200/60 bg-white px-4 py-10 text-center text-sm text-slate-500"
                  >
                    No non-scheduled flights in this <strong className="text-slate-700">shift</strong> window for the
                    selected date. Widen the date range in the data source, or add movements in the non-scheduled
                    register.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="bg-white hover:bg-emerald-50/20">
                    <td className="sticky left-0 z-20 w-14 min-w-[3.5rem] border-b border-emerald-100/80 border-r-2 border-r-emerald-200/80 bg-emerald-50/40 p-0.5 text-center align-middle shadow-[3px_0_6px_-2px_rgba(6,78,59,0.06)]">
                      <input
                        type="checkbox"
                        disabled
                        checked={row.authorized}
                        className="h-4 w-4 cursor-not-allowed opacity-50"
                        title="Connect ramp report persistence to allow authorization"
                        aria-label={`Authorize (read-only) row ${row.sno}`}
                      />
                    </td>
                    <td className="sticky left-14 z-10 w-9 min-w-9 border-b border-emerald-100/80 border-r border-emerald-100/70 bg-emerald-50/60 py-1.5 text-center text-xs font-medium text-emerald-950 shadow-[3px_0_6px_-2px_rgba(6,78,59,0.05)]">
                      {row.sno}
                    </td>
                    {DATA_KEYS.map((key) => {
                      const display = formatRampFlightCellDisplay(key, String(row[key] ?? ''));
                      const isDiff = String(key).startsWith('diff');
                      return (
                        <td
                          key={key}
                          className={cn('border-b border-emerald-100/50 p-0.5', isDiff ? diffCell : 'bg-white')}
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
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
        <div className="flex flex-col overflow-hidden rounded-2xl border border-emerald-100/90 bg-white shadow-sm shadow-emerald-900/[0.03] ring-1 ring-emerald-900/[0.04]">
          <h3 className="flex min-h-[4.5rem] items-center border-b border-white/10 bg-emerald-500 px-4 py-2.5 text-center text-sm font-semibold leading-snug text-white shadow-sm lg:text-left">
            Operational Performance : Appreciations / Observations / Suggestions
          </h3>
          <RichTextEditor
            id="ramp-ns-operational"
            value={operationalNotes}
            onChange={onOperationalNotesChange}
            ariaLabel="Operational performance notes"
            placeholder="Enter appreciations, observations, and improvement suggestions for this shift."
          />
        </div>
        <div className="flex flex-col overflow-hidden rounded-2xl border border-emerald-100/90 bg-white shadow-sm shadow-emerald-900/[0.03] ring-1 ring-emerald-900/[0.04]">
          <h3 className="flex min-h-[4.5rem] items-center border-b border-white/10 bg-emerald-500 px-4 py-2.5 text-center text-sm font-semibold leading-snug text-white shadow-sm lg:text-left">
            Irregularities : Staff Issues / Safety / Compliance
          </h3>
          <RichTextEditor
            id="ramp-ns-irreg"
            value={irregularitiesNotes}
            onChange={onIrregularitiesNotesChange}
            ariaLabel="Irregularities notes"
            placeholder="Record staff, safety, and compliance irregularities for this shift."
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 focus-visible:outline focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600 focus-visible:outline focus-visible:ring-2 focus-visible:ring-amber-500/60 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Update'}
        </button>
      </div>
    </div>
  );
}

