'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ClipboardList } from 'lucide-react';
import { DatePicker } from '@/components/ui/DatePicker';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { cn } from '@/lib/utils';
import GsdReportOperationalTables from '@/components/fris/reports/GsdReportOperationalTables';
import { FRIS_REPORTS_PAGE_SHELL_CLASS } from '@/lib/fris-reports-responsive';

function localCalendarYmd(d = new Date()): string {
  const cal = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return `${cal.getFullYear()}-${String(cal.getMonth() + 1).padStart(2, '0')}-${String(cal.getDate()).padStart(2, '0')}`;
}

function scheduleFilterCapDate(): Date {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

/** Display as DD/MM/YYYY for the summary row (matches legacy GSD form). */
function ymdToDdMmYyyy(ymd: string): string {
  const p = ymd.split('-').map((s) => s.trim());
  if (p.length !== 3) return '';
  const [y, m, d] = p;
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

type GsdReportMode = 'create';

const GSD_MODE_OPTIONS: { value: GsdReportMode; label: string; hint: string }[] = [
  {
    value: 'create',
    label: 'Create GSD report',
    hint: 'Start a new GSD shift report for the selected date.',
  },
];

export default function GsdReportContent() {
  /** Empty until `useEffect` so server and first client paint match (no `Date()` hydration drift). */
  const [reportDate, setReportDate] = useState('');
  const [maxDate, setMaxDate] = useState<Date | undefined>(undefined);
  const [gsdMode, setGsdMode] = useState<GsdReportMode>('create');
  const [hod, setHod] = useState('');
  const [dyManager, setDyManager] = useState('');
  const [dayShift, setDayShift] = useState('');
  const [nightShift, setNightShift] = useState('');
  const [flightHandled, setFlightHandled] = useState('');

  const summaryDateDisplay = useMemo(() => ymdToDdMmYyyy(reportDate), [reportDate]);

  useEffect(() => {
    setReportDate(localCalendarYmd());
    setMaxDate(scheduleFilterCapDate());
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className={`${FRIS_REPORTS_PAGE_SHELL_CLASS} w-full bg-gradient-to-br from-emerald-50/40 via-white to-teal-50/35`}
    >
      <div className="w-full pt-6 md:pt-8">
        <FrisPageHeader title="GSD Shift Report" icon={ClipboardList} />

        <div className="rounded-2xl border border-emerald-100/90 bg-white/90 p-4 shadow-sm shadow-emerald-900/[0.03] ring-1 ring-emerald-900/[0.04] backdrop-blur-sm sm:p-6">
          <div className="grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
            <label className="block text-sm font-medium text-emerald-950/85" htmlFor="gsd-bar-date">
              Date
            </label>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2.5" id="gsd-report-action">
              <span className="text-sm font-medium text-emerald-950/90">Report action</span>
              <span className="text-xs font-normal text-slate-500">What you are opening or creating for this date</span>
            </div>
            <div className="w-full self-center rounded-lg border border-emerald-100/80 bg-emerald-50/30 p-0.5">
              <DatePicker
                id="gsd-bar-date"
                value={reportDate}
                onChange={setReportDate}
                valueFormat="yyyy-MM-dd"
                maxDate={maxDate}
              />
            </div>
            <div
              className="grid min-h-0 min-w-0 grid-cols-1 gap-3 self-center"
              role="radiogroup"
              aria-labelledby="gsd-report-action"
            >
              {GSD_MODE_OPTIONS.map((opt) => {
                const selected = gsdMode === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={cn(
                      'flex min-h-[3.25rem] cursor-pointer items-center gap-2.5 rounded-xl border p-3 text-left text-sm text-slate-800 transition-all',
                      selected
                        ? 'border-emerald-400/70 bg-gradient-to-br from-emerald-50 via-white to-teal-50/40 font-medium shadow-sm ring-2 ring-emerald-300/50'
                        : 'border-slate-200/70 bg-white/90 shadow-sm hover:border-emerald-200/80 hover:bg-emerald-50/20',
                    )}
                  >
                    <input
                      type="radio"
                      name="gsd-report-mode"
                      value={opt.value}
                      checked={selected}
                      onChange={() => setGsdMode(opt.value)}
                      className="h-4 w-4 shrink-0 border-slate-300 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-0"
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
                      <span>{opt.label}</span>
                      <span className="text-xs font-normal text-slate-500">{opt.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <section
          className="mt-6 w-full min-w-0 overflow-hidden rounded-2xl border border-emerald-100/90 bg-white/90 shadow-sm shadow-emerald-900/[0.04] ring-1 ring-emerald-900/[0.05]"
          aria-label="GSD report header and GSE leased notice"
        >
          <div className="bg-gradient-to-br from-emerald-50/55 via-white to-teal-50/40 px-4 py-4 sm:px-6 sm:py-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:grid-rows-2 sm:gap-x-5 sm:gap-y-4">
              <div className="flex min-h-0 flex-col gap-1.5 rounded-xl border border-emerald-100/85 bg-white/95 p-3.5 shadow-sm ring-1 ring-emerald-900/[0.03]">
                <label className="text-xs font-semibold uppercase tracking-wide text-emerald-900/70" htmlFor="gsd-summary-date">
                  Date
                </label>
                <input
                  id="gsd-summary-date"
                  type="text"
                  readOnly
                  value={summaryDateDisplay || ''}
                  placeholder="—"
                  className={cn(
                    'h-9 w-full rounded-lg border border-emerald-100/90 px-3 text-sm tabular-nums shadow-sm',
                    'cursor-default bg-emerald-50/60 text-emerald-950',
                  )}
                  aria-readonly
                />
              </div>
              <div className="flex min-h-0 flex-col gap-1.5 rounded-xl border border-emerald-100/85 bg-white/95 p-3.5 shadow-sm ring-1 ring-emerald-900/[0.03]">
                <label className="text-xs font-semibold uppercase tracking-wide text-emerald-900/70" htmlFor="gsd-summary-hod">
                  HOD
                </label>
                <input
                  id="gsd-summary-hod"
                  type="text"
                  value={hod}
                  onChange={(e) => setHod(e.target.value)}
                  className="h-9 w-full rounded-lg border border-emerald-100/90 bg-white px-3 text-sm text-emerald-950 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200/50"
                  autoComplete="off"
                />
              </div>
              <div className="flex min-h-0 flex-col gap-1.5 rounded-xl border border-emerald-100/85 bg-white/95 p-3.5 shadow-sm ring-1 ring-emerald-900/[0.03]">
                <label className="text-xs font-semibold uppercase tracking-wide text-emerald-900/70" htmlFor="gsd-summary-dy-mgr">
                  DY. Manager
                </label>
                <input
                  id="gsd-summary-dy-mgr"
                  type="text"
                  value={dyManager}
                  onChange={(e) => setDyManager(e.target.value)}
                  className="h-9 w-full rounded-lg border border-emerald-100/90 bg-white px-3 text-sm text-emerald-950 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200/50"
                  autoComplete="off"
                />
              </div>
              <div className="flex min-h-0 flex-col gap-1.5 rounded-xl border border-emerald-100/85 bg-white/95 p-3.5 shadow-sm ring-1 ring-emerald-900/[0.03]">
                <label className="text-xs font-semibold uppercase tracking-wide text-emerald-900/70" htmlFor="gsd-summary-day">
                  Day Shift
                </label>
                <input
                  id="gsd-summary-day"
                  type="text"
                  value={dayShift}
                  onChange={(e) => setDayShift(e.target.value)}
                  className="h-9 w-full rounded-lg border border-emerald-100/90 bg-white px-3 text-sm text-emerald-950 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200/50"
                  autoComplete="off"
                />
              </div>
              <div className="flex min-h-0 flex-col gap-1.5 rounded-xl border border-emerald-100/85 bg-white/95 p-3.5 shadow-sm ring-1 ring-emerald-900/[0.03]">
                <label className="text-xs font-semibold uppercase tracking-wide text-emerald-900/70" htmlFor="gsd-summary-night">
                  Night Shift
                </label>
                <input
                  id="gsd-summary-night"
                  type="text"
                  value={nightShift}
                  onChange={(e) => setNightShift(e.target.value)}
                  className="h-9 w-full rounded-lg border border-emerald-100/90 bg-white px-3 text-sm text-emerald-950 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200/50"
                  autoComplete="off"
                />
              </div>
              <div className="flex min-h-0 flex-col gap-1.5 rounded-xl border border-emerald-100/85 bg-white/95 p-3.5 shadow-sm ring-1 ring-emerald-900/[0.03]">
                <label className="text-xs font-semibold uppercase tracking-wide text-emerald-900/70" htmlFor="gsd-summary-flights">
                  Flight Handled
                </label>
                <input
                  id="gsd-summary-flights"
                  type="text"
                  value={flightHandled}
                  onChange={(e) => setFlightHandled(e.target.value)}
                  className="h-9 w-full rounded-lg border border-emerald-100/90 bg-white px-3 text-sm text-emerald-950 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200/50"
                  autoComplete="off"
                />
              </div>
            </div>
          </div>
          <div className="border-t border-emerald-200/70 bg-gradient-to-r from-teal-50/80 via-emerald-50/70 to-teal-50/80 px-4 py-3.5 text-center text-sm leading-relaxed sm:px-6 sm:text-base">
            <span className="font-semibold tracking-tight text-emerald-950">GSE LEASED TO OTHER AGENCIES</span>
            <span className="text-teal-800/95">
              {' '}
              (Only The verified data from flight report will reflect here)
            </span>
          </div>
        </section>

        <GsdReportOperationalTables dateDdMmYyyy={summaryDateDisplay} />
      </div>
    </motion.div>
  );
}
