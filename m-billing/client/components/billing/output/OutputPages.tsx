'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BillingPageHeader } from '../BillingLayout';
import { BillingDataTable } from '../BillingDataTable';
import { StatusBadge } from '../StatusBadge';
import { billingUi } from '../billingUi';
import type { BillingApi } from '@/lib/billing-api';
import { formatBillingDate, formatBillingDateRange } from '@/lib/billing-shared/billing-date-format';

const DEFAULT_FROM = '2026-02-28';
const DEFAULT_TO = '2026-03-31';

type Props = { api: BillingApi };

const CREDIT_REASON_LABEL: Record<string, string> = {
  xxld_not_chargeable: 'XXLD not chargeable',
  delay_dispute: 'Delay dispute',
  correction: 'Correction',
  other: 'Other',
};

function asRows(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== 'object') return [];
  const rec = payload as { data?: unknown; items?: unknown };
  if (Array.isArray(rec.data)) return rec.data as Array<Record<string, unknown>>;
  if (rec.data && typeof rec.data === 'object') {
    const inner = rec.data as { items?: unknown };
    if (Array.isArray(inner.items)) return inner.items as Array<Record<string, unknown>>;
  }
  if (Array.isArray(rec.items)) return rec.items as Array<Record<string, unknown>>;
  return [];
}

function money(value: unknown): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ymd(value: unknown): string {
  if (value == null) return formatBillingDate(undefined);
  if (value instanceof Date) return formatBillingDate(value);
  if (typeof value === 'string') return formatBillingDate(value);
  return formatBillingDate(String(value));
}

function dateLike(value: unknown): string | Date | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'string') return value;
  return String(value);
}

function invoiceLabel(inv: Record<string, unknown>): string {
  const no = String(inv.invoiceNumber ?? inv.draftNumber ?? inv._id);
  const customerCode = String(inv.customerCode ?? '');
  const ccy = String(inv.currencyCode ?? '');
  return `${no} — ${customerCode} — ${ccy} ${money(inv.remainingAmount ?? inv.totalInclTax)}`;
}

