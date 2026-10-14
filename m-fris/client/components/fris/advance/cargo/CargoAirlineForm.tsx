'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Loader2, Pencil, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { advanceDocId, fetchCargoReferenceAirlines } from '@/lib/api';
import {
  airlineCode as validateAirlineCode,
  maxLength,
  minLength,
  normalizeText,
  personName,
  required,
  runValidators,
  type FieldErrors,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  deleteAdvanceCargo,
  getAdvanceCargo,
  upsertAdvanceCargoSection,
} from '@/lib/advance-cargo';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAdvanceCargo } from './AdvanceCargoContext';
import {
  CARGO_CHECKBOX_CLASS,
  CARGO_VISIBLE_SCROLL,
  cargoInputClass,
} from './cargoFormStyles';

const FIELD_ORDER = ['airlineName', 'code', 'airlineType', 'address'] as const;
type CargoAirlineField = (typeof FIELD_ORDER)[number];

function validateCargoAirlineForm(values: {
  airlineName: string;
  code: string;
  airlineType: string;
  address: string;
}): FieldErrors<CargoAirlineField> {
  const airlineName = normalizeText(values.airlineName);
  const code = values.code.trim().toUpperCase();
  const address = normalizeText(values.address);
  const next: FieldErrors<CargoAirlineField> = {};

  const airlineNameErr = runValidators(
    required(airlineName, 'Airline name'),
    minLength(airlineName, 2, 'Airline name'),
    maxLength(airlineName, 100, 'Airline name'),
    personName(airlineName, 'Airline name'),
  );
  if (airlineNameErr) next.airlineName = airlineNameErr;

  const codeErr = runValidators(required(code, 'Code'), validateAirlineCode(code, 'Code'));
  if (codeErr) next.code = codeErr;

  if (!values.airlineType.trim()) {
    next.airlineType = 'Select an airline type.';
  }

  const addressErr = maxLength(address, 250, 'Address');
  if (addressErr) next.address = addressErr;

  return next;
}

function ScheduledAirlineTransferButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.96 }}
      className="group inline-flex items-center gap-1 rounded-lg border border-emerald-200/90 bg-gradient-to-r from-emerald-50 to-white px-2 py-1.5 text-[11px] font-semibold text-emerald-800 shadow-sm ring-1 ring-emerald-500/10 transition-[box-shadow,border-color,background-color] hover:border-emerald-400 hover:from-emerald-100 hover:to-emerald-50/90 hover:shadow-md hover:ring-emerald-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
      title="Copy airline name and code to the form"
    >
      <span>Use</span>
      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/15 transition-colors group-hover:bg-emerald-500/25">
        <ArrowRight
          className="h-3.5 w-3.5 text-emerald-600 transition-transform group-hover:translate-x-px"
          aria-hidden
        />
      </span>
    </motion.button>
  );
}

type AirlineRow = {
  id: string;
  name: string;
  code: string;
};

