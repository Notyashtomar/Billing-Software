'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_CONTROL,
  positiveInteger,
  required,
} from '@/lib/form-validation';
import RampSummaryOfResourcesSection from '@/components/fris/reports/RampSummaryOfResourcesSection';
import RampScheduledAirlinesTableSection from '@/components/fris/reports/RampScheduledAirlinesTableSection';
import { RampNonScheduledAirlinesAndNotesSection } from '@/components/fris/reports/RampNonScheduledAirlinesAndNotesSection';
import type { NonScheduledAirlineTableRow } from '@/components/fris/reports/rampNonScheduledMappers';
import type { RampScheduledAirlineRow } from '@/types/fris/reports/rampScheduledAirline';
import {
  getRampShiftReportAsync,
  readLoggedInUserLabel,
  saveRampShiftReportAsync,
  type RampShiftFormSnapshot,
  type RampShiftSavedReport,
} from '@/components/fris/reports/rampShiftStorage';
import { emptyResourceGrid, normalizeResourceGrid } from '@/components/fris/reports/rampResourceGrid';

const inputClass =
  'w-full min-w-0 rounded-lg border border-emerald-100/90 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200/50';

const cellLabelClass = 'text-sm font-medium text-slate-700';

type ShiftBand = 'day' | 'night';

function sanitizeIntegerField(v: string): string {
  const t = v.replace(/[^\d-]/g, '');
  if (t === '' || t === '-') return t;
  const m = /^-?\d*$/.exec(t);
  return m ? m[0] : '';
}

type FormRowNumberProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  id: string;
  error?: string | null;
};

function FormRowNumber({ label, value, onChange, id, error }: FormRowNumberProps) {
  return (
    <div className="min-w-0">
      <label className={cn(cellLabelClass, 'mb-1.5 block')} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(sanitizeIntegerField(e.target.value))}
        className={cn(inputClass, error && FRIS_INVALID_CONTROL)}
        autoComplete="off"
        aria-invalid={!!error}
      />
      <FormFieldError id={`${id}-error`} message={error} />
    </div>
  );
}

const RAMP_FIELD_ORDER = [
  'manager',
  'reportDate',
  'totalArrivals',
  'totalDepartures',
  'paxFlts',
  'cargoFlts',
  'unschedPax',
  'unschedCargo',
  'delayAccountable',
  'delayUnAccountable',
  'otpTarget',
  'otpActual',
] as const;
type RampField = (typeof RAMP_FIELD_ORDER)[number];

function ColHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-emerald-400 px-3 py-2.5 text-center text-sm font-semibold text-white shadow-sm">
      {children}
    </div>
  );
}

function formatYmdToDdMmYyyy(ymd: string): string {
  const p = ymd.split('-').map((s) => s.trim());
  if (p.length !== 3) return '—';
  const [y, m, d] = p;
  if (!y || !m || !d) return '—';
  return `${d}/${m}/${y}`;
}

type Props = {
  shift: ShiftBand;
  reportDate: string;
  reportId: string;
  fhrScheduledRows: RampScheduledAirlineRow[];
  scheduledLoading: boolean;
  scheduledError?: string | null;
  nonScheduledRows: NonScheduledAirlineTableRow[];
  nonScheduledLoading: boolean;
  nonScheduledError?: string | null;
  onSaved: () => void;
};

function snapshotFromState(
  manager: string,
  reportBy: string,
  indicators: Record<string, string>,
  resourceValues: string[][],
  scheduledRows: RampScheduledAirlineRow[],
  nonScheduledRows: NonScheduledAirlineTableRow[],
  operationalNotes: string,
  irregularitiesNotes: string,
): RampShiftFormSnapshot {
  return {
    manager,
    reportBy,
    totalArrivals: indicators.totalArrivals,
    totalDepartures: indicators.totalDepartures,
    paxFlts: indicators.paxFlts,
    cargoFlts: indicators.cargoFlts,
    unschedPax: indicators.unschedPax,
    unschedCargo: indicators.unschedCargo,
    delayAccountable: indicators.delayAccountable,
    delayUnAccountable: indicators.delayUnAccountable,
    otpTarget: indicators.otpTarget,
    otpActual: indicators.otpActual,
    resourceValues,
    scheduledRows,
    nonScheduledRows,
    operationalNotes,
    irregularitiesNotes,
  };
}

