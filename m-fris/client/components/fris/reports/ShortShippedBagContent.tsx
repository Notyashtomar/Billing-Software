'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Luggage } from 'lucide-react';
import {
  processFlightData,
  FlightData,
  displayFlightInstanceSerial,
  displayScheduledAirlinesTableSerial,
  nsFormSerialForFlight,
} from '@/utils/dataProcessor';
import {
  advanceDocId,
  fetchFlightsReferenceAirlines,
  fetchAllShippedBags,
  fetchShippedBagsMapForSerials,
  getApiBase,
  type ShippedBagsFlightPayload,
} from '@/lib/api';
import { dailyScheduledFlightsQueryOptions } from '@/hooks/fris/useDailyScheduledFlightsQuery';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { DatePicker } from '@/components/ui/DatePicker';
import { toast } from 'sonner';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { ReportsResponsiveTable } from '@/components/fris/reports/ReportsResponsiveTable';
import {
  ReportsAdaptiveTable,
  ReportsMobileCard,
  ReportsMobileCardField,
  ReportsMobileCardGrid,
  ReportsMobileCardHeader,
  ReportsMobileCardList,
  ReportsMobileEmpty,
} from '@/components/fris/reports/ReportsMobileCards';
import { FRIS_REPORTS_PAGE_SHELL_CLASS } from '@/lib/fris-reports-responsive';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { FLIGHT_FILTER_ACTIONS_PB } from '@/components/fris/flights/flightFilterBarLayout';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_PICKER_WRAP,
  validateYmdDateRange,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';

function formatLoadError(error: unknown, fallback: string): string {
  const errMsg = error instanceof Error ? error.message : '';
  if (errMsg.trim().toLowerCase() === 'internal server error') {
    return 'The backend returned Internal Server Error while loading flights. Please verify the server logs and confirm the selected date range is valid.';
  }
  const isNetworkError =
    error instanceof TypeError && (errMsg === 'Failed to fetch' || errMsg.includes('fetch'));
  if (isNetworkError) {
    const base = getApiBase().replace(/\/$/, '');
    const target =
      base.startsWith('/') ? `${base} (dev proxy → Nest on 127.0.0.1:8080)` : base || 'http://127.0.0.1:8080';
    return `Cannot reach the API. Make sure the backend is running and reachable at ${target}.`;
  }
  return error instanceof Error ? error.message : fallback;
}

function localCalendarYmd(d = new Date()): string {
  const cal = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return `${cal.getFullYear()}-${String(cal.getMonth() + 1).padStart(2, '0')}-${String(cal.getDate()).padStart(2, '0')}`;
}

const FILTER_FIELD_ORDER = ['fromDate', 'toDate'] as const;

