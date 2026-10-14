'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Save, X } from 'lucide-react';
import type { BillingApi } from '@/lib/billing-api';
import type {
  BillingContract,
  BillingPriceCardAirline,
  BillingRateCard,
  BillingServiceCatalogItem,
} from '@/lib/billing-shared/types';
import { isAdsHourlyUom } from '@/lib/billing-shared/ads-hourly-uom';
import { defaultContractForCustomer } from '@/lib/billing-shared/price-card-airline-rows';
import {
  adsServiceNeedsCountAdjustment,
  buildAdsDualCountServiceRows,
  listRateCardsForAdsDualCount,
  type AdsDualCountServiceRow,
} from '@/lib/billing-shared/price-card-handling';
import { formatPriceCardAirlineCategory } from '@/lib/billing-shared/enums';
import {
  inrToUsd,
  parseAmountInput,
  usdToInr,
} from '@/lib/billing-shared/currency-convert';
import type { BillingExchangeRate } from '@/lib/billing-shared/types';
import { AdsFhrExtrasPanel } from './AdsFhrExtrasPanel';

type DraftRow = {
  bhsIncluded: string;
  alwaysChargeable: boolean;
  unitPriceINR: string;
  unitPriceUSD: string;
  uom: string;
};

type Props = {
  api: BillingApi;
  entry: BillingPriceCardAirline;
  allRateCards: BillingRateCard[];
  services: BillingServiceCatalogItem[];
  contracts: BillingContract[];
  serviceCategoryByCode: Map<string, string>;
  searchQuery?: string;
  onSaved: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  onEditExclusive?: (record: BillingRateCard) => void;
};

function emptyDraft(row: AdsDualCountServiceRow): DraftRow {
  const uom = row.exclusive?.uom ?? row.inclusive?.uom ?? 'EA';
  return {
    bhsIncluded:
      row.inclusive?.serviceCount != null ? String(row.inclusive.serviceCount) : '',
    alwaysChargeable: Boolean(
      row.exclusive?.alwaysChargeable || row.inclusive?.alwaysChargeable || isAdsHourlyUom(uom),
    ),
    unitPriceINR:
      row.exclusive?.unitPriceINR != null ? String(row.exclusive.unitPriceINR) : '',
    unitPriceUSD:
      row.exclusive?.unitPriceUSD != null ? String(row.exclusive.unitPriceUSD) : '',
    uom,
  };
}

function parseOptionalCount(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}

