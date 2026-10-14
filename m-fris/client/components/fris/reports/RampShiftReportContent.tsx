'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';
import { DatePicker } from '@/components/ui/DatePicker';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { cn } from '@/lib/utils';
import { FRIS_REPORTS_PAGE_SHELL_CLASS } from '@/lib/fris-reports-responsive';
import { toast } from 'sonner';
import RampShiftServicesReportForm from '@/components/fris/reports/RampShiftServicesReportForm';
import RampCreationModeSection from '@/components/fris/reports/RampCreationModeSection';
import {
  fetchNonScheduledFlightsForDashboard,
  fetchRampShiftScheduledFlights,
} from '@/lib/api';
import { buildNonScheduledTableRows } from '@/components/fris/reports/rampNonScheduledMappers';
import type { RampScheduledAirlineRow } from '@/types/fris/reports/rampScheduledAirline';
import { createRampShiftReportId } from '@/components/fris/reports/rampShiftStorage';

function localCalendarYmd(d = new Date()): string {
  const cal = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return `${cal.getFullYear()}-${String(cal.getMonth() + 1).padStart(2, '0')}-${String(cal.getDate()).padStart(2, '0')}`;
}

function scheduleFilterCapDate(): Date {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

type RampServicesShift = 'day' | 'night';

const SHIFT_OPTIONS: { value: RampServicesShift; label: string }[] = [
  { value: 'day', label: 'Day shift ramp services (05:00–17:00)' },
  { value: 'night', label: 'Night shift ramp services (17:00–05:00)' },
];

export default function RampShiftReportContent() {
  const [reportDate, setReportDate] = useState(() => localCalendarYmd());
  const [shift, setShift] = useState<RampServicesShift>('day');
  const [fhrScheduledRows, setFhrScheduledRows] = useState<RampScheduledAirlineRow[]>([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [scheduledError, setScheduledError] = useState<string | null>(null);
  const [nonScheduledRaw, setNonScheduledRaw] = useState<unknown[]>([]);
  const [nonScheduledLoading, setNonScheduledLoading] = useState(false);
  const [nonScheduledError, setNonScheduledError] = useState<string | null>(null);
  const [openReportId, setOpenReportId] = useState<string | null>(null);
  const [creationRefresh, setCreationRefresh] = useState(0);
  const [savedReportsScope, setSavedReportsScope] = useState<string | null>(null);
  const [openingReport, setOpeningReport] = useState(false);
  const maxDate = useMemo(() => scheduleFilterCapDate(), []);
  const reportScopeKey = `${reportDate}:${shift}`;
  const showSavedReportsTable = savedReportsScope === reportScopeKey;

  const nonScheduledRows = useMemo(
    () => buildNonScheduledTableRows(nonScheduledRaw, shift, reportDate),
    [nonScheduledRaw, shift, reportDate],
  );

  useEffect(() => {
    const d = reportDate?.trim();
    if (!d) return;
    let cancelled = false;

    const createReport = async () => {
      setOpeningReport(true);
      try {
        const id = await createRampShiftReportId();
        if (!cancelled) setOpenReportId(id);
      } catch (e) {
        if (!cancelled) {
          setOpenReportId(null);
          toast.error(e instanceof Error ? e.message : 'Could not start new report');
        }
      } finally {
        if (!cancelled) setOpeningReport(false);
      }
    };

    void createReport();
    return () => {
      cancelled = true;
    };
  }, [reportDate, shift]);

  useEffect(() => {
    const d = reportDate?.trim();
    if (!d) return;
    let cancelled = false;

    const loadFlights = async () => {
      setScheduledLoading(true);
      setNonScheduledLoading(true);
      setScheduledError(null);
      setNonScheduledError(null);
      try {
        const [scheduled, nonSched] = await Promise.all([
          fetchRampShiftScheduledFlights(d, shift),
          fetchNonScheduledFlightsForDashboard(d, d),
        ]);
        if (cancelled) return;
        setFhrScheduledRows(scheduled);
        setNonScheduledRaw(Array.isArray(nonSched) ? nonSched : []);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Failed to load flights';
        setFhrScheduledRows([]);
        setNonScheduledRaw([]);
        setScheduledError(msg);
        setNonScheduledError(msg);
      } finally {
        if (!cancelled) {
          setScheduledLoading(false);
          setNonScheduledLoading(false);
        }
      }
    };

    void loadFlights();

    return () => {
      cancelled = true;
    };
  }, [reportDate, shift]);

  const handleReportsLoaded = useCallback(
    (count: number) => {
      if (count > 0) setSavedReportsScope(reportScopeKey);
    },
    [reportScopeKey],
  );

  const effectiveOpenReportId = reportDate.trim() ? openReportId : null;
  const effectiveScheduledRows = reportDate.trim() ? fhrScheduledRows : [];
  const effectiveNonScheduledRows = reportDate.trim() ? nonScheduledRows : [];
  const effectiveScheduledError = reportDate.trim() ? scheduledError : null;
  const effectiveNonScheduledError = reportDate.trim() ? nonScheduledError : null;
  const isOpeningReport = reportDate.trim() ? openingReport : false;

  const handleOpenSavedReport = (id: string | null) => {
    if (id) {
      setOpenReportId(id);
      return;
    }
    const d = reportDate?.trim();
    if (!d) {
      setOpenReportId(null);
      return;
    }
    setOpeningReport(true);
    createRampShiftReportId()
      .then((newId) => setOpenReportId(newId))
      .catch((e) => {
        setOpenReportId(null);
        toast.error(e instanceof Error ? e.message : 'Could not start new report');
      })
      .finally(() => setOpeningReport(false));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className={`${FRIS_REPORTS_PAGE_SHELL_CLASS} w-full bg-emerald-50`}
    >
      <div className="w-full pt-6 md:pt-8">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:gap-6">
          <FrisPageHeader title="Ramp Shift Report" icon={Shield} className="mb-0 shrink-0 xl:pt-2" />

          <div className="w-full min-w-0 flex-1 rounded-2xl border border-emerald-100/90 bg-white/90 p-4 shadow-sm shadow-emerald-900/[0.03] ring-1 ring-emerald-900/[0.04] backdrop-blur-sm sm:p-6">
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
            <label className="block text-sm font-medium text-emerald-950/85" htmlFor="ramp-bar-date">
              Date
            </label>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2.5" id="ramp-shift-heading">
              <span className="text-sm font-medium text-emerald-950/90">Shift</span>
              <span className="text-xs font-normal text-slate-500">
                Upcoming flights use STA; landed flights use ATA for the shift band
              </span>
            </div>
            <div className="w-full self-center rounded-lg border border-emerald-100/80 bg-emerald-50/30 p-0.5">
              <DatePicker
                id="ramp-bar-date"
                value={reportDate}
                onChange={setReportDate}
                valueFormat="yyyy-MM-dd"
                maxDate={maxDate}
              />
            </div>
            <div
              className="grid min-h-0 min-w-0 grid-cols-1 gap-3 self-center sm:grid-cols-2"
              role="radiogroup"
              aria-labelledby="ramp-shift-heading"
            >
              {SHIFT_OPTIONS.map((opt) => {
                const selected = shift === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={cn(
                      'flex min-h-[3.25rem] cursor-pointer items-center gap-2.5 rounded-xl border p-3 text-left text-sm text-slate-800 transition-all',
                      selected
                        ? 'border-emerald-400/70 bg-emerald-50 font-medium shadow-sm ring-2 ring-emerald-300/50'
                        : 'border-slate-200/70 bg-white/90 shadow-sm hover:border-emerald-200/80 hover:bg-emerald-50/20',
                    )}
                  >
                    <input
                      type="radio"
                      name="ramp-shift-services"
                      value={opt.value}
                      checked={selected}
                      onChange={() => setShift(opt.value)}
                      className="h-4 w-4 shrink-0 border-slate-300 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
                    />
                    <span className="leading-tight">{opt.label}</span>
                  </label>
                );
              })}
            </div>
            </div>
          </div>
        </div>

        <div className="mt-6 w-full min-w-0 space-y-6">
          <RampCreationModeSection
            shift={shift}
            reportDateYmd={reportDate}
            openReportId={effectiveOpenReportId}
            refreshKey={creationRefresh}
            visible={showSavedReportsTable}
            onOpenReport={handleOpenSavedReport}
            onReportsLoaded={handleReportsLoaded}
          />

          {isOpeningReport && !effectiveOpenReportId && reportDate && (
            <p className="text-center text-sm text-slate-500">Preparing report form…</p>
          )}

          {effectiveOpenReportId && reportDate && (
            <RampShiftServicesReportForm
              key={`${effectiveOpenReportId}-${reportDate}-${shift}`}
              shift={shift}
              reportDate={reportDate}
              reportId={effectiveOpenReportId}
              fhrScheduledRows={effectiveScheduledRows}
              scheduledLoading={scheduledLoading}
              scheduledError={effectiveScheduledError}
              nonScheduledRows={effectiveNonScheduledRows}
              nonScheduledLoading={nonScheduledLoading}
              nonScheduledError={effectiveNonScheduledError}
              onSaved={() => {
                setSavedReportsScope(reportScopeKey);
                setCreationRefresh((n) => n + 1);
              }}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
}
