'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Pencil, Save, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  advanceCreate,
  advanceDelete,
  advanceDocId,
  advanceList,
  advanceUpdate,
  ADVANCE_PATHS,
  fetchScheduleEquipmentReferenceAirlines,
  fetchScheduleEquipmentReferenceEquipment,
} from '@/lib/api';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  normalizeText,
  positiveInteger,
  type FieldErrors,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  GATEWAY_PAGE_ROOT,
  GATEWAY_FORM_SECTION,
  GATEWAY_FORM_INNER,
  GATEWAY_FORM_GRID_4,
  GATEWAY_FORM_FIELD,
  GATEWAY_LABEL,
  GATEWAY_LABEL_SPACER,
  GATEWAY_CHECKBOX_CONTROL,
  GATEWAY_CHECKBOX_INPUT,
  GATEWAY_CONTROL,
  GATEWAY_FILTER_BAR,
  GATEWAY_FILTER_INPUT,
  GATEWAY_TABLE_SECTION,
  GATEWAY_TABLE_SCROLL,
  GATEWAY_GET_BTN,
  GATEWAY_SAVE_BTN,
  GATEWAY_SECONDARY_BTN,
  gatewayControlClass,
} from '@/components/fris/advance/gatewayPageLayout';

const PATH = ADVANCE_PATHS.scheduleEquipment;

const AIRCRAFT_BODY_OPTIONS = ['NB', 'WB'] as const;
const BASIS_OPTIONS = ['ATA', 'ATD'] as const;
const SIGN_OPTIONS = ['Plus', 'Minus'] as const;
const REMARKS_OPTIONS = ['Arrival', 'Departure'] as const;

type AircraftBody = (typeof AIRCRAFT_BODY_OPTIONS)[number];
type Basis = (typeof BASIS_OPTIONS)[number];
type Sign = (typeof SIGN_OPTIONS)[number];

type AirlineOption = { id: string; name: string; code: string };
type EquipmentOption = { id: string; name: string; code: string };

export type ScheduleEquipmentRow = {
  id: string;
  airlineName: string;
  airlineCode: string;
  aircraftBody: AircraftBody;
  splitOperation: boolean;
  equipmentName: string;
  equipmentCode: string;
  timeRequired: boolean;
  option1Basis: Basis;
  option1Sign: Sign;
  option1Minutes: number;
  option2Basis: Basis;
  option2Sign: Sign;
  option2Minutes: number;
  remarks: string;
};

type FormState = {
  airlineId: string;
  aircraftBody: AircraftBody;
  splitOperation: boolean;
  equipmentId: string;
  timeRequired: boolean;
  option1Basis: Basis;
  option1Sign: Sign;
  option1Minutes: string;
  option2Basis: Basis;
  option2Sign: Sign;
  option2Minutes: string;
  remarks: string;
};

const EMPTY_FORM: FormState = {
  airlineId: '',
  aircraftBody: 'NB',
  splitOperation: false,
  equipmentId: '',
  timeRequired: false,
  option1Basis: 'ATA',
  option1Sign: 'Minus',
  option1Minutes: '0',
  option2Basis: 'ATD',
  option2Sign: 'Plus',
  option2Minutes: '0',
  remarks: 'Arrival',
};

const PAGE_SIZE = 10;
const MINUTES_MAX = 9999;

const FIELD_ORDER = [
  'airlineId',
  'aircraftBody',
  'equipmentId',
  'option1Minutes',
  'option2Minutes',
  'remarks',
] as const;
type ScheduleEquipmentField = (typeof FIELD_ORDER)[number];

/** Compact controls for Option 1 / Option 2 / Remarks row — uniform width per field. */
const OPTION_FIELD_WIDTH = 'w-[5.5rem]';

const OPTION_COMPACT_DROPDOWN =
  'box-border !h-8 !min-h-8 w-full rounded-md border border-gray-200 bg-white !px-2 !py-1 text-xs text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';

