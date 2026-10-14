'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Download, Loader2, Plane, ClipboardList, Printer } from 'lucide-react';
import { motion } from 'framer-motion';
import { downloadEquipmentManpowerReportPdf, downloadEquipmentSummaryReportPdf, EquipmentEntry, EquipmentSummaryEntry, ManpowerEntryForPdf } from '@/components/fris/flights/scheduledairlines/reportsPdf';
import {
  fhrEquipmentDetailsToEquipmentEntries,
  mergeEmployeeFieldsFromManpowerEquipment,
} from '@/components/fris/flights/scheduledairlines/fhrEquipmentDetailsMapping';
import { FlightData, MainDetailsData, normalizeMainDetailsData } from '@/utils/dataProcessor';
import {
  getApiBase,
  fetchEquipmentManpowerMasterCatalog,
  fetchScheduledAirlineEquipmentTemplates,
  getRawFlightScheduleBySerialUrl,
  equipmentManpowerByFlight,
  type ResolvedFhrSignatures,
} from '@/lib/api';
import { resolveSignaturesForPdf, formatSignedAt } from '@/components/fris/flights/scheduledairlines/signatures/signaturePdf';
import { frisFetch } from '@/lib/fris-auth-fetch';
import { splitEquipmentDateTimeForDisplay, formatReportSerialNo } from '@/components/fris/flights/scheduledairlines/reportPdfUtils';
import {
  buildAbbrDescriptionLookup,
  buildAbbrUnitTypeLookup,
  isManpowerUnitType,
  resolveEquipmentNamesFromCatalog,
  resolveUnitTypeFromCatalog,
} from '@/components/fris/flights/scheduledairlines/gseCatalogLookup';
import { resolveDesignationsOnRows } from '@/components/fris/flights/scheduledairlines/employeeDesignationResolve';
import { getSessionStationLogoPath } from '@/lib/station-company-logo';
import {
  equipmentReportHeaderFromSearchParams,
  extractEquipmentReportHeaderFromFhrDoc,
  mergeEquipmentReportHeaders,
  readStoredEquipmentReportHeaderPrefill,
  type EquipmentReportHeaderPrefill,
} from '@/components/fris/flights/scheduledairlines/scheduledEquipmentReportHeader';
import {
  enrichEquipmentStoredRemarksFromScheduleTemplates,
  resolveAircraftBodyForScheduleEquipment,
} from '@/components/fris/flights/scheduledairlines/scheduleEquipmentMerge';

/** Strip mojibake en-dash (ΓÇô) / unicode dashes; show real designation or ASCII "-". */
function cleanDesignationForDisplay(raw?: string): string {
  let s = String(raw ?? '')
    .replace(/ΓÇô/g, '')
    .replace(/\u2013|\u2014|\u2212/g, '-')
    .trim();
  if (!s || s === '-' || /^operator$/i.test(s)) return '-';
  return s;
}

/** Older equipment-manpower rows stored engagement duration in `remarks`. */
function isLegacyDurationRemarks(raw?: string): boolean {
  const s = String(raw ?? '').trim();
  if (!s || s === '–' || s === '-') return true;
  return /^\d{1,2}:\d{2}$/.test(s);
}

/** Pure decimal values (e.g. 1.5, 0.25) stay hidden on GSE Remarks; text / whole numbers stay. */
function isDecimalNumberRemarks(raw?: string): boolean {
  const s = String(raw ?? '').trim();
  if (!s) return false;
  return /^[+-]?(?:\d+\.\d+|\.\d+)$/.test(s);
}

function normalizeFreeTextRemarks(raw?: string): string {
  const s = String(raw ?? '').trim();
  if (!s || isLegacyDurationRemarks(s) || isDecimalNumberRemarks(s)) return '';
  return s;
}

interface ServerEquipmentResponse {
  _id: string;
  equipmentcode?: string;
  equipmentname?: string;
  gsecode?: string;
  gsename?: string;
  employeecode?: string;
  empcode?: string;
  empname?: string;
  employeename?: string;
  equipmentserialnumber?: string;
  designation?: string;
  fromdate: string;
  todate: string;
  fromtime: string;
  totime: string;
}
interface EquipmentDisplayEntry {
  id: string;
  equipmentName: string;
  equipmentId: string;
  employeeName: string;
  employeeId: string;
  designation: string;
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
  /** `remarks` on each subdocument in equipmentManpower.entries */
  remarksText?: string;
  /** Engaged time from `fhr_collection.equipmentDetails.usage_time` (overrides calculated duration in UI/PDF). */
  engagedTime?: string;
  /** Catalog `unit_type` (free-text) resolved from the FHR `equipment_name`; populated for FHR-sourced rows. */
  unitType?: string;
}

/** Root fields from Mongo `equipmentManpower` (per flight). */
interface EquipmentManpowerDbDoc {
  entries?: {
    name?: string;
    fromDate?: string;
    fromTime?: string;
    toDate?: string;
    toTime?: string;
    remarks?: string;
  }[];
  verifiedBy?: string;
  atdDate?: string;
  flightNo?: string;
  airlinesOperator?: string;
  acType?: string;
  sta?: string;
  staDate?: string;
  std?: string;
  stdDate?: string;
}

interface ServerManpowerResponse {
  _id: string;
  empname?: string;
  empcode?: string;
  designation?: string;
  place?: string;
  fromdate?: string;
  todate?: string;
  fromtime?: string;
  totime?: string;
}

interface ManpowerDisplayEntry {
  id: string;
  employeeName: string;
  employeeId: string;
  designation: string;
  place: string;
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
  remarksText?: string;
}

type SchedulePrefill = EquipmentReportHeaderPrefill;

/** Decode equipment-manpower API entries (same encoding as EquipmentManpowerForm) */
const EQ_PREFIX = 'EQ:';
const MP_PREFIX = 'MP:';
const ENC_SEP = '|';