function remainingOnInvoice(inv: Record<string, unknown>): number {
  const n = Number(inv.remainingAmount ?? inv.totalInclTax ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function CreditMemosPage({ api }: Props) {
  const searchParams = useSearchParams();
  const preselectInvoiceId = searchParams.get('invoiceId') ?? '';
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [postedInvoices, setPostedInvoices] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState('');
  const [reason, setReason] = useState('');
  const [customer, setCustomer] = useState('');
  const [invoiceId, setInvoiceId] = useState(preselectInvoiceId);
  const [issueReason, setIssueReason] = useState('correction');
  const [amount, setAmount] = useState('');
  const [documentDate, setDocumentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [postingId, setPostingId] = useState('');
  const [formMsg, setFormMsg] = useState('');
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [memosRes, invoicesRes] = await Promise.all([
        api.listCreditMemos(),
        api.listInvoices({ status: 'posted', limit: 500 }),
      ]);
      setRows(asRows(memosRes));
      setPostedInvoices(asRows(invoicesRes));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load credit memos');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!preselectInvoiceId) return;
    setInvoiceId(preselectInvoiceId);
  }, [preselectInvoiceId]);

  useEffect(() => {
    const inv = postedInvoices.find((r) => String(r._id) === invoiceId);
    if (!inv) return;
    setAmount(String(remainingOnInvoice(inv) || ''));
  }, [invoiceId, postedInvoices]);

  const filtered = useMemo(() => {
    const statusNeedle = status.trim().toLowerCase();
    const reasonNeedle = reason.trim().toLowerCase();
    const customerNeedle = customer.trim().toUpperCase();
    return rows.filter((r) => {
      if (statusNeedle && String(r.status ?? '').toLowerCase() !== statusNeedle) return false;
      if (reasonNeedle && String(r.reason ?? '').toLowerCase() !== reasonNeedle) return false;
      if (customerNeedle && !String(r.customerCode ?? '').toUpperCase().includes(customerNeedle)) {
        return false;
      }
      return true;
    });
  }, [rows, status, reason, customer]);

  const kpis = useMemo(() => {
    const draft = rows.filter((r) => String(r.status) === 'draft').length;
    const posted = rows.filter((r) => String(r.status) === 'posted').length;
    const total = rows.reduce((sum, r) => sum + Number(r.totalInclTax || 0), 0);
    return { draft, posted, total, count: rows.length };
  }, [rows]);

  const selectedInvoice = postedInvoices.find((r) => String(r._id) === invoiceId);

  const issueMemo = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) {
      setFormError('Pick a posted invoice first.');
      return;
    }
    const creditAmount = Number(amount);
    if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
      setFormError('Enter a credit amount greater than zero.');
      return;
    }
    setSaving(true);
    setFormError('');
    setFormMsg('');
    try {
      await api.createCreditMemo({
        customerCode: String(selectedInvoice.customerCode ?? ''),
        appliesToInvoiceId: String(selectedInvoice._id),
        reason: issueReason,
        documentDate,
        lines: [
          {
            description: `Credit — ${CREDIT_REASON_LABEL[issueReason] ?? issueReason}`,
            quantity: 1,
            unitPrice: creditAmount,
            lineAmountInclTax: creditAmount,
          },
        ],
      });
      setFormMsg(
        `Draft credit memo created for ${String(selectedInvoice.invoiceNumber ?? selectedInvoice.draftNumber)}. Post it below to reduce receivable.`,
      );
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create credit memo');
    } finally {
      setSaving(false);
    }
  };

  const postMemo = async (id: string) => {
    setPostingId(id);
    setFormError('');
    setFormMsg('');
    try {
      await api.postCreditMemo(id);
      setFormMsg('Credit memo posted.');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not post credit memo');
    } finally {
      setPostingId('');
    }
  };

  return (
    <>
      <BillingPageHeader
        title="Credit memos"
        description="Posted invoices stay on Invoices. Use this page only to issue a credit when a billed amount must be reduced."
      />

      {loadError ? <div className={`${billingUi.alertDanger} mb-4`}>{loadError}</div> : null}
      {formError ? <div className={`${billingUi.alertDanger} mb-4`}>{formError}</div> : null}
      {formMsg ? <div className={`${billingUi.alertSuccess} mb-4`}>{formMsg}</div> : null}

      <form
        onSubmit={(e) => void issueMemo(e)}
        className="mb-6 rounded-xl border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] p-4 sm:p-6"
      >
        <h2 className={billingUi.sectionTitle}>Issue credit memo</h2>
        <p className={`${billingUi.sectionDesc} mb-4`}>
          {postedInvoices.length === 0
            ? 'No posted invoices yet. Post an invoice from Workflow → Invoices, then come back here.'
            : `${postedInvoices.length} posted invoice${postedInvoices.length === 1 ? '' : 's'} available to credit.`}
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)] sm:col-span-2">
            Posted invoice
            <select
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              className={billingUi.select}
              required
              aria-label="Posted invoice to credit"
            >
              <option value="">Select posted invoice</option>
              {postedInvoices.map((inv) => (
                <option key={String(inv._id)} value={String(inv._id)}>
                  {invoiceLabel(inv)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)]">
            Reason
            <select
              value={issueReason}
              onChange={(e) => setIssueReason(e.target.value)}
              className={billingUi.select}
              aria-label="Credit reason"
            >
              {Object.entries(CREDIT_REASON_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)]">
            Amount
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={billingUi.input}
              aria-label="Credit amount"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)]">
            Document date
            <input
              type="date"
              required
              value={documentDate}
              onChange={(e) => setDocumentDate(e.target.value)}
              className={billingUi.input}
              aria-label="Credit memo date"
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <button type="submit" disabled={saving || postedInvoices.length === 0} className={billingUi.btnPrimary}>
            {saving ? 'Creating…' : 'Issue draft credit memo'}
          </button>
        </div>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={billingUi.kpiDefault}>
          <p className={billingUi.hint}>Memos</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-[color:var(--billing-heading)]">
            {kpis.count}
          </p>
        </div>
        <div className={billingUi.kpiWarning}>
          <p className={billingUi.hint}>Draft</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{kpis.draft}</p>
        </div>
        <div className={billingUi.kpiSuccess}>
          <p className={billingUi.hint}>Posted</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{kpis.posted}</p>
        </div>
        <div className={billingUi.kpiDefault}>
          <p className={billingUi.hint}>Credit value</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-[color:var(--billing-heading)]">
            {money(kpis.total)}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] p-4">
        <label className="flex min-w-[9rem] flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)]">
          Customer
          <input
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            placeholder="Airline code"
            className={billingUi.input}
            aria-label="Filter credit memos by customer"
          />
        </label>
        <label className="flex min-w-[9rem] flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)]">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={billingUi.select}
            aria-label="Filter credit memos by status"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="posted">Posted</option>
          </select>
        </label>
        <label className="flex min-w-[11rem] flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)]">
          Reason
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={billingUi.select}
            aria-label="Filter credit memos by reason"
          >
            <option value="">All reasons</option>
            {Object.entries(CREDIT_REASON_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <BillingDataTable
        loading={loading}
        rows={filtered}
        getRowKey={(r) => String(r._id)}
        emptyMessage="No credit memos yet. Pick a posted invoice above and issue a draft credit."
        columns={[
          {
            key: 'no',
            header: 'Number',
            render: (r) => String(r.creditMemoNumber ?? 'Draft'),
          },
          { key: 'customer', header: 'Customer', render: (r) => String(r.customerCode ?? '—') },
          {
            key: 'invoice',
            header: 'Applies to',
            render: (r) => {
              const invoiceNo = String(r.appliesToInvoiceNo ?? 'Posted invoice');
              const appliesId = String(r.appliesToInvoiceId ?? '');
              return appliesId ? (
                <Link href={`/billing/invoices/${appliesId}`} className={billingUi.link}>
                  {invoiceNo}
                </Link>
              ) : (
                invoiceNo
              );
            },
          },
          {
            key: 'reason',
            header: 'Reason',
            render: (r) =>
              CREDIT_REASON_LABEL[String(r.reason ?? '')] ?? String(r.reason ?? '—'),
          },
          {
            key: 'amount',
            header: 'Amount',
            render: (r) => <span className="tabular-nums">{money(r.totalInclTax)}</span>,
          },
          {
            key: 'status',
            header: 'Status',
            render: (r) => <StatusBadge status={String(r.status ?? 'draft')} />,
          },
          {
            key: 'actions',
            header: 'Actions',
            render: (r) =>
              String(r.status) === 'draft' ? (
                <button
                  type="button"
                  disabled={postingId === String(r._id)}
                  onClick={() => void postMemo(String(r._id))}
                  className={billingUi.link}
                >
                  {postingId === String(r._id) ? 'Posting…' : 'Post'}
                </button>
              ) : (
                '—'
              ),
          },
        ]}
      />
    </>
  );
}

