'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eraser, Loader2, Save, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { DatePicker } from '@/components/ui/DatePicker';
import { TimeSelect24 } from '@/components/ui/TimeSelect24';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  fetchFhrCollectionFlightLean,
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
  FLIGHT_DETAILS_SECTION_CLASS,
} from '@/components/fris/flights/scheduledairlines/flightDetailsFormLayout';
import type { RafCleaningFlags } from './RampAssistanceFlightsTable';

export type RafCleaningKind = 'deep' | 'night-halt' | 'exterior';

type CleaningEntry = {
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
  duration: string;
  supervisor: string;
  remarks: string;
};

type RafCleaningServicesPayload = {
  deep?: CleaningEntry;
  nightHalt?: CleaningEntry;
  exterior?: CleaningEntry;
};

const EMPTY_ENTRY: CleaningEntry = {
  fromDate: '',
  fromTime: '',
  toDate: '',
  toTime: '',
  duration: '',
  supervisor: '',
  remarks: '',
};

const KIND_META: Record<
  RafCleaningKind,
  { key: keyof RafCleaningServicesPayload; label: string; flag: keyof RafCleaningFlags }
> = {
  deep: { key: 'deep', label: 'Deep Cleaning', flag: 'deepCleaning' },
  'night-halt': {
    key: 'nightHalt',
    label: 'Night Halt Cleaning',
    flag: 'nightHaltCleaning',
  },
  exterior: {
    key: 'exterior',
    label: 'Exterior Cleaning',
    flag: 'exteriorCleaning',
  },
};

function parseCleaningDay(value: string): Date | null {
  const s = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (!dmy) return null;
  const day = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  if (
    day.getFullYear() !== Number(dmy[3]) ||
    day.getMonth() !== Number(dmy[2]) - 1 ||
    day.getDate() !== Number(dmy[1])
  ) {
    return null;
  }
  return day;
}

