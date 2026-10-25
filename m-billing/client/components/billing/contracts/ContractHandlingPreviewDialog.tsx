'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Package, Plane, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { BillingApi } from '@/lib/billing-api';
import type {
  BillingContract,
  BillingContractAdsEquipmentRule,
  BillingContractClause,
  BillingPriceCardAirline,
  BillingRateCard,
  BillingServiceCatalogItem,
} from '@/lib/billing-shared/types';
import {
  PRICE_CARD_HANDLING_LABELS,
  buildServiceCategoryMap,
  countRateCardsForPriceCardEntry,
  groupBhsPriceCardAirlines,
  type BhsAirlineCardGroup,
} from '@/lib/billing-shared/price-card-handling';
import { formatBillingDate } from '@/lib/billing-shared/billing-date-format';
import {
  formatConcessionRateCell,
  formatConditionalChargeCell,
} from '@/lib/billing-shared/contract-concessions';
import {
  appliesToSummary,
  clauseTypeLabel,
  clausesFromContract,
} from '@/lib/billing-shared/contract-clauses';
import {
  CONTRACT_CONDITIONAL_CHARGE_SCENARIOS,
  CONTRACT_CONCESSION_SCENARIO_LABELS,
  CONTRACT_FEE_CONCESSION_SCENARIOS,
} from '@/lib/billing-shared/enums';
import { normalizeAdsEffectiveMonth } from '@/lib/billing-shared/ads-effective-month';
import {
  adsCatalogServiceDisplayName,
  buildAdsContractCatalogOptions,
} from '@/lib/billing-shared/service-catalog-labels';

