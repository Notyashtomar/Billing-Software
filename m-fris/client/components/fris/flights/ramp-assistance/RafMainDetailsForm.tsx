'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DatePicker } from '@/components/ui/DatePicker';
import { TimeSelect24 } from '@/components/ui/TimeSelect24';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  ADVANCE_PATHS,
  advanceDocId,
  advanceList,
  fetchAdvanceTerminalCodes,
  fetchCreationReferenceAircraft,
  fetchFhrCollectionFlightLean,
  fetchFlightsReferenceAirlines,
  putFhrCollectionFlightMerge,
} from '@/lib/api';
import {
  displayScheduledAirlinesTableSerial,
  nsFormSerialForFlight,
  type FlightData,
  type MainDetailsData,
} from '@/utils/dataProcessor';
import { cn } from '@/lib/utils';
import {
  FLIGHT_DETAILS_FIELD_GRID_CLASS,
  FLIGHT_DETAILS_FORM_BODY_CLASS,
  FLIGHT_DETAILS_FORM_ROOT_CLASS,
  FLIGHT_DETAILS_H_SCROLL_CLASS,
  FLIGHT_DETAILS_SECTION_CLASS,
} from '@/components/fris/flights/scheduledairlines/flightDetailsFormLayout';
import DigitalSignaturesSection from '@/components/fris/flights/scheduledairlines/signatures/DigitalSignaturesSection';

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

const TYPE_OF_FLIGHT_OPTIONS = [
  'International',
  'Domestic',
  'International BME',
  'Domestic BME',
  'International-Cargo',
  'Domestic-Cargo',
  'International-Domestic',
  'Domestic-International',
];

const TERMINAL_FALLBACK = ['RGI', 'T1', 'T2', 'T3'];

const LIST_TYPE_OPTIONS = [
  { value: 'Equipment', label: 'Equipment' },
  { value: 'Manpower', label: 'Manpower' },
  { value: 'Other', label: 'Other' },
] as const;

type ListType = (typeof LIST_TYPE_OPTIONS)[number]['value'];

type ServiceRow = {
  id: string;
  service: string;
  unit: string;
  quantity: string;
  weight: string;
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
  uses: string;
  remarks: string;
};

type FormState = {
  airline: string;
  routing: string;
  flightNo: string;
  aircraft: string;
  operation: string;
  airlineCode: string;
  typeOfFlight: string;
  staDate: string;
  stdDate: string;
  ataDate: string;
  atdDate: string;
  staTime: string;
  stdTime: string;
  ataTime: string;
  atdTime: string;
  returnToRamp: boolean;
  terminalCode: string;
  cancelled: boolean;
  ghRemarks: string;
  airlineRemarks: string;
  listType: ListType;
  /** Free-text GH representative name (no master dropdown). */
  ghRep: string;
  /** Free-text airline representative name (no master dropdown). */
  airlineRep: string;
};

