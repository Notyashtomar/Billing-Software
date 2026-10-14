'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
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
  trimValue,
  validDate,
  type FieldErrors,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { advanceDocId, fetchCargoReferenceAirlines, fetchDailyScheduledFromAdvance, toLocalYmd } from '@/lib/api';
import {
  buildCargoFlightPipelinePayload,
  normalizeCargoScheduleDays,
  saveAdvanceCargoFlight,
} from '@/lib/advance-cargo';
import { ymdToDdMmYyyy } from '@/components/fris/reports/rampShiftTime';
import { processFlightData } from '@/utils/dataProcessor';
import { CargoDatePicker } from './CargoDatePicker';
import { TimeSelect24 } from '@/components/ui/TimeSelect24';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { sameDayStaNotBeforeStd } from '@/components/fris/advance/scheduleSetupShared';
import { useAdvanceCargo } from './AdvanceCargoContext';
import {
  CARGO_CHECKBOX_CLASS,
  CARGO_DATE_INVALID_CLASS,
  CARGO_FORM_GRID_3_COL,
  CARGO_HANDLING_OPTIONS,
  CARGO_INPUT_CLASS,
  cargoInputClass,
} from './cargoFormStyles';

type AirlineOption = {
  id: string;
  name: string;
  code: string;
};

type ScheduledFlightRow = {
  serialNo: string;
  airline: string;
  flightNo: string;
  staDate: string;
  stdTime: string;
};

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const FIELD_ORDER = [
  'airlineId',
  'flightNo',
  'sta',
  'std',
  'route',
  'operateOn',
  'validFrom',
  'validTill',
] as const;

type CargoScheduledField = (typeof FIELD_ORDER)[number];

