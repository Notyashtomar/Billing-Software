'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Search, Save, FileUp, Zap, AlertCircle, ChevronDown, Loader2 } from 'lucide-react';
import { CreationFlightsTableDateRange } from '@/components/fris/creation/CreationFlightsTableDateRange';
import { defaultTableDateRange } from '@/components/fris/creation/creationTableDateRange';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { DatePicker } from '@/components/ui/DatePicker';
import { TimeSelect24 } from '@/components/ui/TimeSelect24';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import {
  fetchCreationReferenceAirlines,
  fetchCreationReferenceAircraft,
  fetchCreationReferenceFlights,
  advanceDocId,
  fetchDailyScheduledFromAdvance,
  findAdvanceScheduleByFlight,
  findScheduledFlightBySerial,
  type FindAdvanceScheduleResult,
  type FindScheduledFlightBySerialResult,
  saveScheduledAirlinesCreation,
} from '@/lib/api';
import { ScrollToError } from '@/components/ui/form-error-alert';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  creationFlightNumber,
  flightRouting,
  normalizeText,
  required,
  runValidators,
  time24,
  aircraftBody,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  CREATION_INVALID_CONTROL,
  CREATION_INVALID_PICKER_WRAP,
  mapCreationApiErrorToField,
  SCHEDULED_AIRLINES_FIELD_ORDER,
  validateScheduledAirlinesForm,
  type ScheduledAirlinesField,
} from '@/lib/form-validation/creation';
import { cn } from '@/lib/utils';
import { displayFlightNoFromScheduleData } from '@/lib/schedule-flight-no-display';
import {
  displayScheduledAirlinesTableSerial,
  nsFormSerialForFlight,
  processFlightData,
  type FlightData,
} from '@/utils/dataProcessor';

type AdvanceAirlineOption = {
  id: string;
  name: string;
  code: string;
};

type AdvanceAircraftOption = {
  type: string;
  body: 'NB' | 'WB';
};

function toAirlineOption(doc: Record<string, unknown>): AdvanceAirlineOption {
  const d = advanceDocId(doc);
  return {
    id: d.id,
    name: String(d.name ?? '').trim(),
    code: String(d.code ?? '').trim(),
  };
}

