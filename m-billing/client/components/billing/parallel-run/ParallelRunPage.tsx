'use client';

import { useCallback, useEffect, useState } from 'react';
import { BillingPageHeader } from '../BillingLayout';
import { StatusBadge } from '../StatusBadge';
import type { BillingApi } from '@/lib/billing-api';
import { formatBillingDateRange } from '@/lib/billing-shared/billing-date-format';

const DEFAULT_FROM = '2026-02-01';
const DEFAULT_TO = '2026-03-31';

type Snapshot = {
  _id: string;
  weekLabel?: string;
  weekNumber?: number;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  readyForSignoff: boolean;
  capturedBy: string;
  capturedAt: string;
  signedOffBy?: string;
  signedOffAt?: string;
  metrics?: Record<string, unknown>;
};

type Props = { api: BillingApi };

export function ParallelRunPage({ api }: Props) {
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [recon, setRecon] = useState<Record<string, unknown> | null>(null);
  const [parallelStart, setParallelStart] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [signOffNotes, setSignOffNotes] = useState('');

  const load = useCallback(async () => {
    const [statusRes, snapRes, reconRes] = await Promise.all([
      api.getCutoverStatus(),
      api.listParallelSnapshots({ limit: 12 }),
      api.getCutoverReconciliation({ from, to }),
    ]);
    const status = (statusRes as { data: { settings?: { parallelRunStartDate?: string } } }).data;
    setParallelStart(status.settings?.parallelRunStartDate ?? null);
    setSnapshots((snapRes as { data: Snapshot[] }).data ?? []);
    setRecon((reconRes as { data: Record<string, unknown> }).data);
  }, [api, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const captureWeek = async () => {
    try {
      await api.captureParallelSnapshot({ from, to });
      setMsg('Weekly snapshot captured');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Capture failed');
    }
  };

  const signOff = async (force = false) => {
    try {
      await api.signOffParallelPeriod({ from, to, notes: signOffNotes || undefined, force });
      setMsg(force ? 'Period signed off (forced)' : 'Period signed off');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Sign-off failed');
    }
  };

  const startParallel = async () => {
    try {
      await api.startParallelRun();
      setMsg('Parallel run started — native billing enabled');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed to start');
    }
  };

  return (
    <>
      <BillingPageHeader
        title="Parallel run"
        description="Weekly BC vs FRIS reconciliation — capture snapshots and finance sign-off"
        actions={
          <button
            type="button"
            onClick={() => void startParallel()}
            className="rounded-lg bg-[color:var(--billing-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)]"
          >
            Start parallel run
          </button>
        }
      />

      {parallelStart ? (
        <p className="mb-4 text-sm text-gray-600">
          Parallel run since {new Date(parallelStart).toLocaleDateString()}
        </p>
      ) : (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Parallel run not started — BC remains official poster until you start and complete sign-off.
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <label className="text-xs font-medium text-gray-600">
          Period from
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="ml-2 rounded border px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-gray-600">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="ml-2 rounded border px-2 py-1 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={() => void captureWeek()}
          className="rounded-lg bg-[color:var(--billing-primary)] px-4 py-2 text-sm text-white"
        >
          Capture week snapshot
        </button>
      </div>

      {recon ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Variance" value={fmt(Number(recon.varianceTotal))} warn={Math.abs(Number(recon.varianceTotal)) >= 1} />
          <Metric label="Missing in prep" value={Number(recon.missingCount)} warn={Number(recon.missingCount) > 0} />
          <Metric label="FRIS posted" value={fmt(Number(recon.frisPostedTotal))} />
          <Metric label="BC imported" value={fmt(Number(recon.bcImportedTotal))} />
        </div>
      ) : null}

      {recon?.readyForSignoff ? (
        <section className="mb-6 rounded-xl border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] p-4">
          <h2 className="mb-2 text-sm font-semibold text-[color:var(--billing-heading)]">Ready for finance sign-off</h2>
          <textarea
            value={signOffNotes}
            onChange={(e) => setSignOffNotes(e.target.value)}
            placeholder="Optional sign-off notes"
            rows={2}
            className="mb-2 w-full rounded border border-[color:var(--billing-accent-border)] p-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void signOff(false)}
            className="rounded-lg bg-[color:var(--billing-primary-hover)] px-4 py-2 text-sm text-white"
          >
            Sign off period
          </button>
        </section>
      ) : (
        <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-2 text-sm text-gray-600">
            Not ready for sign-off — import BC baseline on Cutover page and clear missing serials.
          </p>
          <button
            type="button"
            onClick={() => void signOff(true)}
            className="rounded border border-amber-400 px-3 py-1.5 text-xs text-amber-800"
          >
            Force sign-off (finance approval)
          </button>
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Snapshot history</h2>
        {snapshots.length === 0 ? (
          <p className="text-sm text-gray-500">No snapshots yet — capture your first week above.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {snapshots.map((s) => (
              <li key={s._id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <span className="font-medium">{s.weekLabel ?? `Week ${s.weekNumber ?? '—'}`}</span>
                  <span className="ml-2 text-gray-500">
                    {formatBillingDateRange(s.billingPeriodStart, s.billingPeriodEnd)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {s.signedOffAt ? (
                    <StatusBadge status="posted" />
                  ) : s.readyForSignoff ? (
                    <StatusBadge status="approved" />
                  ) : (
                    <StatusBadge status="draft" />
                  )}
                  <span className="text-xs text-gray-500">
                    {s.capturedBy} · {new Date(s.capturedAt).toLocaleDateString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {msg ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800">
          {msg}
        </div>
      ) : null}
    </>
  );
}

function Metric({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${warn ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}