export default function CargoScheduledForm() {
  const { requireEntryKey, refresh, record } = useAdvanceCargo();
  const { errors, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<CargoScheduledField>(FIELD_ORDER);
  const [airlines, setAirlines] = useState<AirlineOption[]>([]);
  const [loadingAirlines, setLoadingAirlines] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableRows, setTableRows] = useState<ScheduledFlightRow[]>([]);
  const today = useMemo(() => toLocalYmd(new Date()), []);

  const [form, setForm] = useState({
    airlineId: '',
    airlineCode: '',
    category: '',
    flightNo: '',
    aircraft: '',
    aircraftBody: 'NB',
    sta: '',
    std: '',
    route: '',
    handling: '',
    nextDay: '',
    operateOn: {
      Mon: false,
      Tue: false,
      Wed: false,
      Thu: false,
      Fri: false,
      Sat: false,
      Sun: false,
    },
    validFrom: '',
    validTill: '',
    autoCreation: false,
    filterAirline: '',
    scheduledOnDate: today,
  });

  const loadAirlines = useCallback(async () => {
    setLoadingAirlines(true);
    try {
      const rows = (await fetchCargoReferenceAirlines()) as Record<string, unknown>[];
      const mapped = rows
        .map((doc) => {
          const d = advanceDocId(doc);
          const name = String(d.name ?? d.airlineName ?? d.airline ?? '').trim();
          const code = String(d.code ?? d.airlineCode ?? d.airline_code ?? '').trim();
          return { id: d.id, name, code };
        })
        .filter((row) => row.name || row.code);
      setAirlines(mapped);
    } catch {
      setAirlines([]);
    } finally {
      setLoadingAirlines(false);
    }
  }, []);

  const loadScheduledTable = useCallback(async () => {
    const dateYmd = form.scheduledOnDate?.trim();
    if (!dateYmd) {
      setTableRows([]);
      return;
    }
    const dateDd = ymdToDdMmYyyy(dateYmd);
    setTableLoading(true);
    try {
      const raw = await fetchDailyScheduledFromAdvance(dateDd, dateDd);
      const flights = processFlightData(Array.isArray(raw) ? raw : []);
      const entryCode = requireEntryKey();
      const filterId = form.filterAirline.trim();
      const filterAirline = airlines.find((a) => a.id === filterId);

      const rows: ScheduledFlightRow[] = flights
        .filter((f) => {
          const src = String(f.scheduleSource ?? '').toLowerCase();
          if (!src.includes('advance_cargo')) return false;
          if (filterAirline?.name) {
            return String(f.airline ?? '').trim() === filterAirline.name;
          }
          if (entryCode && String(f.airlineCode ?? '').trim().toUpperCase() !== entryCode) {
            return false;
          }
          const status = String(f.flightStatus ?? 'open').trim().toLowerCase();
          return status !== 'closed' && status !== 'cancelled' && status !== 'canceled';
        })
        .map((f) => ({
          serialNo: String(f.slNo ?? '').trim(),
          airline: String(f.airline ?? '').trim(),
          flightNo: String(f.flightNo ?? '').trim(),
          staDate: String(f.staDate ?? '').trim() || dateDd,
          stdTime: String(f.stdTime ?? '').trim(),
        }));
      setTableRows(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load scheduled flights');
      setTableRows([]);
    } finally {
      setTableLoading(false);
    }
  }, [form.scheduledOnDate, form.filterAirline, airlines, requireEntryKey]);

  useEffect(() => {
    loadAirlines();
  }, [loadAirlines]);

  useEffect(() => {
    void loadScheduledTable();
  }, [loadScheduledTable]);

  useEffect(() => {
    const saved = record?.sections?.cargoScheduled as Record<string, unknown> | undefined;
    if (!saved || typeof saved !== 'object') return;
    const operateOn = { ...form.operateOn };
    const rawDays = saved.operateOn as Record<string, boolean> | undefined;
    if (rawDays) {
      for (const day of WEEK_DAYS) {
        operateOn[day] = rawDays[day] === true;
      }
    }
    setForm((prev) => ({
      ...prev,
      airlineCode: String(saved.airlineCode ?? prev.airlineCode),
      category: String(saved.category ?? ''),
      flightNo: String(saved.flightNo ?? ''),
      aircraft: String(saved.aircraft ?? ''),
      aircraftBody: String(saved.aircraftBody ?? prev.aircraftBody),
      sta: String(saved.sta ?? ''),
      std: String(saved.std ?? ''),
      route: String(saved.route ?? ''),
      handling: String(saved.handling ?? ''),
      nextDay: String(saved.nextDay ?? ''),
      operateOn,
      validFrom: String(saved.validFrom ?? ''),
      validTill: String(saved.validTill ?? ''),
      autoCreation: saved.autoCreation === true,
    }));
  }, [record]);

  const handleAirlineSelect = (airlineId: string) => {
    const selected = airlines.find((a) => a.id === airlineId);
    setForm((prev) => ({
      ...prev,
      airlineId,
      airlineCode: selected?.code ?? '',
    }));
    clearField('airlineId');
  };

  const validateForm = (): FieldErrors<CargoScheduledField> => {
    const next: FieldErrors<CargoScheduledField> = {};
    const entryKey = requireEntryKey() ?? form.airlineCode.trim().toUpperCase();
    const selected = airlines.find((a) => a.id === form.airlineId);
    const airlineName =
      selected?.name ||
      String((record?.sections?.cargoAirline as Record<string, unknown>)?.airlineName ?? '');

    if (!entryKey) {
      next.airlineId = 'Save Create New Cargo Airline first (airline code).';
    } else if (!form.airlineId.trim() || !airlineName) {
      next.airlineId = 'Select an airline.';
    }

    const flightNo = normalizeText(form.flightNo).toUpperCase().replace(/\s/g, '');
    const flightNoErr = runValidators(
      required(flightNo, 'Flight number'),
      flightNumber(flightNo),
    );
    if (flightNoErr) next.flightNo = flightNoErr;

    const sta = trimValue(form.sta) || '00:00';
    const std = trimValue(form.std) || '00:00';
    const staErr = time24(sta, 'STA time');
    if (staErr) next.sta = staErr;
    const stdErr = time24(std, 'STD time');
    if (stdErr) next.std = stdErr;
    if (!next.sta && !next.std) {
      const nextDayRaw = form.nextDay.trim().toLowerCase();
      const nextDay = nextDayRaw === 'yes' || nextDayRaw === 'true' || nextDayRaw === '1';
      const orderErr = sameDayStaNotBeforeStd(sta, std, nextDay);
      if (orderErr) next.std = orderErr;
    }

    const route = normalizeText(form.route);
    if (route) {
      const routeErr =
        maxLength(route, 100, 'Route') ||
        (/^[A-Za-z]+(?:-[A-Za-z]+)*$/.test(route)
          ? null
          : 'Route may only contain letters and hyphens.');
      if (routeErr) next.route = routeErr;
    }

    if (!WEEK_DAYS.some((day) => form.operateOn[day])) {
      next.operateOn = 'Select at least one operating day.';
    }

    const validFromErr = runValidators(
      required(form.validFrom, 'Valid From'),
      validDate(form.validFrom, 'Valid From'),
    );
    if (validFromErr) next.validFrom = validFromErr;

    const validTillErr = runValidators(
      required(form.validTill, 'Valid Till'),
      validDate(form.validTill, 'Valid Till'),
    );
    if (validTillErr) next.validTill = validTillErr;

    if (form.validFrom.trim() && form.validTill.trim()) {
      const rangeErr = dateRange(form.validFrom, form.validTill, 'Valid From', 'Valid Till');
      if (rangeErr) next.validTill = rangeErr;
    }

    return next;
  };

  const handleSave = async () => {
    const next = validateForm();
    if (applyAndFocus(next)) {
      const entryKey = requireEntryKey() ?? form.airlineCode.trim().toUpperCase();
      if (!entryKey) {
        toast.error('Save Create New Cargo Airline first (airline code).');
      } else if (next.route) {
        toast.error(next.route);
      } else if (next.std) {
        toast.error(next.std);
      }
      return;
    }

    const entryKey = requireEntryKey() ?? form.airlineCode.trim().toUpperCase();
    const selected = airlines.find((a) => a.id === form.airlineId);
    const airlineName =
      selected?.name ||
      String((record?.sections?.cargoAirline as Record<string, unknown>)?.airlineName ?? '');

    const flightNo = normalizeText(form.flightNo).toUpperCase().replace(/\s/g, '');
    const route = normalizeText(form.route);

    const sectionData = { ...form, flightNo, route, airlineName, airlineCode: entryKey };
    const flightPayload = buildCargoFlightPipelinePayload({
      airlineName,
      airlineCode: entryKey!,
      flightNo,
      aircraft: form.aircraft,
      aircraftBody: form.aircraftBody,
      staTime: form.sta || '00:00',
      stdTime: form.std || '00:00',
      validFromYmd: form.validFrom,
      validToYmd: form.validTill,
      route,
      handling: form.handling,
      category: form.category,
      nextDay: form.nextDay,
      scheduleDays: normalizeCargoScheduleDays(form.operateOn),
    });

    setSaving(true);
    try {
      const result = await saveAdvanceCargoFlight({
        entryKey,
        section: 'cargoScheduled',
        data: sectionData,
        flightPayload,
      });
      await refresh();
      void loadScheduledTable();
      if ((result.fhrStaDatesCount ?? 0) === 0) {
        toast.warning(
          'Schedule saved, but no operating days were indexed. Check Valid From/Till and Operate On.',
        );
      } else {
        toast.success(
          `Cargo schedule saved (serial ${result.serialNo}, ${result.fhrStaDatesCount} day(s) indexed).`,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setFieldError('flightNo', msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50/50 overflow-visible">
      <div className="space-y-5 p-4">
        <div className={CARGO_FORM_GRID_3_COL}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="field-airlineId">
              Airline
            </label>
            <AdminRadioDropdown
              id="field-airlineId"
              value={form.airlineId}
              onChange={(v) => handleAirlineSelect(v)}
              options={[
                { value: '', label: loadingAirlines ? 'Loading airlines...' : 'Select airline' },
                ...airlines.map((a) => ({ value: a.id, label: a.name })),
              ]}
              aria-invalid={!!errors.airlineId}
              aria-describedby={errors.airlineId ? 'field-airlineId-error' : undefined}
              className={cargoInputClass(!!errors.airlineId)}
              disabled={saving}
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
              placeholder="Auto from airline"
            />
            <FormFieldError />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <AdminRadioDropdown
              value={form.category}
              onChange={(v) => setForm((prev) => ({ ...prev, category: v }))}
              options={[
                { value: '', label: 'Select category' },
                { value: 'cargo', label: 'Cargo' },
                { value: 'mail', label: 'Mail' },
                { value: 'mixed', label: 'Mixed' },
              ]}
              className={CARGO_INPUT_CLASS}
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
              onChange={(e) => {
                const flightNo = sanitizeFlightNoInput(e.target.value);
                setForm((prev) => ({ ...prev, flightNo }));
                clearField('flightNo');
              }}
              onBlur={() => {
                const flightNo = normalizeText(form.flightNo).toUpperCase().replace(/\s/g, '');
                setFieldError(
                  'flightNo',
                  runValidators(required(flightNo, 'Flight number'), flightNumber(flightNo)),
                );
              }}
              className={cargoInputClass(!!errors.flightNo)}
              maxLength={33}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              disabled={saving}
            />
            <FormFieldError id="field-flightNo-error" message={errors.flightNo} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Aircraft</label>
            <input
              type="text"
              value={form.aircraft}
              onChange={(e) => setForm((prev) => ({ ...prev, aircraft: e.target.value }))}
              className={CARGO_INPUT_CLASS}
            />
            <FormFieldError />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Aircraft Body</label>
            <input
              type="text"
              value={form.aircraftBody}
              onChange={(e) => setForm((prev) => ({ ...prev, aircraftBody: e.target.value }))}
              className={CARGO_INPUT_CLASS}
            />
            <FormFieldError />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="field-sta">
              STA
            </label>
            <TimeSelect24
              hourSelectId="field-sta"
              value={form.sta || '00:00'}
              onChange={(value) => {
                setForm((prev) => ({ ...prev, sta: value }));
                clearField('sta');
                clearField('std');
              }}
              className={cn('w-full', errors.sta && 'border-red-500 ring-2 ring-red-200')}
              disabled={saving}
            />
            <FormFieldError id="field-sta-error" message={errors.sta} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="field-std">
              STD
            </label>
            <TimeSelect24
              hourSelectId="field-std"
              value={form.std || '00:00'}
              onChange={(value) => {
                setForm((prev) => ({ ...prev, std: value }));
                clearField('std');
              }}
              className={cn('w-full', errors.std && 'border-red-500 ring-2 ring-red-200')}
              disabled={saving}
            />
            <FormFieldError id="field-std-error" message={errors.std} />
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
              onChange={(e) => {
                const raw = e.target.value;
                const route = raw.replace(/[^A-Za-z-]/g, '');
                setForm((prev) => ({ ...prev, route }));
                clearField('route');
                if (route !== raw) {
                  setFieldError('route', 'Route may only contain letters and hyphens.');
                }
              }}
              className={cargoInputClass(!!errors.route)}
              disabled={saving}
            />
            <FormFieldError id="field-route-error" message={errors.route} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Handling</label>
            <AdminRadioDropdown
              value={form.handling}
              onChange={(v) => setForm((prev) => ({ ...prev, handling: v }))}
              options={[
                { value: '', label: 'Select handling' },
                ...CARGO_HANDLING_OPTIONS.map((option) => ({ value: option, label: option })),
              ]}
              className={CARGO_INPUT_CLASS}
            />
            <FormFieldError />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Next Day</label>
            <AdminRadioDropdown
              value={form.nextDay}
              onChange={(v) => {
                setForm((prev) => ({ ...prev, nextDay: v }));
                clearField('std');
              }}
              options={[
                { value: '', label: 'Select' },
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ]}
              className={CARGO_INPUT_CLASS}
            />
            <FormFieldError />
          </div>

          <div className="md:col-span-2 lg:col-span-3">
            <p className="text-sm font-medium text-rose-500 mb-2" id="field-operateOn-label">
              Operate On
            </p>
            <div
              id="field-operateOn"
              role="group"
              aria-labelledby="field-operateOn-label"
              aria-invalid={!!errors.operateOn}
              aria-describedby={errors.operateOn ? 'field-operateOn-error' : undefined}
              tabIndex={-1}
              className={cn(
                'flex flex-wrap gap-4 rounded-lg p-0.5',
                errors.operateOn && 'ring-2 ring-red-200',
              )}
            >
              {WEEK_DAYS.map((day) => (
                <label key={day} className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.operateOn[day]}
                    onChange={(e) => {
                      setForm((prev) => ({
                        ...prev,
                        operateOn: {
                          ...prev.operateOn,
                          [day]: e.target.checked,
                        },
                      }));
                      clearField('operateOn');
                    }}
                    className={CARGO_CHECKBOX_CLASS}
                    disabled={saving}
                  />
                  <span className="text-sm text-gray-700">{day}</span>
                </label>
              ))}
            </div>
            <FormFieldError id="field-operateOn-error" message={errors.operateOn} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="field-validFrom">
              Valid From
            </label>
            <div className={cn(errors.validFrom && CARGO_DATE_INVALID_CLASS)}>
              <CargoDatePicker
                id="field-validFrom"
                value={form.validFrom}
                onChange={(value) => {
                  setForm((prev) => ({ ...prev, validFrom: value }));
                  clearField('validFrom');
                  clearField('validTill');
                }}
                valueFormat="yyyy-MM-dd"
                placeholder="Select valid from date"
                disabled={saving}
              />
            </div>
            <FormFieldError id="field-validFrom-error" message={errors.validFrom} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="field-validTill">
              Valid Till
            </label>
            <div className={cn(errors.validTill && CARGO_DATE_INVALID_CLASS)}>
              <CargoDatePicker
                id="field-validTill"
                value={form.validTill}
                onChange={(value) => {
                  setForm((prev) => ({ ...prev, validTill: value }));
                  clearField('validTill');
                }}
                valueFormat="yyyy-MM-dd"
                placeholder="Select valid till date"
                disabled={saving}
              />
            </div>
            <FormFieldError id="field-validTill-error" message={errors.validTill} />
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-2 md:col-span-2 lg:col-span-3">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.autoCreation}
                onChange={(e) => setForm((prev) => ({ ...prev, autoCreation: e.target.checked }))}
                className={CARGO_CHECKBOX_CLASS}
              />
              <span className="text-sm text-gray-700">Auto Creation</span>
            </label>

            <motion.button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              aria-busy={saving}
              whileHover={saving ? undefined : { scale: 1.02 }}
              whileTap={saving ? undefined : { scale: 0.98 }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm text-white bg-amber-500 hover:bg-amber-600 shadow-md shadow-amber-500/25 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
              ) : (
                <Save className="w-4 h-4" aria-hidden />
              )}
              {saving ? 'Saving…' : 'Save'}
            </motion.button>
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-3 pt-1 lg:grid-cols-[1fr_1fr_auto]">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter with Airline</label>
            <AdminRadioDropdown
              value={form.filterAirline}
              onChange={(v) => setForm((prev) => ({ ...prev, filterAirline: v }))}
              options={[
                { value: '', label: 'All' },
                ...airlines.map((a) => ({ value: a.id, label: a.name })),
              ]}
              className={CARGO_INPUT_CLASS}
            />
            <FormFieldError />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled as on Date of filtered Airline</label>
            <CargoDatePicker
              value={form.scheduledOnDate}
              onChange={(value) => setForm((prev) => ({ ...prev, scheduledOnDate: value }))}
              valueFormat="yyyy-MM-dd"
              placeholder="Select schedule date"
            />
            <FormFieldError />
          </div>

          <div className="flex items-end pb-[1.125rem]">
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full lg:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
            >
              <Download className="w-4 h-4" />
              Export To Excel
            </motion.button>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/60">
                <th className="px-4 py-3 font-semibold text-gray-700">Serial</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Airline</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Flight No</th>
                <th className="px-4 py-3 font-semibold text-gray-700">STA Date</th>
                <th className="px-4 py-3 font-semibold text-gray-700">STD Time</th>
              </tr>
            </thead>
            <tbody>
              {tableLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    Loading scheduled flights…
                  </td>
                </tr>
              ) : tableRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No cargo scheduled flights for this date.
                  </td>
                </tr>
              ) : (
                tableRows.map((row) => (
                  <tr key={`${row.serialNo}-${row.staDate}`} className="border-b border-gray-100">
                    <td className="px-4 py-3">{row.serialNo}</td>
                    <td className="px-4 py-3">{row.airline}</td>
                    <td className="px-4 py-3">{row.flightNo}</td>
                    <td className="px-4 py-3">{row.staDate}</td>
                    <td className="px-4 py-3">{row.stdTime}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
