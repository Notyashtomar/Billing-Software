'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SearchableCombobox } from '@/components/ui/SearchableCombobox';
import type { SearchableComboOption } from '@/components/ui/SearchableCombobox';
import { FieldGroup, TextArea, TextInput } from '../settings/SettingsFormFields';
import { billingUi } from '../billingUi';
import { ContractSystemDate } from './ContractControls';
import type { BillingApi } from '@/lib/billing-api';
import type {
  BillingContract,
  BillingCustomer,
  BillingExchangeRate,
  BillingPriceCardAirline,
  BillingRateCard,
  BillingServiceCatalogItem,
} from '@/lib/billing-shared/types';
import type { PriceCardHandlingType } from '@/lib/billing-shared/enums';
import { formatPriceCardAirlineCategory } from '@/lib/billing-shared/enums';
import { formatBillingDate, formatBillingDateRange } from '@/lib/billing-shared/billing-date-format';
import { inrToUsd, parseAmountInput, usdToInr } from '@/lib/billing-shared/currency-convert';
import {
  defaultUomForPriceCardReference,
  normalizePriceCardReference,
  PRICE_CARD_REFERENCES,
} from '@/lib/billing-shared/price-card-references';
import {
  RATE_CARD_BILLING_SCOPES,
  type RateCardBillingScope,
} from '@/lib/billing-shared/rate-card-billing-scope';

const emptyForm = {
  contractId: '',
  customerCode: '',
  serviceCode: '',
  billingReference: '',
  category: '',
  currency: 'USD' as 'INR' | 'USD',
  unitPriceINR: '',
  unitPriceUSD: '',
  ceilingRateINR: '',
  ceilingRateUSD: '',
  uom: 'FLIGHT',
  minBillableUnits: '',
  billingScope: 'inclusive' as RateCardBillingScope,
  serviceCount: '',
  remarks: '',
  validFrom: '',
  validTo: '',
};

type Props = {
  api: BillingApi;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (saved?: BillingRateCard) => void;
  record?: BillingRateCard | null;
  handlingType?: PriceCardHandlingType | null;
  defaultCustomerCode?: string | null;
  defaultAircraftType?: string | null;
  /** Price card airline row the user opened — scopes new BHS service rows. */
  bhsContextEntry?: BillingPriceCardAirline | null;
  bhsAirlineEntries?: BillingPriceCardAirline[];
  customers?: BillingCustomer[];
  /** Service codes already on this scoped list — used to warn on duplicates. */
  existingServiceCodes?: string[];
};

