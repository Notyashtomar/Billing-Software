'use client';

import { useCallback, useEffect, useState } from 'react';
import { BillingPageHeader } from '../BillingLayout';
import { ConfigureRulesButton, type AirportCommercial } from './AirportRulesWizard';
import { BillingDataTable } from '../BillingDataTable';
import { SettingsSubNav } from './SettingsSubNav';
import { FieldGroup, TextArea, TextInput } from './SettingsFormFields';
import {
  ExchangeRateEditDialog,
  SequenceDeleteDialog,
  SequenceEditDialog,
  TaxRuleEditDialog,
} from './SettingsEditDialogs';
import { TableEditButton } from '../TableEditButton';
import type { BillingApi } from '@/lib/billing-api';
import { formatBillingDate } from '@/lib/billing-shared/billing-date-format';
import { defaultInvoiceSequenceForm, currentIndianFiscalYear } from '../billingFiscalYear';
import {
  downloadSettingsTemplate,
  parseStationProfileWorkbook,
  parseTaxRulesWorkbook,
  type TaxRuleImport,
} from './settingsWorkbook';

function SettingsImportBar({
  onFile,
  hint,
}: {
  onFile: (file: File) => void;
  hint: string;
}) {
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-xl border border-[color:var(--billing-border)] bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-[color:var(--billing-text-muted)]">{hint}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="min-h-10 rounded-lg border border-[color:var(--billing-border)] px-3 text-sm font-semibold"
          onClick={() => void downloadSettingsTemplate()}
        >
          Download template
        </button>
        <label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-[color:var(--billing-primary)] px-3 text-sm font-semibold text-white">
          Import workbook
          <input
            type="file"
            accept=".xlsx,.xls"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onFile(file);
            }}
          />
        </label>
      </div>
    </div>
  );
}

type Props = { api: BillingApi };

type SettingsDoc = {
  stationCode?: string;
  defaultPaymentTerms?: string;
  approvalRequired?: boolean;
  monthCloseLockDay?: number;
  gstStateCode?: string;
  companyLegalEntity?: {
    name?: string;
    address?: string;
    gstin?: string;
    pan?: string;
  };
  bankDetails?: {
    bankName?: string;
    branchAddress?: string;
    beneficiaryName?: string;
    accountNumber?: string;
    ifscCode?: string;
    swiftCode?: string;
    chequePayableText?: string;
  };
  airportCommercial?: AirportCommercial & {
    effectiveFrom?: string;
    effectiveTo?: string;
  };
};

function FormCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
      <h2 className="mb-4 text-base font-semibold text-gray-900">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/** Priority 1 — station profile & invoice letterhead */
