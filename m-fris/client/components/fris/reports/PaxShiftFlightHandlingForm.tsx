'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Plane, ClipboardList, Mail, Save } from 'lucide-react';
import { getErrorMessage } from '@/lib/error-utils';
import { toast } from 'sonner';
import type { FlightData } from '@/utils/dataProcessor';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/DatePicker';
import { TimeSelect24, normalizeTime24 } from '@/components/ui/TimeSelect24';
import { MAIN_DETAILS_DELAY_REASONS } from '@/lib/delayReasons';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_CONTROL,
  positiveInteger,
  required,
  type FieldErrors,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';
import {
  paxShiftFlightHandlingStorageKey,
  retainPaxShiftSessionForSerial,
} from '@/components/fris/reports/paxShiftReportStorageKeys';
import {
  fetchAdvanceStaffData,
  fetchPsrFlightDetailsByFlightSerial,
  upsertPsrFlightDetailsForFlight,
  type AdvanceStaffDataRow,
} from '@/lib/api';
import {
  coerceTimeHHmm,
  flightDetailsValueForInput,
  normalizeFlightDetailsForSave,
} from '@/lib/paxShiftFieldCoercion';
import { PaxShiftIntegerInput } from '@/components/fris/reports/PaxShiftIntegerInput';
import { flightSnapshotFromFlightData } from '@/components/fris/reports/paxShiftFlightSnapshot';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { SearchableCombobox } from '@/components/ui/SearchableCombobox';
import type { SearchableComboOption } from '@/components/ui/SearchableCombobox';
import { ReportsResponsiveTable } from '@/components/fris/reports/ReportsResponsiveTable';

const INPUT_CLASS =
  'h-10 border-slate-200/80 bg-white text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[box-shadow,border-color] duration-150 placeholder:text-slate-400 hover:border-slate-300/90 hover:bg-slate-50/30 focus-visible:border-emerald-400/80 focus-visible:shadow-[0_0_0_3px_rgba(16,185,129,0.12)] focus-visible:ring-0 focus-visible:ring-offset-0';

/** Matches text inputs; native dropdown chevron kept for cross-browser background consistency. */
const SELECT_CLASS = cn(INPUT_CLASS, 'cursor-pointer py-1.5 pl-3 pr-2');

/** Long delay-reason list: compact type (native select handles scrolling). */
const DELAY_SELECT_CLASS = cn(SELECT_CLASS, 'text-xs leading-snug');

const PAX_COLUMNS = [
  'TTL',
  'F',
  'C',
  'Y',
  'P-Eco',
  'CUSS-chk-in/HONS',
  'CUSS',
  'MAAS',
  'WCH',
  'UM',
  'INF',
  'AVIH',
  'Tran Int',
  'Tran Dom',
  'Bag Cnt',
] as const;

function paxFieldKey(row: 'arrivals' | 'departures', col: (typeof PAX_COLUMNS)[number]): string {
  return `pax_${row}_${col}`;
}

const PAX_SHIFT_FIELD_ORDER = [
  'compiledBy',
  ...(['arrivals', 'departures'] as const).flatMap((row) =>
    PAX_COLUMNS.map((col) => paxFieldKey(row, col)),
  ),
] as const;
type PaxShiftField = (typeof PAX_SHIFT_FIELD_ORDER)[number];

function buildEmptyPaxValues(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of ['arrivals', 'departures'] as const) {
    for (const col of PAX_COLUMNS) {
      out[paxFieldKey(row, col)] = '';
    }
  }
  return out;
}

const PAX_COLUMN_HELP: Record<(typeof PAX_COLUMNS)[number], string> = {
  TTL: 'Total',
  F: 'First class',
  C: 'Business',
  Y: 'Economy',
  'P-Eco': 'Premium economy',
  'CUSS-chk-in/HONS': 'CUSS check-in / HONS',
  CUSS: 'CUSS',
  MAAS: 'MAAS',
  WCH: 'Wheelchair',
  UM: 'Unaccompanied minor',
  INF: 'Infant',
  AVIH: 'Animal in hold',
  'Tran Int': 'Transfer international',
  'Tran Dom': 'Transfer domestic',
  'Bag Cnt': 'Bag count',
};

const AC_TYPE_OPTIONS = [
  'B787-900',
  'B777-300ER',
  'A350-900',
  'A320neo',
  'B737-800',
  'ATR 72',
];