function parseOptionalPrice(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export function AdsRateCardDualCountPanel({
  api,
  entry,
  allRateCards,
  services,
  contracts,
  serviceCategoryByCode,
  searchQuery = '',
  onSaved,
  onError,
  onSuccess,
  onEditExclusive,
}: Props) {
  const dualRows = useMemo(
    () => buildAdsDualCountServiceRows(allRateCards, entry, serviceCategoryByCode),
    [allRateCards, entry, serviceCategoryByCode],
  );

  const bhsRateCardCount = useMemo(
    () => listRateCardsForAdsDualCount(allRateCards, entry, serviceCategoryByCode).length,
    [allRateCards, entry, serviceCategoryByCode],
  );

  const needsAdjustmentCount = useMemo(
    () => dualRows.filter((row) => adsServiceNeedsCountAdjustment(row)).length,
    [dualRows],
  );

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return dualRows;
    return dualRows.filter((row) => {
      const haystack = [
        row.serviceCode,
        row.exclusive?.uom ?? '',
        row.inclusive?.uom ?? '',
        row.exclusive?.billingReference ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [dualRows, searchQuery]);

  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [roe, setRoe] = useState<BillingExchangeRate | null>(null);

  useEffect(() => {
    setEditingCode(null);
    setDraft(null);
  }, [entry._id]);

  useEffect(() => {
    const refDate = entry.validFrom?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.getEffectiveExchangeRate({
          currencyCode: 'USD',
          date: refDate,
        });
        if (!cancelled) setRoe((res.data as BillingExchangeRate) ?? null);
      } catch {
        if (!cancelled) setRoe(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, entry.validFrom]);

  const rateToInr = roe?.rateToINR ?? null;

  const onDraftInrChange = (value: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = { ...prev, unitPriceINR: value };
      if (!rateToInr) return next;
      const inr = parseAmountInput(value);
      next.unitPriceUSD = inr == null ? '' : inrToUsd(inr, rateToInr);
      return next;
    });
  };

  const onDraftUsdChange = (value: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = { ...prev, unitPriceUSD: value };
      if (!rateToInr) return next;
      const usd = parseAmountInput(value);
      next.unitPriceINR = usd == null ? '' : usdToInr(usd, rateToInr);
      return next;
    });
  };

  const startEdit = useCallback((row: AdsDualCountServiceRow) => {
    setEditingCode(row.serviceCode);
    setDraft(emptyDraft(row));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingCode(null);
    setDraft(null);
  }, []);

  const saveRow = async (row: AdsDualCountServiceRow) => {
    if (!draft) return;

    const contract = defaultContractForCustomer(entry.customerCode, contracts);
    if (!contract) {
      onError('Add an active contract for this airline before editing ADS counts.');
      return;
    }

    const bhsIncluded = parseOptionalCount(draft.bhsIncluded);
    const alwaysChargeable = draft.alwaysChargeable || isAdsHourlyUom(draft.uom);
    const unitPriceINR = parseOptionalPrice(draft.unitPriceINR);
    const unitPriceUSD = parseOptionalPrice(draft.unitPriceUSD);
    const catalog = services.find((s) => s.serviceCode === row.serviceCode);
    const uom = draft.uom.trim() || catalog?.uom || 'EA';
    const hourly = isAdsHourlyUom(uom);
    const currency = (row.exclusive?.currency ??
      row.inclusive?.currency ??
      'INR') as 'INR' | 'USD';
    const validFrom = entry.validFrom.slice(0, 10);
    const validTo = entry.validTo.slice(0, 10);
    const aircraftType = entry.aircraftType.trim().toUpperCase();

    setSaving(true);
    onError('');
    try {
      if (!hourly && !alwaysChargeable) {
        const hasAnyCountOrRate =
          bhsIncluded != null ||
          unitPriceINR != null ||
          unitPriceUSD != null ||
          row.exclusive != null ||
          row.inclusive != null;
        if (!hasAnyCountOrRate) {
          onError(
            `Set free / flight count and/or ADS rate for ${row.serviceCode} before saving.`,
          );
          setSaving(false);
          return;
        }
        if (
          bhsIncluded == null &&
          unitPriceINR == null &&
          unitPriceUSD == null &&
          adsServiceNeedsCountAdjustment(row)
        ) {
          onError(
            `Enter free / flight count or ADS unit price for ${row.serviceCode}.`,
          );
          setSaving(false);
          return;
        }
      } else if (unitPriceINR == null && unitPriceUSD == null && !row.exclusive) {
        onError(`Enter INR or USD unit price for always-billed service ${row.serviceCode}.`);
        setSaving(false);
        return;
      }

      // Inclusive (free units per flight) — not for hourly / always-chargeable.
      if (!hourly && !alwaysChargeable) {
        if (row.inclusive) {
          const body: Record<string, unknown> = {
            billingScope: 'inclusive',
            alwaysChargeable: false,
          };
          if (bhsIncluded != null) body.serviceCount = bhsIncluded;
          await api.updateRateCard(row.inclusive._id, body);
        } else if (bhsIncluded != null) {
          await api.createRateCard({
            contractId: contract._id,
            customerCode: entry.customerCode,
            serviceCode: row.serviceCode,
            billingReference: row.exclusive?.billingReference ?? 'PU',
            currency,
            uom,
            validFrom,
            validTo,
            aircraftType,
            category: entry.category,
            billingScope: 'inclusive',
            serviceCount: bhsIncluded,
            alwaysChargeable: false,
          });
        }
      }

      // Exclusive (ADS billed rate + always-chargeable flag).
      if (row.exclusive) {
        const body: Record<string, unknown> = {
          uom,
          billingScope: 'exclusive',
          alwaysChargeable: alwaysChargeable || hourly,
        };
        if (unitPriceINR != null) body.unitPriceINR = unitPriceINR;
        if (unitPriceUSD != null) body.unitPriceUSD = unitPriceUSD;
        if (alwaysChargeable || hourly) body.serviceCount = 0;
        await api.updateRateCard(row.exclusive._id, body);
      } else if (
        unitPriceINR != null ||
        unitPriceUSD != null ||
        alwaysChargeable ||
        hourly
      ) {
        if (currency === 'INR' && unitPriceINR == null && !hourly && !alwaysChargeable) {
          onError('Enter INR unit price for this ADS service.');
          setSaving(false);
          return;
        }
        if (currency === 'USD' && unitPriceUSD == null && !hourly && !alwaysChargeable) {
          onError('Enter USD unit price for this ADS service.');
          setSaving(false);
          return;
        }
        const body: Record<string, unknown> = {
          contractId: contract._id,
          customerCode: entry.customerCode,
          serviceCode: row.serviceCode,
          billingReference: row.inclusive?.billingReference ?? 'PU',
          currency,
          uom,
          validFrom,
          validTo,
          aircraftType,
          category: entry.category,
          billingScope: 'exclusive',
          alwaysChargeable: alwaysChargeable || hourly,
        };
        if (unitPriceINR != null) body.unitPriceINR = unitPriceINR;
        if (unitPriceUSD != null) body.unitPriceUSD = unitPriceUSD;
        if (alwaysChargeable || hourly) body.serviceCount = 0;
        await api.createRateCard(body);
      }

      onSuccess(`Saved ADS free / flight rules for ${row.serviceCode}.`);
      setEditingCode(null);
      setDraft(null);
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to save ADS counts');
    } finally {
      setSaving(false);
    }
  };

  if (filteredRows.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          No BHS services yet for {entry.customerCode} · {entry.aircraftType} ·{' '}
          {formatPriceCardAirlineCategory(entry.category)}. Add rate cards under{' '}
          <span className="font-medium text-gray-700">BHS</span> for this airline first, or enable
          ADS rules on the contract — they sync here as free / flight counts.
        </div>
        <AdsFhrExtrasPanel
          api={api}
          entry={entry}
          allRateCards={allRateCards}
          serviceCategoryByCode={serviceCategoryByCode}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-[color:var(--billing-border)] bg-[#eef2ff] px-4 py-3">
        <p className="text-sm font-semibold text-gray-900">
          ADS free / flight — {entry.customerCode} · {entry.aircraftType} ·{' '}
          {formatPriceCardAirlineCategory(entry.category)}
        </p>
        <p className="mt-0.5 text-xs text-gray-600">
          Synced with contract ADS rules and BHS service list ({bhsRateCardCount} rate card
          {bhsRateCardCount === 1 ? '' : 's'} · {dualRows.length} service
          {dualRows.length === 1 ? '' : 's'}). Set{' '}
          <span className="font-medium text-gray-800">free / flight</span>; extras are chargeable.
          Check <span className="font-medium text-gray-800">always bill</span> for package equipment
          that is never free. Per-hour UOM always billed.
        </p>
        {needsAdjustmentCount > 0 ? (
          <p className="mt-2 text-xs font-medium text-amber-800">
            {needsAdjustmentCount} service{needsAdjustmentCount === 1 ? '' : 's'} still need ADS
            free count / rate.
          </p>
        ) : (
          <p className="mt-2 text-xs font-medium text-[color:var(--billing-accent-strong)]">
            All services have ADS free / flight or rates set.
          </p>
        )}
      </div>
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
          <tr>
            <th className="px-4 py-3">Service</th>
            <th className="px-4 py-3">UOM</th>
            <th className="px-4 py-3">Free / flight</th>
            <th className="px-4 py-3">Always bill</th>
            <th className="px-4 py-3">INR</th>
            <th className="px-4 py-3">USD</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filteredRows.map((row) => {
            const isEditing = editingCode === row.serviceCode && draft;
            const uom = isEditing
              ? draft.uom
              : row.exclusive?.uom ?? row.inclusive?.uom ?? '—';
            const hourly = isAdsHourlyUom(uom);
            const alwaysBill =
              Boolean(row.exclusive?.alwaysChargeable || row.inclusive?.alwaysChargeable) ||
              hourly;
            const needsAdjustment = adsServiceNeedsCountAdjustment(row);

            return (
              <tr
                key={row.serviceCode}
                className={
                  needsAdjustment
                    ? 'bg-[#fffbeb] hover:bg-[#fef3c7]'
                    : 'hover:bg-gray-50/80'
                }
              >
                <td className="px-4 py-3 font-medium text-gray-900">{row.serviceCode}</td>
                <td className="px-4 py-3">
                  {isEditing ? (
                    <input
                      value={draft.uom}
                      onChange={(e) => setDraft({ ...draft, uom: e.target.value })}
                      className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                      aria-label={`UOM for ${row.serviceCode}`}
                    />
                  ) : (
                    <span className="tabular-nums text-gray-700">{uom}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {hourly || (isEditing ? draft.alwaysChargeable : alwaysBill) ? (
                    <span className="text-xs text-gray-400">0 (billed)</span>
                  ) : isEditing ? (
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={draft.bhsIncluded}
                      onChange={(e) =>
                        setDraft({ ...draft, bhsIncluded: e.target.value })
                      }
                      placeholder="Free"
                      className="w-28 rounded border border-amber-300 bg-white px-2 py-1 text-sm tabular-nums"
                      aria-label={`Free per flight for ${row.serviceCode}`}
                    />
                  ) : (
                    <span className="tabular-nums text-gray-800">
                      {row.inclusive?.serviceCount != null
                        ? row.inclusive.serviceCount
                        : row.inclusive
                          ? 'All (package)'
                          : row.exclusive?.serviceCount != null
                            ? row.exclusive.serviceCount
                            : '—'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {isEditing ? (
                    <input
                      type="checkbox"
                      checked={draft.alwaysChargeable || hourly}
                      disabled={hourly}
                      onChange={(e) =>
                        setDraft({ ...draft, alwaysChargeable: e.target.checked })
                      }
                      aria-label={`Always bill ${row.serviceCode}`}
                      className="h-4 w-4 rounded border-gray-300 text-[color:var(--billing-accent)] focus:ring-[color:var(--billing-accent)]"
                    />
                  ) : alwaysBill ? (
                    <span className="text-xs font-medium text-amber-800">Yes</span>
                  ) : (
                    <span className="text-xs text-gray-500">No</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {isEditing ? (
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={draft.unitPriceINR}
                      onChange={(e) => onDraftInrChange(e.target.value)}
                      className="w-28 rounded border border-gray-300 px-2 py-1 text-sm tabular-nums"
                      aria-label={`INR rate for ${row.serviceCode}`}
                    />
                  ) : (
                    <span className="tabular-nums text-gray-800">
                      {row.exclusive?.unitPriceINR != null
                        ? row.exclusive.unitPriceINR
                        : '—'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {isEditing ? (
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={draft.unitPriceUSD}
                      onChange={(e) => onDraftUsdChange(e.target.value)}
                      className="w-28 rounded border border-gray-300 px-2 py-1 text-sm tabular-nums"
                      aria-label={`USD rate for ${row.serviceCode}`}
                    />
                  ) : (
                    <span className="tabular-nums text-gray-800">
                      {row.exclusive?.unitPriceUSD != null
                        ? row.exclusive.unitPriceUSD
                        : '—'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {hourly || alwaysBill ? (
                    <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                      Always billed
                    </span>
                  ) : needsAdjustment ? (
                    <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                      Adjust counts
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-[color:var(--billing-accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--billing-accent-strong)]">
                      Ready
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void saveRow(row)}
                          className="inline-flex items-center gap-1 rounded-lg bg-[color:var(--billing-primary)] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[color:var(--billing-primary-hover)] disabled:opacity-50"
                        >
                          <Save className="h-3.5 w-3.5" aria-hidden />
                          Save
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={cancelEdit}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className={`inline-flex items-center gap-1 text-xs font-medium ${
                            needsAdjustment
                              ? 'text-amber-800 hover:text-amber-950'
                              : 'text-[color:var(--billing-accent-strong)] hover:text-[color:var(--billing-heading)]'
                          }`}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                          {needsAdjustment ? 'Set free / rate' : 'Edit'}
                        </button>
                        {row.exclusive && onEditExclusive ? (
                          <button
                            type="button"
                            onClick={() => onEditExclusive(row.exclusive!)}
                            className="text-xs font-medium text-gray-600 hover:text-gray-900"
                          >
                            Full edit
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    <AdsFhrExtrasPanel
      api={api}
      entry={entry}
      allRateCards={allRateCards}
      serviceCategoryByCode={serviceCategoryByCode}
    />
    </div>
  );
}
