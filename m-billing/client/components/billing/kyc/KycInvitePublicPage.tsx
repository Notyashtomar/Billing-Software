'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getApiBase } from '@/lib/api';
import type { BillingKycCase, BillingKycFormData } from '@/lib/billing-shared/types';
import { KYC_DOCUMENT_TYPES } from '@/lib/billing-shared/enums';
import { BillingDesignRoot } from '../BillingDesignRoot';
import { billingUi } from '../billingUi';
import { KycFormPanel } from './KycFormPanel';

async function inviteFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${getApiBase()}${path}`, {
    ...init,
    credentials: 'omit',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (json as { message?: string | string[] }).message ??
      (json as { error?: string }).error ??
      `Request failed (${res.status})`;
    throw new Error(Array.isArray(msg) ? msg.join(', ') : String(msg));
  }
  return json as { data?: unknown; success?: boolean };
}

export function KycInvitePublicPage() {
  const params = useParams();
  const token = String(params?.token ?? '');
  const [meta, setMeta] = useState<{
    customerCode: string;
    customerName: string;
    stationCode: string;
  } | null>(null);
  const [row, setRow] = useState<BillingKycCase | null>(null);
  const [form, setForm] = useState<BillingKycFormData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState('');
  const [docType, setDocType] = useState('gst_certificate');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await inviteFetch(`/billing/kyc/invite/${encodeURIComponent(token)}`);
      const data = res.data as {
        case?: BillingKycCase;
        customerCode?: string;
        customerName?: string;
        stationCode?: string;
      };
      if (!data?.case) throw new Error('Invite not found');
      setRow(data.case);
      setForm(data.case.form ?? {});
      setMeta({
        customerCode: data.customerCode ?? data.case.customerCode ?? '',
        customerName: data.customerName ?? data.case.customerName ?? '',
        stationCode: data.stationCode ?? data.case.stationCode ?? '',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid invite link');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError('');
    setMsg('');
    try {
      const res = await inviteFetch(`/billing/kyc/invite/${encodeURIComponent(token)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form }),
      });
      const data = res.data as BillingKycCase;
      if (data) {
        setRow(data);
        setForm(data.form ?? {});
      }
      setMsg('Progress saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await inviteFetch(`/billing/kyc/invite/${encodeURIComponent(token)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form }),
      });
      await inviteFetch(`/billing/kyc/invite/${encodeURIComponent(token)}/submit`, {
        method: 'POST',
      });
      setDone(true);
      setMsg('Submitted — thank you. Billing will review your KYC.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSaving(false);
    }
  };

  const onUpload = async (file: File | null) => {
    if (!file) return;
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('docType', docType);
      const res = await inviteFetch(
        `/billing/kyc/invite/${encodeURIComponent(token)}/documents`,
        { method: 'POST', body: fd },
      );
      const data = res.data as BillingKycCase;
      if (data) setRow(data);
      setMsg('Document uploaded');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BillingDesignRoot>
      <div className="billing-app min-h-[100dvh] bg-[color:var(--billing-bg)] px-4 py-8 text-[color:var(--billing-text)] sm:px-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <header>
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[color:var(--billing-text-muted)]">
              Airline KYC registration
            </p>
            <h1 className="m-0 mt-1 text-2xl font-bold text-[color:var(--billing-heading)]">
              {meta ? `${meta.customerName} (${meta.customerCode})` : 'KYC form'}
            </h1>
            {meta ? (
              <p className="m-0 mt-1 text-sm text-[color:var(--billing-text-muted)]">
                Station {meta.stationCode} · Secure invite link — no login required
              </p>
            ) : null}
          </header>

          {loading ? (
            <p className="text-[color:var(--billing-text-muted)]">Opening invite…</p>
          ) : null}
          {error ? (
            <p className="text-[color:var(--billing-danger)]" role="alert">
              {error}
            </p>
          ) : null}
          {msg ? (
            <p className="text-[color:var(--billing-success)]">{msg}</p>
          ) : null}

          {!loading && !error && !done ? (
            <>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving}
                  className={billingUi.btnSecondary}
                  onClick={() => void save()}
                >
                  Save progress
                </button>
                <button
                  type="button"
                  disabled={saving}
                  className={billingUi.btnPrimary}
                  onClick={() => void submit()}
                >
                  Submit KYC
                </button>
              </div>
              <KycFormPanel form={form} disabled={saving} onChange={setForm} />
              <section className={`${billingUi.insightsCard} p-4`}>
                <h2 className={`${billingUi.sectionTitle} mb-2`}>Upload documents</h2>
                <ul className="mb-3 space-y-1 text-sm">
                  {(row?.documents ?? []).map((d) => (
                    <li key={`${d.fileKey}-${d.uploadedAt}`}>
                      {d.docType.replace(/_/g, ' ')} — {d.originalName}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-end gap-3">
                  <select
                    className={billingUi.input}
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                  >
                    {KYC_DOCUMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                  <input
                    type="file"
                    onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
                  />
                </div>
              </section>
            </>
          ) : null}

          {done ? (
            <div className={`${billingUi.insightsCard} p-6 text-center`}>
              <p className="m-0 text-lg font-semibold text-[color:var(--billing-heading)]">
                KYC submitted
              </p>
              <p className="m-0 mt-2 text-sm text-[color:var(--billing-text-muted)]">
                You can close this window. Our team will review and contact you if anything is missing.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </BillingDesignRoot>
  );
}