function scheduleFilterCapDate(): Date {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

function yyyyMmDdToDdMmYyyy(ymd: string): string {
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return '';
  const [y, m, d] = parts;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

function scheduleLabelToYmd(label: string): string | null {
  const raw = String(label ?? '').trim();
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parts = raw.split(/[/-]/).map((p) => p.trim());
  if (parts.length === 3 && parts[2]?.length === 4) {
    const d = Number(parts[0]);
    const m = Number(parts[1]);
    const y = Number(parts[2]);
    if (!d || !m || !y) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

function filterFlightsToDateWindow(flights: FlightData[], fromYmd: string, toYmd: string): FlightData[] {
  if (!fromYmd || !toYmd || fromYmd > toYmd) return flights;
  return flights.filter((f) => {
    const ymd =
      scheduleLabelToYmd(String(f.staDate ?? '').trim()) ??
      scheduleLabelToYmd(String(f.stdDate ?? '').trim());
    if (!ymd) return false;
    return ymd >= fromYmd && ymd <= toYmd;
  });
}

type AdvanceAirlineOption = {
  id: string;
  name: string;
  code: string;
};

function toAirlineOption(doc: Record<string, unknown>): AdvanceAirlineOption {
  const d = advanceDocId(doc);
  return {
    id: d.id,
    name: String(d.name ?? '').trim(),
    code: String(d.code ?? '').trim(),
  };
}

function flightAirlineMatchesSelected(flightAirline: string, selectedName: string): boolean {
  const a = String(flightAirline ?? '').trim().toLowerCase();
  const b = selectedName.trim().toLowerCase();
  if (!b) return true;
  return a === b;
}

async function loadScheduledFlightsForDateRange(
  queryClient: QueryClient,
  fromDdMmYyyy: string,
  toDdMmYyyy: string,
  fromYmd: string,
  toYmd: string,
): Promise<FlightData[]> {
  const data = await queryClient.fetchQuery(
    dailyScheduledFlightsQueryOptions(fromDdMmYyyy, toDdMmYyyy),
  );
  const rows = processFlightData(Array.isArray(data) ? data : []);
  return filterFlightsToDateWindow(rows, fromYmd, toYmd);
}

export type ShortShippedBagRow = {
  rowKey: string;
  /** Raw schedule serial (`slNo`) — matches `shipped-bags.flightSerial`. */
  flightSerialRaw: string;
  airline: string;
  serialNo: string;
  flightNo: string;
  stdDate: string;
  noOfBags: string;
  optionSectionsText: string;
  /** One line per saved row: only the remarks field (option section stays in its own column). */
  remarksLines: string;
};

function shippedBagTexts(bag: ShippedBagsFlightPayload | undefined): {
  noOfBags: string;
  optionSectionsText: string;
  remarksLines: string;
} {
  if (!bag) {
    return { noOfBags: '', optionSectionsText: '', remarksLines: '' };
  }
  const rows = bag.rows ?? [];
  const noOfBags =
    typeof bag.noOfBags === 'number'
      ? bag.noOfBags > 0
        ? String(bag.noOfBags)
        : ''
      : String(bag.noOfBags ?? '').trim();
  if (!rows.length && !noOfBags) {
    return { noOfBags: '', optionSectionsText: '', remarksLines: '' };
  }
  const optionSectionsText = rows
    .map((r) => String(r.optionSection ?? '').trim())
    .filter(Boolean)
    .join(' · ');
  const remarksLines = rows
    .map((r) => String(r.remarks ?? '').trim())
    .filter(Boolean)
    .join('\n');
  return { noOfBags, optionSectionsText, remarksLines };
}

function flightToRow(f: FlightData): ShortShippedBagRow {
  const serial = displayFlightInstanceSerial(f.slNo);
  const raw = String(f.slNo ?? '').trim();
  return {
    rowKey: `${raw}|${serial}|${String(f.flightNo ?? '').trim()}|${String(f.stdDate ?? '').trim()}|${String(f.staDate ?? '').trim()}`,
    flightSerialRaw: raw,
    airline: String(f.airline ?? '').trim(),
    serialNo: serial,
    flightNo: String(f.flightNo ?? '').trim(),
    stdDate: String(f.stdDate ?? '').trim(),
    noOfBags: '',
    optionSectionsText: '',
    remarksLines: '',
  };
}

function lookupShippedBagBySerial(
  bySerial: Record<string, ShippedBagsFlightPayload>,
  raw: string,
): ShippedBagsFlightPayload | undefined {
  const k = String(raw ?? '').trim();
  if (!k) return undefined;
  if (bySerial[k]) return bySerial[k];
  const disp = displayFlightInstanceSerial(k);
  if (disp !== '-' && bySerial[disp]) return bySerial[disp];
  for (const bag of Object.values(bySerial)) {
    const fs = String(bag.flightSerial ?? '').trim();
    if (!fs) continue;
    if (fs === k || displayFlightInstanceSerial(fs) === disp) return bag;
  }
  return undefined;
}

function rowFlightLabels(
  doc: ShippedBagsFlightPayload | undefined,
  flight?: FlightData | null,
  rawSerial = '',
): Pick<ShortShippedBagRow, 'airline' | 'serialNo' | 'flightNo' | 'stdDate'> {
  if (flight) {
    return {
      airline: String(flight.airline ?? '').trim(),
      serialNo: displayScheduledAirlinesTableSerial(flight),
      flightNo: String(flight.flightNo ?? '').trim(),
      stdDate: String(flight.stdDate ?? '').trim(),
    };
  }
  const snap = doc?.flightSnapshot;
  if (snap) {
    return {
      airline: snap.airline,
      serialNo: rawSerial ? displayFlightInstanceSerial(rawSerial) : '—',
      flightNo: snap.flightNo,
      stdDate: snap.stdDate,
    };
  }
  return {
    airline: '',
    serialNo: rawSerial ? displayFlightInstanceSerial(rawSerial) : '—',
    flightNo: '',
    stdDate: '',
  };
}

function mergeShippedBagIntoRow(
  row: ShortShippedBagRow,
  bySerial: Record<string, ShippedBagsFlightPayload>,
  flight?: FlightData | null,
): ShortShippedBagRow {
  const bag = lookupShippedBagBySerial(bySerial, row.flightSerialRaw);
  const t = shippedBagTexts(bag);
  const labels = rowFlightLabels(bag, flight ?? undefined, row.flightSerialRaw);
  const airline = row.airline || labels.airline;
  const flightNo = row.flightNo || labels.flightNo;
  const stdDate = row.stdDate || labels.stdDate;
  const serialNo =
    row.serialNo && row.serialNo !== '—' ? row.serialNo : labels.serialNo;
  return { ...row, airline, flightNo, stdDate, serialNo, ...t };
}

function shippedBagPayloadToRow(
  doc: ShippedBagsFlightPayload,
  idx: number,
  flight?: FlightData | null,
): ShortShippedBagRow {
  const raw = String(doc.flightSerial ?? '').trim();
  const t = shippedBagTexts(doc);
  const labels = rowFlightLabels(doc, flight, raw);
  return {
    rowKey: `shipped-bag-${raw || 'unknown'}-${idx}`,
    flightSerialRaw: raw,
    ...labels,
    ...t,
  };
}

/** Schedule rows for the filter dates — used to fill airline / flight / STD on collection rows. */
async function fetchScheduleWindowForMerge(
  queryClient: QueryClient,
  fromYmd: string,
  toYmd: string,
): Promise<FlightData[]> {
  if (!fromYmd || !toYmd || fromYmd > toYmd) return [];
  const capYmd = localCalendarYmd();
  if (toYmd > capYmd || fromYmd > capYmd) return [];
  const fromDd = yyyyMmDdToDdMmYyyy(fromYmd);
  const toDd = yyyyMmDdToDdMmYyyy(toYmd);
  if (!fromDd || !toDd) return [];
  try {
    return await loadScheduledFlightsForDateRange(queryClient, fromDd, toDd, fromYmd, toYmd);
  } catch {
    return [];
  }
}

function flightBySerialMap(flights: FlightData[]): Map<string, FlightData> {
  const m = new Map<string, FlightData>();
  for (const f of flights) {
    const keys = new Set<string>();
    const sl = String(f.slNo ?? '').trim();
    const leg = String(f.legacySlNo ?? '').trim();
    if (sl) keys.add(sl);
    if (leg) keys.add(leg);
    keys.add(nsFormSerialForFlight(f));
    if (sl) keys.add(displayFlightInstanceSerial(sl));
    if (leg) keys.add(displayFlightInstanceSerial(leg));
    for (const k of keys) {
      if (k && k !== '-') m.set(k, f);
    }
  }
  return m;
}

export default function ShortShippedBagContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [fromDate, setFromDate] = useState(() => localCalendarYmd());
  const [toDate, setToDate] = useState(() => localCalendarYmd());
  const [airlineName, setAirlineName] = useState('');
  const [airlineOptions, setAirlineOptions] = useState<AdvanceAirlineOption[]>([]);
  const [airlinesLoading, setAirlinesLoading] = useState(true);
  const [serialFilter, setSerialFilter] = useState('');
  const [rows, setRows] = useState<ShortShippedBagRow[]>([]);
  /** `collection` = all `shipped-bags` docs on load; `schedule` = rows from Show record + merged bags. */
  const [recordsSource, setRecordsSource] = useState<'collection' | 'schedule'>('collection');
  const [collectionLoading, setCollectionLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { errors, clearField, applyAndFocus } = useFieldErrors(FILTER_FIELD_ORDER);

  useEffect(() => {
    const fs = searchParams.get('flightSerial')?.trim();
    if (fs) setSerialFilter(fs);
  }, [searchParams]);

  useEffect(() => {
    if (recordsSource !== 'collection') return;

    let cancelled = false;
    (async () => {
      setCollectionLoading(true);
      setLoadError(null);
      try {
        const flights = await fetchScheduleWindowForMerge(queryClient, fromDate, toDate);
        if (cancelled) return;
        const flightSerials = flights.map((f) => String(f.slNo || f.legacySlNo || '')).filter(Boolean);
        const map = await fetchShippedBagsMapForSerials(flightSerials);
        if (cancelled) return;
        
        const bySerial = flightBySerialMap(flights);
        const rows = Object.values(map).map((doc, i) => {
          const raw = String(doc.flightSerial ?? '').trim();
          const flight = raw ? bySerial.get(raw) : undefined;
          return shippedBagPayloadToRow(doc, i, flight);
        });
        setRows(rows);
      } catch (e) {
        if (!cancelled) {
          setRows([]);
          setLoadError(
            e instanceof Error ? e.message : 'Could not load short shipped bag records from the server.',
          );
        }
      } finally {
        if (!cancelled) setCollectionLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromDate, toDate, recordsSource, queryClient]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAirlinesLoading(true);
      try {
        const list = (await fetchFlightsReferenceAirlines()) as Record<string, unknown>[];
        const opts = list
          .map(toAirlineOption)
          .filter((x) => x.id && (x.name || x.code))
          .sort((a, b) => a.name.localeCompare(b.name));
        if (!cancelled) setAirlineOptions(opts);
      } catch (e) {
        if (!cancelled) {
          setAirlineOptions([]);
          toast.error(e instanceof Error ? e.message : 'Failed to load airlines');
        }
      } finally {
        if (!cancelled) setAirlinesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const scheduleFilterMaxDate = scheduleFilterCapDate();
  const scheduleFilterMaxYyyyMmDd = localCalendarYmd();

  const airlineDropdownOptions = useMemo(
    () => [
      { value: '', label: airlinesLoading ? 'Loading airlines…' : 'All airlines' },
      ...(airlineName && !airlineOptions.some((a) => a.name === airlineName)
        ? [{ value: airlineName, label: airlineName }]
        : []),
      ...airlineOptions.map((a) => ({ value: a.name, label: a.name || a.code })),
    ],
    [airlinesLoading, airlineName, airlineOptions],
  );

  const scheduleFilterStartMaxDate = useMemo(() => {
    if (!toDate?.trim()) return scheduleFilterMaxDate;
    const parts = toDate.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return scheduleFilterMaxDate;
    const [y, m, day] = parts;
    const end = new Date(y!, m! - 1, day!);
    return end.getTime() <= scheduleFilterMaxDate.getTime() ? end : scheduleFilterMaxDate;
  }, [toDate, scheduleFilterMaxDate]);

  const showRecords = useCallback(async () => {
    const next = validateYmdDateRange(fromDate, toDate, { toNotAfterToday: true });
    if (applyAndFocus(next)) return;

    setLoading(true);
    setLoadError(null);
    setRows([]);
    setRecordsSource('schedule');
    try {
      const fromDdMmYyyy = yyyyMmDdToDdMmYyyy(fromDate);
      const toDdMmYyyy = yyyyMmDdToDdMmYyyy(toDate);
      if (!fromDdMmYyyy || !toDdMmYyyy) {
        applyAndFocus({
          fromDate: 'From date must be a valid date.',
          toDate: 'To date must be a valid date.',
        });
        setLoading(false);
        return;
      }
      const flights = await loadScheduledFlightsForDateRange(
        queryClient,
        fromDdMmYyyy,
        toDdMmYyyy,
        fromDate,
        toDate,
      );

      const selectedAirline = airlineName.trim();
      const serialQ = serialFilter.trim().toLowerCase();

      const filtered = flights.filter((f) => {
        if (selectedAirline) {
          if (!flightAirlineMatchesSelected(String(f.airline ?? ''), selectedAirline)) return false;
        }
        if (serialQ) {
          const disp = displayFlightInstanceSerial(f.slNo).toLowerCase();
          const raw = String(f.slNo ?? '').toLowerCase();
          if (!disp.includes(serialQ) && !raw.includes(serialQ)) return false;
        }
        return true;
      });

      const baseRows = filtered.map(flightToRow);
      let bySerial: Record<string, ShippedBagsFlightPayload> = {};
      try {
        bySerial = await fetchShippedBagsMapForSerials(
          filtered.map((f) => String(f.slNo ?? '').trim()).filter(Boolean),
        );
      } catch (e) {
        toast.error(
          e instanceof Error
            ? `${e.message} (schedule rows are shown; bag columns may be empty.)`
            : 'Could not load short shipped bag data from the server.',
        );
      }
      const byFlight = flightBySerialMap(filtered);
      setRows(
        baseRows.map((r) =>
          mergeShippedBagIntoRow(r, bySerial, byFlight.get(r.flightSerialRaw)),
        ),
      );
    } catch (e) {
      setLoadError(formatLoadError(e, 'Could not load records.'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, airlineName, serialFilter, applyAndFocus, queryClient]);

  return (
    <div className={`${FRIS_REPORTS_PAGE_SHELL_CLASS} bg-gradient-to-br from-gray-50 to-gray-100`}>
      <div className="mx-auto max-w-[1400px]">
        <Link
          href="/fris/reports/pax-shift"
          className="mb-4 inline-flex items-center gap-2 pt-6 text-sm font-medium text-emerald-600 hover:text-emerald-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Pax Shift Report
        </Link>

        <FrisPageHeader title="Short shipped bag" icon={Luggage} />

        <section className="mb-6 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 bg-gray-50/80 px-4 py-3 sm:px-6">
            <h2 className="text-sm font-semibold text-gray-900">Filters</h2>
          </div>
          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 xl:items-end">
              <div className={cn(errors.fromDate && FRIS_INVALID_PICKER_WRAP)}>
                <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="field-fromDate">
                  From date
                </label>
                <DatePicker
                  id="field-fromDate"
                  value={fromDate}
                  onChange={(v) => {
                    let next = v ?? '';
                    if (next > scheduleFilterMaxYyyyMmDd) next = scheduleFilterMaxYyyyMmDd;
                    if (toDate && next && next > toDate) next = toDate;
                    setFromDate(next);
                    clearField('fromDate');
                  }}
                  valueFormat="yyyy-MM-dd"
                  maxDate={scheduleFilterStartMaxDate}
                />
                <FormFieldError id="field-fromDate-error" message={errors.fromDate} />
              </div>
              <div className={cn(errors.toDate && FRIS_INVALID_PICKER_WRAP)}>
                <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="field-toDate">
                  To date
                </label>
                <DatePicker
                  id="field-toDate"
                  value={toDate}
                  onChange={(v) => {
                    let next = v ?? '';
                    if (next > scheduleFilterMaxYyyyMmDd) next = scheduleFilterMaxYyyyMmDd;
                    if (fromDate && next && next < fromDate) next = fromDate;
                    setToDate(next);
                    clearField('toDate');
                  }}
                  valueFormat="yyyy-MM-dd"
                  minDate={
                    fromDate
                      ? (() => {
                          const [y, m, d] = fromDate.split('-').map(Number);
                          return new Date(y, m - 1, d);
                        })()
                      : undefined
                  }
                  maxDate={scheduleFilterMaxDate}
                />
                <FormFieldError id="field-toDate-error" message={errors.toDate} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Airline</label>
                <AdminRadioDropdown
                  value={airlineName}
                  onChange={setAirlineName}
                  disabled={airlinesLoading}
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm transition-all hover:border-gray-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-gray-50"
                  options={airlineDropdownOptions}
                />
                <FormFieldError />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Serial no.</label>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="e.g. Sl. no."
                  value={serialFilter}
                  onChange={(e) => setSerialFilter(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm transition-all hover:border-gray-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                />
                <FormFieldError />
              </div>
              <div className={cn('xl:col-span-2', FLIGHT_FILTER_ACTIONS_PB)}>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={loading || collectionLoading}
                  onClick={() => void showRecords()}
                  className="h-10 w-full rounded-xl bg-emerald-500 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[140px]"
                >
                  {loading ? 'Loading…' : 'Show record'}
                </motion.button>
              </div>
            </div>
          </div>
        </section>

        {loadError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loadError}</div>
        )}

        <AnimatePresence>
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
          >
            <div className="border-b border-gray-100 px-4 py-3 sm:px-6">
              <h2 className="text-lg font-semibold text-gray-900">Records</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {collectionLoading || loading
                  ? 'Loading…'
                  : `${rows.length} row${rows.length === 1 ? '' : 's'}`}
                {!collectionLoading && !loading && recordsSource === 'collection' && rows.length > 0
                  ? ` • reports-pax-shift-report + schedule ${fromDate}–${toDate} (airline / flight / STD when Sl. no. matches)`
                  : null}
                {!collectionLoading && !loading && recordsSource === 'schedule' && rows.length > 0
                  ? ` • ${fromDate} to ${toDate}`
                  : null}
              </p>
            </div>
            <ReportsAdaptiveTable
              mobile={
                collectionLoading || loading ? (
                  <ReportsMobileEmpty title="Loading records…" />
                ) : rows.length === 0 ? (
                  <ReportsMobileEmpty
                    title="No records"
                    description={
                      recordsSource === 'collection'
                        ? 'No short shipped bag records in the database yet.'
                        : 'No flights match the filters for this range.'
                    }
                  />
                ) : (
                  <ReportsMobileCardList className="p-3">
                    {rows.map((r) => {
                      const hasBags = Boolean(r.noOfBags || r.optionSectionsText || r.remarksLines);
                      const muted = hasBags ? 'text-gray-900' : 'text-gray-400';
                      return (
                        <ReportsMobileCard key={r.rowKey} tone={hasBags ? 'open' : 'default'}>
                          <ReportsMobileCardHeader
                            title={`${r.airline || '—'} · ${r.flightNo || '—'}`}
                            subtitle={`Serial ${r.serialNo || '—'} · STD ${r.stdDate || '—'}`}
                          />
                          <ReportsMobileCardGrid columns={1}>
                            <ReportsMobileCardField
                              label="No. of bags"
                              value={<span className={muted}>{r.noOfBags || '—'}</span>}
                            />
                            <ReportsMobileCardField
                              label="Option section(s)"
                              value={<span className={muted}>{r.optionSectionsText || '—'}</span>}
                              fullWidth
                            />
                            <ReportsMobileCardField
                              label="Remarks"
                              value={
                                <span className={`whitespace-pre-wrap ${muted}`}>{r.remarksLines || '—'}</span>
                              }
                              fullWidth
                            />
                          </ReportsMobileCardGrid>
                        </ReportsMobileCard>
                      );
                    })}
                  </ReportsMobileCardList>
                )
              }
              desktop={
                <ReportsResponsiveTable showScrollHint={false}>
                  <table className="w-full min-w-[800px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/90">
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700 sm:px-5">Airline</th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700 sm:px-5">Serial No.</th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700 sm:px-5">Flight No.</th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700 sm:px-5">STD Date</th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700 sm:px-5">No. of bags</th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700 sm:px-5">
                      Option section(s)
                    </th>
                    <th className="min-w-[200px] px-4 py-3 font-semibold text-gray-700 sm:px-5">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {collectionLoading || loading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-gray-600 sm:px-5">
                        {collectionLoading ? 'Loading saved records…' : 'Loading schedule…'}
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-gray-500 sm:px-5">
                        {recordsSource === 'collection'
                          ? 'No short shipped bag records in the database yet.'
                          : 'No flights match the filters for this range.'}
                      </td>
                    </tr>
                  ) : (
                      rows.map((r) => {
                        const hasBags = Boolean(
                          r.noOfBags || r.optionSectionsText || r.remarksLines,
                        );
                        const muted = hasBags ? 'text-gray-900' : 'text-gray-400';
                        return (
                          <tr key={r.rowKey} className="border-b border-gray-100 hover:bg-gray-50/80">
                            <td className="px-4 py-3 text-gray-900 sm:px-5">{r.airline || '—'}</td>
                            <td className="px-4 py-3 font-medium tabular-nums text-gray-900 sm:px-5">
                              {r.serialNo || '—'}
                            </td>
                            <td className="px-4 py-3 text-gray-900 sm:px-5">{r.flightNo || '—'}</td>
                            <td className="px-4 py-3 text-gray-900 sm:px-5">{r.stdDate || '—'}</td>
                            <td className={`px-4 py-3 tabular-nums sm:px-5 ${muted}`}>
                              {r.noOfBags || '—'}
                            </td>
                            <td className={`max-w-[min(280px,40vw)] px-4 py-3 sm:px-5 ${muted}`}>
                              {r.optionSectionsText || '—'}
                            </td>
                            <td
                              className={`max-w-[min(360px,50vw)] whitespace-pre-wrap break-words px-4 py-3 sm:px-5 ${muted}`}
                            >
                              {r.remarksLines || '—'}
                            </td>
                          </tr>
                        );
                      })
                  )
                }
                </tbody>
              </table>
                </ReportsResponsiveTable>
              }
            />
          </motion.section>
        </AnimatePresence>
      </div>
    </div>
  );
}
