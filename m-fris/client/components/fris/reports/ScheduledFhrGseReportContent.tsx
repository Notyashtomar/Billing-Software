'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Download,
  FileText,
  Loader2,
  Plane,
  RefreshCw,
  Users,
  Wrench,
} from 'lucide-react';
import { getPdfLibModule } from '@/lib/dynamic-imports';
import { loadFileSaverSaveAs } from '@/lib/lazy-client-deps';
import { toast } from 'sonner';
import type { jsPDF } from 'jspdf';
import { DatePicker } from '@/components/ui/DatePicker';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { ReportsResponsiveTable } from '@/components/fris/reports/ReportsResponsiveTable';
import { FRIS_REPORTS_PAGE_SHELL_CLASS } from '@/lib/fris-reports-responsive';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { FLIGHT_FILTER_ACTIONS_PB } from '@/components/fris/flights/flightFilterBarLayout';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_PICKER_WRAP,
  validateYmdDateRange,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';
import {
  equipmentManpowerByFlight,
  getApiBase,
} from '@/lib/api';
import { dailyScheduledFlightsQueryOptions } from '@/hooks/fris/useDailyScheduledFlightsQuery';
import { useAdvanceScheduleAirlinesQuery } from '@/hooks/fris/useAdvanceScheduleAirlinesQuery';
import { frisFetch } from '@/lib/fris-auth-fetch';
import {
  processFlightData,
  type FlightData,
  type MainDetailsData,
  displayScheduledAirlinesTableSerial,
  isScheduleCancelledFlightNo,
  nsFormSerialForFlight,
  nsRawSerialCandidatesForLockFetch,
  serialSearchMatches,
} from '@/utils/dataProcessor';

const fetch = frisFetch;
import {
  buildEquipmentReportPdfForFlight,
  buildScheduledTeamReportPdfFromFhrEmbed,
  downloadEquipmentReportPdfForFlight,
  downloadFhrReportPdf,
  downloadMainReportPdf,
  parseEquipmentManpowerFromApi,
} from '@/components/fris/flights/scheduledairlines/reportsPdf';

type AirlineOption = { id: string; name: string; code: string };

