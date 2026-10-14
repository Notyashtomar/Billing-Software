'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BillingPageHeader } from '../BillingLayout';
import { StatusBadge } from '../StatusBadge';
import type { BillingApi } from '@/lib/billing-api';

type ReadinessItem = {
  id: string;
  label: string;
  passed: boolean;
  required: boolean;
  detail?: string;
};

type DecommissionRecord = {
  _id: string;
  decommissionedBy: string;
  decommissionedAt: string;
  notes?: string;
  forced?: boolean;
  rolledBack?: boolean;
};

type Props = { api: BillingApi };

export function DecommissionPage({ api }: Props) {
  const [readiness, setReadiness] = useState<{
    ready?: boolean;
    decommissioned?: boolean;
    cutoverPhase?: string;
    checklist?: ReadinessItem[];
  } | null>(null);
  const [policy, setPolicy] = useState<{
    legacyNavExportAllowed?: boolean;
    reason?: string;
  } | null>(null);
  const [records, setRecords] = useState<DecommissionRecord[]>([]);
  const [notes, setNotes] = useState('');
  const [rollbackReason, setRollbackReason] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const [readyRes, policyRes, recordsRes] = await Promise.all([
      api.getDecommissionReadiness(),
      api.getLegacyExportPolicy(),
      api.listDecommissionRecords(),
    ]);
    setReadiness((readyRes as { data: typeof readiness }).data);
    setPolicy((policyRes as { data: typeof policy }).data);
    setRecords((recordsRes as { data: DecommissionRecord[] }).data ?? []);
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const execute = async (force = false) => {
    try {
      await api.executeDecommission({ notes: notes || undefined, force });
      setMsg(force ? 'BC decommissioned (forced)' : 'BC invoicing decommissioned');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Decommission failed');
    }
  };

  const rollback = async () => {
    if (!rollbackReason.trim()) {
      setMsg('Rollback reason required');
      return;
    }
    try {
      await api.rollbackDecommission({ reason: rollbackReason });
      setMsg('Rolled back to bc_readonly — legacy export re-enabled');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Rollback failed');
    }
  };

  const phase = readiness?.cutoverPhase ?? 'parallel';
  const decommissioned = Boolean(readiness?.decommissioned);

  return (
    <>
      <BillingPageHeader
        title="BC decommission"
        description="Retire Business Central invoicing — FRIS native billing becomes sole AR source of truth"
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <StatusBadge status={phase} />
        {policy ? (
          <span
            className={`text-sm ${policy.legacyNavExportAllowed ? 'text-gray-600' : 'font-medium text-amber-800'}`}
          >
            Legacy exportedNAV: {policy.legacyNavExportAllowed ? 'allowed' : 'blocked'}
          </span>
        ) : null}
      </div>

      {decommissioned ? (
        <div className="mb-6 rounded-xl border border-slate-300 bg-slate-50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Decommission complete</h2>
          <p className="mb-3 text-sm text-slate-700">
            {policy?.reason} Wire the legacy export guard on FRIS integration per{' '}
            <code className="text-xs">legacy-export-guard.adapter.ts</code>.
          </p>
          <label className="mb-2 block text-xs font-medium text-gray-600">
            Emergency rollback reason
            <input
              value={rollbackReason}
              onChange={(e) => setRollbackReason(e.target.value)}
              className="mt-1 w-full max-w-md rounded border px-2 py-1.5 text-sm"
              placeholder="Finance approval reference"
            />
          </label>
          <button
            type="button"
            onClick={() => void rollback()}
            className="rounded border border-amber-500 px-3 py-1.5 text-sm text-amber-900"
          >
            Rollback to bc_readonly
          </button>
        </div>
      ) : (
        <>
          <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Readiness checklist</h2>
            <p className="mb-3 text-xs text-gray-600">
              Complete parallel run and set <strong>bc_readonly</strong> on{' '}
              <Link href="/billing/cutover" className="text-[color:var(--billing-accent-strong)] underline">
                Cutover
              </Link>{' '}
              before decommissioning.
            </p>
            <ul className="space-y-2">
              {(readiness?.checklist ?? []).map((item) => (
                <li key={item.id} className="flex flex-wrap items-start gap-2 text-sm">
                  <span className={item.passed ? 'text-[color:var(--billing-accent)]' : 'text-gray-400'}>
                    {item.passed ? '✓' : '○'}
                  </span>
                  <div>
                    <span className={item.required ? 'font-medium text-gray-900' : 'text-gray-700'}>
                      {item.label}
                      {!item.required ? (
                        <span className="ml-1 text-xs text-gray-400">(recommended)</span>
                      ) : null}
                    </span>
                    {item.detail ? (
                      <p className="text-xs text-gray-500">{item.detail}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {readiness?.ready ? (
            <section className="mb-6 rounded-xl border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] p-4">
              <h2 className="mb-2 text-sm font-semibold text-[color:var(--billing-heading)]">Ready to decommission</h2>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Decommission notes (optional)"
                rows={2}
                className="mb-3 w-full rounded border border-[color:var(--billing-accent-border)] p-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void execute(false)}
                className="rounded-lg bg-[color:var(--billing-primary-hover)] px-4 py-2 text-sm font-medium text-white"
              >
                Decommission BC invoicing
              </button>
            </section>
          ) : (
            <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="mb-2 text-sm text-amber-900">Required checks not complete.</p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Force decommission justification"
                rows={2}
                className="mb-2 w-full rounded border border-amber-200 p-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void execute(true)}
                className="rounded border border-amber-600 px-3 py-1.5 text-sm text-amber-900"
              >
                Force decommission (finance approval)
              </button>
            </section>
          )}
        </>
      )}

      {records.length > 0 ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Decommission history</h2>
          <ul className="divide-y divide-gray-100 text-sm">
            {records.map((r) => (
              <li key={r._id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {r.decommissionedBy} · {new Date(r.decommissionedAt).toLocaleString()}
                  {r.rolledBack ? ' (rolled back)' : ''}
                </span>
                {r.forced ? <StatusBadge status="cancelled" /> : <StatusBadge status="posted" />}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {msg ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">{msg}</div>
      ) : null}
    </>
  );
}
