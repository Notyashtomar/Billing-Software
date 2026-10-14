'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  normalizeMainDetailsData,
  type FlightData,
  type MainDetailsData,
  displayScheduledAirlinesTableSerial,
  nsFormSerialForFlight,
  nsRawSerialCandidatesForLockFetch,
} from '@/utils/dataProcessor';
import {
  type ScheduleFieldsFromRawApi,
  scheduleStaDateDisplay,
  scheduleStdDateDisplay,
  scheduleStaTimeRawDisplay,
  scheduleStdTimeRawDisplay,
  normalizeTimeToHHmm,
} from './scheduledRowSchedule';
import { routingFromMainAndFlight } from './formRoutingFromMain';
import {
  FLIGHT_DETAILS_FORM_BODY_CLASS,
  FLIGHT_DETAILS_FORM_ROOT_CLASS,
  FLIGHT_DETAILS_H_SCROLL_CLASS,
  FLIGHT_DETAILS_SECTION_CLASS,
} from './flightDetailsFormLayout';
import {
  getApiBase,
  equipmentManpowerByFlight,
  fetchAdvanceGatewayStaff,
  fetchCreationReferenceAircraft,
  fetchEquipmentManpowerMasterCatalog,
  fetchFhrCollectionFlightLean,
  fetchScheduledAirlineEquipmentTemplates,
  getRawFlightScheduleBySerialUrl,
  advanceDocId,
  fetchFlightsReferenceEquipment,
  resolveEmployeeDesignation,
} from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';
import { TimeSelect24 } from '@/components/ui/TimeSelect24';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  firstFieldErrorKey,
  FRIS_INVALID_CONTROL,
  FRIS_INVALID_PICKER_WRAP,
  maxLength,
  required,
  selectRequired,
  time24,
  type FieldErrors,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';
import { DatePicker } from '@/components/ui/DatePicker';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { SearchableCombobox } from '@/components/ui/SearchableCombobox';
import type { SearchableComboOption } from '@/components/ui/SearchableCombobox';
import { Plus, Trash2, Edit2, X, Wrench, Users } from 'lucide-react';
import { toast } from 'sonner';
import { buildAbbrDescriptionLookup, resolveGseDisplayNameFromCatalog } from './gseCatalogLookup';
import { fhrEquipmentDetailsToEquipmentEntries } from './fhrEquipmentDetailsMapping';
import { buildFullDesignationLookup } from './employeeDesignationResolve';
import {
  applyMilestonesToScheduleEquipmentTemplates,
  mergeScheduleEquipmentIntoEntries,
  resolveAircraftBodyForScheduleEquipment,
  resolveEffectiveMainDetailsForScheduleEquipment,
  resolveFlightMilestonesForScheduleEquipment,
  resolveScheduleEquipmentAirlineLookup,
} from './scheduleEquipmentMerge';
import type { ScheduledAirlineEquipmentTemplateRow } from '@/lib/api';
import { buildScheduleAirlineGseDropdownOptions } from './scheduleEquipmentDropdown';
import {
  isValidScheduleDate,
  parseScheduleDateTime,
  scheduleDurationHhMm,
  toDisplayDate,
  toIsoDate,
} from './scheduleDisplayDate';

const fetch = frisFetch;

export interface EquipmentManpowerEntry {
  id: string;
  serverId?: string;
  equipmentName: string;
  equipmentSerialNo: string;
  employeeName: string;
  employeeId: string;
  designation: string;
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
  /** Free-text notes shown on GSE report Remarks column (not engagement duration). */
  remarks: string;
  exportedInNav: string;
}

export interface ManpowerEntry {
  id: string;
  serverId?: string;
  employeeName: string;
  employeeId: string;
  designation: string;
  place: '' | 'terminal' | 'ramp';
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
}

interface EmployeeRecord {
  _id?: string;
  employeeCode: string;
  employeeName: string;
  designation: string;
  gseAssigned: { code: string; name: string }[];
}

/** API response shape for equipment-details (matches server schema: gsename, gsecode, empname, empcode, designation) */
interface ServerEquipmentRecord {
  _id: string;
  gsename?: string;
  gsecode?: string;
  empname?: string;
  empcode?: string;
  designation?: string;
  fromdate?: string;
  todate?: string;
  fromtime?: string;
  totime?: string;
  engagetime?: string;
}

/**
 * Equipment-details API endpoints (per backend summary):
 * - GET    /equipment-details       → list all (sorted by latest)
 * - GET    /equipment-details/:id   → get single record by Mongo _id
 * - POST   /equipment-details       → create (body: equipment + employee details)
 * - PATCH  /equipment-details/:id   → update (partial body)
 * - DELETE /equipment-details/:id   → delete permanently
 */
const EQUIPMENT_DETAILS_ENDPOINTS = {
  list: () => `${getApiBase()}/equipment-details`,
  getById: (id: string) => `${getApiBase()}/equipment-details/${id}`,
  create: () => `${getApiBase()}/equipment-details`,
  update: (id: string) => `${getApiBase()}/equipment-details/${id}`,
  delete: (id: string) => `${getApiBase()}/equipment-details/${id}`,
} as const;

/**
 * Manpower-details API endpoints:
 * - GET    /manpower-details       → list all (sorted by latest)
 * - GET    /manpower-details/:id   → get single record by Mongo _id
 * - POST   /manpower-details       → create
 * - PATCH  /manpower-details/:id   → update (partial body)
 * - DELETE /manpower-details/:id   → delete permanently
 */
const MANPOWER_DETAILS_ENDPOINTS = {
  list: () => `${getApiBase()}/manpower-details`,
  getById: (id: string) => `${getApiBase()}/manpower-details/${id}`,
  create: () => `${getApiBase()}/manpower-details`,
  update: (id: string) => `${getApiBase()}/manpower-details/${id}`,
  delete: (id: string) => `${getApiBase()}/manpower-details/${id}`,
} as const;

