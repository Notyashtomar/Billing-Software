'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  dateRange,
  flightNumber,
  maxLength,
  normalizeText,
  required,
  runValidators,
  sanitizeFlightNoInput,
  time24,
  validDate,
  type FieldErrors,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { cn } from '@/lib/utils';
import { advanceDocId, fetchCargoReferenceAirlines, fetchCargoReferenceAircraft, fetchDailyScheduledFromAdvance, toLocalYmd } from '@/lib/api';
import {
  buildCargoFlightPipelinePayload,
  saveAdvanceCargoFlight,
} from '@/lib/advance-cargo';
import { ymdToDdMmYyyy } from '@/components/fris/reports/rampShiftTime';
import { processFlightData } from '@/utils/dataProcessor';
import { sameDayStaNotBeforeStd } from '@/components/fris/advance/scheduleSetupShared';
import { CargoDatePicker } from './CargoDatePicker';
import { TimeSelect24 } from '@/components/ui/TimeSelect24';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { useAdvanceCargo } from './AdvanceCargoContext';
import { cargoInputClass, CARGO_DATE_INVALID_CLASS } from './cargoFormStyles';

const FIELD_ORDER = [
  'airlineId',
  'flightNo',
  'route',
  'staDate',
  'staTime',
  'stdDate',
  'stdTime',
] as const;
type CargoFlightField = (typeof FIELD_ORDER)[number];

function mapCargoFlightApiError(msg: string): CargoFlightField {
  const lower = msg.toLowerCase();
  if (
    lower.includes('flight') ||
    lower.includes('duplicate') ||
    lower.includes('serial') ||
    lower.includes('schedule')
  ) {
    return 'flightNo';
  }
  return 'airlineId';
}

type AirlineOption = {
  id: string;
  name: string;
  code: string;
};

type AircraftOption = {
  type: string;
  body: 'NB' | 'WB';
};

type FlightTableRow = {
  serialNo: string;
  airline: string;
  flightNo: string;
  staDate: string;
  stdTime: string;
};

function buildAircraftOptions(list: Record<string, unknown>[]): AircraftOption[] {
  const seen = new Set<string>();
  const out: AircraftOption[] = [];
  for (const doc of list) {
    const d = advanceDocId(doc);
    const type = String(d.aircraft ?? '').trim();
    if (!type) continue;
    const key = type.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type, body: d.aircraftBody === 'WB' ? 'WB' : 'NB' });
  }
  out.sort((a, b) => a.type.localeCompare(b.type));
  return out;
}

