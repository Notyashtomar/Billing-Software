'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BillingApi } from '@/lib/billing-api';
import { BillingPageHeader } from '../BillingLayout';
import { MasterSectionTabs } from '../MasterSectionTabs';
import { BillingDataTable } from '../BillingDataTable';
import { FieldGroup, TextInput } from './SettingsFormFields';
import { ExchangeRateEditDialog } from './SettingsEditDialogs';
import { TableEditButton } from '../TableEditButton';

type Props = { api: BillingApi };

function toYearMonth(value: unknown): string {
  const raw = String(value ?? '').slice(0, 10);
  if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7);
  return '';
}

function formatMonthLabel(yearMonth: string): string {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return yearMonth || '—';
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/**
 * Master-data page for month-wise USD→INR conversion rates.
 * Rates apply to all airline invoices whose flights fall in that billing month.
 */
export function ConversionRatesPage({ api }: Props) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [editRecord, setEditRecord] = useState<{
    _id: string;
    currencyCode: string;
    rateToINR: number;
    startingDate: string;
    source?: string;
  } | null>(null);
  const [form, setForm] = useState({
    currencyCode: 'USD',
    rateToINR: '',
    yearMonth: '',
    source: 'manual',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listExchangeRates();
      const data = res.data as { items?: Array<Record<string, unknown>> };
      setRows(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const da = String(a.startingDate ?? '');
      const db = String(b.startingDate ?? '');
      return db.localeCompare(da);
    });
  }, [rows]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}-\d{2}$/.test(form.yearMonth)) {
      setError('Select a billing month');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.createExchangeRate({
        currencyCode: form.currencyCode || 'USD',
        rateToINR: Number(form.rateToINR),
        yearMonth: form.yearMonth,
        source: form.source,
      });
      setForm({ currencyCode: 'USD', rateToINR: '', yearMonth: '', source: 'manual' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save conversion rate');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: Record<string, unknown>) => {
    const id = String(row._id ?? '');
    if (!id) return;
    const monthLabel = formatMonthLabel(toYearMonth(row.startingDate));
    const rate = String(row.rateToINR ?? '');
    const ok = window.confirm(
      `Delete conversion rate for ${monthLabel} (${rate} INR per USD)?\n\nExisting invoices keep their saved ROE until regenerated.`,
    );
    if (!ok) return;

    setDeletingId(id);
    setError('');
    try {
      await api.deleteExchangeRate(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete conversion rate');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <MasterSectionTabs group="rates" />
      <BillingPageHeader
        title="Conversion Rates"
        description="Month-wise USD to INR rates applied automatically to airline invoices for the month of flights sent to preparation."
      />

      <form
        onSubmit={(e) => void create(e)}
        className="mb-6 rounded-xl border border-gray-200 bg-white p-4 sm:p-6"
      >
        <h2 className="mb-1 text-base font-semibold text-gray-900">Add month rate</h2>
        <p className="mb-4 text-sm text-gray-600">
          Example: April 2026 at 95.445 applies to every USD invoice whose preparation flights fall
          in April 2026.
        </p>
        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FieldGroup label="Currency" htmlFor="convCurrency">
            <select
              id="convCurrency"
              value={form.currencyCode}
              onChange={(e) => setForm((f) => ({ ...f, currencyCode: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="USD">USD → INR</option>
            </select>
          </FieldGroup>
          <FieldGroup label="Billing month" htmlFor="convMonth">
            <TextInput
              id="convMonth"
              type="month"
              required
              value={form.yearMonth}
              onChange={(v) => setForm((f) => ({ ...f, yearMonth: v }))}
            />
          </FieldGroup>
          <FieldGroup label="Rate (INR per 1 USD)" htmlFor="convRate">
            <TextInput
              id="convRate"
              type="number"
              required
              value={form.rateToINR}
              onChange={(v) => setForm((f) => ({ ...f, rateToINR: v }))}
              placeholder="95.445"
            />
          </FieldGroup>
          <FieldGroup label="Source" htmlFor="convSource">
            <select
              id="convSource"
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="manual">Manual</option>
              <option value="rbi">RBI</option>
              <option value="import">Import</option>
            </select>
          </FieldGroup>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[color:var(--billing-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save conversion rate'}
          </button>
        </div>
      </form>

      <BillingDataTable
        loading={loading}
        rows={sortedRows}
        getRowKey={(r) => String(r._id)}
        emptyMessage="No conversion rates yet — add a month rate above"
        columns={[
          {
            key: 'month',
            header: 'Billing month',
            render: (r) => formatMonthLabel(toYearMonth(r.startingDate)),
          },
          { key: 'ccy', header: 'Currency', render: (r) => String(r.currencyCode ?? 'USD') },
          {
            key: 'rate',
            header: 'INR per USD',
            render: (r) => String(r.rateToINR ?? ''),
          },
          {
            key: 'source',
            header: 'Source',
            render: (r) => String(r.source ?? 'manual'),
          },
          {
            key: 'actions',
            header: 'Actions',
            render: (r) => {
              const id = String(r._id ?? '');
              const busy = deletingId === id;
              return (
                <div className="flex flex-wrap items-center gap-3">
                  <TableEditButton
                    onClick={() =>
                      setEditRecord({
                        _id: id,
                        currencyCode: String(r.currencyCode),
                        rateToINR: Number(r.rateToINR),
                        startingDate: String(r.startingDate),
                        source: r.source != null ? String(r.source) : undefined,
                      })
                    }
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDelete(r)}
                    className="text-sm font-medium text-red-700 hover:text-red-900 disabled:opacity-50"
                  >
                    {busy ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              );
            },
          },
        ]}
      />

      <ExchangeRateEditDialog
        api={api}
        open={editRecord != null}
        onOpenChange={(open) => {
          if (!open) setEditRecord(null);
        }}
        record={editRecord}
        onSaved={() => void load()}
      />
    </>
  );
}
