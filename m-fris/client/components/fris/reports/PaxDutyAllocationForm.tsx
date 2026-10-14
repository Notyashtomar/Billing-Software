'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  ClipboardList,
  Plane,
  Users,
  UserPlus,
  ArrowLeft,
  Check,
  Edit2,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';
import { DatePicker } from '@/components/ui/DatePicker';
import { SearchableCombobox } from '@/components/ui/SearchableCombobox';
import type { SearchableComboOption } from '@/components/ui/SearchableCombobox';
import { toast } from 'sonner';
import type { PaxDutyAllocationRecord, StaffAssignmentRecord } from '@/lib/paxDutyAllocationStorage';
import {
  createPaxDutyAllocation,
  fetchAdvanceGatewayStaff,
  fetchAdvanceScheduleSetupMasters,
  updatePaxDutyAllocation,
  type AdvanceGatewayStaffRow,
} from '@/lib/api';
import { getScheduleMasterFlightNo } from '@/components/fris/advance/scheduleAirlineViewModel';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_CONTROL,
  FRIS_INVALID_PICKER_WRAP,
  required,
  selectRequired,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';
import {
  DutyChipList,
  GLASS_CARD_CLASS,
  EMERALD_HEADER_CLASS,
  getDutyBadgeStyle,
  getDutySelectedChipClass,
} from './paxDutyAllocationUi';

const SHIFT_OPTIONS = ['— Select —', 'Day', 'Night', 'Morning', 'Evening', 'General'] as const;
const DUTY_FORM_FIELD_ORDER = ['date', 'shift', 'staff'] as const;
type DutyFormField = (typeof DUTY_FORM_FIELD_ORDER)[number];

type AirlineOption = { id: string; name: string; code: string };
type AirlineFlightNoRow = { airline: string; airlineCode: string; flightNo: string };

function getStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
}

/** Airlines and flight numbers from `advance_schedule_setup` master rows. */
function parseAdvanceScheduleSetupMasters(raw: unknown[]): {
  airlines: AirlineOption[];
  flightRows: AirlineFlightNoRow[];
} {
  const airlineByKey = new Map<string, AirlineOption>();
  const flightRows: AirlineFlightNoRow[] = [];
  const flightDedupe = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const doc = item as Record<string, unknown>;
    const data =
      doc.data && typeof doc.data === 'object' ? (doc.data as Record<string, unknown>) : doc;

    const airline = getStr(data, 'airline', 'Airline');
    const airlineCode = getStr(data, 'airlineCode', 'Airline Code');
    const flightNo = getScheduleMasterFlightNo(data);

    if (airline) {
      const key = airline.toLowerCase();
      const existing = airlineByKey.get(key);
      if (!existing) {
        airlineByKey.set(key, { id: airline, name: airline, code: airlineCode });
      } else if (airlineCode && !existing.code) {
        existing.code = airlineCode;
      }
    }

    if (flightNo) {
      const dedupeKey = `${airline.toLowerCase()}|${airlineCode.toLowerCase()}|${flightNo}`;
      if (!flightDedupe.has(dedupeKey)) {
        flightDedupe.add(dedupeKey);
        flightRows.push({ airline, airlineCode, flightNo });
      }
    }
  }

  const airlines = Array.from(airlineByKey.values()).sort((a, b) =>
    (a.name || a.code).localeCompare(b.name || b.code),
  );
  return { airlines, flightRows };
}

export const DUTY_ALLOCATION_OPTIONS = [
  '— Select —',
  'Check-in',
  'Gate',
  'Ramp',
  'Supervisor',
  'Arrival hall',
  'Departure hall',
  'Baggage',
  'Reservation',
  'CLC',
  'Other',
] as const;

/** Quick-select chips on new/edit allocation — keep in sync with badge styles in paxDutyAllocationUi. */
export const QUICK_DUTY_CHIPS = [
  'Check-in',
  'Gate',
  'Ramp',
  'Supervisor',
  'Arrival hall',
  'Departure hall',
  'Baggage',
  'Reservation',
  'CLC',
] as const;

