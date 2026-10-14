'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { BillingPageHeader } from '../BillingLayout';
import { StatusBadge } from '../StatusBadge';
import type { BillingApi } from '@/lib/billing-api';
import type { CutoverPhase } from '@/lib/billing-shared/enums';

const DEFAULT_FROM = '2026-02-01';
const DEFAULT_TO = '2026-03-31';

const PHASES: CutoverPhase[] = ['parallel', 'fris_primary', 'bc_readonly'];

type Props = { api: BillingApi };

export function CutoverPage({ api }: Props) {
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);
  const [status, setStatus] = useState<{
    settings?: {
      cutoverPhase?: string;
      nativeBillingEnabled?: boolean;
      parallelRunStartDate?: string;
    };
    metrics?: Record<string, number>;
    checklist?: Array<{ id: string; label: string; done: boolean; active: boolean }>;
  } | null>(null);
  const [recon, setRecon] = useState<Record<string, unknown> | null>(null);
  const [msg, setMsg] = useState('');
  const [csvText, setCsvText] = useState(
    'customerCode,invoiceNumber,totalInclTax\nAI,SI-HYD/25-26/0001,125000',
  );

  const load = useCallback(async () => {
    const res = await api.getCutoverStatus();
    setStatus((res as { data: typeof status }).data);
  }, [api]);

  const loadRecon = useCallback(async () => {
    const res = await api.getCutoverReconciliation({ from, to });
    setRecon((res as { data: Record<string, unknown> }).data);
  }, [api, from, to]);

  useEffect(() => {
    void load();
    void loadRecon();
  }, [load, loadRecon]);

  const updatePhase = async (cutoverPhase: CutoverPhase) => {
    try {
      await api.updateCutoverSettings({ cutoverPhase });
      setMsg(`Phase set to ${cutoverPhase}`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    }
  };

  const toggleNative = async () => {
    const next = !status?.settings?.nativeBillingEnabled;
    await api.updateCutoverSettings({ nativeBillingEnabled: next });
    setMsg(`Native billing ${next ? 'enabled' : 'disabled'}`);
    await load();
  };

  const runBackfill = async (dryRun: boolean) => {
    const res = await api.backfillPreparation({
      billingPeriodStart: from,
      billingPeriodEnd: to,
      dryRun,
    });
    setMsg(JSON.stringify((res as { data: unknown }).data));
    await loadRecon();
  };

  const importCsv = async () => {
    const lines = csvText.trim().split(/\r?\n/).filter(Boolean);
    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const rows = lines.slice(1).map((line) => {
      const cols = line.split(',');
      const obj: Record<string, string> = {};
      header.forEach((h, i) => {
        obj[h] = cols[i]?.trim() ?? '';
      });
      return {
        customerCode: obj.customercode,
        invoiceNumber: obj.invoicenumber,
        totalInclTax: Number(obj.totalincltax || 0),
      };
    });
    await api.importBcBaseline({
      billingPeriodStart: from,
      billingPeriodEnd: to,
      rows,
    });
    setMsg(`Imported ${rows.length} BC baseline rows`);
    await loadRecon();
  };

  const phase = status?.settings?.cutoverPhase ?? 'parallel';

  return (
    <>
      <BillingPageHeader
        title="Migration & cutover"
        description="Parallel run with BC — reconciliation, backfill, and phase control"
        actions={
          <button
            type="button"
            onClick={() => void toggleNative()}
            className="rounded-lg border border-[color:var(--billing-accent)] px-4 py-2 text-sm font-medium text-[color:var(--billing-accent-strong)] hover:bg-[color:var(--billing-accent-soft)]"
          >
            Native billing: {status?.settings?.nativeBillingEnabled ? 'ON' : 'OFF'}
          </button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <StatusBadge status={phase} />
        {status?.metrics ? (
          <span className="text-sm text-gray-600">
            Prep {status.metrics.preparationRecords} · Posted {status.metrics.postedInvoices}
          </span>
        ) : null}
      </div>

      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Cutover checklist</h2>
        <ul className="space-y-2">
          {(status?.checklist ?? []).map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-sm">
              <span className={item.done ? 'text-[color:var(--billing-accent)]' : 'text-gray-400'}>
                {item.done ? '✓' : '○'}
              </span>
              <span className={item.active ? 'font-medium text-gray-900' : 'text-gray-600'}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          {PHASES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => void updatePhase(p)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                phase === p ? 'bg-[color:var(--billing-primary)] text-white' : 'border border-gray-300 text-gray-700'
              }`}
            >
              {p.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-500">
          BC decommission is a separate step — use{' '}
          <Link href="/billing/decommission" className="text-[color:var(--billing-accent-strong)] underline">
            /billing/decommission
          </Link>{' '}
          after bc_readonly.
        </p>
      </section>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <label className="text-xs font-medium text-gray-600">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ml-2 rounded border px-2 py-1 text-sm" />
        </label>
        <label className="text-xs font-medium text-gray-600">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ml-2 rounded border px-2 py-1 text-sm" />
        </label>
        <button type="button" onClick={() => void loadRecon()} className="rounded-lg bg-[color:var(--billing-primary)] px-4 py-2 text-sm text-white">
          Refresh reconciliation
        </button>
      </div>

      {recon ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="exportedNAV serials" value={Number(recon.exportedNavSerialCount)} />
          <Metric label="In preparation" value={Number(recon.preparationCount)} />
          <Metric label="FRIS posted total" value={fmt(Number(recon.frisPostedTotal))} />
          <Metric label="BC imported total" value={fmt(Number(recon.bcImportedTotal))} />
          <Metric label="Variance" value={fmt(Number(recon.varianceTotal))} warn={Math.abs(Number(recon.varianceTotal)) >= 1} />
          <Metric label="Missing in prep" value={Number(recon.missingCount)} warn={Number(recon.missingCount) > 0} />
        </div>
      ) : null}

      {recon?.readyForSignoff ? (
        <div className="mb-4 rounded-lg border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] px-4 py-3 text-sm text-[color:var(--billing-heading)]">
          Ready for finance sign-off this period.
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold">Backfill from exportedNAV</h2>
          <p className="mb-3 text-xs text-gray-600">
            Creates preparation records for serials already flagged exportedNAV=Yes in raw_flight_data.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void runBackfill(true)} className="rounded border px-3 py-1.5 text-sm">
              Dry run
            </button>
            <button type="button" onClick={() => void runBackfill(false)} className="rounded bg-[color:var(--billing-primary)] px-3 py-1.5 text-sm text-white">
              Run backfill
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold">Import BC baseline CSV</h2>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={4}
            className="mb-2 w-full rounded border border-gray-300 p-2 font-mono text-xs"
          />
          <button type="button" onClick={() => void importCsv()} className="rounded bg-[color:var(--billing-primary)] px-3 py-1.5 text-sm text-white">
            Import
          </button>
        </section>
      </div>

      {msg ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800">{msg}</div>
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