function parseEquipmentManpowerEntries(
  rawEntries: {
    name?: string;
    entryType?: string;
    equipmentName?: string;
    equipmentSerialNo?: string;
    employeeName?: string;
    employeeId?: string;
    designation?: string;
    place?: string;
    fromDate?: string;
    fromTime?: string;
    toDate?: string;
    toTime?: string;
    remarks?: string;
  }[]
): { equipment: EquipmentDisplayEntry[]; manpower: ManpowerDisplayEntry[] } {
  const equipment: EquipmentDisplayEntry[] = [];
  const manpower: ManpowerDisplayEntry[] = [];
  let eqIdx = 0;
  let mpIdx = 0;
  (rawEntries || []).forEach((entry) => {
    const from = splitEquipmentDateTimeForDisplay(entry.fromDate, entry.fromTime);
    const to = splitEquipmentDateTimeForDisplay(entry.toDate, entry.toTime);
    const n = (entry.name || '').trim();
    const type = (entry.entryType || '').trim().toLowerCase();
    const eqParts = n.startsWith(EQ_PREFIX) ? n.slice(EQ_PREFIX.length).split(ENC_SEP) : [];
    const mpParts = n.startsWith(MP_PREFIX) ? n.slice(MP_PREFIX.length).split(ENC_SEP) : [];
    const isEquipment = type === 'equipment' || (!type && n.startsWith(EQ_PREFIX));
    const isManpower = type === 'manpower' || (!type && n.startsWith(MP_PREFIX));
    if (isEquipment) {
      equipment.push({
        id: `eq-${eqIdx++}`,
        equipmentName: entry.equipmentName ?? eqParts[0] ?? '',
        equipmentId: entry.equipmentSerialNo ?? eqParts[1] ?? '',
        employeeName: entry.employeeName ?? eqParts[2] ?? '',
        employeeId: entry.employeeId ?? eqParts[3] ?? '',
        designation: entry.designation || eqParts[4] || '',
        fromDate: from.date,
        fromTime: from.time,
        toDate: to.date,
        toTime: to.time,
        remarksText: normalizeFreeTextRemarks(entry.remarks),
      });
    } else if (isManpower) {
      const place = (entry.place ?? mpParts[3] ?? '').trim();
      manpower.push({
        id: `mp-${mpIdx++}`,
        employeeName: entry.employeeName ?? mpParts[0] ?? '',
        employeeId: entry.employeeId ?? mpParts[1] ?? '',
        designation: entry.designation ?? mpParts[2] ?? '',
        place: place === 'ramp' ? 'ramp' : 'terminal',
        fromDate: from.date,
        fromTime: from.time,
        toDate: to.date,
        toTime: to.time,
      });
    } else if (n) {
      equipment.push({
        id: `eq-${eqIdx++}`,
        equipmentName: n,
        equipmentId: '',
        employeeName: '',
        employeeId: '',
        designation: '',
        fromDate: from.date,
        fromTime: from.time,
        toDate: to.date,
        toTime: to.time,
        remarksText: normalizeFreeTextRemarks(entry.remarks),
      });
    }
  });
  return { equipment, manpower };
}

/** Overlay real job designations from staff-data / users / enriched gateway staff. */
async function resolveDesignationsFromEmployeeMaster<
  T extends { employeeId?: string; designation?: string },
>(rows: T[]): Promise<T[]> {
  return resolveDesignationsOnRows(rows);
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr?.trim()) return '';
  const parts = dateStr.trim().split(/[-/]/);
  if (parts.length !== 3) return dateStr;
  if (parts[0].length === 4) {
    const [y, m, d] = parts;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }
  const [d, m, y] = parts;
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

function formatTime(timeStr: string): string {
  if (!timeStr?.trim()) return '';
  const parts = timeStr.trim().split(':');
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  }
  return timeStr;
}

