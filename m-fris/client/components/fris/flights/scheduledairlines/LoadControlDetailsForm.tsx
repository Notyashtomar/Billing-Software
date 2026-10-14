'use client';

import React, { useState, useEffect } from 'react';
import { Scale, Lock, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import {
  FlightData,
  MainDetailsData,
  LoadControlDetailsData,
  normalizeLoadControlDetailsData,
  loadControlDetailsFormToSavePayload,
  displayScheduledAirlinesTableSerial,
  nsFormSerialForFlight,
} from '@/utils/dataProcessor';
import {
  getNsRawFormSavedUrl,
  getRawFlightScheduleBySerialUrl,
} from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';
import { TimeSelect24 } from '@/components/ui/TimeSelect24';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { time24, type FieldErrors } from '@/lib/form-validation';
import { cn } from '@/lib/utils';
import {
  scheduleStaDateDisplay,
  scheduleStdDateDisplay,
  scheduleStaTimeNormalizedDisplay,
  scheduleStdTimeNormalizedDisplay,
} from './scheduledRowSchedule';
import { routingFromMainAndFlight } from './formRoutingFromMain';
import {
  FLIGHT_DETAILS_FIELD_GRID_CLASS,
  FLIGHT_DETAILS_FORM_BODY_CLASS,
  FLIGHT_DETAILS_FORM_ROOT_CLASS,
  FLIGHT_DETAILS_SECTION_CLASS,
} from './flightDetailsFormLayout';
import {
  sanitizeAlphanumeric,
  sanitizeDigits,
} from '@/components/fris/flights/terminalDetailsInputLimits';

const fetch = frisFetch;

const LC_FIELD_ORDER = [
  'loadingDiagramAt',
  'loadingSheetPrintedAt',
  'loadingSheetDeliveredAt',
  'flightPlanFieldAt',
] as const;
type LcField = (typeof LC_FIELD_ORDER)[number];

export interface LoadControlDetailsFormProps {
  flight: FlightData;
  showBackButton?: boolean;
  onBack?: () => void;
  mainDetails?: MainDetailsData | null;
  /** After save, refresh scheduled list locks / closed status from FHR. */
  onFhrLocksMayHaveChanged?: (slNo: string) => void;
}

type RawScheduleRow = {
  staDate?: string;
  stdDate?: string;
  staTime?: string;
  stdTime?: string;
  scheduleSource?: string;
};

export default function LoadControlDetailsForm({
  flight,
  mainDetails,
  onFhrLocksMayHaveChanged,
}: LoadControlDetailsFormProps) {
  const displayAirline = mainDetails?.airlineName ?? flight.airline;
  const displayFlightNo = mainDetails?.flightCode ?? flight.flightNo;
  const displayAircraft = mainDetails?.aircraftType ?? flight.aircraft;
  const [isLocked, setIsLocked] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExisting, setIsExisting] = useState(false);
  /** STA/STD from `raw_flight_data` (Schedule Setup / same collection as scheduled list). */
  const [scheduleFromRaw, setScheduleFromRaw] = useState<RawScheduleRow | null>(
    null,
  );

  useEffect(() => {
    if (!flight?.slNo) {
      setScheduleFromRaw(null);
      return;
    }
    const url = getRawFlightScheduleBySerialUrl(flight.slNo);
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((row: RawScheduleRow | null) => {
        if (
          row != null &&
          typeof row === 'object' &&
          !Array.isArray(row) &&
          (String(row.staDate ?? '').trim() || String(row.stdDate ?? '').trim())
        ) {
          setScheduleFromRaw(row);
        } else setScheduleFromRaw(null);
      })
      .catch(() => setScheduleFromRaw(null));
  }, [flight?.slNo]);

  const staDateDisplay = scheduleStaDateDisplay(flight, scheduleFromRaw);
  const stdDateDisplay = scheduleStdDateDisplay(flight, scheduleFromRaw);

  useEffect(() => {
    if (!flight?.slNo) return;
    setLoadingDiagramAt('');
    setLoadingSheetPrintedAt('');
    setLoadingSheetDeliveredAt('');
    setFlightPlanFieldAt('');
    setFic('');
    setAdc('');
    const url = getNsRawFormSavedUrl(
      'load-control-details',
      nsFormSerialForFlight(flight),
    );
    fetch(url)
      .then(async (res) => {
        if (!res.ok) return null;
        const text = await res.text();
        if (!text.trim()) return null;
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return null;
        }
      })
      .then((raw) => {
        const data = normalizeLoadControlDetailsData(raw);
        if (data) {
          setIsExisting(true);
          setAirlinesOperator(data.airlinesOperator ?? displayAirline ?? '');
          setRouting(
            routingFromMainAndFlight(data.routing, mainDetails, flight),
          );
          setAcType(data.acType ?? displayAircraft ?? '');
          setFlightNo(data.flightNo ?? displayFlightNo ?? '');
          setOperations(data.operations ?? 'Turnaround');
          if (data.loadingDiagramGivenAt != null)
            setLoadingDiagramAt(data.loadingDiagramGivenAt);
          if (data.loadingSheetPrintedAt != null)
            setLoadingSheetPrintedAt(data.loadingSheetPrintedAt);
          if (data.loadingSheetDeliveredAt != null)
            setLoadingSheetDeliveredAt(data.loadingSheetDeliveredAt);
          if (data.flightPlanFieldAt != null)
            setFlightPlanFieldAt(data.flightPlanFieldAt);
          setFic(sanitizeDigits(data.fic ?? '', 4));
          setAdc(sanitizeAlphanumeric(data.adc ?? '', 6));
        } else {
          setIsExisting(false);
          setRouting(routingFromMainAndFlight(undefined, mainDetails, flight));
        }
      })
      .catch((err) =>
        console.error('[LoadControlDetailsForm] Fetch error:', err),
      );
  }, [flight?.slNo, mainDetails?.route]);

  useEffect(() => {
    const m = (mainDetails?.route ?? '').trim();
    if (!m) return;
    setRouting((prev) => (prev.trim() === '' ? m : prev));
  }, [mainDetails?.route]);

  // General flight information
  const [airlinesOperator, setAirlinesOperator] = useState(
    displayAirline || '',
  );
  const [routing, setRouting] = useState('');
  const [acType, setAcType] = useState(displayAircraft || '');
  const [flightNo, setFlightNo] = useState(displayFlightNo || '');
  const [operations, setOperations] = useState('Turnaround');

  // Loading details — blank until saved load-control data exists for this flight
  const [loadingDiagramAt, setLoadingDiagramAt] = useState('');
  const [loadingSheetPrintedAt, setLoadingSheetPrintedAt] = useState('');
  const [loadingSheetDeliveredAt, setLoadingSheetDeliveredAt] = useState('');
  const [flightPlanFieldAt, setFlightPlanFieldAt] = useState('');
  const [fic, setFic] = useState('');
  const [adc, setAdc] = useState('');
  const { errors, clearField, applyAndFocus } = useFieldErrors<LcField>(LC_FIELD_ORDER);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || !flight?.slNo) return;

    const next: FieldErrors<LcField> = {};
    const diagramErr = time24(loadingDiagramAt, 'Loading diagram time');
    if (diagramErr) next.loadingDiagramAt = diagramErr;
    const printedErr = time24(loadingSheetPrintedAt, 'Loading sheet printed time');
    if (printedErr) next.loadingSheetPrintedAt = printedErr;
    const deliveredErr = time24(loadingSheetDeliveredAt, 'Loading sheet delivered time');
    if (deliveredErr) next.loadingSheetDeliveredAt = deliveredErr;
    const planErr = time24(flightPlanFieldAt, 'Flight plan field time');
    if (planErr) next.flightPlanFieldAt = planErr;
    if (applyAndFocus(next)) {
      toast.warning('Please fix the highlighted fields.');
      return;
    }

    setIsSaving(true);
    const url = getNsRawFormSavedUrl(
      'load-control-details',
      nsFormSerialForFlight(flight),
    );
    const body = loadControlDetailsFormToSavePayload({
      airlinesOperator: airlinesOperator || displayAirline || '',
      flightNo: flightNo || displayFlightNo || '',
      routing,
      acType: acType || displayAircraft || '',
      std: scheduleStdTimeNormalizedDisplay(flight, scheduleFromRaw),
      operations,
      sta: scheduleStaTimeNormalizedDisplay(flight, scheduleFromRaw),
      staDate: staDateDisplay,
      stdDate: stdDateDisplay,
      loadingDiagramGivenAt: loadingDiagramAt,
      loadingSheetPrintedAt: loadingSheetPrintedAt,
      loadingSheetDeliveredAt: loadingSheetDeliveredAt,
      flightPlanFieldAt,
      fic,
      adc,
    });
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setIsExisting(true);
        setIsLocked(true);
        toast.success('Load control details saved');
        onFhrLocksMayHaveChanged?.(String(flight.slNo ?? '').trim());
      } else {
        let detail = '';
        try {
          const errBody = (await res.json()) as { message?: string | string[] };
          const msg = errBody?.message;
          detail = Array.isArray(msg) ? msg.join(', ') : String(msg ?? '');
        } catch {
          /* ignore */
        }
        toast.error(
          detail
            ? `Failed to save load control details: ${detail}`
            : 'Failed to save load control details',
        );
      }
    } catch {
      toast.error('Failed to save load control details');
    } finally {
      setIsSaving(false);
    }
  };

  const inputBase =
    'w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all';
  const inputClass = `${inputBase} border-gray-300 bg-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500`;
  const inputLockedClass = `${inputBase} border-gray-200 bg-gray-100 text-gray-700 cursor-not-allowed`;
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1.5';

  return (
    <div className={FLIGHT_DETAILS_FORM_ROOT_CLASS}>
      {/* Emerald header with lock/unlock */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 bg-emerald-500 px-3 py-3 text-white shadow-md sm:px-4">
        <div className="flex items-center gap-2">
          <Scale className="w-6 h-6" />
          <h2 className="text-lg font-semibold">Load Control Details</h2>
        </div>
        <button
          type="button"
          onClick={() => setIsLocked((prev) => !prev)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors ${
            isLocked
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : 'bg-emerald-400 hover:bg-emerald-500'
          }`}
          title={isLocked ? 'Click to unlock form' : 'Click to lock form'}
        >
          {isLocked ? (
            <>
              <Lock className="w-5 h-5" />
              <span>Locked</span>
            </>
          ) : (
            <>
              <Unlock className="w-5 h-5" />
              <span>Unlocked</span>
            </>
          )}
        </button>
      </div>

      <form onSubmit={handleSave} className={FLIGHT_DETAILS_FORM_BODY_CLASS}>
        {/* General Flight Information — 4-column field grid */}
        <section className={FLIGHT_DETAILS_SECTION_CLASS}>
          <div className={FLIGHT_DETAILS_FIELD_GRID_CLASS}>
            <div>
              <span className={labelClass}>Serial No :</span>
              <span className="block text-base font-bold text-emerald-600">
                {displayScheduledAirlinesTableSerial(flight)}
              </span>
            </div>
            <div>
              <label className={labelClass}>Airlines/Operator :</label>
              <input
                type="text"
                value={airlinesOperator}
                onChange={(e) => setAirlinesOperator(e.target.value)}
                disabled
                className={inputLockedClass}
              />
            </div>
            <div>
              <label className={labelClass}>Flight No. :</label>
              <input
                type="text"
                value={flightNo}
                onChange={(e) => setFlightNo(e.target.value)}
                disabled
                className={inputLockedClass}
              />
            </div>
            <div>
              <label className={labelClass}>Operations :</label>
              <input
                type="text"
                value={operations}
                onChange={(e) => setOperations(e.target.value)}
                disabled
                className={inputLockedClass}
              />
            </div>
            <div>
              <label className={labelClass}>Routing :</label>
              <input
                type="text"
                value={routing}
                onChange={(e) => setRouting(e.target.value)}
                disabled
                className={inputLockedClass}
                placeholder="e.g. BKK - DEL - BKK"
              />
            </div>
            <div>
              <label className={labelClass}>A/C Type :</label>
              <input
                type="text"
                value={acType}
                onChange={(e) => setAcType(e.target.value)}
                disabled
                className={inputLockedClass}
              />
            </div>
            <div>
              <label className={labelClass}>STA (24h, schedule) :</label>
              <TimeSelect24
                value={scheduleStaTimeNormalizedDisplay(
                  flight,
                  scheduleFromRaw,
                )}
                onChange={() => {}}
                disabled
                className="w-full min-h-[42px]"
              />
            </div>
            <div>
              <label className={labelClass}>STD (24h, schedule) :</label>
              <TimeSelect24
                value={scheduleStdTimeNormalizedDisplay(
                  flight,
                  scheduleFromRaw,
                )}
                onChange={() => {}}
                disabled
                className="w-full min-h-[42px]"
              />
            </div>
            <div>
              <label className={labelClass}>STA Date (schedule setup) :</label>
              <input
                type="text"
                value={staDateDisplay}
                readOnly
                disabled
                className={inputLockedClass}
                title={
                  scheduleFromRaw?.scheduleSource
                    ? `Source: ${scheduleFromRaw.scheduleSource}`
                    : undefined
                }
              />
            </div>
            <div>
              <label className={labelClass}>STD Date (schedule setup) :</label>
              <input
                type="text"
                value={stdDateDisplay}
                readOnly
                disabled
                className={inputLockedClass}
                title={
                  scheduleFromRaw?.scheduleSource
                    ? `Source: ${scheduleFromRaw.scheduleSource}`
                    : undefined
                }
              />
            </div>
          </div>
        </section>

        {/* Loading Details - gray box with fields + Save & Lock/Unlock inside same box */}
        <section
          className={`${FLIGHT_DETAILS_SECTION_CLASS} space-y-4 bg-gray-200/80`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>
                Loading Diagram given at (24h):
              </label>
              <TimeSelect24
                hourSelectId="field-loadingDiagramAt"
                value={loadingDiagramAt}
                onChange={(v) => {
                  setLoadingDiagramAt(v);
                  clearField('loadingDiagramAt');
                }}
                disabled={isLocked}
                allowEmpty
                placeholder="—"
                className={cn(
                  'w-full min-h-[42px]',
                  errors.loadingDiagramAt && 'border-red-500 ring-2 ring-red-200',
                )}
              />
              <FormFieldError
                id="field-loadingDiagramAt-error"
                message={errors.loadingDiagramAt}
              />
            </div>
            <div>
              <label className={labelClass}>
                Loading Sheet Printed at (24h):
              </label>
              <TimeSelect24
                hourSelectId="field-loadingSheetPrintedAt"
                value={loadingSheetPrintedAt}
                onChange={(v) => {
                  setLoadingSheetPrintedAt(v);
                  clearField('loadingSheetPrintedAt');
                }}
                disabled={isLocked}
                allowEmpty
                placeholder="—"
                className={cn(
                  'w-full min-h-[42px]',
                  errors.loadingSheetPrintedAt && 'border-red-500 ring-2 ring-red-200',
                )}
              />
              <FormFieldError
                id="field-loadingSheetPrintedAt-error"
                message={errors.loadingSheetPrintedAt}
              />
            </div>
            <div>
              <label className={labelClass}>
                Loading Sheet Delivered at (24h):
              </label>
              <TimeSelect24
                hourSelectId="field-loadingSheetDeliveredAt"
                value={loadingSheetDeliveredAt}
                onChange={(v) => {
                  setLoadingSheetDeliveredAt(v);
                  clearField('loadingSheetDeliveredAt');
                }}
                disabled={isLocked}
                allowEmpty
                placeholder="—"
                className={cn(
                  'w-full min-h-[42px]',
                  errors.loadingSheetDeliveredAt && 'border-red-500 ring-2 ring-red-200',
                )}
              />
              <FormFieldError
                id="field-loadingSheetDeliveredAt-error"
                message={errors.loadingSheetDeliveredAt}
              />
            </div>
            <div>
              <label className={labelClass}>Flight Plan Field at (24h):</label>
              <TimeSelect24
                hourSelectId="field-flightPlanFieldAt"
                value={flightPlanFieldAt}
                onChange={(v) => {
                  setFlightPlanFieldAt(v);
                  clearField('flightPlanFieldAt');
                }}
                disabled={isLocked}
                allowEmpty
                placeholder="—"
                className={cn(
                  'w-full min-h-[42px]',
                  errors.flightPlanFieldAt && 'border-red-500 ring-2 ring-red-200',
                )}
              />
              <FormFieldError
                id="field-flightPlanFieldAt-error"
                message={errors.flightPlanFieldAt}
              />
            </div>
            <div>
              <label htmlFor="field-fic" className={labelClass}>FIC :</label>
              <input
                id="field-fic"
                type="text"
                value={fic}
                onChange={(e) => setFic(sanitizeDigits(e.target.value, 4))}
                disabled={isLocked}
                maxLength={4}
                inputMode="numeric"
                autoComplete="off"
                className={isLocked ? inputLockedClass : inputClass}
              />
              <FormFieldError />
            </div>
            <div>
              <label htmlFor="field-adc" className={labelClass}>ADC :</label>
              <input
                id="field-adc"
                type="text"
                value={adc}
                onChange={(e) => setAdc(sanitizeAlphanumeric(e.target.value, 6))}
                disabled={isLocked}
                maxLength={6}
                autoComplete="off"
                className={isLocked ? inputLockedClass : inputClass}
              />
              <FormFieldError />
            </div>
          </div>
          {/* Save and Lock/Unlock inside same gray box */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-300">
            <button
              type="submit"
              disabled={isLocked || isSaving}
              className="px-5 py-2.5 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 focus:ring-2 focus:ring-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setIsLocked((prev) => !prev)}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg focus:ring-2 focus:ring-offset-1 ${
                isLocked
                  ? 'bg-emerald-500 text-white hover:bg-emerald-600 focus:ring-emerald-300'
                  : 'bg-gray-300 text-gray-700 hover:bg-gray-400 focus:ring-gray-400'
              }`}
            >
              {isLocked ? (
                <>
                  <Unlock className="w-4 h-4" />
                  Unlock
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Lock
                </>
              )}
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
