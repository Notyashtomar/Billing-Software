'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  ChevronDown,
  FileUp,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  confirmFrisPassword,
  deleteAdvanceScheduleSetupMaster,
  extendAdvanceScheduleValidity,
  fetchAdvanceScheduleSetupMasters,
  fetchScheduleSetupReferenceAircraft,
  fetchScheduleSetupReferenceAirlines,
  saveAdvanceScheduleSetup,
} from '@/lib/api';
import { isFrisElevatedRole } from '@/lib/fris-session';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { cn } from '@/lib/utils';
import { parseAdvanceScheduleCsv } from '@/components/fris/advance/importAdvanceScheduleCsv';
import {
  SCHEDULE_SEASON,
  detectScheduleSeasonFromValidFrom,
  resolveScheduleSeasonLabel,
} from '@/lib/schedule-season';
import {
  fileMaxSize,
  fileType,
  normalizeText,
  required,
  runValidators,
  scheduleFlightNumber,
  scheduleRouting,
  sanitizeScheduleFlightNoInput,
  sanitizeScheduleRoutingInput,
  time24,
  trimValue,
  type FieldErrors,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { ScheduleFormDrawer } from '@/components/fris/advance/ScheduleFormDrawer';
import {
  CSV_MAX_BYTES,
  SCHEDULE_ONE_YEAR_VALID_TO,
  DAYS,
  FIELD_ORDER,
  sameDayStaNotBeforeStd,
  validityOrderError,
  SCHEDULE_AMBER_BTN,
  SCHEDULE_BTN_TRANSITION,
  SCHEDULE_CONTROL,
  SCHEDULE_PRIMARY_BTN,
  SCHEDULE_SECONDARY_BTN,
  buildAircraftMasterOptions,
  createEmptyScheduleForm,
  ddMmYyyyToYmd,
  getBoolText,
  getDaysList,
  getDaysText,
  getStr,
  normalizeScheduleDays,
  toAirlineOption,
  toFormFromScheduleData,
  useDebouncedValue,
  type AdvanceAircraftMasterOption,
  type AdvanceAirlineOption,
  type AdvanceScheduleSetupMasterRow,
  type ScheduleField,
} from '@/components/fris/advance/scheduleSetupShared';

function validateDdMmDate(value: string, label: string): string | null {
  if (!normalizeText(value)) return `${label} is required.`;
  if (!ddMmYyyyToYmd(value)) return `Please choose a valid ${label} (DD/MM/YYYY).`;
  return null;
}

export default function ScheduleSetupPage() {
  const router = useRouter();
  const [airlines, setAirlines] = useState<AdvanceAirlineOption[]>([]);
  const [airlinesLoading, setAirlinesLoading] = useState(true);
  const [aircraftMaster, setAircraftMaster] = useState<AdvanceAircraftMasterOption[]>([]);
  const [aircraftMasterLoading, setAircraftMasterLoading] = useState(true);
  const [selectedAirlineId, setSelectedAirlineId] = useState('');
  const [form, setForm] = useState(createEmptyScheduleForm);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [masters, setMasters] = useState<AdvanceScheduleSetupMasterRow[]>([]);
  const [mastersLoading, setMastersLoading] = useState(false);
  const [flightNoQuery, setFlightNoQuery] = useState('');
  const debouncedFlightNo = useDebouncedValue(flightNoQuery, 150);
  const [filterAirlineId, setFilterAirlineId] = useState('');
  const [seasonFilter, setSeasonFilter] = useState('');
  const [dayFilter, setDayFilter] = useState('');
  const [dateFilterFrom, setDateFilterFrom] = useState('');
  const [dateFilterTo, setDateFilterTo] = useState('');
  const [editingSerialNo, setEditingSerialNo] = useState('');
  const [csvImporting, setCsvImporting] = useState(false);
  const [canDeleteSchedule, setCanDeleteSchedule] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdvanceScheduleSetupMasterRow | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletePasswordError, setDeletePasswordError] = useState('');
  const [extendOpen, setExtendOpen] = useState(false);
  const [extending, setExtending] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const deletePasswordRef = useRef<HTMLInputElement>(null);
  const { errors, clearAll, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<ScheduleField>(FIELD_ORDER);

  useEffect(() => {
    setCanDeleteSchedule(isFrisElevatedRole(localStorage.getItem('userRole')));
  }, []);

  const loadAirlines = useCallback(async () => {
    setAirlinesLoading(true);
    try {
      const list = (await fetchScheduleSetupReferenceAirlines()) as Record<string, unknown>[];
      const opts = list.map(toAirlineOption).filter((a) => a.id && (a.name || a.code));
      setAirlines(opts);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load airlines');
      setAirlines([]);
    } finally {
      setAirlinesLoading(false);
    }
  }, []);

  const loadAircraftMaster = useCallback(async () => {
    setAircraftMasterLoading(true);
    try {
      const list = (await fetchScheduleSetupReferenceAircraft()) as Record<string, unknown>[];
      setAircraftMaster(buildAircraftMasterOptions(list));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load aircraft types');
      setAircraftMaster([]);
    } finally {
      setAircraftMasterLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAirlines();
    void loadAircraftMaster();
  }, [loadAirlines, loadAircraftMaster]);

  const loadMasters = useCallback(async () => {
    setMastersLoading(true);
    try {
      const raw = (await fetchAdvanceScheduleSetupMasters()) as Record<string, unknown>[];
      const toId = (doc: Record<string, unknown>): string => {
        const rawId = doc?._id ?? doc?.id;
        if (!rawId) return '';
        if (typeof rawId === 'string') return rawId;
        if (typeof rawId === 'object' && rawId !== null && '$oid' in rawId) {
          return String((rawId as { $oid: string }).$oid);
        }
        if (typeof rawId === 'object' && rawId !== null && 'toString' in rawId) {
          return String(rawId);
        }
        return String(rawId);
      };
      const rows: AdvanceScheduleSetupMasterRow[] = raw
        .map((doc) => ({
          id: toId(doc),
          data: (doc?.data && typeof doc.data === 'object'
            ? doc.data
            : {}) as Record<string, unknown>,
          serialNo: doc?.serialNo ? String(doc.serialNo) : undefined,
          updatedAt: doc?.updatedAt ? String(doc.updatedAt) : undefined,
          createdAt: doc?.createdAt ? String(doc.createdAt) : undefined,
        }))
        .filter((r) => r.id || r.serialNo);
      setMasters(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load schedule records');
      setMasters([]);
    } finally {
      setMastersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMasters();
  }, [loadMasters]);

  const selectedAirline = airlines.find((a) => a.id === selectedAirlineId);

  const validateScheduleForm = (): FieldErrors<ScheduleField> => {
    const next: FieldErrors<ScheduleField> = {};
    const flightNo = sanitizeScheduleFlightNoInput(form.flightNo);
    const routing = sanitizeScheduleRoutingInput(form.routing);
    const aircraft = trimValue(form.aircraft);
    const sta = trimValue(form.sta) || '00:00';
    const std = trimValue(form.std) || '00:00';
    const arrivalFlightNo = sanitizeScheduleFlightNoInput(form.arrivalFlightNo);
    const departureFlightNo = sanitizeScheduleFlightNoInput(form.departureFlightNo);

    if (!trimValue(selectedAirlineId) || !selectedAirline) {
      next.airline = 'Select an airline.';
    }

    const flightNoErr = runValidators(
      required(flightNo, 'Flight number'),
      scheduleFlightNumber(flightNo),
    );
    if (flightNoErr) next.flightNo = flightNoErr;

    const staErr = time24(sta, 'STA time');
    if (staErr) next.sta = staErr;
    const stdErr = time24(std, 'STD time');
    if (stdErr) next.std = stdErr;
    if (!next.sta && !next.std) {
      const orderErr = sameDayStaNotBeforeStd(sta, std, form.nextDay === 'true');
      if (orderErr) next.std = orderErr;
    }

    if (routing) {
      const routingErr = scheduleRouting(routing);
      if (routingErr) next.routing = routingErr;
    }

    if (!trimValue(aircraft)) {
      next.aircraft = 'Select an aircraft type.';
    }

    const validFromErr = validateDdMmDate(form.validFrom, 'Valid From');
    if (validFromErr) next.validFrom = validFromErr;
    const validToErr = validateDdMmDate(form.validTo, 'Valid To');
    if (validToErr) next.validTo = validToErr;

    const rangeErr = validityOrderError(form.validFrom, form.validTo);
    if (rangeErr) next.validTo = rangeErr;

    if (form.operationSplit) {
      const arrErr = runValidators(
        required(arrivalFlightNo, 'Arrival flight number'),
        scheduleFlightNumber(arrivalFlightNo, 'Arrival flight number'),
      );
      if (arrErr) next.arrivalFlightNo = arrErr;
      const depErr = runValidators(
        required(departureFlightNo, 'Departure flight number'),
        scheduleFlightNumber(departureFlightNo, 'Departure flight number'),
      );
      if (depErr) next.departureFlightNo = depErr;
    }

    if (!DAYS.some((day) => form.days[day])) {
      next.days = 'Select at least one operating day.';
    }

    return next;
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setForm(createEmptyScheduleForm());
    setEditingSerialNo('');
    setSelectedAirlineId('');
    clearAll();
  };

  const openCreate = () => {
    setForm(createEmptyScheduleForm());
    setEditingSerialNo('');
    setSelectedAirlineId('');
    clearAll();
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (saving || airlinesLoading) return;

    const next = validateScheduleForm();
    if (applyAndFocus(next)) return;

    if (!selectedAirline) {
      applyAndFocus({ airline: 'Select an airline.' });
      return;
    }

    const flightNo = sanitizeScheduleFlightNoInput(form.flightNo);
    const routing = sanitizeScheduleRoutingInput(form.routing);
    const arrivalFlightNo = sanitizeScheduleFlightNoInput(form.arrivalFlightNo);
    const departureFlightNo = sanitizeScheduleFlightNoInput(form.departureFlightNo);
    const sta = trimValue(form.sta) || '00:00';
    const std = trimValue(form.std) || '00:00';

    const payload: Record<string, unknown> = {
      Airline: selectedAirline.name,
      'Airline Code': selectedAirline.code,
      airline: selectedAirline.name,
      'Flight No': flightNo,
      flightNo,
      'Flight Type': form.flightType,
      'Type of flight': form.flightType,
      flight: form.flightType,
      'STA Time': sta,
      'STD Time': std,
      staTime: sta,
      stdTime: std,
      Routing: routing,
      route: routing,
      routing,
      Aircraft: form.aircraft.trim(),
      TypeCraft: form.aircraft.trim(),
      aircraft: form.aircraft.trim(),
      'Aircraft Body': form.aircraftBody,
      aircraftBody: form.aircraftBody,
      Freighter: form.freighter,
      'Type of Handling': form.typeOfHandling,
      'Next Day': form.nextDay === 'true' ? 'True' : 'False',
      nextDay: form.nextDay,
      'Valid From': form.validFrom.trim(),
      'Valid To': form.validTo.trim(),
      'Operation Split': form.operationSplit ? 'Yes' : 'No',
      ifOperationSplit: form.operationSplit,
      'Arrival Flight No': arrivalFlightNo,
      arrivalFlightNo,
      'Departure Flight No': departureFlightNo,
      departureFlightNo,
      scheduleDays: normalizeScheduleDays(form.days),
      Active: form.active ? 'Yes' : 'No',
      active: form.active,
      scheduleSource: 'advance_schedule_setup',
      exportedNAV: 'No',
      rampLocked: 'No',
      paxLocked: 'No',
      gsdLocked: 'No',
    };
    if (editingSerialNo) {
      payload.serialNo = editingSerialNo;
    }

    setSaving(true);
    try {
      const result = await saveAdvanceScheduleSetup(payload);
      const seasonLabel =
        result.season ??
        detectScheduleSeasonFromValidFrom(form.validFrom)?.season ??
        '';
      if ((result.fhrStaDatesCount ?? 0) === 0) {
        toast.warning(
          `${result.message ?? (seasonLabel ? `${seasonLabel} schedule saved.` : 'Schedule saved.')} No operating days fall in the Valid From–Valid To range with the selected weekdays. Adjust dates or days, then save again.`,
        );
      } else {
        toast.success(
          result.message ??
            (result.scheduleAction === 'updated'
              ? `${seasonLabel || 'Schedule'} updated successfully.`
              : `${seasonLabel ? `New ${seasonLabel} schedule` : 'Schedule'} created.`),
        );
      }
      closeDrawer();
      void loadMasters();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setFieldError('flightNo', msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const seasonStats = useMemo(() => {
    let summer = 0;
    let winter = 0;
    for (const row of masters) {
      const season = resolveScheduleSeasonLabel(row.data ?? {});
      if (season === SCHEDULE_SEASON.SUMMER) summer += 1;
      else if (season === SCHEDULE_SEASON.WINTER) winter += 1;
    }
    return { summer, winter };
  }, [masters]);

  const filteredMasters = useMemo(() => {
    const query = debouncedFlightNo.trim().toLowerCase();
    const airlineName = filterAirlineId
      ? airlines.find((a) => a.id === filterAirlineId)?.name.trim().toLowerCase() ?? ''
      : '';
    const dayQ = dayFilter.trim();
    const filterFromYmd = ddMmYyyyToYmd(dateFilterFrom.trim());
    const filterToYmd = ddMmYyyyToYmd(dateFilterTo.trim());
    const seasonQ = seasonFilter.trim();

    const rows = masters.filter((row) => {
      const d = row.data ?? {};
      const airline = getStr(d, 'airline', 'Airline');
      const flightNo = getStr(d, 'flightNo', 'Flight No');
      const validFrom = getStr(d, 'validFrom', 'Valid From', 'STA Date', 'staDate');
      const validTo = getStr(d, 'validTo', 'Valid To', 'STD Date', 'stdDate');
      const daysText = getDaysText(d);
      const season = resolveScheduleSeasonLabel(d);

      if (query && !flightNo.toLowerCase().includes(query)) return false;
      if (airlineName && airline.toLowerCase() !== airlineName) return false;
      if (dayQ && !daysText.split(',').map((x) => x.trim()).includes(dayQ)) return false;
      if (filterFromYmd && filterToYmd) {
        const rowFromYmd = ddMmYyyyToYmd(validFrom);
        const rowToYmd = ddMmYyyyToYmd(validTo);
        if (!rowFromYmd || !rowToYmd) return false;
        // Overlap: schedule validity intersects selected filter range
        if (rowFromYmd > filterToYmd || rowToYmd < filterFromYmd) return false;
      }
      if (seasonQ && season !== seasonQ) return false;
      return true;
    });

    const seasonRank = (d: Record<string, unknown>) => {
      const s = resolveScheduleSeasonLabel(d);
      if (s === SCHEDULE_SEASON.SUMMER) return 0;
      if (s === SCHEDULE_SEASON.WINTER) return 1;
      return 2;
    };
    return rows.sort((a, b) => {
      const ra = seasonRank(a.data ?? {});
      const rb = seasonRank(b.data ?? {});
      if (ra !== rb) return ra - rb;
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tb - ta;
    });
  }, [
    airlines,
    dateFilterFrom,
    dateFilterTo,
    dayFilter,
    debouncedFlightNo,
    filterAirlineId,
    masters,
    seasonFilter,
  ]);

  const handleCsvImport = async (file: File) => {
    const typeErr = fileType(file, ['.csv'], 'CSV file');
    const sizeErr = fileMaxSize(file, CSV_MAX_BYTES, 'CSV file');
    if (typeErr || sizeErr) {
      toast.error(typeErr ?? sizeErr);
      if (csvInputRef.current) csvInputRef.current.value = '';
      return;
    }

    setCsvImporting(true);
    try {
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(new Error('Failed to read CSV file'));
        reader.readAsText(file);
      });

      const filterAirline = filterAirlineId
        ? airlines.find((a) => a.id === filterAirlineId) ?? null
        : null;
      const { rows, skipped } = parseAdvanceScheduleCsv(text, airlines, filterAirline);

      if (rows.length === 0) {
        const firstReason = skipped[0]?.reason ?? 'No valid rows found in CSV.';
        toast.error(firstReason);
        return;
      }

      let saved = 0;
      let created = 0;
      let updated = 0;
      let failed = 0;
      for (const row of rows) {
        try {
          const result = await saveAdvanceScheduleSetup(row.payload);
          saved += 1;
          if (result.scheduleAction === 'updated') updated += 1;
          else created += 1;
        } catch (e) {
          failed += 1;
          toast.error(
            `Row ${row.rowNumber}: ${e instanceof Error ? e.message : 'Import failed'}`,
          );
        }
      }

      await loadMasters();

      if (saved > 0) {
        toast.success(
          `Imported ${saved} row${saved === 1 ? '' : 's'} (${created} new, ${updated} season merge${updated === 1 ? '' : 's'}).`,
        );
      }
      if (skipped.length > 0) {
        toast.message(
          `Skipped ${skipped.length} row${skipped.length === 1 ? '' : 's'}: ${skipped[0]?.reason ?? 'validation failed'}`,
        );
      }
      if (failed > 0 && saved === 0) {
        toast.error('CSV import failed for all rows.');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'CSV import failed');
    } finally {
      setCsvImporting(false);
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  };

  const closeDeleteDialog = () => {
    if (deletingId) return;
    setDeleteTarget(null);
    setDeletePassword('');
    setDeletePasswordError('');
  };

  const openDeleteDialog = (row: AdvanceScheduleSetupMasterRow) => {
    setDeleteTarget(row);
    setDeletePassword('');
    setDeletePasswordError('');
    requestAnimationFrame(() => deletePasswordRef.current?.focus());
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget?.id) return;
    if (!deletePassword.trim()) {
      setDeletePasswordError('Enter your password to confirm delete.');
      deletePasswordRef.current?.focus();
      return;
    }

    const targetId = deleteTarget.id;
    setDeletingId(targetId);
    setDeletePasswordError('');
    try {
      await confirmFrisPassword(deletePassword);
      await deleteAdvanceScheduleSetupMaster(targetId);
      toast.success('Schedule deleted');

      const deletedSerial =
        deleteTarget.serialNo ?? getStr(deleteTarget.data ?? {}, 'serialNo', 'SlNo', 'Serial No');
      if (editingSerialNo && deletedSerial && editingSerialNo === deletedSerial) {
        closeDrawer();
      }

      setDeleteTarget(null);
      setDeletePassword('');
      setDeletePasswordError('');
      await loadMasters();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Delete failed';
      const isPasswordError = /password|credentials|unauthorized|incorrect/i.test(msg);
      if (isPasswordError) {
        setDeletePasswordError(msg);
        setDeletePassword('');
        deletePasswordRef.current?.focus();
      } else {
        toast.error(msg);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleExtendValidity = async () => {
    if (extending || masters.length === 0) return;
    setExtending(true);
    try {
      const result = await extendAdvanceScheduleValidity(SCHEDULE_ONE_YEAR_VALID_TO);
      toast.success(
        `Valid To set to ${result.validTo ?? SCHEDULE_ONE_YEAR_VALID_TO}: ${result.updated ?? 0} updated, ${result.skipped ?? 0} already covered.`,
      );
      setExtendOpen(false);
      await loadMasters();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Extend validity failed');
    } finally {
      setExtending(false);
    }
  };

  const handleLoadForEdit = (row: AdvanceScheduleSetupMasterRow) => {
    const d = row.data ?? {};
    const airlineName = getStr(d, 'airline', 'Airline');
    const airlineCode = getStr(d, 'airlineCode', 'Airline Code');
    const match =
      airlines.find(
        (a) =>
          (airlineName && a.name.trim().toLowerCase() === airlineName.toLowerCase()) ||
          (airlineCode && a.code.trim().toLowerCase() === airlineCode.toLowerCase()),
      ) ?? null;

    if (match) {
      setSelectedAirlineId(match.id);
    } else if (airlineName) {
      toast.message(
        `Airline “${airlineName}” not in the gateway list — select the airline manually if needed.`,
      );
    }

    setForm(toFormFromScheduleData(d));
    const serial = String(row.serialNo ?? getStr(d, 'serialNo', 'SlNo', 'Serial No')).trim();
    setEditingSerialNo(serial);
    clearAll();
    setDrawerOpen(true);
    toast.success(
      serial
        ? `Loaded serial ${serial} for edit.`
        : 'Schedule loaded for edit.',
    );
  };

  const viewAirlineId = selectedAirlineId || filterAirlineId;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Schedule Setup</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const q = viewAirlineId
                ? `?airlineId=${encodeURIComponent(viewAirlineId)}`
                : '';
              router.push(`/fris/advance/schedule-airline-view${q}`);
            }}
            className={SCHEDULE_AMBER_BTN}
          >
            <Calendar className="h-4 w-4" aria-hidden />
            View Airline Schedule
          </button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleCsvImport(file);
            }}
          />
          <button
            type="button"
            onClick={() => csvInputRef.current?.click()}
            disabled={csvImporting}
            className={SCHEDULE_SECONDARY_BTN}
          >
            {csvImporting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <FileUp className="h-4 w-4" aria-hidden />
            )}
            Import CSV
          </button>
          <button
            type="button"
            onClick={() => setExtendOpen(true)}
            disabled={mastersLoading || masters.length === 0 || extending}
            className={SCHEDULE_SECONDARY_BTN}
          >
            {extending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Calendar className="h-4 w-4" aria-hidden />
            )}
            Extend to {SCHEDULE_ONE_YEAR_VALID_TO}
          </button>
          <button type="button" onClick={openCreate} className={SCHEDULE_PRIMARY_BTN}>
            <Plus className="h-4 w-4" aria-hidden />
            New Schedule
          </button>
        </div>
      </div>

      <ScheduleFormDrawer
        open={drawerOpen}
        form={form}
        setForm={setForm}
        selectedAirlineId={selectedAirlineId}
        setSelectedAirlineId={(id) => {
          setSelectedAirlineId(id);
          clearField('airline');
        }}
        airlines={airlines}
        airlinesLoading={airlinesLoading}
        aircraftMaster={aircraftMaster}
        aircraftMasterLoading={aircraftMasterLoading}
        editingSerialNo={editingSerialNo}
        saving={saving}
        onSave={handleSave}
        onCancel={closeDrawer}
        errors={errors}
        clearField={clearField}
        setFieldError={setFieldError}
      />

      <div className={`flex flex-col gap-3 rounded-xl border border-emerald-200/80 bg-white/95 p-3 shadow-sm ${drawerOpen ? '' : 'sticky top-0 z-20 backdrop-blur-sm'}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3">
            <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
            <input
              type="search"
              value={flightNoQuery}
              onChange={(e) => setFlightNoQuery(e.target.value)}
              placeholder="Search Flight No…"
              className={`${SCHEDULE_CONTROL} border-0 bg-transparent px-0 shadow-none focus:ring-0`}
              aria-label="Search flight number"
            />
          </div>
          <div className="w-full min-w-[10rem] sm:w-48">
            <AdminRadioDropdown
              value={filterAirlineId}
              onChange={setFilterAirlineId}
              disabled={airlinesLoading}
              options={[
                { value: '', label: airlinesLoading ? 'Loading airlines…' : 'All Airlines' },
                ...airlines.map((a) => ({
                  value: a.id,
                  label: a.name.trim() || a.code || 'Unnamed airline',
                })),
              ]}
              className={SCHEDULE_CONTROL}
              clearable
              clearLabel="All airlines"
              searchPlaceholder="Search airline…"
              aria-label="Filter by airline"
            />
          </div>
          <div className="w-full min-w-[8rem] sm:w-40">
            <AdminRadioDropdown
              value={seasonFilter}
              onChange={setSeasonFilter}
              options={[
                { value: '', label: 'Season: All' },
                { value: SCHEDULE_SEASON.SUMMER, label: '☀️ Summer' },
                { value: SCHEDULE_SEASON.WINTER, label: '❄️ Winter' },
              ]}
              className={SCHEDULE_CONTROL}
              searchable={false}
              aria-label="Filter by season"
            />
          </div>
          <div className="w-full min-w-[8rem] sm:w-36">
            <AdminRadioDropdown
              value={dayFilter}
              onChange={setDayFilter}
              options={[
                { value: '', label: 'All Days' },
                ...DAYS.map((day) => ({ value: day, label: day })),
              ]}
              className={SCHEDULE_CONTROL}
              searchable={false}
              aria-label="Filter by day"
            />
          </div>
          <div className="w-full min-w-[12rem] sm:w-64">
            <DateRangePicker
              from={dateFilterFrom}
              to={dateFilterTo}
              onFromChange={setDateFilterFrom}
              onToChange={setDateFilterTo}
              placeholder="Valid date range"
            />
          </div>
          <button
            type="button"
            onClick={() => void loadMasters()}
            disabled={mastersLoading}
            className={`${SCHEDULE_SECONDARY_BTN} sm:ml-auto`}
          >
            {mastersLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-2.5 text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium text-amber-800">
          <span aria-hidden>☀️</span>
          Summer Schedules:{' '}
          <span className="tabular-nums">{seasonStats.summer}</span>
        </span>
        <span className="text-gray-300" aria-hidden>
          |
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium text-sky-800">
          <span aria-hidden>❄️</span>
          Winter Schedules:{' '}
          <span className="tabular-nums">{seasonStats.winter}</span>
        </span>
        <span className="ml-auto text-xs text-gray-500">
          Showing {filteredMasters.length} of {masters.length}
        </span>
      </div>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-emerald-300 bg-white shadow-sm">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50/95 backdrop-blur-sm">
              <tr>
                {[
                  'S.No',
                  'Airline',
                  'Flight No',
                  'Days',
                  'STA / STD',
                  'Route',
                  'Aircraft (Body)',
                  'Handling Type',
                  'Valid Period',
                  'Active',
                  'Actions',
                ].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-600"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mastersLoading && masters.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                    Loading schedules…
                  </td>
                </tr>
              ) : filteredMasters.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                    No schedules match your filters. Use + New Schedule or Import CSV.
                  </td>
                </tr>
              ) : (
                filteredMasters.map((row) => {
                  const d = row.data ?? {};
                  const rowKey = row.id || row.serialNo || '';
                  const sno =
                    getStr(d, 'serialNo', 'SlNo', 'Serial No') || row.serialNo || '—';
                  const airline = getStr(d, 'airline', 'Airline');
                  const flightNo = getStr(d, 'flightNo', 'Flight No');
                  const days = getDaysList(d);
                  const sta = getStr(d, 'staTime', 'STA Time');
                  const std = getStr(d, 'stdTime', 'STD Time');
                  const route = getStr(d, 'routing', 'Routing', 'route');
                  const aircraft = getStr(d, 'aircraft', 'Aircraft', 'TypeCraft');
                  const aircraftBody = getStr(d, 'aircraftBody', 'Aircraft Body');
                  const handling = getStr(d, 'typeOfHandling', 'Type of Handling');
                  const validFrom = getStr(d, 'validFrom', 'Valid From', 'STA Date', 'staDate');
                  const validTo = getStr(d, 'validTo', 'Valid To', 'STD Date', 'stdDate');
                  const active = getBoolText(d.active ?? d.Active);
                  const isExpanded = expandedId === rowKey;
                  const freighter = getStr(d, 'freighter', 'Freighter') || '—';
                  const nextDay = getStr(d, 'nextDay', 'Next Day') || '—';
                  const isSplit = getBoolText(d.ifOperationSplit ?? d['Operation Split']);
                  const arrivalFltNo = getStr(d, 'arrivalFlightNo', 'Arrival Flight No');
                  const departureFltNo = getStr(d, 'departureFlightNo', 'Departure Flight No');

                  return (
                    <React.Fragment key={rowKey}>
                      <tr
                        className="cursor-pointer hover:bg-emerald-50/40"
                        onClick={() =>
                          setExpandedId((prev) => (prev === rowKey ? null : rowKey))
                        }
                      >
                        <td className="whitespace-nowrap px-3 py-2.5 text-gray-700">{sno}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-medium text-gray-900">
                          {airline || '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-medium tabular-nums text-gray-900">
                          {flightNo || '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-0.5">
                            {days.length === 0 ? (
                              <span className="text-gray-400">—</span>
                            ) : (
                              days.map((day) => (
                                <span
                                  key={day}
                                  className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700"
                                >
                                  {day.slice(0, 2)}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-gray-700">
                          {sta || '—'} / {std || '—'}
                        </td>
                        <td className="max-w-[8rem] truncate px-3 py-2.5 text-gray-700" title={route}>
                          {route || '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-gray-700">
                          {aircraft
                            ? `${aircraft}${aircraftBody ? ` (${aircraftBody})` : ''}`
                            : '—'}
                        </td>
                        <td className="max-w-[9rem] truncate px-3 py-2.5 text-gray-700" title={handling}>
                          {handling || '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-700">
                          {validFrom || '—'}
                          <span className="text-gray-400"> → </span>
                          {validTo || '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <span
                            className={cn(
                              'inline-flex rounded-md px-2 py-0.5 text-xs font-semibold',
                              active === 'Yes'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-gray-100 text-gray-600',
                            )}
                          >
                            {active}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleLoadForEdit(row)}
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-emerald-50 hover:text-emerald-700 ${SCHEDULE_BTN_TRANSITION}`}
                              title="Edit schedule"
                              aria-label={`Edit schedule ${flightNo || sno}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            {canDeleteSchedule ? (
                              <button
                                type="button"
                                onClick={() => openDeleteDialog(row)}
                                disabled={deletingId === row.id}
                                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 ${SCHEDULE_BTN_TRANSITION}`}
                                title="Delete schedule"
                                aria-label={`Delete schedule ${flightNo || sno}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            ) : null}
                            <ChevronDown
                              className={cn(
                                'ml-0.5 h-4 w-4 text-gray-400 transition-transform duration-160',
                                isExpanded && 'rotate-180',
                              )}
                              aria-hidden
                            />
                          </div>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="bg-gray-50/80">
                          <td colSpan={11} className="px-4 py-3 text-xs text-gray-600">
                            <div className="flex flex-wrap gap-x-6 gap-y-1">
                              <span>
                                <span className="font-medium text-gray-500">Freighter:</span>{' '}
                                {freighter}
                              </span>
                              <span>
                                <span className="font-medium text-gray-500">Next Day:</span>{' '}
                                {nextDay}
                              </span>
                              <span>
                                <span className="font-medium text-gray-500">Split:</span> {isSplit}
                              </span>
                              {isSplit === 'Yes' ? (
                                <>
                                  <span>
                                    <span className="font-medium text-gray-500">Arrival Flt:</span>{' '}
                                    {arrivalFltNo || '—'}
                                  </span>
                                  <span>
                                    <span className="font-medium text-gray-500">Departure Flt:</span>{' '}
                                    {departureFltNo || '—'}
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <AlertDialog
        open={extendOpen}
        onOpenChange={(open) => {
          if (!extending) setExtendOpen(open);
        }}
      >
        <AlertDialogContent className="origin-center border-gray-200 bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Extend schedule validity?</AlertDialogTitle>
            <AlertDialogDescription>
              Sets Valid To to {SCHEDULE_ONE_YEAR_VALID_TO} on {masters.length} schedule
              {masters.length === 1 ? '' : 's'} at this station. Valid From and operating days stay.
              Rows already at or past that date are skipped. Daily FHR rows are not created.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={extending} className={SCHEDULE_SECONDARY_BTN}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleExtendValidity();
              }}
              disabled={extending}
              className={SCHEDULE_PRIMARY_BTN}
            >
              {extending ? 'Extending…' : `Extend to ${SCHEDULE_ONE_YEAR_VALID_TO}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeDeleteDialog();
        }}
      >
        <AlertDialogContent className="origin-center border-gray-200 bg-white duration-[180ms] ease-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the master schedule
              {deleteTarget
                ? ` (${getStr(deleteTarget.data ?? {}, 'flightNo', 'Flight No') || deleteTarget.serialNo || 'selected'})`
                : ''}
              . Enter your password to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-1">
            <label className="text-sm font-medium text-gray-700" htmlFor="schedule-delete-password">
              Password
            </label>
            <input
              ref={deletePasswordRef}
              id="schedule-delete-password"
              type="password"
              value={deletePassword}
              onChange={(e) => {
                setDeletePassword(e.target.value);
                setDeletePasswordError('');
              }}
              className={SCHEDULE_CONTROL}
              autoComplete="current-password"
              disabled={Boolean(deletingId)}
            />
            {deletePasswordError ? (
              <p className="text-xs text-red-600" role="alert">
                {deletePasswordError}
              </p>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingId)} className={SCHEDULE_SECONDARY_BTN}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteConfirm();
              }}
              disabled={Boolean(deletingId)}
              className={`bg-red-600 text-white hover:bg-red-700 ${SCHEDULE_BTN_TRANSITION}`}
            >
              {deletingId ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
