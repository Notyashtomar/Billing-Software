'use client';

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { Users, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import {
  FlightData,
  MainDetailsData,
  RampDetails2Data,
  normalizeRampDetails2Data,
  normalizeRampDetails2List,
  displayScheduledAirlinesTableSerial,
  nsFormSerialForFlight,
} from '@/utils/dataProcessor';
import {
  getNsRawFormSavedUrl,
  getRawFlightScheduleBySerialUrl,
  fetchOperationEmployees,
  type OperationEmployeeRow,
} from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';
import { toast } from 'sonner';
import {
  type ScheduleFieldsFromRawApi,
  scheduleStaDateDisplay,
  scheduleStdDateDisplay,
  scheduleStaTimeRawDisplay,
  scheduleStdTimeRawDisplay,
} from './scheduledRowSchedule';
import { routingFromMainAndFlight } from './formRoutingFromMain';
import {
  FLIGHT_DETAILS_FORM_BODY_CLASS,
  FLIGHT_DETAILS_FORM_ROOT_CLASS,
  FLIGHT_DETAILS_SECTION_CLASS,
} from './flightDetailsFormLayout';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { SearchableCombobox } from '@/components/ui/SearchableCombobox';
import type { SearchableComboOption } from '@/components/ui/SearchableCombobox';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { required, type FieldErrors } from '@/lib/form-validation';

/** Employee dropdown label: employee id containing the name, e.g. "1234 - John Doe". */
function employeeOptionLabel(code: string, name: string): string {
  const c = code.trim();
  const n = name.trim();
  if (c && n) return `${c} - ${n}`;
  return c || n;
}

function rowIdString(rowId: unknown): string {
  if (rowId == null) return '';
  if (typeof rowId === 'object' && rowId !== null && '$oid' in rowId) {
    return String((rowId as { $oid: string }).$oid);
  }
  return String(rowId);
}

const fetch = frisFetch;

function formatDisplayDate(dateStr: string): string {
  if (!dateStr?.trim()) return '';
  const parts = dateStr.trim().split(/[-/]/);
  if (parts.length !== 3) return dateStr;
  const [d, m, y] = parts;
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

const AREA_OPTIONS = ['Ramp', 'Baggage', 'Check-in', 'Security', 'Cargo', 'Other'];
const DUTY_ALLOCATION_OPTIONS = ['Supervisor', 'Lead', 'Agent', 'Coordinator', 'Other'];
const DUTY_FIELD_ORDER = ['chooseEmployee', 'area', 'dutyAllocation'] as const;

/** Directory picks keep the "code - name" label. Typed names are letters and spaces only. */
function chooseEmployeeLettersError(
  value: string,
  options: { label: string }[],
): string | null {
  const v = value.trim().replace(/\s+/g, ' ');
  if (!v) return null;
  if (options.some((o) => o.label === v)) return null;
  if (!/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(v)) {
    return 'Employee name may only contain letters.';
  }
  return null;
}
type DutyField = (typeof DUTY_FIELD_ORDER)[number];

export interface DutyAllocationFormProps {
  flight: FlightData;
  onBack?: () => void;
  mainDetails?: MainDetailsData | null;
}

export default function DutyAllocationForm({ flight, onBack, mainDetails }: DutyAllocationFormProps) {
  const displayAirline  = mainDetails?.airlineName  ?? flight.airline;
  const displayFlightNo = mainDetails?.flightCode    ?? flight.flightNo;
  const displayAircraft = mainDetails?.aircraftType  ?? flight.aircraft;
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [scheduleFromRaw, setScheduleFromRaw] = useState<ScheduleFieldsFromRawApi | null>(null);
  /** Latest row used only for flight meta fallbacks (airline, routing, etc.). */
  const [dbData, setDbData] = useState<RampDetails2Data | null>(null);
  /** All saved duty-allocation rows for this flight. */
  const [records, setRecords] = useState<RampDetails2Data[]>([]);
  const [chooseEmployee, setChooseEmployee] = useState('');
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [dutyAllocation, setDutyAllocation] = useState('');
  const [remarks, setRemarks] = useState('');
  const { errors, clearField, applyAndFocus } = useFieldErrors<DutyField>(DUTY_FIELD_ORDER);

  const [employeeOptions, setEmployeeOptions] = useState<OperationEmployeeRow[]>([]);
  const [employeesLoaded, setEmployeesLoaded] = useState(false);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const employeesInFlight = useRef(false);

  const loadEmployeesIfNeeded = useCallback(async () => {
    if (employeesLoaded || employeesInFlight.current) return;
    employeesInFlight.current = true;
    setEmployeesLoading(true);
    try {
      const list = await fetchOperationEmployees();
      setEmployeeOptions(list);
      setEmployeesLoaded(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load staff list');
    } finally {
      employeesInFlight.current = false;
      setEmployeesLoading(false);
    }
  }, [employeesLoaded]);

  const employeeComboOptions = useMemo<SearchableComboOption[]>(() => {
    const base = employeeOptions.map((e) => {
      const code = (e.code ?? '').trim();
      const empName = (e.employeeName ?? '').trim();
      return {
        id: `${code}|${empName}`,
        label: employeeOptionLabel(code, empName),
        searchIndex: `${code} ${empName}`.toLowerCase(),
        employeeCode: code,
        employeeName: empName,
      };
    });
    const current = chooseEmployee.trim();
    if (current && !base.some((o) => o.label === current)) {
      return [{ id: '__saved-employee', label: current, description: 'Saved value', searchIndex: current.toLowerCase() }, ...base];
    }
    return base;
  }, [employeeOptions, chooseEmployee]);

  const handleEmployeePick = useCallback((o: SearchableComboOption) => {
    setName((o.employeeName ?? '').trim());
  }, []);

  const serialUrl =
    flight?.slNo != null && String(flight.slNo).trim() !== ''
      ? getNsRawFormSavedUrl('ramp-details-2', nsFormSerialForFlight(flight))
      : '';

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

  useEffect(() => {
    if (!serialUrl) return;
    fetch(serialUrl)
      .then((res) => (res.ok ? res.json() : null))
      .then((raw) => {
        const list = normalizeRampDetails2List(raw);
        setRecords(list);
        setDbData(list[0] ?? null);
      })
      .catch(() => {});
  }, [serialUrl]);

  const clearForm = useCallback(() => {
    setChooseEmployee('');
    setName('');
    setArea('');
    setDutyAllocation('');
    setRemarks('');
  }, []);

  const handleDeleteRow = useCallback(
    (row: RampDetails2Data) => {
      if (!serialUrl) return;
      const idStr = rowIdString(row._id);
      if (!idStr) {
        toast.error('Cannot delete this row');
        return;
      }
      setDeletingId(idStr);
      fetch(`${serialUrl}/row/${encodeURIComponent(idStr)}`, { method: 'DELETE' })
        .then(async (res) => {
          if (!res.ok) {
            toast.error('Failed to delete employee');
            return;
          }
          setRecords((prev) => {
            const next = prev.filter((r) => rowIdString(r._id) !== idStr);
            setDbData(next[0] ?? null);
            return next;
          });
          toast.success('Employee removed');
        })
        .catch(() => toast.error('Failed to delete employee'))
        .finally(() => setDeletingId(null));
    },
    [serialUrl],
  );

  const d = dbData;
  const staDate = scheduleStaDateDisplay(flight, scheduleFromRaw);
  const stdDate = scheduleStdDateDisplay(flight, scheduleFromRaw);
  const ataDate =
    (d?.ataDate ? formatDisplayDate(d.ataDate) : '') ||
    formatDisplayDate(scheduleStaDateDisplay(flight, scheduleFromRaw));
  const atdDate =
    (d?.atdDate ? formatDisplayDate(d.atdDate) : '') ||
    formatDisplayDate(scheduleStdDateDisplay(flight, scheduleFromRaw));

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serialUrl) return;
    const next: FieldErrors<DutyField> = {};
    const empErr =
      required(chooseEmployee, 'Employee') ??
      chooseEmployeeLettersError(chooseEmployee, employeeComboOptions);
    if (empErr) next.chooseEmployee = empErr;
    if (!AREA_OPTIONS.includes(area)) next.area = 'Select an area.';
    if (!DUTY_ALLOCATION_OPTIONS.includes(dutyAllocation)) next.dutyAllocation = 'Select a duty.';
    if (applyAndFocus(next)) return;
    setIsSaving(true);
    const payload: Partial<RampDetails2Data> = {
      chooseEmployee: chooseEmployee || undefined,
      name: name || undefined,
      area: area || undefined,
      dutyAllocation: dutyAllocation || undefined,
      remarks: remarks || undefined,
      airline: displayAirline || undefined,
      aircraft: displayAircraft || undefined,
      staTime: scheduleStaTimeRawDisplay(flight, scheduleFromRaw) || undefined,
      routing: routingFromMainAndFlight(d?.routing, mainDetails, flight),
      atdDate: stdDate || undefined,
      operation: flight.flightType || undefined,
      stdDate: stdDate || undefined,
      ataDate: staDate || undefined,
      atdTime: scheduleStdTimeRawDisplay(flight, scheduleFromRaw) || undefined,
      flightNo: displayFlightNo || undefined,
      staDate: staDate || undefined,
      stdTime: scheduleStdTimeRawDisplay(flight, scheduleFromRaw) || undefined,
      ataTime: scheduleStaTimeRawDisplay(flight, scheduleFromRaw) || undefined,
    };

    // Always POST — backend allows multiple rows per flight ("Add New Details").
    fetch(serialUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        if (!res.ok) {
          toast.error('Failed to save duty allocation');
          return;
        }
        const created = await res.json().catch(() => null);
        const norm = normalizeRampDetails2Data(created);
        if (norm) {
          setRecords((prev) => [norm, ...prev]);
          setDbData(norm);
        } else if (created) {
          const row = created as RampDetails2Data;
          setRecords((prev) => [row, ...prev]);
          setDbData(row);
        }
        clearForm();
        toast.success('Duty allocation saved');
      })
      .catch(() => toast.error('Failed to save duty allocation'))
      .finally(() => setIsSaving(false));
  };

  const inputClass =
    'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition-all';
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1.5';
  const selectClass = 'w-full px-3 py-2.5 pr-9 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none appearance-none cursor-pointer';

  return (
    <div className={FLIGHT_DETAILS_FORM_ROOT_CLASS}>
      {/* Header with title and Back */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 bg-emerald-500 px-3 py-3 text-white shadow-md sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Users className="h-6 w-6 shrink-0" />
          <h2 className="text-base font-semibold sm:text-lg">Duty Allocation</h2>
        </div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-emerald-600 hover:bg-emerald-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>
        )}
      </div>

      <div className={FLIGHT_DETAILS_FORM_BODY_CLASS}>
        {/* Flight details table */}
        <section className={FLIGHT_DETAILS_SECTION_CLASS}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-3">
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-gray-600 font-medium">Serial No:</span>
                <span className="text-gray-900">{displayScheduledAirlinesTableSerial(flight)}</span>
              </div>
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-gray-600 font-medium">Aircraft:</span>
                <span className="text-gray-900">{d?.aircraft ?? displayAircraft ?? '–'}</span>
              </div>
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-gray-600 font-medium">STA Time:</span>
                <span className="text-gray-900">{scheduleStaTimeRawDisplay(flight, scheduleFromRaw) || '–'}</span>
              </div>
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-gray-600 font-medium">Routing:</span>
                <span className="text-gray-900 truncate">
                  {routingFromMainAndFlight(d?.routing, mainDetails, flight) || '–'}
                </span>
              </div>
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-gray-600 font-medium">ATD Date:</span>
                <span className="text-gray-900">{atdDate || '–'}</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-gray-600 font-medium">Airline:</span>
                <span className="text-gray-900">{d?.airline ?? displayAirline ?? '–'}</span>
              </div>
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-gray-600 font-medium">Operation:</span>
                <span className="text-gray-900">{d?.operation ?? flight.flightType ?? 'Turnaround'}</span>
              </div>
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-gray-600 font-medium">STD Date:</span>
                <span className="text-gray-900">{stdDate || '–'}</span>
              </div>
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-gray-600 font-medium">ATA Date:</span>
                <span className="text-gray-900">{ataDate || '–'}</span>
              </div>
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-gray-600 font-medium">ATD Time:</span>
                <span className="text-gray-900">{scheduleStdTimeRawDisplay(flight, scheduleFromRaw) || '–'}</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-gray-600 font-medium">Flight No.:</span>
                <span className="text-gray-900">{d?.flightNo ?? displayFlightNo ?? '–'}</span>
              </div>
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-gray-600 font-medium">STA Date:</span>
                <span className="text-gray-900">{staDate || '–'}</span>
              </div>
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-gray-600 font-medium">STD Time:</span>
                <span className="text-gray-900">{scheduleStdTimeRawDisplay(flight, scheduleFromRaw) || '–'}</span>
              </div>
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-gray-600 font-medium">ATA Time:</span>
                <span className="text-gray-900">{scheduleStaTimeRawDisplay(flight, scheduleFromRaw) || '–'}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Add New Details */}
        <section className={FLIGHT_DETAILS_SECTION_CLASS}>
          <h3 className="text-sm font-bold text-emerald-600 mb-4 border-b border-gray-200 pb-2">Add New Details</h3>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="min-w-0">
                <SearchableCombobox
                  fieldLabel="Choose Employee"
                  value={chooseEmployee}
                  onChange={(v) => {
                    setChooseEmployee(v);
                    clearField('chooseEmployee');
                    const match = employeeOptions.find(
                      (e) => employeeOptionLabel((e.code ?? '').trim(), (e.employeeName ?? '').trim()) === v,
                    );
                    setName((match?.employeeName ?? '').trim());
                  }}
                  onPickOption={handleEmployeePick}
                  options={employeeComboOptions}
                  loading={employeesLoading}
                  placeholder="Click to load, then search employee id or name…"
                  onRequestOptions={loadEmployeesIfNeeded}
                  invalid={Boolean(errors.chooseEmployee)}
                  inputProps={{
                    id: 'field-chooseEmployee',
                    'aria-describedby': errors.chooseEmployee
                      ? 'field-chooseEmployee-error'
                      : undefined,
                  }}
                />
                <FormFieldError id="field-chooseEmployee-error" message={errors.chooseEmployee} />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className={labelClass} htmlFor="field-area">Area</label>
                  <div className="relative">
                    <AdminRadioDropdown
                      id="field-area"
                      value={area}
                      onChange={(v) => {
                        setArea(v);
                        clearField('area');
                      }}
                      options={[
                        { value: '', label: 'Select area' },
                        ...AREA_OPTIONS.map((o) => ({ value: o, label: o })),
                      ]}
                      className={selectClass}
                      aria-invalid={Boolean(errors.area)}
                      aria-describedby={errors.area ? 'field-area-error' : undefined}
                    />
                    <button type="button" className="absolute right-9 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 transition-colors" title="Add area">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <FormFieldError id="field-area-error" message={errors.area} />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className={labelClass} htmlFor="field-dutyAllocation">Duty Allocation</label>
                  <div className="relative">
                    <AdminRadioDropdown
                      id="field-dutyAllocation"
                      value={dutyAllocation}
                      onChange={(v) => {
                        setDutyAllocation(v);
                        clearField('dutyAllocation');
                      }}
                      options={[
                        { value: '', label: 'Select duty' },
                        ...DUTY_ALLOCATION_OPTIONS.map((o) => ({ value: o, label: o })),
                      ]}
                      className={selectClass}
                      aria-invalid={Boolean(errors.dutyAllocation)}
                      aria-describedby={errors.dutyAllocation ? 'field-dutyAllocation-error' : undefined}
                    />
                    <button type="button" className="absolute right-9 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 transition-colors" title="Add duty">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <FormFieldError id="field-dutyAllocation-error" message={errors.dutyAllocation} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Remarks</label>
                <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} className={`${inputClass} resize-y min-h-[80px]`} placeholder="Enter remarks" />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button type="submit" disabled={isSaving} className="px-5 py-2.5 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 focus:ring-2 focus:ring-emerald-300 disabled:opacity-50">
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </section>

        <section className={FLIGHT_DETAILS_SECTION_CLASS}>
          <h3 className="text-sm font-bold text-emerald-600 mb-4 border-b border-gray-200 pb-2">
            Added employees
          </h3>
          {records.length === 0 ? (
            <p className="text-sm text-gray-500">No employees added yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left p-2.5 font-semibold text-gray-700">Employee</th>
                    <th className="text-left p-2.5 font-semibold text-gray-700">Area</th>
                    <th className="text-left p-2.5 font-semibold text-gray-700">Duty Allocation</th>
                    <th className="text-left p-2.5 font-semibold text-gray-700">Remarks</th>
                    <th className="w-12 p-2.5 text-right font-semibold text-gray-700">
                      <span className="sr-only">Delete</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((row, idx) => {
                    const idStr = rowIdString(row._id);
                    const isDeleting = deletingId != null && deletingId === idStr;
                    return (
                      <tr
                        key={idStr || `row-${idx}`}
                        className="border-b border-gray-100"
                      >
                        <td className="p-2.5">
                          {row.chooseEmployee?.trim() || row.name?.trim() || '–'}
                        </td>
                        <td className="p-2.5">{row.area?.trim() || '–'}</td>
                        <td className="p-2.5">{row.dutyAllocation?.trim() || '–'}</td>
                        <td className="p-2.5">{row.remarks?.trim() || '–'}</td>
                        <td className="p-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(row)}
                            disabled={!idStr || isDeleting}
                            aria-label={`Delete ${row.chooseEmployee?.trim() || row.name?.trim() || 'employee'}`}
                            title="Delete"
                            className="inline-flex items-center justify-center rounded-md p-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