export function ReportsPage({ api }: Props) {
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);
  const [reports, setReports] = useState<Array<Record<string, unknown>>>([]);
  const [lastResult, setLastResult] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const res = await api.listReports();
    setReports(asRows(res));
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async (type: string) => {
    setLoading(true);
    setLastResult('');
    try {
      const res = await api.generateReport(type, { from, to });
      setLastResult(
        `Generated ${type}: ${JSON.stringify((res as { data?: { title?: string } }).data?.title ?? 'ok')}`,
      );
      await load();
    } catch (e) {
      setLastResult(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const reportTypes = [
    {
      id: 'revenue-summary',
      label: 'Revenue summary',
      hint: 'Station revenue by customer and source for the selected period.',
    },
    {
      id: 'schedule-reconciliation',
      label: 'Schedule reconciliation',
      hint: 'Match billed flights to the published schedule so missing turns surface early.',
    },
    {
      id: 'delay-charges',
      label: 'Delay charges',
      hint: 'Delay-related extras that may sit outside the basic handling package.',
    },
    {
      id: 'xxld-decisions',
      label: 'XXLD decisions',
      hint: 'Cancelled / extra-long delay decisions and whether they were billed or credited.',
    },
    {
      id: 'tax-summary',
      label: 'Tax summary',
      hint: 'GST / tax totals for finance close.',
    },
  ];

  return (
    <>
      <BillingPageHeader
        title="Billing reports"
        description="Period packs for finance: revenue, schedule match, delay extras, XXLD, and tax."
      />
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)]">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={billingUi.input}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)]">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={billingUi.input}
          />
        </label>
      </div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {reportTypes.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={loading}
            onClick={() => void generate(t.id)}
            className={`${billingUi.card} p-4 text-left transition-[border-color,transform] duration-150 hover:border-[color:var(--billing-accent-border)] active:scale-[0.99] disabled:opacity-50`}
          >
            <p className="text-sm font-semibold text-[color:var(--billing-heading)]">{t.label}</p>
            <p className="mt-1 text-xs text-[color:var(--billing-text-muted)]">{t.hint}</p>
            <span className="mt-3 inline-block text-sm font-medium text-[color:var(--billing-accent-strong)]">
              Generate →
            </span>
          </button>
        ))}
      </div>
      {lastResult ? <div className={`${billingUi.alertAccent} mb-4`}>{lastResult}</div> : null}
      <BillingDataTable
        rows={reports}
        getRowKey={(r) => String(r._id)}
        emptyMessage="No reports generated yet — pick a pack above"
        columns={[
          { key: 'type', header: 'Type', render: (r) => String(r.reportType ?? '—') },
          { key: 'title', header: 'Title', render: (r) => String(r.title ?? '—') },
          {
            key: 'at',
            header: 'Generated',
            render: (r) => String(r.generatedAt ?? '').slice(0, 19) || '—',
          },
        ]}
      />
    </>
  );
}