export default function CargoAirlineForm() {
  const { setEntryKey, refresh, record, entryKey } = useAdvanceCargo();
  const [form, setForm] = useState({
    airlineName: '',
    code: '',
    airlineType: '',
    address: '',
    followFrisSchedule: false,
  });
  const [rows, setRows] = useState<AirlineRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transferredId, setTransferredId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AirlineRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { errors, clearAll, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<CargoAirlineField>(FIELD_ORDER);

  const fetchAirlines = useCallback(async () => {
    setListLoading(true);
    try {
      const list = (await fetchCargoReferenceAirlines()) as Record<string, unknown>[];
      const mapped = list
        .map((doc) => {
          const row = advanceDocId(doc);
          const rawName = row.name ?? row.airlineName ?? row.airline ?? '';
          const rawCode = row.code ?? row.airlineCode ?? row.airline_code ?? '';
          return {
            id: row.id,
            name: String(rawName).trim(),
            code: String(rawCode).trim(),
          };
        })
        .filter((row) => row.name || row.code);
      setRows(mapped);
    } catch {
      setRows([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAirlines();
  }, [fetchAirlines]);

  useEffect(() => {
    const saved = record?.sections?.cargoAirline as Record<string, unknown> | undefined;
    if (!saved) return;
    setForm({
      airlineName: String(saved.airlineName ?? '').trim(),
      code: String(saved.code ?? record?.entryKey ?? '').trim(),
      airlineType: String(saved.airlineType ?? '').trim(),
      address: String(saved.address ?? '').trim(),
      followFrisSchedule: saved.followFrisSchedule === true,
    });
    clearAll();
  }, [record, clearAll]);

  const handleTransfer = (row: AirlineRow) => {
    clearAll();
    setForm((prev) => ({
      ...prev,
      airlineName: row.name,
      code: row.code,
    }));
    setEntryKey(row.code);
    setTransferredId(row.id);
    toast.success(`${row.code || row.name} copied to the form.`);
    window.setTimeout(() => {
      setTransferredId((current) => (current === row.id ? null : current));
    }, 1600);
  };

  const handleEdit = async (row: AirlineRow) => {
    clearAll();
    setForm((prev) => ({
      ...prev,
      airlineName: row.name,
      code: row.code,
    }));
    setEntryKey(row.code);
    setTransferredId(row.id);

    const code = row.code.trim().toUpperCase();
    if (!code) {
      toast.info('Loaded airline into the form.');
      return;
    }

    try {
      const doc = await getAdvanceCargo(code);
      const saved = doc?.sections?.cargoAirline as Record<string, unknown> | undefined;
      if (saved) {
        setForm({
          airlineName: String(saved.airlineName ?? row.name).trim(),
          code: String(saved.code ?? row.code).trim().toUpperCase(),
          airlineType: String(saved.airlineType ?? '').trim(),
          address: String(saved.address ?? '').trim(),
          followFrisSchedule: saved.followFrisSchedule === true,
        });
        await refresh();
        toast.success(`Editing cargo airline ${code}.`);
      } else {
        toast.info(`Loaded ${row.code || row.name}. Save to create a cargo record.`);
      }
    } catch {
      toast.info(`Loaded ${row.code || row.name}. Save to create a cargo record.`);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const code = deleteTarget.code.trim().toUpperCase();
    if (!code) {
      toast.error('This airline has no code and cannot be deleted.');
      setDeleteTarget(null);
      return;
    }

    setDeleting(true);
    try {
      await deleteAdvanceCargo(code);
      if (entryKey.trim().toUpperCase() === code) {
        setForm({
          airlineName: '',
          code: '',
          airlineType: '',
          address: '',
          followFrisSchedule: false,
        });
        setEntryKey('');
        clearAll();
      }
      await refresh();
      toast.success(`Deleted cargo airline ${code}.`);
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    const next = validateCargoAirlineForm(form);
    if (applyAndFocus(next)) return;

    const airlineName = normalizeText(form.airlineName);
    const code = form.code.trim().toUpperCase();
    const address = normalizeText(form.address);
    setForm((prev) => ({ ...prev, airlineName, code, address }));

    setSaving(true);
    try {
      await upsertAdvanceCargoSection({
        entryKey: code,
        section: 'cargoAirline',
        data: {
          airlineName,
          code,
          airlineType: form.airlineType,
          address,
          followFrisSchedule: form.followFrisSchedule,
        },
      });
      setEntryKey(code);
      await refresh();
      clearAll();
      toast.success('Cargo airline saved.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setFieldError('airlineName', msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="overflow-visible rounded-xl border border-gray-200 bg-gray-50/50">
      <div className="grid grid-cols-1 items-start gap-4 p-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="field-airlineName">
              Airline Name
            </label>
            <input
              id="field-airlineName"
              name="airlineName"
              type="text"
              value={form.airlineName}
              aria-invalid={!!errors.airlineName}
              aria-describedby={errors.airlineName ? 'field-airlineName-error' : undefined}
              onChange={(e) => {
                const raw = e.target.value;
                const letters = raw.replace(/[^A-Za-z ]/g, '');
                setForm((prev) => ({ ...prev, airlineName: letters }));
                setFieldError(
                  'airlineName',
                  letters !== raw ? 'Airline name may only contain letters and spaces.' : null,
                );
              }}
              onBlur={(e) => {
                const airlineName = normalizeText(e.target.value);
                setForm((prev) => ({ ...prev, airlineName }));
                setFieldError(
                  'airlineName',
                  runValidators(
                    required(airlineName, 'Airline name'),
                    minLength(airlineName, 2, 'Airline name'),
                    maxLength(airlineName, 100, 'Airline name'),
                    personName(airlineName, 'Airline name'),
                  ),
                );
              }}
              className={cargoInputClass(!!errors.airlineName)}
              placeholder="Enter airline name"
              maxLength={100}
              disabled={saving}
            />
            <FormFieldError id="field-airlineName-error" message={errors.airlineName} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="field-code">
              Code
            </label>
            <input
              id="field-code"
              name="code"
              type="text"
              value={form.code}
              aria-invalid={!!errors.code}
              aria-describedby={errors.code ? 'field-code-error' : undefined}
              onChange={(e) => {
                const code = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
                setForm((prev) => ({ ...prev, code }));
                clearField('code');
              }}
              onBlur={(e) => {
                const code = e.target.value.trim().toUpperCase();
                setForm((prev) => ({ ...prev, code }));
                setFieldError(
                  'code',
                  runValidators(required(code, 'Code'), validateAirlineCode(code, 'Code')),
                );
              }}
              className={`${cargoInputClass(!!errors.code)} uppercase`}
              placeholder="Enter code"
              maxLength={5}
              disabled={saving}
            />
            <FormFieldError id="field-code-error" message={errors.code} />
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="field-airlineType">
              Airline Type
            </label>
            <AdminRadioDropdown
              id="field-airlineType"
              value={form.airlineType}
              onChange={(v) => {
                setForm((prev) => ({ ...prev, airlineType: v }));
                clearField('airlineType');
              }}
              onBlur={() => {
                setFieldError(
                  'airlineType',
                  !form.airlineType.trim() ? 'Select an airline type.' : null,
                );
              }}
              options={[
                { value: '', label: 'Select airline type' },
                { value: 'international', label: 'International' },
                { value: 'domestic', label: 'Domestic' },
              ]}
              aria-invalid={!!errors.airlineType}
              aria-describedby={errors.airlineType ? 'field-airlineType-error' : undefined}
              className={cargoInputClass(!!errors.airlineType)}
              disabled={saving}
            />
            <FormFieldError id="field-airlineType-error" message={errors.airlineType} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="field-address">
              Address
            </label>
            <input
              id="field-address"
              name="address"
              type="text"
              value={form.address}
              aria-invalid={!!errors.address}
              aria-describedby={errors.address ? 'field-address-error' : undefined}
              onChange={(e) => {
                const address = e.target.value.slice(0, 250);
                setForm((prev) => ({ ...prev, address }));
                clearField('address');
              }}
              onBlur={(e) => {
                const address = normalizeText(e.target.value).slice(0, 250);
                setForm((prev) => ({ ...prev, address }));
                setFieldError('address', maxLength(address, 250, 'Address'));
              }}
              className={cargoInputClass(!!errors.address)}
              placeholder="Enter address"
              maxLength={250}
              disabled={saving}
            />
            <FormFieldError id="field-address-error" message={errors.address} />
          </div>
        </div>

        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={form.followFrisSchedule}
            onChange={(e) => setForm((prev) => ({ ...prev, followFrisSchedule: e.target.checked }))}
            className={CARGO_CHECKBOX_CLASS}
          />
          <span className="text-sm font-medium text-gray-700">
            Tick if CHR schedule to be followed same as FRIS schedule
          </span>
        </label>

        <div className="flex justify-end border-t border-gray-200 pt-2">
          <motion.button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            aria-busy={saving}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-emerald-500/25 hover:bg-emerald-600 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="h-4 w-4" aria-hidden />
            )}
            {saving ? 'Saving…' : 'Save'}
          </motion.button>
        </div>
        </div>

        <div className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white lg:max-w-md lg:justify-self-end lg:w-full xl:max-w-lg">
          <div className="border-b border-gray-100 bg-gray-50/80 px-3 py-2">
            <h4 className="text-sm font-semibold text-gray-900">Scheduled Airline List</h4>
          </div>
          <div
            className={`max-h-[min(18rem,50vh)] overflow-y-auto overflow-x-auto ${CARGO_VISIBLE_SCROLL}`}
          >
            <table className="w-full table-fixed text-left text-xs">
              <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50/95 backdrop-blur-sm">
                <tr>
                  <th className="w-[34%] px-3 py-2 font-semibold text-gray-700">Airline Name</th>
                  <th className="w-[16%] px-3 py-2 font-semibold text-gray-700">Code</th>
                  <th className="w-[50%] px-3 py-2 text-right font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {listLoading ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-gray-500">
                      Loading airlines...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-gray-500">
                      No airlines found.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const justTransferred = transferredId === row.id;
                    return (
                    <tr
                      key={row.id}
                      className={`border-b border-gray-100 transition-colors ${
                        justTransferred
                          ? 'bg-emerald-50/90'
                          : 'hover:bg-gray-50/50'
                      }`}
                    >
                      <td className="truncate px-3 py-2 text-gray-900" title={row.name}>
                        {row.name}
                      </td>
                      <td className="truncate px-3 py-2 font-medium text-gray-900" title={row.code}>
                        {row.code}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <ScheduledAirlineTransferButton onClick={() => handleTransfer(row)} />
                          <motion.button
                            type="button"
                            onClick={() => void handleEdit(row)}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                            title="Edit cargo airline"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </motion.button>
                          <motion.button
                            type="button"
                            onClick={() => setDeleteTarget(row)}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                            title="Delete cargo airline"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </motion.button>
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="border-gray-200 bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900">Delete cargo airline?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600">
              This permanently removes the cargo airline record
              {deleteTarget?.code ? ` (${deleteTarget.code})` : ''} from the database, including saved
              cargo sections and flights for that airline code. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-200" disabled={deleting}>
              Cancel
            </AlertDialogCancel>
            <button
              type="button"
              onClick={() => void confirmDelete()}
              disabled={deleting}
              className="inline-flex h-10 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {deleting ? 'Deleting…' : 'OK'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