export function RateCardFormDialog({
  api,
  open,
  onOpenChange,
  onSaved,
  record,
  handlingType = null,
  defaultCustomerCode = null,
  defaultAircraftType = null,
  bhsContextEntry = null,
  bhsAirlineEntries = [],
  customers = [],
  existingServiceCodes = [],
}: Props) {
  const isEdit = Boolean(record);
  const isBhsFlow = handlingType === 'BHS';
  const isAdsFlow = handlingType === 'ADS';
  const isBhsCreate = !isEdit && isBhsFlow;
  const isAdsCreate = !isEdit && isAdsFlow;
  const [form, setForm] = useState(emptyForm);
  const [contracts, setContracts] = useState<BillingContract[]>([]);
  const [services, setServices] = useState<BillingServiceCatalogItem[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [roe, setRoe] = useState<BillingExchangeRate | null>(null);
  const [bhsAircraftType, setBhsAircraftType] = useState('');

  const loadRoe = useCallback(
    async (date: string) => {
      const refDate = date || new Date().toISOString().slice(0, 10);
      try {
        const res = await api.getEffectiveExchangeRate({
          currencyCode: 'USD',
          date: refDate,
        });
        setRoe((res.data as BillingExchangeRate) ?? null);
      } catch {
        setRoe(null);
      }
    },
    [api],
  );

  const loadRefs = useCallback(async () => {
    setLoadingRefs(true);
    try {
      const [contractRes, catalogRes] = await Promise.all([
        api.listContracts(),
        api.listServiceCatalog(),
      ]);
      const contractData = contractRes.data as { items?: BillingContract[] };
      const catalogData = catalogRes.data as { items?: BillingServiceCatalogItem[] };
      setContracts(contractData.items ?? []);
      setServices(catalogData.items ?? []);
    } catch {
      setContracts([]);
      setServices([]);
    } finally {
      setLoadingRefs(false);
    }
  }, [api]);

  useEffect(() => {
    if (!open) return;
    setError('');
    void loadRefs();
    if (record) {
      setForm({
        contractId: String(record.contractId),
        customerCode: record.customerCode,
        serviceCode: record.serviceCode,
        billingReference: normalizePriceCardReference(record.billingReference ?? ''),
        category: record.category ?? '',
        currency: record.currency,
        unitPriceINR: record.unitPriceINR != null ? String(record.unitPriceINR) : '',
        unitPriceUSD: record.unitPriceUSD != null ? String(record.unitPriceUSD) : '',
        ceilingRateINR: record.ceilingRateINR != null ? String(record.ceilingRateINR) : '',
        ceilingRateUSD: record.ceilingRateUSD != null ? String(record.ceilingRateUSD) : '',
        uom: record.uom,
        minBillableUnits:
          record.minBillableUnits != null ? String(record.minBillableUnits) : '',
        billingScope:
          record.billingScope === 'exclusive' ? 'exclusive' : ('inclusive' as RateCardBillingScope),
        serviceCount: record.serviceCount != null ? String(record.serviceCount) : '',
        remarks: record.remarks ?? '',
        validFrom: record.validFrom.slice(0, 10),
        validTo: record.validTo.slice(0, 10),
      });
    } else {
      setForm(emptyForm);
      const aircraft =
        bhsContextEntry?.aircraftType.trim().toUpperCase() ||
        defaultAircraftType?.trim().toUpperCase() ||
        (bhsAirlineEntries.length === 1 ? bhsAirlineEntries[0].aircraftType : '');
      setBhsAircraftType(aircraft);
    }
  }, [open, record, loadRefs, defaultAircraftType, bhsAirlineEntries, bhsContextEntry]);

  useEffect(() => {
    if (!open || isEdit || !isBhsCreate || !defaultCustomerCode) return;
    const contract = contracts.find(
      (c) =>
        c.customerCode === defaultCustomerCode &&
        (c.status === 'active' || c.status === 'draft'),
    );
    const entry =
      bhsContextEntry ??
      bhsAirlineEntries.find(
        (e) =>
          e.customerCode === defaultCustomerCode &&
          (!bhsAircraftType || e.aircraftType.toUpperCase() === bhsAircraftType),
      );
    setForm((f) => ({
      ...f,
      customerCode: defaultCustomerCode,
      contractId: contract?._id ?? f.contractId,
      validFrom: entry?.validFrom.slice(0, 10) ?? contract?.priceValidFrom.slice(0, 10) ?? f.validFrom,
      validTo: entry?.validTo.slice(0, 10) ?? contract?.priceValidTo.slice(0, 10) ?? f.validTo,
    }));
  }, [
    bhsAircraftType,
    bhsAirlineEntries,
    bhsContextEntry,
    contracts,
    defaultCustomerCode,
    isBhsCreate,
    isEdit,
    open,
  ]);

  useEffect(() => {
    if (!open || isEdit || !isAdsCreate || !defaultCustomerCode) return;
    const contract = contracts.find(
      (c) =>
        c.customerCode === defaultCustomerCode &&
        (c.status === 'active' || c.status === 'draft'),
    );
    setForm((f) => ({
      ...f,
      customerCode: defaultCustomerCode,
      contractId: contract?._id ?? f.contractId,
      billingScope: 'exclusive',
      validFrom:
        bhsContextEntry?.validFrom.slice(0, 10) ??
        contract?.priceValidFrom.slice(0, 10) ??
        f.validFrom,
      validTo:
        bhsContextEntry?.validTo.slice(0, 10) ??
        contract?.priceValidTo.slice(0, 10) ??
        f.validTo,
      category: bhsContextEntry?.category ?? f.category,
    }));
  }, [
    bhsContextEntry,
    contracts,
    defaultCustomerCode,
    isAdsCreate,
    isEdit,
    open,
  ]);

  useEffect(() => {
    if (!open || isBhsFlow) return;
    void loadRoe(form.validFrom);
  }, [open, form.validFrom, loadRoe, isBhsFlow]);

  const rateToInr = roe?.rateToINR ?? null;

  const onUnitPriceInrChange = (value: string) => {
    setForm((f) => {
      const next = { ...f, unitPriceINR: value };
      if (!rateToInr) return next;
      const inr = parseAmountInput(value);
      next.unitPriceUSD = inr == null ? '' : inrToUsd(inr, rateToInr);
      return next;
    });
  };

  const onUnitPriceUsdChange = (value: string) => {
    setForm((f) => {
      const next = { ...f, unitPriceUSD: value };
      if (!rateToInr) return next;
      const usd = parseAmountInput(value);
      next.unitPriceINR = usd == null ? '' : usdToInr(usd, rateToInr);
      return next;
    });
  };

  const onCeilingInrChange = (value: string) => {
    setForm((f) => {
      const next = { ...f, ceilingRateINR: value };
      if (!rateToInr) return next;
      const inr = parseAmountInput(value);
      next.ceilingRateUSD = inr == null ? '' : inrToUsd(inr, rateToInr);
      return next;
    });
  };

  const onCeilingUsdChange = (value: string) => {
    setForm((f) => {
      const next = { ...f, ceilingRateUSD: value };
      if (!rateToInr) return next;
      const usd = parseAmountInput(value);
      next.ceilingRateINR = usd == null ? '' : usdToInr(usd, rateToInr);
      return next;
    });
  };

  const roeHint = rateToInr
    ? `ROE: 1 USD = ${rateToInr} INR${
        roe?.startingDate ? ` (from ${formatBillingDate(roe.startingDate)})` : ''
      }`
    : 'No USD exchange rate for this date — add one in Master → Conversion Rates';

  const onContractChange = (contractId: string) => {
    const contract = contracts.find((c) => c._id === contractId);
    setForm((f) => ({
      ...f,
      contractId,
      customerCode: contract?.customerCode ?? '',
      ...(isBhsCreate && bhsContextEntry
        ? {
            validFrom: bhsContextEntry.validFrom.slice(0, 10),
            validTo: bhsContextEntry.validTo.slice(0, 10),
          }
        : {
            validFrom: contract ? contract.priceValidFrom.slice(0, 10) : '',
            validTo: contract ? contract.priceValidTo.slice(0, 10) : '',
          }),
    }));
  };

  const onServiceChange = (serviceCode: string) => {
    const service = services.find((s) => s.serviceCode === serviceCode);
    setForm((f) => ({
      ...f,
      serviceCode,
      uom: f.billingReference
        ? (defaultUomForPriceCardReference(f.billingReference) ?? service?.uom ?? f.uom)
        : (service?.uom ?? f.uom),
    }));
  };

  const onBillingReferenceChange = (billingReference: string) => {
    const defaultUom = defaultUomForPriceCardReference(billingReference);
    setForm((f) => ({
      ...f,
      billingReference,
      uom: defaultUom ?? f.uom,
    }));
  };

  const customerContracts = useMemo(() => {
    if (!isBhsCreate) return contracts;
    const code = form.customerCode || defaultCustomerCode;
    if (!code) return contracts;
    return contracts.filter((c) => c.customerCode === code);
  }, [contracts, defaultCustomerCode, form.customerCode, isBhsCreate]);

  const bhsEntriesForCustomer = useMemo(
    () => bhsAirlineEntries.filter((e) => e.customerCode === form.customerCode),
    [bhsAirlineEntries, form.customerCode],
  );

  const resolvedBhsEntry = useMemo(() => {
    if (bhsContextEntry) return bhsContextEntry;
    const aircraft = bhsAircraftType.trim().toUpperCase();
    if (!aircraft) return bhsEntriesForCustomer[0];
    return (
      bhsEntriesForCustomer.find((e) => e.aircraftType.toUpperCase() === aircraft) ??
      bhsEntriesForCustomer[0]
    );
  }, [bhsContextEntry, bhsAircraftType, bhsEntriesForCustomer]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const priceInr = form.unitPriceINR.trim() ? Number(form.unitPriceINR) : undefined;
      const priceUsd = form.unitPriceUSD.trim() ? Number(form.unitPriceUSD) : undefined;

      if (isEdit && record) {
        if (!form.billingReference) {
          setError('Select a price card reference (TRND, PU, PH, etc.).');
          return;
        }
        await api.updateRateCard(
          record._id,
          isBhsFlow
            ? {
                billingReference: form.billingReference || undefined,
                validFrom: form.validFrom,
                validTo: form.validTo,
                billingScope: form.billingScope,
                serviceCount: form.serviceCount.trim()
                  ? Number(form.serviceCount)
                  : undefined,
                remarks: form.remarks.trim() || undefined,
              }
            : {
                category: form.category.trim() || undefined,
                billingReference: form.billingReference || undefined,
                currency: form.currency,
                uom: form.uom.trim(),
                validFrom: form.validFrom,
                validTo: form.validTo,
                unitPriceINR: priceInr,
                unitPriceUSD: priceUsd,
                ceilingRateINR: form.ceilingRateINR.trim()
                  ? Number(form.ceilingRateINR)
                  : undefined,
                ceilingRateUSD: form.ceilingRateUSD.trim()
                  ? Number(form.ceilingRateUSD)
                  : undefined,
                minBillableUnits: form.minBillableUnits.trim()
                  ? Number(form.minBillableUnits)
                  : undefined,
                remarks: form.remarks.trim() || undefined,
              },
        );
      } else if (isBhsCreate) {
        if (
          !form.contractId ||
          !form.customerCode ||
          !form.serviceCode ||
          !form.billingReference ||
          !form.validFrom ||
          !form.validTo
        ) {
          setError('Contract, service, price card reference, and valid dates are required.');
          return;
        }
        if (!bhsContextEntry && bhsEntriesForCustomer.length > 1 && !bhsAircraftType.trim()) {
          setError('Select an aircraft type for this airline.');
          return;
        }
        if (!services.some((s) => s.serviceCode === form.serviceCode)) {
          setError('Select a valid service code from the search list.');
          return;
        }

        const customer = customers.find((c) => c.customerCode === form.customerCode);
        const currency = customer?.currencyCode ?? 'INR';
        const service = services.find((s) => s.serviceCode === form.serviceCode);
        const uom =
          defaultUomForPriceCardReference(form.billingReference) ?? service?.uom ?? 'FLIGHT';
        const scopeEntry = bhsContextEntry ?? resolvedBhsEntry;
        const validFrom = scopeEntry?.validFrom.slice(0, 10) ?? form.validFrom;
        const validTo = scopeEntry?.validTo.slice(0, 10) ?? form.validTo;

        const body: Record<string, unknown> = {
          contractId: form.contractId,
          customerCode: form.customerCode,
          serviceCode: form.serviceCode.trim(),
          billingReference: form.billingReference,
          currency,
          uom,
          validFrom,
          validTo,
          aircraftType: scopeEntry?.aircraftType?.trim().toUpperCase() || undefined,
          category: scopeEntry?.category,
          billingScope: form.billingScope,
        };

        if (form.serviceCount.trim()) body.serviceCount = Number(form.serviceCount);
        if (form.remarks.trim()) body.remarks = form.remarks.trim();

        const createdRes = await api.createRateCard(body);
        const created = (createdRes as { data: BillingRateCard }).data;
        onOpenChange(false);
        onSaved(created);
        return;
      } else {
        if (form.currency === 'INR' && priceInr == null) {
          setError('Enter unit price INR for an INR rate card.');
          return;
        }
        if (form.currency === 'USD' && priceUsd == null) {
          setError('Enter unit price USD for a USD rate card.');
          return;
        }

        if (
          !form.contractId ||
          !form.customerCode ||
          !form.serviceCode ||
          !form.billingReference ||
          !form.validFrom ||
          !form.validTo ||
          !form.uom.trim()
        ) {
          setError('Contract, service, price card reference, UOM, and valid dates are required.');
          return;
        }

        if (!services.some((s) => s.serviceCode === form.serviceCode)) {
          setError('Select a valid service code from the search list.');
          return;
        }

        const body: Record<string, unknown> = {
          contractId: form.contractId,
          customerCode: form.customerCode,
          serviceCode: form.serviceCode.trim(),
          billingReference: form.billingReference,
          currency: form.currency,
          uom: form.uom.trim(),
          validFrom: form.validFrom,
          validTo: form.validTo,
        };

        if (isAdsCreate && bhsContextEntry) {
          body.aircraftType = bhsContextEntry.aircraftType.trim().toUpperCase();
          body.category = bhsContextEntry.category;
          body.billingScope = 'exclusive';
          body.validFrom = bhsContextEntry.validFrom.slice(0, 10);
          body.validTo = bhsContextEntry.validTo.slice(0, 10);
        } else if (form.category.trim()) {
          body.category = form.category.trim();
        }
        if (form.serviceCount.trim()) body.serviceCount = Number(form.serviceCount);
        if (priceInr != null) body.unitPriceINR = priceInr;
        if (priceUsd != null) body.unitPriceUSD = priceUsd;
        if (form.ceilingRateINR.trim()) body.ceilingRateINR = Number(form.ceilingRateINR);
        if (form.ceilingRateUSD.trim()) body.ceilingRateUSD = Number(form.ceilingRateUSD);
        if (form.minBillableUnits.trim()) body.minBillableUnits = Number(form.minBillableUnits);
        if (form.remarks.trim()) body.remarks = form.remarks.trim();

        const createdRes = await api.createRateCard(body);
        const created = (createdRes as { data: BillingRateCard }).data;
        onOpenChange(false);
        onSaved(created);
        return;
      }

      onOpenChange(false);
      onSaved(record ?? undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rate card');
    } finally {
      setSaving(false);
    }
  };

  const missingPrereqs =
    !isEdit && (contracts.length === 0 || services.length === 0)
      ? [
          contracts.length === 0 ? 'an active contract (Priority 4)' : null,
          services.length === 0 ? 'service catalog codes (Priority 3)' : null,
        ]
          .filter(Boolean)
          .join(' and ')
      : null;

  const serviceOptions = useMemo<SearchableComboOption[]>(
    () =>
      services.map((s) => ({
        id: s._id,
        label: s.serviceCode,
        description: s.description,
        searchIndex: `${s.serviceCode} ${s.description}`,
      })),
    [services],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl overflow-x-hidden overflow-y-auto rounded-2xl !border-[color:var(--billing-border-strong)] !bg-[#ffffff] p-0 !text-[color:var(--billing-text)] shadow-[var(--billing-shadow-lg)] sm:p-0">
        <DialogHeader className="contract-dialog-header space-y-1 border-b border-[color:var(--billing-border)] !bg-[#ffffff] px-5 py-4 pr-12 text-left sm:px-6">
          <DialogTitle className="text-[color:var(--billing-heading)]">
            {isEdit ? 'Edit service' : 'Add service'}
          </DialogTitle>
          <DialogDescription className="text-[color:var(--billing-text-muted)]">
            {isBhsCreate
              ? 'Select a service code and price card reference for this aircraft row.'
              : isBhsFlow
                ? 'Update service reference, remarks, or validity for this BHS service row.'
                : 'One price row from the airline price card — service × aircraft band × date period. Start with TRND for each aircraft type.'}
          </DialogDescription>
        </DialogHeader>

        <div className="bg-[#ffffff] px-5 py-4 sm:px-6">
        {loadingRefs ? (
          <p className="text-sm text-[color:var(--billing-text-muted)]">Loading contracts and services…</p>
        ) : missingPrereqs ? (
          <div className={billingUi.alertWarning}>
            Complete {missingPrereqs} before adding rates.
          </div>
        ) : null}

        <form onSubmit={(e) => void submit(e)} className="mt-4 grid min-w-0 gap-4">
          {error ? (
            <div className={billingUi.alertDanger}>{error}</div>
          ) : null}

          {!isEdit ? (
            <>
              <FieldGroup label="Contract" htmlFor="contractId">
                <select
                  id="contractId"
                  value={form.contractId}
                  onChange={(e) => onContractChange(e.target.value)}
                  required
                  disabled={customerContracts.length === 0}
                  className="w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select contract…</option>
                  {customerContracts.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.contractNumber} ({c.customerCode}) — {c.status}
                    </option>
                  ))}
                </select>
              </FieldGroup>

              {isBhsCreate ? (
                <FieldGroup label="Customer code" htmlFor="customerCode">
                  <p
                    id="customerCode"
                    className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-900"
                  >
                    {form.customerCode || '—'}
                  </p>
                </FieldGroup>
              ) : (
                <FieldGroup label="Customer code" htmlFor="customerCode">
                  <TextInput
                    id="customerCode"
                    value={form.customerCode}
                    onChange={(v) => setForm((f) => ({ ...f, customerCode: v.toUpperCase() }))}
                    required
                  />
                </FieldGroup>
              )}

              {isBhsCreate && bhsContextEntry ? (
                <div className="grid gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm sm:grid-cols-3">
                  <p>
                    <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Aircraft type
                    </span>
                    <span className="font-medium text-gray-900">{bhsContextEntry.aircraftType}</span>
                  </p>
                  <p>
                    <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Flight category
                    </span>
                    <span className="font-medium text-gray-900">
                      {formatPriceCardAirlineCategory(bhsContextEntry.category)}
                    </span>
                  </p>
                  <p>
                    <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Validity
                    </span>
                    <span className="font-medium text-gray-900">
                      {formatBillingDateRange(bhsContextEntry.validFrom, bhsContextEntry.validTo)}
                    </span>
                  </p>
                </div>
              ) : null}

              {isBhsCreate && !bhsContextEntry && bhsEntriesForCustomer.length > 1 ? (
                <FieldGroup label="Aircraft type" htmlFor="bhsAircraftType">
                  <select
                    id="bhsAircraftType"
                    value={bhsAircraftType}
                    onChange={(e) => {
                      const aircraft = e.target.value.toUpperCase();
                      setBhsAircraftType(aircraft);
                      const entry = bhsEntriesForCustomer.find(
                        (row) => row.aircraftType.toUpperCase() === aircraft,
                      );
                      if (entry) {
                        setForm((f) => ({
                          ...f,
                          validFrom: entry.validFrom.slice(0, 10),
                          validTo: entry.validTo.slice(0, 10),
                        }));
                      }
                    }}
                    required
                    className="w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select aircraft…</option>
                    {bhsEntriesForCustomer.map((entry) => (
                      <option key={entry._id} value={entry.aircraftType}>
                        {entry.aircraftType}
                      </option>
                    ))}
                  </select>
                </FieldGroup>
              ) : null}

              {isBhsCreate &&
              form.serviceCode &&
              existingServiceCodes.includes(form.serviceCode) ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  This service is already listed for this aircraft row. Saving will create a duplicate
                  entry.
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
                <SearchableCombobox
                  fieldLabel="Service code"
                  value={form.serviceCode}
                  onChange={onServiceChange}
                  options={serviceOptions}
                  loading={loadingRefs}
                  placeholder="Search by code or description…"
                  onPickOption={(option) => onServiceChange(option.label)}
                />
                <FieldGroup
                  label="Price card reference"
                  htmlFor="billingReference"
                  hint="Time / unit basis from price card header"
                >
                  <select
                    id="billingReference"
                    value={form.billingReference}
                    onChange={(e) => onBillingReferenceChange(e.target.value)}
                    required
                    className="w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select…</option>
                    {PRICE_CARD_REFERENCES.map((ref) => (
                      <option key={ref.code} value={ref.code}>
                        {ref.label} — {ref.description}
                      </option>
                    ))}
                  </select>
                </FieldGroup>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FieldGroup
                  label="Billing scope"
                  htmlFor="billingScope"
                  hint="Exclusive services also appear under ADS for this airline."
                >
                  <select
                    id="billingScope"
                    value={form.billingScope}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        billingScope: e.target.value as RateCardBillingScope,
                      }))
                    }
                    className="w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {RATE_CARD_BILLING_SCOPES.map((scope) => (
                      <option key={scope} value={scope}>
                        {scope === 'exclusive' ? 'Exclusive' : 'Inclusive'}
                      </option>
                    ))}
                  </select>
                </FieldGroup>
                <FieldGroup
                  label="Service count"
                  htmlFor="serviceCount"
                  hint="Number of inclusive or exclusive units allowed in the period."
                >
                  <TextInput
                    id="serviceCount"
                    type="number"
                    min={0}
                    step={1}
                    value={form.serviceCount}
                    onChange={(v) => setForm((f) => ({ ...f, serviceCount: v }))}
                    placeholder="e.g. 5"
                  />
                </FieldGroup>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
                <p>
                  <span className="font-medium text-gray-800">Customer:</span> {form.customerCode}
                </p>
                <p>
                  <span className="font-medium text-gray-800">Service:</span> {form.serviceCode}
                </p>
              </div>
              <FieldGroup
                label="Price card reference"
                htmlFor="billingReferenceEdit"
                hint="Time / unit basis from price card header"
              >
                <select
                  id="billingReferenceEdit"
                  value={form.billingReference}
                  onChange={(e) => onBillingReferenceChange(e.target.value)}
                  required
                  className="w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select…</option>
                  {PRICE_CARD_REFERENCES.map((ref) => (
                    <option key={ref.code} value={ref.code}>
                      {ref.label} — {ref.description}
                    </option>
                  ))}
                </select>
              </FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldGroup
                  label="Billing scope"
                  htmlFor="billingScopeEdit"
                  hint="Exclusive services also appear under ADS for this airline."
                >
                  <select
                    id="billingScopeEdit"
                    value={form.billingScope}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        billingScope: e.target.value as RateCardBillingScope,
                      }))
                    }
                    className="w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {RATE_CARD_BILLING_SCOPES.map((scope) => (
                      <option key={scope} value={scope}>
                        {scope === 'exclusive' ? 'Exclusive' : 'Inclusive'}
                      </option>
                    ))}
                  </select>
                </FieldGroup>
                <FieldGroup
                  label="Service count"
                  htmlFor="serviceCountEdit"
                  hint="Number of inclusive or exclusive units allowed in the period."
                >
                  <TextInput
                    id="serviceCountEdit"
                    type="number"
                    min={0}
                    step={1}
                    value={form.serviceCount}
                    onChange={(v) => setForm((f) => ({ ...f, serviceCount: v }))}
                    placeholder="e.g. 5"
                  />
                </FieldGroup>
              </div>
            </>
          )}

          {!isBhsFlow ? (
            <>
              <FieldGroup
                label="Aircraft / category band"
                htmlFor="category"
                hint="From price card column — e.g. A320/A321/B737 or B787"
              >
                <TextInput
                  id="category"
                  value={form.category}
                  onChange={(v) => setForm((f) => ({ ...f, category: v }))}
                  placeholder="A320/A321/B737"
                />
              </FieldGroup>

              <div className="grid gap-4 sm:grid-cols-2">
                <FieldGroup label="Currency" htmlFor="currency">
                  <select
                    id="currency"
                    value={form.currency}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, currency: e.target.value as 'INR' | 'USD' }))
                    }
                    className="w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="USD">USD</option>
                    <option value="INR">INR</option>
                  </select>
                </FieldGroup>
                <FieldGroup label="UOM" htmlFor="uom">
                  <TextInput
                    id="uom"
                    value={form.uom}
                    onChange={(v) => setForm((f) => ({ ...f, uom: v }))}
                    placeholder="FLIGHT"
                    required
                  />
                </FieldGroup>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FieldGroup label="Unit price INR" htmlFor="unitPriceINR">
                  <TextInput
                    id="unitPriceINR"
                    type="number"
                    value={form.unitPriceINR}
                    onChange={onUnitPriceInrChange}
                    placeholder={form.currency === 'INR' ? 'Required' : 'Optional'}
                  />
                </FieldGroup>
                <FieldGroup label="Unit price USD" htmlFor="unitPriceUSD">
                  <TextInput
                    id="unitPriceUSD"
                    type="number"
                    value={form.unitPriceUSD}
                    onChange={onUnitPriceUsdChange}
                    placeholder={form.currency === 'USD' ? 'Required' : 'Optional'}
                  />
                </FieldGroup>
              </div>
              <p className="-mt-2 text-xs text-gray-500">{roeHint}</p>

              <div className="grid gap-4 sm:grid-cols-2">
                <FieldGroup label="Ceiling rate INR" htmlFor="ceilingRateINR">
                  <TextInput
                    id="ceilingRateINR"
                    type="number"
                    value={form.ceilingRateINR}
                    onChange={onCeilingInrChange}
                  />
                </FieldGroup>
                <FieldGroup label="Ceiling rate USD" htmlFor="ceilingRateUSD">
                  <TextInput
                    id="ceilingRateUSD"
                    type="number"
                    value={form.ceilingRateUSD}
                    onChange={onCeilingUsdChange}
                  />
                </FieldGroup>
              </div>

              <FieldGroup
                label="Min billable units"
                htmlFor="minBillableUnits"
                hint="Optional — RAF/ADS minimums"
              >
                <TextInput
                  id="minBillableUnits"
                  type="number"
                  value={form.minBillableUnits}
                  onChange={(v) => setForm((f) => ({ ...f, minBillableUnits: v }))}
                />
              </FieldGroup>
            </>
          ) : null}

          <FieldGroup
            label="Remarks"
            htmlFor="remarks"
            hint="Contract clauses, free allowances, CPI notes — from price card lower table"
          >
            <TextArea
              id="remarks"
              value={form.remarks}
              onChange={(v) => setForm((f) => ({ ...f, remarks: v }))}
              rows={3}
              placeholder="e.g. 05 WCHC/R/S included in basic handling per month"
            />
          </FieldGroup>

          <div className="grid gap-4 sm:grid-cols-2">
            {isBhsCreate && bhsContextEntry ? (
              <div className="sm:col-span-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                <span className="font-medium text-gray-900">Validity</span>
                <span className="ml-2 tabular-nums">
                  {formatBillingDateRange(bhsContextEntry.validFrom, bhsContextEntry.validTo)}
                </span>
                <span className="mt-1 block text-xs text-gray-500">
                  Tied to this price card row — change dates on the airline entry if needed.
                </span>
              </div>
            ) : (
              <>
                <FieldGroup label="Valid from" htmlFor="validFrom">
                  <ContractSystemDate
                    id="validFrom"
                    value={form.validFrom}
                    onChange={(v) => setForm((f) => ({ ...f, validFrom: v }))}
                  />
                </FieldGroup>
                <FieldGroup label="Valid to" htmlFor="validTo">
                  <ContractSystemDate
                    id="validTo"
                    value={form.validTo}
                    onChange={(v) => setForm((f) => ({ ...f, validTo: v }))}
                    minDate={
                      form.validFrom ? new Date(`${form.validFrom}T00:00:00`) : undefined
                    }
                  />
                </FieldGroup>
              </>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--billing-border)] pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className={billingUi.btnSecondary}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || Boolean(missingPrereqs)}
              className={billingUi.btnPrimary}
            >
              {saving ? 'Saving…' : isEdit ? 'Save changes' : isBhsCreate ? 'Add service' : 'Create rate card'}
            </button>
          </div>
        </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
