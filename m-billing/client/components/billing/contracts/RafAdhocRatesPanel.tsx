'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingRafAdhocRate } from '@/lib/billing-shared/types';
import { formatBillingDateRange } from '@/lib/billing-shared/billing-date-format';

type Props = {
  api: BillingApi;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

const KINDS = [
  { value: 'equipment', label: 'Equipment' },
  { value: 'manpower', label: 'Manpower' },
  { value: 'service', label: 'Service' },
] as const;

function stationLabel(code: string) {
  if (code === '*' || code === 'ALL') return 'All stations';
  return code;
}

export function RafAdhocRatesPanel({ api, onError, onSuccess }: Props) {
  const [rows, setRows] = useState<BillingRafAdhocRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [kindFilter, setKindFilter] = useState('');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [itemKind, setItemKind] = useState<(typeof KINDS)[number]['value']>('equipment');
  const [remarks, setRemarks] = useState('');
  const [uom, setUom] = useState('Per service');
  const [unitPriceINR, setUnitPriceINR] = useState('');
  const [unitPriceUSD, setUnitPriceUSD] = useState('');
  const [validFrom, setValidFrom] = useState('2026-04-01');
  const [validTo, setValidTo] = useState('2027-03-31');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listRafAdhocRates();
      const data = res.data as { items?: BillingRafAdhocRate[] };
      setRows(data.items ?? []);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to load RAF adhoc rates');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (kindFilter && row.itemKind !== kindFilter) return false;
        if (!q) return true;
        return [row.label, row.remarks ?? '', row.uom, row.itemKind]
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .slice()
      .sort((a, b) => {
        const kind = a.itemKind.localeCompare(b.itemKind);
        if (kind !== 0) return kind;
        const name = a.label.localeCompare(b.label);
        if (name !== 0) return name;
        return (a.stationCode || '').localeCompare(b.stationCode || '');
      });
  }, [kindFilter, rows, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, BillingRafAdhocRate[]>();
    for (const row of filtered) {
      const key = formatBillingDateRange(row.validFrom, row.validTo);
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const resetForm = () => {
    setLabel('');
    setRemarks('');
    setUom('Per service');
    setUnitPriceINR('');
    setUnitPriceUSD('');
  };

  const save = async () => {
    if (!label.trim()) {
      onError('Name is required');
      return;
    }
    setSaving(true);
    try {
      await api.createRafAdhocRates({
        itemKind,
        label: label.trim(),
        remarks: remarks.trim() || undefined,
        uom: uom.trim() || 'Per service',
        unitPriceINR: unitPriceINR ? Number(unitPriceINR) : undefined,
        unitPriceUSD: unitPriceUSD ? Number(unitPriceUSD) : undefined,
        validFrom,
        validTo,
      });
      onSuccess(`Saved ${label.trim()} for this station`);
      resetForm();
      setFormOpen(false);
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to save RAF adhoc rate');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: BillingRafAdhocRate) => {
    try {
      await api.deleteRafAdhocRate(row._id);
      onSuccess(`Removed ${row.label}`);
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to delete RAF adhoc rate');
    }
  };

  return (
    <section
      className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
      aria-label="RAF adhoc rates"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[color:var(--billing-heading)]">
            Adhoc rates for this station
          </h2>
          <p className="mt-0.5 text-xs text-[color:var(--billing-text-muted)]">
            Saved on the station you are signed into. A change here does not change
            another station. Shared template rows stay until this station saves its own
            price. Default validity 01 Apr 2026 → 31 Mar 2027.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="rounded-lg bg-[color:var(--billing-primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)]"
        >
          {formOpen ? 'Close form' : 'Add rate'}
        </button>
      </div>

      {formOpen ? (
        <form
          className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] p-4 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Name
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Type
            <select
              value={itemKind}
              onChange={(e) => setItemKind(e.target.value as (typeof KINDS)[number]['value'])}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            UOM
            <input
              value={uom}
              onChange={(e) => setUom(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Domestic INR
            <input
              type="number"
              min={0}
              value={unitPriceINR}
              onChange={(e) => setUnitPriceINR(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Intl USD
            <input
              type="number"
              min={0}
              value={unitPriceUSD}
              onChange={(e) => setUnitPriceUSD(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 sm:col-span-2 lg:col-span-1">
            Remarks
            <input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Valid from
            <input
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Valid to
            <input
              type="date"
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"
              required
            />
          </label>

          <div className="sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[color:var(--billing-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save adhoc rate'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[8rem] flex-col gap-1 text-xs font-medium text-gray-600">
          Type
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">All types</option>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-gray-600">
          Search
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, remarks, UOM…"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
        </label>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">Loading adhoc rates…</p>
      ) : grouped.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
          No RAF adhoc rates yet. Run seed or add a rate.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {grouped.map(([validity, items]) => (
            <div key={validity} className="overflow-x-auto rounded-xl border border-gray-200">
              <div className="border-b border-gray-200 bg-[color:var(--billing-surface)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                Validity {validity} · {items.length} item{items.length === 1 ? '' : 's'}
              </div>
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">Type</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">Station</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">UOM</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">INR</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">USD</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600"> </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((row) => (
                    <tr key={row._id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 capitalize text-gray-700">{row.itemKind}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">
                        {row.label}
                        {row.remarks ? (
                          <span className="block text-xs font-normal text-gray-500">{row.remarks}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{stationLabel(row.stationCode)}</td>
                      <td className="px-3 py-2 text-gray-600">{row.uom}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.percentValue != null && row.unitPriceINR == null
                          ? `${row.percentValue}%`
                          : row.unitPriceINR ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.unitPriceUSD ?? '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {row.stationCode === '*' || row.stationCode === 'ALL' ? (
                          <span className="text-xs text-gray-500">Template</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void remove(row)}
                            className="text-xs font-medium text-red-600 hover:underline"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