export function StationProfilePage({ api }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [airportCommercial, setAirportCommercial] = useState<AirportCommercial | null>(null);
  const [stationCode, setStationCode] = useState('');
  const [form, setForm] = useState({
    companyName: '',
    companyAddress: '',
    companyGstin: '',
    companyPan: '',
    gstStateCode: '',
    defaultPaymentTerms: '',
    monthCloseLockDay: '',
    approvalRequired: true,
    bankName: '',
    branchAddress: '',
    beneficiaryName: '',
    accountNumber: '',
    ifscCode: '',
    swiftCode: '',
    chequePayableText: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getSettings();
      const doc = (res as { data: SettingsDoc }).data;
      setStationCode(doc.stationCode ?? '');
      const commercial = doc.airportCommercial;
      setAirportCommercial(
        commercial
          ? {
              ...commercial,
              effectiveFrom: commercial.effectiveFrom ? String(commercial.effectiveFrom).slice(0, 10) : '',
              effectiveTo: commercial.effectiveTo ? String(commercial.effectiveTo).slice(0, 10) : '',
            }
          : null,
      );
      setForm({
        companyName: doc.companyLegalEntity?.name ?? '',
        companyAddress: doc.companyLegalEntity?.address ?? '',
        companyGstin: doc.companyLegalEntity?.gstin ?? '',
        companyPan: doc.companyLegalEntity?.pan ?? '',
        gstStateCode: doc.gstStateCode ?? '',
        defaultPaymentTerms: doc.defaultPaymentTerms ?? '',
        monthCloseLockDay:
          doc.monthCloseLockDay != null ? String(doc.monthCloseLockDay) : '',
        approvalRequired: doc.approvalRequired ?? true,
        bankName: doc.bankDetails?.bankName ?? '',
        branchAddress: doc.bankDetails?.branchAddress ?? '',
        beneficiaryName: doc.bankDetails?.beneficiaryName ?? '',
        accountNumber: doc.bankDetails?.accountNumber ?? '',
        ifscCode: doc.bankDetails?.ifscCode ?? '',
        swiftCode: doc.bankDetails?.swiftCode ?? '',
        chequePayableText: doc.bankDetails?.chequePayableText ?? '',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.updateSettings({
        defaultPaymentTerms: form.defaultPaymentTerms || undefined,
        approvalRequired: form.approvalRequired,
        monthCloseLockDay: form.monthCloseLockDay
          ? Number(form.monthCloseLockDay)
          : undefined,
        gstStateCode: form.gstStateCode.trim() || undefined,
        companyLegalEntity: {
          name: form.companyName || undefined,
          address: form.companyAddress || undefined,
          gstin: form.companyGstin || undefined,
          pan: form.companyPan || undefined,
        },
        bankDetails: {
          bankName: form.bankName || undefined,
          branchAddress: form.branchAddress || undefined,
          beneficiaryName: form.beneficiaryName || undefined,
          accountNumber: form.accountNumber || undefined,
          ifscCode: form.ifscCode || undefined,
          swiftCode: form.swiftCode || undefined,
          chequePayableText: form.chequePayableText || undefined,
        },
      });
      setSuccess('Airport setup saved.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <>
        <BillingPageHeader
          title="Airport Setup"
          description="Invoice letterhead and bank details for your station"
          actions={<ConfigureRulesButton api={api} />}
        />
        <SettingsSubNav />
        <p className="text-sm text-gray-500">Loading airport setup…</p>
      </>
    );
  }

  return (
    <>
      <BillingPageHeader
        title="Airport Setup"
        description={
          stationCode
            ? `Invoice letterhead & bank details for station ${stationCode}`
            : 'Invoice letterhead & bank details for your station'
        }
        actions={
          <ConfigureRulesButton
            api={api}
            initial={airportCommercial}
            onSaved={() => {
              setSuccess('Airport rules saved.');
              void load();
            }}
          />
        }
      />
      <SettingsSubNav />
      <SettingsImportBar
        hint="Download the template, fill the Station profile sheet, then import. Fields update here. Save airport setup to keep them."
        onFile={(file) => {
          setError('');
          void parseStationProfileWorkbook(file)
            .then((imported) => {
              setForm((current) => ({ ...current, ...imported }));
              setSuccess('Station profile fields filled from the workbook. Save to keep them.');
            })
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : 'Could not read the workbook');
            });
        }}
      />
      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mb-4 rounded-lg border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] px-4 py-3 text-sm text-[color:var(--billing-accent-strong)]">
          {success}
        </div>
      ) : null}
      {airportCommercial ? (
        <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
          <h2 className="text-base font-semibold text-gray-900">Airport rules</h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-gray-500">Ownership</dt>
              <dd className="font-medium">
                {airportCommercial.ownership === 'private' ? 'Private airport' : 'Airport Authority'}
              </dd>
            </div>
            {airportCommercial.ownership === 'private' ? (
              <div>
                <dt className="text-gray-500">Royalty</dt>
                <dd className="font-medium">
                  {airportCommercial.revenueShareMechanism === 'net'
                    ? 'Royalty on Net'
                    : airportCommercial.revenueShareMechanism === 'gross'
                      ? 'Royalty on Gross'
                      : 'Not chosen'}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-gray-500">MAG rates</dt>
              <dd className="font-medium">
                {airportCommercial.minRevenueShareApplicable
                  ? `Yes — (MAG rates applicable) · ${airportCommercial.ceilingRates?.length ?? 0} rates`
                  : 'No'}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
      <form onSubmit={(e) => void save(e)} className="flex flex-col gap-6">
        <FormCard title="Company (invoice header)">
          <FieldGroup label="Legal company name" htmlFor="companyName">
            <TextInput
              id="companyName"
              value={form.companyName}
              onChange={(v) => setForm((f) => ({ ...f, companyName: v }))}
              placeholder="Bird Flight Services India Pvt Ltd"
            />
          </FieldGroup>
          <FieldGroup
            label="Station code"
            htmlFor="gstStateCode"
            hint="GST state code printed on tax invoices in the State Code field (e.g. 33 for Tamil Nadu). Station-specific."
          >
            <TextInput
              id="gstStateCode"
              type="number"
              value={form.gstStateCode}
              onChange={(v) => setForm((f) => ({ ...f, gstStateCode: v.replace(/\D/g, '').slice(0, 2) }))}
              placeholder="33"
            />
          </FieldGroup>
          <FieldGroup label="Company GSTIN" htmlFor="companyGstin">
            <TextInput
              id="companyGstin"
              value={form.companyGstin}
              onChange={(v) => setForm((f) => ({ ...f, companyGstin: v }))}
            />
          </FieldGroup>
          <div className="sm:col-span-2">
            <FieldGroup label="Registered address" htmlFor="companyAddress">
              <TextArea
                id="companyAddress"
                value={form.companyAddress}
                onChange={(v) => setForm((f) => ({ ...f, companyAddress: v }))}
              />
            </FieldGroup>
          </div>
          <FieldGroup label="PAN" htmlFor="companyPan">
            <TextInput
              id="companyPan"
              value={form.companyPan}
              onChange={(v) => setForm((f) => ({ ...f, companyPan: v }))}
            />
          </FieldGroup>
          <FieldGroup label="Default payment terms" htmlFor="paymentTerms">
            <TextInput
              id="paymentTerms"
              value={form.defaultPaymentTerms}
              onChange={(v) => setForm((f) => ({ ...f, defaultPaymentTerms: v }))}
              placeholder="NET30"
            />
          </FieldGroup>
          <FieldGroup label="Month-close lock day" htmlFor="lockDay" hint="Optional — day of month after which posting is blocked">
            <TextInput
              id="lockDay"
              type="number"
              value={form.monthCloseLockDay}
              onChange={(v) => setForm((f) => ({ ...f, monthCloseLockDay: v }))}
            />
          </FieldGroup>
          <FieldGroup label="Invoice approval required" htmlFor="approval">
            <select
              id="approval"
              value={form.approvalRequired ? 'yes' : 'no'}
              onChange={(e) =>
                setForm((f) => ({ ...f, approvalRequired: e.target.value === 'yes' }))
              }
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </FieldGroup>
        </FormCard>

        <FormCard title="Bank details (invoice footer)">
          <FieldGroup label="Bank name" htmlFor="bankName">
            <TextInput
              id="bankName"
              value={form.bankName}
              onChange={(v) => setForm((f) => ({ ...f, bankName: v }))}
            />
          </FieldGroup>
          <FieldGroup label="Beneficiary name" htmlFor="beneficiaryName">
            <TextInput
              id="beneficiaryName"
              value={form.beneficiaryName}
              onChange={(v) => setForm((f) => ({ ...f, beneficiaryName: v }))}
            />
          </FieldGroup>
          <div className="sm:col-span-2">
            <FieldGroup label="Branch address" htmlFor="branchAddress">
              <TextArea
                id="branchAddress"
                value={form.branchAddress}
                onChange={(v) => setForm((f) => ({ ...f, branchAddress: v }))}
              />
            </FieldGroup>
          </div>
          <FieldGroup label="INR account number" htmlFor="accountNumber">
            <TextInput
              id="accountNumber"
              value={form.accountNumber}
              onChange={(v) => setForm((f) => ({ ...f, accountNumber: v }))}
            />
          </FieldGroup>
          <FieldGroup label="IFSC code" htmlFor="ifscCode">
            <TextInput
              id="ifscCode"
              value={form.ifscCode}
              onChange={(v) => setForm((f) => ({ ...f, ifscCode: v }))}
            />
          </FieldGroup>
          <FieldGroup label="SWIFT code" htmlFor="swiftCode">
            <TextInput
              id="swiftCode"
              value={form.swiftCode}
              onChange={(v) => setForm((f) => ({ ...f, swiftCode: v }))}
            />
          </FieldGroup>
          <div className="sm:col-span-2">
            <FieldGroup label="Cheque payable text" htmlFor="chequePayable">
              <TextInput
                id="chequePayable"
                value={form.chequePayableText}
                onChange={(v) => setForm((f) => ({ ...f, chequePayableText: v }))}
                placeholder="Payable to company legal name"
              />
            </FieldGroup>
          </div>
        </FormCard>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[color:var(--billing-primary)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save airport setup'}
          </button>
        </div>
      </form>
    </>
  );
}

export function TaxRulesPage({ api }: Props) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editRecord, setEditRecord] = useState<{
    _id: string;
    ruleCode: string;
    gstPercent: number;
    placeOfSupply: string;
    effectiveFrom: string;
    effectiveTo: string;
  } | null>(null);
  const [form, setForm] = useState({
    ruleCode: '',
    gstPercent: '18',
    placeOfSupply: 'intra_state',
    effectiveFrom: '',
    effectiveTo: '',
  });
  const [queuedRules, setQueuedRules] = useState<TaxRuleImport[]>([]);
  const [importNote, setImportNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listTaxRules();
      const data = res.data as { items?: Array<Record<string, unknown>> };
      setRows(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.createTaxRule({
        ruleCode: form.ruleCode,
        gstPercent: Number(form.gstPercent),
        placeOfSupply: form.placeOfSupply,
        effectiveFrom: form.effectiveFrom,
        effectiveTo: form.effectiveTo,
      });
      const [next, ...rest] = queuedRules;
      setQueuedRules(rest);
      setForm(
        next ?? {
          ruleCode: '',
          gstPercent: '18',
          placeOfSupply: 'intra_state',
          effectiveFrom: '',
          effectiveTo: '',
        },
      );
      setImportNote(
        next
          ? `Rule saved. Next workbook row is in the form (${rest.length} still waiting).`
          : '',
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tax rule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <BillingPageHeader
        title="Tax rules"
        description="GST configuration (India)"
        actions={<ConfigureRulesButton api={api} />}
      />
      <SettingsSubNav />
      <SettingsImportBar
        hint="Download the template, fill the Tax rules sheet, then import. The first row fills this form. Add it, and the next row loads."
        onFile={(file) => {
          setError('');
          void parseTaxRulesWorkbook(file)
            .then((rules) => {
              const [first, ...rest] = rules;
              if (!first) return;
              setForm(first);
              setQueuedRules(rest);
              setImportNote(
                rest.length > 0
                  ? `Filled from the workbook. ${rest.length} more rule${rest.length === 1 ? '' : 's'} will load after you add this one.`
                  : 'Tax rule fields filled from the workbook. Add the rule to save it.',
              );
            })
            .catch((err: unknown) => {
              setImportNote('');
              setError(err instanceof Error ? err.message : 'Could not read the workbook');
            });
        }}
      />
      {importNote ? (
        <p className="mb-4 rounded-lg border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] px-4 py-3 text-sm text-[color:var(--billing-accent-strong)]">
          {importNote}
        </p>
      ) : null}
      <form
        onSubmit={(e) => void create(e)}
        className="mb-6 rounded-xl border border-gray-200 bg-white p-4 sm:p-6"
      >
        <h2 className="mb-4 text-base font-semibold text-gray-900">New tax rule</h2>
        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FieldGroup label="Rule code" htmlFor="ruleCode">
            <TextInput
              id="ruleCode"
              required
              value={form.ruleCode}
              onChange={(v) => setForm((f) => ({ ...f, ruleCode: v }))}
              placeholder="GST-AIRPORT-18"
            />
          </FieldGroup>
          <FieldGroup label="GST %" htmlFor="gstPercent">
            <TextInput
              id="gstPercent"
              type="number"
              required
              value={form.gstPercent}
              onChange={(v) => setForm((f) => ({ ...f, gstPercent: v }))}
            />
          </FieldGroup>
          <FieldGroup label="Place of supply" htmlFor="placeOfSupply">
            <select
              id="placeOfSupply"
              value={form.placeOfSupply}
              onChange={(e) => setForm((f) => ({ ...f, placeOfSupply: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="intra_state">Intra-state (CGST + SGST)</option>
              <option value="inter_state">Inter-state (IGST)</option>
            </select>
          </FieldGroup>
          <FieldGroup label="Effective from" htmlFor="effectiveFrom">
            <TextInput
              id="effectiveFrom"
              type="date"
              required
              value={form.effectiveFrom}
              onChange={(v) => setForm((f) => ({ ...f, effectiveFrom: v }))}
            />
          </FieldGroup>
          <FieldGroup label="Effective to" htmlFor="effectiveTo">
            <TextInput
              id="effectiveTo"
              type="date"
              required
              value={form.effectiveTo}
              onChange={(v) => setForm((f) => ({ ...f, effectiveTo: v }))}
            />
          </FieldGroup>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[color:var(--billing-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add tax rule'}
          </button>
        </div>
      </form>
      <BillingDataTable
        loading={loading}
        rows={rows}
        getRowKey={(r) => String(r._id)}
        emptyMessage="No tax rules yet — add one above"
        columns={[
          { key: 'code', header: 'Rule', render: (r) => String(r.ruleCode ?? '') },
          { key: 'gst', header: 'GST %', render: (r) => String(r.gstPercent ?? '') },
          { key: 'pos', header: 'Place of supply', render: (r) => String(r.placeOfSupply ?? '') },
          {
            key: 'edit',
            header: '',
            render: (r) => (
              <TableEditButton
                onClick={() =>
                  setEditRecord({
                    _id: String(r._id),
                    ruleCode: String(r.ruleCode),
                    gstPercent: Number(r.gstPercent),
                    placeOfSupply: String(r.placeOfSupply),
                    effectiveFrom: String(r.effectiveFrom),
                    effectiveTo: String(r.effectiveTo),
                  })
                }
              />
            ),
          },
        ]}
      />
      <TaxRuleEditDialog
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

export function CurrencyPage({ api }: Props) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    startingDate: '',
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

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.createExchangeRate({
        currencyCode: form.currencyCode,
        rateToINR: Number(form.rateToINR),
        startingDate: form.startingDate,
        source: form.source,
      });
      setForm({ currencyCode: 'USD', rateToINR: '', startingDate: '', source: 'manual' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create exchange rate');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <BillingPageHeader title="Currency & ROE" description="Exchange rates for USD invoicing" />
      <SettingsSubNav />
      <form
        onSubmit={(e) => void create(e)}
        className="mb-6 rounded-xl border border-gray-200 bg-white p-4 sm:p-6"
      >
        <h2 className="mb-4 text-base font-semibold text-gray-900">New exchange rate</h2>
        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FieldGroup label="Currency" htmlFor="currencyCode">
            <TextInput
              id="currencyCode"
              required
              value={form.currencyCode}
              onChange={(v) => setForm((f) => ({ ...f, currencyCode: v }))}
            />
          </FieldGroup>
          <FieldGroup label="Rate to INR" htmlFor="rateToINR">
            <TextInput
              id="rateToINR"
              type="number"
              required
              value={form.rateToINR}
              onChange={(v) => setForm((f) => ({ ...f, rateToINR: v }))}
              placeholder="94.6772"
            />
          </FieldGroup>
          <FieldGroup label="Starting date" htmlFor="startingDate">
            <TextInput
              id="startingDate"
              type="date"
              required
              value={form.startingDate}
              onChange={(v) => setForm((f) => ({ ...f, startingDate: v }))}
            />
          </FieldGroup>
          <FieldGroup label="Source" htmlFor="source">
            <select
              id="source"
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
            {saving ? 'Saving…' : 'Add exchange rate'}
          </button>
        </div>
      </form>
      <BillingDataTable
        loading={loading}
        rows={rows}
        getRowKey={(r) => String(r._id)}
        emptyMessage="No exchange rates yet — add one above"
        columns={[
          { key: 'ccy', header: 'Currency', render: (r) => String(r.currencyCode ?? '') },
          { key: 'rate', header: 'Rate to INR', render: (r) => String(r.rateToINR ?? '') },
          {
            key: 'date',
            header: 'Starting date',
            render: (r) =>
              formatBillingDate(
                typeof r.startingDate === 'string' || r.startingDate instanceof Date
                  ? r.startingDate
                  : undefined,
              ),
          },
          {
            key: 'edit',
            header: '',
            render: (r) => (
              <TableEditButton
                onClick={() =>
                  setEditRecord({
                    _id: String(r._id),
                    currencyCode: String(r.currencyCode),
                    rateToINR: Number(r.rateToINR),
                    startingDate: String(r.startingDate),
                    source: r.source != null ? String(r.source) : undefined,
                  })
                }
              />
            ),
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

export function SequencesPage({ api }: Props) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editRecord, setEditRecord] = useState<{
    _id: string;
    sequenceCode: string;
    prefix: string;
    fiscalYear: string;
    currentValue: number;
  } | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<{
    _id: string;
    sequenceCode: string;
    prefix: string;
    fiscalYear: string;
    currentValue: number;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState(() => defaultInvoiceSequenceForm());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listSequences();
      const data = res.data as { items?: Array<Record<string, unknown>> };
      setRows(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setForm(defaultInvoiceSequenceForm());
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.createSequence({
        sequenceCode: form.sequenceCode,
        prefix: form.prefix,
        fiscalYear: form.fiscalYear,
        documentType: form.documentType,
      });
      setForm(defaultInvoiceSequenceForm());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create sequence');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteRecord) return;
    setDeleting(true);
    setError('');
    try {
      await api.deleteSequence(deleteRecord._id);
      setDeleteRecord(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete sequence');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <BillingPageHeader
        title="Invoice sequences"
        description={`Post needs SI-{station} for FY ${currentIndianFiscalYear()}. Missing series is created automatically on first Post.`}
        actions={<ConfigureRulesButton api={api} />}
      />
      <SettingsSubNav />
      <form
        onSubmit={(e) => void create(e)}
        className="mb-6 rounded-xl border border-gray-200 bg-white p-4 sm:p-6"
      >
        <h2 className="mb-4 text-base font-semibold text-gray-900">New sequence</h2>
        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FieldGroup label="Sequence code" htmlFor="sequenceCode">
            <TextInput
              id="sequenceCode"
              required
              value={form.sequenceCode}
              onChange={(v) => setForm((f) => ({ ...f, sequenceCode: v }))}
              placeholder="SI-MAA"
            />
          </FieldGroup>
          <FieldGroup label="Prefix" htmlFor="prefix">
            <TextInput
              id="prefix"
              required
              value={form.prefix}
              onChange={(v) => setForm((f) => ({ ...f, prefix: v }))}
              placeholder="SI/MAA/25-26/"
            />
          </FieldGroup>
          <FieldGroup label="Fiscal year" htmlFor="fiscalYear">
            <TextInput
              id="fiscalYear"
              required
              value={form.fiscalYear}
              onChange={(v) => setForm((f) => ({ ...f, fiscalYear: v }))}
            />
          </FieldGroup>
          <FieldGroup label="Document type" htmlFor="documentType">
            <select
              id="documentType"
              value={form.documentType}
              onChange={(e) => {
                const documentType = e.target.value as 'invoice' | 'credit_memo';
                setForm((f) =>
                  defaultInvoiceSequenceForm(documentType, undefined, f.fiscalYear),
                );
              }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="invoice">Invoice</option>
              <option value="credit_memo">Credit memo</option>
            </select>
          </FieldGroup>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[color:var(--billing-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add sequence'}
          </button>
        </div>
      </form>
      <BillingDataTable
        loading={loading}
        rows={rows}
        getRowKey={(r) => String(r._id)}
        emptyMessage="No sequences yet — add one above"
        columns={[
          { key: 'code', header: 'Sequence', render: (r) => String(r.sequenceCode ?? '') },
          { key: 'prefix', header: 'Prefix', render: (r) => String(r.prefix ?? '') },
          { key: 'fy', header: 'Fiscal year', render: (r) => String(r.fiscalYear ?? '') },
          { key: 'cur', header: 'Current', render: (r) => String(r.currentValue ?? 0) },
          {
            key: 'actions',
            header: 'Actions',
            render: (r) => {
              const row = {
                _id: String(r._id),
                sequenceCode: String(r.sequenceCode),
                prefix: String(r.prefix),
                fiscalYear: String(r.fiscalYear),
                currentValue: Number(r.currentValue ?? 0),
              };
              const busy = deleting && deleteRecord?._id === row._id;
              return (
                <div className="flex flex-wrap items-center gap-3">
                  <TableEditButton onClick={() => setEditRecord(row)} />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDeleteRecord(row)}
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
      <SequenceEditDialog
        api={api}
        open={editRecord != null}
        onOpenChange={(open) => {
          if (!open) setEditRecord(null);
        }}
        record={editRecord}
        onSaved={() => void load()}
      />
      <SequenceDeleteDialog
        open={deleteRecord != null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteRecord(null);
        }}
        record={deleteRecord}
        onConfirm={() => void confirmDelete()}
        deleting={deleting}
      />
    </>
  );
}