function toIsoDateString(raw: string): string {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parts = t.split(/[/-]/).map((p) => p.trim());
  if (parts.length === 3 && parts[2]?.length === 4) {
    const d = Number(parts[0]);
    const m = Number(parts[1]);
    const y = Number(parts[2]);
    if (!d || !m || !y) return '';
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return '';
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return '';
}

function timeForHtmlInput(t: string): string {
  const n = normalizeTime24(t, false);
  return n === '00:00' && !String(t).trim() ? '' : n;
}

function Field({
  id,
  label,
  className,
  children,
  error,
}: {
  id: string;
  label: string;
  className?: string;
  children: React.ReactNode;
  error?: string;
}) {
  const control = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<{ id?: string }>, { id })
    : children;

  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <Label htmlFor={id} className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </Label>
      {control}
      <FormFieldError id={`${id}-error`} message={error} />
    </div>
  );
}

/** Label + custom control (DatePicker / TimeSelect24) where `htmlFor` targets the hour button or trigger id. */
function PickerField({
  id,
  label,
  className,
  children,
}: {
  id: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <Label htmlFor={id} className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </Label>
      {children}
      <FormFieldError />
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'overflow-visible rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/40',
        className,
      )}
    >
      <div className="flex items-start gap-3 rounded-t-2xl border-b border-emerald-600 bg-emerald-600 px-5 py-4">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/20">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-white">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs leading-relaxed text-emerald-50/90">{subtitle}</p> : null}
        </div>
      </div>
      <div className="overflow-visible p-5 md:p-6">{children}</div>
    </section>
  );
}

function AccentFormSection({
  title,
  titleId,
  children,
}: {
  title: string;
  titleId: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/40"
      aria-labelledby={titleId}
    >
      <div className="border-b border-emerald-600 bg-emerald-600 px-5 py-3.5">
        <h2 id={titleId} className="text-sm font-semibold tracking-wide text-white">
          {title}
        </h2>
      </div>
      <div className="p-5 md:p-6">{children}</div>
    </section>
  );
}

export type PaxShiftFlightHandlingFormProps = {
  flight: FlightData;
  /** When available (e.g. profile / stand assignment), fills gate and report footer. */
  reporter?: { name?: string; designation?: string; gate?: string };
};

