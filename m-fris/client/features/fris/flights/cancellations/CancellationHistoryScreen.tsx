'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Eye,
  History,
  Plane,
  RefreshCw,
  Calendar,
  Download,
  Search,
  ArrowLeft,
  Paperclip,
  X,
  Loader2,
} from 'lucide-react';
import { loadFileSaverSaveAs } from '@/lib/lazy-client-deps';
import { getExcelJSModule } from '@/lib/dynamic-imports';
import { DatePicker } from '@/components/ui/DatePicker';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  FLIGHT_FILTER_ACTIONS_CLASS,
  FLIGHT_FILTER_PRIMARY_BTN_CLASS,
  FLIGHT_FILTER_SECONDARY_BTN_CLASS,
} from '@/components/fris/flights/flightFilterBarLayout';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import {
  fetchAllFlightCancellations,
  fetchFlightCancellations,
  fetchFhrCancelledFlights,
  fetchCancellationAttachment,
  postDateScopedFlightCancel,
  sendCancellationInfoEmail,
  sendCancellationInfoEmailByDetails,
  getApiBase,
  type FlightCancellationRecord,
} from '@/services/api';
import { toast } from 'sonner';
import { displayFlightInstanceSerial } from '@/utils/dataProcessor';
import { cancellationRowInDateRange } from '@/utils/cancellationDisplay';
import { cn } from '@/lib/utils';
import {
  FRIS_INVALID_CONTROL,
  FRIS_INVALID_PICKER_WRAP,
  hasFieldErrors,
  required,
  validateYmdDateRange,
  validDate,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  BIRD_SHOOT_EMAIL_OPTIONS,
  emptyBirdShootEmailSelection,
} from '@/lib/birdShootEmailRecipients';
import {
  CANCELLATION_FOCUS_DATE_KEY,
  CANCELLATION_HIGHLIGHT_STORAGE_KEY,
} from '@/contexts/DashboardNotificationContext';
import { buildDashboardReturnHref } from '@/lib/dashboardScheduledAirlinesNav';
import { parseCancellationHistoryDeepLink } from '@/lib/cancellation-history-nav';

const FILTER_DATE_FIELD_ORDER = ['fromDate', 'toDate'] as const;
type FilterDateField = (typeof FILTER_DATE_FIELD_ORDER)[number];

const RECORD_FIELD_ORDER = ['recordFlightId', 'recordDate'] as const;
type RecordField = (typeof RECORD_FIELD_ORDER)[number];

const CANCELLATION_TABLE_COLUMNS = [
  { label: 'Flight Number', headerClass: 'text-left' },
  { label: 'Airline', headerClass: 'text-left' },
  { label: 'Route', headerClass: 'text-left' },
  { label: 'Cancellation date', headerClass: 'text-left' },
  { label: 'Arrival', headerClass: 'text-center' },
  { label: 'Departure', headerClass: 'text-center' },
  { label: 'Status', headerClass: 'text-center' },
  { label: 'Attachment', headerClass: 'text-center' },
  { label: 'Action', headerClass: 'text-center' },
] as const;

const CANCELLATION_HISTORY_RANGE_KEY = 'fris.cancellation-history.date-range';

function readStoredCancellationRange(): { from: string; to: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CANCELLATION_HISTORY_RANGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { from?: unknown; to?: unknown };
    const from = String(parsed?.from ?? '').trim();
    const to = String(parsed?.to ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return null;
    }
    if (from > to) return null;
    return { from, to };
  } catch {
    return null;
  }
}

function writeStoredCancellationRange(from: string, to: string): void {
  if (typeof window === 'undefined') return;
  const f = from.trim();
  const t = to.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(t) || f > t) {
    return;
  }
  try {
    sessionStorage.setItem(
      CANCELLATION_HISTORY_RANGE_KEY,
      JSON.stringify({ from: f, to: t }),
    );
  } catch {
    /* ignore quota */
  }
}

function localCalendarYmd(d = new Date()): string {
  const cal = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return `${cal.getFullYear()}-${String(cal.getMonth() + 1).padStart(2, '0')}-${String(cal.getDate()).padStart(2, '0')}`;
}

/** Wide default window so historical cancellations are visible without manual date edits. */
function getDefaultCancellationDateRange(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  from.setFullYear(from.getFullYear() - 2);
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  to.setFullYear(to.getFullYear() + 1);
  return {
    from: localCalendarYmd(from),
    to: localCalendarYmd(to),
  };
}

function resolveInitialCancellationRange(): { from: string; to: string } {
  const defaults = getDefaultCancellationDateRange();
  if (typeof window === 'undefined') return defaults;

  const params = new URLSearchParams(window.location.search);
  const fromParam = params.get('from')?.trim() ?? '';
  const toParam = params.get('to')?.trim() ?? '';
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(fromParam) &&
    /^\d{4}-\d{2}-\d{2}$/.test(toParam) &&
    fromParam <= toParam
  ) {
    return { from: fromParam, to: toParam };
  }

  const focusRaw = sessionStorage.getItem(CANCELLATION_FOCUS_DATE_KEY);
  if (focusRaw) {
    sessionStorage.removeItem(CANCELLATION_FOCUS_DATE_KEY);
    const focus = focusRaw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(focus)) {
      const [y, m] = focus.split('-');
      const last = new Date(Number(y), Number(m), 0);
      return {
        from: `${y}-${m}-01`,
        to: localCalendarYmd(last),
      };
    }
  }

  const stored = readStoredCancellationRange();
  if (stored) return stored;

  return defaults;
}

