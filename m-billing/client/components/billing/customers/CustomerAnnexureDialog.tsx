'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingCustomer } from '@/lib/billing-shared/types';

type Category = 'ADS' | 'BHS';

type Props = {
  api: BillingApi;
  open: boolean;
  customer: BillingCustomer | null;
  onOpenChange: (open: boolean) => void;
  onUpdated: (customer: BillingCustomer) => void;
};

export function CustomerAnnexureDialog({
  api,
  open,
  customer,
  onOpenChange,
  onUpdated,
}: Props) {
  const [error, setError] = useState('');
  const [adsFile, setAdsFile] = useState<File | null>(null);
  const [bhsFile, setBhsFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError('');
    setAdsFile(null);
    setBhsFile(null);
    setBusy(null);
  }, [open, customer?._id]);

  const save = async (category: Category) => {
    if (!customer) return;
    const file = category === 'ADS' ? adsFile : bhsFile;
    if (!file) {
      setError(`Choose a ${category} PDF first.`);
      return;
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Annexure must be a PDF file.');
      return;
    }
    setBusy(`save-${category}`);
    setError('');
    try {
      const res = await api.uploadCustomerAnnexure(customer._id, category, file);
      const updated = (res as { data: BillingCustomer }).data;
      onUpdated(updated);
      if (category === 'ADS') setAdsFile(null);
      else setBhsFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not save the ${category} annexure.`);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (category: Category) => {
    if (!customer) return;
    setBusy(`remove-${category}`);
    setError('');
    try {
      const res = await api.deleteCustomerAnnexure(customer._id, category);
      onUpdated((res as { data: BillingCustomer }).data);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not remove the ${category} annexure.`);
    } finally {
      setBusy(null);
    }
  };

  const openSaved = async (category: Category) => {
    if (!customer) return;
    setBusy(`open-${category}`);
    setError('');
    try {
      await api.openCustomerAnnexure(customer.customerCode, category);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not open the ${category} annexure.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle>Annexure documents</DialogTitle>
          <DialogDescription>
            {customer
              ? `Save one PDF for ${customer.customerCode} — ${customer.name}. ADS invoices open the ADS file, and BHS invoices open the BHS file.`
              : 'Save annexure PDFs for this airline.'}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {error}
          </div>
        ) : null}
        {customer ? (
          <div className="space-y-4">
            <AnnexureCategoryFields
              category="ADS"
              savedName={customer.annexures?.ads?.originalName}
              pendingName={adsFile?.name}
              busy={busy}
              onPick={setAdsFile}
              onSave={() => void save('ADS')}
              onRemove={() => void remove('ADS')}
              onOpen={() => void openSaved('ADS')}
            />
            <AnnexureCategoryFields
              category="BHS"
              savedName={customer.annexures?.bhs?.originalName}
              pendingName={bhsFile?.name}
              busy={busy}
              onPick={setBhsFile}
              onSave={() => void save('BHS')}
              onRemove={() => void remove('BHS')}
              onOpen={() => void openSaved('BHS')}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AnnexureCategoryFields({
  category,
  savedName,
  pendingName,
  busy,
  onPick,
  onSave,
  onRemove,
  onOpen,
}: {
  category: Category;
  savedName?: string;
  pendingName?: string;
  busy: string | null;
  onPick: (file: File | null) => void;
  onSave: () => void;
  onRemove: () => void;
  onOpen: () => void;
}) {
  const locked = busy != null;
  return (
    <section className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{category} annexure</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {savedName ? `Saved: ${savedName}` : 'No PDF saved'}
            {pendingName ? ` · Selected: ${pendingName}` : ''}
          </p>
        </div>
        {savedName ? (
          <button
            type="button"
            disabled={locked}
            onClick={onOpen}
            className="shrink-0 text-sm font-medium text-[color:var(--billing-primary)] hover:underline disabled:opacity-50"
          >
            {busy === `open-${category}` ? 'Opening…' : 'View'}
          </button>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50">
          Choose PDF
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            disabled={locked}
            onChange={(event) => {
              onPick(event.target.files?.[0] ?? null);
              event.target.value = '';
            }}
          />
        </label>
        <button
          type="button"
          disabled={locked || !pendingName}
          onClick={onSave}
          className="rounded-lg bg-[color:var(--billing-primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === `save-${category}` ? 'Saving…' : `Save ${category}`}
        </button>
        {savedName ? (
          <button
            type="button"
            disabled={locked}
            onClick={onRemove}
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {busy === `remove-${category}` ? 'Removing…' : 'Remove'}
          </button>
        ) : null}
      </div>
    </section>
  );
}