/** API response shape for manpower-details (matches server schema) */
interface ServerManpowerRecord {
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

/** Server equipment-manpower document (one per flight) */
const EQ_PREFIX = 'EQ:';
const MP_PREFIX = 'MP:';
const ENC_SEP = '|';

interface ServerEquipmentManpowerEntry {
  name: string;
  /** `equipment` | `manpower` — discriminates the entry type. */
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
  exportedInNav?: string;
}

interface ServerEquipmentManpowerDoc {
  _id?: string;
  serialNo?: number;
  listType?: string;
  flightNo?: string;
  airlinesOperator?: string;
  entries?: ServerEquipmentManpowerEntry[];
  verifiedBy?: string;
  verifiedByCode?: string;
  verifiedAt?: string;
}

function encodeEquipmentToEntry(e: EquipmentManpowerEntry): ServerEquipmentManpowerEntry {
  const designation = e.designation || '';
  // Legacy `name` kept for backward compatibility; structured fields are the source of truth.
  const name = EQ_PREFIX + [e.equipmentName, e.equipmentSerialNo, e.employeeName, e.employeeId, designation].join(ENC_SEP);
  return {
    name,
    entryType: 'equipment',
    equipmentName: e.equipmentName || '',
    equipmentSerialNo: e.equipmentSerialNo || '',
    employeeName: e.employeeName || '',
    employeeId: e.employeeId || '',
    designation,
    place: '',
    fromDate: toIsoDate(e.fromDate) || e.fromDate,
    fromTime: e.fromTime,
    toDate: toIsoDate(e.toDate) || e.toDate,
    toTime: e.toTime,
    remarks: normalizeEquipmentRemarks(e.remarks),
    exportedInNav: e.exportedInNav || 'N',
  };
}

function encodeManpowerToEntry(m: ManpowerEntry): ServerEquipmentManpowerEntry {
  // Legacy `name` kept for backward compatibility; structured fields are the source of truth.
  const name = MP_PREFIX + [m.employeeName, m.employeeId, m.designation || '', m.place].join(ENC_SEP);
  return {
    name,
    entryType: 'manpower',
    equipmentName: '',
    equipmentSerialNo: '',
    employeeName: m.employeeName || '',
    employeeId: m.employeeId || '',
    designation: m.designation || '',
    place: m.place || '',
    fromDate: toIsoDate(m.fromDate) || m.fromDate,
    fromTime: m.fromTime,
    toDate: toIsoDate(m.toDate) || m.toDate,
    toTime: m.toTime,
    remarks: '',
    exportedInNav: 'N',
  };
}

function decodeEntry(
  entry: ServerEquipmentManpowerEntry,
  eqIndex: number,
  mpIndex: number
): { type: 'eq'; row: EquipmentManpowerEntry } | { type: 'mp'; row: ManpowerEntry } | null {
  const n = (entry.name || '').trim();
  const type = (entry.entryType || '').trim().toLowerCase();
  // Legacy parts (only used as a fallback for documents saved before structured fields existed).
  const eqParts = n.startsWith(EQ_PREFIX) ? n.slice(EQ_PREFIX.length).split(ENC_SEP) : [];
  const mpParts = n.startsWith(MP_PREFIX) ? n.slice(MP_PREFIX.length).split(ENC_SEP) : [];

  const isEquipment = type === 'equipment' || (!type && n.startsWith(EQ_PREFIX));
  const isManpower = type === 'manpower' || (!type && n.startsWith(MP_PREFIX));

  if (isEquipment) {
    return {
      type: 'eq',
      row: {
        id: `eq-${eqIndex}`,
        equipmentName: entry.equipmentName ?? eqParts[0] ?? '',
        equipmentSerialNo: entry.equipmentSerialNo ?? eqParts[1] ?? '',
        employeeName: entry.employeeName ?? eqParts[2] ?? '',
        employeeId: entry.employeeId ?? eqParts[3] ?? '',
        designation: entry.designation || eqParts[4] || '',
        fromDate: toDisplayDate(entry.fromDate || '') || entry.fromDate || '',
        fromTime: entry.fromTime || '',
        toDate: toDisplayDate(entry.toDate || '') || entry.toDate || '',
        toTime: entry.toTime || '',
        remarks: normalizeEquipmentRemarks(entry.remarks),
        exportedInNav: entry.exportedInNav || 'N',
      },
    };
  }
  if (isManpower) {
    const place = (entry.place ?? mpParts[3] ?? '').trim();
    return {
      type: 'mp',
      row: {
        id: `mp-${mpIndex}`,
        employeeName: entry.employeeName ?? mpParts[0] ?? '',
        employeeId: entry.employeeId ?? mpParts[1] ?? '',
        designation: entry.designation ?? mpParts[2] ?? '',
        place: place === 'ramp' || place === 'terminal' ? place : '',
        fromDate: toDisplayDate(entry.fromDate || '') || entry.fromDate || '',
        fromTime: entry.fromTime || '',
        toDate: toDisplayDate(entry.toDate || '') || entry.toDate || '',
        toTime: entry.toTime || '',
      },
    };
  }
  return null;
}

function computeRemarks(entry: EquipmentManpowerEntry): string {
  const from = parseScheduleDateTime(entry.fromDate, entry.fromTime);
  const to = parseScheduleDateTime(entry.toDate, entry.toTime);
  return scheduleDurationHhMm(from, to) ?? '–';
}

/** Older saves stuffed engagement duration into `remarks`; ignore those as free-text notes. */
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

function normalizeEquipmentRemarks(raw?: string): string {
  const s = String(raw ?? '').trim();
  if (!s || isLegacyDurationRemarks(s) || isDecimalNumberRemarks(s)) return '';
  return s;
}

const EQUIPMENT_REMARKS_MAX = 500;

export interface EquipmentManpowerFormProps {
  flight: FlightData;
  onBack?: () => void;
  mainDetails?: MainDetailsData | null;
  /** Non-scheduled flights use the complete equipment inventory instead of airline schedule rules. */
  useAllEquipmentInventory?: boolean;
  /** After equipment/manpower is synced to the server, parent can refresh GSD lock on the table row. */
  onGsdLockStateSaved?: (slNo: string) => void;
}

let nextId = 1;
let manpowerNextId = 1;

function fhrEquipmentAbbrAt(details: unknown[], index: number): string {
  const row = details[index];
  if (!row || typeof row !== 'object') return '';
  return String((row as Record<string, unknown>).equipment_name ?? '').trim();
}

const EQ_FIELD_ORDER = [
  'gseName',
  'gseNo',
  'fromDate',
  'fromTime',
  'toDate',
  'toTime',
  'remarks',
] as const;
const MP_FIELD_ORDER = [
  'employeeName',
  'place',
  'fromDate',
  'fromTime',
  'toDate',
  'toTime',
] as const;
const VERIFY_FIELD_ORDER = ['verifyPassword'] as const;

type EntryPeriodFields = 'fromDate' | 'fromTime' | 'toDate' | 'toTime';

/** First message in field order — the inline slot truncates, so the toast carries the full text. */
function firstErrorMessage<K extends string>(
  order: readonly K[],
  errors: FieldErrors<K>,
): string {
  const key = firstFieldErrorKey(order, errors);
  return (key && errors[key]) || 'Fix the highlighted fields before continuing.';
}

/**
 * From/To must be a complete, chronological window — an inverted or open-ended
 * period silently produces a `–` duration on the GSE report.
 */
function validateEntryPeriod(period: {
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
}): FieldErrors<EntryPeriodFields> {
  const errors: FieldErrors<EntryPeriodFields> = {};

  const fromDateErr = required(period.fromDate, 'From date');
  if (fromDateErr) errors.fromDate = fromDateErr;
  else if (!isValidScheduleDate(period.fromDate)) {
    errors.fromDate = 'From date must be a valid date (dd/MM/yyyy).';
  }

  const toDateErr = required(period.toDate, 'To date');
  if (toDateErr) errors.toDate = toDateErr;
  else if (!isValidScheduleDate(period.toDate)) {
    errors.toDate = 'To date must be a valid date (dd/MM/yyyy).';
  }

  const fromTimeErr =
    required(period.fromTime, 'From time') || time24(period.fromTime, 'From time');
  if (fromTimeErr) errors.fromTime = fromTimeErr;

  const toTimeErr = required(period.toTime, 'To time') || time24(period.toTime, 'To time');
  if (toTimeErr) errors.toTime = toTimeErr;

  if (Object.keys(errors).length > 0) return errors;

  const from = parseScheduleDateTime(period.fromDate, period.fromTime);
  const to = parseScheduleDateTime(period.toDate, period.toTime);
  if (from && to && to.getTime() < from.getTime()) {
    errors.toTime = 'To date/time cannot be before From date/time.';
  }
  return errors;
}

/** Prefer GSE abbr line from `fhr_collection.equipmentDetails[i]` → catalog description; else resolve saved label. */
function enrichEquipmentRowsFromFhrAndCatalog(
  eqSaved: EquipmentManpowerEntry[],
  equipmentDetails: unknown[],
  abbrLookup: Map<string, string>,
): EquipmentManpowerEntry[] {
  return eqSaved.map((row, i) => {
    const abbr = fhrEquipmentAbbrAt(equipmentDetails, i);
    const fromFhr = abbr ? resolveGseDisplayNameFromCatalog(abbr, abbrLookup) : '';
    const fromSaved = resolveGseDisplayNameFromCatalog(row.equipmentName, abbrLookup);
    const equipmentName = (fromFhr || fromSaved || row.equipmentName).trim();
    return { ...row, equipmentName };
  });
}

function equipmentRowsFromFhrEquipmentDetails(
  equipmentDetails: unknown[],
  abbrLookup: Map<string, string>,
): EquipmentManpowerEntry[] {
  const mapped = fhrEquipmentDetailsToEquipmentEntries(equipmentDetails, abbrLookup);
  return mapped.map((e, idx) => ({
    id: `eq-fhr-${idx}`,
    equipmentName: e.equipmentName,
    equipmentSerialNo: e.equipmentId || '',
    employeeName: e.employeeName || '',
    employeeId: e.employeeId || '',
    designation: e.designation || '',
    fromDate: e.fromDate,
    fromTime: e.fromTime,
    toDate: e.toDate,
    toTime: e.toTime,
    remarks: normalizeEquipmentRemarks(e.storedRemarks),
    exportedInNav: 'N',
  }));
}

function decodeManpowerEntriesFromFhrEmbed(raw: unknown): ManpowerEntry[] {
  if (!Array.isArray(raw)) return [];
  const mpList: ManpowerEntry[] = [];
  let mpIdx = 0;
  raw.forEach((entry) => {
    const decoded = decodeEntry(entry as ServerEquipmentManpowerEntry, 0, mpIdx);
    if (decoded?.type === 'mp') {
      mpList.push(decoded.row);
      mpIdx++;
    }
  });
  return mpList;
}

type LoggedInUser = {
  displayName: string;
  userId: string;
};

function getLoggedInUser(): LoggedInUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr) as {
        name?: string;
        username?: string;
        email?: string;
        userid?: string;
      };
      const displayName = String(user?.name || user?.username || user?.email || '').trim();
      const userId = String(user?.userid || user?.username || user?.email || '').trim();
      if (displayName || userId) return { displayName: displayName || userId, userId: userId || displayName };
    }
  } catch {
    // ignore parse/storage errors
  }
  const displayName = String(localStorage.getItem('username') || localStorage.getItem('userEmail') || '').trim();
  const userId = String(localStorage.getItem('userid') || localStorage.getItem('username') || localStorage.getItem('userEmail') || '').trim();
  if (!displayName && !userId) return null;
  return { displayName: displayName || userId, userId: userId || displayName };
}