function newServiceId(): string {
  return `svc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyService(defaults?: Partial<ServiceRow>): ServiceRow {
  return {
    id: newServiceId(),
    service: '',
    unit: '',
    quantity: '',
    weight: '0.00',
    fromDate: '',
    fromTime: '',
    toDate: '',
    toTime: '',
    uses: '',
    remarks: '',
    ...defaults,
  };
}

function timeToMinutes(t: string): number | null {
  const parts = String(t ?? '')
    .trim()
    .split(':')
    .map(Number);
  if (parts.length < 2) return null;
  const [h, m] = parts;
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return h * 60 + m;
}

function calcUses(fromTime: string, toTime: string): string {
  const fromMins = timeToMinutes(fromTime);
  const toMins = timeToMinutes(toTime);
  if (fromMins == null || toMins == null) return '';
  let diff = toMins - fromMins;
  if (diff < 0) diff += 24 * 60;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getLoggedInUserLabel(): string {
  if (typeof window === 'undefined') return '';
  try {
    const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr) as Record<string, unknown>;
      const name = String(
        user.name ?? user.username ?? user.fullName ?? user.displayName ?? '',
      ).trim();
      const code = String(
        user.employeeCode ?? user.empCode ?? user.userId ?? localStorage.getItem('userId') ?? '',
      ).trim();
      if (name && code) return `${name} ${code}`;
      return name || code;
    }
  } catch {
    /* ignore */
  }
  return String(localStorage.getItem('userId') ?? '').trim();
}

function formatVerifiedStamp(verifiedBy: string, verifiedAt?: string): string {
  if (!verifiedBy) {
    return 'This is electronically sign / verified by GSD incharge —';
  }
  let when = verifiedAt?.trim();
  if (!when) {
    const now = new Date();
    when = `${now.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    })} ${now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })}`;
  }
  return `This is electronically sign / verified by GSD incharge ${verifiedBy} ${when}`;
}

function normalizeServiceRow(raw: unknown): ServiceRow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const fromDate = String(o.fromDate ?? '').trim();
  const fromTime = String(o.fromTime ?? '').trim();
  const toDate = String(o.toDate ?? '').trim();
  const toTime = String(o.toTime ?? '').trim();
  const fromCombined = String(o.from ?? '').trim();
  const toCombined = String(o.to ?? '').trim();
  let fDate = fromDate;
  let fTime = fromTime;
  let tDate = toDate;
  let tTime = toTime;
  if (!fDate && fromCombined.includes(' ')) {
    const [d, t] = fromCombined.split(/\s+/);
    fDate = d ?? '';
    fTime = t ?? '';
  }
  if (!tDate && toCombined.includes(' ')) {
    const [d, t] = toCombined.split(/\s+/);
    tDate = d ?? '';
    tTime = t ?? '';
  }
  return {
    id: String(o.id ?? newServiceId()),
    service: String(o.service ?? o.services ?? o.equipmentName ?? '').trim(),
    unit: String(o.unit ?? '').trim(),
    quantity: String(o.quantity ?? '').trim(),
    weight: String(o.weight ?? '0.00').trim() || '0.00',
    fromDate: fDate,
    fromTime: fTime,
    toDate: tDate,
    toTime: tTime,
    uses: String(o.uses ?? calcUses(fTime, tTime)).trim(),
    remarks: String(o.remarks ?? '').trim(),
  };
}

export type RafMainDetailsFormProps = {
  flight: FlightData;
  mainDetails?: MainDetailsData | null;
  onMainDetailsLoaded?: (data: MainDetailsData) => void;
};

export default function RafMainDetailsForm({
  flight,
  mainDetails,
  onMainDetailsLoaded,
}: RafMainDetailsFormProps) {
  const serial = nsFormSerialForFlight(flight);
  const displaySerial = displayScheduledAirlinesTableSerial(flight);

  const [form, setForm] = useState<FormState>(() => ({
    airline: mainDetails?.airlineName ?? flight.airline ?? '',
    routing: flight.route ?? '',
    flightNo: mainDetails?.flightCode ?? flight.flightNo ?? '',
    aircraft: mainDetails?.aircraftType ?? flight.aircraft ?? '',
    operation: flight.typeOfHandling || 'Turnaround',
    airlineCode: flight.airlineCode ?? '',
    typeOfFlight: flight.cateOfFlight || flight.flightType || 'Domestic',
    staDate: flight.staDate ?? '',
    stdDate: flight.stdDate ?? '',
    ataDate: flight.staDate ?? '',
    atdDate: flight.stdDate ?? '',
    staTime: flight.staTime ?? '',
    stdTime: flight.stdTime ?? '',
    ataTime: flight.staTime ?? '',
    atdTime: flight.stdTime ?? '',
    returnToRamp: false,
    terminalCode: 'T2',
    cancelled: Boolean(flight.isCancelled),
    ghRemarks: '',
    airlineRemarks: '',
    listType: 'Equipment',
    ghRep: '',
    airlineRep: '',
  }));

  const [services, setServices] = useState<ServiceRow[]>([]);
  const [verifiedBy, setVerifiedBy] = useState('');
  const [verifiedAt, setVerifiedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [airlineOptions, setAirlineOptions] = useState<string[]>([]);
  const [aircraftOptions, setAircraftOptions] = useState<string[]>([]);
  const [terminalOptions, setTerminalOptions] = useState<string[]>(TERMINAL_FALLBACK);
  const [serviceCatalog, setServiceCatalog] = useState<string[]>([]);
  const [draftService, setDraftService] = useState<ServiceRow>(() =>
    emptyService({
      fromDate: flight.staDate ?? '',
      fromTime: flight.staTime ?? '',
      toDate: flight.stdDate ?? '',
      toTime: flight.stdTime ?? '',
    }),
  );

  const patchForm = useCallback((patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const loadLookups = useCallback(async () => {
    try {
      const [airlines, aircraft, terminals, otherServices, rafAirlines] =
        await Promise.all([
          fetchFlightsReferenceAirlines().catch(() => []),
          fetchCreationReferenceAircraft().catch(() => []),
          fetchAdvanceTerminalCodes(TERMINAL_FALLBACK).catch(() => TERMINAL_FALLBACK),
          advanceList(ADVANCE_PATHS.otherServices).catch(() => []),
          advanceList(ADVANCE_PATHS.rafAirline).catch(() => []),
        ]);

      const airlineNames = new Set<string>();
      for (const row of airlines as Array<Record<string, unknown>>) {
        const name = String(row.airline ?? row.name ?? row.Airline ?? '').trim();
        if (name) airlineNames.add(name);
      }
      for (const row of rafAirlines as Array<Record<string, unknown>>) {
        const name = String(row.airline ?? '').trim();
        if (name) airlineNames.add(name);
      }
      if (form.airline) airlineNames.add(form.airline);
      setAirlineOptions([...airlineNames].sort((a, b) => a.localeCompare(b)));

      const acTypes = new Set<string>();
      for (const row of aircraft as Array<Record<string, unknown>>) {
        const t = String(row.acType ?? row.aircraftType ?? row.type ?? '').trim();
        if (t) acTypes.add(t);
      }
      if (form.aircraft) acTypes.add(form.aircraft);
      setAircraftOptions([...acTypes].sort((a, b) => a.localeCompare(b)));

      setTerminalOptions(terminals.length ? terminals : TERMINAL_FALLBACK);

      const svcNames = new Set<string>();
      for (const row of otherServices as Array<Record<string, unknown>>) {
        const d = advanceDocId(row);
        const name = String(d.service ?? '').trim();
        if (name) svcNames.add(name);
      }
      setServiceCatalog([...svcNames].sort((a, b) => a.localeCompare(b)));
    } catch {
      /* keep defaults */
    }
  }, [form.airline, form.aircraft]);

  const loadSaved = useCallback(async () => {
    if (!serial) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const fhr = await fetchFhrCollectionFlightLean(serial);
      const mdRaw = fhr?.mainDetails;
      const md =
        mdRaw && typeof mdRaw === 'object' && !Array.isArray(mdRaw)
          ? (mdRaw as Record<string, unknown>)
          : null;
      const adhocRaw = fhr?.rafAdhocDetails;
      const adhoc =
        adhocRaw && typeof adhocRaw === 'object' && !Array.isArray(adhocRaw)
          ? (adhocRaw as Record<string, unknown>)
          : null;

      const next: FormState = {
        airline: String(adhoc?.airline ?? md?.Airline ?? md?.airlineName ?? flight.airline ?? '').trim(),
        routing: String(adhoc?.routing ?? md?.Route ?? flight.route ?? '').trim(),
        flightNo: String(
          adhoc?.flightNo ?? md?.FlightNo ?? md?.flightCode ?? flight.flightNo ?? '',
        ).trim(),
        aircraft: String(
          adhoc?.aircraft ?? md?.TypeCraft ?? md?.aircraftType ?? flight.aircraft ?? '',
        ).trim(),
        operation: String(
          adhoc?.operation ?? md?.TypeofHandling ?? flight.typeOfHandling ?? 'Turnaround',
        ).trim(),
        airlineCode: String(
          adhoc?.airlineCode ?? md?.Arline_Code ?? flight.airlineCode ?? '',
        ).trim(),
        typeOfFlight: String(
          adhoc?.typeOfFlight ??
            md?.Typeofflight ??
            md?.Cate_of_Flight ??
            flight.cateOfFlight ??
            flight.flightType ??
            'Domestic',
        ).trim(),
        staDate: String(adhoc?.staDate ?? md?.STADate ?? flight.staDate ?? '').trim(),
        stdDate: String(adhoc?.stdDate ?? md?.STDDate ?? flight.stdDate ?? '').trim(),
        ataDate: String(adhoc?.ataDate ?? md?.ATADate ?? flight.staDate ?? '').trim(),
        atdDate: String(adhoc?.atdDate ?? md?.ATDDate ?? flight.stdDate ?? '').trim(),
        staTime: String(adhoc?.staTime ?? md?.STATime ?? flight.staTime ?? '').trim(),
        stdTime: String(adhoc?.stdTime ?? md?.STDTime ?? flight.stdTime ?? '').trim(),
        ataTime: String(adhoc?.ataTime ?? md?.ATATime ?? flight.staTime ?? '').trim(),
        atdTime: String(adhoc?.atdTime ?? md?.ATDTime ?? flight.stdTime ?? '').trim(),
        returnToRamp: Boolean(adhoc?.returnToRamp ?? md?.returnToRamp),
        terminalCode: String(
          adhoc?.terminalCode ?? md?.Terminal ?? 'T2',
        ).trim() || 'T2',
        cancelled: Boolean(adhoc?.cancelled ?? md?.flightCancelled ?? flight.isCancelled),
        ghRemarks: String(adhoc?.ghRemarks ?? '').trim(),
        airlineRemarks: String(adhoc?.airlineRemarks ?? '').trim(),
        listType: (['Equipment', 'Manpower', 'Other'] as ListType[]).includes(
          String(adhoc?.listType ?? 'Equipment') as ListType,
        )
          ? (String(adhoc?.listType ?? 'Equipment') as ListType)
          : 'Equipment',
        ghRep: String(
          adhoc?.ghRep ?? md?.PAX_Airline_SignByDate ?? md?.ghRep ?? '',
        ).trim(),
        airlineRep: String(adhoc?.airlineRep ?? md?.airrep ?? md?.airlineRep ?? '').trim(),
      };
      setForm(next);
      setVerifiedBy(String(adhoc?.verifiedBy ?? '').trim());
      setVerifiedAt(String(adhoc?.verifiedAt ?? '').trim());

      const svcList = Array.isArray(adhoc?.services) ? adhoc!.services : [];
      const mapped = svcList
        .map(normalizeServiceRow)
        .filter((row): row is ServiceRow => row != null);
      setServices(mapped);

      setDraftService(
        emptyService({
          fromDate: next.staDate,
          fromTime: next.staTime,
          toDate: next.stdDate,
          toTime: next.stdTime,
          uses: calcUses(next.staTime, next.stdTime),
        }),
      );

      if (md && onMainDetailsLoaded) {
        onMainDetailsLoaded({
          ...(md as unknown as MainDetailsData),
          airlineName: next.airline,
          flightCode: next.flightNo,
          aircraftType: next.aircraft,
        });
      }
    } catch {
      /* keep flight defaults */
    } finally {
      setLoading(false);
    }
  }, [serial, flight, onMainDetailsLoaded]);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  const airlineDropdown = useMemo(
    () => airlineOptions.map((v) => ({ value: v, label: v })),
    [airlineOptions],
  );
  const aircraftDropdown = useMemo(
    () => aircraftOptions.map((v) => ({ value: v, label: v })),
    [aircraftOptions],
  );
  const operationDropdown = useMemo(
    () => OPS_TYPE_OPTIONS.map((v) => ({ value: v, label: v })),
    [],
  );
  const typeFlightDropdown = useMemo(
    () => TYPE_OF_FLIGHT_OPTIONS.map((v) => ({ value: v, label: v })),
    [],
  );
  const terminalDropdown = useMemo(
    () => terminalOptions.map((v) => ({ value: v, label: v })),
    [terminalOptions],
  );
  const serviceDropdown = useMemo(
    () => serviceCatalog.map((v) => ({ value: v, label: v })),
    [serviceCatalog],
  );

  const patchDraft = (patch: Partial<ServiceRow>) => {
    setDraftService((prev) => {
      const next = { ...prev, ...patch };
      next.uses = calcUses(next.fromTime, next.toTime) || next.uses;
      if (next.uses && !String(next.remarks).includes('USED')) {
        next.remarks = `${next.uses} (USED)`;
      }
      return next;
    });
  };

  const handleAddService = () => {
    if (!draftService.service.trim()) {
      toast.warning('Select or enter a service before adding.');
      return;
    }
    const uses = calcUses(draftService.fromTime, draftService.toTime) || draftService.uses;
    const row: ServiceRow = {
      ...draftService,
      id: newServiceId(),
      uses,
      remarks: draftService.remarks.trim() || (uses ? `${uses} (USED)` : ''),
      weight: draftService.weight.trim() || '0.00',
    };
    setServices((prev) => [...prev, row]);
    setDraftService(
      emptyService({
        fromDate: form.staDate,
        fromTime: form.staTime,
        toDate: form.stdDate,
        toTime: form.stdTime,
        uses: calcUses(form.staTime, form.stdTime),
      }),
    );
  };

  const handleDeleteService = (id: string) => {
    setServices((prev) => prev.filter((s) => s.id !== id));
  };

  const handleVerifiedBy = () => {
    const label = getLoggedInUserLabel() || 'GSD';
    const now = new Date();
    const stamp = `${now.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    })} ${now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })}`;
    setVerifiedBy(label);
    setVerifiedAt(stamp);
    toast.success('Marked as verified');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serial) {
      toast.error('Missing flight serial.');
      return;
    }
    setSaving(true);
    try {
      const existing = await fetchFhrCollectionFlightLean(serial);
      const mdRaw = existing?.mainDetails;
      const mdObj =
        mdRaw && typeof mdRaw === 'object' && !Array.isArray(mdRaw)
          ? (mdRaw as Record<string, unknown>)
          : {};

      const n = Number(String(serial).replace(/\D/g, ''));
      const serialNum = Number.isFinite(n) && n > 0 ? n : undefined;

      const rafAdhocDetails = {
        airline: form.airline,
        routing: form.routing,
        flightNo: form.flightNo,
        aircraft: form.aircraft,
        operation: form.operation,
        airlineCode: form.airlineCode,
        typeOfFlight: form.typeOfFlight,
        staDate: form.staDate,
        stdDate: form.stdDate,
        ataDate: form.ataDate,
        atdDate: form.atdDate,
        staTime: form.staTime,
        stdTime: form.stdTime,
        ataTime: form.ataTime,
        atdTime: form.atdTime,
        returnToRamp: form.returnToRamp,
        terminalCode: form.terminalCode,
        cancelled: form.cancelled,
        ghRemarks: form.ghRemarks,
        airlineRemarks: form.airlineRemarks,
        listType: form.listType,
        ghRep: form.ghRep,
        airlineRep: form.airlineRep,
        verifiedBy,
        verifiedAt,
        services: services.map((s) => ({
          ...s,
          from: `${s.fromDate} ${s.fromTime}`.trim(),
          to: `${s.toDate} ${s.toTime}`.trim(),
        })),
      };

      const mainDetailsPayload = {
        ...mdObj,
        ...(serialNum ? { SerialNo: serialNum, flightSerialNumber: serialNum } : {}),
        Airline: form.airline,
        airlineName: form.airline,
        Arline_Code: form.airlineCode,
        FlightNo: form.flightNo,
        flightCode: form.flightNo,
        ArrivalFltNo: form.flightNo,
        DepartureFltNo: form.flightNo,
        Route: form.routing,
        TypeCraft: form.aircraft,
        aircraftType: form.aircraft,
        TypeofHandling: form.operation,
        Typeofflight: form.typeOfFlight,
        Cate_of_Flight: form.typeOfFlight,
        STADate: form.staDate,
        STDDate: form.stdDate,
        ATADate: form.ataDate,
        ATDDate: form.atdDate,
        STATime: form.staTime,
        STDTime: form.stdTime,
        ATATime: form.ataTime,
        ATDTime: form.atdTime,
        Terminal: form.terminalCode,
        returnToRamp: form.returnToRamp,
        flightCancelled: form.cancelled,
        PAX_Airline_SignByDate: form.ghRep,
        airrep: form.airlineRep,
      };

      await putFhrCollectionFlightMerge(
        serial,
        {
          mainDetails: mainDetailsPayload,
          rafAdhocDetails,
        },
        'raf_main_details_adhoc',
      );

      onMainDetailsLoaded?.(mainDetailsPayload as unknown as MainDetailsData);
      toast.success('Main details saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save main details');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition hover:border-emerald-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30';
  const labelClass = 'mb-1 block text-xs font-medium text-gray-600';

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 p-8 text-sm text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-600" aria-hidden />
        Loading main details…
      </div>
    );
  }

  return (
    <div className={FLIGHT_DETAILS_FORM_ROOT_CLASS}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 bg-emerald-600 px-3 py-3 text-white sm:px-4">
        <h2 className="text-base font-semibold sm:text-lg">Equipment Detail / Ad-Hoc Equipment</h2>
        <span className="text-xs text-emerald-100 sm:text-sm">
          SL No : <span className="font-semibold text-emerald-50">{displaySerial}</span>
        </span>
      </div>

      <form onSubmit={(e) => void handleSave(e)} className={FLIGHT_DETAILS_FORM_BODY_CLASS}>
        <div className={FLIGHT_DETAILS_SECTION_CLASS}>
          <div className={FLIGHT_DETAILS_FIELD_GRID_CLASS}>
            <div>
              <label className={labelClass}>Airline</label>
              <AdminRadioDropdown
                value={form.airline}
                onChange={(v) => patchForm({ airline: v })}
                options={airlineDropdown}
                placeholder="Select airline"
              />
              <FormFieldError />
            </div>
            <div>
              <label className={labelClass}>Routing</label>
              <input
                type="text"
                value={form.routing}
                onChange={(e) => patchForm({ routing: e.target.value.toUpperCase() })}
                className={inputClass}
              />
              <FormFieldError />
            </div>
            <div>
              <label className={labelClass}>Flight No</label>
              <input
                type="text"
                value={form.flightNo}
                onChange={(e) => patchForm({ flightNo: e.target.value.toUpperCase() })}
                className={inputClass}
              />
              <FormFieldError />
            </div>

            <div>
              <label className={labelClass}>Aircraft</label>
              <AdminRadioDropdown
                value={form.aircraft}
                onChange={(v) => patchForm({ aircraft: v })}
                options={aircraftDropdown}
                placeholder="Select aircraft"
              />
              <FormFieldError />
            </div>
            <div>
              <label className={labelClass}>Operation</label>
              <AdminRadioDropdown
                value={form.operation}
                onChange={(v) => patchForm({ operation: v })}
                options={operationDropdown}
              />
              <FormFieldError />
            </div>
            <div>
              <label className={labelClass}>Airline Code</label>
              <input
                type="text"
                value={form.airlineCode}
                onChange={(e) => patchForm({ airlineCode: e.target.value.toUpperCase() })}
                className={inputClass}
              />
              <FormFieldError />
            </div>

            <div>
              <label className={labelClass}>Type Of Flight</label>
              <AdminRadioDropdown
                value={form.typeOfFlight}
                onChange={(v) => patchForm({ typeOfFlight: v })}
                options={typeFlightDropdown}
              />
              <FormFieldError />
            </div>
            <div>
              <label className={labelClass}>STA Date</label>
              <DatePicker
                value={form.staDate}
                onChange={(v) => patchForm({ staDate: v })}
                ariaLabel="STA date"
              />
              <FormFieldError />
            </div>
            <div>
              <label className={labelClass}>STD Date</label>
              <DatePicker
                value={form.stdDate}
                onChange={(v) => patchForm({ stdDate: v })}
                ariaLabel="STD date"
              />
              <FormFieldError />
            </div>

            <div>
              <label className={labelClass}>ATA Date</label>
              <DatePicker
                value={form.ataDate}
                onChange={(v) => patchForm({ ataDate: v })}
                ariaLabel="ATA date"
              />
              <FormFieldError />
            </div>
            <div>
              <label className={labelClass}>ATD Date</label>
              <DatePicker
                value={form.atdDate}
                onChange={(v) => patchForm({ atdDate: v })}
                ariaLabel="ATD date"
              />
              <FormFieldError />
            </div>
            <div>
              <label className={labelClass}>STA Time</label>
              <TimeSelect24
                value={form.staTime}
                onChange={(v) => patchForm({ staTime: v })}
                title="STA time"
              />
              <FormFieldError />
            </div>

            <div>
              <label className={labelClass}>STD Time</label>
              <TimeSelect24
                value={form.stdTime}
                onChange={(v) => patchForm({ stdTime: v })}
                title="STD time"
              />
              <FormFieldError />
            </div>
            <div>
              <label className={labelClass}>ATA Time</label>
              <TimeSelect24
                value={form.ataTime}
                onChange={(v) => patchForm({ ataTime: v })}
                title="ATA time"
              />
              <FormFieldError />
            </div>
            <div>
              <label className={labelClass}>ATD Time</label>
              <TimeSelect24
                value={form.atdTime}
                onChange={(v) => patchForm({ atdTime: v })}
                title="ATD time"
              />
              <FormFieldError />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="flex flex-wrap items-end gap-4 lg:col-span-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.returnToRamp}
                  onChange={(e) => patchForm({ returnToRamp: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                Return to ramp
              </label>
              <div className="min-w-[8rem] flex-1">
                <label className={labelClass}>Terminal Code</label>
                <AdminRadioDropdown
                  value={form.terminalCode}
                  onChange={(v) => patchForm({ terminalCode: v })}
                  options={terminalDropdown}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.cancelled}
                  onChange={(e) => patchForm({ cancelled: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                Cancelled
              </label>
            </div>
            <div className="lg:col-span-4">
              <label className={labelClass}>GH Remarks</label>
              <textarea
                value={form.ghRemarks}
                onChange={(e) => patchForm({ ghRemarks: e.target.value })}
                rows={3}
                className={inputClass}
              />
            </div>
            <div className="lg:col-span-4">
              <label className={labelClass}>Airline Remarks</label>
              <textarea
                value={form.airlineRemarks}
                onChange={(e) => patchForm({ airlineRemarks: e.target.value })}
                rows={3}
                className={inputClass}
              />
            </div>
          </div>

          <fieldset className="mt-4">
            <legend className={labelClass}>Select List</legend>
            <div className="flex flex-wrap gap-4">
              {LIST_TYPE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 text-sm text-gray-700"
                >
                  <input
                    type="radio"
                    name="raf-list-type"
                    checked={form.listType === opt.value}
                    onChange={() => patchForm({ listType: opt.value })}
                    className="h-4 w-4 border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>

          <p className="mt-4 text-sm font-medium text-red-600">
            {formatVerifiedStamp(verifiedBy, verifiedAt)}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleVerifiedBy}
              className="rounded-lg border border-gray-300 bg-gray-100 px-4 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-200"
            >
              Verified By
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              Save
            </button>
          </div>

          <div className="mt-6 space-y-3 border-t border-gray-100 pt-5">
            <h3 className="text-sm font-semibold text-gray-900">
              Representative signatures
            </h3>
            <p className="text-xs text-gray-500">
              Enter GH and Airline representative names manually (no dropdown). Then capture
              digital signatures below.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="raf-gh-rep">
                  GH Representative
                </label>
                <input
                  id="raf-gh-rep"
                  type="text"
                  value={form.ghRep}
                  onChange={(e) => patchForm({ ghRep: e.target.value })}
                  className={inputClass}
                  placeholder="Type GH representative name"
                  autoComplete="off"
                />
                <FormFieldError />
              </div>
              <div>
                <label className={labelClass} htmlFor="raf-airline-rep">
                  Airline Representative
                </label>
                <input
                  id="raf-airline-rep"
                  type="text"
                  value={form.airlineRep}
                  onChange={(e) => patchForm({ airlineRep: e.target.value })}
                  className={inputClass}
                  placeholder="Type airline representative name"
                  autoComplete="off"
                />
                <FormFieldError />
              </div>
            </div>
            {serial ? (
              <DigitalSignaturesSection
                serialKey={serial}
                ghRepresentativeName={form.ghRep}
                airlineRepresentativeName={form.airlineRep}
                airlineNameOptional
              />
            ) : (
              <p className="text-xs text-amber-700">
                Serial required before signatures can be captured.
              </p>
            )}
          </div>
        </div>

        <div className={cn(FLIGHT_DETAILS_SECTION_CLASS, 'overflow-hidden p-0')}>
          <div className="border-b border-teal-700 bg-teal-600 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-white">Services</h3>
          </div>

          <div className="space-y-3 border-b border-gray-100 bg-gray-50 p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <label className={labelClass}>Service</label>
                {serviceCatalog.length > 0 ? (
                  <AdminRadioDropdown
                    value={draftService.service}
                    onChange={(v) => patchDraft({ service: v })}
                    options={serviceDropdown}
                    placeholder="Select service"
                  />
                ) : (
                  <input
                    type="text"
                    value={draftService.service}
                    onChange={(e) => patchDraft({ service: e.target.value })}
                    className={inputClass}
                    placeholder="Service name"
                  />
                )}
              </div>
              <div>
                <label className={labelClass}>Unit</label>
                <input
                  type="text"
                  value={draftService.unit}
                  onChange={(e) => patchDraft({ unit: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Quantity</label>
                <input
                  type="text"
                  value={draftService.quantity}
                  onChange={(e) => patchDraft({ quantity: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Weight</label>
                <input
                  type="text"
                  value={draftService.weight}
                  onChange={(e) => patchDraft({ weight: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>From Date</label>
                <DatePicker
                  value={draftService.fromDate}
                  onChange={(v) => patchDraft({ fromDate: v })}
                  ariaLabel="Service from date"
                />
              </div>
              <div>
                <label className={labelClass}>From Time</label>
                <TimeSelect24
                  value={draftService.fromTime}
                  onChange={(v) => patchDraft({ fromTime: v })}
                  title="Service from time"
                />
              </div>
              <div>
                <label className={labelClass}>To Date</label>
                <DatePicker
                  value={draftService.toDate}
                  onChange={(v) => patchDraft({ toDate: v })}
                  ariaLabel="Service to date"
                />
              </div>
              <div>
                <label className={labelClass}>To Time</label>
                <TimeSelect24
                  value={draftService.toTime}
                  onChange={(v) => patchDraft({ toTime: v })}
                  title="Service to time"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleAddService}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add Service
              </button>
            </div>
          </div>

          <div className={FLIGHT_DETAILS_H_SCROLL_CLASS}>
            <table className="w-full min-w-[56rem] border-collapse text-sm">
              <thead>
                <tr className="bg-teal-600 text-white">
                  <th className="border border-teal-700 px-2 py-2 text-left font-semibold">
                    Services
                  </th>
                  <th className="border border-teal-700 px-2 py-2 text-left font-semibold">Unit</th>
                  <th className="border border-teal-700 px-2 py-2 text-left font-semibold">
                    Quantity
                  </th>
                  <th className="border border-teal-700 px-2 py-2 text-left font-semibold">
                    Weight
                  </th>
                  <th className="border border-teal-700 px-2 py-2 text-left font-semibold">From</th>
                  <th className="border border-teal-700 px-2 py-2 text-left font-semibold">To</th>
                  <th className="border border-teal-700 px-2 py-2 text-left font-semibold">Uses</th>
                  <th className="border border-teal-700 px-2 py-2 text-left font-semibold">
                    Remarks
                  </th>
                  <th className="border border-teal-700 px-2 py-2 text-left font-semibold" />
                </tr>
              </thead>
              <tbody>
                {services.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="border border-gray-200 px-3 py-6 text-center text-gray-500"
                    >
                      No services added yet.
                    </td>
                  </tr>
                ) : (
                  services.map((row) => (
                    <tr key={row.id} className="bg-white">
                      <td className="border border-gray-200 px-2 py-2 text-gray-900">
                        {row.service || '—'}
                      </td>
                      <td className="border border-gray-200 px-2 py-2 text-gray-700">
                        {row.unit || '—'}
                      </td>
                      <td className="border border-gray-200 px-2 py-2 text-gray-700">
                        {row.quantity || '—'}
                      </td>
                      <td className="border border-gray-200 px-2 py-2 text-gray-700">
                        {row.weight || '0.00'}
                      </td>
                      <td className="border border-gray-200 px-2 py-2 text-xs text-gray-700">
                        {`${row.fromDate} ${row.fromTime}`.trim() || '—'}
                      </td>
                      <td className="border border-gray-200 px-2 py-2 text-xs text-gray-700">
                        {`${row.toDate} ${row.toTime}`.trim() || '—'}
                      </td>
                      <td className="border border-gray-200 px-2 py-2 text-gray-700">
                        {row.uses || '—'}
                      </td>
                      <td className="border border-gray-200 px-2 py-2 text-gray-700">
                        {row.remarks || '—'}
                      </td>
                      <td className="border border-gray-200 px-2 py-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteService(row.id)}
                          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </form>
    </div>
  );
}
