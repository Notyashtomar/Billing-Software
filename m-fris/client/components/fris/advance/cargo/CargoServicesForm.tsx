'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  appendAdvanceCargoService,
  listAdvanceCargoServices,
  type AdvanceCargoServiceItem,
} from '@/lib/advance-cargo';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  maxLength,
  minLength,
  normalizeText,
  personName,
  required,
  runValidators,
  trimValue,
  type FieldErrors,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { cargoInputClass } from './cargoFormStyles';

const FIELD_ORDER = ['serviceName', 'serviceCode', 'unitType', 'quantityNecessary'] as const;
type CargoServiceField = (typeof FIELD_ORDER)[number];

function validateCargoCode(value: string, label: string): string | null {
  const v = trimValue(value).toUpperCase();
  if (!v) return null;
  if (!/^[A-Z0-9]{1,10}$/.test(v)) {
    return `${label} must be 1 to 10 characters (A–Z, 0–9).`;
  }
  return null;
}

function validateForm(values: {
  serviceName: string;
  serviceCode: string;
  unitType: string;
  quantityNecessary: string;
}): FieldErrors<CargoServiceField> {
  const next: FieldErrors<CargoServiceField> = {};

  const serviceNameErr = runValidators(
    required(values.serviceName, 'Service name'),
    minLength(values.serviceName, 2, 'Service name'),
    maxLength(values.serviceName, 100, 'Service name'),
    personName(values.serviceName, 'Service name'),
  );
  if (serviceNameErr) next.serviceName = serviceNameErr;

  const serviceCodeErr = validateCargoCode(values.serviceCode, 'Service code');
  if (serviceCodeErr) next.serviceCode = serviceCodeErr;

  if (!trimValue(values.unitType)) {
    next.unitType = 'Select a unit type.';
  }

  if (!trimValue(values.quantityNecessary)) {
    next.quantityNecessary = 'Select quantity necessary.';
  }

  return next;
}