/** Latest cancellations first: date → STA time → createdAt → flight no. */
function sortCancellationsNewestFirst(a: FlightCancellationRecord, b: FlightCancellationRecord): number {
  const d = b.cancelledDate.localeCompare(a.cancelledDate);
  if (d !== 0) return d;
  const t = b.staTime.localeCompare(a.staTime);
  if (t !== 0) return t;
  const ac = String(a.createdAt ?? '');
  const bc = String(b.createdAt ?? '');
  if (ac && bc) {
    const c = bc.localeCompare(ac);
    if (c !== 0) return c;
  }
  const f = b.flightNo.localeCompare(a.flightNo);
  if (f !== 0) return f;
  return b.instanceSerial.localeCompare(a.instanceSerial);
}

/** yyyy-MM-dd → dd/MM/yyyy */
function ymdToDdMmYyyy(ymd: string): string {
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return ymd;
  const [y, m, d] = parts;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

/** Match FHR cancelled row to a `flight_cancellations` snapshot (same instance + STA operating day). */
function cancellationMergeKey(instanceSerial: string, cancelledDateYmd: string): string {
  const s = String(instanceSerial ?? '')
    .replace(/^FL-/i, '')
    .trim();
  return `${s}|${String(cancelledDateYmd ?? '').trim()}`;
}

/**
 * History list: OTP / Scheduled Airlines saves land in `flight_cancellations`;
 * legacy rows may exist only on `fhr_collection`. Merge both for the date window.
 */
function mergeCancellationHistoryRows(
  fromFlightCancellations: FlightCancellationRecord[],
  fromFhr: FlightCancellationRecord[],
): FlightCancellationRecord[] {
  const byKey = new Map<string, FlightCancellationRecord>();
  for (const fc of fromFlightCancellations) {
    const k = cancellationMergeKey(fc.instanceSerial, fc.cancelledDate);
    if (!k.endsWith('|')) byKey.set(k, fc);
  }
  for (const fhr of fromFhr) {
    const k = cancellationMergeKey(fhr.instanceSerial, fhr.cancelledDate);
    if (!k.endsWith('|')) {
      if (!byKey.has(k)) {
        byKey.set(k, { ...fhr, dataSource: 'fhr_collection' });
      }
    }
  }
  return [...byKey.values()];
}

function rowHasCancellationAttachment(row: FlightCancellationRecord): boolean {
  return Boolean(row.hasAttachment) && row.dataSource !== 'fhr_collection';
}

type CancellationAttachmentPreview = {
  blob: Blob;
  blobUrl: string;
  fileName: string;
  mimeType: string;
};

function previewKind(mimeType: string, fileName: string): 'image' | 'pdf' | 'text' | 'video' | 'audio' | 'other' {
  const mime = mimeType.trim().toLowerCase();
  const name = fileName.trim().toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (mime.startsWith('text/') || mime === 'application/json' || name.endsWith('.txt') || name.endsWith('.csv')) {
    return 'text';
  }
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'other';
}

/** Prefer Asia/Kolkata for station-facing export timestamps. */
function recordedDateTimeIst(iso: string | undefined): { date: string; time: string } {
  if (!iso?.trim()) return { date: '', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const opts: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata' };
  const date = new Intl.DateTimeFormat('en-GB', {
    ...opts,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', {
    ...opts,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return { date, time };
}

/** Best-effort userid from browser session (parity with Equipment Manpower verified-by). */
function cancellationUserIdFromStorage(): string {
  if (typeof window === 'undefined') return '';
  return String(
    localStorage.getItem('userid') ||
      localStorage.getItem('username') ||
      localStorage.getItem('userEmail') ||
      '',
  ).trim();
}

/** Ordered export columns (mirror row object keys exactly). */
const CANCELLATION_EXPORT_HEADERS = [
  'SerialNo',
  'Flight number',
  'Airline',
  'Route',
  'Source',
  'Destination',
  'STA date',
  'STA time',
  'STD date',
  'STD time',
  'Aircraft',
  'STA operating date (cancellation day)',
  'Flight cancellation date',
  'Flight cancellation time',
  'Intimation mode',
  'Cancellation remarks',
  'User (userid)',
] as const;

/** Light orange header row (ARGB for Excel fills). Peach Puff tint. */
const CANCELLATION_EXPORT_HEADER_FILL_ARGB = 'FFFFDAB9';

function cancellationExportWidths(
  rows: Array<Record<(typeof CANCELLATION_EXPORT_HEADERS)[number], string>>,
): number[] {
  const headers = [...CANCELLATION_EXPORT_HEADERS];
  return headers.map((header) => {
    const headerLen = header.length;
    const valueLen = rows.reduce((max, row) => {
      const cell = String(row[header] ?? '');
      const longestLine = cell
        .split(/\r?\n/)
        .reduce((lineMax, line) => Math.max(lineMax, line.length), 0);
      return Math.max(max, longestLine);
    }, 0);
    const ideal = Math.max(headerLen, valueLen) + 4;
    return Math.min(Math.max(ideal, 12), 90);
  });
}

function excelJsWriteBufferToBlob(buffer: ArrayBuffer | ArrayBufferView): Blob {
  return new Blob([buffer as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** Primary: stored route; fallback: source — destination when route is missing. */
function displayCancellationRoute(row: FlightCancellationRecord): string {
  const r = String(row.route ?? '').trim();
  if (r) return r;
  const s = String(row.source ?? '').trim();
  const t = String(row.destination ?? '').trim();
  if (s && t) return `${s} - ${t}`;
  if (s) return s;
  if (t) return t;
  return '—';
}

export function CancellationHistoryContent() {
  const searchParams = useSearchParams();
  const deepLinkInitRef = useRef(false);
  const todayYmd = useMemo(() => localCalendarYmd(), []);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const { errors: dateErrors, clearField: clearDateField, applyAndFocus: applyDateErrors, setAll: setDateErrors } =
    useFieldErrors<FilterDateField>(FILTER_DATE_FIELD_ORDER);
  const [rows, setRows] = useState<FlightCancellationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [shootRow, setShootRow] = useState<FlightCancellationRecord | null>(null);
  const [shootBusy, setShootBusy] = useState(false);
  const [shootSelection, setShootSelection] = useState<Record<string, boolean>>(
    emptyBirdShootEmailSelection,
  );
  const [shootCustomEmail, setShootCustomEmail] = useState('');
  const [attachmentPreview, setAttachmentPreview] = useState<CancellationAttachmentPreview | null>(null);
  const [attachmentBusyId, setAttachmentBusyId] = useState<string | null>(null);
  const [attachmentText, setAttachmentText] = useState<string | null>(null);

  const [recordOpen, setRecordOpen] = useState(false);
  const [recordFlightId, setRecordFlightId] = useState('');
  const [recordDate, setRecordDate] = useState(todayYmd);
  const { errors: recordErrors, clearField: clearRecordField, applyAndFocus: applyRecordErrors } =
    useFieldErrors<RecordField>(RECORD_FIELD_ORDER);
  const [recordReason, setRecordReason] = useState('');
  const [recordIntimationMode, setRecordIntimationMode] = useState('');
  const [recordAirline, setRecordAirline] = useState('');
  const [recordFlightNo, setRecordFlightNo] = useState('');
  const [recordRoute, setRecordRoute] = useState('');
  const [recordStaDate, setRecordStaDate] = useState('');
  const [recordStaTime, setRecordStaTime] = useState('');
  const [recordStdDate, setRecordStdDate] = useState('');
  const [recordStdTime, setRecordStdTime] = useState('');
  const [recordBusy, setRecordBusy] = useState(false);
  const [highlightedCancellationIds, setHighlightedCancellationIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [exportBusy, setExportBusy] = useState(false);
  const [searchSerial, setSearchSerial] = useState('');
  const [searchAirline, setSearchAirline] = useState('');
  const [searchFlightNo, setSearchFlightNo] = useState('');

  const dashboardBackHref = useMemo(
    () => buildDashboardReturnHref(searchParams),
    [searchParams],
  );

  const displayRows = useMemo(() => {
    const serialQ = searchSerial.trim().toLowerCase().replace(/^fl-/i, '');
    const airlineQ = searchAirline.trim().toLowerCase();
    const flightQ = searchFlightNo.trim().toLowerCase();
    if (!serialQ && !airlineQ && !flightQ) return rows;

    return rows.filter((row) => {
      if (serialQ) {
        const instanceSerial = String(row.instanceSerial ?? '')
          .trim()
          .toLowerCase()
          .replace(/^fl-/i, '');
        const displaySerial = displayFlightInstanceSerial(row.instanceSerial)
          .trim()
          .toLowerCase();
        if (!instanceSerial.includes(serialQ) && !displaySerial.includes(serialQ)) {
          return false;
        }
      }
      if (airlineQ) {
        const airline = String(row.airlineName ?? '').trim().toLowerCase();
        if (!airline.includes(airlineQ)) return false;
      }
      if (flightQ) {
        const flightNo = String(row.flightNo ?? '').trim().toLowerCase();
        if (!flightNo.includes(flightQ)) return false;
      }
      return true;
    });
  }, [rows, searchSerial, searchAirline, searchFlightNo]);

  const hasActiveSearch = Boolean(
    searchSerial.trim() || searchAirline.trim() || searchFlightNo.trim(),
  );

  const handleClearSearch = () => {
    setSearchSerial('');
    setSearchAirline('');
    setSearchFlightNo('');
  };

  useEffect(() => {
    if (deepLinkInitRef.current) return;
    deepLinkInitRef.current = true;

    const deepLink = parseCancellationHistoryDeepLink(searchParams);
    let from = deepLink.from;
    let to = deepLink.to;

    if (!from || !to) {
      const range = resolveInitialCancellationRange();
      from = from || range.from;
      to = to || range.to;
    }

    setFromDate(from);
    setToDate(to);

    if (deepLink.serial) setSearchSerial(deepLink.serial);
    if (deepLink.airline) setSearchAirline(deepLink.airline);
    if (deepLink.flightNo) setSearchFlightNo(deepLink.flightNo);

    if (deepLink.highlight) {
      setHighlightedCancellationIds(new Set([deepLink.highlight]));
    }
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = sessionStorage.getItem(CANCELLATION_HIGHLIGHT_STORAGE_KEY);
    if (!raw) return;
    sessionStorage.removeItem(CANCELLATION_HIGHLIGHT_STORAGE_KEY);
    try {
      const parsed = JSON.parse(raw) as unknown;
      const ids = Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        : [];
      if (ids.length === 0) return;
      setHighlightedCancellationIds(new Set(ids));
      const t = window.setTimeout(() => setHighlightedCancellationIds(new Set()), 8000);
      return () => window.clearTimeout(t);
    } catch {
      /* invalid JSON */
    }
  }, []);

  useEffect(() => {
    if (highlightedCancellationIds.size === 0) return;
    const t = window.setTimeout(() => setHighlightedCancellationIds(new Set()), 8000);
    return () => window.clearTimeout(t);
  }, [highlightedCancellationIds]);

  const load = useCallback(async (opts?: { focus?: boolean }) => {
    const from = fromDate.trim();
    const to = toDate.trim();
    if (!from && !to) return;

    const next = validateYmdDateRange(from, to, {
      fromLabel: 'From cancellation date',
      toLabel: 'To cancellation date',
    });
    if (opts?.focus) {
      if (applyDateErrors(next)) {
        setRows([]);
        setError(null);
        setLoading(false);
        return;
      }
    } else {
      setDateErrors(next);
      if (hasFieldErrors(next)) {
        setRows([]);
        setError(null);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const [allFromFc, fromFhr] = await Promise.all([
        fetchFlightCancellations({ from, to }),
        fetchFhrCancelledFlights({ from, to }),
      ]);
      const merged = mergeCancellationHistoryRows(allFromFc, fromFhr);
      const inRange = merged.filter((row) =>
        cancellationRowInDateRange(row, from, to),
      );
      const sorted = [...inRange].sort(sortCancellationsNewestFirst);
      setRows(sorted);
      writeStoredCancellationRange(from, to);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : 'Could not load cancellation history.';
      const isNetwork =
        e instanceof TypeError &&
        (e.message === 'Failed to fetch' || e.message.includes('fetch'));
      setError(
        isNetwork
          ? `Cannot reach the API at ${getApiBase().replace(/\/$/, '')}.`
          : msg,
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [applyDateErrors, fromDate, setDateErrors, toDate]);

  useEffect(() => {
    void load({ focus: false });
  }, [load]);

  const highlightScrollKey = useMemo(
    () => [...highlightedCancellationIds].sort().join(','),
    [highlightedCancellationIds],
  );

  useEffect(() => {
    if (!highlightScrollKey || rows.length === 0) return;
    const first = rows.find((r) => highlightedCancellationIds.has(r._id));
    if (!first?._id) return;
    const escaped =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(first._id)
        : first._id.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const raf = requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-cancellation-row="${escaped}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [highlightScrollKey, rows, highlightedCancellationIds]);

  const closeAttachmentPreview = useCallback(() => {
    setAttachmentPreview((prev) => {
      if (prev?.blobUrl) URL.revokeObjectURL(prev.blobUrl);
      return null;
    });
    setAttachmentText(null);
  }, []);

  useEffect(() => {
    return () => {
      if (attachmentPreview?.blobUrl) URL.revokeObjectURL(attachmentPreview.blobUrl);
    };
    // Only revoke the current URL if the component unmounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!attachmentPreview) {
      setAttachmentText(null);
      return;
    }
    const kind = previewKind(attachmentPreview.mimeType, attachmentPreview.fileName);
    if (kind !== 'text') {
      setAttachmentText(null);
      return;
    }
    let cancelled = false;
    void attachmentPreview.blob.text().then((text) => {
      if (!cancelled) setAttachmentText(text);
    });
    return () => {
      cancelled = true;
    };
  }, [attachmentPreview]);

  useEffect(() => {
    if (!attachmentPreview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAttachmentPreview();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [attachmentPreview, closeAttachmentPreview]);

  const openAttachmentPreview = async (row: FlightCancellationRecord) => {
    if (!rowHasCancellationAttachment(row)) return;
    setAttachmentBusyId(row._id);
    try {
      const file = await fetchCancellationAttachment(row._id);
      const blobUrl = URL.createObjectURL(file.blob);
      setAttachmentPreview((prev) => {
        if (prev?.blobUrl) URL.revokeObjectURL(prev.blobUrl);
        return {
          blob: file.blob,
          blobUrl,
          fileName: file.fileName || row.attachmentFileName || 'attachment',
          mimeType: file.mimeType || row.attachmentMimeType || 'application/octet-stream',
        };
      });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Could not open the attachment.',
      );
    } finally {
      setAttachmentBusyId(null);
    }
  };

  const downloadAttachmentPreview = async () => {
    if (!attachmentPreview) return;
    try {
      const saveAs = await loadFileSaverSaveAs();
      saveAs(attachmentPreview.blob, attachmentPreview.fileName || 'attachment');
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Could not download the attachment.',
      );
    }
  };

  const openShootModal = (row: FlightCancellationRecord) => {
    setShootRow(row);
    setShootCustomEmail('');
    setShootSelection(emptyBirdShootEmailSelection());
  };

  const onShootSend = async () => {
    if (!shootRow) return;
    const emails: string[] = [
      ...BIRD_SHOOT_EMAIL_OPTIONS.filter((email) => shootSelection[email]),
    ];
    const customEmail = shootCustomEmail.trim().toLowerCase();
    if (customEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(customEmail)) {
        toast.error('Enter a valid custom email address.');
        return;
      }
      emails.push(customEmail);
    }
    const uniqueEmails = Array.from(new Set(emails));
    if (uniqueEmails.length === 0) {
      toast.error('Select at least one email.');
      return;
    }
    setShootBusy(true);
    try {
      if (shootRow.dataSource === 'fhr_collection') {
        const sent = await sendCancellationInfoEmailByDetails(
          {
            instanceSerial: shootRow.instanceSerial,
            cancelledDate: shootRow.cancelledDate,
            flightNo: shootRow.flightNo,
            airlineName: shootRow.airlineName,
            staDate: shootRow.staDate,
            staTime: shootRow.staTime,
            stdDate: shootRow.stdDate,
            stdTime: shootRow.stdTime,
            route: displayCancellationRoute(shootRow),
            reason: shootRow.reason,
            intimationMode: shootRow.intimationMode,
            intimatedBy: shootRow.intimatedBy,
            intimationPersonEmail: shootRow.intimationPersonEmail,
            intimationMedia: shootRow.intimationMedia,
            intimationTime: shootRow.intimationTime,
          },
          uniqueEmails,
        );
        toast.success(`Cancellation info sent to: ${sent.toEmails.join(', ')}`);
      } else {
        const sent = await sendCancellationInfoEmail(shootRow._id, uniqueEmails);
        toast.success(`Cancellation info sent to: ${sent.toEmails.join(', ')}`);
      }
      setShootRow(null);
      setShootCustomEmail('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send email');
    } finally {
      setShootBusy(false);
    }
  };

  const displayContext = `${ymdToDdMmYyyy(fromDate)} – ${ymdToDdMmYyyy(toDate)}`;

  const exportCancellationData = useCallback(async () => {
    const from = fromDate.trim();
    const to = toDate.trim();
    if (!from || !to) {
      toast.error('Select from and to dates.');
      return;
    }
    if (from > to) {
      toast.error('From date must be on or before to date.');
      return;
    }
    if (displayRows.length === 0) {
      toast.error('No cancelled flights in the current list to export.');
      return;
    }
    setExportBusy(true);
    try {
      const fcList = await fetchFlightCancellations({ from, to });
      const fcByKey = new Map<string, FlightCancellationRecord>();
      for (const fc of fcList) {
        const k = cancellationMergeKey(fc.instanceSerial, fc.cancelledDate);
        if (!fcByKey.has(k)) fcByKey.set(k, fc);
      }
      const exportRows: Array<
        Record<(typeof CANCELLATION_EXPORT_HEADERS)[number], string>
      > = displayRows.map((row) => {
        const fc = fcByKey.get(cancellationMergeKey(row.instanceSerial, row.cancelledDate));
        const recordedIso =
          (fc?.createdAt && String(fc.createdAt).trim()) || row.fhrRecordUpdatedAtIso || '';
        const { date: cancellationRecordedDate, time: cancellationRecordedTime } =
          recordedDateTimeIst(recordedIso);
        const routeLabel = displayCancellationRoute(row);
        const staOperatingDdMmYyyy = row.cancelledDate ? ymdToDdMmYyyy(row.cancelledDate) : '';
        const remarksFc = fc?.reason?.trim();
        const remarks = remarksFc !== undefined && remarksFc !== '' ? remarksFc : row.reason || '';

        return {
          SerialNo: displayFlightInstanceSerial(row.instanceSerial),
          'Flight number': row.flightNo || '',
          Airline: row.airlineName || '',
          Route: routeLabel,
          Source: String(row.source ?? '').trim(),
          Destination: String(row.destination ?? '').trim(),
          'STA date': row.staDate || '',
          'STA time': row.staTime || '',
          'STD date': row.stdDate || '',
          'STD time': row.stdTime || '',
          Aircraft: row.aircraft || '',
          'STA operating date (cancellation day)': staOperatingDdMmYyyy,
          'Flight cancellation date': cancellationRecordedDate,
          'Flight cancellation time': cancellationRecordedTime,
          'Intimation mode': (fc?.intimationMode ?? '').trim(),
          'Cancellation remarks': remarks,
          'User (userid)': (fc?.cancelledByUserId ?? '').trim(),
        };
      });

      const ExcelJS = await getExcelJSModule();
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Cancellations', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });

      worksheet.addRow([...CANCELLATION_EXPORT_HEADERS]);
      for (const er of exportRows) {
        worksheet.addRow([...CANCELLATION_EXPORT_HEADERS.map((h) => er[h])]);
      }

      const headerExcelRow = worksheet.getRow(1);
      headerExcelRow.height = 28;
      headerExcelRow.eachCell((cell) => {
        cell.font = {
          bold: true,
          size: 11,
          color: { argb: 'FF1F2937' },
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: CANCELLATION_EXPORT_HEADER_FILL_ARGB },
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'left',
          wrapText: true,
        };
      });

      cancellationExportWidths(exportRows).forEach((width, idx) => {
        worksheet.getColumn(idx + 1).width = width;
      });

      const excelBuf = await workbook.xlsx.writeBuffer();
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const saveAs = await loadFileSaverSaveAs();
      saveAs(
        excelJsWriteBufferToBlob(excelBuf),
        `cancellation-history_${from}_${to}_${stamp}.xlsx`,
      );
      toast.success(`Exported ${exportRows.length} row(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExportBusy(false);
    }
  }, [fromDate, toDate, displayRows]);

  const submitRecordCancellation = async (e: React.FormEvent) => {
    e.preventDefault();
    const fid = recordFlightId.trim().replace(/^FL-/i, '');
    const next: Partial<Record<RecordField, string>> = {};
    const flightReq = required(fid, 'Instance Sl. No.');
    if (flightReq) next.recordFlightId = flightReq;
    const dateReq = required(recordDate, 'Date');
    if (dateReq) next.recordDate = dateReq;
    else {
      const dateFmt = validDate(recordDate, 'Date');
      if (dateFmt) next.recordDate = dateFmt;
    }
    if (applyRecordErrors(next)) {
      toast.error('Flight ID (instance Sl. No.) and date are required.');
      return;
    }
    setRecordBusy(true);
    try {
      const ymd = recordDate.trim();
      await postDateScopedFlightCancel({
        flightId: fid,
        date: ymd,
        reason: recordReason.trim() || undefined,
        intimationMode: recordIntimationMode.trim() || undefined,
        cancelledByUserId: cancellationUserIdFromStorage() || undefined,
        airlineName: recordAirline.trim() || undefined,
        flightNo: recordFlightNo.trim() || undefined,
        route: recordRoute.trim() || undefined,
        staDate: recordStaDate.trim() || undefined,
        staTime: recordStaTime.trim() || undefined,
        stdDate: recordStdDate.trim() || undefined,
        stdTime: recordStdTime.trim() || undefined,
      });
      toast.success('Cancellation recorded for that date.');
      setRecordOpen(false);
      await load({ focus: false });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record cancellation');
    } finally {
      setRecordBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6"
    >
      <div className="mb-4">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <FrisPageHeader title="Cancellation History" icon={History} className="mb-0" />
          {dashboardBackHref ? (
            <motion.div whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.97 }} className="shrink-0">
              <Link
                href={dashboardBackHref}
                aria-label="Back to dashboard"
                className="group relative inline-flex h-10 items-center gap-2.5 overflow-hidden rounded-xl border border-emerald-200/90 bg-gradient-to-b from-white via-white to-emerald-50/90 px-3.5 text-sm font-semibold tracking-tight text-emerald-800 shadow-[0_1px_2px_rgba(16,185,129,0.1),0_4px_14px_rgba(16,185,129,0.14)] ring-1 ring-inset ring-white/90 transition-[border-color,box-shadow] duration-200 hover:border-emerald-300 hover:shadow-[0_2px_4px_rgba(16,185,129,0.12),0_10px_24px_rgba(16,185,129,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-gradient-to-r from-emerald-400/0 via-emerald-400/5 to-emerald-500/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                />
                <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-600/35 transition-transform duration-200 group-hover:-translate-x-0.5 group-hover:shadow-lg group-hover:shadow-emerald-600/40">
                  <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
                <span className="relative pr-0.5">Back to dashboard</span>
              </Link>
            </motion.div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end justify-end gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className={cn(dateErrors.fromDate && FRIS_INVALID_PICKER_WRAP)}>
              <label htmlFor="field-fromDate" className="block text-xs font-medium text-gray-600 mb-1.5">
                From cancellation date
              </label>
              <DatePicker
                id="field-fromDate"
                value={fromDate}
                onChange={(v) => {
                  setFromDate(v);
                  clearDateField('fromDate');
                  clearDateField('toDate');
                }}
                valueFormat="yyyy-MM-dd"
                className="min-w-[200px]"
                ariaLabel="From cancellation date"
              />
              <FormFieldError id="field-fromDate-error" message={dateErrors.fromDate} />
            </div>
            <div className={cn(dateErrors.toDate && FRIS_INVALID_PICKER_WRAP)}>
              <label htmlFor="field-toDate" className="block text-xs font-medium text-gray-600 mb-1.5">
                To cancellation date
              </label>
              <DatePicker
                id="field-toDate"
                value={toDate}
                onChange={(v) => {
                  setToDate(v);
                  clearDateField('toDate');
                  clearDateField('fromDate');
                }}
                valueFormat="yyyy-MM-dd"
                className="min-w-[200px]"
                ariaLabel="To cancellation date"
              />
              <FormFieldError id="field-toDate-error" message={dateErrors.toDate} />
            </div>
            <div className={FLIGHT_FILTER_ACTIONS_CLASS}>
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => void load({ focus: true })}
              disabled={loading}
              className={FLIGHT_FILTER_PRIMARY_BTN_CLASS}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </motion.button>
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => void exportCancellationData()}
              disabled={loading || exportBusy || displayRows.length === 0}
              className={FLIGHT_FILTER_SECONDARY_BTN_CLASS}
            >
              <Download className={`w-4 h-4 ${exportBusy ? 'opacity-60' : ''}`} />
              {exportBusy ? 'Exporting…' : 'Export data'}
            </motion.button>
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setRecordOpen((v) => {
                  const next = !v;
                  if (next) setRecordDate(fromDate.trim() || todayYmd);
                  return next;
                });
              }}
              className={cn(
                FLIGHT_FILTER_SECONDARY_BTN_CLASS,
                'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
              )}
            >
              Record cancellation
            </motion.button>
            </div>
          </div>
      </div>

      {recordOpen && (
        <motion.form
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          onSubmit={(e) => void submitRecordCancellation(e)}
          className="mb-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4"
        >
          <h3 className="text-sm font-semibold text-gray-900">
            Record a date-scoped cancellation
          </h3>
          <p className="text-xs text-gray-500">
            Hides this instance from the scheduled list for the chosen date only. Does not change Advance /
            Creation masters.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label htmlFor="field-recordFlightId" className="block text-xs font-medium text-gray-600 mb-1">Instance Sl. No. *</label>
              <input
                id="field-recordFlightId"
                className={cn(
                  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm',
                  recordErrors.recordFlightId && FRIS_INVALID_CONTROL,
                )}
                value={recordFlightId}
                onChange={(e) => {
                  setRecordFlightId(e.target.value);
                  clearRecordField('recordFlightId');
                }}
                placeholder="e.g. 100001"
                aria-invalid={!!recordErrors.recordFlightId}
              />
              <FormFieldError id="field-recordFlightId-error" message={recordErrors.recordFlightId} />
            </div>
            <div className={cn(recordErrors.recordDate && FRIS_INVALID_PICKER_WRAP)}>
              <label htmlFor="field-recordDate" className="block text-xs font-medium text-gray-600 mb-1">Date (YYYY-MM-DD) *</label>
              <DatePicker
                id="field-recordDate"
                value={recordDate}
                onChange={(v) => {
                  setRecordDate(v);
                  clearRecordField('recordDate');
                }}
                valueFormat="yyyy-MM-dd"
                className="w-full"
                ariaLabel="Cancellation date"
              />
              <FormFieldError id="field-recordDate-error" message={recordErrors.recordDate} />
            </div>
            <div className="md:col-span-2 lg:col-span-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Reason (optional)</label>
              <input
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                value={recordReason}
                onChange={(e) => setRecordReason(e.target.value)}
                placeholder="Operational / weather…"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Intimation mode (optional)</label>
              <input
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                value={recordIntimationMode}
                onChange={(e) => setRecordIntimationMode(e.target.value)}
                placeholder="e.g. Email, Phone, AIMS"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Airline (optional)</label>
              <input
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                value={recordAirline}
                onChange={(e) => setRecordAirline(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Flight number (optional)</label>
              <input
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                value={recordFlightNo}
                onChange={(e) => setRecordFlightNo(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Route (optional)</label>
              <input
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                value={recordRoute}
                onChange={(e) => setRecordRoute(e.target.value)}
                placeholder="DEL - BOM"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">STA date / time</label>
              <div className="flex gap-2">
                <input
                  className="w-1/2 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  value={recordStaDate}
                  onChange={(e) => setRecordStaDate(e.target.value)}
                  placeholder="dd/MM/yyyy"
                />
                <input
                  className="w-1/2 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  value={recordStaTime}
                  onChange={(e) => setRecordStaTime(e.target.value)}
                  placeholder="HH:mm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">STD date / time</label>
              <div className="flex gap-2">
                <input
                  className="w-1/2 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  value={recordStdDate}
                  onChange={(e) => setRecordStdDate(e.target.value)}
                  placeholder="dd/MM/yyyy"
                />
                <input
                  className="w-1/2 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  value={recordStdTime}
                  onChange={(e) => setRecordStdTime(e.target.value)}
                  placeholder="HH:mm"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700"
              onClick={() => setRecordOpen(false)}
            >
              Close
            </button>
            <button
              type="submit"
              disabled={recordBusy}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {recordBusy ? 'Saving…' : 'Save cancellation'}
            </button>
          </div>
        </motion.form>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Cancelled flights</h3>
            <p className="text-sm text-gray-500 mt-1 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <>
                Date range{' '}
                <span className="font-medium text-gray-700">{displayContext}</span>
              </>
              {!loading && (
                <span className="text-emerald-600 font-medium">
                  · {displayRows.length} record{displayRows.length === 1 ? '' : 's'}
                  {hasActiveSearch && rows.length !== displayRows.length
                    ? ` (filtered from ${rows.length})`
                    : ''}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="border-b border-gray-100 bg-gray-50/60 px-6 py-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Serial No</label>
              <input
                type="text"
                value={searchSerial}
                onChange={(e) => setSearchSerial(e.target.value)}
                placeholder="e.g. 100001"
                className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <FormFieldError />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Airline</label>
              <input
                type="text"
                value={searchAirline}
                onChange={(e) => setSearchAirline(e.target.value)}
                placeholder="Airline name"
                className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <FormFieldError />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">Flight No</label>
              <input
                type="text"
                value={searchFlightNo}
                onChange={(e) => setSearchFlightNo(e.target.value)}
                placeholder="e.g. 6E2132"
                className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <FormFieldError />
            </div>
            {hasActiveSearch && (
              <div className={FLIGHT_FILTER_ACTIONS_CLASS}>
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className={FLIGHT_FILTER_SECONDARY_BTN_CLASS}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <RefreshCw className="w-10 h-10 text-emerald-500 animate-spin mx-auto mb-4" />
            <p className="text-gray-600 font-medium">Loading…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <div className="p-4 rounded-full bg-gray-100 w-fit mx-auto mb-4">
              <Plane className="w-12 h-12 text-gray-400" />
            </div>
            <p className="text-gray-700 font-medium">No cancelled flights for selected date range</p>
            <p className="text-sm text-gray-500 mt-2">
              Widen the date range if needed — cancellations are matched by operating STA day and cancellation date.
              Rows from Scheduled Airlines (OTP cancel) and legacy FHR-cancelled flights are both included.
            </p>
          </div>
        ) : displayRows.length === 0 ? (
          <div className="p-12 text-center">
            <div className="p-4 rounded-full bg-gray-100 w-fit mx-auto mb-4">
              <Search className="w-12 h-12 text-gray-400" />
            </div>
            <p className="text-gray-700 font-medium">No cancelled flights match your search</p>
            <p className="text-sm text-gray-500 mt-2">
              Try a different serial number, airline name, or flight number, or clear the search filters.
            </p>
          </div>
        ) : (
          <div className="w-full min-w-0 overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="bg-gray-50">
                  {CANCELLATION_TABLE_COLUMNS.map(({ label, headerClass }) => (
                    <th
                      key={label}
                      className={`px-4 py-3 text-xs font-semibold text-gray-700 uppercase tracking-wider ${headerClass}`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayRows.map((row, index) => {
                  const routeLabel = displayCancellationRoute(row);
                  const cdLabel = row.cancelledDate
                    ? ymdToDdMmYyyy(row.cancelledDate)
                    : '';
                  return (
                    <motion.tr
                      key={row._id}
                      data-cancellation-row={row._id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: index * 0.02 }}
                      className={cn(
                        'bg-red-50/80 hover:bg-red-100/90 transition-colors',
                        highlightedCancellationIds.has(row._id) && 'cancellation-row-highlight',
                      )}
                    >
                      <td className="px-4 py-3 text-left text-sm font-semibold text-blue-800">
                        {row.flightNo || '—'}
                        <span className="mt-0.5 block text-xs font-normal text-gray-500">
                          Sl. {displayFlightInstanceSerial(row.instanceSerial)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-left text-sm text-gray-900">{row.airlineName || '—'}</td>
                      <td className="px-4 py-3 text-left text-sm text-gray-800">{routeLabel}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-left text-sm font-medium tabular-nums text-gray-900">
                        {cdLabel || '—'}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-800">
                        <div className="flex flex-col items-center">
                          <span>{row.staDate || '—'}</span>
                          <span className="text-xs text-gray-500">{row.staTime || ''}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-800">
                        <div className="flex flex-col items-center">
                          <span>{row.stdDate || '—'}</span>
                          <span className="text-xs text-gray-500">{row.stdTime || ''}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center align-middle">
                        <span className="inline-flex items-center rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                          Cancelled
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center align-middle">
                        {rowHasCancellationAttachment(row) ? (
                          <button
                            type="button"
                            onClick={() => void openAttachmentPreview(row)}
                            disabled={attachmentBusyId === row._id}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={`View cancellation attachment${row.attachmentFileName ? ` ${row.attachmentFileName}` : ''}`}
                            title={
                              row.attachmentFileName
                                ? `View ${row.attachmentFileName}`
                                : 'View document attached at cancellation'
                            }
                          >
                            {attachmentBusyId === row._id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            ) : (
                              <Eye className="h-3.5 w-3.5" aria-hidden />
                            )}
                            View
                          </button>
                        ) : (
                          <span
                            className="text-xs text-gray-400"
                            aria-label={
                              row.intimationMedia
                                ? `No stored file. Filename on record: ${row.intimationMedia}`
                                : 'No attachment'
                            }
                            title={
                              row.intimationMedia
                                ? `Filename recorded: ${row.intimationMedia}. The file was attached to the confirmation email only and was not stored in the database.`
                                : 'No document was stored for this cancellation'
                            }
                          >
                            —
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => openShootModal(row)}
                          className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                        >
                          Shoot Email
                        </button>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {shootRow && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => !shootBusy && setShootRow(null)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900">Shoot cancellation email</h3>
            <p className="mt-2 text-sm text-gray-600">
              Flight <span className="font-medium">{shootRow.flightNo || '—'}</span> · Serial{' '}
              <span className="font-medium">{displayFlightInstanceSerial(shootRow.instanceSerial)}</span>
            </p>
            <div className="mt-4 space-y-2">
              {BIRD_SHOOT_EMAIL_OPTIONS.map((email) => (
                <label
                  key={email}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(shootSelection[email])}
                    onChange={(e) =>
                      setShootSelection((prev) => ({
                        ...prev,
                        [email]: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-gray-800">{email}</span>
                </label>
              ))}
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Add custom email (optional)
              </label>
              <input
                type="email"
                value={shootCustomEmail}
                onChange={(e) => setShootCustomEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShootRow(null)}
                disabled={shootBusy}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onShootSend()}
                disabled={shootBusy}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {shootBusy ? 'Sending…' : 'Shoot'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {attachmentPreview && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={closeAttachmentPreview}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancellation-attachment-title"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3
                  id="cancellation-attachment-title"
                  className="text-lg font-semibold text-gray-900"
                >
                  Attachment preview
                </h3>
                <p className="mt-1 truncate text-sm text-gray-600" title={attachmentPreview.fileName}>
                  {attachmentPreview.fileName}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void downloadAttachmentPreview()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                >
                  <Download className="h-4 w-4" aria-hidden />
                  Download
                </button>
                <button
                  type="button"
                  onClick={closeAttachmentPreview}
                  className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  aria-label="Close attachment preview"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
            <div className="min-h-[12rem] flex-1 overflow-auto rounded-xl border border-gray-100 bg-gray-50 p-3">
              <CancellationAttachmentPreviewBody
                preview={attachmentPreview}
                textContent={attachmentText}
              />
            </div>
          </motion.div>
        </div>
      )}

    </motion.div>
  );
}

function CancellationAttachmentPreviewBody({
  preview,
  textContent,
}: {
  preview: CancellationAttachmentPreview;
  textContent: string | null;
}) {
  const kind = previewKind(preview.mimeType, preview.fileName);
  if (kind === 'image') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={preview.blobUrl}
        alt={preview.fileName}
        className="mx-auto max-h-[70vh] w-auto max-w-full object-contain"
      />
    );
  }
  if (kind === 'pdf') {
    return (
      <iframe
        title={preview.fileName}
        src={preview.blobUrl}
        className="h-[70vh] w-full rounded-lg bg-white"
      />
    );
  }
  if (kind === 'video') {
    return (
      <video controls className="mx-auto max-h-[70vh] w-full max-w-full">
        <source src={preview.blobUrl} type={preview.mimeType} />
      </video>
    );
  }
  if (kind === 'audio') {
    return (
      <div className="flex h-full min-h-[12rem] items-center justify-center">
        <audio controls src={preview.blobUrl} className="w-full max-w-xl">
          Your browser cannot play this audio file. Use Download.
        </audio>
      </div>
    );
  }
  if (kind === 'text') {
    return (
      <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-xs text-gray-800">
        {textContent ?? 'Loading preview…'}
      </pre>
    );
  }
  return (
    <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 px-4 text-center">
      <Paperclip className="h-8 w-8 text-gray-400" aria-hidden />
      <p className="text-sm font-medium text-gray-800">{preview.fileName}</p>
      <p className="text-xs text-gray-500">
        Preview is not available for this file type. Use Download to save it.
      </p>
    </div>
  );
}
