'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldGroup, TextInput } from '../settings/SettingsFormFields';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingServiceCatalogItem } from '@/lib/billing-shared/types';
import { buildAdsUomOptions } from '@/lib/billing-shared/ads-uom-options';
import { inferCatalogMeta } from '@/lib/billing-shared/service-catalog-labels';

const CATEGORIES = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'manpower', label: 'Manpower' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'raf', label: 'RAF' },
  { value: 'non_scheduled', label: 'Non-scheduled' },
  { value: 'delay', label: 'Delay' },
  { value: 'xxld', label: 'XXLD' },
] as const;

const emptyForm = {
  serviceCode: '',
  description: '',
  category: 'scheduled',
  uom: 'FLIGHT',
  royaltyApplicable: false,
  sacCode: '',
  active: true,
};

type Props = {
  api: BillingApi;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  record?: BillingServiceCatalogItem | null;
};

export function ServiceCatalogFormDialog({ api, open, onOpenChange, onSaved, record }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isEdit = Boolean(record);

  const uomOptions = useMemo(
    () => buildAdsUomOptions([form.uom, record?.uom]),
    [form.uom, record?.uom],
  );

  useEffect(() => {
    if (!open) return;
    setError('');
    if (record) {
      setForm({
        serviceCode: record.serviceCode,
        description: record.description,
        category: record.category,
        uom: record.uom,
        royaltyApplicable: record.royaltyApplicable ?? false,
        sacCode: record.sacCode ?? '',
        active: record.active ?? true,
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, record]);

  const handleServiceCodeChange = (serviceCode: string) => {
    setForm((f) => {
      const next = { ...f, serviceCode };
      if (!isEdit && serviceCode.trim()) {
        const meta = inferCatalogMeta(serviceCode);
        next.category = meta.category;
        next.uom = meta.uom;
        if (!f.description.trim()) {
          next.description = serviceCode;
        }
      }
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (isEdit && record) {
        await api.updateServiceCatalog(record.serviceCode, {
          description: form.description.trim(),
          category: form.category,
          uom: form.uom,
          royaltyApplicable: form.royaltyApplicable,
          sacCode: form.sacCode.trim() || undefined,
          active: form.active,
        });
      } else {
        const serviceCode = form.serviceCode.trim();
        if (!serviceCode || !form.description.trim()) {
          setError('Service code and description are required.');
          return;
        }
        await api.createServiceCatalog({
          serviceCode,
          description: form.description.trim(),
          category: form.category,
          uom: form.uom,
          royaltyApplicable: form.royaltyApplicable,
        });
      }

      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save service');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit service' : 'New service'}</DialogTitle>
          <DialogDescription>
            Service catalog entry for your logged-in station.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void submit(e)} className="grid gap-4">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          <FieldGroup label="Service code" htmlFor="serviceCode">
            <TextInput
              id="serviceCode"
              value={form.serviceCode}
              onChange={handleServiceCodeChange}
              placeholder="TRND"
              required={!isEdit}
            />
          </FieldGroup>

          <FieldGroup label="Description" htmlFor="serviceDescription">
            <TextInput
              id="serviceDescription"
              value={form.description}
              onChange={(v) => setForm((f) => ({ ...f, description: v }))}
              required
            />
          </FieldGroup>

          <FieldGroup label="Category" htmlFor="serviceCategory">
            <select
              id="serviceCategory"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </FieldGroup>

          <FieldGroup label="UOM" htmlFor="serviceUom">
            <select
              id="serviceUom"
              value={form.uom}
              onChange={(e) => setForm((f) => ({ ...f, uom: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {uomOptions.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </FieldGroup>

          <FieldGroup label="SAC code" htmlFor="sacCode">
            <TextInput
              id="sacCode"
              value={form.sacCode}
              onChange={(v) => setForm((f) => ({ ...f, sacCode: v }))}
              placeholder="996761"
            />
          </FieldGroup>

          <FieldGroup label="Royalty applicable" htmlFor="royaltyApplicable">
            <select
              id="royaltyApplicable"
              value={form.royaltyApplicable ? 'yes' : 'no'}
              onChange={(e) =>
                setForm((f) => ({ ...f, royaltyApplicable: e.target.value === 'yes' }))
              }
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </FieldGroup>

          {isEdit ? (
            <FieldGroup label="Active" htmlFor="active">
              <select
                id="active"
                value={form.active ? 'yes' : 'no'}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === 'yes' }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </FieldGroup>
          ) : null}

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-[color:var(--billing-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)] disabled:opacity-50">
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create service'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