export default function EquipmentManpowerForm({
  flight,
  onBack,
  mainDetails,
  useAllEquipmentInventory = false,
  onGsdLockStateSaved,
}: EquipmentManpowerFormProps) {
  const displayAirline = mainDetails?.airlineName ?? flight.airline;
  const displayFlightNo = mainDetails?.flightCode ?? flight.flightNo;
  const displayAircraft = mainDetails?.aircraftType ?? flight.aircraft;

  const [entries, setEntries] = useState<EquipmentManpowerEntry[]>([]);
  const [manpowerEntries, setManpowerEntries] = useState<ManpowerEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingManpowerId, setEditingManpowerId] = useState<string | null>(null);
  const hasEquipmentManpowerDoc = useRef(false);
  const [equipmentManpowerLoaded, setEquipmentManpowerLoaded] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalMode, setModalMode] = useState<'equipment' | 'manpower'>('equipment');
  const [apiError, setApiError] = useState<string | null>(null);

  const [equipmentListFromApi, setEquipmentListFromApi] = useState<ServerEquipmentRecord[]>([]);
  const [manpowerEmployees, setManpowerEmployees] = useState<EmployeeRecord[]>([]);
  const [designationLookup, setDesignationLookup] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [staffLoading, setStaffLoading] = useState(false);
  const staffLoadInFlight = useRef(false);

  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyUserId, setVerifyUserId] = useState('');
  const [verifyPassword, setVerifyPassword] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verifiedBy, setVerifiedBy] = useState<string | null>(null);
  const eqErrors = useFieldErrors<(typeof EQ_FIELD_ORDER)[number]>(EQ_FIELD_ORDER);
  const mpErrors = useFieldErrors<(typeof MP_FIELD_ORDER)[number]>(MP_FIELD_ORDER);
  const verifyFieldErrors = useFieldErrors<(typeof VERIFY_FIELD_ORDER)[number]>(VERIFY_FIELD_ORDER);
  const [verifiedByCode, setVerifiedByCode] = useState<string | null>(null);
  /** After GSD verify, continue with the pending form Save. */
  const pendingSaveAfterVerify = useRef(false);
  const [scheduleFromRaw, setScheduleFromRaw] = useState<ScheduleFieldsFromRawApi | null>(null);
  const [aircraftBodyByType, setAircraftBodyByType] = useState<Map<string, 'NB' | 'WB'>>(new Map());
  const [mainDetailsFromFhr, setMainDetailsFromFhr] = useState<MainDetailsData | null>(null);
  const scheduleRulesRef = useRef<ScheduledAirlineEquipmentTemplateRow[]>([]);
  const [scheduleEquipmentRules, setScheduleEquipmentRules] = useState<
    ScheduledAirlineEquipmentTemplateRow[]
  >([]);

  useEffect(() => {
    fetchCreationReferenceAircraft()
      .then((rows) => {
        const map = new Map<string, 'NB' | 'WB'>();
        for (const doc of rows) {
          if (!doc || typeof doc !== 'object') continue;
          const r = doc as Record<string, unknown>;
          const type = String(r.aircraft ?? r.type ?? '').trim();
          if (!type) continue;
          const body = String(r.aircraftBody ?? '').trim().toUpperCase() === 'WB' ? 'WB' : 'NB';
          map.set(type.toLowerCase(), body);
        }
        setAircraftBodyByType(map);
      })
      .catch(() => setAircraftBodyByType(new Map()));
  }, []);

  useEffect(() => {
    if (!flight?.slNo) {
      setScheduleFromRaw(null);
      return;
    }
    const url = getRawFlightScheduleBySerialUrl(flight.slNo);
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((row: ScheduleFieldsFromRawApi | null) => {
        if (
          row != null &&
          typeof row === 'object' &&
          !Array.isArray(row) &&
          (String(row.staDate ?? '').trim() ||
            String(row.stdDate ?? '').trim() ||
            String(row.staTime ?? '').trim() ||
            String(row.stdTime ?? '').trim())
        ) {
          setScheduleFromRaw(row);
        } else setScheduleFromRaw(null);
      })
      .catch(() => setScheduleFromRaw(null));
  }, [flight?.slNo]);

  const effectiveMainDetails = useMemo(
    () => resolveEffectiveMainDetailsForScheduleEquipment(mainDetails, mainDetailsFromFhr),
    [mainDetails, mainDetailsFromFhr],
  );

  useEffect(() => {
    const serial = nsFormSerialForFlight(flight);
    if (!serial) {
      setMainDetailsFromFhr(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const variants = new Set<string>([serial]);
      for (const r of nsRawSerialCandidatesForLockFetch(flight)) {
        const s = String(r ?? '').trim();
        if (s) variants.add(s);
      }
      for (const s of variants) {
        const doc = await fetchFhrCollectionFlightLean(s);
        if (cancelled || !doc) continue;
        const embed = doc.mainDetails;
        if (embed && typeof embed === 'object' && !Array.isArray(embed)) {
          const normalized = normalizeMainDetailsData(embed);
          if (normalized) {
            setMainDetailsFromFhr(normalized);
            return;
          }
        }
      }
      if (!cancelled) setMainDetailsFromFhr(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [flight.slNo, flight.legacySlNo]);

  const defaultFromDate = useMemo(() => {
    const r = scheduleStdDateDisplay(flight, scheduleFromRaw);
    return r ? toDisplayDate(r) : '';
  }, [
    flight.slNo,
    flight.stdDate,
    scheduleFromRaw?.stdDate,
    scheduleFromRaw?.staDate,
  ]);

  /** Prefer STA; fall back empty — milestones used at open/save for ATA. */
  const defaultFromTime = useMemo(() => {
    const raw = scheduleStaTimeRawDisplay(flight, scheduleFromRaw);
    return raw ? normalizeTimeToHHmm(raw) : '';
  }, [
    flight.slNo,
    flight.staTime,
    scheduleFromRaw?.staTime,
  ]);

  const defaultToTime = useMemo(() => {
    const raw = scheduleStdTimeRawDisplay(flight, scheduleFromRaw);
    return raw ? normalizeTimeToHHmm(raw) : '';
  }, [
    flight.slNo,
    flight.stdTime,
    scheduleFromRaw?.stdTime,
  ]);

  const [equipmentFormItem, setEquipmentFormItem] = useState({
    gseName: '',
    gseNo: '',
    employeeName: '',
    employeeId: '',
    designation: '',
    fromDate: defaultFromDate,
    fromTime: defaultFromTime,
    toDate: defaultFromDate,
    toTime: defaultToTime,
    remarks: '',
  });

  const [manpowerFormItem, setManpowerFormItem] = useState({
    employeeName: '',
    employeeId: '',
    designation: '',
    place: '' as '' | 'terminal' | 'ramp',
    fromDate: defaultFromDate,
    fromTime: defaultFromTime,
    toDate: defaultFromDate,
    toTime: defaultToTime,
  });

  // Ad-hoc Add Equipment needs full inventory; schedule templates still seed preferred names.
  // Sidebar Open traps fixed modals — portals below escape transform/overflow clipping.
  const { names: uniqueGseNames, serialsByName: gseSerialsByName } = useMemo(
    () =>
      buildScheduleAirlineGseDropdownOptions(
        scheduleEquipmentRules,
        equipmentListFromApi,
        true,
      ),
    [scheduleEquipmentRules, equipmentListFromApi],
  );

  const employeesForDropdown = useMemo(() => manpowerEmployees, [manpowerEmployees]);

  const employeeMapByCode = useMemo(() => {
    const m = new Map<string, EmployeeRecord>();
    employeesForDropdown.forEach((emp) => {
      const code = (emp.employeeCode ?? '').trim();
      if (code) m.set(code.toLowerCase(), emp);
    });
    return m;
  }, [employeesForDropdown]);

  /** Prefer Staff Data / user master designation over stored manpower-role placeholders. */
  const resolveRowDesignation = useCallback(
    (employeeId?: string, stored?: string): string => {
      return resolveEmployeeDesignation(
        employeeId,
        designationLookup,
        employeeId
          ? employeeMapByCode.get(String(employeeId).trim().toLowerCase())?.designation
          : undefined,
        stored,
      );
    },
    [designationLookup, employeeMapByCode],
  );

  /** Backfill designations on equipment + manpower after staff master and flight rows are ready. */
  useEffect(() => {
    if ((designationLookup.size === 0 && employeeMapByCode.size === 0) || !equipmentManpowerLoaded) {
      return;
    }
    const apply = <T extends { employeeId?: string; designation?: string }>(row: T): T => {
      const next = resolveRowDesignation(row.employeeId, row.designation);
      if (!next || next === String(row.designation ?? '').trim()) return row;
      return { ...row, designation: next };
    };
    setEntries((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        const updated = apply(row);
        if (updated !== row) changed = true;
        return updated;
      });
      return changed ? next : prev;
    });
    setManpowerEntries((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        const updated = apply(row);
        if (updated !== row) changed = true;
        return updated;
      });
      return changed ? next : prev;
    });
  }, [
    designationLookup,
    employeeMapByCode,
    equipmentManpowerLoaded,
    resolveRowDesignation,
  ]);

  const employeeMapByNameNorm = useMemo(() => {
    const m = new Map<string, EmployeeRecord>();
    employeesForDropdown.forEach((emp) => {
      const name = (emp.employeeName ?? '').trim().toLowerCase();
      if (name) m.set(name, emp);
    });
    return m;
  }, [employeesForDropdown]);

  const manpowerNameComboOptions = useMemo((): SearchableComboOption[] => {
    return employeesForDropdown.map((e) => {
      const code = (e.employeeCode ?? '').trim();
      const name = (e.employeeName ?? '').trim();
      return {
        id: e._id || `${code}|${name}`,
        label: name || code,
        description: code ? `Code: ${code}` : e.designation || undefined,
        searchIndex: `${name} ${code} ${e.designation ?? ''}`.toLowerCase(),
        employeeCode: code,
        employeeName: name,
      };
    });
  }, [employeesForDropdown]);

  /** Equipment operator dropdown: staff assigned to the selected GSE in Advance → Gateway → Staff. */
  const gseEmployeeOptionsForSelection = useMemo(() => {
    if (!equipmentFormItem.gseName || !equipmentFormItem.gseNo) return [];
    const gseCode = equipmentFormItem.gseNo.trim().toLowerCase();
    const gseName = equipmentFormItem.gseName.trim().toLowerCase();
    const assigned = employeesForDropdown.filter((e) =>
      e.gseAssigned.some((gse) => {
        const code = gse.code.trim().toLowerCase();
        const name = gse.name.trim().toLowerCase();
        return (gseCode && code === gseCode) || (gseName && name === gseName);
      }),
    );
    const pool = assigned.length > 0 ? assigned : employeesForDropdown;
    return pool.map((e) => ({
      employeeCode: e.employeeCode,
      employeeName: e.employeeName ?? e.employeeCode ?? '',
    }));
  }, [equipmentFormItem.gseName, equipmentFormItem.gseNo, employeesForDropdown]);

  const equipmentEmployeeComboOptions = useMemo((): SearchableComboOption[] => {
    return gseEmployeeOptionsForSelection.map((o) => {
      const rec = employeeMapByCode.get(o.employeeCode.trim().toLowerCase());
      return {
        id: rec?._id || `${o.employeeCode}|${o.employeeName}`,
        label: o.employeeName || o.employeeCode,
        description: o.employeeCode ? `Code: ${o.employeeCode}` : rec?.designation,
        searchIndex: `${o.employeeName} ${o.employeeCode} ${rec?.designation ?? ''}`.toLowerCase(),
        employeeCode: o.employeeCode,
        employeeName: o.employeeName,
      };
    });
  }, [gseEmployeeOptionsForSelection, employeeMapByCode]);

  useEffect(() => {
    if (equipmentFormItem.gseName && gseSerialsByName.has(equipmentFormItem.gseName)) {
      const serials = gseSerialsByName.get(equipmentFormItem.gseName)!;
      if (!serials.includes(equipmentFormItem.gseNo)) {
        setEquipmentFormItem((p) => ({ ...p, gseNo: serials[0] || '' }));
      }
    } else {
      setEquipmentFormItem((p) => ({ ...p, gseNo: '' }));
    }
  }, [equipmentFormItem.gseName, gseSerialsByName]);

  useEffect(() => {
    if (gseEmployeeOptionsForSelection.length === 1) {
      const o = gseEmployeeOptionsForSelection[0];
      const rec = employeeMapByCode.get(o.employeeCode.trim().toLowerCase());
      setEquipmentFormItem((p) => ({
        ...p,
        employeeName: o.employeeName,
        employeeId: o.employeeCode,
        designation: rec?.designation ?? '',
      }));
    } else if (gseEmployeeOptionsForSelection.length === 0) {
      setEquipmentFormItem((p) => ({ ...p, employeeName: '', employeeId: '', designation: '' }));
    } else {
      const currentInList = equipmentFormItem.employeeId && gseEmployeeOptionsForSelection.some((x) => x.employeeCode === equipmentFormItem.employeeId);
      if (!currentInList) {
        setEquipmentFormItem((p) => ({ ...p, employeeName: '', employeeId: '', designation: '' }));
      }
    }
  }, [equipmentFormItem.employeeId, gseEmployeeOptionsForSelection, employeeMapByCode]);

  /** Fetches equipment-details only for GSE dropdown options; does NOT fill the table (table is from equipment-manpower by flight). */
  const fetchEquipmentDetails = async () => {
    try {
      // NS Open uses flights-reference only — `equipment-details` is OPERATIONAL_ROLES
      // and 403s for employees with only Non-Scheduled Airlines access.
      const advanceEquipmentPromise = fetchFlightsReferenceEquipment().catch(
        () => [],
      );
      const [res, advanceEquipment] = await Promise.all([
        useAllEquipmentInventory
          ? Promise.resolve({ ok: false } as Response)
          : fetch(EQUIPMENT_DETAILS_ENDPOINTS.list()),
        advanceEquipmentPromise,
      ]);
      const payload = res.ok ? await res.json() : [];
      const operationalRows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : [];
      const advanceRows: ServerEquipmentRecord[] = (
        Array.isArray(advanceEquipment) ? advanceEquipment as Record<string, unknown>[] : []
      )
        .filter((doc) => advanceDocId(doc).active !== false)
        .map((doc) => {
          const row = advanceDocId(doc);
          return {
            _id: row.id,
            gsename: String(row.equipmentName ?? '').trim(),
            gsecode: String(row.equipmentCode ?? '').trim(),
          };
        })
        .filter((row) => row.gsename || row.gsecode);

      const merged = [...operationalRows, ...advanceRows] as ServerEquipmentRecord[];
      const seen = new Set<string>();
      setEquipmentListFromApi(
        merged.filter((row) => {
          const key = `${String(row.gsename ?? '').trim().toLowerCase()}|${String(
            row.gsecode ?? '',
          )
            .trim()
            .toLowerCase()}`;
          if (key === '|' || seen.has(key)) return false;
          seen.add(key);
          return true;
        }),
      );
    } catch (err) {
      console.error('Failed to fetch equipment details:', err);
    }
  };

  const fetchManpowerEmployees = async () => {
    setStaffLoading(true);
    try {
      const [list, lookup] = await Promise.all([
        fetchAdvanceGatewayStaff(),
        buildFullDesignationLookup().catch(() => new Map<string, string>()),
      ]);
      setDesignationLookup(lookup);
      const mapped: EmployeeRecord[] = list.map((row) => ({
        _id: row.id,
        employeeCode: row.employeeCode,
        employeeName: row.employeeName,
        designation: resolveEmployeeDesignation(
          row.employeeCode,
          lookup,
          row.designation,
          row.manpower,
          row.manpowerCode,
        ),
        gseAssigned: row.gseAssigned,
      }));
      setManpowerEmployees(mapped);
    } catch (err) {
      console.error('Failed to fetch gateway staff data:', err);
      // Soft-fail: do not toast — NS Airlines-only users must not see Advance errors.
      setManpowerEmployees([]);
    } finally {
      setStaffLoading(false);
    }
  };

  const loadStaffIfNeeded = useCallback(async () => {
    if (manpowerEmployees.length > 0 || staffLoadInFlight.current) return;
    staffLoadInFlight.current = true;
    try {
      await fetchManpowerEmployees();
    } finally {
      staffLoadInFlight.current = false;
    }
  }, [manpowerEmployees.length]);

  const flightMilestones = useMemo(
    () =>
      resolveFlightMilestonesForScheduleEquipment({
        flight,
        mainDetails: effectiveMainDetails,
        scheduleFromRaw,
      }),
    [
      flight.slNo,
      flight.staDate,
      flight.staTime,
      flight.stdDate,
      flight.stdTime,
      effectiveMainDetails?.ataDate,
      effectiveMainDetails?.ataTime,
      effectiveMainDetails?.atdDate,
      effectiveMainDetails?.atdTime,
      scheduleFromRaw?.staDate,
      scheduleFromRaw?.staTime,
      scheduleFromRaw?.stdDate,
      scheduleFromRaw?.stdTime,
    ],
  );

  const scheduleEquipmentContext = useMemo(() => {
    const { airlineCode, airlineName } = resolveScheduleEquipmentAirlineLookup({
      mainDetails: effectiveMainDetails,
      flight,
    });
    return {
      airlineCode,
      airlineName,
      aircraftBody: resolveAircraftBodyForScheduleEquipment(
        effectiveMainDetails,
        flight,
        aircraftBodyByType,
      ),
      splitOperation: effectiveMainDetails?.ifOperationSplit === true,
    };
  }, [
    effectiveMainDetails?.airlineCode,
    effectiveMainDetails?.airlineName,
    effectiveMainDetails?.aircraftBody,
    effectiveMainDetails?.aircraftType,
    effectiveMainDetails?.ifOperationSplit,
    flight.airline,
    flight.airlineCode,
    flight.aircraft,
    aircraftBodyByType,
  ]);

  useEffect(() => {
    // Non-Scheduled Open uses full inventory — skip Schedule Equipment templates.
    if (useAllEquipmentInventory) return;
    let cancelled = false;
    void (async () => {
      const rules = await fetchScheduledAirlineEquipmentTemplates({
        ...scheduleEquipmentContext,
        ...flightMilestones,
      });
      if (cancelled || rules.length === 0) return;
      scheduleRulesRef.current = rules;
      setScheduleEquipmentRules(rules);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    useAllEquipmentInventory,
    scheduleEquipmentContext.airlineCode,
    scheduleEquipmentContext.airlineName,
    scheduleEquipmentContext.aircraftBody,
    scheduleEquipmentContext.splitOperation,
    flightMilestones.ataDate,
    flightMilestones.ataTime,
    flightMilestones.atdDate,
    flightMilestones.atdTime,
    flightMilestones.defaultDate,
  ]);

  const mergeScheduleTemplates = useCallback(
    async (baseEq: EquipmentManpowerEntry[]): Promise<EquipmentManpowerEntry[]> => {
      if (useAllEquipmentInventory) return baseEq;
      const rules = await fetchScheduledAirlineEquipmentTemplates({
        ...scheduleEquipmentContext,
        ...flightMilestones,
      });
      if (rules.length > 0) {
        scheduleRulesRef.current = rules;
        setScheduleEquipmentRules(rules);
      }
      const rulesToApply =
        rules.length > 0 ? rules : scheduleRulesRef.current;
      const templates = applyMilestonesToScheduleEquipmentTemplates(
        rulesToApply,
        flightMilestones,
      );
      return mergeScheduleEquipmentIntoEntries(baseEq, templates);
    },
    [useAllEquipmentInventory, scheduleEquipmentContext, flightMilestones],
  );

  const recalculateScheduleEntryTimes = useCallback(
    (prev: EquipmentManpowerEntry[]): EquipmentManpowerEntry[] => {
      const rules = scheduleRulesRef.current;
      if (rules.length === 0) return prev;
      const templates = applyMilestonesToScheduleEquipmentTemplates(
        rules,
        flightMilestones,
      );
      return mergeScheduleEquipmentIntoEntries(prev, templates);
    },
    [flightMilestones],
  );

  const fetchEquipmentManpowerByFlight = async () => {
    const serial = nsFormSerialForFlight(flight);
    if (!serial) {
      setEquipmentManpowerLoaded(true);
      return;
    }

    const expandedSerials = new Set<string>();
    for (const r of nsRawSerialCandidatesForLockFetch(flight)) {
      const s = String(r ?? '').trim();
      if (!s) continue;
      expandedSerials.add(s);
      expandedSerials.add(s.replace(/^FL-/i, ''));
      expandedSerials.add(s.replace(/[^\d]/g, ''));
    }
    const serialVariants = [...expandedSerials].filter(Boolean);

    try {
      const [catalogItems, fhrDoc] = await Promise.all([
        fetchEquipmentManpowerMasterCatalog(),
        (async (): Promise<Record<string, unknown> | null> => {
          for (const s of serialVariants) {
            const doc = await fetchFhrCollectionFlightLean(s);
            if (doc) return doc;
          }
          return null;
        })(),
      ]);

      const abbrLookup = buildAbbrDescriptionLookup(catalogItems);
      const equipmentDetails = Array.isArray(fhrDoc?.equipmentDetails)
        ? fhrDoc.equipmentDetails
        : [];

      const url = equipmentManpowerByFlight(serial).get();
      const res = await fetch(url);

      let data: ServerEquipmentManpowerDoc = {};
      if (res.ok && res.status !== 404) {
        const text = await res.text();
        if (text.trim()) {
          try {
            data = JSON.parse(text) as ServerEquipmentManpowerDoc;
          } catch {
            data = {};
          }
        }
        hasEquipmentManpowerDoc.current = !!data?._id;
      } else {
        hasEquipmentManpowerDoc.current = false;
        data = {};
      }

      const vb = typeof data?.verifiedBy === 'string' ? data.verifiedBy.trim() : '';
      const vbc = typeof data?.verifiedByCode === 'string' ? data.verifiedByCode.trim() : '';
      setVerifiedBy(vb ? vb : null);
      setVerifiedByCode(vbc ? vbc : null);

      const rawEntries = data?.entries ?? [];
      const eqList: EquipmentManpowerEntry[] = [];
      let mpList: ManpowerEntry[] = [];
      let eqIdx = 0;
      let mpIdx = 0;
      rawEntries.forEach((entry) => {
        const decoded = decodeEntry(entry, eqIdx, mpIdx);
        if (decoded?.type === 'eq') {
          eqList.push(decoded.row);
          eqIdx++;
        } else if (decoded?.type === 'mp') {
          mpList.push(decoded.row);
          mpIdx++;
        }
      });

      let mergedEq = enrichEquipmentRowsFromFhrAndCatalog(eqList, equipmentDetails, abbrLookup);
      if (mergedEq.length === 0 && equipmentDetails.length > 0) {
        mergedEq = equipmentRowsFromFhrEquipmentDetails(equipmentDetails, abbrLookup);
      }

      if (mpList.length === 0) {
        const embed = fhrDoc?.equipmentManpower;
        const embedEntries =
          embed && typeof embed === 'object'
            ? (embed as Record<string, unknown>).entries
            : undefined;
        mpList = decodeManpowerEntriesFromFhrEmbed(embedEntries);
      }

      const withSchedule = await mergeScheduleTemplates(mergedEq);
      const staffByCodeGet = (employeeId?: string) => {
        const code = String(employeeId ?? '').trim().toLowerCase();
        if (!code) return '';
        const fromLookup = designationLookup.get(code) || '';
        if (fromLookup) return fromLookup;
        return (
          manpowerEmployees.find(
            (e) => (e.employeeCode ?? '').trim().toLowerCase() === code,
          )?.designation ?? ''
        );
      };
      const enrichDesig = <T extends { employeeId?: string; designation?: string }>(
        row: T,
      ): T => {
        const next = resolveEmployeeDesignation(
          row.employeeId,
          designationLookup,
          staffByCodeGet(row.employeeId),
          row.designation,
        );
        if (!next || next === String(row.designation ?? '').trim()) return row;
        return { ...row, designation: next };
      };
      setEntries(withSchedule.map(enrichDesig));
      setManpowerEntries(mpList.map(enrichDesig));

      if (withSchedule.length > 0 || mpList.length > 0) {
        nextId = Math.max(nextId, withSchedule.length + 1);
        manpowerNextId = Math.max(manpowerNextId, mpList.length + 1);
      }
    } catch (err) {
      console.error('Failed to fetch equipment-manpower:', err);
      setEntries([]);
      setManpowerEntries([]);
      setVerifiedBy(null);
      setVerifiedByCode(null);
    } finally {
      setEquipmentManpowerLoaded(true);
    }
  };

  useEffect(() => {
    void fetchEquipmentDetails();
    // Inventory source depends on NS vs Scheduled mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount + mode refresh
  }, [useAllEquipmentInventory]);

  useEffect(() => {
    fetchManpowerEmployees();
  }, []);

  useEffect(() => {
    fetchEquipmentManpowerByFlight();
  }, [flight.slNo, flight.legacySlNo]);

  useEffect(() => {
    if (!equipmentManpowerLoaded) return;
    setEntries((prev) => recalculateScheduleEntryTimes(prev));
  }, [
    equipmentManpowerLoaded,
    recalculateScheduleEntryTimes,
    mainDetails?.ataDate,
    mainDetails?.ataTime,
    mainDetails?.atdDate,
    mainDetails?.atdTime,
    mainDetailsFromFhr?.ataDate,
    mainDetailsFromFhr?.ataTime,
    mainDetailsFromFhr?.atdDate,
    mainDetailsFromFhr?.atdTime,
  ]);

  useEffect(() => {
    if (!equipmentManpowerLoaded || useAllEquipmentInventory) return;
    let cancelled = false;
    void (async () => {
      const rules = await fetchScheduledAirlineEquipmentTemplates({
        ...scheduleEquipmentContext,
        ...flightMilestones,
      });
      if (cancelled) return;
      if (rules.length > 0) {
        scheduleRulesRef.current = rules;
        setScheduleEquipmentRules(rules);
      }
      const rulesToApply =
        rules.length > 0 ? rules : scheduleRulesRef.current;
      const templates = applyMilestonesToScheduleEquipmentTemplates(
        rulesToApply,
        flightMilestones,
      );
      setEntries((prev) => mergeScheduleEquipmentIntoEntries(prev, templates));
    })();
    return () => {
      cancelled = true;
    };
  }, [
    equipmentManpowerLoaded,
    useAllEquipmentInventory,
    scheduleEquipmentContext.airlineCode,
    scheduleEquipmentContext.airlineName,
    scheduleEquipmentContext.aircraftBody,
    scheduleEquipmentContext.splitOperation,
  ]);

  useEffect(() => {
    setEquipmentFormItem((prev) => ({
      ...prev,
      fromDate: defaultFromDate || prev.fromDate,
      fromTime: defaultFromTime,
      toDate: defaultFromDate || prev.toDate,
      toTime: defaultToTime,
    }));
    setManpowerFormItem((prev) => ({
      ...prev,
      fromDate: defaultFromDate || prev.fromDate,
      fromTime: defaultFromTime,
      toDate: defaultFromDate || prev.toDate,
      toTime: defaultToTime,
    }));
    // Intentionally only when serial changes (not when scheduleFromRaw loads) to avoid wiping in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight.slNo, flight.legacySlNo]);

  const syncEquipmentManpowerToServer = async (
    eqList: EquipmentManpowerEntry[],
    mpList: ManpowerEntry[],
    verifyOverride?: { verifiedBy: string; verifiedByCode: string } | null,
  ): Promise<boolean> => {
    const serial = nsFormSerialForFlight(flight);
    if (!serial) return false;
    const api = equipmentManpowerByFlight(serial);
    const rowCount = eqList.length + mpList.length;
    const verified = (verifyOverride?.verifiedBy ?? verifiedBy ?? '').trim();
    const verifiedCode = (
      verifyOverride?.verifiedByCode ??
      verifiedByCode ??
      ''
    ).trim();
    const body: Partial<ServerEquipmentManpowerDoc> & { entries: ServerEquipmentManpowerEntry[] } = {
      listType: 'Equipment',
      flightNo: displayFlightNo || flight.flightNo,
      airlinesOperator: displayAirline || flight.airline,
      entries: [
        ...eqList.map(encodeEquipmentToEntry),
        ...mpList.map(encodeManpowerToEntry),
      ],
    };
    if (rowCount === 0) {
      body.verifiedBy = '';
      body.verifiedByCode = '';
      body.verifiedAt = '';
    } else if (verified) {
      body.verifiedBy = verified;
      body.verifiedByCode = verifiedCode || verified;
      body.verifiedAt = new Date().toISOString();
    }
    try {
      // Always upsert via POST — avoids PATCH 404 when GET returned FHR embed without a real doc.
      const res = await fetch(api.post(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      hasEquipmentManpowerDoc.current = true;
      if (rowCount === 0) {
        setVerifiedBy(null);
        setVerifiedByCode(null);
      }
      onGsdLockStateSaved?.(String(flight.slNo ?? '').trim());
      return true;
    } catch (e) {
      console.error('Sync equipment-manpower failed:', e);
      return false;
    }
  };

  const runSave = async (
    verifyOverride?: { verifiedBy: string; verifiedByCode: string } | null,
  ) => {
    if (!nsFormSerialForFlight(flight)) {
      toast.error('Flight serial is missing; cannot save.');
      return;
    }
    if (entries.length === 0 && manpowerEntries.length === 0) {
      toast.error('Add at least one equipment or manpower entry before saving.');
      return;
    }
    setIsSaving(true);
    setApiError(null);
    try {
      const ok = await syncEquipmentManpowerToServer(
        entries,
        manpowerEntries,
        verifyOverride,
      );
      if (ok) toast.success('Equipment & manpower saved');
      else {
        toast.error('Could not save equipment & manpower');
        setApiError('Save failed. Check your connection and try again.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const staDate = toDisplayDate(scheduleStaDateDisplay(flight, scheduleFromRaw)) || '–';
  const stdDate = toDisplayDate(scheduleStdDateDisplay(flight, scheduleFromRaw)) || '–';
  const routing =
    routingFromMainAndFlight(undefined, mainDetails, flight) || '–';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nsFormSerialForFlight(flight)) {
      toast.error('Flight serial is missing; cannot save.');
      return;
    }
    if (entries.length === 0 && manpowerEntries.length === 0) {
      toast.error('Add at least one equipment or manpower entry before saving.');
      return;
    }
    if (!(verifiedBy ?? '').trim()) {
      pendingSaveAfterVerify.current = true;
      handleVerifiedBy();
      toast.message('Confirm GSD verification to finish saving.');
      return;
    }
    await runSave();
  };

  const handleVerifiedBy = () => {
    const currentUser = getLoggedInUser();
    if (!currentUser) {
      toast.error('No logged-in user found. Please login again.');
      return;
    }
    setShowVerifyModal(true);
    setVerifyUserId(currentUser.userId);
    setVerifyPassword('');
    setVerifyError('');
  };

  const handleVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const currentUser = getLoggedInUser();
    if (!currentUser) {
      setVerifyError('No logged-in user found. Please login again.');
      return;
    }
    if (verifyUserId.trim() !== currentUser.userId) {
      setVerifyError('Verification user must match the current logged-in user.');
      return;
    }
    const pwdErr = required(verifyPassword, 'Password');
    if (verifyFieldErrors.applyAndFocus(pwdErr ? { verifyPassword: pwdErr } : {})) {
      setVerifyError('');
      return;
    }
    const nextVerified = {
      verifiedBy: currentUser.displayName,
      verifiedByCode: currentUser.userId,
    };
    setVerifiedBy(nextVerified.verifiedBy);
    setVerifiedByCode(nextVerified.verifiedByCode);
    setShowVerifyModal(false);
    setVerifyUserId('');
    setVerifyPassword('');
    setVerifyError('');
    verifyFieldErrors.clearAll();
    if (pendingSaveAfterVerify.current) {
      pendingSaveAfterVerify.current = false;
      void runSave(nextVerified);
    }
  };

  const closeVerifyModal = () => {
    setShowVerifyModal(false);
    setVerifyUserId('');
    setVerifyPassword('');
    setVerifyError('');
    verifyFieldErrors.clearAll();
    pendingSaveAfterVerify.current = false;
  };

  const handleDeleteEquipment = async (id: string) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    setIsDeleting(id);
    setApiError(null);
    const newEntries = entries.filter((e) => e.id !== id);
    setEntries(newEntries);
    if (editingId === id) setEditingId(null);
    try {
      const ok = await syncEquipmentManpowerToServer(newEntries, manpowerEntries);
      if (!ok) setApiError('Failed to delete. Please try again.');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleDeleteManpower = async (id: string) => {
    const entry = manpowerEntries.find((e) => e.id === id);
    if (!entry) return;
    setApiError(null);
    const newManpower = manpowerEntries.filter((e) => e.id !== id);
    setManpowerEntries(newManpower);
    if (editingManpowerId === id) setEditingManpowerId(null);
    const ok = await syncEquipmentManpowerToServer(entries, newManpower);
    if (!ok) setApiError('Failed to delete manpower. Please try again.');
  };

  const startEditManpower = (entry: ManpowerEntry) => {
    setEditingManpowerId(entry.id);
    setModalMode('manpower');
    setManpowerFormItem({
      employeeName: entry.employeeName,
      employeeId: entry.employeeId,
      designation: resolveRowDesignation(entry.employeeId, entry.designation),
      place: entry.place,
      fromDate: toDisplayDate(entry.fromDate),
      fromTime: normalizeTimeToHHmm(entry.fromTime),
      toDate: toDisplayDate(entry.toDate),
      toTime: normalizeTimeToHHmm(entry.toTime),
    });
    mpErrors.clearAll();
    setShowAddModal(true);
  };

  const startEditEquipment = (entry: EquipmentManpowerEntry) => {
    setEditingId(entry.id);
    setModalMode('equipment');
    setEquipmentFormItem({
      gseName: entry.equipmentName,
      gseNo: entry.equipmentSerialNo,
      employeeName: entry.employeeName,
      employeeId: entry.employeeId,
      designation: resolveRowDesignation(entry.employeeId, entry.designation),
      fromDate: toDisplayDate(entry.fromDate),
      fromTime: normalizeTimeToHHmm(entry.fromTime),
      toDate: toDisplayDate(entry.toDate),
      toTime: normalizeTimeToHHmm(entry.toTime),
      remarks: normalizeEquipmentRemarks(entry.remarks),
    });
    eqErrors.clearAll();
    setShowAddModal(true);
  };

  const openAddModal = (mode: 'equipment' | 'manpower') => {
    setModalMode(mode);
    setEditingId(null);
    setEditingManpowerId(null);
    const fromTime =
      defaultFromTime ||
      normalizeTimeToHHmm(flightMilestones.ataTime) ||
      '00:00';
    const toTime =
      defaultToTime ||
      normalizeTimeToHHmm(flightMilestones.atdTime) ||
      '00:00';
    const fromDate =
      defaultFromDate ||
      toDisplayDate(flightMilestones.ataDate) ||
      toDisplayDate(flightMilestones.defaultDate) ||
      '';
    const toDate =
      toDisplayDate(flightMilestones.atdDate) || fromDate;
    setEquipmentFormItem({
      gseName: '',
      gseNo: '',
      employeeName: '',
      employeeId: '',
      designation: '',
      fromDate,
      fromTime,
      toDate,
      toTime,
      remarks: '',
    });
    setManpowerFormItem({
      employeeName: '',
      employeeId: '',
      designation: '',
      place: '',
      fromDate,
      fromTime,
      toDate,
      toTime,
    });
    eqErrors.clearAll();
    mpErrors.clearAll();
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setEditingId(null);
    setEditingManpowerId(null);
    eqErrors.clearAll();
    mpErrors.clearAll();
  };

  const saveEquipmentEntry = async () => {
    // Raw schedule times may be "6:05" or "06:05:00" — normalize to HH:mm for validation.
    const period = {
      fromDate: toDisplayDate(equipmentFormItem.fromDate),
      fromTime: equipmentFormItem.fromTime.trim()
        ? normalizeTimeToHHmm(equipmentFormItem.fromTime)
        : '',
      toDate: toDisplayDate(equipmentFormItem.toDate),
      toTime: equipmentFormItem.toTime.trim()
        ? normalizeTimeToHHmm(equipmentFormItem.toTime)
        : '',
    };

    const next: FieldErrors<(typeof EQ_FIELD_ORDER)[number]> = {
      ...validateEntryPeriod(period),
    };
    const gseNameErr = selectRequired(equipmentFormItem.gseName, 'GSE name');
    if (gseNameErr) next.gseName = gseNameErr;
    const gseNoErr = selectRequired(equipmentFormItem.gseNo, 'GSE number');
    if (gseNoErr) next.gseNo = gseNoErr;
    const remarksErr = maxLength(
      equipmentFormItem.remarks,
      EQUIPMENT_REMARKS_MAX,
      'Remarks',
    );
    if (remarksErr) next.remarks = remarksErr;

    if (eqErrors.applyAndFocus(next)) {
      toast.error(firstErrorMessage(EQ_FIELD_ORDER, next));
      return;
    }

    setEquipmentFormItem((p) => ({ ...p, ...period }));

    setIsSaving(true);
    setApiError(null);

    const formItem: EquipmentManpowerEntry = {
      id: editingId || `eq-${nextId++}`,
      equipmentName: equipmentFormItem.gseName,
      equipmentSerialNo: equipmentFormItem.gseNo,
      employeeName: equipmentFormItem.employeeName,
      employeeId: equipmentFormItem.employeeId,
      designation: resolveRowDesignation(
        equipmentFormItem.employeeId,
        equipmentFormItem.designation,
      ),
      fromDate: period.fromDate,
      fromTime: period.fromTime,
      toDate: period.toDate,
      toTime: period.toTime,
      remarks: normalizeEquipmentRemarks(equipmentFormItem.remarks),
      exportedInNav: 'N',
    };

    try {
      let newEntries: EquipmentManpowerEntry[];
      if (editingId) {
        newEntries = entries.map((e) => (e.id === editingId ? { ...formItem, id: e.id } : e));
      } else {
        newEntries = [...entries, formItem];
      }
      setEntries(newEntries);
      closeAddModal();
      const ok = await syncEquipmentManpowerToServer(newEntries, manpowerEntries);
      if (ok) toast.success(editingId ? 'Equipment updated' : 'Equipment added');
      else {
        setApiError('Failed to save. Please try again.');
        toast.error('Could not save equipment to server.');
      }
    } catch (err) {
      setApiError(editingId ? 'Failed to update equipment. Please try again.' : 'Failed to save equipment. Please try again.');
      toast.error('Could not save equipment.');
    } finally {
      setIsSaving(false);
    }
  };

  const saveManpowerEntry = async () => {
    const period = {
      fromDate: toDisplayDate(manpowerFormItem.fromDate),
      fromTime: manpowerFormItem.fromTime.trim()
        ? normalizeTimeToHHmm(manpowerFormItem.fromTime)
        : '',
      toDate: toDisplayDate(manpowerFormItem.toDate),
      toTime: manpowerFormItem.toTime.trim()
        ? normalizeTimeToHHmm(manpowerFormItem.toTime)
        : '',
    };

    const next: FieldErrors<(typeof MP_FIELD_ORDER)[number]> = {
      ...validateEntryPeriod(period),
    };
    if (!manpowerFormItem.employeeName.trim()) {
      next.employeeName = 'Employee name is required.';
    } else if (!manpowerFormItem.employeeId.trim()) {
      next.employeeName = 'Pick an employee from the list so the ID is filled.';
    }
    const placeErr = selectRequired(manpowerFormItem.place, 'place');
    if (placeErr) next.place = placeErr;

    if (mpErrors.applyAndFocus(next)) {
      toast.error(firstErrorMessage(MP_FIELD_ORDER, next));
      return;
    }

    setManpowerFormItem((p) => ({ ...p, ...period }));

    setIsSaving(true);
    setApiError(null);

    const formData: ManpowerEntry = {
      id: editingManpowerId || `mp-${manpowerNextId++}`,
      employeeName: manpowerFormItem.employeeName,
      employeeId: manpowerFormItem.employeeId,
      designation: resolveRowDesignation(
        manpowerFormItem.employeeId,
        manpowerFormItem.designation,
      ),
      place: manpowerFormItem.place,
      fromDate: period.fromDate,
      fromTime: period.fromTime,
      toDate: period.toDate,
      toTime: period.toTime,
    };

    try {
      let newManpower: ManpowerEntry[];
      if (editingManpowerId) {
        newManpower = manpowerEntries.map((e) =>
          e.id === editingManpowerId ? { ...formData, id: e.id } : e
        );
      } else {
        newManpower = [...manpowerEntries, formData];
      }
      setManpowerEntries(newManpower);
      closeAddModal();
      const ok = await syncEquipmentManpowerToServer(entries, newManpower);
      if (ok) toast.success(editingManpowerId ? 'Manpower updated' : 'Manpower added');
      else {
        setApiError('Failed to save. Please try again.');
        toast.error('Could not save manpower to server.');
      }
    } catch (err) {
      setApiError(editingManpowerId ? 'Failed to update manpower. Please try again.' : 'Failed to save manpower. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleManpowerEmployeePick = useCallback(
    (o: SearchableComboOption) => {
      const code = (o.employeeCode ?? '').trim();
      const rec = code ? employeeMapByCode.get(code.toLowerCase()) : undefined;
      setManpowerFormItem((p) => ({
        ...p,
        employeeId: code,
        employeeName: (o.employeeName ?? rec?.employeeName ?? o.label).trim(),
        designation: rec?.designation ?? '',
      }));
    },
    [employeeMapByCode],
  );

  const handleEquipmentEmployeePick = useCallback(
    (o: SearchableComboOption) => {
      const code = (o.employeeCode ?? '').trim();
      const rec = code ? employeeMapByCode.get(code.toLowerCase()) : undefined;
      setEquipmentFormItem((p) => ({
        ...p,
        employeeId: code,
        employeeName: (o.employeeName ?? rec?.employeeName ?? o.label).trim(),
        designation: rec?.designation ?? '',
      }));
    },
    [employeeMapByCode],
  );

  /** Land the caret on the first editable control when the entry modal opens. */
  useEffect(() => {
    if (!showAddModal) return;
    const focusId = modalMode === 'equipment' ? 'field-gseName' : 'field-employeeName';
    const frame = requestAnimationFrame(() => document.getElementById(focusId)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [showAddModal, modalMode]);

  /** Esc closes the entry modal; background scroll is locked while it is open. */
  useEffect(() => {
    if (!showAddModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isSaving) return;
      // Let the date / time popovers consume Escape first.
      if (document.querySelector('[data-datepicker-panel], [aria-label="Select time"]')) return;
      closeAddModal();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddModal, isSaving]);

  const equipmentDuration = useMemo(
    () =>
      scheduleDurationHhMm(
        parseScheduleDateTime(equipmentFormItem.fromDate, equipmentFormItem.fromTime),
        parseScheduleDateTime(equipmentFormItem.toDate, equipmentFormItem.toTime),
      ),
    [
      equipmentFormItem.fromDate,
      equipmentFormItem.fromTime,
      equipmentFormItem.toDate,
      equipmentFormItem.toTime,
    ],
  );

  const manpowerDuration = useMemo(
    () =>
      scheduleDurationHhMm(
        parseScheduleDateTime(manpowerFormItem.fromDate, manpowerFormItem.fromTime),
        parseScheduleDateTime(manpowerFormItem.toDate, manpowerFormItem.toTime),
      ),
    [
      manpowerFormItem.fromDate,
      manpowerFormItem.fromTime,
      manpowerFormItem.toDate,
      manpowerFormItem.toTime,
    ],
  );

  const inputBase = 'w-full px-3 py-2 border rounded-lg text-sm outline-none transition-all';
  const inputReadOnlyClass = `${inputBase} border-gray-200 bg-gray-100 text-gray-700 cursor-default`;
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1';
  const selectClass = `${inputBase} border-gray-300 bg-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500`;

  return (
    <div className={`${FLIGHT_DETAILS_FORM_ROOT_CLASS} min-h-0`}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 bg-emerald-600 px-3 py-3 text-white sm:px-4">
          <h2 className="text-base font-semibold sm:text-lg">Ad-Hoc Equipments & Manpower</h2>
          <span className="text-xs text-emerald-100 sm:text-sm">
            Serial No :{' '}
            <span className="font-medium text-red-300">{displayScheduledAirlinesTableSerial(flight)}</span>
          </span>
        </div>

        <form onSubmit={handleSave} className={FLIGHT_DETAILS_FORM_BODY_CLASS}>
          {/* Flight details read-only */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            <div>
              <label className={labelClass}>Airlines/Operator</label>
              <input type="text" value={displayAirline || ''} readOnly className={inputReadOnlyClass} />
            </div>
            <div>
              <label className={labelClass}>Flight No.</label>
              <input type="text" value={displayFlightNo || ''} readOnly className={inputReadOnlyClass} />
            </div>
            <div>
              <label className={labelClass}>Routing</label>
              <input type="text" value={routing} readOnly className={inputReadOnlyClass} />
            </div>
            <div>
              <label className={labelClass}>Operations</label>
              <input type="text" value={flight.flightType || 'Turnaround'} readOnly className={inputReadOnlyClass} />
            </div>
            <div>
              <label className={labelClass}>A/C Type</label>
              <input type="text" value={displayAircraft || ''} readOnly className={inputReadOnlyClass} />
            </div>
            <div>
              <label className={labelClass}>STA</label>
              <input type="text" value={scheduleStaTimeRawDisplay(flight, scheduleFromRaw) || '–'} readOnly className={inputReadOnlyClass} />
            </div>
            <div>
              <label className={labelClass}>STA Date</label>
              <input type="text" value={staDate} readOnly className={inputReadOnlyClass} />
            </div>
            <div>
              <label className={labelClass}>STD</label>
              <input type="text" value={scheduleStdTimeRawDisplay(flight, scheduleFromRaw) || '–'} readOnly className={inputReadOnlyClass} />
            </div>
            <div>
              <label className={labelClass}>STD Date</label>
              <input type="text" value={stdDate} readOnly className={inputReadOnlyClass} />
            </div>
            <div>
              <label className={labelClass}>ATD Date</label>
              <input type="text" value={stdDate} readOnly className={inputReadOnlyClass} />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-70"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={handleVerifiedBy}
              className="px-4 py-2 rounded-lg bg-cyan-500 text-white text-sm font-medium hover:bg-cyan-600"
            >
              Verified By
            </button>
          </div>

          {/* Verification line */}
          <p className="text-sm text-red-600">
            {verifiedBy
              ? `This is electronically sign / verified by GSD incharge ${verifiedBy} ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`
              : 'This is electronically sign / verified by GSD incharge —'}
          </p>

          {/* API Error Display */}
          {apiError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between">
              <span className="text-sm">{apiError}</span>
              <button
                type="button"
                onClick={() => setApiError(null)}
                className="text-red-500 hover:text-red-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Add Equipment & Add Manpower buttons */}
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={() => openAddModal('equipment')}
              className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 flex items-center gap-2"
            >
              <Wrench className="w-4 h-4" />
              Add Equipment
            </button>
            <button
              type="button"
              onClick={() => openAddModal('manpower')}
              className="px-4 py-2 rounded-lg bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 flex items-center gap-2"
            >
              <Users className="w-4 h-4" />
              Add Manpower
            </button>
          </div>

          {/* Equipment table */}
          <div className={`${FLIGHT_DETAILS_SECTION_CLASS} overflow-hidden p-0`}>
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-800">Equipment (GSE) List</h3>
              <span className="text-xs text-gray-500">{entries.length} entries</span>
            </div>
            <div className={FLIGHT_DETAILS_H_SCROLL_CLASS}>
              <table className="w-full min-w-[64rem] text-sm">
                <thead>
                  <tr className="bg-emerald-600 text-white">
                    <th className="text-left p-3 font-semibold">GSE Name</th>
                    <th className="text-left p-3 font-semibold">GSE No.</th>
                    <th className="text-left p-3 font-semibold">Employee Name</th>
                    <th className="text-left p-3 font-semibold">Employee ID</th>
                    <th className="text-left p-3 font-semibold">Designation</th>
                    <th className="text-left p-3 font-semibold">From</th>
                    <th className="text-left p-3 font-semibold">To</th>
                    <th className="text-left p-3 font-semibold">Duration</th>
                    <th className="text-left p-3 font-semibold min-w-[8rem]">Remarks</th>
                    <th className="text-left p-3 font-semibold w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-3 text-gray-900 font-medium">{entry.equipmentName || '–'}</td>
                      <td className="p-3 text-gray-700">{entry.equipmentSerialNo || '–'}</td>
                      <td className="p-3 text-gray-700">{entry.employeeName || '–'}</td>
                      <td className="p-3 text-gray-700">{entry.employeeId || '–'}</td>
                      <td className="p-3 text-gray-700">
                        {resolveRowDesignation(entry.employeeId, entry.designation) || '–'}
                      </td>
                      <td className="p-3 text-gray-700 text-xs">{entry.fromDate} {entry.fromTime}</td>
                      <td className="p-3 text-gray-700 text-xs">{entry.toDate} {entry.toTime}</td>
                      <td className="p-3 text-gray-700">{computeRemarks(entry)}</td>
                      <td className="p-3 text-gray-700 whitespace-pre-wrap break-words">
                        {normalizeEquipmentRemarks(entry.remarks) || '–'}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startEditEquipment(entry)}
                            className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEquipment(entry.id)}
                            disabled={isDeleting === entry.id}
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete"
                          >
                            {isDeleting === entry.id ? (
                              <span className="w-4 h-4 block border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {entries.length === 0 && (
              <div className="p-6 text-center text-gray-500 text-sm">
                No equipment entries. Click <span className="font-medium text-blue-600">Add Equipment</span> to add.
              </div>
            )}
          </div>

          {/* Manpower table */}
          <div className={`${FLIGHT_DETAILS_SECTION_CLASS} overflow-hidden p-0`}>
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-800">Manpower List</h3>
              <span className="text-xs text-gray-500">{manpowerEntries.length} entries</span>
            </div>
            <div className={FLIGHT_DETAILS_H_SCROLL_CLASS}>
              <table className="w-full min-w-[44rem] text-sm">
                <thead>
                  <tr className="bg-indigo-600 text-white">
                    <th className="text-left p-3 font-semibold">Employee Name</th>
                    <th className="text-left p-3 font-semibold">Employee ID</th>
                    <th className="text-left p-3 font-semibold">Designation</th>
                    <th className="text-left p-3 font-semibold">Place</th>
                    <th className="text-left p-3 font-semibold">From</th>
                    <th className="text-left p-3 font-semibold">To</th>
                    <th className="text-left p-3 font-semibold w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {manpowerEntries.map((entry) => (
                    <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-3 text-gray-900 font-medium">{entry.employeeName || '–'}</td>
                      <td className="p-3 text-gray-700">{entry.employeeId || '–'}</td>
                      <td className="p-3 text-gray-700">
                        {resolveRowDesignation(entry.employeeId, entry.designation) || '–'}
                      </td>
                      <td className="p-3 text-gray-700 capitalize">{entry.place}</td>
                      <td className="p-3 text-gray-700 text-xs">{entry.fromDate} {entry.fromTime}</td>
                      <td className="p-3 text-gray-700 text-xs">{entry.toDate} {entry.toTime}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startEditManpower(entry)}
                            className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteManpower(entry.id)}
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {manpowerEntries.length === 0 && (
              <div className="p-6 text-center text-gray-500 text-sm">
                No manpower entries. Click <span className="font-medium text-indigo-600">Add Manpower</span> to add.
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Add/Edit Equipment Modal — portaled so Open sidebar transform/overflow cannot clip it */}
      {showAddModal &&
        modalMode === 'equipment' &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="equipment-add-modal-title"
          >
            <div className="absolute inset-0 bg-black/50" onClick={closeAddModal} aria-hidden />
            <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 py-4 sm:px-6">
                <div>
                  <h3 id="equipment-add-modal-title" className="text-lg font-semibold text-gray-900">
                    {editingId ? 'Edit Equipment' : 'Add Equipment'}
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Fields marked <span className="text-red-500">*</span> are required. Times use 24-hour format.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeAddModal}
                  aria-label="Close"
                  className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-gray-100"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass} htmlFor="field-gseName">
                      GSE Name <span className="text-red-500">*</span>
                    </label>
                    <AdminRadioDropdown
                      id="field-gseName"
                      value={equipmentFormItem.gseName}
                      onChange={(v) => {
                        setEquipmentFormItem((p) => ({ ...p, gseName: v, gseNo: '' }));
                        eqErrors.clearField('gseName');
                      }}
                      options={uniqueGseNames}
                      placeholder="-- Select GSE --"
                      aria-invalid={Boolean(eqErrors.errors.gseName)}
                      aria-describedby={eqErrors.errors.gseName ? 'field-gseName-error' : undefined}
                      className={cn(selectClass, eqErrors.errors.gseName && FRIS_INVALID_CONTROL)}
                    />
                    <FormFieldError id="field-gseName-error" message={eqErrors.errors.gseName} />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="field-gseNo">
                      GSE No. <span className="text-red-500">*</span>
                    </label>
                    <AdminRadioDropdown
                      id="field-gseNo"
                      value={equipmentFormItem.gseNo}
                      onChange={(v) => {
                        setEquipmentFormItem((p) => ({ ...p, gseNo: v }));
                        eqErrors.clearField('gseNo');
                      }}
                      options={gseSerialsByName.get(equipmentFormItem.gseName) ?? []}
                      placeholder={
                        equipmentFormItem.gseName ? '-- Select GSE No. --' : 'Select GSE name first'
                      }
                      disabled={!equipmentFormItem.gseName}
                      aria-invalid={Boolean(eqErrors.errors.gseNo)}
                      aria-describedby={eqErrors.errors.gseNo ? 'field-gseNo-error' : undefined}
                      className={cn(selectClass, eqErrors.errors.gseNo && FRIS_INVALID_CONTROL)}
                    />
                    <FormFieldError id="field-gseNo-error" message={eqErrors.errors.gseNo} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <SearchableCombobox
                      fieldLabel="Employee Name"
                      value={equipmentFormItem.employeeName}
                      onChange={(v) => {
                        const rec = employeeMapByNameNorm.get(v.trim().toLowerCase());
                        if (rec) {
                          setEquipmentFormItem((p) => ({
                            ...p,
                            employeeName: rec.employeeName,
                            employeeId: rec.employeeCode,
                            designation: rec.designation || '',
                          }));
                          return;
                        }
                        setEquipmentFormItem((p) => ({
                          ...p,
                          employeeName: v,
                          employeeId: '',
                          designation: '',
                        }));
                      }}
                      onPickOption={handleEquipmentEmployeePick}
                      options={equipmentEmployeeComboOptions}
                      loading={staffLoading}
                      placeholder={
                        !equipmentFormItem.gseName || !equipmentFormItem.gseNo
                          ? 'Select GSE name and number first…'
                          : staffLoading
                            ? 'Loading staff…'
                            : equipmentEmployeeComboOptions.length === 0
                              ? 'No staff found — add in Advance → Gateway → Staff'
                              : 'Search by employee name or code…'
                      }
                      onRequestOptions={loadStaffIfNeeded}
                      matchFromStart
                      className={
                        !equipmentFormItem.gseName || !equipmentFormItem.gseNo
                          ? 'pointer-events-none opacity-60'
                          : ''
                      }
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Employee ID</label>
                    <input
                      type="text"
                      value={equipmentFormItem.employeeId}
                      readOnly
                      className={inputReadOnlyClass}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Designation</label>
                  <input
                    type="text"
                    value={resolveRowDesignation(
                      equipmentFormItem.employeeId,
                      equipmentFormItem.designation,
                    )}
                    readOnly
                    className={inputReadOnlyClass}
                  />
                </div>

                <fieldset className="rounded-lg border border-gray-200 p-3 sm:p-4">
                  <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Engagement period
                  </legend>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                    <div>
                      <label className={labelClass} htmlFor="field-fromDate">
                        From Date <span className="text-red-500">*</span>
                      </label>
                      <div className={cn(eqErrors.errors.fromDate && FRIS_INVALID_PICKER_WRAP)}>
                        <DatePicker
                          id="field-fromDate"
                          value={equipmentFormItem.fromDate}
                          onChange={(v) => {
                            setEquipmentFormItem((p) => ({ ...p, fromDate: v }));
                            eqErrors.clearField('fromDate');
                          }}
                          valueFormat="dd/MM/yyyy"
                          className="w-full"
                        />
                      </div>
                      <FormFieldError id="field-fromDate-error" message={eqErrors.errors.fromDate} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="field-fromTime">
                        From Time (24h) <span className="text-red-500">*</span>
                      </label>
                      <TimeSelect24
                        hourSelectId="field-fromTime"
                        value={equipmentFormItem.fromTime}
                        onChange={(v) => {
                          setEquipmentFormItem((p) => ({ ...p, fromTime: v }));
                          eqErrors.clearField('fromTime');
                        }}
                        className={cn('w-full min-h-[42px]', eqErrors.errors.fromTime && FRIS_INVALID_CONTROL)}
                      />
                      <FormFieldError id="field-fromTime-error" message={eqErrors.errors.fromTime} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="field-toDate">
                        To Date <span className="text-red-500">*</span>
                      </label>
                      <div className={cn(eqErrors.errors.toDate && FRIS_INVALID_PICKER_WRAP)}>
                        <DatePicker
                          id="field-toDate"
                          value={equipmentFormItem.toDate}
                          onChange={(v) => {
                            setEquipmentFormItem((p) => ({ ...p, toDate: v }));
                            eqErrors.clearField('toDate');
                          }}
                          valueFormat="dd/MM/yyyy"
                          minDate={parseScheduleDateTime(equipmentFormItem.fromDate, '00:00') ?? undefined}
                          className="w-full"
                        />
                      </div>
                      <FormFieldError id="field-toDate-error" message={eqErrors.errors.toDate} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="field-toTime">
                        To Time (24h) <span className="text-red-500">*</span>
                      </label>
                      <TimeSelect24
                        hourSelectId="field-toTime"
                        value={equipmentFormItem.toTime}
                        onChange={(v) => {
                          setEquipmentFormItem((p) => ({ ...p, toTime: v }));
                          eqErrors.clearField('toTime');
                        }}
                        className={cn('w-full min-h-[42px]', eqErrors.errors.toTime && FRIS_INVALID_CONTROL)}
                      />
                      <FormFieldError id="field-toTime-error" message={eqErrors.errors.toTime} />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-gray-500" aria-live="polite">
                    Duration:{' '}
                    <span className="font-semibold tabular-nums text-gray-800">
                      {equipmentDuration ?? '—'}
                    </span>
                  </p>
                </fieldset>

                <div>
                  <label className={labelClass} htmlFor="field-remarks">
                    Remarks
                  </label>
                  <textarea
                    id="field-remarks"
                    value={equipmentFormItem.remarks}
                    onChange={(e) => {
                      setEquipmentFormItem((p) => ({ ...p, remarks: e.target.value }));
                      eqErrors.clearField('remarks');
                    }}
                    rows={3}
                    maxLength={EQUIPMENT_REMARKS_MAX}
                    placeholder="Optional notes for GSE report…"
                    aria-invalid={Boolean(eqErrors.errors.remarks)}
                    aria-describedby={
                      eqErrors.errors.remarks ? 'field-remarks-error' : undefined
                    }
                    className={cn(
                      selectClass,
                      'resize-y min-h-[80px]',
                      eqErrors.errors.remarks && FRIS_INVALID_CONTROL,
                    )}
                  />
                  <FormFieldError id="field-remarks-error" message={eqErrors.errors.remarks} />
                </div>
              </div>

              <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-gray-200 px-4 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:px-6">
                <button
                  type="button"
                  onClick={closeAddModal}
                  disabled={isSaving}
                  className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEquipmentEntry}
                  disabled={isSaving}
                  className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving && <span className="w-4 h-4 block border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {isSaving ? 'Saving…' : editingId ? 'Update' : 'Add Equipment'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Add Manpower Modal — portaled (same sidebar clipping issue) */}
      {showAddModal &&
        modalMode === 'manpower' &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manpower-add-modal-title"
          >
            <div className="absolute inset-0 bg-black/50" onClick={closeAddModal} aria-hidden />
            <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 py-4 sm:px-6">
                <div>
                  <h3 id="manpower-add-modal-title" className="text-lg font-semibold text-gray-900">
                    {editingManpowerId ? 'Edit Manpower' : 'Add Manpower'}
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Fields marked <span className="text-red-500">*</span> are required. Times use 24-hour format.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeAddModal}
                  aria-label="Close"
                  className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-gray-100"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
                <div>
                  <SearchableCombobox
                    fieldLabel="Employee Name *"
                    value={manpowerFormItem.employeeName}
                    onChange={(v) => {
                      const rec = employeeMapByNameNorm.get(v.trim().toLowerCase());
                      mpErrors.clearField('employeeName');
                      if (rec) {
                        setManpowerFormItem((p) => ({
                          ...p,
                          employeeName: rec.employeeName,
                          employeeId: rec.employeeCode,
                          designation: rec.designation,
                        }));
                        return;
                      }
                      setManpowerFormItem((p) => ({
                        ...p,
                        employeeName: v,
                        employeeId: '',
                        designation: '',
                      }));
                    }}
                    onPickOption={handleManpowerEmployeePick}
                    options={manpowerNameComboOptions}
                    loading={staffLoading}
                    invalid={Boolean(mpErrors.errors.employeeName)}
                    inputProps={{ id: 'field-employeeName' }}
                    placeholder={
                      staffLoading
                        ? 'Loading staff…'
                        : manpowerNameComboOptions.length === 0
                          ? 'No staff found — add in Advance → Gateway → Staff'
                          : 'Search by employee name or code…'
                    }
                    onRequestOptions={loadStaffIfNeeded}
                    matchFromStart
                  />
                  <FormFieldError
                    id="field-employeeName-error"
                    message={mpErrors.errors.employeeName}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Employee ID</label>
                    <input type="text" value={manpowerFormItem.employeeId} readOnly className={inputReadOnlyClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Designation</label>
                    <input
                      type="text"
                      value={resolveRowDesignation(
                        manpowerFormItem.employeeId,
                        manpowerFormItem.designation,
                      )}
                      readOnly
                      className={inputReadOnlyClass}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass} htmlFor="field-place">
                    Place <span className="text-red-500">*</span>
                  </label>
                  <AdminRadioDropdown
                    id="field-place"
                    value={manpowerFormItem.place}
                    onChange={(v) => {
                      setManpowerFormItem((p) => ({
                        ...p,
                        place: v === 'terminal' || v === 'ramp' ? v : '',
                      }));
                      mpErrors.clearField('place');
                    }}
                    options={[
                      { value: 'terminal', label: 'Terminal' },
                      { value: 'ramp', label: 'Ramp' },
                    ]}
                    placeholder="Select place"
                    aria-invalid={Boolean(mpErrors.errors.place)}
                    aria-describedby={mpErrors.errors.place ? 'field-place-error' : undefined}
                    className={cn(selectClass, mpErrors.errors.place && FRIS_INVALID_CONTROL)}
                  />
                  <FormFieldError id="field-place-error" message={mpErrors.errors.place} />
                </div>

                <fieldset className="rounded-lg border border-gray-200 p-3 sm:p-4">
                  <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Duty period
                  </legend>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                    <div>
                      <label className={labelClass} htmlFor="field-fromDate">
                        From Date <span className="text-red-500">*</span>
                      </label>
                      <div className={cn(mpErrors.errors.fromDate && FRIS_INVALID_PICKER_WRAP)}>
                        <DatePicker
                          id="field-fromDate"
                          value={manpowerFormItem.fromDate}
                          onChange={(v) => {
                            setManpowerFormItem((p) => ({ ...p, fromDate: v }));
                            mpErrors.clearField('fromDate');
                          }}
                          valueFormat="dd/MM/yyyy"
                          className="w-full"
                        />
                      </div>
                      <FormFieldError id="field-fromDate-error" message={mpErrors.errors.fromDate} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="field-fromTime">
                        From Time (24h) <span className="text-red-500">*</span>
                      </label>
                      <TimeSelect24
                        hourSelectId="field-fromTime"
                        value={manpowerFormItem.fromTime}
                        onChange={(v) => {
                          setManpowerFormItem((p) => ({ ...p, fromTime: v }));
                          mpErrors.clearField('fromTime');
                        }}
                        className={cn('w-full min-h-[42px]', mpErrors.errors.fromTime && FRIS_INVALID_CONTROL)}
                      />
                      <FormFieldError id="field-fromTime-error" message={mpErrors.errors.fromTime} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="field-toDate">
                        To Date <span className="text-red-500">*</span>
                      </label>
                      <div className={cn(mpErrors.errors.toDate && FRIS_INVALID_PICKER_WRAP)}>
                        <DatePicker
                          id="field-toDate"
                          value={manpowerFormItem.toDate}
                          onChange={(v) => {
                            setManpowerFormItem((p) => ({ ...p, toDate: v }));
                            mpErrors.clearField('toDate');
                          }}
                          valueFormat="dd/MM/yyyy"
                          minDate={parseScheduleDateTime(manpowerFormItem.fromDate, '00:00') ?? undefined}
                          className="w-full"
                        />
                      </div>
                      <FormFieldError id="field-toDate-error" message={mpErrors.errors.toDate} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="field-toTime">
                        To Time (24h) <span className="text-red-500">*</span>
                      </label>
                      <TimeSelect24
                        hourSelectId="field-toTime"
                        value={manpowerFormItem.toTime}
                        onChange={(v) => {
                          setManpowerFormItem((p) => ({ ...p, toTime: v }));
                          mpErrors.clearField('toTime');
                        }}
                        className={cn('w-full min-h-[42px]', mpErrors.errors.toTime && FRIS_INVALID_CONTROL)}
                      />
                      <FormFieldError id="field-toTime-error" message={mpErrors.errors.toTime} />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-gray-500" aria-live="polite">
                    Duration:{' '}
                    <span className="font-semibold tabular-nums text-gray-800">
                      {manpowerDuration ?? '—'}
                    </span>
                  </p>
                </fieldset>
              </div>

              <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-gray-200 px-4 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:px-6">
                <button
                  type="button"
                  onClick={closeAddModal}
                  disabled={isSaving}
                  className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveManpowerEntry}
                  disabled={isSaving}
                  className="flex items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving && <span className="w-4 h-4 block border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {isSaving ? 'Saving…' : editingManpowerId ? 'Update' : 'Add Manpower'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Verification confirmation modal — portaled */}
      {showVerifyModal &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="equipment-verify-modal-title"
          >
            <div className="absolute inset-0 bg-black/50" onClick={closeVerifyModal} aria-hidden />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6 border border-gray-200">
              <h3 id="equipment-verify-modal-title" className="text-lg font-semibold text-gray-900 mb-4">
                Verification
              </h3>
              <form onSubmit={handleVerifySubmit} className="space-y-4">
                <div>
                  <label htmlFor="verify-userid" className="block text-sm font-medium text-gray-700 mb-1">
                    User ID
                  </label>
                  <input
                    id="verify-userid"
                    type="text"
                    value={verifyUserId}
                    onChange={(e) => { setVerifyUserId(e.target.value); setVerifyError(''); }}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                    placeholder="Current logged-in user"
                    autoComplete="username"
                  />
                </div>
                <div>
                  <label htmlFor="field-verifyPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <input
                    id="field-verifyPassword"
                    type="password"
                    value={verifyPassword}
                    onChange={(e) => {
                      setVerifyPassword(e.target.value);
                      setVerifyError('');
                      verifyFieldErrors.clearField('verifyPassword');
                    }}
                    aria-invalid={Boolean(verifyFieldErrors.errors.verifyPassword)}
                    className={cn(
                      'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500',
                      verifyFieldErrors.errors.verifyPassword && FRIS_INVALID_CONTROL,
                    )}
                    placeholder="Enter Password"
                    autoComplete="current-password"
                  />
                  <FormFieldError
                    id="field-verifyPassword-error"
                    message={verifyFieldErrors.errors.verifyPassword}
                  />
                </div>
                {verifyError && (
                  <p className="text-sm text-red-600">{verifyError}</p>
                )}
                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={closeVerifyModal}
                    className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600"
                  >
                    Confirm
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