/** Default from-date: first day of the month three months before today (e.g. Apr 1 when opened in Jul). */
function defaultScheduledReportFromYmd(d = new Date()): string {
  const start = new Date(d.getFullYear(), d.getMonth() - 3, 1);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Default to-date: last day of the previous calendar month (e.g. Jun 30 when opened in Jul). */
function defaultScheduledReportToYmd(d = new Date()): string {
  const end = new Date(d.getFullYear(), d.getMonth(), 0);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
}

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

function filterFlightsToDateWindow(
  flights: FlightData[],
  fromYmd: string,
  toYmd: string,
): FlightData[] {
  if (!fromYmd || !toYmd || fromYmd > toYmd) return flights;
  return flights.filter((f) => {
    const ymd =
      scheduleLabelToYmd(String(f.staDate ?? '').trim()) ??
      scheduleLabelToYmd(String(f.stdDate ?? '').trim());
    if (!ymd) return false;
    return ymd >= fromYmd && ymd <= toYmd;
  });
}

function scheduledAirlinesRowDedupeKey(f: FlightData): string {
  const op = String(nsFormSerialForFlight(f) ?? '').trim().replace(/^FL-/i, '');
  const ymd =
    scheduleLabelToYmd(String(f.staDate ?? '').trim()) ??
    scheduleLabelToYmd(String(f.stdDate ?? '').trim()) ??
    '';
  if (op && ymd) return `op:${op}|${ymd}`;
  const sl = String(f.slNo ?? '').trim();
  if (sl && ymd) return `sl:${sl}|${ymd}`;
  if (sl) return `sl:${sl}`;
  return `anon:${f.airline}|${f.flightNo}|${ymd}|${String(f.staTime ?? '')}`;
}

function dedupeFlightsLikeScheduledTable(rows: FlightData[]): FlightData[] {
  const byKey = new Map<string, FlightData>();
  rows.forEach((row) => {
    const key = scheduledAirlinesRowDedupeKey(row);
    if (!key) return;
    if (!byKey.has(key)) byKey.set(key, row);
  });
  return Array.from(byKey.values());
}

/** Exclude cancelled rows from bulk FHR/GSE exports and the grid. */
function isActiveScheduledFlight(f: FlightData): boolean {
  if (f.isCancelled) return false;
  if (String(f.flightStatus ?? '').toLowerCase() === 'cancelled') return false;
  return !isScheduleCancelledFlightNo(f.flightNo);
}

async function mergeJsPdfsToBlob(docs: jsPDF[]): Promise<Blob> {
  const { PDFDocument } = await getPdfLibModule();
  const merged = await PDFDocument.create();
  for (const d of docs) {
    const raw = d.output('arraybuffer') as ArrayBuffer;
    const bytes = new Uint8Array(raw);
    const pdf = await PDFDocument.load(bytes);
    const copied = await merged.copyPages(pdf, pdf.getPageIndices());
    copied.forEach((p) => merged.addPage(p));
  }
  const out = await merged.save();
  return new Blob([Uint8Array.from(out)], { type: 'application/pdf' });
}

function mainDetailsFromDoc(doc: Record<string, unknown>): MainDetailsData | null {
  const md = doc.mainDetails;
  if (md == null || typeof md !== 'object' || Array.isArray(md)) return null;
  return md as MainDetailsData;
}

function hasNonEmptyMainDetails(md: MainDetailsData | null): boolean {
  if (!md) return false;
  const rec = md as unknown as Record<string, unknown>;
  const keys = Object.keys(rec).filter((k) => String(rec[k] ?? '').trim() !== '');
  return keys.length > 0;
}

async function mapPool<T, R>(items: T[], poolSize: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length) break;
      results[i] = await fn(items[i]!, i);
    }
  };
  const n = Math.max(1, Math.min(poolSize, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

function countMpPrefixedEquipmentManpowerLines(entries: unknown[] | undefined): number {
  if (!Array.isArray(entries)) return 0;
  let n = 0;
  for (const ent of entries) {
    if (!ent || typeof ent !== 'object') continue;
    const rec = ent as Record<string, unknown>;
    const entryType = String(rec.entryType ?? '').trim().toLowerCase();
    const name = String(rec.name ?? '').trim();
    if (entryType === 'manpower' || (!entryType && name.startsWith('MP:'))) n += 1;
  }
  return n;
}

/** Strict embed check for `equipmentManpower` on the FHR doc (API `hasTeam` also counts FHR GSE lines). */
function fhrDocEquipmentManpowerQualifiesForTeamPdf(doc: Record<string, unknown>): {
  qualifies: boolean;
  mpLineCount: number;
} {
  const embedEm = doc.equipmentManpower;
  if (!embedEm || typeof embedEm !== 'object' || Array.isArray(embedEm)) {
    return { qualifies: false, mpLineCount: 0 };
  }
  const raw = (embedEm as { entries?: unknown }).entries;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { qualifies: false, mpLineCount: 0 };
  }
  const { equipment, manpower } = parseEquipmentManpowerFromApi(
    raw as {
      name?: string;
      fromDate?: string;
      fromTime?: string;
      toDate?: string;
      toTime?: string;
      remarks?: string;
    }[],
  );
  const qualifies = equipment.length > 0 || manpower.length > 0;
  return {
    qualifies,
    mpLineCount: qualifies ? countMpPrefixedEquipmentManpowerLines(raw) : 0,
  };
}

export type ScheduledFhrGseRow = {
  flight: FlightData;
  resolvedSerial: string | null;
  mainDetails: MainDetailsData | null;
  hasFhr: boolean;
  hasGse: boolean;
  gseLineCount: number;
  /** Manpower form lines prefixed with `MP:` (equipment-manpower API / embed). */
  teamManpowerMpCount: number;
  /** Can generate detailed equipment + manpower (team) PDF from FHR embed. */
  hasTeam: boolean;
};

async function enrichFlightRow(flight: FlightData): Promise<ScheduledFhrGseRow> {
  const base = getApiBase().replace(/\/$/, '');
  let resolvedSerial: string | null = null;
  let mainDetails: MainDetailsData | null = null;
  let gseLineCount = 0;
  let hasManpower = false;
  let teamManpowerMpCount = 0;

  for (const serial of nsRawSerialCandidatesForLockFetch(flight)) {
    const token = String(serial ?? '').trim();
    if (!token) continue;
    try {
      const fhrRes = await fetch(`${base}/fhr-collection/flight/${encodeURIComponent(token)}`);
      if (!fhrRes.ok) continue;
      const doc = (await fhrRes.json().catch(() => null)) as Record<string, unknown> | null;
      if (!doc || typeof doc !== 'object') continue;

      resolvedSerial = token;
      mainDetails = mainDetailsFromDoc(doc);
      const eq = doc.equipmentDetails;
      gseLineCount = Array.isArray(eq) ? eq.length : 0;

      const embedTeam = fhrDocEquipmentManpowerQualifiesForTeamPdf(doc);
      if (embedTeam.qualifies) {
        hasManpower = true;
        teamManpowerMpCount = Math.max(teamManpowerMpCount, embedTeam.mpLineCount);
      }

      const mpRes = await fetch(equipmentManpowerByFlight(token).get());
      if (mpRes.ok) {
        const txt = await mpRes.text();
        if (txt.trim()) {
          try {
            const j = JSON.parse(txt) as { entries?: unknown[] };
            const arr = Array.isArray(j.entries) ? j.entries : [];
            if (arr.length > 0) {
              hasManpower = true;
              teamManpowerMpCount = Math.max(
                teamManpowerMpCount,
                countMpPrefixedEquipmentManpowerLines(arr),
              );
            }
          } catch {
            /* keep embed-derived flags */
          }
        }
      }
      break;
    } catch {
      continue;
    }
  }

  let reportOk = false;
  if (resolvedSerial) {
    try {
      const rep = await fetch(
        `${base}/reports/flight-report/${encodeURIComponent(resolvedSerial)}`,
      );
      if (rep.ok) {
        const payload = await rep.json().catch(() => null);
        reportOk =
          payload != null &&
          typeof payload === 'object' &&
          !Array.isArray(payload) &&
          Object.keys(payload as object).length > 0;
      }
    } catch {
      reportOk = false;
    }
  }

  /** Some rows only aggregate under `flight-report` until `fhr_collection` is created. */
  if (!resolvedSerial) {
    for (const serial of nsRawSerialCandidatesForLockFetch(flight)) {
      const token = String(serial ?? '').trim();
      if (!token) continue;
      try {
        const rep = await fetch(
          `${base}/reports/flight-report/${encodeURIComponent(token)}`,
        );
        if (!rep.ok) continue;
        const payload = await rep.json().catch(() => null);
        const ok =
          payload != null &&
          typeof payload === 'object' &&
          !Array.isArray(payload) &&
          Object.keys(payload as object).length > 0;
        if (ok) {
          resolvedSerial = token;
          reportOk = true;
          break;
        }
      } catch {
        continue;
      }
    }
  }

  if (resolvedSerial && !hasManpower && gseLineCount === 0) {
    try {
      const fhrRes = await fetch(`${base}/fhr-collection/flight/${encodeURIComponent(resolvedSerial)}`);
      if (fhrRes.ok) {
        const doc = (await fhrRes.json().catch(() => null)) as Record<string, unknown> | null;
        if (doc && typeof doc === 'object') {
          const embedTeam = fhrDocEquipmentManpowerQualifiesForTeamPdf(doc);
          if (embedTeam.qualifies) {
            hasManpower = true;
            teamManpowerMpCount = Math.max(teamManpowerMpCount, embedTeam.mpLineCount);
          }
        }
      }
      const mpRes = await fetch(equipmentManpowerByFlight(resolvedSerial).get());
      if (mpRes.ok) {
        const txt = await mpRes.text();
        if (txt.trim()) {
          try {
            const j = JSON.parse(txt) as { entries?: unknown[] };
            const arr = Array.isArray(j.entries) ? j.entries : [];
            if (arr.length > 0) {
              hasManpower = true;
              teamManpowerMpCount = Math.max(
                teamManpowerMpCount,
                countMpPrefixedEquipmentManpowerLines(arr),
              );
            }
          } catch {
            /* keep embed-derived flags */
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  const hasGse = gseLineCount > 0 || hasManpower;
  const hasFhr = Boolean(resolvedSerial) && (reportOk || hasNonEmptyMainDetails(mainDetails));
  /** Team PDF prefers equipment-manpower embed, then FHR `equipmentDetails`, then the standalone form API. */
  const hasTeam =
    resolvedSerial !== null && (hasManpower || gseLineCount > 0);

  return {
    flight,
    resolvedSerial,
    mainDetails,
    hasFhr,
    hasGse,
    gseLineCount,
    teamManpowerMpCount,
    hasTeam,
  };
}

type ScheduleFilterPack = {
  fromYmd: string;
  toYmd: string;
  airlineQueryLower: string;
  flightNoQueryLower: string;
  serialQuery: string;
};

function filterScheduledListByDraft(list: FlightData[], pack: ScheduleFilterPack): FlightData[] {
  const air = pack.airlineQueryLower.trim();
  const fn = pack.flightNoQueryLower.trim();
  const sq = pack.serialQuery.trim();
  return list.filter((f) => {
    if (air && !String(f.airline ?? '').toLowerCase().includes(air)) return false;
    if (fn && !String(f.flightNo ?? '').toLowerCase().includes(fn)) return false;
    if (sq && !serialSearchMatches(f, sq)) return false;
    return true;
  });
}

/** Max flights loaded per Apply on consolidated scheduled FHR/GSE/Team tabs. */
const SCHEDULED_REPORT_MAX_FLIGHTS = 3000;

async function loadEnrichedScheduleRows(
  queryClient: QueryClient,
  pack: ScheduleFilterPack,
): Promise<ScheduledFhrGseRow[]> {
  const fromDd = yyyyMmDdToDdMmYyyy(pack.fromYmd);
  const toDd = yyyyMmDdToDdMmYyyy(pack.toYmd);
  if (!fromDd || !toDd || pack.fromYmd > pack.toYmd) {
    throw new Error('Choose a valid date range.');
  }
  const raw = await queryClient.fetchQuery(
    dailyScheduledFlightsQueryOptions(fromDd, toDd),
  );
  const processed = processFlightData(Array.isArray(raw) ? raw : []).filter(isActiveScheduledFlight);
  const windowed = filterFlightsToDateWindow(processed, pack.fromYmd, pack.toYmd);
  const deduped = dedupeFlightsLikeScheduledTable(windowed);
  const filtered = filterScheduledListByDraft(deduped, pack);
  if (filtered.length === 0) return [];
  if (filtered.length > SCHEDULED_REPORT_MAX_FLIGHTS) {
    throw new Error(
      `Too many flights (max ${SCHEDULED_REPORT_MAX_FLIGHTS}). Narrow the date range or filters.`,
    );
  }
  const enriched = await mapPool(filtered, 4, (flight) => enrichFlightRow(flight));
  enriched.sort((a, b) => {
    const da =
      scheduleLabelToYmd(String(a.flight.staDate ?? '').trim()) ?? '';
    const db =
      scheduleLabelToYmd(String(b.flight.staDate ?? '').trim()) ?? '';
    if (da !== db) return da.localeCompare(db);
    return String(a.flight.flightNo ?? '').localeCompare(String(b.flight.flightNo ?? ''));
  });
  return enriched;
}

function flightForPdf(f: FlightData, serial: string): FlightData {
  return { ...f, slNo: serial };
}

const FILTER_CONTROL =
  'box-border h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500';

const th =
  'sticky top-0 z-10 border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-emerald-950';
const thTeam =
  'sticky top-0 z-10 border border-amber-300 bg-amber-100 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-amber-950';
const td = 'border border-slate-200 px-3 py-2 text-sm text-slate-800';

/** Persist last successful Team tab query so refresh restores rows and "Download all Team" re-enables. */
const SCHEDULED_TEAM_LAST_PACK_KEY = 'fris-scheduled-team-report-last-pack';

type StoredTeamFilterPack = {
  fromYmd: string;
  toYmd: string;
  airlineId: string;
  flightNo: string;
  serial: string;
};

export function ScheduledFhrGseReportContent() {
  const queryClient = useQueryClient();
  const airlinesQuery = useAdvanceScheduleAirlinesQuery();
  const airlineOptions = airlinesQuery.data ?? [];
  const airlinesLoading = airlinesQuery.isLoading;

  const defFrom = defaultScheduledReportFromYmd();
  const defTo = defaultScheduledReportToYmd();

  const [fhrDraftFrom, setFhrDraftFrom] = useState(defFrom);
  const [fhrDraftTo, setFhrDraftTo] = useState(defTo);
  const [fhrDraftAirlineId, setFhrDraftAirlineId] = useState('');
  const [fhrDraftFlightNo, setFhrDraftFlightNo] = useState('');
  const [fhrDraftSerial, setFhrDraftSerial] = useState('');

  const [gseDraftFrom, setGseDraftFrom] = useState(defFrom);
  const [gseDraftTo, setGseDraftTo] = useState(defTo);
  const [gseDraftAirlineId, setGseDraftAirlineId] = useState('');
  const [gseDraftFlightNo, setGseDraftFlightNo] = useState('');
  const [gseDraftSerial, setGseDraftSerial] = useState('');

  const [teamDraftFrom, setTeamDraftFrom] = useState(defFrom);
  const [teamDraftTo, setTeamDraftTo] = useState(defTo);
  const [teamDraftAirlineId, setTeamDraftAirlineId] = useState('');
  const [teamDraftFlightNo, setTeamDraftFlightNo] = useState('');
  const [teamDraftSerial, setTeamDraftSerial] = useState('');

  const [fhrRows, setFhrRows] = useState<ScheduledFhrGseRow[]>([]);
  const [gseRows, setGseRows] = useState<ScheduledFhrGseRow[]>([]);
  const [teamRows, setTeamRows] = useState<ScheduledFhrGseRow[]>([]);
  const [fhrLoading, setFhrLoading] = useState(false);
  const [gseLoading, setGseLoading] = useState(false);
  const [teamLoading, setTeamLoading] = useState(false);
  const [downloadingBulk, setDownloadingBulk] = useState<'fhr' | 'gse' | 'team' | null>(null);
  const teamPackRestoredRef = useRef(false);
  /** Bumps on Reset / new Apply so stale async loads cannot overwrite teamRows. */
  const teamDataFetchGen = useRef(0);
  const {
    errors: fhrErrors,
    clearField: clearFhrField,
    applyAndFocus: applyFhrErrors,
    clearAll: clearFhrErrors,
  } = useFieldErrors(['fhrFrom', 'fhrTo'] as const);
  const {
    errors: gseErrors,
    clearField: clearGseField,
    applyAndFocus: applyGseErrors,
    clearAll: clearGseErrors,
  } = useFieldErrors(['gseFrom', 'gseTo'] as const);
  const {
    errors: teamErrors,
    clearField: clearTeamField,
    applyAndFocus: applyTeamErrors,
    clearAll: clearTeamErrors,
  } = useFieldErrors(['teamFrom', 'teamTo'] as const);

  const scheduleFilterMaxDate = scheduleFilterCapDate();

  const fhrScheduleFilterStartMaxDate = useMemo(() => {
    if (!fhrDraftTo?.trim()) return scheduleFilterMaxDate;
    const parts = fhrDraftTo.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return scheduleFilterMaxDate;
    const [y, m, day] = parts;
    const end = new Date(y!, m! - 1, day!);
    return end.getTime() <= scheduleFilterMaxDate.getTime() ? end : scheduleFilterMaxDate;
  }, [fhrDraftTo, scheduleFilterMaxDate]);

  const fhrScheduleFilterEndMinDate = useMemo(() => {
    if (!fhrDraftFrom?.trim()) return undefined;
    const parts = fhrDraftFrom.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return undefined;
    const [y, m, day] = parts;
    return new Date(y!, m! - 1, day!);
  }, [fhrDraftFrom]);

  const gseScheduleFilterStartMaxDate = useMemo(() => {
    if (!gseDraftTo?.trim()) return scheduleFilterMaxDate;
    const parts = gseDraftTo.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return scheduleFilterMaxDate;
    const [y, m, day] = parts;
    const end = new Date(y!, m! - 1, day!);
    return end.getTime() <= scheduleFilterMaxDate.getTime() ? end : scheduleFilterMaxDate;
  }, [gseDraftTo, scheduleFilterMaxDate]);

  const gseScheduleFilterEndMinDate = useMemo(() => {
    if (!gseDraftFrom?.trim()) return undefined;
    const parts = gseDraftFrom.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return undefined;
    const [y, m, day] = parts;
    return new Date(y!, m! - 1, day!);
  }, [gseDraftFrom]);

  const teamScheduleFilterStartMaxDate = useMemo(() => {
    if (!teamDraftTo?.trim()) return scheduleFilterMaxDate;
    const parts = teamDraftTo.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return scheduleFilterMaxDate;
    const [y, m, day] = parts;
    const end = new Date(y!, m! - 1, day!);
    return end.getTime() <= scheduleFilterMaxDate.getTime() ? end : scheduleFilterMaxDate;
  }, [teamDraftTo, scheduleFilterMaxDate]);

  const teamScheduleFilterEndMinDate = useMemo(() => {
    if (!teamDraftFrom?.trim()) return undefined;
    const parts = teamDraftFrom.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return undefined;
    const [y, m, day] = parts;
    return new Date(y!, m! - 1, day!);
  }, [teamDraftFrom]);

  const fhrDraftAirlineName = useMemo(() => {
    if (!fhrDraftAirlineId) return '';
    const opt = airlineOptions.find((a) => a.id === fhrDraftAirlineId);
    return (opt?.name || opt?.code || '').trim();
  }, [fhrDraftAirlineId, airlineOptions]);

  const gseDraftAirlineName = useMemo(() => {
    if (!gseDraftAirlineId) return '';
    const opt = airlineOptions.find((a) => a.id === gseDraftAirlineId);
    return (opt?.name || opt?.code || '').trim();
  }, [gseDraftAirlineId, airlineOptions]);

  const teamDraftAirlineName = useMemo(() => {
    if (!teamDraftAirlineId) return '';
    const opt = airlineOptions.find((a) => a.id === teamDraftAirlineId);
    return (opt?.name || opt?.code || '').trim();
  }, [teamDraftAirlineId, airlineOptions]);

  useEffect(() => {
    if (airlinesQuery.isError) {
      toast.error('Could not load airlines from Advance Schedule Setup.');
    }
  }, [airlinesQuery.isError]);

  /** After refresh, reload the last Team query once airlines are available so bulk download can enable again. */
  useEffect(() => {
    if (airlinesLoading || teamPackRestoredRef.current) return;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(SCHEDULED_TEAM_LAST_PACK_KEY);
    } catch {
      return;
    }
    if (!raw?.trim()) return;

    let stored: StoredTeamFilterPack;
    try {
      stored = JSON.parse(raw) as StoredTeamFilterPack;
    } catch {
      return;
    }
    const fromYmd = String(stored.fromYmd ?? '').trim();
    const toYmd = String(stored.toYmd ?? '').trim();
    if (!fromYmd || !toYmd || fromYmd > toYmd) return;

    teamPackRestoredRef.current = true;

    const airlineId = String(stored.airlineId ?? '');
    const flightNo = String(stored.flightNo ?? '');
    const serial = String(stored.serial ?? '');

    setTeamDraftFrom(fromYmd);
    setTeamDraftTo(toYmd);
    setTeamDraftAirlineId(airlineId);
    setTeamDraftFlightNo(flightNo);
    setTeamDraftSerial(serial);

    void (async () => {
      const gen = ++teamDataFetchGen.current;
      setTeamLoading(true);
      setTeamRows([]);
      try {
        const opt = airlineId ? airlineOptions.find((a) => a.id === airlineId) : undefined;
        const pack: ScheduleFilterPack = {
          fromYmd,
          toYmd,
          airlineQueryLower: (opt?.name || opt?.code || '').trim().toLowerCase(),
          flightNoQueryLower: flightNo.trim().toLowerCase(),
          serialQuery: serial,
        };
        const enriched = await loadEnrichedScheduleRows(queryClient, pack);
        if (gen !== teamDataFetchGen.current) return;
        setTeamRows(enriched);
        if (enriched.length === 0) {
          try {
            sessionStorage.removeItem(SCHEDULED_TEAM_LAST_PACK_KEY);
          } catch {
            /* ignore */
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Team: failed to restore schedule after reload.');
        setTeamRows([]);
        try {
          sessionStorage.removeItem(SCHEDULED_TEAM_LAST_PACK_KEY);
        } catch {
          /* ignore */
        }
      } finally {
        setTeamLoading(false);
      }
    })();
  }, [airlinesLoading, airlineOptions]);

  const handleApplyFhr = useCallback(async () => {
    const next = validateYmdDateRange(fhrDraftFrom, fhrDraftTo, {
      fromKey: 'fhrFrom',
      toKey: 'fhrTo',
      toNotAfterToday: true,
    });
    if (applyFhrErrors(next)) return;
    setFhrLoading(true);
    setFhrRows([]);
    try {
      const pack: ScheduleFilterPack = {
        fromYmd: fhrDraftFrom,
        toYmd: fhrDraftTo,
        airlineQueryLower: fhrDraftAirlineName.trim().toLowerCase(),
        flightNoQueryLower: fhrDraftFlightNo.trim().toLowerCase(),
        serialQuery: fhrDraftSerial,
      };
      const enriched = await loadEnrichedScheduleRows(queryClient, pack);
      setFhrRows(enriched);
      if (enriched.length === 0) {
        toast.message('FHR: no flights match these filters.');
      } else {
        const n = enriched.filter((r) => r.hasFhr).length;
        toast.success(`FHR: ${enriched.length} flight(s) · ${n} with downloadable FHR.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'FHR: failed to load schedule.');
      setFhrRows([]);
    } finally {
      setFhrLoading(false);
    }
  }, [fhrDraftAirlineName, fhrDraftFlightNo, fhrDraftFrom, fhrDraftSerial, fhrDraftTo, applyFhrErrors]);

  const handleApplyGse = useCallback(async () => {
    const next = validateYmdDateRange(gseDraftFrom, gseDraftTo, {
      fromKey: 'gseFrom',
      toKey: 'gseTo',
      toNotAfterToday: true,
    });
    if (applyGseErrors(next)) return;
    setGseLoading(true);
    setGseRows([]);
    try {
      const pack: ScheduleFilterPack = {
        fromYmd: gseDraftFrom,
        toYmd: gseDraftTo,
        airlineQueryLower: gseDraftAirlineName.trim().toLowerCase(),
        flightNoQueryLower: gseDraftFlightNo.trim().toLowerCase(),
        serialQuery: gseDraftSerial,
      };
      const enriched = await loadEnrichedScheduleRows(queryClient, pack);
      setGseRows(enriched);
      if (enriched.length === 0) {
        toast.message('GSE: no flights match these filters.');
      } else {
        const n = enriched.filter((r) => r.hasGse).length;
        toast.success(`GSE: ${enriched.length} flight(s) · ${n} with GSE / equipment data.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'GSE: failed to load schedule.');
      setGseRows([]);
    } finally {
      setGseLoading(false);
    }
  }, [gseDraftAirlineName, gseDraftFlightNo, gseDraftFrom, gseDraftSerial, gseDraftTo, applyGseErrors]);

  const handleApplyTeam = useCallback(async () => {
    const next = validateYmdDateRange(teamDraftFrom, teamDraftTo, {
      fromKey: 'teamFrom',
      toKey: 'teamTo',
      toNotAfterToday: true,
    });
    if (applyTeamErrors(next)) return;
    const gen = ++teamDataFetchGen.current;
    setTeamLoading(true);
    setTeamRows([]);
    try {
      const pack: ScheduleFilterPack = {
        fromYmd: teamDraftFrom,
        toYmd: teamDraftTo,
        airlineQueryLower: teamDraftAirlineName.trim().toLowerCase(),
        flightNoQueryLower: teamDraftFlightNo.trim().toLowerCase(),
        serialQuery: teamDraftSerial,
      };
      const enriched = await loadEnrichedScheduleRows(queryClient, pack);
      if (gen !== teamDataFetchGen.current) return;
      setTeamRows(enriched);
      if (enriched.length === 0) {
        toast.message('Team: no flights match these filters.');
        try {
          sessionStorage.removeItem(SCHEDULED_TEAM_LAST_PACK_KEY);
        } catch {
          /* ignore */
        }
      } else {
        const n = enriched.filter((r) => r.hasTeam).length;
        toast.success(`Team: ${enriched.length} flight(s) · ${n} with equipment/manpower team PDF data.`);
        try {
          const toStore: StoredTeamFilterPack = {
            fromYmd: teamDraftFrom,
            toYmd: teamDraftTo,
            airlineId: teamDraftAirlineId,
            flightNo: teamDraftFlightNo,
            serial: teamDraftSerial,
          };
          sessionStorage.setItem(SCHEDULED_TEAM_LAST_PACK_KEY, JSON.stringify(toStore));
        } catch {
          /* quota / private mode */
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Team: failed to load schedule.');
      setTeamRows([]);
    } finally {
      setTeamLoading(false);
    }
  }, [teamDraftAirlineId, teamDraftAirlineName, teamDraftFlightNo, teamDraftFrom, teamDraftSerial, teamDraftTo, applyTeamErrors]);

  const handleResetFhr = useCallback(() => {
    setFhrDraftFrom(defaultScheduledReportFromYmd());
    setFhrDraftTo(defaultScheduledReportToYmd());
    setFhrDraftAirlineId('');
    setFhrDraftFlightNo('');
    setFhrDraftSerial('');
    setFhrRows([]);
    clearFhrErrors();
  }, [clearFhrErrors]);

  const handleResetGse = useCallback(() => {
    setGseDraftFrom(defaultScheduledReportFromYmd());
    setGseDraftTo(defaultScheduledReportToYmd());
    setGseDraftAirlineId('');
    setGseDraftFlightNo('');
    setGseDraftSerial('');
    setGseRows([]);
    clearGseErrors();
  }, [clearGseErrors]);

  const handleResetTeam = useCallback(() => {
    teamDataFetchGen.current += 1;
    setTeamDraftFrom(defaultScheduledReportFromYmd());
    setTeamDraftTo(defaultScheduledReportToYmd());
    setTeamDraftAirlineId('');
    setTeamDraftFlightNo('');
    setTeamDraftSerial('');
    setTeamRows([]);
    clearTeamErrors();
    try {
      sessionStorage.removeItem(SCHEDULED_TEAM_LAST_PACK_KEY);
    } catch {
      /* ignore */
    }
    teamPackRestoredRef.current = false;
  }, [clearTeamErrors]);

  const downloadAllFhr = useCallback(async () => {
    const list = fhrRows.filter((r) => r.hasFhr && r.resolvedSerial);
    if (list.length === 0) {
      toast.message('No flights with FHR data to merge.');
      return;
    }
    setDownloadingBulk('fhr');
    try {
      const docs: jsPDF[] = [];
      for (const r of list) {
        const doc = await downloadMainReportPdf(
          flightForPdf(r.flight, r.resolvedSerial!),
          r.mainDetails,
          undefined,
        );
        docs.push(doc);
      }
      const blob = await mergeJsPdfsToBlob(docs);
      const saveAs = await loadFileSaverSaveAs();
      saveAs(blob, `consolidated-fhr-${fhrDraftFrom}_${fhrDraftTo}.pdf`);
      toast.success(`One PDF with ${list.length} FHR report(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'FHR merged download failed.');
    } finally {
      setDownloadingBulk(null);
    }
  }, [fhrDraftFrom, fhrDraftTo, fhrRows]);

  const downloadAllGse = useCallback(async () => {
    const list = gseRows.filter((r) => r.hasGse && r.resolvedSerial);
    if (list.length === 0) {
      toast.message('No flights with GSE / equipment data to merge.');
      return;
    }
    setDownloadingBulk('gse');
    try {
      const docs: jsPDF[] = [];
      for (const r of list) {
        const doc = await buildEquipmentReportPdfForFlight(
          flightForPdf(r.flight, r.resolvedSerial!),
          r.mainDetails,
          undefined,
        );
        if (doc) docs.push(doc);
      }
      if (docs.length === 0) {
        toast.message('Could not build any GSE PDF pages.');
        return;
      }
      const blob = await mergeJsPdfsToBlob(docs);
      const saveAs = await loadFileSaverSaveAs();
      saveAs(blob, `consolidated-gse-${gseDraftFrom}_${gseDraftTo}.pdf`);
      toast.success(`One PDF with ${docs.length} GSE report(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'GSE merged download failed.');
    } finally {
      setDownloadingBulk(null);
    }
  }, [gseDraftFrom, gseDraftTo, gseRows]);

  const downloadAllTeam = useCallback(async () => {
    const list = teamRows.filter((r) => r.hasTeam && r.resolvedSerial);
    if (list.length === 0) {
      toast.message('No flights with team / equipment-manpower data to merge.');
      return;
    }
    setDownloadingBulk('team');
    try {
      const docs: jsPDF[] = [];
      for (const r of list) {
        const pdf = await buildScheduledTeamReportPdfFromFhrEmbed(
          flightForPdf(r.flight, r.resolvedSerial!),
          r.resolvedSerial!,
          r.mainDetails,
        );
        if (pdf) docs.push(pdf);
      }
      if (docs.length === 0) {
        toast.message(
          'Could not build any team PDF pages (need equipment-manpower data, FHR equipment lines, or the form API).',
        );
        return;
      }
      const blob = await mergeJsPdfsToBlob(docs);
      const saveAs = await loadFileSaverSaveAs();
      saveAs(blob, `consolidated-team-${teamDraftFrom}_${teamDraftTo}.pdf`);
      toast.success(`One PDF with ${docs.length} team report(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Team merged download failed.');
    } finally {
      setDownloadingBulk(null);
    }
  }, [teamDraftFrom, teamDraftTo, teamRows]);

  const downloadOneFhr = async (r: ScheduledFhrGseRow) => {
    if (!r.hasFhr || !r.resolvedSerial) {
      toast.message('No FHR document for this flight.');
      return;
    }
    try {
      await downloadFhrReportPdf(
        flightForPdf(r.flight, r.resolvedSerial),
        r.mainDetails,
        undefined,
      );
      toast.success('FHR PDF downloaded.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed.');
    }
  };

  const downloadOneGse = async (r: ScheduledFhrGseRow) => {
    if (!r.hasGse || !r.resolvedSerial) {
      toast.message('No GSE / equipment data for this flight.');
      return;
    }
    try {
      await downloadEquipmentReportPdfForFlight(
        flightForPdf(r.flight, r.resolvedSerial),
        r.mainDetails,
        undefined,
      );
      toast.success('GSE PDF downloaded.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed.');
    }
  };

  const downloadOneTeam = async (r: ScheduledFhrGseRow) => {
    if (!r.hasTeam || !r.resolvedSerial) {
      toast.message('No team report for this flight.');
      return;
    }
    try {
      const pdf = await buildScheduledTeamReportPdfFromFhrEmbed(
        flightForPdf(r.flight, r.resolvedSerial),
        r.resolvedSerial,
        r.mainDetails,
      );
      if (!pdf) {
        toast.message('No equipment / manpower source found for this serial.');
        return;
      }
      pdf.save(`Equipment-Manpower-Report-${r.flight.flightNo}-${r.resolvedSerial}.pdf`);
      toast.success('Team report PDF downloaded.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed.');
    }
  };

  const fhrCount = fhrRows.filter((r) => r.hasFhr).length;
  const gseCount = gseRows.filter((r) => r.hasGse).length;
  const teamCount = teamRows.filter((r) => r.hasTeam).length;

  return (
    <div className={`${FRIS_REPORTS_PAGE_SHELL_CLASS} bg-gradient-to-br from-slate-50 via-white to-emerald-50/30`}>
      <div className="mx-auto max-w-7xl">
        <FrisPageHeader title="Scheduled FHR, GSE & Team report" icon={Plane} />

        <Tabs defaultValue="fhr" className="w-full min-w-0">
          <TabsList className="grid h-auto w-full max-w-4xl grid-cols-3 gap-1 rounded-xl border border-slate-200/90 bg-slate-100/90 p-1.5 shadow-sm">
            <TabsTrigger
              value="fhr"
              className="min-w-0 gap-1.5 px-1.5 py-2.5 text-xs sm:gap-2 sm:text-sm data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md"
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate">FHR<span className="hidden sm:inline"> report</span></span>
            </TabsTrigger>
            <TabsTrigger
              value="gse"
              className="min-w-0 gap-1.5 px-1.5 py-2.5 text-xs sm:gap-2 sm:text-sm data-[state=active]:bg-amber-400 data-[state=active]:text-amber-950 data-[state=active]:shadow-md"
            >
              <Wrench className="h-4 w-4 shrink-0" />
              <span className="truncate">GSE<span className="hidden sm:inline"> report</span></span>
            </TabsTrigger>
            <TabsTrigger
              value="team"
              className="min-w-0 gap-1.5 px-1.5 py-2.5 text-xs sm:gap-2 sm:text-sm data-[state=active]:bg-amber-600 data-[state=active]:text-white data-[state=active]:shadow-md"
            >
              <Users className="h-4 w-4 shrink-0" />
              <span className="truncate">Team<span className="hidden sm:inline"> report</span></span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fhr" className="mt-4 outline-none focus-visible:ring-0">
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="w-full min-w-0 overflow-hidden rounded-2xl border border-emerald-200/80 bg-white shadow-sm"
          >
            <div className="flex flex-col gap-3 border-b border-emerald-100 bg-emerald-600 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex items-center gap-2 text-white">
                <FileText className="h-5 w-5 shrink-0" />
                <div>
                  <h2 className="text-base font-semibold tracking-tight">Schedule FHR report</h2>
                  <p className="text-xs text-emerald-100">
                    Per-row PDF or one combined file (cancelled flights excluded).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void downloadAllFhr()}
                disabled={downloadingBulk !== null || fhrCount === 0}
                className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-white px-4 py-2 text-sm font-medium text-emerald-800 shadow-sm hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
              >
                {downloadingBulk === 'fhr' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download all FHR
              </button>
            </div>

            <div className="border-b border-slate-200 bg-slate-50/90 p-4 sm:p-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">FHR filters</h3>
              <div className="pb-1">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-full min-w-0 sm:w-52">
                    <label className="mb-1 block text-xs font-medium text-slate-500">Airline</label>
                    <AdminRadioDropdown
                      value={fhrDraftAirlineId}
                      onChange={setFhrDraftAirlineId}
                      disabled={airlinesLoading}
                      options={[
                        {
                          value: '',
                          label: airlinesLoading ? 'Loading airlines…' : 'All airlines',
                        },
                        ...airlineOptions.map((a) => ({
                          value: a.id,
                          label: (a.name || a.code).trim() || '—',
                        })),
                      ]}
                      className={`${FILTER_CONTROL} disabled:cursor-not-allowed disabled:bg-slate-50`}
                    />
                    <FormFieldError />
                  </div>
                  <div className="w-[calc(50%-0.375rem)] min-w-0 sm:w-28">
                    <label className="mb-1 block text-xs font-medium text-slate-500">Flight no.</label>
                    <input
                      value={fhrDraftFlightNo}
                      onChange={(e) => setFhrDraftFlightNo(e.target.value)}
                      placeholder="e.g. 6E"
                      className={FILTER_CONTROL}
                    />
                    <FormFieldError />
                  </div>
                  <div className="w-[calc(50%-0.375rem)] min-w-0 sm:w-36">
                    <label className="mb-1 block text-xs font-medium text-slate-500">Serial no.</label>
                    <input
                      value={fhrDraftSerial}
                      onChange={(e) => setFhrDraftSerial(e.target.value)}
                      placeholder="Table / ops serial"
                      className={FILTER_CONTROL}
                    />
                    <FormFieldError />
                  </div>
                  <div className={cn('w-[calc(50%-0.375rem)] min-w-0 sm:w-[10.5rem]', fhrErrors.fhrFrom && FRIS_INVALID_PICKER_WRAP)}>
                    <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor="field-fhrFrom">
                      From
                    </label>
                    <DatePicker
                      id="field-fhrFrom"
                      value={fhrDraftFrom}
                      onChange={(v) => {
                        setFhrDraftFrom(v);
                        clearFhrField('fhrFrom');
                      }}
                      valueFormat="yyyy-MM-dd"
                      maxDate={fhrScheduleFilterStartMaxDate}
                    />
                    <FormFieldError id="field-fhrFrom-error" message={fhrErrors.fhrFrom} />
                  </div>
                  <div className={cn('w-[calc(50%-0.375rem)] min-w-0 sm:w-[10.5rem]', fhrErrors.fhrTo && FRIS_INVALID_PICKER_WRAP)}>
                    <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor="field-fhrTo">
                      To
                    </label>
                    <DatePicker
                      id="field-fhrTo"
                      value={fhrDraftTo}
                      onChange={(v) => {
                        setFhrDraftTo(v);
                        clearFhrField('fhrTo');
                      }}
                      valueFormat="yyyy-MM-dd"
                      minDate={fhrScheduleFilterEndMinDate}
                      maxDate={scheduleFilterMaxDate}
                    />
                    <FormFieldError id="field-fhrTo-error" message={fhrErrors.fhrTo} />
                  </div>
                  <div className={cn('flex shrink-0 items-end gap-2', FLIGHT_FILTER_ACTIONS_PB)}>
                    <button
                      type="button"
                      onClick={() => void handleApplyFhr()}
                      disabled={fhrLoading}
                      className="inline-flex h-10 min-w-[7rem] items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {fhrLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileText className="h-4 w-4" />
                      )}
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={handleResetFhr}
                      disabled={fhrLoading}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Reset
                    </button>
                  </div>
                </div>
              </div>
              {fhrRows.length > 0 && (
                <p className="mt-3 text-xs text-slate-500">
                  Showing {fhrRows.length} flight(s) · {fhrCount} with downloadable FHR.
                </p>
              )}
            </div>

            <ReportsResponsiveTable scrollClassName="max-h-[70dvh] overflow-y-auto overscroll-y-contain rounded-b-2xl">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr>
                    <th className={th}>#</th>
                    <th className={th}>Serial</th>
                    <th className={th}>Airline</th>
                    <th className={th}>Flight</th>
                    <th className={th}>STA</th>
                    <th className={th}>FHR</th>
                    <th className={th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {fhrRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className={`${td} py-12 text-center`}>
                        <div className="flex flex-col items-center gap-2 text-slate-500">
                          {fhrLoading ? (
                            <>
                              <Loader2 className="h-7 w-7 animate-spin text-emerald-500" />
                              <span className="text-sm font-medium">Loading flights…</span>
                            </>
                          ) : (
                            <>
                              <FileText className="h-7 w-7 text-emerald-300" />
                              <span className="text-sm font-medium text-slate-600">No flights yet</span>
                              <span className="text-xs text-slate-400">Apply the filters above to list flights and FHR status.</span>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    fhrRows.map((r, idx) => (
                    <tr key={`fhr-${scheduledAirlinesRowDedupeKey(r.flight)}-${idx}`} className="transition-colors odd:bg-white even:bg-emerald-50/30 hover:bg-emerald-50/70">
                      <td className={td}>{idx + 1}</td>
                      <td className={`${td} font-mono text-xs`}>
                        {displayScheduledAirlinesTableSerial(r.flight)}
                        {r.resolvedSerial && r.resolvedSerial !== String(r.flight.slNo ?? '').trim() ? (
                          <span className="mt-0.5 block text-[10px] text-slate-400">
                            API: {r.resolvedSerial}
                          </span>
                        ) : null}
                      </td>
                      <td className={td}>{r.flight.airline}</td>
                      <td className={td}>{r.flight.flightNo}</td>
                      <td className={`${td} whitespace-nowrap text-xs`}>
                        {r.flight.staDate} {r.flight.staTime}
                      </td>
                      <td className={td}>
                        <span
                          className={
                            r.hasFhr
                              ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800'
                              : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600'
                          }
                        >
                          {r.hasFhr ? 'Available' : '—'}
                        </span>
                      </td>
                      <td className={td}>
                        <button
                          type="button"
                          onClick={() => void downloadOneFhr(r)}
                          disabled={!r.hasFhr}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                        >
                          <Download className="h-3.5 w-3.5" />
                          PDF
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ReportsResponsiveTable>
        </motion.section>
          </TabsContent>

          <TabsContent value="gse" className="mt-4 outline-none focus-visible:ring-0">
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="w-full min-w-0 overflow-hidden rounded-2xl border border-amber-300/90 bg-white shadow-sm"
          >
            <div className="flex flex-col gap-3 border-b border-amber-300/80 bg-amber-400 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex items-center gap-2 text-amber-950">
                <Wrench className="h-5 w-5 shrink-0" />
                <div>
                  <h2 className="text-base font-semibold tracking-tight">Schedule GSE report</h2>
                  <p className="text-xs text-amber-900/90">
                    Per-row PDF or one combined file (cancelled flights excluded).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void downloadAllGse()}
                disabled={downloadingBulk !== null || gseCount === 0}
                className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-white px-4 py-2 text-sm font-medium text-amber-950 shadow-sm hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
              >
                {downloadingBulk === 'gse' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download all GSE
              </button>
            </div>

            <div className="border-b border-slate-200 bg-slate-50/90 p-4 sm:p-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">GSE filters</h3>
              <div className="pb-1">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-full min-w-0 sm:w-52">
                    <label className="mb-1 block text-xs font-medium text-slate-500">Airline</label>
                    <AdminRadioDropdown
                      value={gseDraftAirlineId}
                      onChange={setGseDraftAirlineId}
                      disabled={airlinesLoading}
                      options={[
                        {
                          value: '',
                          label: airlinesLoading ? 'Loading airlines…' : 'All airlines',
                        },
                        ...airlineOptions.map((a) => ({
                          value: a.id,
                          label: (a.name || a.code).trim() || '—',
                        })),
                      ]}
                      className={`${FILTER_CONTROL} disabled:cursor-not-allowed disabled:bg-slate-50`}
                    />
                    <FormFieldError />
                  </div>
                  <div className="w-[calc(50%-0.375rem)] min-w-0 sm:w-28">
                    <label className="mb-1 block text-xs font-medium text-slate-500">Flight no.</label>
                    <input
                      value={gseDraftFlightNo}
                      onChange={(e) => setGseDraftFlightNo(e.target.value)}
                      placeholder="e.g. 6E"
                      className={FILTER_CONTROL}
                    />
                    <FormFieldError />
                  </div>
                  <div className="w-[calc(50%-0.375rem)] min-w-0 sm:w-36">
                    <label className="mb-1 block text-xs font-medium text-slate-500">Serial no.</label>
                    <input
                      value={gseDraftSerial}
                      onChange={(e) => setGseDraftSerial(e.target.value)}
                      placeholder="Table / ops serial"
                      className={FILTER_CONTROL}
                    />
                    <FormFieldError />
                  </div>
                  <div className={cn('w-[calc(50%-0.375rem)] min-w-0 sm:w-[10.5rem]', gseErrors.gseFrom && FRIS_INVALID_PICKER_WRAP)}>
                    <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor="field-gseFrom">
                      From
                    </label>
                    <DatePicker
                      id="field-gseFrom"
                      value={gseDraftFrom}
                      onChange={(v) => {
                        setGseDraftFrom(v);
                        clearGseField('gseFrom');
                      }}
                      valueFormat="yyyy-MM-dd"
                      maxDate={gseScheduleFilterStartMaxDate}
                    />
                    <FormFieldError id="field-gseFrom-error" message={gseErrors.gseFrom} />
                  </div>
                  <div className={cn('w-[calc(50%-0.375rem)] min-w-0 sm:w-[10.5rem]', gseErrors.gseTo && FRIS_INVALID_PICKER_WRAP)}>
                    <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor="field-gseTo">
                      To
                    </label>
                    <DatePicker
                      id="field-gseTo"
                      value={gseDraftTo}
                      onChange={(v) => {
                        setGseDraftTo(v);
                        clearGseField('gseTo');
                      }}
                      valueFormat="yyyy-MM-dd"
                      minDate={gseScheduleFilterEndMinDate}
                      maxDate={scheduleFilterMaxDate}
                    />
                    <FormFieldError id="field-gseTo-error" message={gseErrors.gseTo} />
                  </div>
                  <div className={cn('flex shrink-0 items-end gap-2', FLIGHT_FILTER_ACTIONS_PB)}>
                    <button
                      type="button"
                      onClick={() => void handleApplyGse()}
                      disabled={gseLoading}
                      className="inline-flex h-10 min-w-[7rem] items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 text-sm font-medium text-amber-950 shadow-sm hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {gseLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wrench className="h-4 w-4" />
                      )}
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={handleResetGse}
                      disabled={gseLoading}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Reset
                    </button>
                  </div>
                </div>
              </div>
              {gseRows.length > 0 && (
                <p className="mt-3 text-xs text-slate-500">
                  Showing {gseRows.length} flight(s) · {gseCount} with GSE / equipment PDF.
                </p>
              )}
            </div>

            <ReportsResponsiveTable scrollClassName="max-h-[70dvh] overflow-y-auto overscroll-y-contain rounded-b-2xl">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr>
                    <th className={`${th} border-amber-300 bg-amber-100 text-amber-950`}>#</th>
                    <th className={`${th} border-amber-300 bg-amber-100 text-amber-950`}>Serial</th>
                    <th className={`${th} border-amber-300 bg-amber-100 text-amber-950`}>Airline</th>
                    <th className={`${th} border-amber-300 bg-amber-100 text-amber-950`}>Flight</th>
                    <th className={`${th} border-amber-300 bg-amber-100 text-amber-950`}>STA</th>
                    <th className={`${th} border-amber-300 bg-amber-100 text-amber-950`}>GSE lines</th>
                    <th className={`${th} border-amber-300 bg-amber-100 text-amber-950`}>GSE</th>
                    <th className={`${th} border-amber-300 bg-amber-100 text-amber-950`}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {gseRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className={`${td} py-12 text-center`}>
                        <div className="flex flex-col items-center gap-2 text-slate-500">
                          {gseLoading ? (
                            <>
                              <Loader2 className="h-7 w-7 animate-spin text-amber-500" />
                              <span className="text-sm font-medium">Loading flights…</span>
                            </>
                          ) : (
                            <>
                              <Wrench className="h-7 w-7 text-amber-300" />
                              <span className="text-sm font-medium text-slate-600">No flights yet</span>
                              <span className="text-xs text-slate-400">Apply the filters above to list flights and GSE status.</span>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    gseRows.map((r, idx) => (
                      <tr key={`gse-${scheduledAirlinesRowDedupeKey(r.flight)}-${idx}`} className="transition-colors odd:bg-white even:bg-amber-50/40 hover:bg-amber-50/70">
                        <td className={td}>{idx + 1}</td>
                        <td className={`${td} font-mono text-xs`}>
                          {displayScheduledAirlinesTableSerial(r.flight)}
                          {r.resolvedSerial && r.resolvedSerial !== String(r.flight.slNo ?? '').trim() ? (
                            <span className="mt-0.5 block text-[10px] text-slate-400">
                              API: {r.resolvedSerial}
                            </span>
                          ) : null}
                        </td>
                        <td className={td}>{r.flight.airline}</td>
                        <td className={td}>{r.flight.flightNo}</td>
                        <td className={`${td} whitespace-nowrap text-xs`}>
                          {r.flight.staDate} {r.flight.staTime}
                        </td>
                        <td className={td}>{r.gseLineCount}</td>
                        <td className={td}>
                          <span
                            className={
                              r.hasGse
                                ? 'rounded-full bg-amber-200/90 px-2 py-0.5 text-xs font-medium text-amber-950'
                                : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600'
                            }
                          >
                            {r.hasGse ? 'Available' : '—'}
                          </span>
                        </td>
                        <td className={td}>
                          <button
                            type="button"
                            onClick={() => void downloadOneGse(r)}
                            disabled={!r.hasGse}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                          >
                            <Download className="h-3.5 w-3.5" />
                            PDF
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </ReportsResponsiveTable>
          </motion.section>
          </TabsContent>

          <TabsContent value="team" className="mt-4 outline-none focus-visible:ring-0">
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="w-full min-w-0 overflow-hidden rounded-2xl border border-amber-300/90 bg-white shadow-sm"
            >
              <div className="flex flex-col gap-3 border-b border-amber-800/25 bg-amber-600 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="flex items-center gap-2 text-white">
                  <Users className="h-5 w-5 shrink-0" />
                  <div>
                    <h2 className="text-base font-semibold tracking-tight">Scheduled Team report</h2>
                    <p className="text-xs text-amber-100">
                      Equipment-manpower PDF from embedded FHR data · per-row or one combined file
                      (cancelled flights excluded).
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void downloadAllTeam()}
                  disabled={downloadingBulk !== null || teamCount === 0}
                  className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-white px-4 py-2 text-sm font-medium text-amber-800 shadow-sm hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
                >
                  {downloadingBulk === 'team' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Download all Team
                </button>
              </div>

              <div className="border-b border-slate-200 bg-slate-50/90 p-4 sm:p-5">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Team filters
                </h3>
                <div className="pb-1">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="w-full min-w-0 sm:w-52">
                      <label className="mb-1 block text-xs font-medium text-slate-500">Airline</label>
                      <AdminRadioDropdown
                        value={teamDraftAirlineId}
                        onChange={setTeamDraftAirlineId}
                        disabled={airlinesLoading}
                        options={[
                          {
                            value: '',
                            label: airlinesLoading ? 'Loading airlines…' : 'All airlines',
                          },
                          ...airlineOptions.map((a) => ({
                            value: a.id,
                            label: (a.name || a.code).trim() || '—',
                          })),
                        ]}
                        className={`${FILTER_CONTROL} disabled:cursor-not-allowed disabled:bg-slate-50`}
                      />
                      <FormFieldError />
                    </div>
                    <div className="w-[calc(50%-0.375rem)] min-w-0 sm:w-28">
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        Flight no.
                      </label>
                      <input
                        value={teamDraftFlightNo}
                        onChange={(e) => setTeamDraftFlightNo(e.target.value)}
                        placeholder="e.g. 6E"
                        className={FILTER_CONTROL}
                      />
                      <FormFieldError />
                    </div>
                    <div className="w-[calc(50%-0.375rem)] min-w-0 sm:w-36">
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        Serial no.
                      </label>
                      <input
                        value={teamDraftSerial}
                        onChange={(e) => setTeamDraftSerial(e.target.value)}
                        placeholder="Table / ops serial"
                        className={FILTER_CONTROL}
                      />
                      <FormFieldError />
                    </div>
                    <div className={cn('w-[calc(50%-0.375rem)] min-w-0 sm:w-[10.5rem]', teamErrors.teamFrom && FRIS_INVALID_PICKER_WRAP)}>
                      <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor="field-teamFrom">
                        From
                      </label>
                      <DatePicker
                        id="field-teamFrom"
                        value={teamDraftFrom}
                        onChange={(v) => {
                          setTeamDraftFrom(v);
                          clearTeamField('teamFrom');
                        }}
                        valueFormat="yyyy-MM-dd"
                        maxDate={teamScheduleFilterStartMaxDate}
                      />
                      <FormFieldError id="field-teamFrom-error" message={teamErrors.teamFrom} />
                    </div>
                    <div className={cn('w-[calc(50%-0.375rem)] min-w-0 sm:w-[10.5rem]', teamErrors.teamTo && FRIS_INVALID_PICKER_WRAP)}>
                      <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor="field-teamTo">
                        To
                      </label>
                      <DatePicker
                        id="field-teamTo"
                        value={teamDraftTo}
                        onChange={(v) => {
                          setTeamDraftTo(v);
                          clearTeamField('teamTo');
                        }}
                        valueFormat="yyyy-MM-dd"
                        minDate={teamScheduleFilterEndMinDate}
                        maxDate={scheduleFilterMaxDate}
                      />
                      <FormFieldError id="field-teamTo-error" message={teamErrors.teamTo} />
                    </div>
                    <div className={cn('flex shrink-0 items-end gap-2', FLIGHT_FILTER_ACTIONS_PB)}>
                      <button
                        type="button"
                        onClick={() => void handleApplyTeam()}
                        disabled={teamLoading}
                        className="inline-flex h-10 min-w-[7rem] items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {teamLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Users className="h-4 w-4" />
                        )}
                        Apply
                      </button>
                      <button
                        type="button"
                        onClick={handleResetTeam}
                        disabled={teamLoading}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Reset
                      </button>
                    </div>
                  </div>
                </div>
                {teamRows.length > 0 && (
                  <p className="mt-3 text-xs text-slate-500">
                    Showing {teamRows.length} flight(s) · {teamCount} with team / manpower PDF data.
                  </p>
                )}
              </div>

              <ReportsResponsiveTable scrollClassName="max-h-[70dvh] overflow-y-auto overscroll-y-contain rounded-b-2xl">
                <table className="w-full min-w-[760px] border-collapse text-left">
                  <thead>
                    <tr>
                      <th className={thTeam}>#</th>
                      <th className={thTeam}>Serial</th>
                      <th className={thTeam}>Airline</th>
                      <th className={thTeam}>Flight</th>
                      <th className={thTeam}>STA</th>
                      <th className={thTeam}>MP lines</th>
                      <th className={thTeam}>Team</th>
                      <th className={thTeam}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className={`${td} py-12 text-center`}>
                          <div className="flex flex-col items-center gap-2 text-slate-500">
                            {teamLoading ? (
                              <>
                                <Loader2 className="h-7 w-7 animate-spin text-amber-500" />
                                <span className="text-sm font-medium">Loading flights…</span>
                              </>
                            ) : (
                              <>
                                <Users className="h-7 w-7 text-amber-300" />
                                <span className="text-sm font-medium text-slate-600">No flights yet</span>
                                <span className="text-xs text-slate-400">Apply the filters above to list flights and team status.</span>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      teamRows.map((r, idx) => (
                        <tr
                          key={`team-${scheduledAirlinesRowDedupeKey(r.flight)}-${idx}`}
                          className="transition-colors odd:bg-white even:bg-amber-50/40 hover:bg-amber-50/70"
                        >
                          <td className={td}>{idx + 1}</td>
                          <td className={`${td} font-mono text-xs`}>
                            {displayScheduledAirlinesTableSerial(r.flight)}
                            {r.resolvedSerial &&
                            r.resolvedSerial !== String(r.flight.slNo ?? '').trim() ? (
                              <span className="mt-0.5 block text-[10px] text-slate-400">
                                API: {r.resolvedSerial}
                              </span>
                            ) : null}
                          </td>
                          <td className={td}>{r.flight.airline}</td>
                          <td className={td}>{r.flight.flightNo}</td>
                          <td className={`${td} whitespace-nowrap text-xs`}>
                            {r.flight.staDate} {r.flight.staTime}
                          </td>
                          <td className={td}>{r.teamManpowerMpCount}</td>
                          <td className={td}>
                            <span
                              className={
                                r.hasTeam
                                  ? 'rounded-full bg-amber-200/90 px-2 py-0.5 text-xs font-medium text-amber-950'
                                  : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600'
                              }
                            >
                              {r.hasTeam ? 'Available' : '—'}
                            </span>
                          </td>
                          <td className={td}>
                            <button
                              type="button"
                              onClick={() => void downloadOneTeam(r)}
                              disabled={!r.hasTeam}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                            >
                              <Download className="h-3.5 w-3.5" />
                              PDF
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </ReportsResponsiveTable>
            </motion.section>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
