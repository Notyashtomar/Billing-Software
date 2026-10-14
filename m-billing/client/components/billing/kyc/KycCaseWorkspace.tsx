'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingKycCase, BillingKycFormData } from '@/lib/billing-shared/types';
import { KYC_DOCUMENT_TYPES } from '@/lib/billing-shared/enums';
import { BillingPageHeader } from '../BillingLayout';
import { StatusBadge } from '../StatusBadge';
import { billingUi } from '../billingUi';
import { KycFormPanel } from './KycFormPanel';

type Props = { api: BillingApi };

export function KycCaseWorkspace({ api }: Props) {
  const params = useParams();
  const id = String(params?.id ?? '');
  const [row, setRow] = useState<BillingKycCase | null>(null);
  const [form, setForm] = useState<BillingKycFormData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [docType, setDocType] = useState<string>('gst_certificate');
  const [inviteUrlHint, setInviteUrlHint] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.getKycCase(id);
      const data = (res as { data?: BillingKycCase }).data;
      if (!data) throw new Error('KYC case not found');
      setRow(data);
      setForm(data.form ?? {});
      setInviteEmail(data.inviteEmail ?? data.form?.billingContactEmail ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load case');
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const locked = row?.status === 'approved' || row?.status === 'submitted' || row?.status === 'under_review';

  const save = async () => {
    if (!id || locked) return;
    setSaving(true);
    setError('');
    setMsg('');
    try {
      const res = await api.updateKycCase(id, { form });
      const data = (res as { data?: BillingKycCase }).data;
      if (data) {
        setRow(data);
        setForm(data.form ?? {});
      }
      setMsg('Saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const sendInvite = async () => {
    if (!id || !inviteEmail.trim()) return;
    setSaving(true);
    setError('');
    setMsg('');
    setInviteUrlHint('');
    try {
      await save();
      const res = await api.sendKycInvite(id, { email: inviteEmail.trim() });
      const payload = (res as {
        data?: { case?: BillingKycCase; mail?: { sent?: boolean; error?: string }; inviteUrl?: string };
      }).data;
      if (payload?.case) {
        setRow(payload.case);
        setForm(payload.case.form ?? {});
      }
      if (payload?.inviteUrl) setInviteUrlHint(payload.inviteUrl);
      setMsg(
        payload?.mail?.sent
          ? 'Invite email sent'
          : `Invite created${payload?.mail?.error ? ` — mail: ${payload.mail.error}` : ''}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invite failed');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (
    action: 'submit' | 'review' | 'approve' | 'reject',
  ) => {
    if (!id) return;
    setSaving(true);
    setError('');
    setMsg('');
    try {
      if (!locked && action === 'submit') {
        await api.updateKycCase(id, { form });
      }
      const res =
        action === 'submit'
          ? await api.submitKycCase(id)
          : action === 'review'
            ? await api.reviewKycCase(id)
            : action === 'approve'
              ? await api.approveKycCase(id, { syncToCustomer: true })
              : await api.rejectKycCase(id, { note: 'Returned for correction' });
      const data = (res as { data?: BillingKycCase }).data;
      if (data) {
        setRow(data);
        setForm(data.form ?? {});
      }
      setMsg(action === 'approve' ? 'Approved — customer fields synced' : `Marked ${action}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : `${action} failed`);
    } finally {
      setSaving(false);
    }
  };

  const onUpload = async (file: File | null) => {
    if (!file || !id || locked) return;
    setSaving(true);
    setError('');
    try {
      const res = await api.uploadKycDocument(id, file, docType);
      const data = (res as { data?: BillingKycCase }).data;
      if (data) setRow(data);
      setMsg('Document uploaded');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={billingUi.page}>
        <p className="text-[color:var(--billing-text-muted)]">Loading KYC case…</p>
      </div>
    );
  }

  if (!row) {
    return (
      <div className={billingUi.page}>
        <p className="text-[color:var(--billing-danger)]">{error || 'Case not found'}</p>
        <Link href="/billing/kyc" className={billingUi.link}>
          Back to tracker
        </Link>
      </div>
    );
  }

  return (
    <div className={billingUi.page}>
      <BillingPageHeader
        title={`${row.customerCode} · KYC`}
        description={`${row.customerName} — ${row.completenessPercent}% complete`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StatusBadge status={row.status} />
        <Link href="/billing/kyc" className={`${billingUi.link} text-sm`}>
          ← Tracker
        </Link>
        {msg ? <span className="text-sm text-[color:var(--billing-success)]">{msg}</span> : null}
        {error ? (
          <span className="text-sm text-[color:var(--billing-danger)]" role="alert">
            {error}
          </span>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving || locked}
          className={billingUi.btnSecondary}
          onClick={() => void save()}
        >
          Save draft
        </button>
        <button
          type="button"
          disabled={saving || row.status === 'approved'}
          className={billingUi.btnPrimary}
          onClick={() => void runAction('submit')}
        >
          Submit for review
        </button>
        {row.status === 'submitted' ? (
          <button
            type="button"
            disabled={saving}
            className={billingUi.btnSecondary}
            onClick={() => void runAction('review')}
          >
            Start review
          </button>
        ) : null}
        {row.status === 'submitted' || row.status === 'under_review' ? (
          <>
            <button
              type="button"
              disabled={saving}
              className={billingUi.btnPrimary}
              onClick={() => void runAction('approve')}
            >
              Approve
            </button>
            <button
              type="button"
              disabled={saving}
              className={billingUi.btnSecondary}
              onClick={() => void runAction('reject')}
            >
              Reject
            </button>
          </>
        ) : null}
      </div>

      <section className={`${billingUi.insightsCard} mb-4 p-4`}>
        <h2 className={`${billingUi.sectionTitle} mb-2`}>Invite airline self-serve</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[16rem] flex-1 text-xs">
            <span className="mb-1 block font-medium">Representative email</span>
            <input
              type="email"
              className={billingUi.input}
              value={inviteEmail}
              disabled={row.status === 'approved'}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={saving || !inviteEmail.trim() || row.status === 'approved'}
            className={billingUi.btnSecondary}
            onClick={() => void sendInvite()}
          >
            Send / resend invite
          </button>
        </div>
        {inviteUrlHint ? (
          <p className="mt-2 break-all text-xs text-[color:var(--billing-text-muted)]">
            Share link (mail not configured): {inviteUrlHint}
          </p>
        ) : null}
      </section>

      <KycFormPanel
        form={form}
        disabled={locked || saving}
        onChange={setForm}
      />

      <section className={`${billingUi.insightsCard} mt-4 p-4`}>
        <h2 className={`${billingUi.sectionTitle} mb-2`}>Documents</h2>
        <ul className="mb-3 space-y-1 text-sm">
          {(row.documents ?? []).map((d) => (
            <li key={`${d.fileKey}-${d.uploadedAt}`}>
              {d.docType.replace(/_/g, ' ')} — {d.originalName}
            </li>
          ))}
          {(row.documents ?? []).length === 0 ? (
            <li className="text-[color:var(--billing-text-muted)]">No documents yet</li>
          ) : null}
        </ul>
        {!locked ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-xs">
              <span className="mb-1 block font-medium">Type</span>
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
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium">File</span>
              <input
                type="file"
                className="block text-sm"
                onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        ) : null}
        {row.reviewNote ? (
          <p className="mt-3 text-sm text-[color:var(--billing-text-muted)]">
            Review note: {row.reviewNote}
          </p>
        ) : null}
      </section>
    </div>
  );
}