export default function RampShiftServicesReportForm({
  shift,
  reportDate,
  reportId,
  fhrScheduledRows,
  scheduledLoading,
  scheduledError = null,
  nonScheduledRows: fhrNonScheduledRows,
  nonScheduledLoading,
  nonScheduledError = null,
  onSaved,
}: Props) {
  const [manager, setManager] = useState('');
  const [reportBy, setReportBy] = useState('');
  const [totalArrivals, setTotalArrivals] = useState('');
  const [totalDepartures, setTotalDepartures] = useState('');
  const [paxFlts, setPaxFlts] = useState('');
  const [cargoFlts, setCargoFlts] = useState('');
  const [unschedPax, setUnschedPax] = useState('');
  const [unschedCargo, setUnschedCargo] = useState('');
  const [delayAccountable, setDelayAccountable] = useState('');
  const [delayUnAccountable, setDelayUnAccountable] = useState('');
  const [otpTarget, setOtpTarget] = useState('');
  const [otpActual, setOtpActual] = useState('');
  const [resourceValues, setResourceValues] = useState<string[][]>(emptyResourceGrid);
  const [scheduledRows, setScheduledRows] = useState<RampScheduledAirlineRow[]>([]);
  const [nonScheduledRows, setNonScheduledRows] = useState<NonScheduledAirlineTableRow[]>([]);
  const [operationalNotes, setOperationalNotes] = useState('');
  const [irregularitiesNotes, setIrregularitiesNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const { errors, clearField, applyAndFocus } = useFieldErrors<RampField>(RAMP_FIELD_ORDER);

  const applySnapshot = useCallback((form: RampShiftFormSnapshot) => {
    setManager(form.manager);
    setReportBy(form.reportBy);
    setTotalArrivals(form.totalArrivals);
    setTotalDepartures(form.totalDepartures);
    setPaxFlts(form.paxFlts);
    setCargoFlts(form.cargoFlts);
    setUnschedPax(form.unschedPax);
    setUnschedCargo(form.unschedCargo);
    setDelayAccountable(form.delayAccountable);
    setDelayUnAccountable(form.delayUnAccountable);
    setOtpTarget(form.otpTarget);
    setOtpActual(form.otpActual);
    setResourceValues(normalizeResourceGrid(form.resourceValues));
    setScheduledRows(form.scheduledRows ?? []);
    setNonScheduledRows(form.nonScheduledRows ?? []);
    setOperationalNotes(form.operationalNotes ?? '');
    setIrregularitiesNotes(form.irregularitiesNotes ?? '');
  }, []);

  const [loadedFromDb, setLoadedFromDb] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadedFromDb(false);
    (async () => {
      const saved = await getRampShiftReportAsync(reportId);
      if (cancelled) return;
      if (saved?.form) {
        applySnapshot(saved.form);
        setLoadedFromDb(true);
        return;
      }
      setManager(readLoggedInUserLabel());
      setReportBy('');
      setTotalArrivals('');
      setTotalDepartures('');
      setPaxFlts('');
      setCargoFlts('');
      setUnschedPax('');
      setUnschedCargo('');
      setDelayAccountable('');
      setDelayUnAccountable('');
      setOtpTarget('');
      setOtpActual('');
      setResourceValues(emptyResourceGrid());
      setScheduledRows(fhrScheduledRows);
      setNonScheduledRows(fhrNonScheduledRows);
      setOperationalNotes('');
      setIrregularitiesNotes('');
      setLoadedFromDb(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId, applySnapshot, fhrScheduledRows, fhrNonScheduledRows]);

  useEffect(() => {
    if (!loadedFromDb) setScheduledRows(fhrScheduledRows);
  }, [fhrScheduledRows, loadedFromDb]);

  useEffect(() => {
    if (!loadedFromDb) setNonScheduledRows(fhrNonScheduledRows);
  }, [fhrNonScheduledRows, loadedFromDb]);

  const { title, shiftTime, dateLabel } = useMemo(() => {
    const d = formatYmdToDdMmYyyy(reportDate);
    if (shift === 'day') {
      return { title: 'Day Shift Ramp Services Report Create', shiftTime: '05:00 - 17:00', dateLabel: d } as const;
    }
    return { title: 'Night Shift Ramp Services Report Create', shiftTime: '17:00 - 05:00', dateLabel: d } as const;
  }, [shift, reportDate]);

  const handleSave = useCallback(async () => {
    const nextErrors: Partial<Record<RampField, string>> = {};
    const mgrErr = required(manager, 'Manager / Duty Manager');
    if (mgrErr) nextErrors.manager = mgrErr;
    const dateErr = required(reportDate ?? '', 'Report date');
    if (dateErr) nextErrors.reportDate = dateErr;

    const numeric: Array<[RampField, string, string]> = [
      ['totalArrivals', totalArrivals, 'Total Arrivals'],
      ['totalDepartures', totalDepartures, 'Total Departures'],
      ['paxFlts', paxFlts, 'Pax Flts'],
      ['cargoFlts', cargoFlts, 'Cargo Flts'],
      ['unschedPax', unschedPax, 'UnScheduled-Pax'],
      ['unschedCargo', unschedCargo, 'UnScheduled-Cargo'],
      ['delayAccountable', delayAccountable, 'Accountable'],
      ['delayUnAccountable', delayUnAccountable, 'UN - Accountable'],
      ['otpTarget', otpTarget, 'OTP Target'],
      ['otpActual', otpActual, 'OTP Actual'],
    ];
    for (const [key, value, label] of numeric) {
      const err = positiveInteger(value, label);
      if (err) nextErrors[key] = err;
    }
    if (applyAndFocus(nextErrors)) return;

    setSaving(true);
    try {
      const userLabel = readLoggedInUserLabel();
      const existing = await getRampShiftReportAsync(reportId);
      const now = new Date().toISOString();
      const form = snapshotFromState(
        manager.trim(),
        reportBy.trim(),
        {
          totalArrivals,
          totalDepartures,
          paxFlts,
          cargoFlts,
          unschedPax,
          unschedCargo,
          delayAccountable,
          delayUnAccountable,
          otpTarget,
          otpActual,
        },
        resourceValues,
        scheduledRows,
        nonScheduledRows,
        operationalNotes.trim(),
        irregularitiesNotes.trim(),
      );
      const record: RampShiftSavedReport = {
        id: reportId,
        shift,
        reportDateYmd: reportDate,
        createdAt: existing?.createdAt ?? now,
        createdBy: existing?.createdBy ?? userLabel,
        modifiedAt: now,
        modifiedBy: userLabel,
        mailSent: existing?.mailSent ?? false,
        form,
      };
      await saveRampShiftReportAsync(record, userLabel);
      toast.success('Ramp shift report saved to database.');
      setLoadedFromDb(true);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [
    reportDate,
    manager,
    reportBy,
    totalArrivals,
    totalDepartures,
    paxFlts,
    cargoFlts,
    unschedPax,
    unschedCargo,
    delayAccountable,
    delayUnAccountable,
    otpTarget,
    otpActual,
    resourceValues,
    scheduledRows,
    nonScheduledRows,
    operationalNotes,
    irregularitiesNotes,
    reportId,
    shift,
    onSaved,
    applyAndFocus,
  ]);

  return (
    <div className="w-full space-y-5">
      <div className="overflow-hidden rounded-2xl border border-emerald-100/90 bg-white shadow-sm shadow-emerald-900/[0.03] ring-1 ring-emerald-900/[0.04]">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-emerald-500 px-4 py-3.5">
          <h2 className="text-center text-base font-semibold tracking-tight text-white sm:text-left">{title}</h2>
          <button
            type="button"
            onClick={() => void handleSave()}
            className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-emerald-500 shadow-sm hover:bg-emerald-50"
          >
            Save report
          </button>
        </div>
        <div className="grid grid-cols-1 gap-5 p-4 sm:p-5 lg:grid-cols-[1fr_1.6fr] lg:gap-8">
          <div className="min-w-0 flex-1">
            <label className={cn(cellLabelClass, 'mb-1.5 block')} htmlFor="field-manager">
              Manager / Duty Manager
            </label>
            <input
              id="field-manager"
              type="text"
              value={manager}
              onChange={(e) => {
                setManager(e.target.value);
                clearField('manager');
              }}
              placeholder="Krishan Bhardwaj(DELK0027)"
              className={cn(inputClass, 'sm:max-w-xs', errors.manager && FRIS_INVALID_CONTROL)}
              autoComplete="off"
              aria-invalid={!!errors.manager}
            />
            <FormFieldError id="field-manager-error" message={errors.manager} />
            <p className="mt-1 text-xs text-slate-500">Text only — use format Name(EmployeeID).</p>
          </div>

          <div className="min-w-0 self-start rounded-xl border border-emerald-100/80 bg-emerald-50/50 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="min-w-0" id="field-reportDate">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Date</span>
                <div
                  className={cn(
                    'flex h-10 items-center rounded-lg border border-emerald-100/90 bg-white px-3 text-sm text-slate-800 shadow-sm',
                    errors.reportDate && 'border-red-500',
                  )}
                  aria-live="polite"
                >
                  {dateLabel}
                </div>
                <FormFieldError id="field-reportDate-error" message={errors.reportDate} />
              </div>
              <div className="min-w-0">
                <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="ramp-shift-time">
                  Shift Time
                </label>
                <input
                  id="ramp-shift-time"
                  type="text"
                  readOnly
                  value={shiftTime}
                  className={cn(inputClass, 'cursor-default bg-emerald-50/50 text-slate-700')}
                  tabIndex={-1}
                  aria-readonly
                />
                <FormFieldError />
              </div>
              <div className="min-w-0">
                <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="ramp-report-by">
                  Report By
                </label>
                <input
                  id="ramp-report-by"
                  type="text"
                  value={reportBy}
                  onChange={(e) => setReportBy(e.target.value)}
                  className={inputClass}
                  autoComplete="off"
                />
                <FormFieldError />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-emerald-100/90 bg-white shadow-sm shadow-emerald-900/[0.03] ring-1 ring-emerald-900/[0.04]">
        <h2 className="w-full bg-emerald-500 px-4 py-3.5 text-center text-base font-semibold tracking-tight text-white shadow-sm sm:text-left">
          Operational Indicators
        </h2>
        <div className="space-y-4 bg-emerald-50/40 p-3 sm:p-4">
          <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-emerald-100/70 bg-white shadow-sm">
            <ColHeader>Flight</ColHeader>
            <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-6">
              <FormRowNumber
                id="field-totalArrivals"
                label="Total Arrivals"
                value={totalArrivals}
                error={errors.totalArrivals}
                onChange={(v) => {
                  setTotalArrivals(v);
                  clearField('totalArrivals');
                }}
              />
              <FormRowNumber
                id="field-totalDepartures"
                label="Total Departures"
                value={totalDepartures}
                error={errors.totalDepartures}
                onChange={(v) => {
                  setTotalDepartures(v);
                  clearField('totalDepartures');
                }}
              />
              <FormRowNumber
                id="field-paxFlts"
                label="Pax Flts"
                value={paxFlts}
                error={errors.paxFlts}
                onChange={(v) => {
                  setPaxFlts(v);
                  clearField('paxFlts');
                }}
              />
              <FormRowNumber
                id="field-cargoFlts"
                label="Cargo Flts"
                value={cargoFlts}
                error={errors.cargoFlts}
                onChange={(v) => {
                  setCargoFlts(v);
                  clearField('cargoFlts');
                }}
              />
              <FormRowNumber
                id="field-unschedPax"
                label="UnScheduled-Pax"
                value={unschedPax}
                error={errors.unschedPax}
                onChange={(v) => {
                  setUnschedPax(v);
                  clearField('unschedPax');
                }}
              />
              <FormRowNumber
                id="field-unschedCargo"
                label="UnScheduled-Cargo"
                value={unschedCargo}
                error={errors.unschedCargo}
                onChange={(v) => {
                  setUnschedCargo(v);
                  clearField('unschedCargo');
                }}
              />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-emerald-100/70 bg-white shadow-sm">
              <ColHeader>Delays</ColHeader>
              <div className="grid grid-cols-2 gap-3 p-3">
                <FormRowNumber
                  id="field-delayAccountable"
                  label="Accountable"
                  value={delayAccountable}
                  error={errors.delayAccountable}
                  onChange={(v) => {
                    setDelayAccountable(v);
                    clearField('delayAccountable');
                  }}
                />
                <FormRowNumber
                  id="field-delayUnAccountable"
                  label="UN - Accountable"
                  value={delayUnAccountable}
                  error={errors.delayUnAccountable}
                  onChange={(v) => {
                    setDelayUnAccountable(v);
                    clearField('delayUnAccountable');
                  }}
                />
              </div>
            </section>
            <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-emerald-100/70 bg-white shadow-sm">
              <ColHeader>OTP</ColHeader>
              <div className="grid grid-cols-2 gap-3 p-3">
                <FormRowNumber
                  id="field-otpTarget"
                  label="Target"
                  value={otpTarget}
                  error={errors.otpTarget}
                  onChange={(v) => {
                    setOtpTarget(v);
                    clearField('otpTarget');
                  }}
                />
                <FormRowNumber
                  id="field-otpActual"
                  label="Actual"
                  value={otpActual}
                  error={errors.otpActual}
                  onChange={(v) => {
                    setOtpActual(v);
                    clearField('otpActual');
                  }}
                />
              </div>
            </section>
          </div>
        </div>
      </div>

      <RampSummaryOfResourcesSection values={resourceValues} onValuesChange={setResourceValues} />
      <RampScheduledAirlinesTableSection
        rows={scheduledRows}
        loading={scheduledLoading}
        loadError={scheduledError}
        onRowsChange={setScheduledRows}
      />
      <RampNonScheduledAirlinesAndNotesSection
        rows={nonScheduledRows}
        loading={nonScheduledLoading}
        loadError={nonScheduledError}
        operationalNotes={operationalNotes}
        irregularitiesNotes={irregularitiesNotes}
        onOperationalNotesChange={setOperationalNotes}
        onIrregularitiesNotesChange={setIrregularitiesNotes}
        onSave={() => void handleSave()}
        saving={saving}
      />
    </div>
  );
}
