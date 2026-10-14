'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  appendAdvanceCargoUnitMaster,
  listAdvanceCargoUnitMaster,
  type AdvanceCargoUnitMasterItem,
} from '@/lib/advance-cargo';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  maxLength,
  minLength,
  normalizeText,
  required,
  runValidators,
  trimValue,
  type FieldErrors,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { cargoInputClass } from './cargoFormStyles';

const FIELD_ORDER = ['unitName', 'unitCode', 'unitFormat'] as const;
type CargoUnitField = (typeof FIELD_ORDER)[number];

function unitNameMustIncludeLetter(value: string): string | null {
  const v = normalizeText(value);
  if (!v) return null;
  if (!/[A-Za-z]/.test(v)) {
    return 'Unit name must include letters. Numbers or symbols alone are not allowed.';
  }
  return null;
}

function validateCargoCode(value: string, label: string): string | null {
  const v = trimValue(value).toUpperCase();
  if (!v) return null;
  if (!/^[A-Z0-9]{1,10}$/.test(v)) {
    return `${label} must be 1 to 10 characters (A–Z, 0–9).`;
  }
  return null;
}

function validateForm(values: {
  unitName: string;
  unitCode: string;
  unitFormat: string;
}): FieldErrors<CargoUnitField> {
  const next: FieldErrors<CargoUnitField> = {};

  const unitNameErr = runValidators(
    required(values.unitName, 'Unit name'),
    minLength(values.unitName, 2, 'Unit name'),
    maxLength(values.unitName, 100, 'Unit name'),
    unitNameMustIncludeLetter(values.unitName),
  );
  if (unitNameErr) next.unitName = unitNameErr;

  const unitCodeErr = validateCargoCode(values.unitCode, 'Unit code');
  if (unitCodeErr) next.unitCode = unitCodeErr;

  if (!trimValue(values.unitFormat)) {
    next.unitFormat = 'Select a unit format.';
  }

  return next;
}

export default function CargoUnitMasterForm() {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AdvanceCargoUnitMasterItem[]>([]);
  const [form, setForm] = useState({
    unitName: '',
    unitCode: '',
    unitFormat: '',
  });
  const { errors, clearAll, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<CargoUnitField>(FIELD_ORDER);

  const loadUnits = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listAdvanceCargoUnitMaster();
      setRows(list);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUnits();
  }, [loadUnits]);

  const validateLive = (field: CargoUnitField, value: string) => {
    if (field === 'unitName') {
      setFieldError(
        'unitName',
        runValidators(
          required(value, 'Unit name'),
          minLength(value, 2, 'Unit name'),
          maxLength(value, 100, 'Unit name'),
          unitNameMustIncludeLetter(value),
        ),
      );
      return;
    }
    if (field === 'unitCode') {
      setFieldError('unitCode', validateCargoCode(value, 'Unit code'));
      return;
    }
    setFieldError('unitFormat', !trimValue(value) ? 'Select a unit format.' : null);
  };

  const handleSave = async () => {
    const next = validateForm(form);
    if (applyAndFocus(next)) {
      if (next.unitName) toast.error(next.unitName);
      return;
    }

    const payload = {
      unitName: normalizeText(form.unitName),
      unitCode: form.unitCode.trim().toUpperCase(),
      unitFormat: form.unitFormat,
    };

    setSaving(true);
    try {
      const result = await appendAdvanceCargoUnitMaster(payload);
      setRows(result.unitMaster);
      toast.success('Unit master saved.');
      setForm({ unitName: '', unitCode: '', unitFormat: '' });
      clearAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setFieldError('unitName', msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="overflow-visible rounded-xl border border-gray-200 bg-gray-50/50">
      <div className="space-y-4 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-start">
          <div className="min-w-0 flex-1 lg:min-w-[10rem]">
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="field-unitName">
              Unit Name
            </label>
            <input
              id="field-unitName"
              name="unitName"
              type="text"
              value={form.unitName}
              aria-invalid={!!errors.unitName}
              aria-describedby={errors.unitName ? 'field-unitName-error' : undefined}
              onChange={(e) => {
                const value = e.target.value;
                setForm((prev) => ({ ...prev, unitName: value }));
                setFieldError('unitName', unitNameMustIncludeLetter(value));
              }}
              onBlur={(e) => validateLive('unitName', e.target.value)}
              className={cargoInputClass(!!errors.unitName)}
              placeholder="Unit name"
              maxLength={100}
              disabled={saving}
            />
            <FormFieldError id="field-unitName-error" message={errors.unitName} />
          </div>

          <div className="min-w-0 w-full sm:w-auto sm:min-w-[8rem]">
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="field-unitCode">
              Unit Code
            </label>
            <input
              id="field-unitCode"
              name="unitCode"
              type="text"
              value={form.unitCode}
              aria-invalid={!!errors.unitCode}
              aria-describedby={errors.unitCode ? 'field-unitCode-error' : undefined}
              onChange={(e) => {
                const unitCode = e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, '')
                  .slice(0, 10);
                setForm((prev) => ({ ...prev, unitCode }));
                clearField('unitCode');
              }}
              onBlur={() => validateLive('unitCode', form.unitCode)}
              className={`${cargoInputClass(!!errors.unitCode)} uppercase`}
              placeholder="Code"
              maxLength={10}
              disabled={saving}
            />
            <FormFieldError id="field-unitCode-error" message={errors.unitCode} />
          </div>

          <div className="min-w-0 w-full sm:w-auto sm:min-w-[7rem]">
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="field-unitFormat">
              Unit Format
            </label>
            <AdminRadioDropdown
              id="field-unitFormat"
              value={form.unitFormat}
              onChange={(v) => {
                setForm((prev) => ({ ...prev, unitFormat: v }));
                clearField('unitFormat');
              }}
              onBlur={() => validateLive('unitFormat', form.unitFormat)}
              options={[
                { value: '', label: 'Select' },
                { value: 'kg', label: 'KG' },
                { value: 'pcs', label: 'PCS' },
                { value: 'hrs', label: 'HRS' },
              ]}
              className={cargoInputClass(!!errors.unitFormat)}
              aria-invalid={!!errors.unitFormat}
              aria-describedby={errors.unitFormat ? 'field-unitFormat-error' : undefined}
              disabled={saving}
            />
            <FormFieldError id="field-unitFormat-error" message={errors.unitFormat} />
          </div>

          <motion.button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex w-full shrink-0 items-center justify-center gap-2 self-end rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-amber-500/25 hover:bg-amber-600 disabled:opacity-60 lg:w-auto"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? 'Saving…' : 'Save'}
          </motion.button>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80">
            <h4 className="text-sm font-semibold text-gray-900">Saved Units</h4>
          </div>
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/60">
                <th className="px-4 py-3 font-semibold text-gray-700">Unit Name</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Code</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Format</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                    Loading units…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                    No units saved yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100">
                    <td className="px-4 py-3 text-gray-900">{row.unitName}</td>
                    <td className="px-4 py-3">{row.unitCode || '—'}</td>
                    <td className="px-4 py-3 uppercase">{row.unitFormat || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