type Props = {
  api: BillingApi;
  contract: BillingContract | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type HandlingSnapshot = {
  configured: boolean;
  airlineName: string;
  aircraftCount: number;
  aircraftPreview: string;
  domRows: number;
  intRows: number;
  taRows: number;
  priceLabel: string;
  rateCardCount: number;
  validity: string;
};

function formatDate(value: string | Date | undefined | null) {
  return formatBillingDate(value);
}

function formatMoney(amount: number | undefined, currency: 'INR' | 'USD') {
  if (amount == null || !Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatInrRange(prices: number[]) {
  const unique = [...new Set(prices.filter((p) => Number.isFinite(p)))].sort((a, b) => a - b);
  if (unique.length === 0) return '—';
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(n);
  if (unique.length === 1) return fmt(unique[0]);
  return `${fmt(unique[0])} – ${fmt(unique[unique.length - 1])}`;
}

function aircraftPreviewLabel(aircraftTypes: string[], max = 4) {
  if (aircraftTypes.length === 0) return '—';
  const head = aircraftTypes.slice(0, max);
  const tail = aircraftTypes.length - head.length;
  return tail > 0 ? `${head.join(', ')} +${tail}` : head.join(', ');
}

function statusLabel(status: BillingContract['status']) {
  if (status === 'active') return 'Active';
  if (status === 'draft') return 'Draft';
  if (status === 'expired') return 'Expired';
  return String(status ?? '—');
}

function statusClass(status: BillingContract['status']) {
  if (status === 'active') {
    return 'bg-[#1C0770] text-white ring-[#1C0770]';
  }
  if (status === 'draft') {
    return 'bg-[#F1FF5E]/35 text-[#1C0770] ring-[#F1FF5E]/50';
  }
  if (status === 'expired') {
    return 'bg-slate-100 text-slate-500 ring-slate-200';
  }
  return 'bg-slate-100 text-slate-500 ring-slate-200';
}

function selectedAircraftForUi(
  rule: BillingContractAdsEquipmentRule,
  contractAircraft: string[],
): string[] {
  if (Array.isArray(rule.aircraftTypes) && rule.aircraftTypes.length > 0) {
    return rule.aircraftTypes.map((a) => String(a ?? '').trim().toUpperCase()).filter(Boolean);
  }
  if (rule.aircraftType?.trim()) {
    return [rule.aircraftType.trim().toUpperCase()];
  }
  return [...contractAircraft];
}

function aircraftSummary(selected: string[], all: string[]): string {
  if (selected.length === 0) return '—';
  if (all.length > 0 && selected.length === all.length && all.every((ac) => selected.includes(ac))) {
    return `All (${all.length})`;
  }
  if (selected.length <= 3) return selected.join(', ');
  return `${selected.slice(0, 3).join(', ')} +${selected.length - 3}`;
}

function adsEquipmentKey(rule: BillingContractAdsEquipmentRule): string {
  const code = String(rule.serviceCode ?? '').trim().toUpperCase();
  if (code) return `code:${code}`;
  const label = adsCatalogServiceDisplayName(String(rule.serviceCode ?? '').trim())
    .trim()
    .toLowerCase();
  if (label) return `label:${label}`;
  return `uom:${String(rule.uom ?? '').trim().toUpperCase()}|inr:${rule.unitPriceINR ?? ''}`;
}

/** One row per equipment — same service repeated across months is shown once. */
function dedupeAdsEquipmentRules(
  rules: BillingContractAdsEquipmentRule[],
): BillingContractAdsEquipmentRule[] {
  const seen = new Map<string, BillingContractAdsEquipmentRule>();
  for (const rule of rules) {
    const key = adsEquipmentKey(rule);
    if (seen.has(key)) continue;
    seen.set(key, {
      ...rule,
      effectiveMonth: normalizeAdsEffectiveMonth(rule.effectiveMonth),
    });
  }
  return [...seen.values()].sort((a, b) => {
    const aLabel =
      adsCatalogServiceDisplayName(String(a.serviceCode ?? '').trim()) ||
      String(a.serviceCode ?? '').trim();
    const bLabel =
      adsCatalogServiceDisplayName(String(b.serviceCode ?? '').trim()) ||
      String(b.serviceCode ?? '').trim();
    return aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base', numeric: true });
  });
}

function BoolMark({ value, label }: { value: boolean; label: string }) {
  return value ? (
    <span className="inline-flex items-center gap-1 text-emerald-700" title={label}>
      <Check className="h-3.5 w-3.5" aria-hidden />
      <span className="text-[11px] font-medium">Yes</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-gray-400" title={label}>
      <X className="h-3.5 w-3.5" aria-hidden />
      <span className="text-[11px] font-medium">No</span>
    </span>
  );
}

function normalizeContractPayload(raw: unknown, fallback: BillingContract): BillingContract {
  if (!raw || typeof raw !== 'object') return fallback;
  const doc = raw as Record<string, unknown>;
  const id = String(doc._id ?? fallback._id ?? '');
  if (!id) return fallback;

  const aircraftTypes = Array.isArray(doc.aircraftTypes)
    ? doc.aircraftTypes.map((a) => String(a ?? '').trim().toUpperCase()).filter(Boolean)
    : fallback.aircraftTypes;

  const adsEquipmentRules = Array.isArray(doc.adsEquipmentRules)
    ? (doc.adsEquipmentRules as BillingContractAdsEquipmentRule[]).map((rule) => {
        const types = (rule.aircraftTypes ?? [])
          .map((a) => String(a ?? '').trim().toUpperCase())
          .filter(Boolean);
        const legacy = rule.aircraftType?.trim().toUpperCase();
        return {
          ...rule,
          aircraftTypes:
            types.length > 0
              ? types
              : legacy
                ? [legacy]
                : (aircraftTypes ?? [])
                    .map((a) => String(a ?? '').trim().toUpperCase())
                    .filter(Boolean),
          effectiveMonth: normalizeAdsEffectiveMonth(rule.effectiveMonth),
        };
      })
    : fallback.adsEquipmentRules ?? [];

  return {
    ...fallback,
    ...(doc as unknown as BillingContract),
    _id: id,
    contractNumber: String(doc.contractNumber ?? fallback.contractNumber ?? ''),
    customerCode: String(doc.customerCode ?? fallback.customerCode ?? ''),
    stationCode: String(doc.stationCode ?? fallback.stationCode ?? ''),
    priceValidFrom: formatDate(doc.priceValidFrom as string | Date) || fallback.priceValidFrom,
    priceValidTo: formatDate(doc.priceValidTo as string | Date) || fallback.priceValidTo,
    aircraftTypes,
    clauses: Array.isArray(doc.clauses)
      ? (doc.clauses as BillingContractClause[])
      : fallback.clauses,
    adsBillingEnabled: Boolean(doc.adsBillingEnabled ?? fallback.adsBillingEnabled),
    adsEquipmentRules,
    cancellationWithinHours:
      doc.cancellationWithinHours != null && Number.isFinite(Number(doc.cancellationWithinHours))
        ? Number(doc.cancellationWithinHours)
        : fallback.cancellationWithinHours,
  };
}

function buildHandlingSnapshot(
  group: BhsAirlineCardGroup | undefined,
  handling: 'BHS' | 'ADS',
  rateCards: BillingRateCard[],
  serviceCategoryByCode: Map<string, string>,
): HandlingSnapshot {
  if (!group) {
    return {
      configured: false,
      airlineName: '—',
      aircraftCount: 0,
      aircraftPreview: '—',
      domRows: 0,
      intRows: 0,
      taRows: 0,
      priceLabel: '—',
      rateCardCount: 0,
      validity: '—',
    };
  }

  const aircraftTypes = group.aircraftGroups.map((g) => g.aircraftType);
  let domRows = 0;
  let intRows = 0;
  let taRows = 0;
  let rateCardCount = 0;
  const prices: number[] = [];

  for (const aircraftGroup of group.aircraftGroups) {
    for (const row of aircraftGroup.rows) {
      if (row.category === 'Dom') domRows += 1;
      if (row.category === 'Int') intRows += 1;
      if (row.category === 'Ta') taRows += 1;
      if (handling === 'BHS' && row.price != null && Number.isFinite(row.price)) {
        prices.push(row.price);
      }
      rateCardCount += countRateCardsForPriceCardEntry(
        rateCards,
        handling,
        row,
        serviceCategoryByCode,
      );
    }
  }

  return {
    configured: true,
    airlineName: group.airlineName,
    aircraftCount: group.aircraftCount,
    aircraftPreview: aircraftPreviewLabel(aircraftTypes),
    domRows,
    intRows,
    taRows,
    priceLabel:
      handling === 'BHS'
        ? formatInrRange(prices)
        : `${rateCardCount} service${rateCardCount === 1 ? '' : 's'}`,
    rateCardCount,
    validity: `${formatDate(group.validFrom)} → ${formatDate(group.validTo)}`,
  };
}

function ChargeTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2">
      <p className="min-w-0 text-base font-semibold leading-snug text-slate-600">{label}</p>
      <p className="shrink-0 text-base font-bold tabular-nums tracking-tight text-[#1C0770]">
        {value}
      </p>
    </div>
  );
}

function HandlingStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 truncate text-base font-bold tabular-nums text-[#1C0770]">{value}</dd>
    </div>
  );
}

