'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Plane } from 'lucide-react';
import type { DelayAnalyticsFlightRow, DelayDrilldownPayload } from '@/lib/api';
import { formatMinutesAsDisplay } from './delayReportUtils';
import { IATA_DELAY_CODE_LABELS } from '@/data/iataDelayCodes';

const NAVBAR_OFFSET = '3rem';

type Props = {
  open: boolean;
  loading: boolean;
  code: string | null;
  drilldown: DelayDrilldownPayload | null;
  onClose: () => void;
};

export default function DelayFlightDrilldownDrawer({
  open,
  loading,
  code,
  drilldown,
  onClose,
}: Props) {
  const label = code ? IATA_DELAY_CODE_LABELS[code] ?? 'Delay code' : '';

  return (
    <AnimatePresence>
      {open && code && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-slate-900/30"
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed right-0 z-[111] flex h-[calc(100vh-3rem)] w-full max-w-lg flex-col border-l border-emerald-100 bg-white shadow-xl"
            style={{ top: NAVBAR_OFFSET }}
            role="dialog"
            aria-label={`Delay code ${code} flights`}
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-emerald-100 bg-slate-800 px-4 py-3 text-white">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-emerald-300/90">
                  Delay code drilldown
                </p>
                <h2 className="text-lg font-bold">
                  {code} — {label}
                </h2>
                {drilldown && !loading && (
                  <p className="mt-1 text-sm text-slate-300">
                    {drilldown.flightCount} flights · {formatMinutesAsDisplay(drilldown.totalMinutes)} total
                    · avg {formatMinutesAsDisplay(drilldown.avgMinutes)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-600 p-1.5 text-slate-200 transition hover:bg-slate-700"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {loading ? (
                <p className="text-sm text-slate-500">Loading flights…</p>
              ) : !drilldown?.flights?.length ? (
                <p className="text-sm text-slate-500">No flights for this code in the selected range.</p>
              ) : (
                <table className="w-full border-separate border-spacing-0 text-sm">
                  <thead className="sticky top-0 z-[1] bg-emerald-50">
                    <tr>
                      {['Flight', 'Airline', 'Station', 'A/C', 'Delay', 'Arr', 'Dep', 'Date'].map((h) => (
                        <th
                          key={h}
                          className="border border-emerald-200/80 px-2 py-2 text-left text-xs font-bold text-slate-800"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {drilldown.flights.map((f: DelayAnalyticsFlightRow, i) => (
                      <tr key={`${f.serialNo}-${i}`} className="bg-white hover:bg-emerald-50/50">
                        <td className="border border-slate-200/90 px-2 py-1.5 font-medium text-slate-800">
                          <span className="inline-flex items-center gap-1">
                            <Plane className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                            {f.flightNo}
                          </span>
                        </td>
                        <td className="border border-slate-200/90 px-2 py-1.5">{f.airline}</td>
                        <td className="border border-slate-200/90 px-2 py-1.5">{f.station}</td>
                        <td className="border border-slate-200/90 px-2 py-1.5">{f.aircraft}</td>
                        <td className="border border-slate-200/90 px-2 py-1.5 font-semibold text-emerald-800">
                          {formatMinutesAsDisplay(f.delayMinutes)}
                        </td>
                        <td className="border border-slate-200/90 px-2 py-1.5">{f.arrival || '—'}</td>
                        <td className="border border-slate-200/90 px-2 py-1.5">{f.departure || '—'}</td>
                        <td className="border border-slate-200/90 px-2 py-1.5 whitespace-nowrap">{f.date || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