export default function PaxShiftFlightHandlingForm({ flight, reporter }: PaxShiftFlightHandlingFormProps) {
  const uid = useId();
  const f = (name: string) => `${uid}-${name}`;
  const formRef = useRef<HTMLFormElement>(null);

  const flightDate = useMemo(() => {
    const fromSta = toIsoDateString(flight.staDate);
    if (fromSta) return fromSta;
    return toIsoDateString(flight.stdDate);
  }, [flight.staDate, flight.stdDate]);

  const acType = flight.aircraft?.trim() || '';
  const acOptions = useMemo(() => {
    const set = new Set(AC_TYPE_OPTIONS);
    if (acType) set.add(acType);
    return Array.from(set);
  }, [acType]);

  const [dateOp, setDateOp] = useState(() => flightDate || '');
  const [dateCompiled, setDateCompiled] = useState(() => flightDate || '');
  const [tSta, setTSta] = useState(() => timeForHtmlInput(flight.staTime) || '00:00');
  const [tEta, setTEta] = useState(() => timeForHtmlInput(flight.staTime) || '00:00');
  const [tAta, setTAta] = useState('');
  const [tStd, setTStd] = useState(() => timeForHtmlInput(flight.stdTime) || '00:00');
  const [tEtd, setTEtd] = useState(() => timeForHtmlInput(flight.stdTime) || '00:00');
  const [tAtd, setTAtd] = useState('');
  const [tGt, setTGt] = useState('');
  const [tAgt, setTAgt] = useState('');
  const [tGroundTime, setTGroundTime] = useState('');
  const [delayMins, setDelayMins] = useState('');
  const [delayCode, setDelayCode] = useState('');
  const [delayExtra0, setDelayExtra0] = useState('');
  const [delayExtra1, setDelayExtra1] = useState('');
  const [acTypePick, setAcTypePick] = useState(() => acType || '');
  const [addCabinDoor, setAddCabinDoor] = useState('');
  const [addHoldClosed, setAddHoldClosed] = useState('');
  const [addCrewBoarded, setAddCrewBoarded] = useState('');
  const [formSeed, setFormSeed] = useState(0);
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [paxValues, setPaxValues] = useState<Record<string, string>>(buildEmptyPaxValues);
  const [saving, setSaving] = useState(false);
  const { errors, clearField, applyAndFocus } =
    useFieldErrors<PaxShiftField>(PAX_SHIFT_FIELD_ORDER);
  const [staffOvertime, setStaffOvertime] = useState('');
  const [staffOptions, setStaffOptions] = useState<AdvanceStaffDataRow[]>([]);
  const [staffLoaded, setStaffLoaded] = useState(false);
  const [staffLoading, setStaffLoading] = useState(false);
  const staffInFlight = useRef(false);

  const loadStaffIfNeeded = useCallback(async () => {
    if (staffLoaded || staffInFlight.current) return;
    staffInFlight.current = true;
    setStaffLoading(true);
    try {
      const list = await fetchAdvanceStaffData();
      setStaffOptions(list);
      setStaffLoaded(true);
    } catch {
      toast.error('Failed to load staff data.');
    } finally {
      staffInFlight.current = false;
      setStaffLoading(false);
    }
  }, [staffLoaded]);

  const staffComboOptions = useMemo((): SearchableComboOption[] => {
    return staffOptions.map((e) => {
      const code = (e.employeeCode ?? '').trim();
      const name = (e.name ?? '').trim();
      const label = code && name ? `${code} — ${name}` : code || name;
      return {
        id: e.id || `${code}|${name}`,
        label,
        description: e.designation || (code && name ? name : undefined),
        searchIndex: `${code} ${name} ${e.designation ?? ''}`.toLowerCase(),
        employeeCode: code,
        employeeName: name,
      };
    });
  }, [staffOptions]);

  useEffect(() => {
    let cancelled = false;
    const flightSerial = String(flight.slNo ?? '').trim();
    if (!flightSerial) {
      setDefaults({});
      setPaxValues(buildEmptyPaxValues());
      setStaffOvertime('');
      return;
    }
    void fetchPsrFlightDetailsByFlightSerial(flightSerial)
      .then((payload) => {
        if (cancelled) return;
        const data = payload.data ?? {};
        const toStr = (k: string) => flightDetailsValueForInput(data[k]);
        setDefaults(
          Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, flightDetailsValueForInput(v)]),
          ),
        );
        setDateOp(toStr('flightDate') || flightDate || '');
        setDateCompiled(toStr('compiledDate') || flightDate || '');
        setTSta(toStr('sta') || timeForHtmlInput(flight.staTime) || '00:00');
        setTEta(toStr('eta') || timeForHtmlInput(flight.staTime) || '00:00');
        setTAta(toStr('ata'));
        setTStd(toStr('std') || timeForHtmlInput(flight.stdTime) || '00:00');
        setTEtd(toStr('etd') || timeForHtmlInput(flight.stdTime) || '00:00');
        setTAtd(toStr('atd'));
        setTGt(toStr('gt'));
        setTAgt(toStr('agt'));
        try {
          setTGroundTime(
            coerceTimeHHmm(toStr('groundTime'), 'groundTime', true) ??
              timeForHtmlInput(toStr('groundTime')),
          );
        } catch {
          setTGroundTime('');
        }
        setDelayMins(toStr('delayMins'));
        setDelayCode(toStr('delayCode'));
        setDelayExtra0(toStr('delayCodeExtra_0'));
        setDelayExtra1(toStr('delayCodeExtra_1'));
        setAcTypePick(toStr('acType') || acType || '');
        setAddCabinDoor(toStr('addCabinDoorClosed'));
        setAddHoldClosed(toStr('addHoldClosed'));
        setAddCrewBoarded(toStr('addCrewBoarded'));
        setStaffOvertime(toStr('staffOvertime'));
        const nextPax = buildEmptyPaxValues();
        for (const row of ['arrivals', 'departures'] as const) {
          for (const col of PAX_COLUMNS) {
            const key = paxFieldKey(row, col);
            nextPax[key] = toStr(key);
          }
        }
        setPaxValues(nextPax);
        setFormSeed((v) => v + 1);
      })
      .catch(() => {
        if (cancelled) return;
        setDefaults({});
        setPaxValues(buildEmptyPaxValues());
        setStaffOvertime('');
      });
    return () => {
      cancelled = true;
    };
  }, [flight.slNo, flight.staTime, flight.stdTime, flightDate, acType]);

  const defaultFor = (key: string, fallback = ''): string => {
    const v = String(defaults[key] ?? '').trim();
    return v || fallback;
  };

  const handleSave: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    const flightSerial = String(flight.slNo ?? '').trim();
    if (!flightSerial) {
      toast.error('Flight serial is missing. Cannot save.');
      return;
    }
    const form = e.currentTarget;
    const fd = new FormData(form);
    const raw: Record<string, unknown> = {};
    for (const [k, v] of fd.entries()) {
      raw[k] = typeof v === 'string' ? v : String(v ?? '');
    }
    for (const [k, v] of Object.entries(paxValues)) {
      raw[k] = v;
    }

    const next: FieldErrors<PaxShiftField> = {};
    const compiledErr = required(String(raw.compiledBy ?? ''), 'Compiled by');
    if (compiledErr) next.compiledBy = compiledErr;
    for (const row of ['arrivals', 'departures'] as const) {
      for (const col of PAX_COLUMNS) {
        const key = paxFieldKey(row, col) as PaxShiftField;
        const err = positiveInteger(String(paxValues[key] ?? ''), `${row} ${col}`);
        if (err) next[key] = err;
      }
    }
    if (applyAndFocus(next)) {
      toast.warning('Please fix the highlighted fields.');
      return;
    }

    let data;
    try {
      data = normalizeFlightDetailsForSave(raw);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Invalid field values.'));
      return;
    }
    setSaving(true);
    try {
      await upsertPsrFlightDetailsForFlight(flightSerial, data, {
        flightSnapshot: flightSnapshotFromFlightData(flight),
      });
      const nextDefaults = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, flightDetailsValueForInput(v)]),
      );
      setDefaults(nextDefaults);
      const nextPax = buildEmptyPaxValues();
      for (const row of ['arrivals', 'departures'] as const) {
        for (const col of PAX_COLUMNS) {
          const key = paxFieldKey(row, col);
          nextPax[key] = nextDefaults[key] ?? '';
        }
      }
      setPaxValues(nextPax);
      toast.success('Flight details saved.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Save failed.'));
    } finally {
      setSaving(false);
    }
  };

  const persistFlightHandlingForPdf = () => {
    const serial = String(flight.slNo ?? '').trim();
    if (!serial) {
      toast.warning('Flight serial is missing; cannot save this form snapshot.');
      return;
    }
    const el = formRef.current;
    if (!el) return;
    const fd = new FormData(el);
    const snapshot: Record<string, string> = {};
    fd.forEach((v, k) => {
      snapshot[k] = typeof v === 'string' ? v : String(v);
    });
    try {
      retainPaxShiftSessionForSerial(serial);
      sessionStorage.setItem(paxShiftFlightHandlingStorageKey(serial), JSON.stringify(snapshot));
      toast.success('Saved for this browser. Included when you download the Pax shift PDF from the report table.');
    } catch {
      toast.error('Could not save form data (storage full or unavailable).');
    }
  };

  return (
    <div className="p-3 pb-28 sm:p-4 md:p-6 md:pb-32 lg:p-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <header className="flex flex-col gap-4 border-b border-slate-200/60 pb-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-emerald-500/90">PAX shift</p>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">Flight handling report</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">
              Schedule fields load from the selected flight; counts, delays, and narrative fields are empty until you
              enter them.
            </p>
          </div>
        </header>

        <form ref={formRef} key={`${flight.slNo}-${formSeed}`} className="space-y-6" noValidate onSubmit={handleSave}>
          <SectionCard
            title="Counters & overtime"
            subtitle="Shift-level notes (optional)."
            icon={ClipboardList}
            className="relative z-20"
          >
            <div className="grid gap-4 overflow-visible sm:grid-cols-2 lg:grid-cols-3">
              <Field id={f('uhCounters')} label="UH-counters">
                <PaxShiftIntegerInput
                  name="uhCounters"
                  className={INPUT_CLASS}
                  placeholder="—"
                  autoComplete="off"
                  defaultValue={defaultFor('uhCounters')}
                />
              </Field>
              <div className="relative z-30 min-w-0">
                <input type="hidden" name="staffOvertime" value={staffOvertime} />
                <SearchableCombobox
                  fieldLabel="Staff at overtime"
                  value={staffOvertime}
                  onChange={setStaffOvertime}
                  options={staffComboOptions}
                  loading={staffLoading}
                  placeholder="Search by employee code or name…"
                  onRequestOptions={loadStaffIfNeeded}
                  matchFromStart
                  className="relative z-30"
                />
                <FormFieldError />
              </div>
              <Field id={f('overtimeReason')} label="Overtime reason" className="sm:col-span-2 lg:col-span-1">
                <Input name="overtimeReason" className={INPUT_CLASS} placeholder="—" autoComplete="off" defaultValue={defaultFor('overtimeReason')} />
              </Field>
            </div>
          </SectionCard>

          <SectionCard
            title="Flight details"
            subtitle="Schedule and movement fields; adjust as operations require."
            icon={Plane}
          >
            <div className="space-y-6">
              <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field id={f('airline')} label="Airline" className="lg:col-span-2">
                  <Input name="airline" className={INPUT_CLASS} defaultValue={defaultFor('airline', flight.airline)} autoComplete="off" />
                </Field>
                <PickerField id={f('flightDate')} label="Date">
                  <input type="hidden" name="flightDate" value={dateOp} />
                  <DatePicker
                    id={f('flightDate')}
                    value={dateOp}
                    onChange={setDateOp}
                    valueFormat="yyyy-MM-dd"
                    placeholder="Select date"
                    className="w-full"
                  />
                </PickerField>
                <Field id={f('flightNo')} label="Flt. No.">
                  <Input name="flightNo" className={INPUT_CLASS} defaultValue={defaultFor('flightNo', flight.flightNo)} autoComplete="off" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 md:grid-cols-6">
                <PickerField id={f('sta')} label="STA">
                  <input type="hidden" name="sta" value={tSta} />
                  <TimeSelect24
                    hourSelectId={f('sta')}
                    value={tSta}
                    onChange={setTSta}
                    className="w-full"
                  />
                </PickerField>
                <PickerField id={f('eta')} label="ETA">
                  <input type="hidden" name="eta" value={tEta} />
                  <TimeSelect24
                    hourSelectId={f('eta')}
                    value={tEta}
                    onChange={setTEta}
                    className="w-full"
                    title="Starts equal to STA; adjust when estimates change"
                  />
                </PickerField>
                <PickerField id={f('ata')} label="ATA">
                  <input type="hidden" name="ata" value={tAta} />
                  <TimeSelect24
                    hourSelectId={f('ata')}
                    value={tAta}
                    onChange={setTAta}
                    allowEmpty
                    className="w-full"
                  />
                </PickerField>
                <PickerField id={f('std')} label="STD">
                  <input type="hidden" name="std" value={tStd} />
                  <TimeSelect24
                    hourSelectId={f('std')}
                    value={tStd}
                    onChange={setTStd}
                    className="w-full"
                  />
                </PickerField>
                <PickerField id={f('etd')} label="ETD">
                  <input type="hidden" name="etd" value={tEtd} />
                  <TimeSelect24
                    hourSelectId={f('etd')}
                    value={tEtd}
                    onChange={setTEtd}
                    className="w-full"
                    title="Starts equal to STD; adjust when estimates change"
                  />
                </PickerField>
                <PickerField id={f('atd')} label="ATD">
                  <input type="hidden" name="atd" value={tAtd} />
                  <TimeSelect24
                    hourSelectId={f('atd')}
                    value={tAtd}
                    onChange={setTAtd}
                    allowEmpty
                    className="w-full"
                  />
                </PickerField>
              </div>

              <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <Field id={f('gate')} label="Gate">
                  <Input
                    name="gate"
                    className={INPUT_CLASS}
                    defaultValue={defaultFor('gate', reporter?.gate ?? '')}
                    placeholder="e.g. A12"
                    autoComplete="off"
                  />
                </Field>
                <Field id={f('acType')} label="A/C type" className="xl:col-span-2">
                  <input type="hidden" name="acType" value={acTypePick} />
                  <AdminRadioDropdown
                    value={acTypePick}
                    onChange={setAcTypePick}
                    options={[{ value: '', label: 'Select type…' }, ...acOptions]}
                    className={SELECT_CLASS}
                    aria-label="A/C type"
                  />
                </Field>
                <PickerField id={f('groundTime')} label="Ground time">
                  <input type="hidden" name="groundTime" value={tGroundTime} />
                  <TimeSelect24
                    hourSelectId={f('groundTime')}
                    value={tGroundTime}
                    onChange={setTGroundTime}
                    allowEmpty
                    className="w-full"
                  />
                </PickerField>
                <Field id={f('version')} label="Version">
                  <Input name="version" className={INPUT_CLASS} placeholder="e.g. C/E/M" autoComplete="off" defaultValue={defaultFor('version')} />
                </Field>
                <Field id={f('seatCap')} label="Seat cap">
                  <Input name="seatCap" className={INPUT_CLASS} placeholder="e.g. 25/21/24" autoComplete="off" defaultValue={defaultFor('seatCap')} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
                <PickerField id={f('gt')} label="GT" className="lg:col-span-2">
                  <input type="hidden" name="gt" value={tGt} />
                  <TimeSelect24
                    hourSelectId={f('gt')}
                    value={tGt}
                    onChange={setTGt}
                    allowEmpty
                    className="w-full"
                  />
                </PickerField>
                <PickerField id={f('agt')} label="AGT" className="lg:col-span-2">
                  <input type="hidden" name="agt" value={tAgt} />
                  <TimeSelect24
                    hourSelectId={f('agt')}
                    value={tAgt}
                    onChange={setTAgt}
                    allowEmpty
                    className="w-full"
                  />
                </PickerField>
                <Field id={f('delayCode')} label="Dly code & desc." className="col-span-2 lg:col-span-6">
                  <input type="hidden" name="delayCode" value={delayCode} />
                  <AdminRadioDropdown
                    value={delayCode}
                    onChange={setDelayCode}
                    options={[{ value: '', label: 'Select delay reason…' }, ...MAIN_DETAILS_DELAY_REASONS]}
                    className={DELAY_SELECT_CLASS}
                    aria-label="Delay reason"
                  />
                </Field>
                <Field
                  id={f('delayMins')}
                  label="Dly mins"
                  className="col-span-2 lg:col-span-2 lg:max-w-[7rem] lg:justify-self-start"
                >
                  <PaxShiftIntegerInput
                    name="delayMins"
                    value={delayMins}
                    onChange={(e) => setDelayMins(e.target.value)}
                    className={INPUT_CLASS}
                    placeholder="—"
                    title="Delay in minutes"
                  />
                </Field>
              </div>

              <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-4 ring-1 ring-emerald-100/80">
                <p className="text-xs font-semibold text-slate-700">Additional delay rows</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Use when more than one delay code applies.</p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                    <Field id={f('delayCodeExtra_0')} label="Extra code 1" className="min-w-0 flex-[2]">
                      <input type="hidden" name="delayCodeExtra_0" value={delayExtra0} />
                      <AdminRadioDropdown
                        value={delayExtra0}
                        onChange={setDelayExtra0}
                        options={[{ value: '', label: 'Select delay reason…' }, ...MAIN_DETAILS_DELAY_REASONS]}
                        className={DELAY_SELECT_CLASS}
                        aria-label="Additional delay reason 1"
                      />
                    </Field>
                    <Field id={f('delayDescExtra_0')} label="Notes 1" className="min-w-[8rem] flex-1">
                      <Input name="delayDescExtra_0" className={INPUT_CLASS} placeholder="Optional notes" />
                    </Field>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                    <Field id={f('delayCodeExtra_1')} label="Extra code 2" className="min-w-0 flex-[2]">
                      <input type="hidden" name="delayCodeExtra_1" value={delayExtra1} />
                      <AdminRadioDropdown
                        value={delayExtra1}
                        onChange={setDelayExtra1}
                        options={[{ value: '', label: 'Select delay reason…' }, ...MAIN_DETAILS_DELAY_REASONS]}
                        className={DELAY_SELECT_CLASS}
                        aria-label="Additional delay reason 2"
                      />
                    </Field>
                    <Field id={f('delayDescExtra_1')} label="Notes 2" className="min-w-[8rem] flex-1">
                      <Input name="delayDescExtra_1" className={INPUT_CLASS} placeholder="Optional notes" />
                    </Field>
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Passenger & baggage statistics"
            subtitle="Hover column headers for full names. Type whole numbers in each cell; saved counts reload when you reopen this flight."
            icon={ClipboardList}
          >
            <ReportsResponsiveTable scrollClassName="rounded-xl border border-emerald-200/80 bg-emerald-50/30 ring-1 ring-emerald-100">
              <table className="w-full min-w-[960px] border-collapse text-sm">
                <caption className="sr-only">
                  Passenger and baggage counts for arrivals and departures by category
                </caption>
                <thead>
                  <tr className="bg-emerald-500 text-left text-white">
                    <th
                      scope="col"
                      className="sticky left-0 z-20 bg-emerald-500 px-3 py-3 text-xs font-semibold uppercase tracking-wide shadow-[4px_0_12px_-2px_rgba(0,0,0,0.35)]"
                    >
                      Info
                    </th>
                    {PAX_COLUMNS.map((c) => (
                      <th
                        key={c}
                        scope="col"
                        title={PAX_COLUMN_HELP[c]}
                        className="whitespace-nowrap px-2 py-3 text-center text-[10px] font-semibold uppercase tracking-wide text-emerald-50 md:text-xs"
                      >
                        <abbr title={PAX_COLUMN_HELP[c]} className="cursor-help no-underline">
                          {c}
                        </abbr>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(['arrivals', 'departures'] as const).map((row, rowIdx) => (
                    <tr
                      key={row}
                      className={cn(
                        'bg-white transition-colors hover:bg-emerald-50/40',
                        rowIdx % 2 === 1 && 'bg-emerald-50/40 hover:bg-emerald-50/60',
                      )}
                    >
                      <th
                        scope="row"
                        className="sticky left-0 z-10 border-r border-slate-200/80 bg-inherit px-3 py-2 text-left text-xs font-semibold capitalize text-slate-800 shadow-[4px_0_12px_-4px_rgba(15,23,42,0.12)]"
                      >
                        {row}
                      </th>
                      {PAX_COLUMNS.map((col, colIdx) => {
                        const key = paxFieldKey(row, col) as PaxShiftField;
                        return (
                          <td
                            key={`${row}-${col}`}
                            className={cn('p-1.5', colIdx % 2 === 1 && 'bg-emerald-50/30')}
                          >
                            <PaxShiftIntegerInput
                              id={`field-${key}`}
                              name={key}
                              value={paxValues[key] ?? ''}
                              onChange={(e) => {
                                setPaxValues((prev) => ({ ...prev, [key]: e.target.value }));
                                clearField(key);
                              }}
                              className={cn(
                                INPUT_CLASS,
                                'h-8 min-w-[2.5rem] text-center text-xs',
                                'border-slate-200/70 bg-white/90 focus-visible:bg-white',
                                errors[key] && FRIS_INVALID_CONTROL,
                              )}
                              aria-label={`${row} ${PAX_COLUMN_HELP[col]}`}
                              aria-invalid={!!errors[key]}
                              placeholder="0"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ReportsResponsiveTable>
          </SectionCard>

          <SectionCard title="Level-4 baggage" subtitle="Security / special handling baggage." icon={ClipboardList}>
            <div className="grid gap-4 lg:grid-cols-6">
              <Field id={f('level4Bags')} label="Level-4 bags" className="lg:col-span-1">
                <PaxShiftIntegerInput name="level4Bags" className={INPUT_CLASS} defaultValue={defaultFor('level4Bags')} />
              </Field>
              <Field id={f('level4BagsDesc')} label="Level-4 bags description" className="lg:col-span-5">
                <Textarea name="level4BagsDesc" className={cn(INPUT_CLASS, 'min-h-[88px] resize-y py-2')} rows={3} defaultValue={defaultFor('level4BagsDesc')} />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Arrival MHB & additional info" icon={ClipboardList}>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-emerald-500">Arrival MHB</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    ['No. of PIR', 'mhbPir'],
                    ['No. of Bag', 'mhbBag1'],
                    ['No. of DPR', 'mhbDpr'],
                    ['No. of Bag', 'mhbBag2'],
                    ['OHD', 'mhbOhd'],
                    ['AOC', 'mhbAoc'],
                    ['Bag Clmc FIG', 'mhbBagClmcFig'],
                    ["Bag short in M'up", 'mhbBagShort'],
                  ].map(([label, name]) => (
                    <Field key={name} id={f(name)} label={label}>
                      <PaxShiftIntegerInput name={name} className={INPUT_CLASS} autoComplete="off" defaultValue={defaultFor(name)} />
                    </Field>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-emerald-500">Additional info</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {(
                    [
                      ['Tele Chk', 'addTeleChk'],
                      ['Web Chk', 'addWebChk'],
                      ['Miles & More', 'addMilesMore'],
                      ['DEPU', 'addDepu'],
                      ['DEPA', 'addDepa'],
                      ['INAD', 'addInad'],
                      ['Off load by IMMIG', 'addOffloadImmig'],
                      ['Gate No Show', 'addGateNoShow'],
                    ] as const
                  ).map(([label, name]) => (
                    <Field key={name} id={f(name)} label={label}>
                      <PaxShiftIntegerInput name={name} className={INPUT_CLASS} autoComplete="off" defaultValue={defaultFor(name)} />
                    </Field>
                  ))}
                  <PickerField id={f('addCabinDoorClosed')} label="Cabin door closed">
                    <input type="hidden" name="addCabinDoorClosed" value={addCabinDoor} />
                    <TimeSelect24
                      hourSelectId={f('addCabinDoorClosed')}
                      value={addCabinDoor}
                      onChange={setAddCabinDoor}
                      allowEmpty
                      className="w-full"
                    />
                  </PickerField>
                  <PickerField id={f('addHoldClosed')} label="Hold closed">
                    <input type="hidden" name="addHoldClosed" value={addHoldClosed} />
                    <TimeSelect24
                      hourSelectId={f('addHoldClosed')}
                      value={addHoldClosed}
                      onChange={setAddHoldClosed}
                      allowEmpty
                      className="w-full"
                    />
                  </PickerField>
                  <PickerField id={f('addCrewBoarded')} label="Crew boarded at">
                    <input type="hidden" name="addCrewBoarded" value={addCrewBoarded} />
                    <TimeSelect24
                      hourSelectId={f('addCrewBoarded')}
                      value={addCrewBoarded}
                      onChange={setAddCrewBoarded}
                      allowEmpty
                      className="w-full"
                    />
                  </PickerField>
                  <Field id={f('addCussCheckin')} label="CUSS check-in">
                    <PaxShiftIntegerInput name="addCussCheckin" className={INPUT_CLASS} autoComplete="off" defaultValue={defaultFor('addCussCheckin')} />
                  </Field>
                </div>
              </div>
            </div>
          </SectionCard>

          <AccentFormSection title="Brief description of flight handling" titleId={f('handling-heading')}>
            <Field id={f('handlingDescription')} label="Narrative">
              <Textarea
                name="handlingDescription"
                className={cn(INPUT_CLASS, 'min-h-[128px] resize-y py-2.5')}
                placeholder="Operational summary, issues resolved, handover notes…"
                rows={5}
                defaultValue={defaultFor('handlingDescription')}
              />
            </Field>
          </AccentFormSection>

          <AccentFormSection title="Report compiled by" titleId={f('compiled-heading')}>
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field id="field-compiledBy" label="Compiled by" error={errors.compiledBy}>
                    <Input
                      name="compiledBy"
                      className={cn(INPUT_CLASS, errors.compiledBy && FRIS_INVALID_CONTROL)}
                      defaultValue={defaultFor('compiledBy', reporter?.name ?? '')}
                      placeholder="Name"
                      autoComplete="name"
                      aria-invalid={!!errors.compiledBy}
                      aria-describedby={errors.compiledBy ? 'field-compiledBy-error' : undefined}
                      onChange={() => clearField('compiledBy')}
                    />
                </Field>
                <Field id={f('designation')} label="Designation">
                  <Input
                    name="designation"
                    className={INPUT_CLASS}
                    defaultValue={defaultFor('designation', reporter?.designation ?? '')}
                    placeholder="Role / title"
                    autoComplete="organization-title"
                  />
                </Field>
                <PickerField id={f('compiledDate')} label="Date">
                  <input type="hidden" name="compiledDate" value={dateCompiled} />
                  <DatePicker
                    id={f('compiledDate')}
                    value={dateCompiled}
                    onChange={setDateCompiled}
                    valueFormat="yyyy-MM-dd"
                    placeholder="Select date"
                    className="w-full"
                  />
                </PickerField>
              </div>
              <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-5">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-white shadow-md shadow-emerald-500/20 transition-colors hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 active:bg-emerald-700"
                >
                  <Save className="h-4 w-4" aria-hidden />
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-300/90 bg-emerald-50 px-5 text-sm font-semibold text-emerald-500 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 active:bg-emerald-100"
                >
                  <Mail className="h-4 w-4" aria-hidden />
                  Report or send email
                </button>
              </div>
            </div>
          </AccentFormSection>
        </form>
      </div>
    </div>
  );
}