function buildAircraftOptions(list: Record<string, unknown>[]): AdvanceAircraftOption[] {
  const seen = new Set<string>();
  const out: AdvanceAircraftOption[] = [];
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

const OPS_TYPE_OPTIONS = [
  'Turnaround',
  'Transit',
  'Technical',
  'Originate',
  'Terminate',
  'Ferry In/Ferry Out',
  'Load In/Ferry Out',
  'Ramp Handling Only',
];

const SKD_NON_SKD_OPTIONS = ['Scheduled', 'Non-Scheduled'];

const CATEGORY_OPTIONS = [
  'International',
  'Domestic',
  'International BME',
  'Domestic BME',
  'International-Cargo',
  'Domestic-Cargo',
  'International-Domestic',
  'Domestic-International',
];

export interface FlightCreatedRow {
  id: string;
  serialNo: string;
  persistSerial: string;
  airline: string;
  flightNo: string;
  stdTime: string;
  stdDate: string;
  cateOfFlight: string;
}

function formatDisplayDate(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function pickString(...vals: unknown[]): string {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

function normalizeTimeToHHmm(t: string): string {
  if (!t.trim()) return '';
  const normalized = t.trim().replace(/\./g, ':');
  const parts = normalized.split(':').map((p) => p.trim());
  if (parts.length >= 2) {
    const h = parts[0].padStart(2, '0').slice(0, 2);
    const m = parts[1].padStart(2, '0').slice(0, 2);
    return `${h}:${m}`;
  }
  return '';
}

function createRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `row-${crypto.randomUUID()}`;
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createDefaultFormData(today = new Date()): ScheduledAirlinesFormState {
  return {
    airlines: '',
    acType: '0',
    routing: '',
    staTime: '00:00',
    staDate: formatDisplayDate(today),
    aBody: 'NB',
    stdTime: '00:00',
    stdDate: formatDisplayDate(today),
    opsType: 'Turnaround',
    skdNonSkd: 'Scheduled',
    categoryOfFlight: 'International',
    airlineCode: '',
    flightNo: '',
  };
}

function formatBlockedFlightStatus(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'closed') return 'closed';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
  return status.trim() || 'closed or cancelled';
}

type ScheduledAirlinesFormState = {
  airlines: string;
  acType: string;
  routing: string;
  staTime: string;
  staDate: string;
  aBody: string;
  stdTime: string;
  stdDate: string;
  opsType: string;
  skdNonSkd: string;
  categoryOfFlight: string;
  airlineCode: string;
  flightNo: string;
};

function scheduleTimeToMinutes(t: string): number {
  const normalized = normalizeTimeToHHmm(t);
  const m = /^(\d{2}):(\d{2})$/.exec(normalized);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

function parseDisplayDateToDate(dateStr: string): Date | null {
  const raw = String(dateStr ?? '').trim();
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return dt;
  }
  const parts = raw.split(/[/-]/).map((p) => p.trim());
  if (parts.length === 3 && parts[2]?.length === 4) {
    const d = Number(parts[0]);
    const m = Number(parts[1]);
    const y = Number(parts[2]);
    if (!d || !m || !y) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return dt;
  }
  return null;
}

function addCalendarDays(date: Date, days: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

function scheduleDateTimeMs(dateStr: string, timeStr: string): number | null {
  const date = parseDisplayDateToDate(dateStr);
  if (!date) return null;
  return date.getTime() + scheduleTimeToMinutes(timeStr) * 60 * 1000;
}

/** STD must not be before STA when date and time are combined. */
function validateStaStdSchedule(input: {
  staDate: string;
  staTime: string;
  stdDate: string;
  stdTime: string;
}): string | null {
  const staMs = scheduleDateTimeMs(input.staDate, input.staTime);
  const stdMs = scheduleDateTimeMs(input.stdDate, input.stdTime);
  if (staMs == null || stdMs == null) {
    return 'STA and STD dates must be valid.';
  }
  if (stdMs >= staMs) return null;

  const sta = parseDisplayDateToDate(input.staDate);
  const std = parseDisplayDateToDate(input.stdDate);
  const staMins = scheduleTimeToMinutes(input.staTime);
  const stdMins = scheduleTimeToMinutes(input.stdTime);

  if (
    sta &&
    std &&
    sta.getTime() === std.getTime() &&
    staMins > 0 &&
    stdMins > 0 &&
    stdMins < staMins
  ) {
    const suggested = formatDisplayDate(addCalendarDays(sta, 1));
    return `STD must be after STA. With STA ${input.staDate} ${input.staTime} and STD time ${input.stdTime}, use STD date ${suggested} or later.`;
  }

  return 'STD date and time must be on or after STA date and time.';
}

/** Match Scheduled Airlines daily table STD date rules on the client. */
function resolveStdDateForForm(
  staDate: string,
  staTime: string,
  stdTime: string,
  fallbackStd: string,
): string {
  const sta = parseDisplayDateToDate(staDate);
  if (!sta) return fallbackStd || staDate;

  const staMins = scheduleTimeToMinutes(staTime);
  const stdMins = scheduleTimeToMinutes(stdTime);
  const fallbackNorm = parseDisplayDateToDate(fallbackStd);

  if (staMins > 0 && stdMins > 0) {
    if (
      fallbackNorm &&
      scheduleDateTimeMs(fallbackStd, stdTime) != null &&
      scheduleDateTimeMs(fallbackStd, stdTime)! >= scheduleDateTimeMs(staDate, staTime)!
    ) {
      return formatDisplayDate(fallbackNorm);
    }
    if (stdMins >= staMins) {
      return formatDisplayDate(sta);
    }
    return formatDisplayDate(addCalendarDays(sta, 1));
  }

  if (fallbackNorm && fallbackNorm.getTime() >= sta.getTime()) {
    return formatDisplayDate(fallbackNorm);
  }
  return formatDisplayDate(sta);
}

function composeFlightNoFromSchedule(schedule: Record<string, unknown>): string {
  return displayFlightNoFromScheduleData(schedule);
}

function scheduleToFormPatch(
  schedule: Record<string, unknown>,
  prev: ScheduledAirlinesFormState,
): ScheduledAirlinesFormState {
  const staDate = pickString(
    schedule.staDate,
    schedule['STA Date'],
    schedule.STADate,
    schedule['Valid From'],
  );
  const staTime = normalizeTimeToHHmm(
    pickString(
      schedule.staTime,
      schedule['STA Time'],
      schedule.STATime,
      schedule.sta,
      schedule.STA,
    ),
  );
  const stdTime = normalizeTimeToHHmm(
    pickString(
      schedule.stdTime,
      schedule['STD Time'],
      schedule.STDTime,
      schedule.std,
      schedule.STD,
    ),
  );
  const stdDateFallback = pickString(
    schedule.stdDate,
    schedule['STD Date'],
    schedule.STDDate,
  );
  const stdDate = resolveStdDateForForm(
    staDate,
    staTime || prev.staTime,
    stdTime || prev.stdTime,
    stdDateFallback,
  );
  const flightNo = composeFlightNoFromSchedule(schedule) || prev.flightNo;
  return {
    ...prev,
    airlines: pickString(
      schedule.airlines,
      schedule.Airline,
      schedule.airline,
      prev.airlines,
    ),
    acType: pickString(
      schedule.acType,
      schedule.Aircraft,
      schedule.TypeCraft,
      schedule.aircraft,
      prev.acType,
    ),
    routing: pickString(schedule.Routing, schedule.route, schedule.routing, prev.routing),
    staTime: staTime || prev.staTime,
    staDate: staDate || prev.staDate,
    aBody: pickString(schedule.aBody, schedule['Aircraft Body'], schedule.aircraftBody, prev.aBody),
    stdTime: stdTime || prev.stdTime,
    stdDate: stdDate || prev.stdDate,
    opsType: pickString(
      schedule.opsType,
      schedule['Type of Handling'],
      schedule.typeOfHandling,
      prev.opsType,
    ),
    skdNonSkd: pickString(schedule.skdNonSkd, schedule['Skd/Non Skd'], prev.skdNonSkd),
    categoryOfFlight: pickString(
      schedule.categoryOfFlight,
      schedule['Flight Type'],
      schedule.flightType,
      schedule.flight,
      schedule['Type of flight'],
      prev.categoryOfFlight,
    ),
    airlineCode: pickString(schedule.airlineCode, schedule['Airline Code'], prev.airlineCode),
    flightNo,
  };
}

function dailyFlightToTableRow(f: FlightData, scheduleSerial: string): FlightCreatedRow {
  const persistSerial = nsFormSerialForFlight(f) || String(f.slNo ?? '').trim();
  const displaySerial = displayScheduledAirlinesTableSerial({
    slNo: f.slNo,
    legacySlNo: f.legacySlNo,
  });
  return {
    id: createRowId(),
    serialNo: displaySerial || persistSerial || scheduleSerial,
    // Prefer generated instance serial for daily override saves.
    persistSerial: persistSerial || displaySerial || scheduleSerial,
    airline: String(f.airline ?? '').trim(),
    flightNo: String(f.flightNo ?? '').trim(),
    stdTime: normalizeTimeToHHmm(String(f.stdTime ?? '')) || '00:00',
    stdDate:
      String(f.stdDate ?? '').trim() ||
      String(f.staDate ?? '').trim(),
    cateOfFlight:
      String(f.cateOfFlight ?? '').trim() ||
      String(f.flightType ?? '').trim() ||
      '—',
  };
}

function flightMatchesSerialCandidates(f: FlightData, serials: string[]): boolean {
  const sl = String(f.slNo ?? '').trim();
  const leg = String(f.legacySlNo ?? '').trim();
  const op = nsFormSerialForFlight(f);
  const normalized = new Set(
    serials.map((s) => s.trim()).filter(Boolean),
  );
  return [sl, leg, op].some((s) => normalized.has(s));
}

function openFlightMatchToTableRow(
  serialNo: string,
  schedule: Record<string, unknown>,
): FlightCreatedRow {
  const staDate = pickString(
    schedule.staDate,
    schedule['STA Date'],
    schedule.date,
  );
  const staTime = normalizeTimeToHHmm(
    pickString(schedule.staTime, schedule['STA Time'], '00:00'),
  );
  const stdTime = normalizeTimeToHHmm(
    pickString(schedule.stdTime, schedule['STD Time'], '00:00'),
  );
  const stdDate = resolveStdDateForForm(
    staDate,
    staTime,
    stdTime,
    pickString(schedule.stdDate, schedule['STD Date'], schedule.date2, staDate),
  );
  return {
    id: createRowId(),
    serialNo,
    persistSerial: serialNo,
    airline: pickString(schedule.airlines, schedule.Airline, schedule.airline),
    flightNo: pickString(schedule.flightNo, schedule['Flight No']),
    stdTime: stdTime || '00:00',
    stdDate,
    cateOfFlight: pickString(
      schedule.categoryOfFlight,
      schedule['Flight Type'],
      schedule['Type of flight'],
      '—',
    ),
  };
}

export default function ScheduledAirlinesForm() {
  const today = new Date();
  const [airlineOptions, setAirlineOptions] = useState<AdvanceAirlineOption[]>([]);
  const [airlinesLoading, setAirlinesLoading] = useState(true);
  const [flightOptions, setFlightOptions] = useState<string[]>([]);
  const [flightsLoading, setFlightsLoading] = useState(false);
  const [aircraftOptions, setAircraftOptions] = useState<AdvanceAircraftOption[]>([]);
  const [aircraftLoading, setAircraftLoading] = useState(true);
  const [serialInput, setSerialInput] = useState('');
  const [persistSerial, setPersistSerial] = useState('');
  const [scheduleMasterSerial, setScheduleMasterSerial] = useState('');
  const [operationDateLabel, setOperationDateLabel] = useState('');
  const [lastModifiedLabel, setLastModifiedLabel] = useState('');
  const [modifiedByLabel, setModifiedByLabel] = useState('');
  const [isAdditionalFlight, setIsAdditionalFlight] = useState(false);
  const [formEditable, setFormEditable] = useState(true);
  const [blockedFind, setBlockedFind] = useState<{ serial: string; status: string } | null>(
    null,
  );
  const [finding, setFinding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [formData, setFormData] = useState<ScheduledAirlinesFormState>(() =>
    createDefaultFormData(today),
  );
  const [tableRows, setTableRows] = useState<FlightCreatedRow[]>([]);
  const [findFilterActive, setFindFilterActive] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [dynamicCreationOpen, setDynamicCreationOpen] = useState(false);
  const [tableFromDate, setTableFromDate] = useState(() => defaultTableDateRange(today).fromDate);
  const [tableToDate, setTableToDate] = useState(() => defaultTableDateRange(today).toDate);
  const existingRow = tableRows.find(
    (r) => (r.persistSerial || r.serialNo) === persistSerial.trim(),
  );
  const airlineDropdownOptions = useMemo(
    () => airlineOptions.map((a) => ({ value: a.name, label: a.name || a.code })),
    [airlineOptions],
  );
  const flightDropdownOptions = useMemo(() => {
    const opts = flightOptions.map((fn) => ({ value: fn, label: fn }));
    const current = formData.flightNo.trim();
    if (
      current &&
      !flightOptions.some((fn) => fn.toUpperCase() === current.toUpperCase())
    ) {
      opts.unshift({ value: current, label: current });
    }
    return opts;
  }, [flightOptions, formData.flightNo]);
  const aircraftDropdownOptions = useMemo(
    () => aircraftOptions.map((a) => ({ value: a.type, label: a.type })),
    [aircraftOptions],
  );

  const loadAirlines = useCallback(async () => {
    setAirlinesLoading(true);
    try {
      const list = (await fetchCreationReferenceAirlines()) as Record<string, unknown>[];
      const opts = list
        .map(toAirlineOption)
        .filter((x) => x.id && (x.name || x.code))
        .sort((a, b) => a.name.localeCompare(b.name));
      setAirlineOptions(opts);
    } catch (e) {
      setAirlineOptions([]);
      toast.error(e instanceof Error ? e.message : 'Failed to load airlines');
    } finally {
      setAirlinesLoading(false);
    }
  }, []);

  const loadFlightsForAirline = useCallback(
    async (airlineName: string, airlineCode: string) => {
      if (!airlineName.trim()) {
        setFlightOptions([]);
        return;
      }
      setFlightsLoading(true);
      try {
        const rows = await fetchCreationReferenceFlights({
          airline: airlineName.trim(),
          airlineCode: airlineCode.trim() || undefined,
        });
        setFlightOptions(rows.map((r) => r.flightNo).filter(Boolean));
      } catch (e) {
        setFlightOptions([]);
        toast.error(e instanceof Error ? e.message : 'Failed to load flights');
      } finally {
        setFlightsLoading(false);
      }
    },
    [],
  );

  const loadAircraft = useCallback(async () => {
    setAircraftLoading(true);
    try {
      const list = (await fetchCreationReferenceAircraft()) as Record<string, unknown>[];
      setAircraftOptions(buildAircraftOptions(list));
    } catch (e) {
      setAircraftOptions([]);
      toast.error(e instanceof Error ? e.message : 'Failed to load aircraft types');
    } finally {
      setAircraftLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAirlines();
    loadAircraft();
  }, [loadAirlines, loadAircraft]);

  useEffect(() => {
    if (!formData.airlines.trim()) return;
    const selected = airlineOptions.find((a) => a.name === formData.airlines);
    if (!selected) return;
    if (formData.airlineCode !== selected.code) {
      setFormData((prev) => ({ ...prev, airlineCode: selected.code }));
    }
  }, [airlineOptions, formData.airlines, formData.airlineCode]);

  useEffect(() => {
    if (!formData.airlines.trim()) {
      setFlightOptions([]);
      return;
    }
    void loadFlightsForAirline(formData.airlines, formData.airlineCode);
  }, [formData.airlines, formData.airlineCode, loadFlightsForAirline]);

  const { errors, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<ScheduledAirlinesField>(SCHEDULED_AIRLINES_FIELD_ORDER);

  const handleInputChange = useCallback(
    (field: string, value: string) => {
      if (field === 'staDate' || field === 'stdDate') {
        setFindFilterActive(false);
      }
      setFormData((prev) => ({ ...prev, [field]: value }));
      setSaveError(null);
      if ((SCHEDULED_AIRLINES_FIELD_ORDER as readonly string[]).includes(field)) {
        clearField(field as ScheduledAirlinesField);
      }
    },
    [clearField],
  );

  /** STA date editable for daily ops override; bump STD date if it falls before STA. */
  const handleStaDateChange = useCallback(
    (value: string) => {
      setFindFilterActive(false);
      setFormData((prev) => {
        let stdDate = prev.stdDate;
        const sta = parseDisplayDateToDate(value);
        const std = parseDisplayDateToDate(stdDate);
        if (sta && std && std.getTime() < sta.getTime()) {
          stdDate = value;
        }
        return { ...prev, staDate: value, stdDate };
      });
      setSaveError(null);
      clearField('staDate');
      clearField('stdDate');
      setOperationDateLabel(value);
    },
    [clearField],
  );

  const handleStdDateChange = useCallback(
    (value: string) => {
      setFindFilterActive(false);
      setFormData((prev) => ({ ...prev, stdDate: value }));
      setSaveError(null);
      clearField('stdDate');
    },
    [clearField],
  );

  const clearOverrideMeta = useCallback(() => {
    setScheduleMasterSerial('');
    setOperationDateLabel('');
    setLastModifiedLabel('');
    setModifiedByLabel('');
    setIsAdditionalFlight(false);
  }, []);

  const applyOverrideMeta = useCallback(
    (meta: {
      scheduleMasterSerial?: string;
      operationDate?: string;
      lastModified?: string;
      modifiedBy?: string;
      scheduleSource?: string;
      schedule?: Record<string, unknown>;
    }) => {
      const master = pickString(
        meta.scheduleMasterSerial,
        meta.schedule?.scheduleMasterSerial,
        meta.schedule?.scheduleId,
      );
      const opDate = pickString(
        meta.operationDate,
        meta.schedule?.operationDate,
        meta.schedule?.staDate,
        meta.schedule?.['STA Date'],
      );
      setScheduleMasterSerial(master);
      setOperationDateLabel(opDate);
      setLastModifiedLabel(
        meta.lastModified
          ? new Date(meta.lastModified).toLocaleString()
          : '',
      );
      setModifiedByLabel(pickString(meta.modifiedBy));
      const src = pickString(
        meta.scheduleSource,
        meta.schedule?.scheduleSource,
      );
      setIsAdditionalFlight(
        src.includes('creation_additional_flights') ||
          master.startsWith('ADD|') ||
          meta.schedule?.isAdditionalFlight === true ||
          pickString(meta.schedule?.flightType, meta.schedule?.skdNonSkd)
            .toLowerCase() === 'additional',
      );
    },
    [],
  );

  const hydrateFormFromDailyTable = useCallback(
    async (opts: {
      serialCandidates: string[];
      scheduleSerial: string;
      airline: string;
      flightNo: string;
      dateHints?: string[];
    }): Promise<boolean> => {
      const serials = opts.serialCandidates.map((s) => s.trim()).filter(Boolean);
      const dateHints = Array.from(
        new Set(
          (opts.dateHints ?? [])
            .map((d) => d.trim())
            .filter(Boolean),
        ),
      );
      if (dateHints.length === 0) {
        dateHints.push(formatDisplayDate(new Date()));
      }

      for (const dateDdMmYyyy of dateHints) {
        try {
          const raw = await fetchDailyScheduledFromAdvance(dateDdMmYyyy, dateDdMmYyyy);
          const flights = processFlightData(Array.isArray(raw) ? raw : []);
          const match = flights.find((f) => {
            if (serials.length > 0 && flightMatchesSerialCandidates(f, serials)) {
              return true;
            }
            if (opts.airline && opts.flightNo) {
              return (
                String(f.airline ?? '').trim() === opts.airline &&
                String(f.flightNo ?? '').trim() === opts.flightNo
              );
            }
            return false;
          });
          if (!match) continue;

          const tableStaDate = String(match.staDate ?? '').trim();
          const tableStdDate =
            String(match.stdDate ?? '').trim() ||
            String(match.staDate ?? '').trim();
          setFormData((prev) => ({
            ...prev,
            airlines: String(match.airline ?? prev.airlines).trim() || prev.airlines,
            flightNo:
              composeFlightNoFromSchedule({
                flightNo: match.flightNo,
                ArrivalFltNo: (match as { arrivalFltNo?: string }).arrivalFltNo,
                DepartureFltNo: (match as { departureFltNo?: string }).departureFltNo,
              }) ||
              String(match.flightNo ?? prev.flightNo).trim() ||
              prev.flightNo,
            acType: String(match.aircraft ?? prev.acType).trim() || prev.acType,
            staDate: tableStaDate || prev.staDate,
            stdDate: tableStdDate || prev.stdDate,
            staTime:
              normalizeTimeToHHmm(String(match.staTime ?? '')) || prev.staTime,
            stdTime:
              normalizeTimeToHHmm(String(match.stdTime ?? '')) || prev.stdTime,
            categoryOfFlight:
              String(match.cateOfFlight ?? match.flightType ?? prev.categoryOfFlight).trim() ||
              prev.categoryOfFlight,
          }));
          setTableRows([
            dailyFlightToTableRow(match, opts.scheduleSerial),
          ]);
          return true;
        } catch {
          // try next date hint
        }
      }
      return false;
    },
    [],
  );

  const loadCreatedFlightsForRange = useCallback(async (fromDate: string, toDate: string) => {
    if (!fromDate?.trim() || !toDate?.trim()) {
      setTableRows([]);
      return;
    }
    setTableLoading(true);
    try {
      const raw = await fetchDailyScheduledFromAdvance(fromDate, toDate);
      const flights = processFlightData(Array.isArray(raw) ? raw : []);
      const rows: FlightCreatedRow[] = flights
        .filter((f) => {
          const status = String(f.flightStatus ?? 'open').trim().toLowerCase();
          return status !== 'closed' && status !== 'cancelled' && status !== 'canceled';
        })
        .map((f) => {
          const persistSerial = nsFormSerialForFlight(f) || String(f.slNo ?? '').trim();
          const displaySerial = displayScheduledAirlinesTableSerial({
            slNo: f.slNo,
            legacySlNo: f.legacySlNo,
          });
          return {
            id: createRowId(),
            serialNo: displaySerial || persistSerial || '',
            persistSerial: persistSerial || displaySerial || '',
            airline: String(f.airline ?? '').trim(),
            flightNo: String(f.flightNo ?? '').trim(),
            stdTime: normalizeTimeToHHmm(String(f.stdTime ?? '')) || '00:00',
            stdDate:
              String(f.stdDate ?? '').trim() ||
              String(f.staDate ?? '').trim() ||
              fromDate,
            cateOfFlight:
              String(f.cateOfFlight ?? '').trim() ||
              String(f.flightType ?? '').trim() ||
              '—',
          };
        });
      setTableRows(rows);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to load created flights.');
      setTableRows([]);
    } finally {
      setTableLoading(false);
    }
  }, []);

  useEffect(() => {
    if (findFilterActive) return;
    void loadCreatedFlightsForRange(tableFromDate, tableToDate);
  }, [findFilterActive, tableFromDate, tableToDate, loadCreatedFlightsForRange]);

  const applyFindBySerialResult = useCallback(
    async (found: FindScheduledFlightBySerialResult) => {
      const schedule = found.schedule ?? {};
      setSerialInput(found.searchedSerial || found.operationalSerial || found.serialNo);
      setFindFilterActive(true);

      if (!found.editable) {
        setBlockedFind({
          serial: found.searchedSerial || found.serialNo,
          status: formatBlockedFlightStatus(found.flightStatus),
        });
        setPersistSerial('');
        clearOverrideMeta();
        setFormEditable(true);
        setFormData(createDefaultFormData());
        setTableRows([]);
        return;
      }

      setBlockedFind(null);
      // Persist against generated instance serial (daily override identity).
      const opSerial = found.operationalSerial || found.serialNo;
      setPersistSerial(opSerial);
      applyOverrideMeta({
        scheduleMasterSerial: found.scheduleMasterSerial,
        operationDate: found.operationDate,
        lastModified: found.lastModified,
        modifiedBy: found.modifiedBy,
        scheduleSource: found.scheduleSource,
        schedule,
      });
      setFormData((prev) => scheduleToFormPatch(schedule, prev));
      setFormEditable(true);

      const staHint = pickString(
        found.operationDate,
        schedule.staDate,
        schedule['STA Date'],
        schedule.operationDate,
        formatDisplayDate(new Date()),
      );
      const hydrated = await hydrateFormFromDailyTable({
        serialCandidates: [
          found.searchedSerial,
          found.operationalSerial,
          found.serialNo,
        ],
        scheduleSerial: found.scheduleMasterSerial || found.serialNo,
        airline: pickString(schedule.airlines, schedule.Airline, schedule.airline),
        flightNo: pickString(schedule.flightNo, schedule['Flight No']),
        dateHints: [staHint],
      });
      if (!hydrated) {
        setTableRows([
          openFlightMatchToTableRow(opSerial, schedule as Record<string, unknown>),
        ]);
      }
    },
    [applyOverrideMeta, clearOverrideMeta, hydrateFormFromDailyTable],
  );

  const applyFindResult = useCallback(
    async (found: FindAdvanceScheduleResult) => {
      const schedule = found.schedule ?? {};
      setBlockedFind(null);
      const opSerial =
        found.operationalSerial || found.serialNo;
      setPersistSerial(opSerial);
      setSerialInput(opSerial);
      applyOverrideMeta({
        scheduleMasterSerial: found.scheduleMasterSerial,
        operationDate: found.operationDate,
        lastModified: found.lastModified,
        modifiedBy: found.modifiedBy,
        scheduleSource: found.scheduleSource,
        schedule,
      });
      setFormEditable(true);
      setFormData((prev) => scheduleToFormPatch(schedule, prev));

      const staHint = pickString(
        found.operationDate,
        schedule.staDate,
        schedule['STA Date'],
        schedule.operationDate,
        formatDisplayDate(new Date()),
      );
      const hydrated = await hydrateFormFromDailyTable({
        serialCandidates: [
          opSerial,
          found.serialNo,
          found.scheduleMasterSerial ?? '',
        ],
        scheduleSerial: found.scheduleMasterSerial || found.serialNo,
        airline: pickString(schedule.airlines, schedule.Airline, schedule.airline),
        flightNo: pickString(schedule.flightNo, schedule['Flight No']),
        dateHints: [staHint],
      });

      const openFlightEntries =
        found.openFlights ?? [{ serialNo: opSerial, schedule }];
      if (hydrated && openFlightEntries.length > 1 && staHint) {
        try {
          const raw = await fetchDailyScheduledFromAdvance(staHint, staHint);
          const flights = processFlightData(Array.isArray(raw) ? raw : []);
          const airline = pickString(schedule.airlines, schedule.Airline, schedule.airline);
          const flightNo = pickString(schedule.flightNo, schedule['Flight No']);
          const rows = openFlightEntries
            .map((entry) => {
              const entrySerial = entry.operationalSerial || entry.serialNo;
              const match = flights.find(
                (f) =>
                  flightMatchesSerialCandidates(f, [entrySerial, entry.serialNo]) ||
                  (airline &&
                    flightNo &&
                    String(f.airline ?? '').trim() === airline &&
                    String(f.flightNo ?? '').trim() === flightNo),
              );
              if (match) {
                return dailyFlightToTableRow(
                  match,
                  entry.scheduleMasterSerial || found.scheduleMasterSerial || entry.serialNo,
                );
              }
              return openFlightMatchToTableRow(
                entrySerial,
                (entry.schedule ?? {}) as Record<string, unknown>,
              );
            })
            .filter((row) => row.serialNo && row.airline && row.flightNo);
          if (rows.length > 0) {
            setTableRows(rows);
          }
        } catch {
          // keep single hydrated row
        }
      } else if (!hydrated) {
        const openRows = (found.openFlights ?? [{ serialNo: opSerial, schedule }])
          .map((row) =>
            openFlightMatchToTableRow(
              row.operationalSerial || row.serialNo,
              (row.schedule ?? {}) as Record<string, unknown>,
            ),
          )
          .filter((row) => row.serialNo && row.airline && row.flightNo);
        if (openRows.length > 0) {
          setTableRows(openRows);
        }
      }
      setFindFilterActive(true);
    },
    [applyOverrideMeta, hydrateFormFromDailyTable],
  );

  const handleFindRecord = useCallback(async () => {
    setSaveError(null);
    setBlockedFind(null);
    const serialQuery = serialInput.trim();
    const hasSerial = serialQuery.length > 0;
    const hasAirlineFlight =
      formData.airlines?.trim() && formData.flightNo?.trim();

    if (!hasSerial && !hasAirlineFlight) {
      setSaveError('Enter Serial No, or Airlines and Flight No, to find record.');
      return;
    }

    setFinding(true);
    try {
      if (hasSerial) {
        const found = await findScheduledFlightBySerial(serialQuery);
        if (!found?.serialNo) {
          setSaveError(`No flight found for serial ${serialQuery}.`);
          setPersistSerial('');
          clearOverrideMeta();
          setFormEditable(true);
          return;
        }
        await applyFindBySerialResult(found);
        if (found.editable) {
          toast.success(
            `Daily flight ${found.operationalSerial || found.serialNo} loaded for override.`,
          );
        }
        return;
      }

      const searchDate =
        formData.staDate?.trim() || formatDisplayDate(new Date());
      const found = await findAdvanceScheduleByFlight(
        formData.airlines.trim(),
        formData.flightNo.trim(),
        {
          openOnly: true,
          date: searchDate,
          airlineCode: formData.airlineCode.trim() || undefined,
        },
      );
      if (!found?.serialNo) {
        setSaveError(
          `No scheduled flight found for ${formData.airlines.trim()} ${formData.flightNo.trim()} on ${searchDate}. Check airline, flight number, STA Date, and that the flight operates that day in Schedule Setup.`,
        );
        setPersistSerial('');
        clearOverrideMeta();
        setFormEditable(true);
        setTableRows([]);
        return;
      }
      await applyFindResult(found);
      const count = found.openFlights?.length ?? 1;
      toast.success(
        count > 1
          ? `${count} open flights for ${searchDate}. Instance ${found.operationalSerial || found.serialNo} ready to override.`
          : `Daily flight ${found.operationalSerial || found.serialNo} loaded for ${searchDate}.`,
      );
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Find record failed');
      setPersistSerial('');
      clearOverrideMeta();
      setFormEditable(true);
    } finally {
      setFinding(false);
    }
  }, [
    applyFindBySerialResult,
    applyFindResult,
    clearOverrideMeta,
    formData.airlines,
    formData.flightNo,
    formData.airlineCode,
    formData.staDate,
    serialInput,
  ]);

  const scheduleTimingError = useMemo(
    () => validateStaStdSchedule(formData),
    [formData.staDate, formData.staTime, formData.stdDate, formData.stdTime],
  );

  const handleSave = useCallback(async () => {
    setSaveError(null);
    if (!formEditable) {
      window.alert('The flight is Closed hence cannot be edited.');
      return;
    }
    const next = validateScheduledAirlinesForm({
      airlines: formData.airlines,
      flightNo: formData.flightNo,
      persistSerial: persistSerial ?? '',
      acType: formData.acType,
      routing: formData.routing,
      staTime: formData.staTime,
      staDate: formData.staDate,
      aBody: formData.aBody,
      stdTime: formData.stdTime,
      stdDate: formData.stdDate,
      opsType: formData.opsType,
      skdNonSkd: formData.skdNonSkd,
      categoryOfFlight: formData.categoryOfFlight,
    });
    if (applyAndFocus(next)) {
      setSaveError('Please fix the highlighted fields.');
      return;
    }
    setSaving(true);
    const wasFindFilter = findFilterActive;
    const serialForRefresh = serialInput.trim() || persistSerial.trim();
    const airlineForRefresh = formData.airlines.trim();
    const flightNoForRefresh = formData.flightNo.trim();
    try {
      const normalizedSerial = persistSerial.trim();
      const stdDateForRow =
        formData.stdDate ||
        formData.staDate ||
        formatDisplayDate(new Date());
      const stdTimeForRow = normalizeTimeToHHmm(formData.stdTime) || '00:00';
      const rowPayload: FlightCreatedRow = {
        id: existingRow?.id || createRowId(),
        serialNo: normalizedSerial,
        persistSerial: normalizedSerial,
        airline: formData.airlines.trim(),
        flightNo: formData.flightNo.trim(),
        stdTime: stdTimeForRow,
        stdDate: stdDateForRow,
        cateOfFlight: formData.categoryOfFlight || '—',
      };

      await saveScheduledAirlinesCreation({
        serialNo: normalizedSerial,
        instanceSerial: normalizedSerial,
        operationalSerial: normalizedSerial,
        scheduleMasterSerial: scheduleMasterSerial || undefined,
        operationDate: formData.staDate,
        airlines: normalizeText(formData.airlines),
        acType: formData.acType === '0' ? '' : formData.acType.trim(),
        date: formData.staDate,
        routing: normalizeText(formData.routing),
        staTime: formData.staTime,
        staDate: formData.staDate,
        stdTime: formData.stdTime,
        stdDate: formData.stdDate,
        aBody: formData.aBody.trim().toUpperCase(),
        opsType: formData.opsType,
        skdNonSkd: formData.skdNonSkd,
        categoryOfFlight: formData.categoryOfFlight,
        airlineCode: formData.airlineCode.trim().toUpperCase(),
        flightNo: normalizeText(formData.flightNo).toUpperCase().replace(/\s/g, ''),
      });
      if (existingRow) {
        toast.success('Daily flight override updated for this operating day only.');
        setTableRows((prev) =>
          prev.map((r) =>
            (r.persistSerial || r.serialNo) === normalizedSerial ? rowPayload : r,
          ),
        );
      } else {
        toast.success('Daily flight override saved for this operating day only. Master schedule unchanged.');
        setTableRows((prev) => {
          const idx = prev.findIndex((r) => r.serialNo === normalizedSerial);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...rowPayload, id: prev[idx].id };
            return next;
          }
          return [...prev, rowPayload];
        });
      }
      setFindFilterActive(false);
      if (serialForRefresh) {
        const refreshed = await findScheduledFlightBySerial(serialForRefresh);
        if (refreshed?.serialNo && refreshed.editable) {
          await applyFindBySerialResult(refreshed);
        } else if (wasFindFilter && airlineForRefresh && flightNoForRefresh) {
          const byFlight = await findAdvanceScheduleByFlight(
            airlineForRefresh,
            flightNoForRefresh,
            {
              openOnly: true,
              date: formData.staDate || formatDisplayDate(new Date()),
            },
          );
          if (byFlight?.serialNo) {
            await applyFindResult(byFlight);
          } else {
            await loadCreatedFlightsForRange(tableFromDate, tableToDate);
          }
        } else {
          await loadCreatedFlightsForRange(tableFromDate, tableToDate);
        }
      } else {
        await loadCreatedFlightsForRange(tableFromDate, tableToDate);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      const mapped = mapCreationApiErrorToField(msg);
      if (mapped && (SCHEDULED_AIRLINES_FIELD_ORDER as readonly string[]).includes(mapped.field)) {
        setFieldError(mapped.field as ScheduledAirlinesField, mapped.message);
      }
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }, [
    applyAndFocus,
    applyFindBySerialResult,
    applyFindResult,
    findFilterActive,
    formData,
    formEditable,
    persistSerial,
    scheduleMasterSerial,
    serialInput,
    existingRow,
    loadCreatedFlightsForRange,
    setFieldError,
    tableFromDate,
    tableToDate,
  ]);

  const handleEditFromRow = useCallback(
    async (row: FlightCreatedRow) => {
      const editSerial = (row.persistSerial || row.serialNo || '').trim();
      if (!editSerial) return;
      setSerialInput(editSerial);
      setSaveError(null);
      setFinding(true);
      try {
        const found = await findScheduledFlightBySerial(editSerial);
        if (!found?.serialNo) {
          setFormData((prev) => ({
            ...prev,
            airlines: row.airline || prev.airlines,
            flightNo: row.flightNo || prev.flightNo,
            stdTime: normalizeTimeToHHmm(row.stdTime || prev.stdTime) || prev.stdTime,
            stdDate: row.stdDate || prev.stdDate,
            categoryOfFlight:
              row.cateOfFlight && row.cateOfFlight !== '—'
                ? row.cateOfFlight
                : prev.categoryOfFlight,
          }));
          setPersistSerial(editSerial);
          setFormEditable(true);
          toast.info(`Editing flight serial ${row.serialNo}`);
          return;
        }
        await applyFindBySerialResult(found);
        if (found.editable) {
          toast.info(`Editing flight serial ${row.serialNo}`);
        }
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Failed to load flight');
      } finally {
        setFinding(false);
      }
    },
    [applyFindBySerialResult],
  );

  const inputClass =
    'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none';
  const inputReadOnlyClass =
    `${inputClass} cursor-default border-slate-200/90 bg-slate-50 text-slate-700 shadow-none focus:border-slate-200/90 focus:ring-0`;
  const selectClass =
    'h-11 w-full rounded-xl border border-slate-200 !bg-white px-3 text-sm text-slate-800 shadow-sm transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus-visible:outline-none cursor-pointer';
  const selectLockedClass = `${selectClass} cursor-not-allowed !bg-slate-50`;
  const labelClass = 'mb-1.5 block text-sm font-medium leading-snug text-slate-700';
  /** Label + control + reserved footer slot keeps row controls vertically aligned. */
  const fieldWrapClass = 'flex min-w-0 flex-col';
  const fieldFooterClass = 'mt-1 min-h-5';
  const control = (invalid?: boolean) => cn(inputClass, invalid && CREATION_INVALID_CONTROL);
  const selectControl = (invalid?: boolean) => cn(selectClass, invalid && CREATION_INVALID_CONTROL);

  return (
    <div className="space-y-8">
      {/* Daily override context — not master schedule editing */}
      <div
        className={cn(
          'rounded-2xl border px-5 py-4 shadow-sm',
          isAdditionalFlight
            ? 'border-amber-200 bg-amber-50/90'
            : 'border-sky-200 bg-sky-50/90',
        )}
        role="status"
      >
        <p
          className={cn(
            'text-sm font-semibold',
            isAdditionalFlight ? 'text-amber-950' : 'text-sky-950',
          )}
        >
          {isAdditionalFlight ? 'Additional Flight' : 'Daily Flight Override'}
        </p>
        <p
          className={cn(
            'mt-1 text-sm',
            isAdditionalFlight ? 'text-amber-900/80' : 'text-sky-900/80',
          )}
        >
          {isAdditionalFlight
            ? 'One-time flight created from Creation → Additional Flights for this date only. Master schedule from Advance → Schedule Setup stays unchanged.'
            : 'Edit operational details for one generated flight day only. Master schedule from Advance → Schedule Setup stays unchanged.'}
        </p>
        {(persistSerial || operationDateLabel || scheduleMasterSerial) && (
          <dl
            className={cn(
              'mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3',
              isAdditionalFlight ? 'text-amber-950' : 'text-sky-950',
            )}
          >
            <div>
              <dt
                className={
                  isAdditionalFlight ? 'text-amber-800/70' : 'text-sky-800/70'
                }
              >
                Flight Date
              </dt>
              <dd className="font-medium">
                {operationDateLabel || formData.staDate || '—'}
              </dd>
            </div>
            <div>
              <dt
                className={
                  isAdditionalFlight ? 'text-amber-800/70' : 'text-sky-800/70'
                }
              >
                Airline / Flight
              </dt>
              <dd className="font-medium">
                {[formData.airlines, formData.flightNo].filter(Boolean).join(' · ') ||
                  '—'}
              </dd>
            </div>
            <div>
              <dt
                className={
                  isAdditionalFlight ? 'text-amber-800/70' : 'text-sky-800/70'
                }
              >
                Generated Serial No
              </dt>
              <dd className="font-medium">{persistSerial || '—'}</dd>
            </div>
            <div>
              <dt
                className={
                  isAdditionalFlight ? 'text-amber-800/70' : 'text-sky-800/70'
                }
              >
                {isAdditionalFlight ? 'Flight Type' : 'Schedule Reference'}
              </dt>
              <dd className="font-medium">
                {isAdditionalFlight ? 'Additional' : scheduleMasterSerial || '—'}
              </dd>
            </div>
            <div>
              <dt
                className={
                  isAdditionalFlight ? 'text-amber-800/70' : 'text-sky-800/70'
                }
              >
                Last Modified
              </dt>
              <dd className="font-medium">
                {lastModifiedLabel || '—'}
              </dd>
            </div>
            <div>
              <dt
                className={
                  isAdditionalFlight ? 'text-amber-800/70' : 'text-sky-800/70'
                }
              >
                Modified By
              </dt>
              <dd className="font-medium">
                {modifiedByLabel || '—'}
              </dd>
            </div>
          </dl>
        )}
      </div>

      {/* Search row — equal columns, reserved footer for alignment */}
      <div className="rounded-2xl border border-emerald-300 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 items-start gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1fr)_auto]">
          <div className={fieldWrapClass}>
            <label className={labelClass} id="field-airlines-label">
              Airlines <span className="text-red-500">*</span>
            </label>
            <AdminRadioDropdown
              value={formData.airlines}
              onChange={(nextName) => {
                const selected = airlineOptions.find((a) => a.name === nextName);
                setFormData((prev) => ({
                  ...prev,
                  airlines: nextName,
                  airlineCode: selected?.code ?? '',
                  flightNo: '',
                }));
                setSerialInput('');
                setPersistSerial('');
                clearOverrideMeta();
                setSaveError(null);
                clearField('airlines');
                clearField('flightNo');
              }}
              options={airlineDropdownOptions}
              placeholder={airlinesLoading ? 'Loading airlines...' : 'Select airline'}
              disabled={airlinesLoading || saving}
              className={selectControl(!!errors.airlines)}
              aria-invalid={!!errors.airlines}
              aria-labelledby="field-airlines-label"
            />
            <div className={fieldFooterClass}>
              <FormFieldError id="field-airlines-error" message={errors.airlines} />
            </div>
          </div>
          <div className={fieldWrapClass}>
            <label className={labelClass} id="field-flightNo-label">
              Flight No <span className="text-red-500">*</span>
            </label>
            <AdminRadioDropdown
              value={formData.flightNo}
              onChange={(nextFlight) => {
                handleInputChange('flightNo', nextFlight.toUpperCase());
                clearField('flightNo');
              }}
              options={flightDropdownOptions}
              placeholder={
                !formData.airlines.trim()
                  ? 'Select airline first'
                  : flightsLoading
                    ? 'Loading flights...'
                    : flightOptions.length === 0
                      ? 'No flights for airline'
                      : 'Select flight'
              }
              disabled={
                saving ||
                flightsLoading ||
                !formData.airlines.trim() ||
                (flightOptions.length === 0 && !formData.flightNo.trim())
              }
              className={selectControl(!!errors.flightNo)}
              aria-invalid={!!errors.flightNo}
              aria-labelledby="field-flightNo-label"
              searchPlaceholder="Search flight no..."
            />
            <div className={fieldFooterClass}>
              <FormFieldError id="field-flightNo-error" message={errors.flightNo} />
            </div>
          </div>
          <div className={fieldWrapClass}>
            <label className={labelClass} htmlFor="field-persistSerial">
              Serial No <span className="text-red-500">*</span>
            </label>
            <input
              id="field-persistSerial"
              name="persistSerial"
              type="text"
              inputMode="numeric"
              value={serialInput}
              aria-invalid={!!errors.persistSerial}
              aria-describedby={errors.persistSerial ? 'field-persistSerial-error' : undefined}
              onChange={(e) => {
                setSerialInput(e.target.value);
                setSaveError(null);
                clearField('persistSerial');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleFindRecord();
                }
              }}
              className={
                persistSerial
                  ? cn(inputClass, 'border-emerald-200 bg-emerald-50 font-medium text-emerald-800')
                  : control(!!errors.persistSerial)
              }
              placeholder="Enter serial to load flight"
              disabled={saving}
            />
            <div className={fieldFooterClass}>
              <FormFieldError id="field-persistSerial-error" message={errors.persistSerial} />
              {persistSerial && persistSerial !== serialInput.trim() ? (
                <p className="text-xs leading-5 text-slate-500">
                  Generated: {persistSerial}
                  {scheduleMasterSerial ? ` · Ref: ${scheduleMasterSerial}` : ''}
                </p>
              ) : scheduleMasterSerial ? (
                <p className="text-xs leading-5 text-slate-500">
                  Schedule reference: {scheduleMasterSerial}
                </p>
              ) : null}
            </div>
          </div>
          <div className={fieldWrapClass}>
            <span className={cn(labelClass, 'invisible')} aria-hidden>
              Action
            </span>
            <button
              type="button"
              onClick={() => void handleFindRecord()}
              disabled={finding}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white shadow transition hover:bg-emerald-700 disabled:opacity-60"
            >
              <Search className="h-4 w-4" />
              {finding ? 'Finding…' : 'Find Record'}
            </button>
            <div className={fieldFooterClass} aria-hidden />
          </div>
        </div>
        <ScrollToError
          error={saveError}
          className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {saveError}
        </ScrollToError>
      </div>

      {/* Flight information form — strict 4-column grid for alignment */}
      <div className="rounded-2xl border border-emerald-300 bg-white p-6 shadow-sm">
        {blockedFind ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Flight serial <span className="font-semibold">{blockedFind.serial}</span> is{' '}
            {blockedFind.status} and cannot be edited. Only open flights can be loaded into the
            form below — search again with an open serial or airline + flight number.
          </div>
        ) : null}
        <ScrollToError
          error={saveError || scheduleTimingError}
          className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {saveError || scheduleTimingError}
        </ScrollToError>
        <fieldset
          disabled={!formEditable || finding}
          className="min-w-0 border-0 p-0 disabled:opacity-75"
        >
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Row 1 */}
          <div className={fieldWrapClass}>
            <label className={labelClass}>Airlines</label>
            <AdminRadioDropdown
              value={formData.airlines}
              onChange={() => {}}
              options={[
                ...(formData.airlines &&
                !airlineOptions.some((a) => a.name === formData.airlines)
                  ? [{ value: formData.airlines, label: formData.airlines }]
                  : []),
                ...airlineDropdownOptions,
              ]}
              placeholder={airlinesLoading ? 'Loading airlines...' : 'Select airline above'}
              disabled
              className={selectLockedClass}
            />
            <div className={fieldFooterClass}>
              <FormFieldError />
            </div>
          </div>
          <div className={fieldWrapClass}>
            <label className={labelClass} id="field-acType-label">
              AC Type <span className="text-red-500">*</span>
            </label>
            <AdminRadioDropdown
              value={formData.acType === '0' ? '' : formData.acType}
              onChange={(nextType) => {
                const selected = aircraftOptions.find((a) => a.type === nextType);
                setFormData((prev) => ({
                  ...prev,
                  acType: nextType,
                  aBody: selected?.body ?? prev.aBody,
                }));
                setSaveError(null);
                clearField('acType');
              }}
              options={[
                ...(formData.acType &&
                formData.acType !== '0' &&
                !aircraftOptions.some((a) => a.type === formData.acType)
                  ? [{ value: formData.acType, label: formData.acType }]
                  : []),
                ...aircraftDropdownOptions,
              ]}
              placeholder={aircraftLoading ? 'Loading aircraft...' : 'Select aircraft'}
              disabled={aircraftLoading || saving}
              className={selectControl(!!errors.acType)}
              aria-invalid={!!errors.acType}
              aria-labelledby="field-acType-label"
            />
            <div className={fieldFooterClass}>
              <FormFieldError id="field-acType-error" message={errors.acType} />
            </div>
          </div>
          {/* Row 2 */}
          <div className={fieldWrapClass}>
            <label className={labelClass} htmlFor="field-routing">
              Routing
            </label>
            <input
              id="field-routing"
              name="routing"
              type="text"
              value={formData.routing}
              aria-invalid={!!errors.routing}
              aria-describedby={errors.routing ? 'field-routing-error' : undefined}
              onChange={(e) => handleInputChange('routing', e.target.value)}
              onBlur={(e) => {
                const routing = normalizeText(e.target.value);
                setFormData((prev) => ({ ...prev, routing }));
                setFieldError('routing', flightRouting(routing));
              }}
              className={control(!!errors.routing)}
              placeholder="Routing"
              maxLength={80}
              disabled={saving}
            />
            <div className={fieldFooterClass}>
              <FormFieldError id="field-routing-error" message={errors.routing} />
            </div>
          </div>
          <div className={fieldWrapClass}>
            <label className={labelClass}>
              STA Time (24h) <span className="text-red-500">*</span>
            </label>
            <TimeSelect24
              value={formData.staTime}
              onChange={(v) => {
                handleInputChange('staTime', v);
                setFieldError('staTime', time24(v, 'STA time'));
              }}
              className={cn('w-full max-w-full', errors.staTime && CREATION_INVALID_CONTROL)}
              disabled={saving}
            />
            <div className={fieldFooterClass}>
              <FormFieldError id="field-staTime-error" message={errors.staTime} />
            </div>
          </div>
          <div className={cn(fieldWrapClass, errors.staDate && CREATION_INVALID_PICKER_WRAP)}>
            <label className={labelClass} htmlFor="field-staDate">
              STA Date <span className="text-red-500">*</span>
            </label>
            <DatePicker
              id="field-staDate"
              value={formData.staDate}
              onChange={handleStaDateChange}
              ariaLabel="STA date"
              disabled={saving}
            />
            <div className={fieldFooterClass}>
              <FormFieldError id="field-staDate-error" message={errors.staDate} />
            </div>
          </div>
          {/* Row 3 */}
          <div className={fieldWrapClass}>
            <label className={labelClass} htmlFor="field-aBody">
              Aircraft Body <span className="text-red-500">*</span>
            </label>
            <input
              id="field-aBody"
              name="aBody"
              type="text"
              value={formData.aBody}
              readOnly
              aria-invalid={!!errors.aBody}
              aria-describedby={errors.aBody ? 'field-aBody-error' : undefined}
              className={cn(inputReadOnlyClass, 'uppercase')}
              placeholder="NB"
              maxLength={2}
              tabIndex={-1}
            />
            <div className={fieldFooterClass}>
              <FormFieldError id="field-aBody-error" message={errors.aBody} />
            </div>
          </div>
          <div className={fieldWrapClass}>
            <label className={labelClass}>
              STD Time (24h) <span className="text-red-500">*</span>
            </label>
            <TimeSelect24
              value={formData.stdTime}
              onChange={(v) => {
                handleInputChange('stdTime', v);
                setFieldError('stdTime', time24(v, 'STD time'));
              }}
              className={cn('w-full max-w-full', errors.stdTime && CREATION_INVALID_CONTROL)}
              disabled={saving}
            />
            <div className={fieldFooterClass}>
              <FormFieldError id="field-stdTime-error" message={errors.stdTime} />
            </div>
          </div>
          <div className={cn(fieldWrapClass, errors.stdDate && CREATION_INVALID_PICKER_WRAP)}>
            <label className={labelClass} htmlFor="field-stdDate">
              STD Date <span className="text-red-500">*</span>
            </label>
            <DatePicker
              id="field-stdDate"
              value={formData.stdDate}
              onChange={handleStdDateChange}
              minDate={parseDisplayDateToDate(formData.staDate) ?? undefined}
              ariaLabel="STD date"
              disabled={saving}
            />
            <div className={fieldFooterClass}>
              <FormFieldError id="field-stdDate-error" message={errors.stdDate} />
            </div>
          </div>
          {/* Row 4 */}
          <div className={fieldWrapClass}>
            <label className={labelClass} id="field-opsType-label">
              Ops Type <span className="text-red-500">*</span>
            </label>
            <AdminRadioDropdown
              value={formData.opsType}
              onChange={() => {}}
              options={OPS_TYPE_OPTIONS}
              className={selectLockedClass}
              aria-invalid={!!errors.opsType}
              aria-labelledby="field-opsType-label"
              disabled
            />
            <div className={fieldFooterClass}>
              <FormFieldError id="field-opsType-error" message={errors.opsType} />
            </div>
          </div>
          <div className={fieldWrapClass}>
            <label className={labelClass} id="field-skdNonSkd-label">
              Skd/Non Skd <span className="text-red-500">*</span>
            </label>
            <AdminRadioDropdown
              value={formData.skdNonSkd}
              onChange={() => {}}
              options={SKD_NON_SKD_OPTIONS}
              className={selectLockedClass}
              aria-invalid={!!errors.skdNonSkd}
              aria-labelledby="field-skdNonSkd-label"
              disabled
            />
            <div className={fieldFooterClass}>
              <FormFieldError id="field-skdNonSkd-error" message={errors.skdNonSkd} />
            </div>
          </div>
          <div className={fieldWrapClass}>
            <label className={labelClass} id="field-categoryOfFlight-label">
              Category Of Flight <span className="text-red-500">*</span>
            </label>
            <AdminRadioDropdown
              value={formData.categoryOfFlight}
              onChange={() => {}}
              options={CATEGORY_OPTIONS}
              className={selectLockedClass}
              aria-invalid={!!errors.categoryOfFlight}
              aria-labelledby="field-categoryOfFlight-label"
              disabled
            />
            <div className={fieldFooterClass}>
              <FormFieldError id="field-categoryOfFlight-error" message={errors.categoryOfFlight} />
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !formEditable || finding || Boolean(scheduleTimingError)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving…' : existingRow ? 'Update' : 'Save'}
          </button>
        </div>
        </fieldset>
      </div>

      {/* Dynamic Creation */}
      <Collapsible open={dynamicCreationOpen} onOpenChange={setDynamicCreationOpen}>
        <div className="overflow-hidden rounded-2xl border border-emerald-300 bg-white shadow-sm">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-slate-50/80"
              aria-expanded={dynamicCreationOpen}
            >
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Zap className="h-4 w-4 text-slate-600" />
                Dynamic Creation
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${
                  dynamicCreationOpen ? 'rotate-180' : ''
                }`}
                aria-hidden
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-slate-100 px-5 pb-5 pt-4">
              <p className="mb-3 text-sm text-slate-600">
                To create all the flights for the selected date, use the dynamic creation link.
              </p>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow transition hover:bg-emerald-700"
              >
                <Zap className="h-4 w-4" />
                Dynamic Creation
              </button>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* CSV Import */}
      <div className="rounded-2xl border border-emerald-300 bg-white p-5 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-slate-800">Import flight data from CSV</h3>
        <p className="mb-3 text-sm text-slate-500">Data will be imported into Scheduled Airlines.</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm transition hover:bg-slate-50">
            <FileUp className="h-4 w-4 text-slate-500" />
            <span>Choose file</span>
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <span className="text-sm text-slate-500">{csvFile ? csvFile.name : 'No file chosen'}</span>
          <button
            type="button"
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow transition hover:bg-emerald-700"
          >
            CSV Import Creation
          </button>
        </div>
      </div>

      {/* Flight Created table */}
      <div className="overflow-hidden rounded-2xl border border-emerald-300 bg-white shadow-sm">
        {findFilterActive ? (
          <div className="border-b border-slate-100 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-slate-800">
              Generated flights for this airline, flight number, and date
            </h3>
          </div>
        ) : (
          <CreationFlightsTableDateRange
            title="Generated flights for the selected date range"
            fromDate={tableFromDate}
            toDate={tableToDate}
            onFromDateChange={setTableFromDate}
            onToDateChange={setTableToDate}
            subtitle="Filter generated scheduled flights by STD date range."
          />
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="px-5 py-3 text-left font-medium text-slate-700">Serial No</th>
                <th className="px-5 py-3 text-left font-medium text-slate-700">Airline</th>
                <th className="px-5 py-3 text-left font-medium text-slate-700">Flight No</th>
                <th className="px-5 py-3 text-left font-medium text-slate-700">STD time</th>
                <th className="px-5 py-3 text-left font-medium text-slate-700">STD date</th>
                <th className="px-5 py-3 text-left font-medium text-slate-700">Category</th>
              </tr>
            </thead>
            <tbody>
              {tableLoading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                    Loading flights...
                  </td>
                </tr>
              ) : tableRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                    No scheduled flight found for this date range. Use Find Record
                    after selecting airline, flight number, and date.
                  </td>
                </tr>
              ) : (
                tableRows.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50/50"
                    onClick={() => void handleEditFromRow(row)}
                    title="Click to edit this flight"
                  >
                    <td className="px-5 py-3 text-slate-900">{row.serialNo}</td>
                    <td className="px-5 py-3 text-slate-900">{row.airline}</td>
                    <td className="px-5 py-3 text-slate-900">{row.flightNo}</td>
                    <td className="px-5 py-3 text-slate-900">{row.stdTime}</td>
                    <td className="px-5 py-3 text-slate-900">{row.stdDate}</td>
                    <td className="px-5 py-3 text-slate-900">{row.cateOfFlight}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