const QUICK_DUTY_SET = new Set<string>(QUICK_DUTY_CHIPS);

function localCalendarYmd(d = new Date()): string {
  const cal = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return `${cal.getFullYear()}-${String(cal.getMonth() + 1).padStart(2, '0')}-${String(cal.getDate()).padStart(2, '0')}`;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `pda-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function filledDutiesFrom(rows: string[]): string[] {
  return rows.map((d) => d.trim()).filter((d) => d && d !== '— Select —');
}

const inputSelectClass =
  'w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';

export type PaxDutyAllocationFormProps = {
  mode: 'create' | 'edit';
  recordId?: string;
  initial?: Partial<PaxDutyAllocationRecord>;
  onBack: () => void;
  onSaved?: () => void;
};

type CommittedStaffRow = StaffAssignmentRecord & { clientKey: string };

function staffDisplayFromPick(name: string, code: string): string {
  const n = name.trim();
  const c = code.trim();
  if (n && c) return `${n} (${c})`;
  return n || c;
}

function resolveEmployeeMetaByLabel(
  options: AdvanceGatewayStaffRow[],
  label: string,
): { employeeCode: string; employeeName: string } | null {
  const q = label.trim().toLowerCase();
  if (!q) return null;
  const found = options.find((e) => {
    const name = String(e.employeeName ?? '').trim().toLowerCase();
    const code = String(e.employeeCode ?? '').trim().toLowerCase();
    return (
      q === name ||
      q === code ||
      q === `${name} (${code})` ||
      q === `${code} — ${name}` ||
      q === `${code} - ${name}`
    );
  });
  if (!found) return null;
  return {
    employeeCode: String(found.employeeCode ?? '').trim(),
    employeeName: String(found.employeeName ?? '').trim(),
  };
}

export default function PaxDutyAllocationForm({
  mode,
  recordId,
  initial,
  onBack,
  onSaved,
}: PaxDutyAllocationFormProps) {
  const [date, setDate] = useState(initial?.date ?? localCalendarYmd());
  const [shift, setShift] = useState(initial?.shift ?? '');
  const [flight, setFlight] = useState(initial?.flight ?? '');
  const [flightNo, setFlightNo] = useState(initial?.flightNo ?? '');

  const [staff, setStaff] = useState('');
  const [staffCode, setStaffCode] = useState('');
  const [staffName, setStaffName] = useState('');
  const [dutyAllocations, setDutyAllocations] = useState<string[]>([]);

  const [committedStaff, setCommittedStaff] = useState<CommittedStaffRow[]>([]);
  const [editingLine, setEditingLine] = useState(false);
  const [saving, setSaving] = useState(false);
  const { errors, clearField, applyAndFocus } = useFieldErrors<DutyFormField>(DUTY_FORM_FIELD_ORDER);
  const composerRef = useRef<HTMLDivElement>(null);
  const editingSnapshotRef = useRef<CommittedStaffRow | null>(null);

  const [airlineOptions, setAirlineOptions] = useState<AirlineOption[]>([]);
  const [airlineFlightNos, setAirlineFlightNos] = useState<AirlineFlightNoRow[]>([]);
  const [scheduleSetupLoading, setScheduleSetupLoading] = useState(false);
  const [scheduleSetupLoaded, setScheduleSetupLoaded] = useState(false);
  const scheduleSetupInFlight = useRef(false);

  const loadScheduleSetupIfNeeded = useCallback(async () => {
    if (scheduleSetupLoaded || scheduleSetupInFlight.current) return;
    scheduleSetupInFlight.current = true;
    setScheduleSetupLoading(true);
    try {
      const raw = await fetchAdvanceScheduleSetupMasters();
      const { airlines, flightRows } = parseAdvanceScheduleSetupMasters(raw);
      setAirlineOptions(airlines);
      setAirlineFlightNos(flightRows);
      setScheduleSetupLoaded(true);
      if (!airlines.length && !flightRows.length) {
        toast.message('No schedule setup rows found. Add flights under Advance → Schedule Setup first.');
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Failed to load airlines and flight numbers from schedule setup',
      );
    } finally {
      scheduleSetupInFlight.current = false;
      setScheduleSetupLoading(false);
    }
  }, [scheduleSetupLoaded]);

  const [employeeOptions, setEmployeeOptions] = useState<AdvanceGatewayStaffRow[]>([]);
  const [employeesLoaded, setEmployeesLoaded] = useState(false);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const employeesInFlight = useRef(false);

  const loadEmployeesIfNeeded = useCallback(async () => {
    if (employeesLoaded || employeesInFlight.current) return;
    employeesInFlight.current = true;
    setEmployeesLoading(true);
    try {
      const list = await fetchAdvanceGatewayStaff();
      setEmployeeOptions(list);
      setEmployeesLoaded(true);
      if (!list.length) {
        toast.message(
          'No staff for this station. Add people under Advance → Gateway → Staff, then reopen this form.',
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load station staff');
    } finally {
      employeesInFlight.current = false;
      setEmployeesLoading(false);
    }
  }, [employeesLoaded]);

  useEffect(() => {
    void loadScheduleSetupIfNeeded();
  }, [loadScheduleSetupIfNeeded]);

  useEffect(() => {
    if (mode !== 'edit') return;
    if (!initial?.flight?.trim()) return;
    void loadScheduleSetupIfNeeded();
  }, [mode, initial?.flight, loadScheduleSetupIfNeeded]);

  useEffect(() => {
    void loadEmployeesIfNeeded();
  }, [loadEmployeesIfNeeded]);

  useEffect(() => {
    if (mode !== 'edit') return;
    const rows = initial?.staffAssignments;
    if (!rows?.length) return;
    setCommittedStaff(
      rows.map((s) => ({
        clientKey: newId(),
        staff: s.staff,
        employeeCode: s.employeeCode ?? '',
        employeeName: s.employeeName ?? '',
        dutyAllocations: [...s.dutyAllocations],
      })),
    );
  }, [mode, recordId, initial?.staffAssignments]);

  const flightComboOptions = useMemo(() => {
    const base = airlineOptions.map((a) => {
      const label = (a.name || a.code).trim();
      return {
        id: a.id,
        label,
        description: a.name && a.code ? `Code: ${a.code}` : undefined,
        searchIndex: `${a.name} ${a.code}`.toLowerCase(),
      };
    });
    const f = flight.trim();
    if (f && !base.some((o) => o.label === f)) {
      return [{ id: '__saved-flight', label: f, description: 'Saved value', searchIndex: f.toLowerCase() }, ...base];
    }
    return base;
  }, [airlineOptions, flight]);

  const staffComboOptions = useMemo(() => {
    const base = employeeOptions.map((e) => {
      const name = (e.employeeName ?? '').trim();
      const code = (e.employeeCode ?? '').trim();
      const role = (e.designation || e.manpower || '').trim();
      const label = code && name ? `${code} — ${name}` : name || code;
      return {
        id: e.id || `${code}|${name}`,
        label,
        description: role || (code && name ? `Code: ${code}` : undefined),
        searchIndex: `${code} ${name} ${role}`.toLowerCase(),
        employeeCode: code,
        employeeName: name,
      };
    });
    const s = staff.trim();
    if (s && !base.some((o) => o.label === s || o.employeeName === s || o.employeeCode === s)) {
      return [{ id: '__saved-staff', label: s, description: 'Saved value', searchIndex: s.toLowerCase() }, ...base];
    }
    return base;
  }, [employeeOptions, staff]);

  const shiftDropdownOptions = useMemo(
    () => SHIFT_OPTIONS.map((o) => (o === '— Select —' ? { value: '', label: o } : o)),
    [],
  );

  const extraDutyDropdownOptions = useMemo(() => {
    const known = DUTY_ALLOCATION_OPTIONS.filter((o) => o !== '— Select —' && !QUICK_DUTY_SET.has(o));
    const knownSet = new Set<string>(known);
    const extras = dutyAllocations.filter(
      (d) => d.trim() && d !== '— Select —' && !QUICK_DUTY_SET.has(d.trim()) && !knownSet.has(d),
    );
    return [
      { value: '', label: '— Select other duty —' },
      ...known.map((o) => ({ value: o, label: o })),
      ...extras.map((o) => ({ value: o, label: o })),
    ];
  }, [dutyAllocations]);

  const selectedAirline = useMemo(() => {
    const f = flight.trim();
    if (!f) return null;
    return (
      airlineOptions.find((a) => (a.name || a.code).trim() === f) ??
      airlineOptions.find((a) => a.name === f || a.code === f) ??
      null
    );
  }, [airlineOptions, flight]);

  const filteredFlightNoOptions = useMemo(() => {
    const selectedName = (selectedAirline?.name ?? '').trim().toLowerCase();
    const selectedCode = (selectedAirline?.code ?? '').trim().toLowerCase();
    const flightSet = new Set<string>();
    if (selectedName || selectedCode) {
      for (const row of airlineFlightNos) {
        const rowName = row.airline.trim().toLowerCase();
        const rowCode = row.airlineCode.trim().toLowerCase();
        const matchesName = selectedName && rowName === selectedName;
        const matchesCode = selectedCode && rowCode === selectedCode;
        if (matchesName || matchesCode) {
          flightSet.add(row.flightNo);
        }
      }
    }
    const options = Array.from(flightSet).sort((a, b) => a.localeCompare(b));
    const current = flightNo.trim();
    if (current && !options.includes(current)) {
      return [current, ...options];
    }
    return options;
  }, [selectedAirline, airlineFlightNos, flightNo]);

  const flightNoDropdownOptions = useMemo(
    () => [
      {
        value: '',
        label: !flight.trim()
          ? '— Select flight first —'
          : scheduleSetupLoading
            ? 'Loading from schedule setup…'
            : '— Select —',
      },
      ...filteredFlightNoOptions.map((o) => ({ value: o === '— Select —' ? '' : o, label: o })),
    ],
    [flight, scheduleSetupLoading, filteredFlightNoOptions],
  );

  const extraDutyRows = useMemo(
    () => dutyAllocations.filter((d) => !QUICK_DUTY_SET.has(d.trim())),
    [dutyAllocations],
  );

  const toggleQuickDutyChip = useCallback((duty: string) => {
    setDutyAllocations((prev) => {
      const extras = prev.filter((d) => !QUICK_DUTY_SET.has(d.trim()));
      const chips = prev.filter((d) => QUICK_DUTY_SET.has(d.trim()));
      const nextChips = chips.includes(duty) ? chips.filter((d) => d !== duty) : [...chips, duty];
      return [...nextChips, ...extras];
    });
  }, []);

  const setExtraDutyAt = useCallback((index: number, value: string) => {
    setDutyAllocations((prev) => {
      const chips = prev.filter((d) => QUICK_DUTY_SET.has(d.trim()));
      const extras = prev.filter((d) => !QUICK_DUTY_SET.has(d.trim()));
      const nextExtras = extras.map((d, i) => (i === index ? value : d));
      return [...chips, ...nextExtras];
    });
  }, []);

  const removeExtraDutyAt = useCallback((index: number) => {
    setDutyAllocations((prev) => {
      const chips = prev.filter((d) => QUICK_DUTY_SET.has(d.trim()));
      const extras = prev.filter((d) => !QUICK_DUTY_SET.has(d.trim()));
      return [...chips, ...extras.filter((_, i) => i !== index)];
    });
  }, []);

  const addExtraDutyRow = useCallback(() => {
    setDutyAllocations((prev) => {
      const filled = filledDutiesFrom(prev);
      return [...filled, ''];
    });
  }, []);

  const clearStaffTypingMeta = useCallback(() => {
    setStaffCode('');
    setStaffName('');
  }, []);

  const resetComposer = useCallback(() => {
    setStaff('');
    setStaffCode('');
    setStaffName('');
    setDutyAllocations([]);
    setEditingLine(false);
    editingSnapshotRef.current = null;
    clearField('staff');
  }, [clearField]);

  const handleStaffPick = useCallback((o: SearchableComboOption) => {
    const code = (o.employeeCode ?? '').trim();
    const name = (o.employeeName ?? '').trim();
    setStaffCode(code);
    setStaffName(name);
  }, []);

  const makeDraftRow = useCallback((): CommittedStaffRow | null => {
    const filled = filledDutiesFrom(dutyAllocations);
    if (!staff.trim() || filled.length === 0) return null;
    const resolved = resolveEmployeeMetaByLabel(employeeOptions, staff);
    const effectiveCode = (staffCode || resolved?.employeeCode || '').trim();
    const effectiveName = (staffName || resolved?.employeeName || '').trim();
    const display =
      effectiveName || effectiveCode ? staffDisplayFromPick(effectiveName, effectiveCode) : staff.trim();
    return {
      clientKey: newId(),
      staff: display,
      employeeCode: effectiveCode,
      employeeName: effectiveName,
      dutyAllocations: filled,
    };
  }, [dutyAllocations, employeeOptions, staff, staffCode, staffName]);

  const hasCompleteDraft = Boolean(staff.trim() && filledDutiesFrom(dutyAllocations).length > 0);
  const hasPartialDraft = Boolean(
    (staff.trim() && filledDutiesFrom(dutyAllocations).length === 0) ||
      (!staff.trim() && filledDutiesFrom(dutyAllocations).length > 0),
  );

  const handleCommitStaffWithPlus = useCallback(() => {
    const row = makeDraftRow();
    if (!row) {
      if (!staff.trim()) toast.warning('Select or enter staff before adding.');
      else toast.warning('Select at least one duty allocation for this staff member.');
      return;
    }
    setCommittedStaff((prev) => [...prev, row]);
    const wasEditing = editingLine;
    resetComposer();
    toast.success(wasEditing ? 'Staff line updated.' : 'Staff line added. Add another or click Save.');
  }, [makeDraftRow, staff, editingLine, resetComposer]);

  const removeCommitted = useCallback((clientKey: string) => {
    setCommittedStaff((rows) => rows.filter((r) => r.clientKey !== clientKey));
  }, []);

  const scrollComposerIntoView = useCallback(() => {
    const reduce =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    composerRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  }, []);

  const editCommitted = useCallback(
    (clientKey: string) => {
      if (hasPartialDraft) {
        toast.warning('Finish or clear the current staff line before editing another.');
        return;
      }
      const target = committedStaff.find((r) => r.clientKey === clientKey);
      if (!target) return;

      const pending = hasCompleteDraft ? makeDraftRow() : null;
      editingSnapshotRef.current = { ...target };
      setStaff(target.staff);
      setStaffCode(target.employeeCode || '');
      setStaffName(target.employeeName || '');
      setDutyAllocations(target.dutyAllocations.length > 0 ? [...target.dutyAllocations] : []);
      setEditingLine(true);
      setCommittedStaff((prev) => {
        const withPending = pending ? [...prev, pending] : prev;
        return withPending.filter((r) => r.clientKey !== clientKey);
      });
      clearField('staff');
      toast.info('Staff line loaded for editing.');
      requestAnimationFrame(() => scrollComposerIntoView());
    },
    [
      hasPartialDraft,
      hasCompleteDraft,
      committedStaff,
      makeDraftRow,
      clearField,
      scrollComposerIntoView,
    ],
  );

  const cancelEdit = useCallback(() => {
    const snap = editingSnapshotRef.current;
    if (snap) {
      setCommittedStaff((prev) => [...prev, snap]);
    }
    resetComposer();
  }, [resetComposer]);

  const buildPayloadStaffAssignments = useCallback((): {
    assignments: StaffAssignmentRecord[];
    pendingError?: string;
  } => {
    const filled = filledDutiesFrom(dutyAllocations);
    if (staff.trim() && filled.length === 0) {
      return {
        assignments: committedStaff.map((r) => ({
          staff: r.staff,
          employeeCode: r.employeeCode,
          employeeName: r.employeeName,
          dutyAllocations: [...r.dutyAllocations],
        })),
        pendingError: 'Select at least one duty for the staff member currently in the form, or clear staff.',
      };
    }
    if (!staff.trim() && filled.length > 0) {
      return {
        assignments: committedStaff.map((r) => ({
          staff: r.staff,
          employeeCode: r.employeeCode,
          employeeName: r.employeeName,
          dutyAllocations: [...r.dutyAllocations],
        })),
        pendingError: 'Select a staff member for the duties currently selected, or clear those duties.',
      };
    }

    const fromCommitted: StaffAssignmentRecord[] = committedStaff.map((r) => ({
      staff: r.staff,
      employeeCode: r.employeeCode,
      employeeName: r.employeeName,
      dutyAllocations: [...r.dutyAllocations],
    }));
    const draft = makeDraftRow();
    const tail: StaffAssignmentRecord[] = draft
      ? [
          {
            staff: draft.staff,
            employeeCode: draft.employeeCode,
            employeeName: draft.employeeName,
            dutyAllocations: [...draft.dutyAllocations],
          },
        ]
      : [];
    return { assignments: [...fromCommitted, ...tail] };
  }, [committedStaff, dutyAllocations, staff, makeDraftRow]);

  const handleSave = async () => {
    const { assignments, pendingError } = buildPayloadStaffAssignments();
    const nextErrors: Partial<Record<DutyFormField, string>> = {};
    const dateErr = required(date ?? '', 'Date');
    if (dateErr) nextErrors.date = dateErr;
    const shiftErr = selectRequired(shift, 'shift');
    if (shiftErr) nextErrors.shift = shiftErr;
    if (pendingError) nextErrors.staff = pendingError;
    else if (assignments.length === 0) {
      nextErrors.staff = 'Add at least one staff member (pick staff & duties, then click Add staff line or Save).';
    }
    if (applyAndFocus(nextErrors)) return;

    const draft = makeDraftRow();
    if (draft) {
      setCommittedStaff((prev) => [...prev, draft]);
      resetComposer();
    }

    const payload = {
      date: date.trim(),
      shift: shift.trim(),
      flight: flight.trim(),
      flightNo: flightNo.trim(),
      staffAssignments: assignments.map((s) => ({
        staff: s.staff,
        employeeCode: s.employeeCode ?? '',
        employeeName: s.employeeName ?? '',
        dutyAllocations: s.dutyAllocations,
      })),
    };

    setSaving(true);
    try {
      if (mode === 'edit' && recordId) {
        await updatePaxDutyAllocation(recordId, payload);
        toast.success('Pax duty allocation updated successfully.');
      } else {
        await createPaxDutyAllocation(payload);
        toast.success('Pax duty allocation saved successfully.');
      }
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const step1Complete = Boolean(date.trim() && shift.trim());

  return (
    <div className="w-full">
      <div className={cn(GLASS_CARD_CLASS, 'overflow-hidden')}>
        <div className={cn('flex items-center gap-3 px-5 py-5 sm:px-6', EMERALD_HEADER_CLASS)}>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 backdrop-blur-md">
            <ClipboardList className="h-5 w-5 text-white" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold tracking-wide text-white">Pax Duty Allocation</h1>
              <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
                {mode === 'edit' ? 'Edit mode' : 'New allocation'}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-emerald-100/90">
              {mode === 'edit'
                ? 'Update passenger shift staffing and flight assignments'
                : 'Configure shift, flight, and staff duty coverage'}
            </p>
          </div>
        </div>

        <div className="space-y-5 p-4 sm:p-6 md:p-8">
          <section className={cn(GLASS_CARD_CLASS, 'overflow-hidden')}>
            <div className="flex items-center gap-2 border-b border-slate-200/80 bg-slate-50/70 px-4 py-3 sm:px-5">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold',
                  step1Complete ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-700',
                )}
              >
                {step1Complete ? <Check className="h-3.5 w-3.5" /> : '1'}
              </div>
              <Plane className="h-4 w-4 text-emerald-600" aria-hidden />
              <h2 className="text-sm font-semibold text-slate-800">Flight &amp; shift details</h2>
            </div>

            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
              <div className={cn(errors.date && FRIS_INVALID_PICKER_WRAP)}>
                <label
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600"
                  htmlFor="field-date"
                >
                  Duty date *
                </label>
                <DatePicker
                  id="field-date"
                  value={date}
                  onChange={(v) => {
                    setDate(v ?? '');
                    clearField('date');
                  }}
                  valueFormat="yyyy-MM-dd"
                  className="w-full"
                />
                <FormFieldError id="field-date-error" message={errors.date} />
              </div>

              <div>
                <label
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600"
                  htmlFor="field-shift"
                >
                  Shift timing *
                </label>
                <AdminRadioDropdown
                  id="field-shift"
                  value={shift}
                  onChange={(v) => {
                    setShift(v);
                    clearField('shift');
                  }}
                  options={shiftDropdownOptions}
                  className={cn(inputSelectClass, errors.shift && FRIS_INVALID_CONTROL)}
                />
                <FormFieldError id="field-shift-error" message={errors.shift} />
              </div>

              <div className="min-w-0">
                <SearchableCombobox
                  fieldLabel="Airline / flight name"
                  value={flight}
                  onChange={(value) => {
                    setFlight(value);
                    setFlightNo('');
                  }}
                  options={flightComboOptions}
                  loading={scheduleSetupLoading}
                  placeholder={
                    scheduleSetupLoaded ? 'Search airline from schedule setup…' : 'Loading airlines…'
                  }
                  onRequestOptions={loadScheduleSetupIfNeeded}
                />
                <FormFieldError />
              </div>

              <div className="min-w-0">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Flight no
                </label>
                <AdminRadioDropdown
                  value={flightNo}
                  onChange={setFlightNo}
                  options={flightNoDropdownOptions}
                  className={inputSelectClass}
                />
                <FormFieldError />
              </div>
            </div>
          </section>

          <section className={cn(GLASS_CARD_CLASS, 'overflow-hidden')}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-slate-50/70 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold',
                    committedStaff.length > 0 ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-700',
                  )}
                >
                  {committedStaff.length > 0 ? <Check className="h-3.5 w-3.5" /> : '2'}
                </div>
                <Users className="h-4 w-4 text-emerald-600" aria-hidden />
                <h2 id="field-staff" className="text-sm font-semibold text-slate-800">
                  Staff &amp; duty coverage
                </h2>
              </div>
              {committedStaff.length > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                  <Check className="h-3.5 w-3.5" />
                  {committedStaff.length} staff configured
                </span>
              ) : null}
            </div>

            <div className="space-y-5 p-4 sm:p-5">
              <FormFieldError id="field-staff-error" message={errors.staff} />

              {committedStaff.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Configured staff lines ({committedStaff.length})
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {committedStaff.map((row, idx) => (
                      <div
                        key={row.clientKey}
                        className="relative flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white/80 p-3.5 shadow-xs backdrop-blur-sm transition-[border-color,background-color] duration-150 hover:border-emerald-200 hover:bg-emerald-50/30"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start gap-2.5">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white shadow-xs">
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">{row.staff || '—'}</p>
                              {row.employeeCode ? (
                                <p className="font-mono text-xs text-slate-500">Code: {row.employeeCode}</p>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => editCommitted(row.clientKey)}
                              className="rounded-lg p-1.5 text-slate-400 transition-[background-color,color,transform] duration-150 ease-out hover:bg-emerald-100 hover:text-emerald-700 active:scale-[0.97]"
                              title="Edit this staff line"
                              aria-label={`Edit staff line ${idx + 1}`}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeCommitted(row.clientKey)}
                              className="rounded-lg p-1.5 text-slate-400 transition-[background-color,color,transform] duration-150 ease-out hover:bg-red-50 hover:text-red-600 active:scale-[0.97]"
                              title="Remove staff line"
                              aria-label={`Remove staff line ${idx + 1}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="mt-3">
                          <DutyChipList duties={row.dutyAllocations} max={8} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div
                ref={composerRef}
                className={cn(
                  'space-y-4 rounded-xl border p-4',
                  editingLine
                    ? 'border-amber-200 bg-amber-50/40'
                    : 'border-emerald-100 bg-emerald-50/20',
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-emerald-600" aria-hidden />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                      {editingLine ? 'Edit staff member & duties' : 'Add staff member & duties'}
                    </h3>
                  </div>
                  {editingLine ? (
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-white hover:text-slate-800"
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancel edit
                    </button>
                  ) : null}
                </div>

                <div className="max-w-md">
                  <SearchableCombobox
                    fieldLabel="Select staff member"
                    value={staff}
                    onChange={(v) => {
                      setStaff(v);
                      const resolved = resolveEmployeeMetaByLabel(employeeOptions, v);
                      if (resolved) {
                        setStaffCode(resolved.employeeCode);
                        setStaffName(resolved.employeeName);
                      } else {
                        clearStaffTypingMeta();
                      }
                    }}
                    onPickOption={handleStaffPick}
                    options={staffComboOptions}
                    loading={employeesLoading}
                    placeholder="Search station staff by name or employee code…"
                    onRequestOptions={loadEmployeesIfNeeded}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <Tag className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                    Quick-select duties
                  </div>
                  <div
                    className="flex flex-wrap content-start gap-2"
                    role="group"
                    aria-label="Duty types"
                  >
                    {QUICK_DUTY_CHIPS.map((chip) => {
                      const selected = dutyAllocations.includes(chip);
                      const badge = getDutyBadgeStyle(chip);
                      return (
                        <button
                          key={chip}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggleQuickDutyChip(chip)}
                          className={cn(
                            'rounded-full border px-2.5 py-1.5 text-xs font-semibold shadow-sm transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97]',
                            selected
                              ? getDutySelectedChipClass(chip)
                              : cn(badge.bg, badge.text, badge.border, 'hover:brightness-[0.98]'),
                          )}
                        >
                          {selected ? `✓ ${chip}` : `+ ${chip}`}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  {extraDutyRows.map((row, index) => (
                    <div key={`extra-${index}`} className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1 sm:max-w-md">
                        <AdminRadioDropdown
                          value={row === '— Select —' ? '' : row}
                          onChange={(v) => setExtraDutyAt(index, v)}
                          className={inputSelectClass}
                          aria-label={`Other duty ${index + 1}`}
                          options={extraDutyDropdownOptions}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeExtraDutyAt(index)}
                        className="rounded-lg p-2 text-slate-400 transition-[background-color,color,transform] duration-150 ease-out hover:bg-red-50 hover:text-red-600 active:scale-[0.97]"
                        aria-label={`Remove other duty ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addExtraDutyRow}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:text-emerald-800"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Add other duty
                  </button>
                </div>

                <div className="flex justify-end border-t border-slate-200/60 pt-3">
                  <button
                    type="button"
                    onClick={handleCommitStaffWithPlus}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition-[background-color,transform] duration-150 ease-out hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 active:scale-[0.97]"
                  >
                    <UserPlus className="h-4 w-4" />
                    {editingLine ? 'Update staff line' : 'Add staff line'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200/80 bg-slate-50/80 px-4 py-4 backdrop-blur-sm sm:px-6">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 shadow-xs transition-[background-color,transform] duration-150 ease-out hover:bg-slate-50 focus-visible:outline-none active:scale-[0.97]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-7 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 transition-[background-color,transform,opacity] duration-150 ease-out hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
          >
            {saving ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Saving allocation…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                {mode === 'edit' ? 'Update allocation' : 'Save allocation'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