const OPTION_COMPACT_DROPDOWN_INVALID =
  'box-border !h-8 !min-h-8 w-full rounded-md border border-red-500 bg-white !px-2 !py-1 text-xs text-gray-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200';

const OPTION_COMPACT_MINUTES =
  'box-border h-8 w-full min-w-0 rounded-md border border-gray-200 bg-white px-1.5 text-center text-xs text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';

const OPTION_COMPACT_MINUTES_INVALID =
  'box-border h-8 w-full min-w-0 rounded-md border border-red-500 bg-white px-1.5 text-center text-xs text-gray-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200';

function optionDropdownClass(invalid?: boolean): string {
  return invalid ? OPTION_COMPACT_DROPDOWN_INVALID : OPTION_COMPACT_DROPDOWN;
}

function optionMinutesClass(invalid?: boolean): string {
  return invalid ? OPTION_COMPACT_MINUTES_INVALID : OPTION_COMPACT_MINUTES;
}

function toRow(doc: Record<string, unknown>): ScheduleEquipmentRow {
  const d = advanceDocId(doc);
  const sign = (v: unknown, fallback: Sign): Sign =>
    String(v) === 'Plus' || String(v) === 'Minus' ? (String(v) as Sign) : fallback;
  const basis = (v: unknown, fallback: Basis): Basis =>
    String(v).toUpperCase() === 'ATD' ? 'ATD' : fallback;
  const body = (v: unknown): AircraftBody =>
    String(v).toUpperCase() === 'WB' ? 'WB' : 'NB';

  return {
    id: d.id,
    airlineName: String(d.airlineName ?? ''),
    airlineCode: String(d.airlineCode ?? ''),
    aircraftBody: body(d.aircraftBody),
    splitOperation: d.splitOperation === true,
    equipmentName: String(d.equipmentName ?? ''),
    equipmentCode: String(d.equipmentCode ?? ''),
    timeRequired: d.timeRequired === true,
    option1Basis: basis(d.option1Basis, 'ATA'),
    option1Sign: sign(d.option1Sign, 'Minus'),
    option1Minutes: Number(d.option1Minutes ?? 0) || 0,
    option2Basis: basis(d.option2Basis, 'ATD'),
    option2Sign: sign(d.option2Sign, 'Plus'),
    option2Minutes: Number(d.option2Minutes ?? 0) || 0,
    remarks: String(d.remarks ?? ''),
  };
}

function formatEquipmentLabel(e: EquipmentOption): string {
  const name = e.name.trim();
  const code = e.code.trim().toUpperCase();
  if (name && code) return `${code} — ${name}`;
  return code || name;
}

/** Table cell: Option 1 / Option 2 — basis | sign | minutes. */
function formatOptionSummary(basis: Basis, sign: Sign, minutes: number): string {
  return `${basis} | ${sign} | ${minutes} Min`;
}

