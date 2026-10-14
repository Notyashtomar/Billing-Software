'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingCustomer, BillingKycCase } from '@/lib/billing-shared/types';
import { KYC_STATUSES, KYC_STATUS_LABELS } from '@/lib/billing-shared/enums';
import { BillingPageHeader } from '../BillingLayout';
import { StatusBadge } from '../StatusBadge';
import { billingUi } from '../billingUi';

type Props = { api: BillingApi };

export function KycTrackerPage({ api }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status') ?? '';
  const [rows, setRows] = useState<BillingKycCase[]>([]);
  const [customers, setCustomers] = useState<BillingCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [createCode, setCreateCode] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [kycRes, custRes] = await Promise.all([
        api.listKycCases({
          status: statusFilter || undefined,
          search: search.trim() || undefined,
          limit: 100,
        }),
        api.listCustomers({ limit: 500 }),
      ]);
      setRows(((kycRes as { data?: BillingKycCase[] }).data ?? []) as BillingKycCase[]);
      setCustomers(((custRes as { data?: BillingCustomer[] }).data ?? []) as BillingCustomer[]);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : 'Failed to load KYC cases');
    } finally {
      setLoading(false);
    }
  }, [api, search, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const createCase = async () => {
    if (!createCode.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await api.createKycCase({
        customerCode: createCode.trim().toUpperCase(),
        inviteEmail: createEmail.trim() || undefined,
      });
      const created = (res as { data?: BillingKycCase }).data;
      if (created?._id) {
        router.push(`/billing/kyc/${created._id}`);
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create KYC case');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={billingUi.page}>
      <BillingPageHeader
        title="Airline KYC"
        description="Marketing initiates KYC — staff fill or invite airline self-serve, then track status"
      />

      <section className={`${billingUi.insightsCard} mb-4 p-4`}>
        <h2 className={`${billingUi.sectionTitle} mb-3`}>Start KYC</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-[color:var(--billing-text-secondary)]">
              Airline customer
            </span>
            <select
              className={billingUi.input}
              value={createCode}
              onChange={(e) => setCreateCode(e.target.value)}
            >
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c._id} value={c.customerCode}>
                  {c.customerCode} — {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-[color:var(--billing-text-secondary)]">
              Invite email (optional)
            </span>
            <input
              type="email"
              className={billingUi.input}
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              placeholder="airline.rep@example.com"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              disabled={!createCode || creating}
              className={billingUi.btnPrimary}
              onClick={() => void createCase()}
            >
              {creating ? 'Creating…' : 'Create / open case'}
            </button>
          </div>
        </div>
      </section>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-[color:var(--billing-text-secondary)]">
            Status
          </span>
          <select
            className={billingUi.input}
            value={statusFilter}
            onChange={(e) => {
              const v = e.target.value;
              const q = new URLSearchParams(searchParams.toString());
              if (v) q.set('status', v);
              else q.delete('status');
              router.replace(`/billing/kyc${q.toString() ? `?${q}` : ''}`);
            }}
          >
            <option value="">All</option>
            {KYC_STATUSES.map((s) => (
              <option key={s} value={s}>
                {KYC_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-[12rem] flex-1 text-xs">
          <span className="mb-1 block font-medium text-[color:var(--billing-text-secondary)]">
            Search
          </span>
          <input
            className={billingUi.input}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Code, name, email…"
          />
        </label>
        <button type="button" className={billingUi.btnSecondary} onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {error ? (
        <p className="mb-3 text-sm text-[color:var(--billing-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className={`${billingUi.insightsCard} overflow-x-auto`}>
        <table className="min-w-full text-sm">
          <thead className="bg-[color:var(--billing-surface-muted)] text-left text-xs uppercase tracking-wide text-[color:var(--billing-text-muted)]">
            <tr>
              <th className="px-3 py-2">Airline</th>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Complete</th>
              <th className="px-3 py-2">Invite email</th>
              <th className="px-3 py-2">Updated</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--billing-border)]">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-[color:var(--billing-text-muted)]">
                  Loading…
                </td>
              </tr>
            ) : null}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-[color:var(--billing-text-muted)]">
                  No KYC cases yet — create one above.
                </td>
              </tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r._id}>
                <td className="px-3 py-2 font-medium text-[color:var(--billing-heading)]">
                  {r.customerName}
                </td>
                <td className="px-3 py-2 tabular-nums">{r.customerCode}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-3 py-2 tabular-nums">{r.completenessPercent}%</td>
                <td className="px-3 py-2 text-[color:var(--billing-text-muted)]">
                  {r.inviteEmail || '—'}
                </td>
                <td className="px-3 py-2 text-[color:var(--billing-text-muted)]">
                  {r.updatedAt
                    ? new Date(r.updatedAt).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—'}
                </td>
                <td className="px-3 py-2">
                  <Link href={`/billing/kyc/${r._id}`} className={billingUi.link}>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
