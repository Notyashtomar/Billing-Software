'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { FieldGroup, TextInput } from './SettingsFormFields';
import { formatBillingDate } from '@/lib/billing-shared/billing-date-format';
import type { BillingApi } from '@/lib/billing-api';

type TaxRow = {
  _id: string;
  ruleCode: string;
  gstPercent: number;
  placeOfSupply: string;
  effectiveFrom: string;
  effectiveTo: string;
};

export function TaxRuleEditDialog({
  api,
  open,
  onOpenChange,
  record,
  onSaved,
}: {
  api: BillingApi;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: TaxRow | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ gstPercent: '', placeOfSupply: 'intra_state', effectiveFrom: '', effectiveTo: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !record) return;
    setForm({
      gstPercent: String(record.gstPercent),
      placeOfSupply: record.placeOfSupply,
      effectiveFrom: record.effectiveFrom.slice(0, 10),
      effectiveTo: record.effectiveTo.slice(0, 10),
    });
    setError('');
  }, [open, record]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!record) return;
    setSaving(true);
    setError('');
    try {
      await api.updateTaxRule(record._id, {
        gstPercent: Number(form.gstPercent),
        placeOfSupply: form.placeOfSupply,
        effectiveFrom: form.effectiveFrom,
        effectiveTo: form.effectiveTo,
      });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tax rule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit tax rule — {record?.ruleCode}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="grid gap-4">
          {error ? <div className="text-sm text-red-700">{error}</div> : null}
          <FieldGroup label="GST %" htmlFor="editGst">
            <TextInput id="editGst" type="number" value={form.gstPercent} onChange={(v) => setForm((f) => ({ ...f, gstPercent: v }))} required />
          </FieldGroup>
          <FieldGroup label="Place of supply" htmlFor="editPos">
            <select id="editPos" value={form.placeOfSupply} onChange={(e) => setForm((f) => ({ ...f, placeOfSupply: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-full">
              <option value="intra_state">Intra-state</option>
              <option value="inter_state">Inter-state</option>
            </select>
          </FieldGroup>
          <FieldGroup label="Effective from" htmlFor="editFrom">
            <TextInput id="editFrom" type="date" value={form.effectiveFrom} onChange={(v) => setForm((f) => ({ ...f, effectiveFrom: v }))} required />
          </FieldGroup>
          <FieldGroup label="Effective to" htmlFor="editTo">
            <TextInput id="editTo" type="date" value={form.effectiveTo} onChange={(v) => setForm((f) => ({ ...f, effectiveTo: v }))} required />
          </FieldGroup>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-[color:var(--billing-primary)] px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type RateRow = { _id: string; currencyCode: string; rateToINR: number; startingDate: string; source?: string };

export function ExchangeRateEditDialog({
  api,
  open,
  onOpenChange,
  record,
  onSaved,
}: {
  api: BillingApi;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: RateRow | null;
  onSaved: () => void;
}) {
  const [rateToINR, setRateToINR] = useState('');
  const [source, setSource] = useState('manual');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !record) return;
    setRateToINR(String(record.rateToINR));
    setSource(record.source ?? 'manual');
    setError('');
  }, [open, record]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!record) return;
    setSaving(true);
    try {
      await api.updateExchangeRate(record._id, { rateToINR: Number(rateToINR), source });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update rate');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Edit {record?.currencyCode} rate ({formatBillingDate(record?.startingDate)})
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="grid gap-4">
          {error ? <div className="text-sm text-red-700">{error}</div> : null}
          <FieldGroup label="Rate to INR" htmlFor="editRate">
            <TextInput id="editRate" type="number" value={rateToINR} onChange={setRateToINR} required />
          </FieldGroup>
          <FieldGroup label="Source" htmlFor="editSource">
            <select id="editSource" value={source} onChange={(e) => setSource(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-full">
              <option value="manual">Manual</option>
              <option value="rbi">RBI</option>
              <option value="import">Import</option>
            </select>
          </FieldGroup>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-[color:var(--billing-primary)] px-4 py-2 text-sm text-white">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type SeqRow = { _id: string; sequenceCode: string; prefix: string; fiscalYear: string; currentValue: number };

export function SequenceEditDialog({
  api,
  open,
  onOpenChange,
  record,
  onSaved,
}: {
  api: BillingApi;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: SeqRow | null;
  onSaved: () => void;
}) {
  const [prefix, setPrefix] = useState('');
  const [currentValue, setCurrentValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !record) return;
    setPrefix(record.prefix);
    setCurrentValue(String(record.currentValue));
    setError('');
  }, [open, record]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!record) return;
    setSaving(true);
    try {
      await api.updateSequence(record._id, { prefix, currentValue: Number(currentValue) });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update sequence');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit sequence — {record?.sequenceCode} ({record?.fiscalYear})</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="grid gap-4">
          {error ? <div className="text-sm text-red-700">{error}</div> : null}
          <FieldGroup label="Prefix" htmlFor="editPrefix">
            <TextInput id="editPrefix" value={prefix} onChange={setPrefix} required />
          </FieldGroup>
          <FieldGroup label="Current value" htmlFor="editCurrent">
            <TextInput id="editCurrent" type="number" value={currentValue} onChange={setCurrentValue} required />
          </FieldGroup>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-[color:var(--billing-primary)] px-4 py-2 text-sm text-white">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SequenceDeleteDialog({
  open,
  onOpenChange,
  record,
  onConfirm,
  deleting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: SeqRow | null;
  onConfirm: () => void;
  deleting: boolean;
}) {
  const used = Number(record?.currentValue ?? 0) > 0;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete sequence?</AlertDialogTitle>
          <AlertDialogDescription>
            {record ? (
              <>
                This removes{' '}
                <span className="font-medium text-gray-900">{record.sequenceCode}</span>
                {` (${record.fiscalYear})`} with prefix {record.prefix}. Posted invoices keep
                their numbers.
                {used
                  ? ` This series has already issued ${record.currentValue} number${record.currentValue === 1 ? '' : 's'}. Adding the same code later starts from 0001 and can clash.`
                  : ' You can add it again later.'}
              </>
            ) : (
              'This sequence will be permanently removed.'
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