function OptionGroup({
  label,
  basis,
  sign,
  minutes,
  minutesId,
  minutesError,
  minutesErrorId,
  disabled,
  onBasisChange,
  onSignChange,
  onMinutesChange,
  onMinutesBlur,
}: {
  label: string;
  basis: Basis;
  sign: Sign;
  minutes: string;
  minutesId: string;
  minutesError?: string;
  minutesErrorId: string;
  disabled?: boolean;
  onBasisChange: (v: Basis) => void;
  onSignChange: (v: Sign) => void;
  onMinutesChange: (v: string) => void;
  onMinutesBlur?: () => void;
}) {
  return (
    <div className="w-full min-w-0 max-w-full">
      <span className={GATEWAY_LABEL}>{label}</span>
      <div className="mt-1.5 flex w-full min-w-0 items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <AdminRadioDropdown
            value={basis}
            onChange={(v) => onBasisChange(v as Basis)}
            options={[...BASIS_OPTIONS]}
            className={OPTION_COMPACT_DROPDOWN}
            disabled={disabled}
            aria-label={`${label} basis`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <AdminRadioDropdown
            value={sign}
            onChange={(v) => onSignChange(v as Sign)}
            options={[...SIGN_OPTIONS]}
            className={OPTION_COMPACT_DROPDOWN}
            disabled={disabled}
            aria-label={`${label} sign`}
          />
        </div>
        <div className="min-w-0 w-16 shrink-0">
          <input
            id={minutesId}
            name={minutesId.replace(/^field-/, '')}
            type="text"
            inputMode="numeric"
            value={minutes}
            aria-invalid={!!minutesError}
            aria-describedby={minutesError ? minutesErrorId : undefined}
            onChange={(e) =>
              onMinutesChange(e.target.value.replace(/[^\d]/g, '').slice(0, 4))
            }
            onBlur={onMinutesBlur}
            className={optionMinutesClass(!!minutesError)}
            aria-label={`${label} minutes`}
            disabled={disabled}
            maxLength={4}
          />
        </div>
        <span className="shrink-0 text-xs font-medium text-gray-600">Min</span>
      </div>
      <FormFieldError id={minutesErrorId} message={minutesError} />
    </div>
  );
}

export default function ScheduleEquipmentSetupPage() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [rows, setRows] = useState<ScheduleEquipmentRow[]>([]);
  const [airlines, setAirlines] = useState<AirlineOption[]>([]);
  const [equipmentOptions, setEquipmentOptions] = useState<EquipmentOption[]>([]);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const { errors, clearAll, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<ScheduleEquipmentField>(FIELD_ORDER);

  const selectedAirline = useMemo(
    () => airlines.find((a) => a.id === form.airlineId) ?? null,
    [airlines, form.airlineId],
  );

  const selectedEquipment = useMemo(
    () => equipmentOptions.find((e) => e.id === form.equipmentId) ?? null,
    [equipmentOptions, form.equipmentId],
  );

  const loadMasters = useCallback(async () => {
    try {
      const [airlineDocs, equipmentDocs] = await Promise.all([
        fetchScheduleEquipmentReferenceAirlines() as Promise<Record<string, unknown>[]>,
        fetchScheduleEquipmentReferenceEquipment() as Promise<Record<string, unknown>[]>,
      ]);
      setAirlines(
        airlineDocs
          .map((doc) => {
            const d = advanceDocId(doc);
            return {
              id: d.id,
              name: String(d.name ?? '').trim(),
              code: String(d.code ?? '').trim(),
            };
          })
          .filter((a) => a.id && a.name && a.code),
      );
      setEquipmentOptions(
        equipmentDocs
          .filter((doc) => doc.active !== false)
          .map((doc) => {
            const d = advanceDocId(doc);
            return {
              id: d.id,
              name: String(d.equipmentName ?? '').trim(),
              code: String(d.equipmentCode ?? '').trim(),
            };
          })
          .filter((e) => e.id && e.name && e.code),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load master data');
    }
  }, []);

  const fetchList = useCallback(async (filterTerm?: string) => {
    setListLoading(true);
    try {
      const list = (await advanceList(
        PATH,
        filterTerm?.trim() ? { filter: filterTerm } : undefined,
      )) as Record<string, unknown>[];
      setRows(list.map(toRow));
      setPage(1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load records');
      setRows([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMasters();
    void fetchList();
  }, [loadMasters, fetchList]);

  const filteredRows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [
        row.airlineName,
        row.airlineCode,
        row.equipmentName,
        row.equipmentCode,
        row.remarks,
        row.aircraftBody,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [rows, filter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    clearAll();
  };

  const validateMinutes = (value: string, label: string): string | null => {
    const raw = value.trim() === '' ? '0' : value.trim();
    return positiveInteger(raw, label, { min: 0, max: MINUTES_MAX, allowEmpty: false });
  };

  const validateForm = (): FieldErrors<ScheduleEquipmentField> => {
    const next: FieldErrors<ScheduleEquipmentField> = {};

    if (!form.airlineId.trim() || !selectedAirline) {
      next.airlineId = 'Select an airline.';
    } else if (!selectedAirline.name || !selectedAirline.code) {
      next.airlineId = 'Invalid airline selection.';
    }

    if (!form.aircraftBody) {
      next.aircraftBody = 'Select an aircraft body.';
    }

    if (!form.equipmentId.trim() || !selectedEquipment) {
      next.equipmentId = 'Select equipment.';
    } else if (!selectedEquipment.name || !selectedEquipment.code) {
      next.equipmentId = 'Invalid equipment selection.';
    }

    const o1Err = validateMinutes(form.option1Minutes, 'Option 1 minutes');
    if (o1Err) next.option1Minutes = o1Err;
    const o2Err = validateMinutes(form.option2Minutes, 'Option 2 minutes');
    if (o2Err) next.option2Minutes = o2Err;

    if (
      form.timeRequired &&
      !o1Err &&
      !o2Err &&
      (Number(form.option1Minutes) || 0) === 0 &&
      (Number(form.option2Minutes) || 0) === 0
    ) {
      next.option1Minutes =
        'Enter minutes for at least one option when Time Required is checked.';
    }

    const remarks = normalizeText(form.remarks);
    if (!remarks || !(REMARKS_OPTIONS as readonly string[]).includes(remarks)) {
      next.remarks = 'Select remarks.';
    }

    return next;
  };

  const handleSave = async () => {
    if (loading) return;

    const next = validateForm();
    if (applyAndFocus(next)) return;

    if (!selectedAirline || !selectedEquipment) return;

    const option1Minutes = Number(form.option1Minutes.trim() || '0') || 0;
    const option2Minutes = Number(form.option2Minutes.trim() || '0') || 0;
    const remarks = normalizeText(form.remarks) || 'Arrival';

    const body = {
      airlineName: selectedAirline.name,
      airlineCode: selectedAirline.code,
      aircraftBody: form.aircraftBody,
      splitOperation: form.splitOperation,
      equipmentName: selectedEquipment.name,
      equipmentCode: selectedEquipment.code,
      timeRequired: form.timeRequired,
      option1Basis: form.option1Basis,
      option1Sign: form.option1Sign,
      option1Minutes,
      option2Basis: form.option2Basis,
      option2Sign: form.option2Sign,
      option2Minutes,
      remarks,
      active: true,
    };

    setLoading(true);
    try {
      if (editingId) {
        await advanceUpdate(PATH, editingId, body);
        toast.success('Updated successfully');
      } else {
        await advanceCreate(PATH, body);
        toast.success('Saved successfully');
      }
      resetForm();
      await fetchList(filter);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setFieldError('airlineId', msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (row: ScheduleEquipmentRow) => {
    const airline =
      airlines.find(
        (a) =>
          a.code.toUpperCase() === row.airlineCode.toUpperCase() ||
          a.name.toLowerCase() === row.airlineName.toLowerCase(),
      ) ?? null;
    const equipment =
      equipmentOptions.find(
        (e) =>
          e.code.toUpperCase() === row.equipmentCode.toUpperCase() ||
          e.name.toLowerCase() === row.equipmentName.toLowerCase(),
      ) ?? null;

    setForm({
      airlineId: airline?.id ?? '',
      aircraftBody: row.aircraftBody,
      splitOperation: row.splitOperation,
      equipmentId: equipment?.id ?? '',
      timeRequired: row.timeRequired,
      option1Basis: row.option1Basis,
      option1Sign: row.option1Sign,
      option1Minutes: String(row.option1Minutes),
      option2Basis: row.option2Basis,
      option2Sign: row.option2Sign,
      option2Minutes: String(row.option2Minutes),
      remarks: row.remarks,
    });
    setEditingId(row.id);
    clearAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    try {
      await advanceDelete(PATH, id);
      toast.success('Deleted');
      if (editingId === id) resetForm();
      await fetchList(filter);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const airlineDropdownOptions = useMemo(
    () =>
      airlines
        .map((a) => ({
          value: a.id,
          label: a.code && a.name ? `${a.code} — ${a.name}` : a.name || a.code,
        }))
        .filter((item) => item.label),
    [airlines],
  );

  const equipmentDropdownOptions = useMemo(() => {
    const seen = new Set<string>();
    const items: { value: string; label: string }[] = [];
    for (const e of equipmentOptions) {
      const dedupeKey = e.code.trim().toUpperCase() || e.id;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      items.push({ value: e.id, label: formatEquipmentLabel(e) });
    }
    return items;
  }, [equipmentOptions]);

  return (
    <div className={GATEWAY_PAGE_ROOT}>
      <section className={GATEWAY_FORM_SECTION}>
        <div className={GATEWAY_FORM_INNER}>
          <h2 className="mb-4 text-lg font-semibold text-gray-900 sm:text-xl">
            Scheduled Airline Equipment
          </h2>

          <div className={`${GATEWAY_FORM_GRID_4} gap-y-5`}>
            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-airlineId">
                Airline
              </label>
              <AdminRadioDropdown
                id="field-airlineId"
                value={form.airlineId}
                onChange={(id) => {
                  setForm((f) => ({ ...f, airlineId: id }));
                  clearField('airlineId');
                }}
                onBlur={() => {
                  if (!form.airlineId.trim()) {
                    setFieldError('airlineId', 'Select an airline.');
                  }
                }}
                options={airlineDropdownOptions}
                placeholder="Select airline"
                aria-invalid={!!errors.airlineId}
                aria-describedby={errors.airlineId ? 'field-airlineId-error' : undefined}
                className={gatewayControlClass(!!errors.airlineId)}
                disabled={loading}
                searchable
              />
              <FormFieldError id="field-airlineId-error" message={errors.airlineId} />
            </div>

            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL}>Airline Code</label>
              <input
                type="text"
                readOnly
                value={selectedAirline?.code ?? ''}
                className={`${GATEWAY_CONTROL} cursor-default bg-gray-50 uppercase`}
                placeholder="—"
                title="Filled automatically from the selected airline"
              />
              <FormFieldError />
            </div>

            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-aircraftBody">
                Aircraft Body
              </label>
              <AdminRadioDropdown
                id="field-aircraftBody"
                value={form.aircraftBody}
                onChange={(v) => {
                  setForm((f) => ({ ...f, aircraftBody: v as AircraftBody }));
                  clearField('aircraftBody');
                }}
                options={[...AIRCRAFT_BODY_OPTIONS]}
                aria-invalid={!!errors.aircraftBody}
                aria-describedby={
                  errors.aircraftBody ? 'field-aircraftBody-error' : undefined
                }
                className={gatewayControlClass(!!errors.aircraftBody)}
                disabled={loading}
              />
              <FormFieldError id="field-aircraftBody-error" message={errors.aircraftBody} />
            </div>

            <div className={GATEWAY_FORM_FIELD}>
              <label className={GATEWAY_LABEL} htmlFor="field-equipmentId">
                Equipment
              </label>
              <AdminRadioDropdown
                id="field-equipmentId"
                value={form.equipmentId}
                onChange={(id) => {
                  setForm((f) => ({ ...f, equipmentId: id }));
                  clearField('equipmentId');
                }}
                onBlur={() => {
                  if (!form.equipmentId.trim()) {
                    setFieldError('equipmentId', 'Select equipment.');
                  }
                }}
                options={equipmentDropdownOptions}
                placeholder="Select equipment"
                aria-invalid={!!errors.equipmentId}
                aria-describedby={
                  errors.equipmentId ? 'field-equipmentId-error' : undefined
                }
                className={gatewayControlClass(!!errors.equipmentId)}
                disabled={loading}
                searchable
              />
              <FormFieldError id="field-equipmentId-error" message={errors.equipmentId} />
            </div>

            <div className={GATEWAY_FORM_FIELD}>
              <span className={GATEWAY_LABEL_SPACER} aria-hidden="true">
                &nbsp;
              </span>
              <label className={GATEWAY_CHECKBOX_CONTROL}>
                <input
                  type="checkbox"
                  checked={form.splitOperation}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, splitOperation: e.target.checked }))
                  }
                  className={GATEWAY_CHECKBOX_INPUT}
                  disabled={loading}
                />
                <span className="text-sm font-medium text-gray-700">Split Operation</span>
              </label>
              <FormFieldError />
            </div>

            <div className={`${GATEWAY_FORM_FIELD} sm:col-span-2`}>
              <span className={GATEWAY_LABEL_SPACER} aria-hidden="true">
                &nbsp;
              </span>
              <label className={GATEWAY_CHECKBOX_CONTROL}>
                <input
                  type="checkbox"
                  checked={form.timeRequired}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, timeRequired: e.target.checked }));
                    clearField('option1Minutes');
                    clearField('option2Minutes');
                  }}
                  className={GATEWAY_CHECKBOX_INPUT}
                  disabled={loading}
                />
                <span className="text-sm font-medium text-gray-700">Time Required</span>
              </label>
              <FormFieldError />
            </div>

            <div className="sm:col-span-2 lg:col-span-4">
              <p className="text-xs leading-relaxed text-red-600 sm:text-sm">
                Note: When Time Required is checked, equipment time is calculated from ATA/ATD
                options below; otherwise timing defaults to 0.00.
              </p>
            </div>

            <div className="sm:col-span-2 lg:col-span-4">
              <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:gap-0">
                <OptionGroup
                  label="Option 1"
                  basis={form.option1Basis}
                  sign={form.option1Sign}
                  minutes={form.option1Minutes}
                  minutesId="field-option1Minutes"
                  minutesError={errors.option1Minutes}
                  minutesErrorId="field-option1Minutes-error"
                  disabled={loading}
                  onBasisChange={(v) => setForm((f) => ({ ...f, option1Basis: v }))}
                  onSignChange={(v) => setForm((f) => ({ ...f, option1Sign: v }))}
                  onMinutesChange={(v) => {
                    setForm((f) => ({ ...f, option1Minutes: v }));
                    clearField('option1Minutes');
                  }}
                  onMinutesBlur={() => {
                    setFieldError(
                      'option1Minutes',
                      validateMinutes(form.option1Minutes, 'Option 1 minutes'),
                    );
                  }}
                />

                <div className="min-w-0 border-t border-gray-200 pt-4 lg:ml-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                  <OptionGroup
                    label="Option 2"
                    basis={form.option2Basis}
                    sign={form.option2Sign}
                    minutes={form.option2Minutes}
                    minutesId="field-option2Minutes"
                    minutesError={errors.option2Minutes}
                    minutesErrorId="field-option2Minutes-error"
                    disabled={loading}
                    onBasisChange={(v) => setForm((f) => ({ ...f, option2Basis: v }))}
                    onSignChange={(v) => setForm((f) => ({ ...f, option2Sign: v }))}
                    onMinutesChange={(v) => {
                      setForm((f) => ({ ...f, option2Minutes: v }));
                      clearField('option2Minutes');
                    }}
                    onMinutesBlur={() => {
                      setFieldError(
                        'option2Minutes',
                        validateMinutes(form.option2Minutes, 'Option 2 minutes'),
                      );
                    }}
                  />
                </div>

                <div className="w-fit shrink-0 border-t border-gray-200 pt-4 lg:ml-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                  <label className={GATEWAY_LABEL} htmlFor="field-remarks">
                    Remarks
                  </label>
                  <div className={`mt-1.5 shrink-0 ${OPTION_FIELD_WIDTH}`}>
                    <AdminRadioDropdown
                      id="field-remarks"
                      value={form.remarks}
                      onChange={(v) => {
                        setForm((f) => ({ ...f, remarks: v }));
                        clearField('remarks');
                      }}
                      onBlur={() => {
                        if (!normalizeText(form.remarks)) {
                          setFieldError('remarks', 'Select remarks.');
                        }
                      }}
                      options={[...REMARKS_OPTIONS]}
                      placeholder="Select"
                      aria-invalid={!!errors.remarks}
                      aria-describedby={errors.remarks ? 'field-remarks-error' : undefined}
                      className={optionDropdownClass(!!errors.remarks)}
                      disabled={loading}
                    />
                  </div>
                  <FormFieldError id="field-remarks-error" message={errors.remarks} />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-4">
            {editingId ? (
              <motion.button
                type="button"
                onClick={resetForm}
                disabled={loading}
                whileTap={{ scale: 0.98 }}
                className={GATEWAY_SECONDARY_BTN}
              >
                Cancel
              </motion.button>
            ) : null}
            <motion.button
              type="button"
              onClick={() => void handleSave()}
              disabled={loading}
              whileHover={loading ? undefined : { scale: 1.02 }}
              whileTap={loading ? undefined : { scale: 0.98 }}
              aria-busy={loading}
              className={GATEWAY_SAVE_BTN}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              {loading ? 'Saving…' : editingId ? 'Update' : 'Save'}
            </motion.button>
          </div>
        </div>
      </section>

      <section className={GATEWAY_TABLE_SECTION}>
        <div className={GATEWAY_FILTER_BAR}>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <input
              type="search"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(1);
              }}
              placeholder="Filter airline, equipment, remarks…"
              className={GATEWAY_FILTER_INPUT}
            />
          </div>
          <motion.button
            type="button"
            onClick={() => void fetchList(filter)}
            disabled={listLoading}
            whileTap={{ scale: 0.98 }}
            className={GATEWAY_GET_BTN}
          >
            {listLoading ? 'Loading…' : 'Refresh'}
          </motion.button>
        </div>

        <div className={GATEWAY_TABLE_SCROLL}>
          <table className="min-w-[880px] w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-emerald-200/80 bg-emerald-600 text-white">
              <tr>
                {[
                  'Airline',
                  'Equipment',
                  'Time Req.',
                  'Option 1',
                  'Option 2',
                  'Remarks',
                  'Split',
                  'Edit',
                  'Delete',
                ].map((col) => (
                  <th
                    key={col}
                    className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide sm:px-4 sm:text-sm"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-gray-500">
                    {listLoading
                      ? 'Loading records…'
                      : 'No equipment schedules yet. Add one using the form above.'}
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-gray-100 odd:bg-white even:bg-gray-50/60 hover:bg-emerald-50/40"
                  >
                    <td className="px-3 py-3 text-gray-900 sm:px-4">{row.airlineName}</td>
                    <td className="max-w-[10rem] truncate px-3 py-3 text-gray-900 sm:max-w-none sm:px-4">
                      {row.equipmentName}
                    </td>
                    <td className="px-3 py-3 text-gray-700 sm:px-4">
                      {row.timeRequired ? 'True' : 'False'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-gray-700 sm:px-4">
                      {formatOptionSummary(
                        row.option1Basis,
                        row.option1Sign,
                        row.option1Minutes,
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-gray-700 sm:px-4">
                      {formatOptionSummary(
                        row.option2Basis,
                        row.option2Sign,
                        row.option2Minutes,
                      )}
                    </td>
                    <td className="max-w-[8rem] truncate px-3 py-3 text-gray-700 sm:max-w-none sm:px-4">
                      {row.remarks}
                    </td>
                    <td className="px-3 py-3 text-gray-700 sm:px-4">
                      {row.splitOperation ? 'Yes' : 'No'}
                    </td>
                    <td className="px-3 py-3 text-right sm:px-4">
                      <motion.button
                        type="button"
                        onClick={() => handleEdit(row)}
                        whileTap={{ scale: 0.95 }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </motion.button>
                    </td>
                    <td className="px-3 py-3 text-right sm:px-4">
                      <motion.button
                        type="button"
                        onClick={() => void handleDelete(row.id)}
                        whileTap={{ scale: 0.95 }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </motion.button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredRows.length > PAGE_SIZE ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-emerald-100 bg-emerald-50/80 px-4 py-3">
            <p className="text-xs text-gray-600 sm:text-sm">
              Showing {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
            </p>
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  className={`min-h-9 min-w-9 rounded-lg px-2 text-sm font-medium transition-colors ${
                    n === safePage
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-emerald-50'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