function HandlingPanel({
  handling,
  snapshot,
  adsRuleCount,
  adsBillingEnabled,
}: {
  handling: 'BHS' | 'ADS';
  snapshot: HandlingSnapshot;
  adsRuleCount?: number;
  adsBillingEnabled?: boolean;
}) {
  const Icon = handling === 'BHS' ? Plane : Package;

  return (
    <section
      className="contract-handling-tile flex h-full min-w-0 w-full flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-xs"
      aria-label={`${handling} price-card glimpse`}
    >
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F1FF5E]/35 text-[#1C0770]">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#1C0770]">
            {handling} · {PRICE_CARD_HANDLING_LABELS[handling]}
          </p>
          {snapshot.configured ? (
            <p className="truncate text-sm font-semibold text-slate-800">{snapshot.airlineName}</p>
          ) : null}
        </div>
      </div>

      {!snapshot.configured ? (
        <p className="text-sm text-[color:var(--billing-text-muted)]">
          No {handling} price-card rows for this airline.
        </p>
      ) : (
        <>
          <dl className="grid flex-1 grid-cols-2 content-start gap-x-3 gap-y-2.5">
            <HandlingStat label="Aircraft" value={String(snapshot.aircraftCount)} />
            <HandlingStat
              label="Flight rows"
              value={`${snapshot.domRows}D · ${snapshot.intRows}I${snapshot.taRows ? ` · ${snapshot.taRows}TA` : ''}`}
            />
            <HandlingStat
              label={handling === 'BHS' ? 'BHS package' : 'ADS services'}
              value={snapshot.priceLabel}
            />
            <HandlingStat label="Rate cards" value={String(snapshot.rateCardCount)} />
          </dl>
          <p className="mt-2 text-xs text-[color:var(--billing-text-muted)]">
            Valid {snapshot.validity}
            {handling === 'ADS' ? (
              <>
                {' · '}
                ADS{' '}
                {adsBillingEnabled
                  ? `${adsRuleCount ?? 0} equipment${adsRuleCount === 1 ? '' : 's'}`
                  : 'Off'}
              </>
            ) : null}
          </p>
        </>
      )}
    </section>
  );
}