export default function CargoServicesForm() {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AdvanceCargoServiceItem[]>([]);
  const [form, setForm] = useState({
    serviceName: '',
    serviceCode: '',
    unitType: '',
    quantityNecessary: 'yes',
  });
  const { errors, clearAll, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<CargoServiceField>(FIELD_ORDER);

  const loadServices = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listAdvanceCargoServices();
      setRows(list);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadServices();
  }, [loadServices]);

  const validateLive = (field: CargoServiceField, value: string) => {
    if (field === 'serviceName') {
      setFieldError(
        'serviceName',
        runValidators(
          required(value, 'Service name'),
          minLength(value, 2, 'Service name'),
          maxLength(value, 100, 'Service name'),
          personName(value, 'Service name'),
        ),
      );
      return;
    }
    if (field === 'serviceCode') {
      setFieldError('serviceCode', validateCargoCode(value, 'Service code'));
      return;
    }
    if (field === 'unitType') {
      setFieldError('unitType', !trimValue(value) ? 'Select a unit type.' : null);
      return;
    }
    setFieldError(
      'quantityNecessary',
      !trimValue(value) ? 'Select quantity necessary.' : null,
    );
  };

  const handleSave = async () => {
    const next = validateForm(form);
    if (applyAndFocus(next)) return;

    const payload = {
      serviceName: normalizeText(form.serviceName),
      serviceCode: form.serviceCode.trim().toUpperCase(),
      unitType: form.unitType,
      quantityNecessary: form.quantityNecessary,
    };

    setSaving(true);
    try {
      const result = await appendAdvanceCargoService(payload);
      setRows(result.services);
      toast.success('Service saved.');
      setForm({
        serviceName: '',
        serviceCode: '',
        unitType: '',
        quantityNecessary: 'yes',
      });
      clearAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setFieldError('serviceName', msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="overflow-visible rounded-xl border border-gray-200 bg-gray-50/50">
      <div className="space-y-4 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:flex-wrap xl:items-start">
          <div className="min-w-0 flex-1 xl:min-w-[12rem]">
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="field-serviceName">
              Service Name
            </label>
            <input
              id="field-serviceName"
              name="serviceName"
              type="text"
              value={form.serviceName}
              aria-invalid={!!errors.serviceName}
              aria-describedby={errors.serviceName ? 'field-serviceName-error' : undefined}
              onChange={(e) => {
                const raw = e.target.value;
                const letters = raw.replace(/[^A-Za-z ]/g, '');
                setForm((prev) => ({ ...prev, serviceName: letters }));
                setFieldError(
                  'serviceName',
                  letters !== raw ? 'Service name may only contain alphabetical characters.' : null,
                );
              }}
              onBlur={(e) => validateLive('serviceName', e.target.value)}
              className={cargoInputClass(!!errors.serviceName)}
              placeholder="Service name"
              maxLength={100}
              disabled={saving}
            />
            <FormFieldError id="field-serviceName-error" message={errors.serviceName} />
          </div>

          <div className="min-w-0 w-full sm:w-auto sm:min-w-[8rem]">
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="field-serviceCode">
              Service Code
            </label>
            <input
              id="field-serviceCode"
              name="serviceCode"
              type="text"
              value={form.serviceCode}
              aria-invalid={!!errors.serviceCode}
              aria-describedby={errors.serviceCode ? 'field-serviceCode-error' : undefined}
              onChange={(e) => {
                const serviceCode = e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, '')
                  .slice(0, 10);
                setForm((prev) => ({ ...prev, serviceCode }));
                clearField('serviceCode');
              }}
              onBlur={() => validateLive('serviceCode', form.serviceCode)}
              className={`${cargoInputClass(!!errors.serviceCode)} uppercase`}
              placeholder="Code"
              maxLength={10}
              disabled={saving}
            />
            <FormFieldError id="field-serviceCode-error" message={errors.serviceCode} />
          </div>

          <div className="min-w-0 w-full sm:w-auto sm:min-w-[9rem]">
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="field-unitType">
              Unit Type
            </label>
            <AdminRadioDropdown
              id="field-unitType"
              value={form.unitType}
              onChange={(v) => {
                setForm((prev) => ({ ...prev, unitType: v }));
                clearField('unitType');
              }}
              onBlur={() => validateLive('unitType', form.unitType)}
              options={[
                { value: '', label: 'Select' },
                { value: 'kg', label: 'KG' },
                { value: 'pcs', label: 'PCS' },
                { value: 'hours', label: 'Hours' },
              ]}
              className={cargoInputClass(!!errors.unitType)}
              aria-invalid={!!errors.unitType}
              aria-describedby={errors.unitType ? 'field-unitType-error' : undefined}
              disabled={saving}
            />
            <FormFieldError id="field-unitType-error" message={errors.unitType} />
          </div>

          <div className="min-w-0 w-full sm:w-auto sm:min-w-[9rem]">
            <label
              className="mb-1 block text-sm font-medium text-gray-700"
              htmlFor="field-quantityNecessary"
            >
              Quantity Necessary
            </label>
            <AdminRadioDropdown
              id="field-quantityNecessary"
              value={form.quantityNecessary}
              onChange={(v) => {
                setForm((prev) => ({ ...prev, quantityNecessary: v }));
                clearField('quantityNecessary');
              }}
              onBlur={() => validateLive('quantityNecessary', form.quantityNecessary)}
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ]}
              className={cargoInputClass(!!errors.quantityNecessary)}
              aria-invalid={!!errors.quantityNecessary}
              aria-describedby={
                errors.quantityNecessary ? 'field-quantityNecessary-error' : undefined
              }
              disabled={saving}
            />
            <FormFieldError
              id="field-quantityNecessary-error"
              message={errors.quantityNecessary}
            />
          </div>

          <motion.button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex w-full shrink-0 items-center justify-center gap-2 self-end rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-amber-500/25 hover:bg-amber-600 disabled:opacity-60 xl:w-auto"
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
            <h4 className="text-sm font-semibold text-gray-900">Saved Services</h4>
          </div>
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/60">
                <th className="px-4 py-3 font-semibold text-gray-700">Service Name</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Code</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Unit Type</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Qty Necessary</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    Loading services…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    No services saved yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100">
                    <td className="px-4 py-3 text-gray-900">{row.serviceName}</td>
                    <td className="px-4 py-3">{row.serviceCode || '—'}</td>
                    <td className="px-4 py-3 uppercase">{row.unitType || '—'}</td>
                    <td className="px-4 py-3 capitalize">{row.quantityNecessary}</td>
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