function calculateDuration(fromDate: string, fromTime: string, toDate: string, toTime: string): string {
  if (!fromDate || !fromTime || !toDate || !toTime) return '';
  const parseDate = (dateStr: string, timeStr: string): Date | null => {
    if (!dateStr?.trim() || !timeStr?.trim()) return null;
    const dateParts = dateStr.trim().split(/[/-]/);
    if (dateParts.length !== 3) return null;
    let d: number, m: number, y: number;
    if (dateParts[0].length === 4) {
      [y, m, d] = dateParts.map(Number);
    } else {
      [d, m, y] = dateParts.map(Number);
    }
    const [h, min] = timeStr.trim().split(':').map(Number);
    if (!y || !m || !d) return null;
    const date = new Date(y, m - 1, d, h ?? 0, min ?? 0, 0, 0);
    return isNaN(date.getTime()) ? null : date;
  };
  const from = parseDate(fromDate, fromTime);
  const to = parseDate(toDate, toTime);
  if (!from || !to) return '';
  const diffMs = to.getTime() - from.getTime();
  if (diffMs <= 0) return '00:00';
  const totalMins = Math.round(diffMs / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getLoggedInUserName(): string {
  if (typeof window === 'undefined') return 'User';
  try {
    const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      return user?.name || user?.username || user?.email || 'User';
    }
  } catch {
    // ignore
  }
  return 'User';
}

/** Copy ATA/ATD from `rampDetails3` embed when main details omit them. */
function fillAtaAtdFromRampEmbed(
  md: MainDetailsData,
  ramp: Record<string, unknown> | null | undefined,
): MainDetailsData {
  if (!ramp) return md;
  const out = { ...md };
  const apply = (key: keyof MainDetailsData, ...src: string[]) => {
    if (String(out[key] ?? '').trim()) return;
    for (const s of src) {
      const v = ramp[s];
      if (v != null && String(v).trim()) {
        (out as unknown as Record<string, string>)[key as string] = String(
          v,
        ).trim();
        return;
      }
    }
  };
  apply('ataDate', 'ataDate', 'ATADate');
  apply('ataTime', 'ataTime', 'ATATime');
  apply('atdDate', 'atdDate', 'ATDDate');
  apply('atdTime', 'atdTime', 'ATDTime');
  return out;
}

function EquipmentReportContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<EquipmentDisplayEntry[]>([]);
  const [manpowerEntries, setManpowerEntries] = useState<ManpowerDisplayEntry[]>([]);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [mainDetails, setMainDetails] = useState<MainDetailsData | null>(null);
  const [schedulePrefill, setSchedulePrefill] = useState<SchedulePrefill | null>(null);
  const [fhrHeaderPrefill, setFhrHeaderPrefill] = useState<SchedulePrefill | null>(null);
  /** Root document from Mongo `equipmentManpower` (flight meta + verifiedBy + atdDate, etc.). */
  const [equipmentDb, setEquipmentDb] = useState<EquipmentManpowerDbDoc | null>(null);
  const [verifiedBy, setVerifiedBy] = useState<string | null>(null);
  const [signatures, setSignatures] = useState<ResolvedFhrSignatures | null>(null);
  const [nsHeader, setNsHeader] = useState<{
    challanNo: string;
    bookingNo: string;
    operation: string;
  } | null>(null);

  const flightSlNo = searchParams.get('flightSlNo') || '';
  const instanceSlNo = searchParams.get('instanceSlNo') || '';
  const tableSerial = searchParams.get('tableSerial') || '';
  const displayTableSerial = String(
    tableSerial.trim() || flightSlNo.trim() || instanceSlNo.trim() || '',
  ).trim();
  const flightNo = searchParams.get('flightNo') || '';
  const airline = searchParams.get('airline') || '';
  const aircraft = searchParams.get('aircraft') || '';
  const staDate = searchParams.get('staDate') || '';
  const stdDate = searchParams.get('stdDate') || '';
  const staTime = searchParams.get('staTime') || '';
  const stdTime = searchParams.get('stdTime') || '';
  const reportType = (searchParams.get('reportType') || 'detailed') as 'summary' | 'detailed';
  const isNonScheduledSource =
    String(searchParams.get('source') || '').trim().toLowerCase() === 'non-scheduled';
  const challanNoFromQuery = searchParams.get('challanNo') || '';
  const bookingNoFromQuery = searchParams.get('bookingNo') || '';

  // Reusable representative signatures resolved from the repository (best-effort),
  // so the GSE preview shows the same images as the downloaded PDF.
  useEffect(() => {
    const key = displayTableSerial;
    if (!key) return;
    let mounted = true;
    void (async () => {
      const resolved = await resolveSignaturesForPdf(key, 'gse');
      if (mounted) setSignatures(resolved);
    })();
    return () => {
      mounted = false;
    };
  }, [displayTableSerial]);

  // NS Performa / Booking for preview header (same as PDF nonScheduledHeader).
  useEffect(() => {
    if (!isNonScheduledSource) {
      setNsHeader(null);
      return;
    }
    let mounted = true;
    void (async () => {
      try {
        const { fetchNsFormReportPayload } = await import(
          '@/components/fris/flights/non-scheduled-airlines/nonScheduledReportDownloads'
        );
        const { readNsReportFlightPrefill } = await import(
          '@/components/fris/flights/non-scheduled-airlines/nonScheduledReportPreview'
        );
        const serial = displayTableSerial || flightSlNo;
        const stored = readNsReportFlightPrefill(serial);
        let extras = {
          challanNo: '',
          bookingNo: '',
          operation: 'Turnaround',
        };
        if (serial) {
          const payload = await fetchNsFormReportPayload(serial);
          extras = {
            challanNo: String(payload.reportHeaderExtras.challanNo ?? '').trim(),
            bookingNo: String(payload.reportHeaderExtras.bookingNo ?? '').trim(),
            operation: String(payload.reportHeaderExtras.operation || 'Turnaround').trim(),
          };
        }
        if (!mounted) return;
        setNsHeader({
          challanNo:
            extras.challanNo ||
            String(stored?.challanNo ?? '').trim() ||
            String(challanNoFromQuery ?? '').trim(),
          bookingNo:
            extras.bookingNo ||
            String(stored?.bookingNo ?? '').trim() ||
            String(bookingNoFromQuery ?? '').trim(),
          operation: extras.operation,
        });
      } catch {
        if (!mounted) return;
        setNsHeader({
          challanNo: String(challanNoFromQuery ?? '').trim(),
          bookingNo: String(bookingNoFromQuery ?? '').trim(),
          operation: 'Turnaround',
        });
      }
    })();
    return () => {
      mounted = false;
    };
  }, [
    isNonScheduledSource,
    displayTableSerial,
    flightSlNo,
    challanNoFromQuery,
    bookingNoFromQuery,
  ]);

  const urlHeaderPrefill = React.useMemo(
    () => equipmentReportHeaderFromSearchParams(searchParams),
    [searchParams],
  );
  const storedHeaderPrefill = React.useMemo(
    () => readStoredEquipmentReportHeaderPrefill(flightSlNo, tableSerial),
    [flightSlNo, tableSerial],
  );

  const reportFromDb = React.useMemo(
    () => {
      const arr = String(mainDetails?.arrivalFlightNo ?? '').trim();
      const dep = String(mainDetails?.departureFlightNo ?? '').trim();
      const flightNoFromMain =
        arr && dep ? `${arr}/${dep}` : dep || arr || '';
      const merged = mergeEquipmentReportHeaders(
        storedHeaderPrefill,
        urlHeaderPrefill,
        {
          flightNo: equipmentDb?.flightNo,
          airline: equipmentDb?.airlinesOperator,
          aircraft: equipmentDb?.acType,
          staDate: equipmentDb?.staDate,
          staTime: equipmentDb?.sta,
          stdDate: equipmentDb?.stdDate,
          stdTime: equipmentDb?.std,
        },
        {
          flightNo: mainDetails?.flightCode || flightNoFromMain,
          airline: mainDetails?.airlineName,
          aircraft: mainDetails?.aircraftType,
        },
        fhrHeaderPrefill,
        schedulePrefill,
      );
      return {
        flightNo: merged.flightNo || flightNo,
        airline: merged.airline || airline,
        aircraft: merged.aircraft || aircraft,
        staDate: merged.staDate || staDate,
        staTime: merged.staTime || staTime,
        stdDate: merged.stdDate || stdDate,
        stdTime: merged.stdTime || stdTime,
      };
    },
    [
      equipmentDb,
      mainDetails,
      flightNo,
      airline,
      aircraft,
      staDate,
      staTime,
      stdDate,
      stdTime,
      schedulePrefill,
      fhrHeaderPrefill,
      storedHeaderPrefill,
      urlHeaderPrefill,
    ],
  );

  const flightData = React.useMemo(
    () =>
      ({
        slNo: displayTableSerial || flightSlNo,
        flightNo: reportFromDb.flightNo,
        airline: reportFromDb.airline,
        aircraft: reportFromDb.aircraft,
        staDate: reportFromDb.staDate,
        stdDate: reportFromDb.stdDate,
        staTime: reportFromDb.staTime,
        stdTime: reportFromDb.stdTime,
        destination: '',
        flightType: '',
      }) as FlightData,
    [displayTableSerial, flightSlNo, reportFromDb],
  );

  const mainDetailsForHeader = React.useMemo((): MainDetailsData | null => {
    const dbAtd = equipmentDb?.atdDate?.trim();
    const mergedAtd = (mainDetails?.atdDate?.trim() || dbAtd || '').trim();
    if (!mainDetails && !mergedAtd) return mainDetails;
    return {
      ...(mainDetails ?? ({} as MainDetailsData)),
      ...(mergedAtd ? { atdDate: mergedAtd } : {}),
    };
  }, [mainDetails, equipmentDb]);

  // Equipment data source:
  // - With a flight serial: `GET /fhr-collection/flight/:serial` embeds (`equipmentManpower`, `mainDetails`) only.
  // - Without a serial: GET /equipment-details and /manpower-details (standalone lists).
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const base = getApiBase().replace(/\/$/, '');

      try {
        if (flightSlNo || instanceSlNo || tableSerial) {
          const raw = [flightSlNo, instanceSlNo, tableSerial].map((s) => String(s ?? '').trim()).filter(Boolean);
          const expanded: string[] = [];
          for (const r of raw) {
            expanded.push(r, r.replace(/^FL-/i, ''), r.replace(/[^0-9]/g, ''));
          }
          const serialCandidates = Array.from(new Set(expanded.filter(Boolean)));

          let scheduleLoaded = false;
          for (const serial of serialCandidates) {
            try {
              const scheduleRes = await frisFetch(getRawFlightScheduleBySerialUrl(serial));
              if (!scheduleRes.ok) continue;
              const scheduleJson = (await scheduleRes.json()) as SchedulePrefill | null;
              if (scheduleJson && typeof scheduleJson === 'object') {
                setSchedulePrefill(scheduleJson);
                scheduleLoaded = true;
                break;
              }
            } catch {
              // ignore; try next serial
            }
          }
          if (!scheduleLoaded) setSchedulePrefill(null);

          setEquipmentDb(null);
          setVerifiedBy(null);
          setFhrHeaderPrefill(null);

          const catalogItems = await fetchEquipmentManpowerMasterCatalog();
          const abbrLookup = buildAbbrDescriptionLookup(catalogItems);
          /** abbr/description ΓåÆ catalog `unit_type` for the manpower split on the summary GSE report. */
          const unitTypeLookup = buildAbbrUnitTypeLookup(catalogItems);

          let loaded = false;
          for (const serial of serialCandidates) {
            const fhrRes = await frisFetch(
              `${base}/fhr-collection/flight/${encodeURIComponent(serial)}`,
            );
            if (!fhrRes.ok) continue;
            const fhrDoc = (await fhrRes.json()) as {
              SerialNo?: number;
              flightSerialNumber?: number;
              mainDetails?: Record<string, unknown> | null;
              rampDetails3?: Record<string, unknown> | null;
              equipmentManpower?: EquipmentManpowerDbDoc | null;
              equipmentDetails?: unknown[];
            };
            const eqRaw = fhrDoc?.equipmentManpower;
            const doc: EquipmentManpowerDbDoc | null =
              eqRaw && typeof eqRaw === 'object' ? eqRaw : null;
            const rawEntries = doc?.entries ?? [];
            const parsedForm = parseEquipmentManpowerEntries(rawEntries);
            const eqFromForm = parsedForm.equipment;
            let mpList = parsedForm.manpower;

            const details = fhrDoc?.equipmentDetails;
            let eqList: EquipmentDisplayEntry[];
            let overlayEquipmentDbDoc: EquipmentManpowerDbDoc | null = null;
            if (Array.isArray(details) && details.length > 0) {
              let formEquipmentForOverlay = eqFromForm;
              // Match GSE PDF: when FHR embed is empty, still overlay standalone
              // equipment-manpower form remarks onto FHR detail rows.
              if (formEquipmentForOverlay.length === 0) {
                for (const eqSerial of serialCandidates) {
                  try {
                    const eqRes = await frisFetch(
                      equipmentManpowerByFlight(eqSerial).get(),
                    );
                    if (!eqRes.ok) continue;
                    const eqText = await eqRes.text();
                    if (!eqText.trim()) continue;
                    const parsed = JSON.parse(eqText) as EquipmentManpowerDbDoc;
                    const overlayEntries = parsed?.entries ?? [];
                    if (!Array.isArray(overlayEntries) || overlayEntries.length === 0) {
                      continue;
                    }
                    const parsedLists = parseEquipmentManpowerEntries(overlayEntries);
                    formEquipmentForOverlay = parsedLists.equipment;
                    if (mpList.length === 0) mpList = parsedLists.manpower;
                    if (parsed && typeof parsed === 'object') {
                      overlayEquipmentDbDoc = parsed;
                    }
                    break;
                  } catch {
                    // try next serial
                  }
                }
              }

              const formAsEquipmentEntries = formEquipmentForOverlay.map((e) => ({
                equipmentName: e.equipmentName,
                equipmentId: e.equipmentId,
                employeeName: e.employeeName,
                employeeId: e.employeeId,
                designation: e.designation,
                fromDate: e.fromDate,
                fromTime: e.fromTime,
                toDate: e.toDate,
                toTime: e.toTime,
                storedRemarks: normalizeFreeTextRemarks(e.remarksText) || undefined,
                engagedTime: e.engagedTime,
              }));
              let mapped = mergeEmployeeFieldsFromManpowerEquipment(
                fhrEquipmentDetailsToEquipmentEntries(details, abbrLookup),
                formAsEquipmentEntries,
              );

              // Existing closed flights may have published blank FHR remarks;
              // fill from Advance → Schedule Equipment when still empty.
              if (mapped.some((e) => !String(e.storedRemarks ?? '').trim())) {
                try {
                  const md =
                    fhrDoc?.mainDetails && typeof fhrDoc.mainDetails === 'object'
                      ? (fhrDoc.mainDetails as Record<string, unknown>)
                      : {};
                  const pick = (...keys: string[]) => {
                    for (const k of keys) {
                      const v = String(md[k] ?? '').trim();
                      if (v) return v;
                    }
                    return '';
                  };
                  const ataDate = pick('ataDate', 'ATADate');
                  const ataTime = pick('ataTime', 'ATATime');
                  const atdDate = pick('atdDate', 'ATDDate');
                  const atdTime = pick('atdTime', 'ATDTime');
                  const staDate = pick('staDate', 'STADate');
                  const stdDate = pick('stdDate', 'STDDate');
                  const defaultDate = stdDate || staDate || ataDate || atdDate || '';
                  const airlineCode = pick('airlineCode', 'Arline_Code');
                  const airlineName = pick('airlineName', 'Airline');
                  const normalizedMd = normalizeMainDetailsData(md);
                  if (airlineCode || airlineName) {
                    const rules = await fetchScheduledAirlineEquipmentTemplates({
                      airlineCode: airlineCode || undefined,
                      airlineName: airlineName || undefined,
                      aircraftBody: resolveAircraftBodyForScheduleEquipment(
                        normalizedMd,
                      ),
                      splitOperation: md.ifOperationSplit === true,
                      ataDate: ataDate || staDate,
                      ataTime,
                      atdDate: atdDate || stdDate,
                      atdTime,
                      defaultDate,
                    });
                    mapped = enrichEquipmentStoredRemarksFromScheduleTemplates(
                      mapped,
                      rules,
                    );
                  }
                } catch {
                  // keep mapped as-is
                }
              }

              eqList = mapped.map((e, idx) => {
                const rawDetail = (details[idx] as Record<string, unknown>) ?? {};
                const rawName = String(rawDetail.equipment_name ?? '').trim();
                const unitType = resolveUnitTypeFromCatalog(rawName, unitTypeLookup);
                return {
                  id: `fhr-eq-${idx}`,
                  equipmentName: e.equipmentName,
                  equipmentId: e.equipmentId || '',
                  employeeName: e.employeeName || '',
                  employeeId: e.employeeId || '',
                  designation: e.designation || '',
                  fromDate: e.fromDate,
                  fromTime: e.fromTime,
                  toDate: e.toDate,
                  toTime: e.toTime,
                  remarksText: normalizeFreeTextRemarks(e.storedRemarks) || undefined,
                  engagedTime: (e.engagedTime ?? '').trim() || undefined,
                  unitType,
                };
              });
            } else {
              eqList = eqFromForm;
            }

            // Same fallback as GSE PDF: Open-form rows live in equipment-manpower
            // collection and may not yet be published onto FHR embeds (esp. NS).
            let equipmentDbDoc: EquipmentManpowerDbDoc | null =
              overlayEquipmentDbDoc ?? doc;
            if (eqList.length === 0 && mpList.length === 0) {
              for (const eqSerial of serialCandidates) {
                try {
                  const eqRes = await frisFetch(
                    equipmentManpowerByFlight(eqSerial).get(),
                  );
                  if (!eqRes.ok) continue;
                  const eqText = await eqRes.text();
                  if (!eqText.trim()) continue;
                  const parsed = JSON.parse(eqText) as EquipmentManpowerDbDoc;
                  const fallbackEntries = parsed?.entries ?? [];
                  if (!Array.isArray(fallbackEntries) || fallbackEntries.length === 0) {
                    continue;
                  }
                  const parsedLists = parseEquipmentManpowerEntries(fallbackEntries);
                  eqList = parsedLists.equipment;
                  mpList = parsedLists.manpower;
                  equipmentDbDoc =
                    parsed && typeof parsed === 'object' ? parsed : equipmentDbDoc;
                  break;
                } catch {
                  // try next serial
                }
              }
            }

            const [resolvedEq, resolvedMp] = await Promise.all([
              resolveDesignationsFromEmployeeMaster(eqList),
              resolveDesignationsFromEmployeeMaster(mpList),
            ]);
            setEntries(resolveEquipmentNamesFromCatalog(resolvedEq, abbrLookup));
            setManpowerEntries(resolvedMp);
            setEquipmentDb(equipmentDbDoc);
            setFhrHeaderPrefill(extractEquipmentReportHeaderFromFhrDoc(fhrDoc));
            const vb =
              typeof equipmentDbDoc?.verifiedBy === 'string'
                ? equipmentDbDoc.verifiedBy.trim()
                : '';
            setVerifiedBy(vb ? vb : null);

            const md = fhrDoc?.mainDetails;
            if (md && typeof md === 'object') {
              const sn = Number(fhrDoc.SerialNo ?? fhrDoc.flightSerialNumber ?? serial);
              const m = md as Record<string, unknown>;
              const arr = String(m.ArrivalFltNo ?? '').trim();
              const dep = String(m.DepartureFltNo ?? '').trim();
              const fromArrDep =
                arr && dep ? `${arr}/${dep}` : dep || arr || '';
              const airlineName = String(
                m.airlineName ?? m.Airline ?? airline ?? '',
              ).trim();
              const flightCode = String(
                m.flightCode ?? fromArrDep ?? flightNo ?? '',
              ).trim();
              const normalized = normalizeMainDetailsData(md);
              if (normalized) {
                let merged: MainDetailsData = {
                  ...normalized,
                  flightSerialNumber: Number.isFinite(sn)
                    ? sn
                    : normalized.flightSerialNumber ||
                      Number(String(serial).replace(/\D/g, '')) ||
                      0,
                  airlineName: airlineName || normalized.airlineName || airline,
                  flightCode: flightCode || normalized.flightCode || flightNo,
                };
                merged = fillAtaAtdFromRampEmbed(
                  merged,
                  fhrDoc.rampDetails3 ?? undefined,
                );
                setMainDetails(merged);
              } else {
                setMainDetails(null);
              }
            } else {
              setMainDetails(null);
            }

            loaded = true;
            break;
          }
          if (!loaded) {
            let fallbackEq: EquipmentDisplayEntry[] = [];
            let fallbackMp: ManpowerDisplayEntry[] = [];
            let fallbackDoc: EquipmentManpowerDbDoc | null = null;
            for (const eqSerial of serialCandidates) {
              try {
                const eqRes = await frisFetch(
                  equipmentManpowerByFlight(eqSerial).get(),
                );
                if (!eqRes.ok) continue;
                const eqText = await eqRes.text();
                if (!eqText.trim()) continue;
                const parsed = JSON.parse(eqText) as EquipmentManpowerDbDoc;
                const fallbackEntries = parsed?.entries ?? [];
                if (!Array.isArray(fallbackEntries) || fallbackEntries.length === 0) {
                  continue;
                }
                const parsedLists = parseEquipmentManpowerEntries(fallbackEntries);
                fallbackEq = parsedLists.equipment;
                fallbackMp = parsedLists.manpower;
                fallbackDoc =
                  parsed && typeof parsed === 'object' ? parsed : null;
                break;
              } catch {
                // try next serial
              }
            }
            if (fallbackEq.length > 0 || fallbackMp.length > 0) {
              const [resolvedEq, resolvedMp] = await Promise.all([
                resolveDesignationsFromEmployeeMaster(fallbackEq),
                resolveDesignationsFromEmployeeMaster(fallbackMp),
              ]);
              setEntries(resolveEquipmentNamesFromCatalog(resolvedEq, abbrLookup));
              setManpowerEntries(resolvedMp);
              setEquipmentDb(fallbackDoc);
              const vb =
                typeof fallbackDoc?.verifiedBy === 'string'
                  ? fallbackDoc.verifiedBy.trim()
                  : '';
              setVerifiedBy(vb ? vb : null);
            } else {
              setEntries([]);
              setManpowerEntries([]);
              setEquipmentDb(null);
              setVerifiedBy(null);
            }
            setMainDetails(null);
            setFhrHeaderPrefill(null);
          }

          setLoading(false);
          return;
        }

        setEquipmentDb(null);
        setVerifiedBy(null);
        setMainDetails(null);
        setSchedulePrefill(null);

        const catalogItems = await fetchEquipmentManpowerMasterCatalog();
        const abbrLookup = buildAbbrDescriptionLookup(catalogItems);

        const equipmentRes = await frisFetch(`${base}/equipment-details`);
        if (equipmentRes.ok) {
          const eqText = await equipmentRes.text();
          let data: ServerEquipmentResponse[] = [];
          if (eqText.trim()) {
            try {
              const parsed = JSON.parse(eqText) as unknown;
              if (Array.isArray(parsed)) data = parsed as ServerEquipmentResponse[];
            } catch {
              data = [];
            }
          }
          if (Array.isArray(data)) {
            const mapped = data.map((e, idx) => ({
              id: e._id || `eq-${idx}`,
              equipmentName: e.gsename || e.equipmentname || '',
              equipmentId: e.gsecode || e.equipmentcode || e.equipmentserialnumber || '',
              employeeName: e.empname || e.employeename || '',
              employeeId: e.empcode || e.employeecode || '',
              designation: e.designation || '',
              fromDate: e.fromdate || '',
              fromTime: e.fromtime || '',
              toDate: e.todate || '',
              toTime: e.totime || '',
            }));
            const resolved = await resolveDesignationsFromEmployeeMaster(mapped);
            setEntries(resolveEquipmentNamesFromCatalog(resolved, abbrLookup));
          }
        }

        const manpowerRes = await frisFetch(`${base}/manpower-details`);
        if (manpowerRes.ok) {
          const mpText = await manpowerRes.text();
          let manpowerData: ServerManpowerResponse[] = [];
          if (mpText.trim()) {
            try {
              const parsed = JSON.parse(mpText) as unknown;
              if (Array.isArray(parsed)) manpowerData = parsed as ServerManpowerResponse[];
            } catch {
              manpowerData = [];
            }
          }
          if (Array.isArray(manpowerData)) {
            const mapped = manpowerData.map((e) => ({
              id: e._id,
              employeeName: e.empname || '',
              employeeId: e.empcode || '',
              designation: e.designation || '',
              place: (e.place === 'ramp' ? 'ramp' : 'terminal') as 'ramp' | 'terminal',
              fromDate: e.fromdate || '',
              fromTime: e.fromtime || '',
              toDate: e.todate || '',
              toTime: e.totime || '',
            }));
            setManpowerEntries(await resolveDesignationsFromEmployeeMaster(mapped));
          }
        }
      } catch (error) {
        console.error('Error fetching equipment/manpower data:', error);
      } finally {
        setLoading(false);
      }
    }

    async function loadLogo() {
      try {
        const response = await fetch(getSessionStationLogoPath());
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => setLogoBase64(reader.result as string);
        reader.readAsDataURL(blob);
      } catch {
        setLogoBase64(null);
      }
    }

    fetchData();
    loadLogo();
  }, [flightSlNo, instanceSlNo, tableSerial]);

  /** Split FHR-sourced entries into equipment vs. manpower using the catalog `unit_type`. */
  const equipmentOnlyEntries = React.useMemo(
    () => entries.filter((e) => !isManpowerUnitType(e.unitType)),
    [entries],
  );
  const manpowerFromEquipmentEntries = React.useMemo(
    () => entries.filter((e) => isManpowerUnitType(e.unitType)),
    [entries],
  );

  /**
   * Detailed manpower table source: MP: form entries + FHR equipmentDetails rows whose catalog
   * `unit_type` is manpower. The shifted FHR rows leave Employee Name/ID blank and use the
   * catalog `description` (already resolved into `equipmentName`) as the Designation.
   */
  const combinedManpowerEntries = React.useMemo((): ManpowerDisplayEntry[] => {
    const shifted: ManpowerDisplayEntry[] = manpowerFromEquipmentEntries.map((e, idx) => ({
      id: `mp-fhr-${idx}`,
      employeeName: '',
      employeeId: '',
      designation: e.equipmentName,
      place: 'terminal',
      fromDate: e.fromDate,
      fromTime: e.fromTime,
      toDate: e.toDate,
      toTime: e.toTime,
    }));
    return [...manpowerEntries, ...shifted];
  }, [manpowerEntries, manpowerFromEquipmentEntries]);

  /** For detailed report: count of employees by designation (from equipment + manpower). */
  const designationCountRows = React.useMemo((): { designation: string; count: number }[] => {
    const countByDesignation = new Map<string, number>();
    const add = (designation?: string) => {
      const label = cleanDesignationForDisplay(designation);
      if (!label || label === '-') return;
      countByDesignation.set(label, (countByDesignation.get(label) ?? 0) + 1);
    };
    equipmentOnlyEntries.forEach((e) => add(e.designation));
    combinedManpowerEntries.forEach((e) => add(e.designation));
    return Array.from(countByDesignation.entries())
      .map(([designation, count]) => ({ designation, count }))
      .sort((a, b) => a.designation.localeCompare(b.designation));
  }, [equipmentOnlyEntries, combinedManpowerEntries]);

  /** Build summary rows (one row per equipment + window) from a list of display entries. */
  const buildSummaryRows = React.useCallback(
    (list: EquipmentDisplayEntry[]): EquipmentSummaryEntry[] => {
      const key = (e: EquipmentDisplayEntry, idx: number) =>
        `${e.id ?? idx}|${e.equipmentName}|${e.equipmentId}|${e.fromDate}|${e.fromTime}|${e.toDate}|${e.toTime}`;
      const map = new Map<
        string,
        { entry: EquipmentDisplayEntry; employeeIds: string[]; dbRemarks: Set<string> }
      >();
      list.forEach((e, idx) => {
        const k = key(e, idx);
        const r = normalizeFreeTextRemarks(e.remarksText);
        const existing = map.get(k);
        if (existing) {
          if (e.employeeId && !existing.employeeIds.includes(e.employeeId)) {
            existing.employeeIds.push(e.employeeId);
          }
          if (r) existing.dbRemarks.add(r);
        } else {
          const dbRemarks = new Set<string>();
          if (r) dbRemarks.add(r);
          map.set(k, {
            entry: e,
            employeeIds: e.employeeId ? [e.employeeId] : [],
            dbRemarks,
          });
        }
      });
      return Array.from(map.values()).map(({ entry, employeeIds, dbRemarks }) => ({
        equipmentName: entry.equipmentName,
        equipmentId: entry.equipmentId,
        employeeCodes: employeeIds.join(', ') || '-',
        fromDate: entry.fromDate,
        fromTime: entry.fromTime,
        toDate: entry.toDate,
        toTime: entry.toTime,
        remarks:
          (entry.engagedTime && entry.engagedTime.trim()) ||
          calculateDuration(entry.fromDate, entry.fromTime, entry.toDate, entry.toTime),
        remarksText: Array.from(dbRemarks).join('; '),
      }));
    },
    [],
  );

  /** GSE table rows: equipment-only (manpower-tagged FHR rows go to a separate table below). */
  const summaryRows = React.useMemo(
    () => buildSummaryRows(equipmentOnlyEntries),
    [buildSummaryRows, equipmentOnlyEntries],
  );

  /** Manpower table rows (summary GSE report): rows whose catalog `unit_type` flags them as manpower. */
  const manpowerSummaryRows = React.useMemo(
    () => buildSummaryRows(manpowerFromEquipmentEntries),
    [buildSummaryRows, manpowerFromEquipmentEntries],
  );

  const handleDownload = async () => {
    setDownloading(true);
    try {
      if (isNonScheduledSource) {
        const { downloadNonScheduledReport } = await import(
          '@/components/fris/flights/non-scheduled-airlines/nonScheduledReportDownloads'
        );
        const {
          readNsReportFlightPrefill,
          nsFlightFromSearchParams,
        } = await import(
          '@/components/fris/flights/non-scheduled-airlines/nonScheduledReportPreview'
        );
        const stored = readNsReportFlightPrefill(displayTableSerial || flightSlNo);
        const nsFlight =
          stored ??
          nsFlightFromSearchParams(
            new URLSearchParams(typeof window !== 'undefined' ? window.location.search : ''),
          );
        await downloadNonScheduledReport(
          nsFlight,
          reportType === 'summary' ? 'gse' : 'team',
        );
        return;
      }

      if (reportType === 'summary') {
        await downloadEquipmentSummaryReportPdf(
          flightData,
          summaryRows,
          mainDetailsForHeader,
          verifiedBy || getLoggedInUserName(),
          manpowerSummaryRows,
        );
      } else {
        const pdfEntries: EquipmentEntry[] = equipmentOnlyEntries.map((e) => ({
          equipmentName: e.equipmentName,
          equipmentId: e.equipmentId,
          employeeName: e.employeeName,
          employeeId: e.employeeId,
          designation: e.designation || '',
          fromDate: e.fromDate,
          fromTime: e.fromTime,
          toDate: e.toDate,
          toTime: e.toTime,
          storedRemarks: normalizeFreeTextRemarks(e.remarksText) || undefined,
          engagedTime: (e.engagedTime ?? '').trim() || undefined,
        }));
        const pdfManpower: ManpowerEntryForPdf[] = combinedManpowerEntries.map((e) => ({
          employeeName: e.employeeName,
          employeeId: e.employeeId,
          designation: e.designation,
          place: e.place === 'ramp' ? 'ramp' : 'terminal',
          fromDate: e.fromDate,
          fromTime: e.fromTime,
          toDate: e.toDate,
          toTime: e.toTime,
        }));
        const [resolvedEq, resolvedMp] = await Promise.all([
          resolveDesignationsOnRows(pdfEntries),
          resolveDesignationsOnRows(pdfManpower),
        ]);
        await downloadEquipmentManpowerReportPdf(
          flightData,
          resolvedEq,
          mainDetailsForHeader,
          verifiedBy || getLoggedInUserName(),
          resolvedMp,
        );
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert(error instanceof Error ? error.message : 'Error generating PDF. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-amber-500 animate-spin" />
          <p className="text-gray-600 font-medium">Loading Equipment Report...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-200 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header with Download Button */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-lg p-4 mb-6 flex items-center justify-between print:hidden"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-500 text-white">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {reportType === 'summary' ? 'Equipment Report' : 'Detailed Equipment / Manpower'}
              </h1>
              <p className="text-sm text-gray-500">{reportFromDb.airline} - {reportFromDb.flightNo}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              <Printer className="w-4 h-4" />
              Print
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {downloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Download PDF
                </>
              )}
            </motion.button>
          </div>
        </motion.div>

        {/* Report Content - styled as A4 paper sheet matching PDF layout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white shadow-2xl rounded-sm border border-gray-300 print:shadow-none fris-report-preview text-gray-900 max-w-[210mm] mx-auto p-6 sm:p-8"
          id="equipment-report-content"
          style={{ fontFamily: 'Times New Roman, Times, serif' }}
        >
          {/* Report Header: logo (left), middle: title, right: airline name + serial no */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center gap-6">
              <div className="shrink-0 w-28 flex items-center">
                {logoBase64 ? (
                  <img src={logoBase64} alt="Logo" className="h-12 object-contain" />
                ) : (
                  <div className="text-sm font-bold text-gray-600">Logo</div>
                )}
              </div>
              <div className="flex-1 text-center">
                <h2 className="text-xl font-bold text-gray-900 underline uppercase tracking-wide">
                  {reportType === 'summary' ? 'Equipment Report' : 'Detailed list of equipment/manpower'}
                </h2>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-lg font-bold text-gray-900">{reportFromDb.airline}</p>
                <p className="text-sm text-gray-700 mt-0.5">
                  <span className="font-medium">Serial No :</span>{' '}
                  {formatReportSerialNo(displayTableSerial || flightSlNo)}
                </p>
                {isNonScheduledSource && (
                  <>
                    <p className="text-sm text-gray-700 mt-0.5">
                      <span className="font-medium">Performa No :</span>{' '}
                      {nsHeader?.challanNo || challanNoFromQuery || '—'}
                    </p>
                    <p className="text-sm text-gray-700 mt-0.5">
                      <span className="font-medium">Booking No :</span>{' '}
                      {nsHeader?.bookingNo || bookingNoFromQuery || '—'}
                    </p>
                    <p className="text-sm text-gray-700 mt-0.5">
                      {`${nsHeader?.operation || 'Turnaround'}   Non-Scheduled`}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Flight Info Table - outer border only, no inner partition lines */}
          <div className="px-6 py-3 border-b border-gray-200">
            <div className="border border-gray-200 rounded report-cell text-[11px] leading-tight">
              <div
                className="items-start report-row-tight"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  columnGap: '1rem',
                  rowGap: '0.25rem',
                }}
              >
                <div><span className="font-medium">Flight No:</span> {reportFromDb.flightNo}</div>
                <div><span className="font-medium">STD Date:</span> {formatDisplayDate(reportFromDb.stdDate)}</div>
                <div><span className="font-medium">STD Time:</span> {formatTime(reportFromDb.stdTime)}</div>
                <div><span className="font-medium">ATD Date:</span> {formatDisplayDate(mainDetailsForHeader?.atdDate || '')}</div>
                <div><span className="font-medium">ATD Time:</span> {formatTime(mainDetailsForHeader?.atdTime || '')}</div>
                <div><span className="font-medium">Aircraft Type:</span> {reportFromDb.aircraft}</div>
                <div><span className="font-medium">STA Date:</span> {formatDisplayDate(reportFromDb.staDate)}</div>
                <div><span className="font-medium">STA Time:</span> {formatTime(reportFromDb.staTime)}</div>
                <div><span className="font-medium">ATA Date:</span> {formatDisplayDate(mainDetailsForHeader?.ataDate || '')}</div>
                <div><span className="font-medium">ATA Time:</span> {formatTime(mainDetailsForHeader?.ataTime || '')}</div>
              </div>
            </div>
          </div>

          {/* Equipment Table - Summary or Detailed: thin borders, font size 8 (~11px) */}
          <div className="p-4">
            {reportType === 'detailed' && (
              <h3 className="text-sm font-bold text-gray-900 mb-2 uppercase tracking-wide">EQUIPMENT</h3>
            )}
            {reportType === 'summary' ? (
              <>
                <table className="w-full border-collapse text-[11px] leading-tight" style={{ borderWidth: '0.5px' }}>
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-200 p-2 text-left font-semibold w-[24%]">GSE NAME</th>
                      <th className="border border-gray-200 p-2 text-left font-semibold w-[12%]">From Date</th>
                      <th className="border border-gray-200 p-2 text-left font-semibold w-[9%]">From Time</th>
                      <th className="border border-gray-200 p-2 text-left font-semibold w-[12%]">To Date</th>
                      <th className="border border-gray-200 p-2 text-left font-semibold w-[9%]">To Time</th>
                      <th className="border border-gray-200 p-2 text-left font-semibold w-[10%]">Eng. time</th>
                      <th className="border border-gray-200 p-2 text-left font-semibold w-[24%]">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="border border-gray-200 p-8 text-center text-gray-500">
                          No equipment entries found
                        </td>
                      </tr>
                    ) : (
                      summaryRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="border border-gray-200 p-2">{row.equipmentName}</td>
                          <td className="border border-gray-200 p-2 text-nowrap">{formatDisplayDate(row.fromDate)}</td>
                          <td className="border border-gray-200 p-2 text-nowrap">{formatTime(row.fromTime)}</td>
                          <td className="border border-gray-200 p-2 text-nowrap">{formatDisplayDate(row.toDate)}</td>
                          <td className="border border-gray-200 p-2 text-nowrap">{formatTime(row.toTime)}</td>
                          <td className="border border-gray-200 p-2">{row.remarks}</td>
                          <td className="border border-gray-200 p-2 whitespace-pre-wrap break-words">
                            {row.remarksText?.trim() || '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                {manpowerSummaryRows.length > 0 ? (
                  <div className="mt-6">
                    <table
                      className="w-full border-collapse text-[11px]"
                      style={{ borderWidth: '0.5px' }}
                    >
                      <thead>
                        <tr className="bg-indigo-50">
                          <th className="border border-gray-200 p-2 text-left font-semibold w-[24%]">
                            MANPOWER NAME
                          </th>
                          <th className="border border-gray-200 p-2 text-left font-semibold w-[12%]">
                            From Date
                          </th>
                          <th className="border border-gray-200 p-2 text-left font-semibold w-[9%]">
                            From Time
                          </th>
                          <th className="border border-gray-200 p-2 text-left font-semibold w-[12%]">
                            To Date
                          </th>
                          <th className="border border-gray-200 p-2 text-left font-semibold w-[9%]">
                            To Time
                          </th>
                          <th className="border border-gray-200 p-2 text-left font-semibold w-[10%]">
                            Eng. time
                          </th>
                          <th className="border border-gray-200 p-2 text-left font-semibold w-[24%]">
                            Remarks
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {manpowerSummaryRows.map((row, idx) => (
                          <tr key={`mp-${idx}`} className="hover:bg-gray-50">
                            <td className="border border-gray-200 p-2">{row.equipmentName}</td>
                            <td className="border border-gray-200 p-2 text-nowrap">
                              {formatDisplayDate(row.fromDate)}
                            </td>
                            <td className="border border-gray-200 p-2 text-nowrap">
                              {formatTime(row.fromTime)}
                            </td>
                            <td className="border border-gray-200 p-2 text-nowrap">
                              {formatDisplayDate(row.toDate)}
                            </td>
                            <td className="border border-gray-200 p-2 text-nowrap">
                              {formatTime(row.toTime)}
                            </td>
                            <td className="border border-gray-200 p-2">{row.remarks}</td>
                            <td className="border border-gray-200 p-2 whitespace-pre-wrap break-words">
                              {row.remarksText?.trim() || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            ) : (
              <table className="w-full border-collapse text-[11px]" style={{ borderWidth: '0.5px' }}>
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-200 p-2 text-left font-semibold w-[20%]">GSE NAME</th>
                    <th className="border border-gray-200 p-2 text-left font-semibold w-[15%]">EQUIPMENT SERIAL NO</th>
                    <th className="border border-gray-200 p-2 text-left font-semibold w-[18%]">OPERATOR NAME</th>
                    <th className="border border-gray-200 p-2 text-left font-semibold w-[15%]">DESIGNATION</th>
                    <th className="border border-gray-200 p-2 text-left font-semibold w-[12%]">FROM DATE / TIME</th>
                    <th className="border border-gray-200 p-2 text-left font-semibold w-[12%]">TO DATE / TIME</th>
                    <th className="border border-gray-200 p-2 text-left font-semibold w-[8%]">REMARKS</th>
                  </tr>
                </thead>
                <tbody>
                  {equipmentOnlyEntries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="border border-gray-200 p-8 text-center text-gray-500">
                        No equipment entries found
                      </td>
                    </tr>
                  ) : (
                    equipmentOnlyEntries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50">
                        <td className="border border-gray-200 p-2">{entry.equipmentName}</td>
                        <td className="border border-gray-200 p-2">{entry.equipmentId || '—'}</td>
                        <td className="border border-gray-200 p-2">{entry.employeeName || '—'}</td>
                        <td className="border border-gray-200 p-2">
                          {cleanDesignationForDisplay(entry.designation) || '—'}
                        </td>
                        <td className="border border-gray-200 p-2">{formatDisplayDate(entry.fromDate)} {formatTime(entry.fromTime)}</td>
                        <td className="border border-gray-200 p-2">{formatDisplayDate(entry.toDate)} {formatTime(entry.toTime)}</td>
                        <td className="border border-gray-200 p-2 whitespace-pre-wrap break-words">
                          {normalizeFreeTextRemarks(entry.remarksText) || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Manpower Table - only in detailed report; hidden in normal (summary) report */}
          {reportType === 'detailed' && (
            <div className="p-4 border-t border-gray-200">
              <h3 className="text-sm font-bold text-gray-900 mb-2 uppercase tracking-wide">MANPOWER</h3>
              <table className="w-full border-collapse text-[11px]" style={{ borderWidth: '0.5px' }}>
                <thead>
                  <tr className="bg-indigo-50">
                    <th className="border border-gray-200 p-2 text-left font-semibold w-[22%]">NAME</th>
                    <th className="border border-gray-200 p-2 text-left font-semibold w-[14%]">STAFF ID</th>
                    <th className="border border-gray-200 p-2 text-left font-semibold w-[20%]">DESIGNATION</th>
                    <th className="border border-gray-200 p-2 text-left font-semibold w-[16%]">FROM DATE / TIME</th>
                    <th className="border border-gray-200 p-2 text-left font-semibold w-[16%]">TO DATE / TIME</th>
                    <th className="border border-gray-200 p-2 text-left font-semibold w-[12%]">REMARKS</th>
                  </tr>
                </thead>
                <tbody>
                  {combinedManpowerEntries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="border border-gray-200 p-6 text-center text-gray-500">
                        No manpower entries found
                      </td>
                    </tr>
                  ) : (
                    combinedManpowerEntries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50">
                        <td className="border border-gray-200 p-2">{entry.employeeName}</td>
                        <td className="border border-gray-200 p-2">{entry.employeeId || '—'}</td>
                        <td className="border border-gray-200 p-2">
                          {cleanDesignationForDisplay(entry.designation) || '—'}
                        </td>
                        <td className="border border-gray-200 p-2">{formatDisplayDate(entry.fromDate)} {formatTime(entry.fromTime)}</td>
                        <td className="border border-gray-200 p-2">{formatDisplayDate(entry.toDate)} {formatTime(entry.toTime)}</td>
                        <td className="border border-gray-200 p-2 whitespace-pre-wrap break-words">
                          {normalizeFreeTextRemarks(entry.remarksText) || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Designation count table */}
              <div className="mt-6 flex justify-center">
                <table className="border-collapse text-[11px] text-center" style={{ borderWidth: '0.5px' }}>
                  <tbody>
                    {designationCountRows.length === 0 ? (
                      <tr>
                        <td className="border border-gray-200 p-4 text-center text-gray-500">
                          No designation data
                        </td>
                      </tr>
                    ) : (
                      <>
                        <tr className="bg-amber-50">
                          <td className="border border-gray-200 p-2 font-semibold w-24 text-center">Designation</td>
                          {designationCountRows.map((row, idx) => (
                            <td key={idx} className="border border-gray-200 p-2 font-semibold">{row.designation}</td>
                          ))}
                        </tr>
                        <tr className="hover:bg-gray-50">
                          <td className="border border-gray-200 p-2 font-semibold text-center">Count</td>
                          {designationCountRows.map((row, idx) => (
                            <td key={idx} className="border border-gray-200 p-2">{row.count}</td>
                          ))}
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Signature Section - 2-column bordered grid matching PDF */}
          <div
            className="border border-gray-400 border-t-0 items-start p-3 text-[11px] fris-report-preview"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
            }}
          >
            <div className="border-r border-gray-400 pr-3 flex flex-col items-start text-left">
              <div className="w-32 h-14 border border-gray-400 mb-1 flex items-center justify-center overflow-hidden bg-white">
                {signatures?.gh.signatureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={signatures.gh.signatureUrl}
                    alt="GH Representative signature"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : null}
              </div>
              <p className="font-bold text-gray-900">Signature</p>
              <p className="text-gray-800"><span className="font-semibold">GH Representative :</span> {signatures?.gh.name || '—'}</p>
              {formatSignedAt(signatures?.gh.signedAt) ? (
                <p className="text-[10px] text-gray-500">
                  Signed: {formatSignedAt(signatures?.gh.signedAt)}
                </p>
              ) : null}
            </div>
            <div className="pl-3 flex flex-col items-start text-left">
              <div className="w-32 h-14 border border-gray-400 mb-1 flex items-center justify-center overflow-hidden bg-white">
                {signatures?.airline.signatureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={signatures.airline.signatureUrl}
                    alt="Airline Representative signature"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : null}
              </div>
              <p className="font-bold text-gray-900">Signature</p>
              <p className="text-gray-800"><span className="font-semibold">Airline Representative :</span> {signatures?.airline.name || '—'}</p>
              {formatSignedAt(signatures?.airline.signedAt) ? (
                <p className="text-[10px] text-gray-500">
                  Signed: {formatSignedAt(signatures?.airline.signedAt)}
                </p>
              ) : null}
            </div>
          </div>

          {/* Footer */}
          <div className="border border-gray-400 border-t-0 p-3 text-[10px]">
            <p className="text-red-600 italic text-center mb-1 font-medium">
              This is electronically sign / verified by GSD incharge {verifiedBy || getLoggedInUserName()} {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </p>
            <p className="text-gray-700 text-right">
              Printed On : Date/Time : {new Date().toLocaleString()}
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default function EquipmentReportPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-amber-500 animate-spin" />
          <p className="text-gray-600 font-medium">Loading Equipment Report...</p>
        </div>
      </div>
    }>
      <EquipmentReportContent />
    </Suspense>
  );
}