function CompactClauseRow({ clause, index }: { clause: BillingContractClause; index: number }) {
  const typeLabel =
    clause.clauseType === 'custom'
      ? clause.label?.trim() || 'Custom clause'
      : clauseTypeLabel(clause.clauseType);

  return (
    <article className="relative rounded-xl border border-slate-200 bg-white px-3 py-2.5 pl-4 shadow-xs">
      <span
        className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-[#1C0770]"
        aria-hidden
      />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-base font-bold text-slate-900">
          <span className="mr-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#F1FF5E]/35 text-xs font-bold text-[#1C0770]">
            {index + 1}
          </span>
          {typeLabel}
        </p>
        <p className="text-xs font-medium text-slate-500">
          {appliesToSummary(clause.appliesTo ?? [])}
        </p>
      </div>
      {clause.body?.trim() ? (
        <p className="mt-1 whitespace-pre-wrap text-sm leading-snug text-slate-600">
          {clause.body.trim()}
        </p>
      ) : null}
    </article>
  );
}

function UniqueAdsEquipmentTable({
  rules,
  contractAircraft,
  serviceLabelByCode,
  validFrom,
  validTo,
}: {
  rules: BillingContractAdsEquipmentRule[];
  contractAircraft: string[];
  serviceLabelByCode: Map<string, string>;
  validFrom: string;
  validTo: string;
}) {
  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-base font-semibold text-[color:var(--billing-heading)]">ADS equipment</h4>
        <p className="text-sm font-medium text-[color:var(--billing-text-muted)]">
          Valid <span className="text-[color:var(--billing-heading)]">{validFrom}</span> →{' '}
          <span className="text-[color:var(--billing-heading)]">{validTo}</span>
        </p>
      </div>

      <div className="w-full overflow-x-auto rounded-2xl border border-[color:var(--billing-border-strong)] bg-[#ffffff]">
        <table className="billing-table min-w-[56rem] w-full divide-y divide-[color:var(--billing-border)] text-base">
          <thead className="bg-[#f8fafc] text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--billing-heading)]">
            <tr>
              <th className="px-3 py-2.5">Equipment / service</th>
              <th className="px-3 py-2.5">Included</th>
              <th className="px-3 py-2.5">Free / flight</th>
              <th className="px-3 py-2.5">Always bill</th>
              <th className="px-3 py-2.5">UOM</th>
              <th className="px-3 py-2.5">INR</th>
              <th className="px-3 py-2.5">USD</th>
              <th className="px-3 py-2.5">Aircraft</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--billing-border)]">
            {rules.map((rule, index) => {
              const includedForAds = rule.includedForAds !== false;
              const selectedAircraft = selectedAircraftForUi(rule, contractAircraft);
              const code = String(rule.serviceCode ?? '').trim();
              const label =
                serviceLabelByCode.get(code) ||
                adsCatalogServiceDisplayName(code) ||
                code ||
                '—';

              return (
                <tr key={`ads-unique-${adsEquipmentKey(rule)}-${index}`}>
                  <td className="px-3 py-2.5">
                    <p className="min-w-[11rem] max-w-[16rem] font-semibold text-[color:var(--billing-heading)]">
                      {label}
                    </p>
                    {code && label !== code ? (
                      <p className="mt-0.5 text-xs text-[color:var(--billing-text-muted)]">
                        {code}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <BoolMark value={includedForAds} label="Included for ADS" />
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-[color:var(--billing-text)]">
                    {rule.freePerFlight != null && Number.isFinite(rule.freePerFlight)
                      ? rule.freePerFlight
                      : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <BoolMark value={Boolean(rule.alwaysChargeable)} label="Always bill" />
                  </td>
                  <td className="px-3 py-2.5 text-[color:var(--billing-text)]">
                    {rule.uom?.trim() || '—'}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-[color:var(--billing-text)]">
                    {formatMoney(rule.unitPriceINR, 'INR')}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-[color:var(--billing-text)]">
                    {formatMoney(rule.unitPriceUSD, 'USD')}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex max-w-[12rem] rounded-md border border-[color:var(--billing-border)] bg-[#f8fafc] px-2 py-0.5 text-xs font-medium text-[color:var(--billing-text-secondary)]">
                      {aircraftSummary(selectedAircraft, contractAircraft)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ContractHandlingPreviewDialog({ api, contract, open, onOpenChange }: Props) {
  const [detail, setDetail] = useState<BillingContract | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [loadingCards, setLoadingCards] = useState(false);
  const [cardsError, setCardsError] = useState('');
  const [priceCardEntries, setPriceCardEntries] = useState<BillingPriceCardAirline[]>([]);
  const [rateCards, setRateCards] = useState<BillingRateCard[]>([]);
  const [services, setServices] = useState<BillingServiceCatalogItem[]>([]);
  const [detailPanel, setDetailPanel] = useState<'clauses' | 'ads' | ''>('');

  useEffect(() => {
    if (!open || !contract) {
      setDetail(null);
      setDetailError('');
      setCardsError('');
      setPriceCardEntries([]);
      setRateCards([]);
      setServices([]);
      setDetailPanel('');
      return;
    }

    let cancelled = false;
    setDetail(normalizeContractPayload(contract, contract));
    setLoadingDetail(true);
    setDetailError('');
    setLoadingCards(true);
    setCardsError('');

    void (async () => {
      try {
        const res = await api.getContract(contract._id);
        if (cancelled) return;
        const payload = (res as { data?: unknown })?.data ?? res;
        setDetail(normalizeContractPayload(payload, contract));
      } catch (e) {
        if (!cancelled) {
          setDetailError(
            e instanceof Error ? e.message : 'Could not refresh contract; showing list data.',
          );
        }
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();

    void (async () => {
      try {
        const customerCode = contract.customerCode.trim().toUpperCase();
        const [bhsRes, adsRes, rateRes, catalogRes] = await Promise.all([
          api.listPriceCardAirlines({ handlingType: 'BHS', customerCode }),
          api.listPriceCardAirlines({ handlingType: 'ADS', customerCode }),
          api.listRateCards({ customerCode }),
          api.listServiceCatalog(),
        ]);
        if (cancelled) return;

        const bhsItems = (bhsRes.data as { items?: BillingPriceCardAirline[] })?.items ?? [];
        const adsItems = (adsRes.data as { items?: BillingPriceCardAirline[] })?.items ?? [];
        const rateItems = (rateRes.data as { items?: BillingRateCard[] })?.items ?? [];
        const catalogItems =
          (catalogRes.data as { items?: BillingServiceCatalogItem[] })?.items ?? [];

        setPriceCardEntries([...bhsItems, ...adsItems]);
        setRateCards(rateItems);
        setServices(catalogItems);
      } catch (e) {
        if (!cancelled) {
          setCardsError(e instanceof Error ? e.message : 'Failed to load price-card glimpse');
        }
      } finally {
        if (!cancelled) setLoadingCards(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, contract, open]);

  const view = detail ?? contract;

  const serviceCategoryByCode = useMemo(() => buildServiceCategoryMap(services), [services]);

  const serviceLabelByCode = useMemo(() => {
    const map = new Map<string, string>();
    const options = buildAdsContractCatalogOptions(services);
    for (const option of options) {
      map.set(option.value, option.label);
    }
    for (const service of services) {
      const code = String(service.serviceCode ?? '').trim();
      if (!code || map.has(code)) continue;
      map.set(code, adsCatalogServiceDisplayName(code) || code);
    }
    return map;
  }, [services]);

  const bhsGroup = useMemo(() => {
    if (!view) return undefined;
    const entries = priceCardEntries.filter((e) => e.handlingType === 'BHS');
    return groupBhsPriceCardAirlines(entries)[0];
  }, [view, priceCardEntries]);

  const adsGroup = useMemo(() => {
    if (!view) return undefined;
    const entries = priceCardEntries.filter((e) => e.handlingType === 'ADS');
    return groupBhsPriceCardAirlines(entries)[0];
  }, [view, priceCardEntries]);

  const bhsSnapshot = useMemo(
    () => buildHandlingSnapshot(bhsGroup, 'BHS', rateCards, serviceCategoryByCode),
    [bhsGroup, rateCards, serviceCategoryByCode],
  );

  const adsSnapshot = useMemo(
    () => buildHandlingSnapshot(adsGroup, 'ADS', rateCards, serviceCategoryByCode),
    [adsGroup, rateCards, serviceCategoryByCode],
  );

  const aircraftTypes = useMemo(() => {
    if (!view?.aircraftTypes?.length) return [] as string[];
    return view.aircraftTypes
      .map((a) => String(a ?? '').trim().toUpperCase())
      .filter(Boolean);
  }, [view]);

  const clauses = useMemo(() => (view ? clausesFromContract(view) : []), [view]);
  const adsRules = view?.adsEquipmentRules ?? [];
  const uniqueAdsRules = useMemo(() => dedupeAdsEquipmentRules(adsRules), [adsRules]);

  const feeRows = useMemo(() => {
    if (!view) return [];
    return CONTRACT_FEE_CONCESSION_SCENARIOS.map((key) => ({
      key,
      label: CONTRACT_CONCESSION_SCENARIO_LABELS[key],
      value: formatConcessionRateCell(view, key),
    })).filter((row) => row.value !== '—');
  }, [view]);

  const conditionalRows = useMemo(() => {
    if (!view) return [];
    return CONTRACT_CONDITIONAL_CHARGE_SCENARIOS.map((key) => ({
      key,
      label: CONTRACT_CONCESSION_SCENARIO_LABELS[key],
      value: formatConditionalChargeCell(view, key),
    })).filter((row) => row.value !== '—');
  }, [view]);

  const validFrom = view ? formatDate(view.priceValidFrom) : '—';
  const validTo = view ? formatDate(view.priceValidTo) : '—';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="contract-dialog flex h-[min(92vh,860px)] w-[calc(100vw-0.75rem)] max-w-[calc(100vw-0.75rem)] flex-col gap-0 overflow-hidden !border-slate-200 !bg-slate-50 p-0 !text-slate-800 sm:w-[calc(100vw-1.5rem)] sm:max-w-[min(96vw,80rem)] sm:rounded-2xl md:w-[calc(100vw-2rem)] lg:max-w-[min(94vw,88rem)]">
        <DialogHeader className="contract-dialog-header shrink-0 space-y-0 border-b border-[#1C0770] !bg-[#1C0770] px-4 py-3 pr-12 text-left sm:px-5">
          {view ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:items-start lg:gap-0">
              {/* 1 — Identity */}
              <div className="min-w-0 space-y-1.5 lg:border-r lg:border-white/15 lg:pr-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#F1FF5E]">
                    Contract view
                  </p>
                  {loadingDetail ? (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-white/70">
                      Refreshing…
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="text-lg font-extrabold tracking-tight text-white sm:text-xl">
                    {view.contractNumber}
                  </DialogTitle>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${statusClass(view.status)}`}
                  >
                    {statusLabel(view.status)}
                  </span>
                </div>
                <DialogDescription className="text-xs font-medium text-[#F1FF5E] sm:text-sm">
                  {`${view.customerCode} · ${view.stationCode} · ${formatContractCategory(view.category)}`}
                </DialogDescription>
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white">
                  <span className="text-[#F1FF5E]">Validity</span>
                  <span className="tabular-nums">{validFrom}</span>
                  <span aria-hidden>→</span>
                  <span className="tabular-nums">{validTo}</span>
                  {view.cancellationWithinHours != null &&
                  Number.isFinite(view.cancellationWithinHours) ? (
                    <>
                      <span className="mx-1 text-white/40">·</span>
                      <span>Cancel window {view.cancellationWithinHours}h</span>
                    </>
                  ) : null}
                </div>
              </div>

              {/* 2 — Aircraft coverage */}
              <div className="min-w-0 sm:border-t sm:border-white/15 sm:pt-3 lg:border-r lg:border-t-0 lg:px-4 lg:pt-0">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#F1FF5E]">
                  Aircraft coverage
                </p>
                {aircraftTypes.length === 0 ? (
                  <p className="text-xs font-medium text-white/70">None saved.</p>
                ) : (
                  <ul
                    className="flex flex-wrap gap-1"
                    aria-label="Contract aircraft types"
                  >
                    {aircraftTypes.map((type) => (
                      <li
                        key={type}
                        className="rounded-full border border-[#F1FF5E]/40 bg-[#F1FF5E]/25 px-2 py-0.5 text-[11px] font-bold text-[#F1FF5E]"
                      >
                        {type}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* 3 — Detail view + open rates */}
              <div className="min-w-0 space-y-2 sm:col-span-2 sm:border-t sm:border-white/15 sm:pt-3 lg:col-span-1 lg:border-t-0 lg:pl-4 lg:pt-0">
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#F1FF5E]">
                    Detail view
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      aria-pressed={detailPanel === 'clauses'}
                      onClick={() =>
                        setDetailPanel((prev) => (prev === 'clauses' ? '' : 'clauses'))
                      }
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F1FF5E]/80 ${
                        detailPanel === 'clauses'
                          ? 'bg-[#F1FF5E] text-[#1C0770]'
                          : 'border border-white/25 bg-white/10 text-white hover:bg-white/20'
                      }`}
                    >
                      Clauses
                      <span className="tabular-nums opacity-80">({clauses.length})</span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={detailPanel === 'ads'}
                      onClick={() => setDetailPanel((prev) => (prev === 'ads' ? '' : 'ads'))}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F1FF5E]/80 ${
                        detailPanel === 'ads'
                          ? 'bg-[#F1FF5E] text-[#1C0770]'
                          : 'border border-white/25 bg-white/10 text-white hover:bg-white/20'
                      }`}
                    >
                      ADS conditions
                      <span className="tabular-nums opacity-80">
                        (
                        {view.adsBillingEnabled
                          ? uniqueAdsRules.length
                          : 'Off'}
                        )
                      </span>
                    </button>
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#F1FF5E]">
                    Open rates
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Link
                      href={`/billing/rate-cards?handling=BHS&customer=${encodeURIComponent(view.customerCode)}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#F1FF5E] px-2.5 py-1.5 text-[11px] font-bold text-[#1C0770] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F1FF5E]/80"
                    >
                      BHS rates
                      <span aria-hidden>→</span>
                    </Link>
                    <Link
                      href={`/billing/rate-cards?handling=ADS&customer=${encodeURIComponent(view.customerCode)}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/25 bg-white/10 px-2.5 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F1FF5E]/60"
                    >
                      ADS rates
                      <span aria-hidden>→</span>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#F1FF5E]">
                Contract view
              </p>
              <DialogTitle className="text-lg font-extrabold tracking-tight text-white sm:text-xl">
                Contract details
              </DialogTitle>
              <DialogDescription className="text-xs font-medium text-[#F1FF5E] sm:text-sm">
                Full contract record from the contracts list.
              </DialogDescription>
            </div>
          )}
        </DialogHeader>

        <div className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 sm:px-5">
          {detailError ? (
            <p className="mb-2 rounded-xl border border-[#1C0770]/20 bg-[#F1FF5E]/35 px-3 py-2 text-xs font-medium text-[#1C0770]">
              {detailError}
            </p>
          ) : null}

          {view ? (
            <div className="mx-auto grid w-full max-w-[88rem] gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)] lg:items-stretch">
              <section className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                <header className="shrink-0 border-b border-[#1C0770] bg-[#1C0770] px-3 py-2.5 sm:px-4">
                  <h3 className="text-base font-bold text-white">SGHA charge terms</h3>
                  <p className="text-xs font-medium text-[#F1FF5E]">
                    Configured percentages only.
                  </p>
                </header>
                <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2.5 sm:p-3">
                  {conditionalRows.length === 0 && feeRows.length === 0 ? (
                    <p className="text-base text-slate-500">No SGHA charge terms configured.</p>
                  ) : (
                    <>
                      {conditionalRows.map((row) => (
                        <ChargeTile key={`c-${row.key}`} label={row.label} value={row.value} />
                      ))}
                      {feeRows.map((row) => (
                        <ChargeTile
                          key={`f-${row.key}`}
                          label={`Fee · ${row.label}`}
                          value={row.value}
                        />
                      ))}
                    </>
                  )}
                </div>
              </section>

              <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#1C0770] bg-[#1C0770] px-3 py-2.5 sm:px-4">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-white">
                      {detailPanel === 'ads'
                        ? 'ADS conditions'
                        : detailPanel === 'clauses'
                          ? 'Clauses'
                          : 'Price-card glimpse'}
                    </h3>
                    <p className="text-xs font-medium text-[#F1FF5E]">
                      {detailPanel === 'ads'
                        ? 'Equipment rules on this agreement.'
                        : detailPanel === 'clauses'
                          ? 'Contract conditions in reading order.'
                          : 'Live airline rows for this customer.'}
                    </p>
                  </div>
                  {detailPanel ? (
                    <button
                      type="button"
                      onClick={() => setDetailPanel('')}
                      className="shrink-0 rounded-lg bg-[#F1FF5E] px-2.5 py-1.5 text-xs font-bold text-[#1C0770] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F1FF5E]/80"
                    >
                      Back to price cards
                    </button>
                  ) : null}
                </header>

                <div
                  key={detailPanel || 'prices'}
                  className="min-h-0 flex-1 overflow-y-auto p-2.5 sm:p-3"
                >
                  {detailPanel === 'ads' ? (
                    !view.adsBillingEnabled ? (
                      <p className="text-base text-slate-500">ADS conditions are turned off.</p>
                    ) : uniqueAdsRules.length === 0 ? (
                      <p className="text-base text-slate-500">No ADS equipment saved.</p>
                    ) : (
                      <UniqueAdsEquipmentTable
                        rules={uniqueAdsRules}
                        contractAircraft={aircraftTypes}
                        serviceLabelByCode={serviceLabelByCode}
                        validFrom={validFrom}
                        validTo={validTo}
                      />
                    )
                  ) : detailPanel === 'clauses' ? (
                    clauses.length === 0 ? (
                      <p className="text-base text-slate-500">No clauses saved.</p>
                    ) : (
                      <div className="grid gap-2">
                        {clauses.map((clause, index) => (
                          <CompactClauseRow
                            key={`${clause.clauseType}-${index}`}
                            clause={clause}
                            index={index}
                          />
                        ))}
                      </div>
                    )
                  ) : loadingCards ? (
                    <p className="py-4 text-center text-base text-slate-500">Loading…</p>
                  ) : cardsError ? (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-base text-red-700">
                      {cardsError}
                    </p>
                  ) : (
                    <div className="grid h-full min-h-[12rem] grid-cols-2 gap-2">
                      <HandlingPanel handling="BHS" snapshot={bhsSnapshot} />
                      <HandlingPanel
                        handling="ADS"
                        snapshot={adsSnapshot}
                        adsBillingEnabled={view.adsBillingEnabled}
                        adsRuleCount={uniqueAdsRules.length}
                      />
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatContractCategory(category: BillingContract['category']) {
  return category === 'Dom'
    ? 'Domestic'
    : category === 'Both'
      ? 'Domestic & International'
      : 'International';
}