export function AuditPage({ api }: Props) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [entityType, setEntityType] = useState('');
  const [who, setWho] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    void api
      .listAuditLogs({ limit: 200 })
      .then((res) => {
        if (cancelled) return;
        setRows(asRows(res));
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : 'Could not load audit trail');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const filtered = useMemo(() => {
    const entityNeedle = entityType.trim().toLowerCase();
    const whoNeedle = who.trim().toLowerCase();
    return rows.filter((r) => {
      if (entityNeedle && !String(r.entityType ?? '').toLowerCase().includes(entityNeedle)) {
        return false;
      }
      if (whoNeedle && !String(r.userName ?? '').toLowerCase().includes(whoNeedle)) {
        return false;
      }
      return true;
    });
  }, [rows, entityType, who]);

  return (
    <>
      <BillingPageHeader
        title="Audit trail"
        description="Who changed billing records, when, and on which invoice, memo, or master."
      />
      {loadError ? <div className={`${billingUi.alertDanger} mb-4`}>{loadError}</div> : null}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] p-4">
        <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)]">
          Entity
          <input
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            placeholder="invoice, credit memo…"
            className={billingUi.input}
            aria-label="Filter audit by entity type"
          />
        </label>
        <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)]">
          User
          <input
            value={who}
            onChange={(e) => setWho(e.target.value)}
            placeholder="Name"
            className={billingUi.input}
            aria-label="Filter audit by user"
          />
        </label>
      </div>
      <BillingDataTable
        loading={loading}
        rows={filtered}
        getRowKey={(r) => String(r._id)}
        emptyMessage="No audit entries yet"
        columns={[
          {
            key: 'when',
            header: 'When',
            render: (r) => String(r.timestamp ?? '').slice(0, 19) || '—',
          },
          {
            key: 'entity',
            header: 'Entity',
            render: (r) => `${r.entityType ?? '—'} / ${String(r.entityId ?? '').slice(-6) || '—'}`,
          },
          { key: 'action', header: 'Action', render: (r) => String(r.action ?? '—') },
          { key: 'who', header: 'User', render: (r) => String(r.userName ?? '—') },
        ]}
      />
    </>
  );
}

export function BackingSheetsPage({ api }: Props) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [customer, setCustomer] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    void api
      .listBackingSheets()
      .then((res) => {
        if (cancelled) return;
        setRows(asRows(res));
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : 'Could not load backing sheets');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const filtered = useMemo(() => {
    const needle = customer.trim().toUpperCase();
    if (!needle) return rows;
    return rows.filter((r) => String(r.customerCode ?? '').toUpperCase().includes(needle));
  }, [rows, customer]);

  const flightRows = useMemo(
    () => filtered.reduce((sum, r) => sum + Number(r.rowCount || 0), 0),
    [filtered],
  );

  return (
    <>
      <BillingPageHeader
        title="Backing sheets"
        description="Flight-level proof behind each invoice — the 49-column sheet airlines use to check every billed turn."
      />
      {loadError ? <div className={`${billingUi.alertDanger} mb-4`}>{loadError}</div> : null}
      <div className={`${billingUi.alertInfo} mb-4`}>
        Generate a backing sheet from an invoice (Generate PDF). It stays linked to that invoice so
        disputes can be traced line by line.{' '}
        <Link href="/billing/invoices" className={billingUi.link}>
          Open invoices
        </Link>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className={billingUi.kpiDefault}>
          <p className={billingUi.hint}>Sheets</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-[color:var(--billing-heading)]">
            {filtered.length}
          </p>
        </div>
        <div className={billingUi.kpiDefault}>
          <p className={billingUi.hint}>Flight rows</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-[color:var(--billing-heading)]">
            {flightRows}
          </p>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] p-4">
        <label className="flex min-w-[9rem] flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)]">
          Customer
          <input
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            placeholder="Airline code"
            className={billingUi.input}
            aria-label="Filter backing sheets by customer"
          />
        </label>
      </div>
      <BillingDataTable
        loading={loading}
        rows={filtered}
        getRowKey={(r) => String(r._id)}
        emptyMessage="No backing sheets yet — generate from invoice detail (Generate PDF)"
        columns={[
          { key: 'customer', header: 'Customer', render: (r) => String(r.customerCode ?? '—') },
          {
            key: 'period',
            header: 'Period',
            render: (r) =>
              formatBillingDateRange(
                dateLike(r.billingPeriodStart),
                dateLike(r.billingPeriodEnd),
              ),
          },
          { key: 'rows', header: 'Rows', render: (r) => String(r.rowCount ?? 0) },
          {
            key: 'at',
            header: 'Generated',
            render: (r) => String(r.generatedAt ?? '').slice(0, 19) || '—',
          },
        ]}
      />
    </>
  );
}