function supervisorLettersOnly(value: string): string {
  return value.replace(/[^A-Za-z ]/g, '');
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

function calcDurationHhMm(fromTime: string, toTime: string): string {
  const fromMins = timeToMinutes(fromTime);
  const toMins = timeToMinutes(toTime);
  if (fromMins == null || toMins == null) return '';
  let diffMins = toMins - fromMins;
  if (diffMins < 0) diffMins += 24 * 60;
  const h = Math.floor(diffMins / 60);
  const m = diffMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function normalizeEntry(raw: unknown): CleaningEntry {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_ENTRY };
  const o = raw as Record<string, unknown>;
  return {
    fromDate: String(o.fromDate ?? o.clFromDate ?? '').trim(),
    fromTime: String(o.fromTime ?? o.clFromTime ?? '').trim(),
    toDate: String(o.toDate ?? o.clEndDate ?? '').trim(),
    toTime: String(o.toTime ?? o.clEndTime ?? '').trim(),
    duration: String(o.duration ?? '').trim(),
    supervisor: String(o.supervisor ?? '').trim(),
    remarks: String(o.remarks ?? '').trim(),
  };
}

export type RafCleaningServicesFormProps = {
  flight: FlightData;
  mainDetails?: MainDetailsData | null;
  cleaningFlags?: RafCleaningFlags;
  initialKind?: RafCleaningKind | null;
};

export default function RafCleaningServicesForm({
  flight,
  mainDetails,
  cleaningFlags,
  initialKind = null,
}: RafCleaningServicesFormProps) {
  const displayAirline = mainDetails?.airlineName ?? flight.airline;
  const displayFlightNo = mainDetails?.flightCode ?? flight.flightNo;
  const displayAircraft = mainDetails?.aircraftType ?? flight.aircraft;
  const serial = nsFormSerialForFlight(flight);

  const enabledKinds = useMemo(() => {
    const flags = cleaningFlags ?? {
      deepCleaning: true,
      nightHaltCleaning: true,
      exteriorCleaning: true,
    };
    return (Object.keys(KIND_META) as RafCleaningKind[]).filter(
      (kind) => flags[KIND_META[kind].flag],
    );
  }, [cleaningFlags]);

  const [activeKind, setActiveKind] = useState<RafCleaningKind>(() => {
    if (initialKind && enabledKinds.includes(initialKind)) return initialKind;
    return enabledKinds[0] ?? 'deep';
  });
  const [entries, setEntries] = useState<RafCleaningServicesPayload>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialKind && enabledKinds.includes(initialKind)) {
      setActiveKind(initialKind);
      return;
    }
    if (enabledKinds.length > 0 && !enabledKinds.includes(activeKind)) {
      setActiveKind(enabledKinds[0]);
    }
  }, [initialKind, enabledKinds, activeKind]);

  const load = useCallback(async () => {
    if (!serial) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const fhr = await fetchFhrCollectionFlightLean(serial);
      const stored = fhr?.rafCleaningServices;
      const next: RafCleaningServicesPayload = {};
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
        const s = stored as Record<string, unknown>;
        next.deep = normalizeEntry(s.deep);
        next.nightHalt = normalizeEntry(s.nightHalt);
        next.exterior = normalizeEntry(s.exterior);
      }

      const ramp = fhr?.rampDetails1;
      if (ramp && typeof ramp === 'object' && !Array.isArray(ramp)) {
        const r = ramp as Record<string, unknown>;
        const fromRamp = normalizeEntry({
          fromDate: r.CleaningFr ?? r.cleaningStartedDate,
          fromTime: r.cleaningStartedTime,
          toDate: r.CleaningTo ?? r.cleaningClosedDate,
          toTime: r.cleaningClosedTime,
          duration: r.cleaningDuration,
          supervisor: r.cleaningSupervisor ?? r.supervisor,
          remarks: r.cleaningRemarks ?? r.remarks,
        });
        const hasRamp =
          fromRamp.fromDate ||
          fromRamp.fromTime ||
          fromRamp.toDate ||
          fromRamp.toTime;
        if (hasRamp) {
          if (!next.deep || !(next.deep.fromDate || next.deep.fromTime)) {
            next.deep = fromRamp;
          }
        }
      }

      setEntries(next);
    } catch {
      setEntries({});
    } finally {
      setLoading(false);
    }
  }, [serial]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = entries[KIND_META[activeKind].key] ?? EMPTY_ENTRY;
  const fromDay = useMemo(() => parseCleaningDay(current.fromDate), [current.fromDate]);
  const toDay = useMemo(() => parseCleaningDay(current.toDate), [current.toDate]);
  const fromExceedsEnd =
    fromDay != null && toDay != null && fromDay.getTime() > toDay.getTime();
  const durationDisplay =
    calcDurationHhMm(current.fromTime, current.toTime) || current.duration || '—';

  const patchCurrent = (patch: Partial<CleaningEntry>) => {
    const key = KIND_META[activeKind].key;
    setEntries((prev) => {
      const base = prev[key] ?? { ...EMPTY_ENTRY };
      const nextEntry = { ...base, ...patch };
      nextEntry.duration =
        calcDurationHhMm(nextEntry.fromTime, nextEntry.toTime) || nextEntry.duration;
      return { ...prev, [key]: nextEntry };
    });
  };

  const handleClearForm = () => {
    const key = KIND_META[activeKind].key;
    setEntries((prev) => ({ ...prev, [key]: { ...EMPTY_ENTRY } }));
    toast.success(`${KIND_META[activeKind].label} form cleared`);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serial) {
      toast.error('Missing flight serial.');
      return;
    }
    const key = KIND_META[activeKind].key;
    const entry = {
      ...(entries[key] ?? EMPTY_ENTRY),
      supervisor: (entries[key] ?? EMPTY_ENTRY).supervisor.trim().replace(/\s+/g, ' '),
      duration:
        calcDurationHhMm(
          (entries[key] ?? EMPTY_ENTRY).fromTime,
          (entries[key] ?? EMPTY_ENTRY).toTime,
        ) || (entries[key] ?? EMPTY_ENTRY).duration,
    };
    if (entry.supervisor && !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(entry.supervisor)) {
      toast.error('Supervisor may only contain letters.');
      return;
    }
    const payload: RafCleaningServicesPayload = {
      ...entries,
      [key]: entry,
    };

    if (fromExceedsEnd) {
      toast.error('Cleaning from date cannot be later than the cleaning end date.');
      return;
    }

    setSaving(true);
    try {
      const existing = await fetchFhrCollectionFlightLean(serial);
      const rampRaw = existing?.rampDetails1;
      const rampObj =
        rampRaw != null && typeof rampRaw === 'object' && !Array.isArray(rampRaw)
          ? (rampRaw as Record<string, unknown>)
          : {};

      await putFhrCollectionFlightMerge(
        serial,
        {
          rafCleaningServices: payload,
          rampDetails1: {
            ...rampObj,
            CleaningFr: entry.fromDate,
            cleaningStartedDate: entry.fromDate,
            cleaningStartedTime: entry.fromTime,
            CleaningTo: entry.toDate,
            cleaningClosedDate: entry.toDate,
            cleaningClosedTime: entry.toTime,
            cleaningDuration: entry.duration,
            cleaningSupervisor: entry.supervisor,
            cleaningRemarks: entry.remarks,
          },
        },
        'raf_cleaning_services',
      );
      setEntries(payload);
      toast.success(`${KIND_META[activeKind].label} saved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save cleaning services');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none transition hover:border-emerald-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500';
  const labelClass = 'mb-1.5 block text-xs font-medium text-gray-600';

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 p-8 text-sm text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-600" aria-hidden />
        Loading cleaning services…
      </div>
    );
  }

  if (enabledKinds.length === 0) {
    return (
      <div className={FLIGHT_DETAILS_FORM_ROOT_CLASS}>
        <div className={FLIGHT_DETAILS_FORM_BODY_CLASS}>
          <div className={FLIGHT_DETAILS_SECTION_CLASS}>
            <p className="text-sm text-gray-600">
              No cleaning services enabled for this airline. Enable Deep / Night Halt /
              Exterior under Advance → RAF Airline.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={FLIGHT_DETAILS_FORM_ROOT_CLASS}>
      <form onSubmit={(e) => void handleSave(e)} className={FLIGHT_DETAILS_FORM_BODY_CLASS}>
        <div className={FLIGHT_DETAILS_SECTION_CLASS}>
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
              <Sparkles className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900">Cleaning Services</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Sl. No. {displayScheduledAirlinesTableSerial(flight)} · {displayAirline} ·{' '}
                {displayFlightNo} · {displayAircraft}
              </p>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Cleaning type">
            {enabledKinds.map((kind) => (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={activeKind === kind}
                onClick={() => setActiveKind(kind)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-sm font-medium transition',
                  activeKind === kind
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-emerald-300 hover:bg-emerald-50/60',
                )}
              >
                {KIND_META[kind].label}
              </button>
            ))}
          </div>

          <div className={FLIGHT_DETAILS_FIELD_GRID_CLASS}>
            <div>
              <label className={labelClass} htmlFor="field-clFromDate">Cl. From Date</label>
              <DatePicker
                id="field-clFromDate"
                value={current.fromDate}
                onChange={(v) => patchCurrent({ fromDate: v })}
                ariaLabel="Cleaning from date"
                maxDate={toDay ?? undefined}
              />
              <FormFieldError
                id="field-clFromDate-error"
                message={
                  fromExceedsEnd
                    ? 'Cleaning from date cannot be later than the cleaning end date.'
                    : undefined
                }
              />
            </div>
            <div>
              <label className={labelClass}>Cl. From Time</label>
              <TimeSelect24
                value={current.fromTime}
                onChange={(v) => patchCurrent({ fromTime: v })}
                title="Cleaning from time"
              />
              <FormFieldError />
            </div>
            <div>
              <label className={labelClass} htmlFor="field-clEndDate">Cl. To Date</label>
              <DatePicker
                id="field-clEndDate"
                value={current.toDate}
                onChange={(v) => patchCurrent({ toDate: v })}
                ariaLabel="Cleaning to date"
                minDate={fromDay ?? undefined}
              />
              <FormFieldError />
            </div>
            <div>
              <label className={labelClass}>Cl. To Time</label>
              <TimeSelect24
                value={current.toTime}
                onChange={(v) => patchCurrent({ toTime: v })}
                title="Cleaning to time"
              />
              <FormFieldError />
            </div>
            <div>
              <label className={labelClass}>Duration</label>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-700">
                {durationDisplay}
              </div>
              <p className="mt-1 text-xs text-gray-500">From start time to end time (HH:mm)</p>
            </div>
            <div>
              <label className={labelClass} htmlFor="field-cleaningSupervisor">Supervisor</label>
              <input
                id="field-cleaningSupervisor"
                type="text"
                value={current.supervisor}
                onChange={(e) => patchCurrent({ supervisor: supervisorLettersOnly(e.target.value) })}
                className={inputClass}
                placeholder="Supervisor name"
                autoComplete="name"
              />
              <FormFieldError />
            </div>
            <div className="sm:col-span-2 md:col-span-3 lg:col-span-4">
              <label className={labelClass}>Remarks</label>
              <textarea
                value={current.remarks}
                onChange={(e) => patchCurrent({ remarks: e.target.value })}
                rows={3}
                className={inputClass}
                placeholder="Optional remarks"
              />
              <FormFieldError />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleClearForm}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-400 hover:bg-gray-50 disabled:opacity-60"
            >
              <Eraser className="h-4 w-4" aria-hidden />
              Clear form
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              Save {KIND_META[activeKind].label}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