export default function CargoFlightCreationForm() {
  const { requireEntryKey, refresh, record } = useAdvanceCargo();
  const [mode, setMode] = useState<'additional' | 'scheduled'>('additional');
  const [airlines, setAirlines] = useState<AirlineOption[]>([]);
  const [aircraftOptions, setAircraftOptions] = useState<AircraftOption[]>([]);
  const [loadingAirlines, setLoadingAirlines] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableRows, setTableRows] = useState<FlightTableRow[]>([]);
  const today = useMemo(() => toLocalYmd(new Date()), []);

  const { errors, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<CargoFlightField>(FIELD_ORDER);

  const [form, setForm] = useState({
    airlineId: '',
    airlineCode: '',
    flightNo: '',
    route: '',
    aircraft: '',
    aircraftBody: 'NB',
    handling: '',
    flightCategory: '',
    staDate: today,
    staTime: '',
    stdDate: today,
    stdTime: '',
  });

  const loadMasterData = useCallback(async () => {
    setLoadingAirlines(true);
    try {
      const [airlineRows, aircraftRows] = await Promise.all([
        fetchCargoReferenceAirlines(),
        fetchCargoReferenceAircraft(),
      ]);
      const mappedAirlines = (airlineRows as Record<string, unknown>[])
        .map((doc) => {
          const d = advanceDocId(doc);
          return {
            id: d.id,
            name: String(d.name ?? d.airlineName ?? d.airline ?? '').trim(),
            code: String(d.code ?? d.airlineCode ?? d.airline_code ?? '').trim(),
          };
        })
        .filter((row) => row.name || row.code);
      setAirlines(mappedAirlines);
      setAircraftOptions(buildAircraftOptions(aircraftRows as Record<string, unknown>[]));
    } catch {
      setAirlines([]);
      setAircraftOptions([]);
    } finally {
      setLoadingAirlines(false);
    }
  }, []);

  const loadFlightTable = useCallback(async () => {
    const entryKey = requireEntryKey();
    if (!entryKey) {
      setTableRows([]);
      return;
    }
    const dateDd = ymdToDdMmYyyy(form.staDate || today);
    setTableLoading(true);
    try {
      const raw = await fetchDailyScheduledFromAdvance(dateDd, dateDd);
      const flights = processFlightData(Array.isArray(raw) ? raw : []);
      const rows: FlightTableRow[] = flights
        .filter((f) => {
          const src = String(f.scheduleSource ?? '').toLowerCase();
          if (!src.includes('advance_cargo')) return false;
          return String(f.airlineCode ?? '').trim().toUpperCase() === entryKey;
        })
        .map((f) => ({
          serialNo: String(f.slNo ?? '').trim(),
          airline: String(f.airline ?? '').trim(),
          flightNo: String(f.flightNo ?? '').trim(),
          staDate: String(f.staDate ?? '').trim() || dateDd,
          stdTime: String(f.stdTime ?? '').trim(),
        }));
      setTableRows(rows);
    } catch {
      setTableRows([]);
    } finally {
      setTableLoading(false);
    }
  }, [requireEntryKey, form.staDate, today]);

  useEffect(() => {
    loadMasterData();
  }, [loadMasterData]);

  useEffect(() => {
    void loadFlightTable();
  }, [loadFlightTable]);

  useEffect(() => {
    const key = requireEntryKey();
    if (key) {
      setForm((prev) => ({ ...prev, airlineCode: key }));
    }
  }, [requireEntryKey, record]);

  const handleModeChange = (next: 'additional' | 'scheduled') => {
    setMode(next);
    if (next === 'scheduled') {
      (['route', 'staTime', 'stdTime'] as const).forEach((key) => clearField(key));
    }
  };

  const handleAirlineChange = (airlineId: string) => {
    const selected = airlines.find((a) => a.id === airlineId);
    setForm((prev) => ({
      ...prev,
      airlineId,
      airlineCode: selected?.code ?? prev.airlineCode,
    }));
    clearField('airlineId');
  };

  const handleAircraftChange = (value: string) => {
    const selected = aircraftOptions.find((a) => a.type === value);
    setForm((prev) => ({
      ...prev,
      aircraft: value,
      aircraftBody: selected?.body ?? prev.aircraftBody,
    }));
  };

  const resolveAirlineName = (): string => {
    const selected = airlines.find((a) => a.id === form.airlineId);
    if (selected?.name) return selected.name;
    const saved = record?.sections?.cargoAirline as Record<string, unknown> | undefined;
    return String(saved?.airlineName ?? '').trim();
  };

  const handleSaveAdditional = async () => {
    const entryKey = requireEntryKey() ?? form.airlineCode.trim().toUpperCase();
    const airlineName = resolveAirlineName();
    const staDate = form.staDate.trim();
    const stdDate = form.stdDate.trim();
    const staTimeVal = form.staTime.trim() || '00:00';
    const stdTimeVal = form.stdTime.trim() || '00:00';

    const next: FieldErrors<CargoFlightField> = {};
    if (!entryKey) {
      next.airlineId = 'Save Create New Cargo Airline first (airline code).';
    } else if (!airlineName) {
      next.airlineId = 'Select an airline.';
    }
    const flightNoErr = runValidators(
      required(form.flightNo, 'Flight number'),
      flightNumber(form.flightNo),
    );
    if (flightNoErr) next.flightNo = flightNoErr;
    const routeErr = maxLength(form.route, 100, 'Route');
    if (routeErr) next.route = routeErr;
    const staDateReq = required(staDate, 'STA Date');
    if (staDateReq) {
      next.staDate = staDateReq;
    } else {
      const staDateErr = validDate(staDate, 'STA Date');
      if (staDateErr) next.staDate = staDateErr;
    }
    const stdDateErr = validDate(stdDate, 'STD Date');
    if (stdDateErr) next.stdDate = stdDateErr;
    if (!next.staDate && !next.stdDate && staDate && stdDate) {
      const rangeErr = dateRange(staDate, stdDate, 'STA Date', 'STD Date');
      if (rangeErr) next.stdDate = rangeErr;
    }
    const staTimeErr = time24(staTimeVal, 'STA Time');
    if (staTimeErr) next.staTime = staTimeErr;
    const stdTimeErr = time24(stdTimeVal, 'STD Time');
    if (stdTimeErr) next.stdTime = stdTimeErr;
    if (!next.staTime && !next.stdTime) {
      const departsNextDay = Boolean(staDate && stdDate && stdDate > staDate);
      const orderErr = sameDayStaNotBeforeStd(staTimeVal, stdTimeVal, departsNextDay);
      if (orderErr) {
        next.stdTime =
          'STA time must be earlier than STD time unless the flight departs the next day.';
      }
    }
    if (applyAndFocus(next)) {
      if (next.stdTime) toast.error(next.stdTime);
      return;
    }

    const flightNo = normalizeText(form.flightNo).toUpperCase().replace(/\s/g, '');
    const route = normalizeText(form.route);
    const sectionData = {
      ...form,
      flightNo,
      route,
      mode: 'additional',
      airlineName,
      airlineCode: entryKey,
    };
    const validYmd = form.staDate || today;
    const flightPayload = buildCargoFlightPipelinePayload({
      airlineName,
      airlineCode: entryKey!,
      flightNo,
      aircraft: form.aircraft,
      aircraftBody: form.aircraftBody,
      staTime: form.staTime || '00:00',
      stdTime: form.stdTime || '00:00',
      validFromYmd: validYmd,
      validToYmd: form.stdDate || validYmd,
      route,
      handling: form.handling,
      flightCategory: form.flightCategory,
      scheduleDays: {},
    });

    setSaving(true);
    try {
      const result = await saveAdvanceCargoFlight({
        entryKey,
        section: 'flightCreation',
        data: sectionData,
        flightPayload,
      });
      await refresh();
      void loadFlightTable();
      toast.success(`Flight created (serial ${result.serialNo}).`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setFieldError(mapCargoFlightApiError(msg), msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDynamicCreate = async () => {
    const entryKey = requireEntryKey();
    const scheduled = record?.sections?.cargoScheduled as Record<string, unknown> | undefined;
    const fromYmd = form.staDate.trim();
    const tillYmd = form.stdDate.trim();

    const next: FieldErrors<CargoFlightField> = {};
    if (!entryKey) {
      next.airlineId = 'Save Create New Cargo Airline first (airline code).';
    }
    if (!scheduled?.flightNo) {
      next.flightNo = 'Save Create New Scheduled first (master schedule).';
    }
    const fromReq = required(fromYmd, 'From Date');
    if (fromReq) {
      next.staDate = fromReq;
    } else {
      const fromErr = validDate(fromYmd, 'From Date');
      if (fromErr) next.staDate = fromErr;
    }
    const tillReq = required(tillYmd, 'Till Date');
    if (tillReq) {
      next.stdDate = tillReq;
    } else {
      const tillErr = validDate(tillYmd, 'Till Date');
      if (tillErr) next.stdDate = tillErr;
    }
    if (!next.staDate && !next.stdDate && fromYmd && tillYmd) {
      const rangeErr = dateRange(fromYmd, tillYmd, 'From Date', 'Till Date');
      if (rangeErr) next.stdDate = rangeErr;
    }
    if (applyAndFocus(next)) return;

    const airlineName = String(scheduled?.airlineName ?? resolveAirlineName()).trim();
    if (!airlineName) {
      toast.error('Airline name missing on cargo scheduled section.');
      return;
    }

    const fromYmdPayload = fromYmd || today;
    const tillYmdPayload = tillYmd || fromYmdPayload;
    const sectionData = {
      mode: 'scheduled',
      fromDate: fromYmdPayload,
      tillDate: tillYmdPayload,
      sourceSchedule: scheduled,
    };
    const flightPayload = buildCargoFlightPipelinePayload({
      airlineName,
      airlineCode: entryKey!,
      flightNo: String(scheduled!.flightNo ?? ''),
      aircraft: String(scheduled!.aircraft ?? ''),
      aircraftBody: String(scheduled!.aircraftBody ?? 'NB'),
      staTime: String(scheduled!.sta ?? '00:00'),
      stdTime: String(scheduled!.std ?? '00:00'),
      validFromYmd: String(scheduled!.validFrom ?? fromYmdPayload),
      validToYmd: String(scheduled!.validTill ?? tillYmdPayload),
      route: String(scheduled!.route ?? ''),
      handling: String(scheduled!.handling ?? ''),
      category: String(scheduled!.category ?? ''),
      nextDay: String(scheduled!.nextDay ?? ''),
      scheduleDays:
        (scheduled!.operateOn as Record<string, boolean> | undefined) ?? {},
      flightCategory: String(scheduled!.category ?? ''),
    });

    setSaving(true);
    try {
      const result = await saveAdvanceCargoFlight({
        entryKey: entryKey!,
        section: 'flightCreation',
        data: sectionData,
        flightPayload,
      });
      await refresh();
      void loadFlightTable();
      toast.success(
        `Dynamic cargo flights indexed (${result.fhrStaDatesCount ?? 0} day(s), serial ${result.serialNo}).`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Dynamic create failed';
      setFieldError(mapCargoFlightApiError(msg), msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50/50 overflow-visible">
      <div className="p-5 space-y-5">
        <div className="flex flex-wrap items-center gap-6">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="cargo-flight-mode"
              checked={mode === 'additional'}
              onChange={() => handleModeChange('additional')}
              className="text-emerald-600 focus:outline-none focus:ring-emerald-500"
            />
            <span className="text-sm font-semibold text-gray-800">Create Additional Flight</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="cargo-flight-mode"
              checked={mode === 'scheduled'}
              onChange={() => handleModeChange('scheduled')}
              className="text-emerald-600 focus:outline-none focus:ring-emerald-500"
            />
            <span className="text-sm font-semibold text-gray-800">Create Scheduled Flight</span>
          </label>
        </div>

        {mode === 'additional' && (
          <>
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="field-airlineId">
                  Airline
                </label>
                <AdminRadioDropdown
                  id="field-airlineId"
                  value={form.airlineId}
                  onChange={(v) => handleAirlineChange(v)}
                  options={[
                    { value: '', label: loadingAirlines ? 'Loading airlines...' : 'Select airline' },
                    ...airlines.map((a) => ({ value: a.id, label: a.name })),
                  ]}
                  aria-invalid={!!errors.airlineId}
                  aria-describedby={errors.airlineId ? 'field-airlineId-error' : undefined}
                  disabled={saving}
                  className={cargoInputClass(!!errors.airlineId)}
                />
                <FormFieldError id="field-airlineId-error" message={errors.airlineId} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Airline Code</label>
                <input
                  type="text"
                  value={form.airlineCode || requireEntryKey() || ''}
                  readOnly
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-100 text-gray-900 text-sm"
                />
                <FormFieldError />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="field-flightNo">
                  Flight No
                </label>
                <input
                  id="field-flightNo"
                  name="flightNo"
                  type="text"
                  value={form.flightNo}
                  aria-invalid={!!errors.flightNo}
                  aria-describedby={errors.flightNo ? 'field-flightNo-error' : undefined}
                  disabled={saving}
                  onChange={(e) => {
                    const flightNo = sanitizeFlightNoInput(e.target.value);
                    setForm((prev) => ({ ...prev, flightNo }));
                    clearField('flightNo');
                  }}
                  className={cargoInputClass(!!errors.flightNo)}
                  maxLength={33}
                />
                <FormFieldError id="field-flightNo-error" message={errors.flightNo} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="field-route">
                  Route
                </label>
                <input
                  id="field-route"
                  name="route"
                  type="text"
                  value={form.route}
                  aria-invalid={!!errors.route}
                  aria-describedby={errors.route ? 'field-route-error' : undefined}
                  disabled={saving}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, route: e.target.value }));
                    clearField('route');
                  }}
                  className={cargoInputClass(!!errors.route)}
                />
                <FormFieldError id="field-route-error" message={errors.route} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Aircraft</label>
                <AdminRadioDropdown
                  value={form.aircraft}
                  onChange={(v) => handleAircraftChange(v)}
                  options={[
                    { value: '', label: 'Select aircraft' },
                    ...aircraftOptions.map((option) => ({ value: option.type, label: option.type })),
                  ]}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <FormFieldError />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Aircraft Body</label>
                <input
                  type="text"
                  value={form.aircraftBody}
                  readOnly
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-100 text-gray-900 text-sm"
                />
                <FormFieldError />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Handling</label>
                <AdminRadioDropdown
                  value={form.handling}
                  onChange={(v) => setForm((prev) => ({ ...prev, handling: v }))}
                  options={[
                    { value: '', label: 'Select handling' },
                    { value: 'self', label: 'Self' },
                    { value: 'bird', label: 'Bird Group' },
                    { value: 'third-party', label: 'Third Party' },
                  ]}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <FormFieldError />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Flight Category</label>
                <AdminRadioDropdown
                  value={form.flightCategory}
                  onChange={(v) => setForm((prev) => ({ ...prev, flightCategory: v }))}
                  options={[
                    { value: '', label: 'Select category' },
                    { value: 'international', label: 'International' },
                    { value: 'domestic', label: 'Domestic' },
                    { value: 'international-cargo', label: 'International-Cargo' },
                    { value: 'domestic-cargo', label: 'Domestic-Cargo' },
                  ]}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <FormFieldError />
              </div>

              <div className={cn(errors.staDate && CARGO_DATE_INVALID_CLASS)}>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="field-staDate">
                  STA Date
                </label>
                <CargoDatePicker
                  id="field-staDate"
                  value={form.staDate}
                  onChange={(value) => {
                    setForm((prev) => ({ ...prev, staDate: value }));
                    clearField('staDate');
                    clearField('stdDate');
                    clearField('stdTime');
                  }}
                  valueFormat="yyyy-MM-dd"
                  disabled={saving}
                />
                <FormFieldError id="field-staDate-error" message={errors.staDate} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">STA Time</label>
                <TimeSelect24
                  value={form.staTime || '00:00'}
                  onChange={(value) => {
                    setForm((prev) => ({ ...prev, staTime: value }));
                    clearField('staTime');
                    clearField('stdTime');
                  }}
                  className={cn('w-full', errors.staTime && '[&_button]:!border-red-500 [&_button]:!ring-2 [&_button]:!ring-red-200')}
                  disabled={saving}
                />
                <FormFieldError id="field-staTime-error" message={errors.staTime} />
              </div>
              <div className={cn(errors.stdDate && CARGO_DATE_INVALID_CLASS)}>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="field-stdDate">
                  STD Date
                </label>
                <CargoDatePicker
                  id="field-stdDate"
                  value={form.stdDate}
                  onChange={(value) => {
                    setForm((prev) => ({ ...prev, stdDate: value }));
                    clearField('stdDate');
                    clearField('stdTime');
                  }}
                  valueFormat="yyyy-MM-dd"
                  disabled={saving}
                />
                <FormFieldError id="field-stdDate-error" message={errors.stdDate} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">STD Time</label>
                <TimeSelect24
                  value={form.stdTime || '00:00'}
                  onChange={(value) => {
                    setForm((prev) => ({ ...prev, stdTime: value }));
                    clearField('stdTime');
                  }}
                  className={cn('w-full', errors.stdTime && '[&_button]:!border-red-500 [&_button]:!ring-2 [&_button]:!ring-red-200')}
                  disabled={saving}
                />
                <FormFieldError id="field-stdTime-error" message={errors.stdTime} />
              </div>
            </div>

            <div className="flex justify-end">
              <motion.button
                type="button"
                onClick={() => void handleSaveAdditional()}
                disabled={saving}
                aria-busy={saving}
                whileHover={{ scale: saving ? 1 : 1.02 }}
                whileTap={{ scale: saving ? 1 : 0.98 }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm text-white bg-amber-500 hover:bg-amber-600 shadow-md shadow-amber-500/25 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                ) : (
                  <Save className="w-4 h-4" aria-hidden />
                )}
                {saving ? 'Saving…' : 'Save'}
              </motion.button>
            </div>
          </>
        )}

        {mode === 'scheduled' && (
          <div className="space-y-4">
            {(errors.airlineId || errors.flightNo) && (
              <div className="space-y-1">
                <FormFieldError id="field-airlineId-error" message={errors.airlineId} />
                <FormFieldError id="field-flightNo-error" message={errors.flightNo} />
              </div>
            )}
            <div className="flex flex-wrap items-start gap-3">
              <div className={cn(errors.staDate && CARGO_DATE_INVALID_CLASS)}>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="field-staDate">
                  From Date
                </label>
                <CargoDatePicker
                  id="field-staDate"
                  value={form.staDate}
                  onChange={(value) => {
                    setForm((prev) => ({ ...prev, staDate: value }));
                    clearField('staDate');
                    clearField('stdDate');
                  }}
                  valueFormat="yyyy-MM-dd"
                  className="min-w-[220px]"
                  disabled={saving}
                />
                <FormFieldError id="field-staDate-error" message={errors.staDate} />
              </div>
              <div className={cn(errors.stdDate && CARGO_DATE_INVALID_CLASS)}>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="field-stdDate">
                  Till Date
                </label>
                <CargoDatePicker
                  id="field-stdDate"
                  value={form.stdDate}
                  onChange={(value) => {
                    setForm((prev) => ({ ...prev, stdDate: value }));
                    clearField('stdDate');
                  }}
                  valueFormat="yyyy-MM-dd"
                  className="min-w-[220px]"
                  disabled={saving}
                />
                <FormFieldError id="field-stdDate-error" message={errors.stdDate} />
              </div>
              <div className="flex items-end pb-[1.125rem]">
                <motion.button
                  type="button"
                  onClick={() => void handleDynamicCreate()}
                  disabled={saving}
                  aria-busy={saving}
                  whileHover={{ scale: saving ? 1 : 1.02 }}
                  whileTap={{ scale: saving ? 1 : 0.98 }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-white bg-amber-500 hover:bg-amber-600 shadow-md shadow-amber-500/25 disabled:opacity-60"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                  {saving ? 'Creating…' : 'Dynamic Create Cargo Section 5 Flight'}
                </motion.button>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-blue-300 bg-white overflow-x-auto">
          {tableLoading ? (
            <p className="px-3 py-2 text-sm text-gray-600">Loading flights…</p>
          ) : tableRows.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-600">There is no record found</p>
          ) : (
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60">
                  <th className="px-3 py-2 font-semibold text-gray-700">Serial</th>
                  <th className="px-3 py-2 font-semibold text-gray-700">Airline</th>
                  <th className="px-3 py-2 font-semibold text-gray-700">Flight No</th>
                  <th className="px-3 py-2 font-semibold text-gray-700">STA Date</th>
                  <th className="px-3 py-2 font-semibold text-gray-700">STD Time</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr key={`${row.serialNo}-${row.staDate}`} className="border-b border-gray-100">
                    <td className="px-3 py-2">{row.serialNo}</td>
                    <td className="px-3 py-2">{row.airline}</td>
                    <td className="px-3 py-2">{row.flightNo}</td>
                    <td className="px-3 py-2">{row.staDate}</td>
                    <td className="px-3 py-2">{row.stdTime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
