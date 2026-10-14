'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { BillingPageHeader } from '../BillingLayout';
import {
  OTHER_STATION_BILLING_PERIOD,
  isDelhiStation,
  readLoginStationCode,
} from '@/lib/billing-default-period';
import { BillingDataTable } from '../BillingDataTable';
import { BillingTableHeaderFilter } from '../BillingTableHeaderFilter';
import { BillingAdsBriefStatsBar } from './BillingAdsBriefStatsBar';
import { BillingRafEquipmentPaletteBar } from './BillingRafEquipmentPaletteBar';
import { BillingScheduledFlightsStatsBar } from './BillingScheduledFlightsStatsBar';
import { BillingMaasStatsBar } from './BillingMaasStatsBar';
import {
  computeMaasBillingStats,
  EMPTY_MAAS_BILLING_FILTERS,
  MAAS_GLOVE_OPTIONS,
  MAAS_SERVICE_TYPE_OPTIONS,
  MAAS_SHIFT_OPTIONS,
  MAAS_STAFF_TYPE_OPTIONS,
  maasAirlineLabel,
  maasGloveLabel,
  maasPassengerLabel,
  maasPaxLabel,
  maasPnrLabel,
  maasRowMatchesFilters,
  maasServiceDateLabel,
  maasServiceTypeLabel,
  maasShiftLabel,
  maasStaffLabel,
  type MaasBillingFilters,
} from './billingMaasDisplay';
import { stripCancelledFlightPrefix } from '@/lib/billing-shared/preparation-flight-display';
import { ValidationIndicator, MatchIndicator } from './ValidationIndicator';
import {
  computeBillingScheduledFlightStats,
  filterBillingRowsByStatCategories,
  billingRowMatchesFlightSearch,
  billingScheduledFlightRowKey,
  sortBillingRowsUnsentFirst,
  type BillingScheduledFlightStatKey,
} from './billingScheduledFlightStats';
import {
  computeAdsBriefSelectionTotals,
  computeBillingAdsBriefStats,
  computeBillingAdsWchBreakdown,
  EMPTY_BILLING_ADS_WCH_BREAKDOWN,
  countUniqueAdsFlights,
  billingAdsFlightKey,
  adsRowOperationalQuantity,
  filterBillingRowsByAdsBriefs,
  formatAdsFlightEngagementEntries,
  formatAdsFlightBhsIncludedEntries,
  formatAdsFlightChargedEntries,
  type BillingAdsBriefKey,
} from './billingAdsBriefStats';
import {
  computeRafEquipmentPaletteStats,
  computeRafEquipmentSelectionTotals,
  countUniqueRafFlights,
  filterBillingRowsByRafEquipmentCodes,
  type RafSeededEquipmentCode,
} from './billingRafEquipmentPalette';
import { exportAdsFlightsToExcel } from './exportAdsFlightsExcel';
import {
  scheduledFlightAircraftBody,
  scheduledFlightAircraftType,
  scheduledFlightCategory,
  scheduledFlightCustomer,
  scheduledFlightEligibleLabel,
  scheduledFlightOps,
  scheduledFlightPaxFreight,
  scheduledFlightTypeOfHandling,
} from './billingScheduledFlightDisplay';
import type { BillingApi } from '@/lib/billing-api';
import { useSourcePageWorkspace } from '@/lib/billing-workspace/use-source-page-workspace';
import {
  getBillingWorkspacePageSlice,
  useBillingWorkspaceIdentity,
} from '@/lib/billing-workspace/store';
import { BILLING_WORKSPACE_PAGE_KEYS } from '@/lib/billing-workspace/page-keys';
import type { BillingSourceRow, BillingSourcesResponse } from '@/lib/billing-shared/billing-sources';
import {
  buildRafFormsHrefFromBillingSerial,
  buildScheduledAirlinesHrefFromBillingSerial,
} from '@/lib/preparationScheduledAirlinesNav';
import { domesticInternationalBucketFromCateOfFlight } from '@/utils/dataProcessor';

type ScheduledFlightsDateBasis = 'schedule-date' | 'atd-date' | 'exported-date';
type ScheduledFlightsDomIntFilter = '' | 'domestic' | 'international';

type TableColumnFilterKey =
  | 'category'
  | 'typeOfHandling'
  | 'paxFreight'
  | 'ops'
  | 'aircraftType'
  | 'aircraftBody'
  | 'customer'
  | 'eligible'
  | 'serial'
  | 'flight'
  | 'prep'
  | 'engagement'
  | 'bhsIncluded'
  | 'charged'
  | 'contract'
  | 'rate'
  | 'validation'
  | 'particular'
  | 'equipmentCode'
  | 'qty'
  | 'unitPrice';

type TableColumnFilters = Record<TableColumnFilterKey, string>;
type TableColumnFilterOptions = Record<TableColumnFilterKey, string[]>;

const EMPTY_COLUMN_FILTERS: TableColumnFilters = {
  category: '',
  typeOfHandling: '',
  paxFreight: '',
  ops: '',
  aircraftType: '',
  aircraftBody: '',
  customer: '',
  eligible: '',
  serial: '',
  flight: '',
  prep: '',
  engagement: '',
  bhsIncluded: '',
  charged: '',
  contract: '',
  rate: '',
  validation: '',
  particular: '',
  equipmentCode: '',
  qty: '',
  unitPrice: '',
};

const EMPTY_COLUMN_FILTER_OPTIONS: TableColumnFilterOptions = {
  category: [],
  typeOfHandling: [],
  paxFreight: [],
  ops: [],
  aircraftType: [],
  aircraftBody: [],
  customer: [],
  eligible: [],
  serial: [],
  flight: [],
  prep: [],
  engagement: [],
  bhsIncluded: [],
  charged: [],
  contract: [],
  rate: [],
  validation: [],
  particular: [],
  equipmentCode: [],
  qty: [],
  unitPrice: [],
};

function scheduledRowMatchesColumnFilters(
  row: BillingSourceRow,
  filters: TableColumnFilters,
  customerDirectory?: ReadonlyMap<string, string>,
): boolean {
  if (filters.category && scheduledFlightCategory(row) !== filters.category) return false;
  if (filters.typeOfHandling && scheduledFlightTypeOfHandling(row) !== filters.typeOfHandling) {
    return false;
  }
  if (filters.paxFreight && scheduledFlightPaxFreight(row) !== filters.paxFreight) return false;
  if (filters.ops && scheduledFlightOps(row) !== filters.ops) return false;
  if (filters.aircraftType && scheduledFlightAircraftType(row) !== filters.aircraftType) {
    return false;
  }
  if (filters.aircraftBody && scheduledFlightAircraftBody(row) !== filters.aircraftBody) {
    return false;
  }
  if (
    filters.customer &&
    scheduledFlightCustomer(row, customerDirectory) !== filters.customer
  ) {
    return false;
  }
  if (filters.eligible && scheduledFlightEligibleLabel(row) !== filters.eligible) return false;
  return true;
}

function adsFlightSerialLabel(row: BillingSourceRow): string {
  const serial = String(row.sourceRef.serialNo ?? '').trim();
  return serial || String(row.sourceRef.usageRowId ?? '') || '—';
}

function adsFlightNumberLabel(row: BillingSourceRow): string {
  return String(
    row.operationalData.flightNoEquipmentNo ??
      row.operationalData.flightNo ??
      row.sourceRef.flightNo ??
      '—',
  );
}

function prepStatusLabel(row: BillingSourceRow): string {
  return row.sentToPreparation ? 'Sent' : 'Unsent';
}

function contractFilterLabel(row: BillingSourceRow): string {
  return row.contractMatch.matched ? 'Matched' : 'Not matched';
}

function rateFilterLabel(row: BillingSourceRow): string {
  return row.rateMatch.matched ? 'Matched' : 'Not matched';
}

function validationFilterLabel(row: BillingSourceRow): string {
  return row.validationStatus.passed ? 'Passed' : 'Failed';
}

function adsEngagementFilterLabel(
  row: BillingSourceRow,
  linesByFlightKey: ReadonlyMap<string, BillingSourceRow[]>,
  adsBriefFilters: ReadonlySet<BillingAdsBriefKey>,
): string {
  const flightKey = billingAdsFlightKey(row) || adsLineKey(row);
  if (adsBriefFilters.size === 0) return 'Check palette equipment';
  const lines = linesByFlightKey.get(flightKey) ?? [];
  const scoped = filterBillingRowsByAdsBriefs(lines, adsBriefFilters);
  const entries = formatAdsFlightEngagementEntries(scoped);
  if (entries.length === 0) return '—';
  return entries.map((entry) => `${entry.label}: ${entry.value}`).join('; ');
}

function adsFlightRowMatchesColumnFilters(
  row: BillingSourceRow,
  filters: TableColumnFilters,
  formatCustomerFn: (row: BillingSourceRow) => string,
  linesByFlightKey: ReadonlyMap<string, BillingSourceRow[]>,
  adsBriefFilters: ReadonlySet<BillingAdsBriefKey>,
): boolean {
  if (filters.serial && adsFlightSerialLabel(row) !== filters.serial) return false;
  if (filters.flight && adsFlightNumberLabel(row) !== filters.flight) return false;
  if (filters.aircraftType && scheduledFlightAircraftType(row) !== filters.aircraftType) {
    return false;
  }
  if (filters.aircraftBody && scheduledFlightAircraftBody(row) !== filters.aircraftBody) {
    return false;
  }
  if (filters.engagement &&
    adsEngagementFilterLabel(row, linesByFlightKey, adsBriefFilters) !== filters.engagement
  ) {
    return false;
  }
  if (
    filters.bhsIncluded &&
    adsBhsIncludedFilterLabel(row, linesByFlightKey, adsBriefFilters) !== filters.bhsIncluded
  ) {
    return false;
  }
  if (
    filters.charged &&
    adsChargedFilterLabel(row, linesByFlightKey, adsBriefFilters) !== filters.charged
  ) {
    return false;
  }
  if (filters.eligible && scheduledFlightEligibleLabel(row) !== filters.eligible) return false;
  if (filters.prep && prepStatusLabel(row) !== filters.prep) return false;
  if (filters.contract && contractFilterLabel(row) !== filters.contract) return false;
  if (filters.rate && rateFilterLabel(row) !== filters.rate) return false;
  if (filters.validation && validationFilterLabel(row) !== filters.validation) return false;
  return true;
}

function rafParticularLabel(row: BillingSourceRow): string {
  return String(
    row.operationalData.particular ??
      row.operationalData.rafCleaningLabel ??
      row.operationalData.adsParticular ??
      row.operationalData.serviceCode ??
      '—',
  );
}

function rafEquipmentCodeLabel(row: BillingSourceRow): string {
  const code = String(
    row.operationalData.equipmentCode ??
      row.operationalData.equipment_code ??
      row.operationalData.abbr ??
      '',
  ).trim();
  return code || '—';
}

function rafQtyLabel(row: BillingSourceRow): string {
  return String(adsRowOperationalQuantity(row));
}

function rafUnitPriceLabel(row: BillingSourceRow): string {
  const price = row.rateMatch?.unitPrice;
  if (typeof price !== 'number' || !Number.isFinite(price)) return '—';
  const currency =
    String(row.rateMatch?.currency ?? row.operationalData.currency ?? 'INR').trim() || 'INR';
  return `${currency} ${price.toLocaleString('en-IN')}`;
}

function rafRowMatchesColumnFilters(
  row: BillingSourceRow,
  filters: TableColumnFilters,
  formatCustomerFn: (row: BillingSourceRow) => string,
): boolean {
  if (filters.prep && prepStatusLabel(row) !== filters.prep) return false;
  if (filters.serial && adsFlightSerialLabel(row) !== filters.serial) return false;
  if (filters.aircraftType && scheduledFlightAircraftType(row) !== filters.aircraftType) {
    return false;
  }
  if (filters.particular && rafParticularLabel(row) !== filters.particular) return false;
  if (filters.equipmentCode && rafEquipmentCodeLabel(row) !== filters.equipmentCode) {
    return false;
  }
  if (filters.qty && rafQtyLabel(row) !== filters.qty) return false;
  if (filters.customer && formatCustomerFn(row) !== filters.customer) return false;
  if (filters.unitPrice && rafUnitPriceLabel(row) !== filters.unitPrice) return false;
  if (filters.eligible && scheduledFlightEligibleLabel(row) !== filters.eligible) return false;
  if (filters.rate && rateFilterLabel(row) !== filters.rate) return false;
  if (filters.validation && validationFilterLabel(row) !== filters.validation) return false;
  return true;
}

function adsBhsIncludedFilterLabel(
  row: BillingSourceRow,
  linesByFlightKey: ReadonlyMap<string, BillingSourceRow[]>,
  adsBriefFilters: ReadonlySet<BillingAdsBriefKey>,
): string {
  const flightKey = billingAdsFlightKey(row) || adsLineKey(row);
  if (adsBriefFilters.size === 0) return 'Check palette equipment';
  const lines = linesByFlightKey.get(flightKey) ?? [];
  const scoped = filterBillingRowsByAdsBriefs(lines, adsBriefFilters);
  const entries = formatAdsFlightBhsIncludedEntries(scoped);
  if (entries.length === 0) return '—';
  return entries.map((entry) => `${entry.label}: ${entry.count}`).join('; ');
}

function adsChargedFilterLabel(
  row: BillingSourceRow,
  linesByFlightKey: ReadonlyMap<string, BillingSourceRow[]>,
  adsBriefFilters: ReadonlySet<BillingAdsBriefKey>,
): string {
  const flightKey = billingAdsFlightKey(row) || adsLineKey(row);
  if (adsBriefFilters.size === 0) return 'Check palette equipment';
  const lines = linesByFlightKey.get(flightKey) ?? [];
  const scoped = filterBillingRowsByAdsBriefs(lines, adsBriefFilters);
  const entries = formatAdsFlightChargedEntries(scoped);
  if (entries.length === 0) return '—';
  return entries.map((entry) => `${entry.label}: ${entry.count}`).join('; ');
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].filter((value) => value && value !== '—').sort((a, b) =>
    a.localeCompare(b),
  );
}

function normalizeSearchText(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

/** Extract airline code when FHR stored flight no in Arline_Code (IX2718 → IX). */
function normalizeCustomerCodeToken(value: unknown): string {
  const text = normalizeSearchText(stripCancelledFlightPrefix(value) || value);
  if (!text) return '';
  const fromCancelled = text.match(/(?:CANC\s*-\s*)?([A-Z]{2,3})\d{2,5}/);
  if (fromCancelled?.[1]) return fromCancelled[1];
  // IXC / spaced FHR: "IX 1498/ IX 1604"
  const fromSpacedFlight = text.match(/\b([A-Z]{2,3})\s+\d{2,5}\b/);
  if (fromSpacedFlight?.[1]) return fromSpacedFlight[1];
  const fromFlight = text.match(/\b([A-Z]{2,3})\d{2,5}\b/);
  if (fromFlight?.[1]) return fromFlight[1];
  if (/^[A-Z0-9]{2,10}$/.test(text)) return text;
  return '';
}

function rowMatchesCustomerCode(
  row: BillingSourceRow,
  selectedCustomerCode: string,
  selectedCustomerName?: string,
): boolean {
  const wantedCode = normalizeSearchText(selectedCustomerCode);
  if (!wantedCode) return true;
  const wantedName = normalizeSearchText(selectedCustomerName);
  const op = row.operationalData as Record<string, unknown>;

  const candidateCodes = [
    normalizeCustomerCodeToken(op.customerCode),
    normalizeCustomerCodeToken(op.Arline_Code),
    normalizeCustomerCodeToken(op.airlineCode),
    normalizeCustomerCodeToken(op.AirlineCode),
    normalizeCustomerCodeToken(row.sourceRef.flightNo),
    normalizeCustomerCodeToken(op.flightNoEquipmentNo),
    normalizeCustomerCodeToken(op.ArrivalFltNo),
    normalizeCustomerCodeToken(op.DepartureFltNo),
  ].filter(Boolean);
  if (candidateCodes.includes(wantedCode)) return true;

  const candidateNames = [
    normalizeSearchText(op.customerName),
    normalizeSearchText(op.Airline),
    normalizeSearchText(op.airline),
    normalizeSearchText(row.sourceRef.flightNo),
  ].filter(Boolean);
  if (wantedName && candidateNames.some((name) => name === wantedName || name.includes(wantedName))) {
    return true;
  }

  const customerCell = normalizeSearchText(scheduledFlightCustomer(row));
  if (!customerCell) return false;
  if (customerCell === wantedCode || customerCell.startsWith(`${wantedCode} —`)) return true;
  if (normalizeCustomerCodeToken(customerCell) === wantedCode) return true;
  return Boolean(wantedName && customerCell.includes(wantedName));
}

function formatSourceLoadError(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'Failed to load source data';
  if (/timeout|timed out|request timeout/i.test(raw)) {
    return 'Data is taking longer than usual. Please retry in a few seconds.';
  }
  if (/invalid json|unreadable response|unexpected token/i.test(raw)) {
    return 'Received an unreadable response from billing service. Please refresh and retry.';
  }
  return raw;
}

const CUSTOMER_DROPDOWN_FETCH_METHODS: OperationalSourceConfig['fetchMethod'][] = [
  'listScheduledFlights',
  'listAds',
  'listRaf',
  'listMaas',
];

function usesCustomerDropdown(fetchMethod: OperationalSourceConfig['fetchMethod']): boolean {
  return CUSTOMER_DROPDOWN_FETCH_METHODS.includes(fetchMethod);
}

function CustomerNameFilter({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ customerCode: string; name: string }>;
  onChange: (code: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = options.find((c) => c.customerCode === value);
  const label = selected ? `${selected.customerCode} — ${selected.name}` : '';
  const needle = query.trim().toLowerCase();
  const filtered = options.filter((c) => {
    if (!needle) return true;
    return (
      c.customerCode.toLowerCase().includes(needle) ||
      c.name.toLowerCase().includes(needle)
    );
  });

  return (
    <div className="relative min-w-[14rem]">
      <input
        type="text"
        value={open ? query : label}
        placeholder="All customers"
        aria-label="Filter by customer name"
        aria-expanded={open}
        aria-autocomplete="list"
        role="combobox"
        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        onFocus={() => {
          setQuery('');
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!e.target.value.trim()) onChange('');
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 150);
        }}
      />
      {open ? (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          <li>
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange('');
                setQuery('');
                setOpen(false);
              }}
            >
              All customers
            </button>
          </li>
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">No matching customer</li>
          ) : (
            filtered.map((c) => (
              <li key={c.customerCode}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.customerCode === value}
                  className="w-full px-3 py-1.5 text-left text-sm text-gray-900 hover:bg-gray-50"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(c.customerCode);
                    setQuery('');
                    setOpen(false);
                  }}
                >
                  {c.customerCode} — {c.name}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

/** Pages that load only after the user clicks Search (no auto-fetch on mount). */
function requiresManualSearch(
  fetchMethod: OperationalSourceConfig['fetchMethod'],
): boolean {
  return (
    fetchMethod === 'listScheduledFlights' ||
    fetchMethod === 'listAds' ||
    fetchMethod === 'listEquipment' ||
    fetchMethod === 'listManpower' ||
    fetchMethod === 'listRaf' ||
    fetchMethod === 'listMaas'
  );
}

/** ADS-only MOTORISED / NON MOTORISED / MANPOWER brief palettes. */
function usesAdsEquipmentPalette(
  fetchMethod: OperationalSourceConfig['fetchMethod'],
): boolean {
  return fetchMethod === 'listAds';
}

/** RAF palette keyed by seeded Excel Equipment No (GPU-140KV, PBNB, …). */
function usesRafEquipmentPalette(
  fetchMethod: OperationalSourceConfig['fetchMethod'],
): boolean {
  return fetchMethod === 'listRaf';
}

/** Stable per-line identity for ADS usage rows (equipment/manpower line level). */
function adsLineKey(row: BillingSourceRow): string {
  return `${row.sourceRef.serialNo ?? ''}-${row.sourceRef.usageRowId ?? ''}-${row.sourceRef.flightNo ?? ''}`;
}

/** Stable per-line identity for RAF equipment / cleaning lines. */
function rafLineKey(row: BillingSourceRow): string {
  const usage = String(row.sourceRef.usageRowId ?? '').trim();
  if (usage) return `raf:${usage}`;
  const serial = String(row.sourceRef.serialNo ?? '').trim();
  const flight = String(row.sourceRef.flightNo ?? '').trim();
  const particular = String(
    row.operationalData?.particular ??
      row.operationalData?.rafCleaningLabel ??
      row.operationalData?.adsParticular ??
      '',
  ).trim();
  return `raf:${serial}:${flight}:${particular}`;
}

/**
 * Collapse ADS equipment/manpower usage lines into ONE display row per flight.
 * The table shows flights (not equipment); each representative row aggregates its
 * lines: eligible if ANY line is eligible, validation fails if ANY line fails,
 * contract/rate matched if ANY line matched, and it counts as "sent" only when
 * ALL its lines are already in preparation. Underlying lines are still what gets
 * ingested (billing stays per equipment line).
 */
function groupAdsRowsByFlight(lines: BillingSourceRow[]): BillingSourceRow[] {
  const groups = new Map<string, BillingSourceRow[]>();
  for (const line of lines) {
    const key = billingAdsFlightKey(line) || adsLineKey(line);
    const list = groups.get(key);
    if (list) list.push(line);
    else groups.set(key, [line]);
  }

  const result: BillingSourceRow[] = [];
  for (const list of groups.values()) {
    const first = list[0];
    result.push({
      ...first,
      sentToPreparation: list.every((l) => Boolean(l.sentToPreparation)),
      billingEligibility: {
        ...first.billingEligibility,
        eligible: list.some((l) => l.billingEligibility.eligible),
        reason: list.some((l) => l.billingEligibility.eligible)
          ? undefined
          : first.billingEligibility.reason,
      },
      validationStatus: {
        ...first.validationStatus,
        passed: list.every((l) => l.validationStatus.passed),
        errors: list.flatMap((l) => l.validationStatus.errors ?? []),
      },
      contractMatch: {
        ...first.contractMatch,
        matched: list.some((l) => l.contractMatch.matched),
      },
      rateMatch: {
        ...first.rateMatch,
        matched: list.some((l) => l.rateMatch.matched),
      },
    });
  }
  return result;
}

function sourcePageReturnPath(
  fetchMethod: OperationalSourceConfig['fetchMethod'],
): string {
  switch (fetchMethod) {
    case 'listScheduledFlights':
      return '/billing/scheduled-flights';
    case 'listAds':
      return '/billing/ads';
    case 'listEquipment':
      return '/billing/equipment';
    case 'listManpower':
      return '/billing/manpower';
    case 'listRaf':
      return '/billing/raf';
    case 'listMaas':
      return '/billing/maas';
    case 'listCleaning':
      return '/billing/cleaning';
    default:
      return '/billing/scheduled-flights';
  }
}

export type OperationalSourceConfig = {
  title: string;
  description: string;
  fetchMethod:
    | 'listScheduledFlights'
    | 'listCleaning'
    | 'listRaf'
    | 'listMaas'
    | 'listAds'
    | 'listXxldScheduled'
    | 'listXxldNonScheduled'
    | 'listEquipment'
    | 'listManpower'
    | 'listNonScheduled';
  bcAuditRef: string;
  /** Optional default date range (YYYY-MM-DD). */
  defaultFrom?: string;
  defaultTo?: string;
};

const DEFAULT_FROM = '2026-05-01';
const DEFAULT_TO = '2026-06-30';

function defaultDateBasisForSource(
  fetchMethod: OperationalSourceConfig['fetchMethod'],
): ScheduledFlightsDateBasis {
  // ADS palette / MIS reconciliation uses STA month; BHS working window uses ATD.
  if (fetchMethod === 'listAds') return 'schedule-date';
  return 'atd-date';
}
/** Max rows per ingest request — server bulk-inserts in one round trip. */
const INGEST_BATCH_SIZE = 2000;
/** Limit concurrent ingest requests to keep backend responsive. */
const INGEST_BATCH_CONCURRENCY = 6;

type Props = {
  api: BillingApi;
  config: OperationalSourceConfig;
};

/**
 * Shared operational billing source page — Phase 2
 * Shows: Operational Data, Billing Eligibility, Contract Match, Rate Match, Validation Status
 */
export function OperationalSourcePage({ api, config }: Props) {
  const initialFrom = config.defaultFrom ?? DEFAULT_FROM;
  const initialTo = config.defaultTo ?? DEFAULT_TO;
  const initialDateBasis = defaultDateBasisForSource(config.fetchMethod);
  const sourceWorkspace = useSourcePageWorkspace({
    fetchMethod: config.fetchMethod,
    defaultFrom: initialFrom,
    defaultTo: initialTo,
    initialDateBasis,
    requiresManualSearch: requiresManualSearch(config.fetchMethod),
  });
  const {
    slice: sourceSlice,
    setDraftFrom,
    setDraftTo,
    setDraftDateBasis,
    setQueryFrom,
    setQueryTo,
    setQueryDateBasis,
    setCustomerCode,
    setQueryCustomerCode,
    setFlightNo,
    setDomIntFilter,
    setSearchSubmitted,
    setColumnFilters,
    selected,
    setSelected,
  } = sourceWorkspace;
  const draftFrom = sourceSlice.draftFrom;
  const draftTo = sourceSlice.draftTo;
  const draftDateBasis = sourceSlice.draftDateBasis;
  const queryFrom = sourceSlice.queryFrom;
  const queryTo = sourceSlice.queryTo;
  const queryDateBasis = sourceSlice.queryDateBasis;
  const customerCode = sourceSlice.customerCode;
  const queryCustomerCode = sourceSlice.queryCustomerCode;
  const flightNo = sourceSlice.flightNo;
  const domIntFilter = sourceSlice.domIntFilter;
  const searchSubmitted = sourceSlice.searchSubmitted;
  const columnFilters = sourceSlice.columnFilters;
  const [adsErrorsOnly, setAdsErrorsOnly] = useState(false);
  const [statFilters, setStatFilters] = useState<Set<BillingScheduledFlightStatKey>>(new Set());
  const [adsBriefFilters, setAdsBriefFilters] = useState<Set<BillingAdsBriefKey>>(new Set());
  const [maasFilters, setMaasFilters] = useState<MaasBillingFilters>(EMPTY_MAAS_BILLING_FILTERS);
  const [customers, setCustomers] = useState<Array<{ customerCode: string; name: string }>>([]);
  const [data, setData] = useState<BillingSourcesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [unsending, setUnsending] = useState(false);
  const [ingestMsg, setIngestMsg] = useState('');
  const [prepAfterIngestHref, setPrepAfterIngestHref] = useState<string | null>(null);
  const [unsendMsg, setUnsendMsg] = useState('');
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportExcelMsg, setExportExcelMsg] = useState('');
  /** RAF palette filters — Equipment No codes from Chennai Excel seed (GPU-140KV, …). */
  const [rafEquipmentFilters, setRafEquipmentFilters] = useState<Set<string>>(new Set());
  const loadRequestId = useRef(0);
  const lastSearchKeyRef = useRef('');

  const workspaceIdentity = useBillingWorkspaceIdentity();

  useEffect(() => {
    lastSearchKeyRef.current = '';
  }, [config.fetchMethod]);

  useEffect(() => {
    if (!workspaceIdentity) return;
    if (config.title !== 'BHS') return;
    if (isDelhiStation(readLoginStationCode())) return;
    const saved = getBillingWorkspacePageSlice(
      BILLING_WORKSPACE_PAGE_KEYS.source(config.fetchMethod),
    );
    if (saved) return;
    setDraftFrom(OTHER_STATION_BILLING_PERIOD.from);
    setDraftTo(OTHER_STATION_BILLING_PERIOD.to);
    setQueryFrom(OTHER_STATION_BILLING_PERIOD.from);
    setQueryTo(OTHER_STATION_BILLING_PERIOD.to);
  }, [
    workspaceIdentity,
    config.title,
    config.fetchMethod,
    setDraftFrom,
    setDraftTo,
    setQueryFrom,
    setQueryTo,
  ]);

  useEffect(() => {
    if (!usesCustomerDropdown(config.fetchMethod)) return;
    let cancelled = false;

    if (config.fetchMethod === 'listRaf') {
      // Advance → Gateway → RAF Airline master (not billing Customers).
      void api
        .listRafAirlines()
        .then((res) => {
          if (cancelled) return;
          const list = (res.data ?? []) as Array<{ customerCode: string; name: string }>;
          list.sort((a, b) =>
            String(a.customerCode ?? '').localeCompare(String(b.customerCode ?? ''), undefined, {
              sensitivity: 'base',
            }),
          );
          setCustomers(list);
        })
        .catch(() => {
          if (!cancelled) setCustomers([]);
        });
      return () => {
        cancelled = true;
      };
    }

    // BHS / ADS: billing Customers master (`active: all` keeps deactivated airlines).
    void api
      .listCustomers({ limit: 5000, active: 'all' })
      .then((res) => {
        if (cancelled) return;
        const list = (res.data ?? []) as Array<{ customerCode: string; name: string }>;
        list.sort((a, b) =>
          String(a.customerCode ?? '').localeCompare(String(b.customerCode ?? ''), undefined, {
            sensitivity: 'base',
          }),
        );
        setCustomers(list);
      })
      .catch(() => {
        if (!cancelled) setCustomers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [api, config.fetchMethod]);

  const load = useCallback(
    async (
      options?: {
        preserveFilters?: boolean;
        from?: string;
        to?: string;
        dateBasis?: ScheduledFlightsDateBasis;
        customerCode?: string;
      },
    ): Promise<boolean> => {
      const requestId = ++loadRequestId.current;
      setLoading(true);
      setError('');
      try {
        const from = options?.from ?? queryFrom;
        const to = options?.to ?? queryTo;
        const dateBasis = options?.dateBasis ?? queryDateBasis;
        const customer = options?.customerCode ?? queryCustomerCode;
        const customerParam =
          config.fetchMethod === 'listScheduledFlights'
            ? undefined
            : customer || undefined;
        const fetcher = api[config.fetchMethod] as (p: {
          from: string;
          to: string;
          dateBasis?: string;
          customerCode?: string;
        }) => Promise<{ data: BillingSourcesResponse }>;
        const res = await fetcher({
          from,
          to,
          dateBasis,
          customerCode: customerParam,
        });
        if (requestId !== loadRequestId.current) return false;
        setData(res.data);
        setSelected(new Set());
        if (!options?.preserveFilters) {
          setStatFilters(new Set());
          setAdsBriefFilters(new Set());
          setRafEquipmentFilters(new Set());
          setAdsErrorsOnly(false);
          setColumnFilters(EMPTY_COLUMN_FILTERS);
        }
        return true;
      } catch (e) {
        if (requestId !== loadRequestId.current) return false;
        setError(formatSourceLoadError(e));
        return false;
      } finally {
        if (requestId === loadRequestId.current) {
          setLoading(false);
        }
      }
    },
    [api, config.fetchMethod, queryFrom, queryTo, queryDateBasis, queryCustomerCode],
  );

  useEffect(() => {
    if (requiresManualSearch(config.fetchMethod)) return;
    void load();
  }, [config.fetchMethod, load]);

  const applyDateSearch = async () => {
    if (loading) return;
    const nextFrom = draftFrom;
    const nextTo = draftTo;
    const nextDateBasis = draftDateBasis;
    const nextCustomerCode = customerCode;
    const nextSearchKey = [
      nextFrom,
      nextTo,
      nextDateBasis,
      nextCustomerCode.trim().toUpperCase(),
    ].join('|');
    setQueryFrom(draftFrom);
    setQueryTo(draftTo);
    setQueryDateBasis(draftDateBasis);
    setQueryCustomerCode(customerCode);
    setSearchSubmitted(true);
    setData(null); // drop prior palette/rows so UI only shows this date-range fetch
    // Always re-fetch — same filters must still reload (empty/stale cache was blocking Search).
    const ok = await load({
      from: nextFrom,
      to: nextTo,
      dateBasis: nextDateBasis,
      customerCode: nextCustomerCode,
      preserveFilters:
        config.fetchMethod === 'listScheduledFlights' ||
        config.fetchMethod === 'listAds',
    });
    if (ok) {
      lastSearchKeyRef.current = nextSearchKey;
    }
  };

  const handleCustomerChange = (value: string) => {
    setCustomerCode(value);
    if (usesCustomerDropdown(config.fetchMethod)) {
      setQueryCustomerCode(value);
    }
    if (usesAdsEquipmentPalette(config.fetchMethod)) {
      setAdsBriefFilters(new Set());
      setSelected(new Set());
    }
    if (usesRafEquipmentPalette(config.fetchMethod)) {
      setRafEquipmentFilters(new Set());
      setSelected(new Set());
    }
  };

  const flightDomFilteredRows = useMemo(() => {
    const loaded = data?.rows ?? [];
    if (
      config.fetchMethod !== 'listScheduledFlights' &&
      config.fetchMethod !== 'listAds' &&
      config.fetchMethod !== 'listRaf' &&
      config.fetchMethod !== 'listMaas'
    ) {
      return loaded;
    }
    const selectedCustomerName = customers.find(
      (c) => normalizeSearchText(c.customerCode) === normalizeSearchText(customerCode),
    )?.name;

    return loaded.filter((r) => {
      if (customerCode.trim() && !rowMatchesCustomerCode(r, customerCode, selectedCustomerName)) {
        return false;
      }

      if (flightNo.trim() && !billingRowMatchesFlightSearch(r, flightNo)) {
        return false;
      }

      if (domIntFilter) {
        const bucket = domesticInternationalBucketFromCateOfFlight(
          r.operationalData.categoryOfFlight,
        );
        if (bucket !== domIntFilter) return false;
      }

      if (config.fetchMethod === 'listMaas' && !maasRowMatchesFilters(r, maasFilters)) {
        return false;
      }

      return true;
    });
  }, [
    data?.rows,
    config.fetchMethod,
    flightNo,
    domIntFilter,
    customerCode,
    customers,
    maasFilters,
  ]);

  const customerDirectory = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customers) {
      const code = String(c.customerCode ?? '').trim().toUpperCase();
      const name = String(c.name ?? '').trim();
      if (code && name) map.set(code, name);
    }
    return map;
  }, [customers]);

  /** Master list + any codes present on loaded rows (covers missing/inactive masters). */
  const customerDropdownOptions = useMemo(() => {
    const byCode = new Map<string, { customerCode: string; name: string }>();
    for (const c of customers) {
      const code = String(c.customerCode ?? '').trim().toUpperCase();
      if (!code) continue;
      byCode.set(code, {
        customerCode: code,
        name: String(c.name ?? '').trim() || code,
      });
    }
    for (const row of data?.rows ?? []) {
      const op = row.operationalData as Record<string, unknown>;
      const code =
        normalizeCustomerCodeToken(op.customerCode) ||
        normalizeCustomerCodeToken(op.airlineCode) ||
        normalizeCustomerCodeToken(op.AirlineCode);
      if (!code || byCode.has(code)) continue;
      const name =
        String(op.Airline ?? op.airlineName ?? op.customerName ?? '').trim() || code;
      byCode.set(code, { customerCode: code, name });
    }
    return Array.from(byCode.values()).sort((a, b) =>
      a.customerCode.localeCompare(b.customerCode, undefined, { sensitivity: 'base' }),
    );
  }, [customers, data?.rows]);

  const formatCustomer = useCallback(
    (row: BillingSourceRow) => scheduledFlightCustomer(row, customerDirectory),
    [customerDirectory],
  );

  const columnFilterOptions = useMemo(() => {
    if (config.fetchMethod === 'listScheduledFlights') {
      return {
        category: uniqueSorted(flightDomFilteredRows.map(scheduledFlightCategory)),
        typeOfHandling: uniqueSorted(flightDomFilteredRows.map(scheduledFlightTypeOfHandling)),
        paxFreight: uniqueSorted(flightDomFilteredRows.map(scheduledFlightPaxFreight)),
        ops: uniqueSorted(flightDomFilteredRows.map(scheduledFlightOps)),
        aircraftType: uniqueSorted(flightDomFilteredRows.map(scheduledFlightAircraftType)),
        aircraftBody: uniqueSorted(flightDomFilteredRows.map(scheduledFlightAircraftBody)),
        customer: uniqueSorted(flightDomFilteredRows.map(formatCustomer)),
        eligible: uniqueSorted(flightDomFilteredRows.map(scheduledFlightEligibleLabel)),
        serial: [],
        flight: [],
        prep: [],
        engagement: [],
        bhsIncluded: [],
        charged: [],
        contract: [],
        rate: [],
        validation: [],
        particular: [],
        equipmentCode: [],
        qty: [],
        unitPrice: [],
      } satisfies TableColumnFilterOptions;
    }

    if (config.fetchMethod === 'listAds') {
      let adsLines = filterBillingRowsByAdsBriefs(
        flightDomFilteredRows,
        adsBriefFilters,
      );
      if (adsErrorsOnly) {
        const errorFlightKeys = new Set(
          adsLines
            .filter((r) => !r.validationStatus.passed)
            .map((r) => billingAdsFlightKey(r))
            .filter(Boolean),
        );
        adsLines = adsLines.filter((r) =>
          errorFlightKeys.has(billingAdsFlightKey(r)),
        );
      }

      const linesMap = new Map<string, BillingSourceRow[]>();
      for (const line of adsLines) {
        const lineKey = billingAdsFlightKey(line) || adsLineKey(line);
        const list = linesMap.get(lineKey);
        if (list) list.push(line);
        else linesMap.set(lineKey, [line]);
      }

      const grouped = groupAdsRowsByFlight(adsLines);
      return {
        category: [],
        typeOfHandling: [],
        paxFreight: [],
        ops: [],
        aircraftType: uniqueSorted(grouped.map(scheduledFlightAircraftType)),
        aircraftBody: uniqueSorted(grouped.map(scheduledFlightAircraftBody)),
        customer: [],
        eligible: uniqueSorted(grouped.map(scheduledFlightEligibleLabel)),
        serial: uniqueSorted(grouped.map(adsFlightSerialLabel)),
        flight: uniqueSorted(grouped.map(adsFlightNumberLabel)),
        prep: uniqueSorted(grouped.map(prepStatusLabel)),
        engagement: uniqueSorted(
          grouped.map((row) =>
            adsEngagementFilterLabel(row, linesMap, adsBriefFilters),
          ),
        ),
        bhsIncluded: uniqueSorted(
          grouped.map((row) =>
            adsBhsIncludedFilterLabel(row, linesMap, adsBriefFilters),
          ),
        ),
        charged: uniqueSorted(
          grouped.map((row) =>
            adsChargedFilterLabel(row, linesMap, adsBriefFilters),
          ),
        ),
        contract: uniqueSorted(grouped.map(contractFilterLabel)),
        rate: uniqueSorted(grouped.map(rateFilterLabel)),
        validation: uniqueSorted(grouped.map(validationFilterLabel)),
        particular: [],
        equipmentCode: [],
        qty: [],
        unitPrice: [],
      } satisfies TableColumnFilterOptions;
    }

    if (config.fetchMethod === 'listRaf') {
      const rafLines = filterBillingRowsByRafEquipmentCodes(
        flightDomFilteredRows,
        rafEquipmentFilters,
      );
      return {
        category: [],
        typeOfHandling: [],
        paxFreight: [],
        ops: [],
        aircraftType: uniqueSorted(rafLines.map(scheduledFlightAircraftType)),
        aircraftBody: [],
        customer: uniqueSorted(rafLines.map(formatCustomer)),
        eligible: uniqueSorted(rafLines.map(scheduledFlightEligibleLabel)),
        serial: uniqueSorted(rafLines.map(adsFlightSerialLabel)),
        flight: [],
        prep: uniqueSorted(rafLines.map(prepStatusLabel)),
        engagement: [],
        bhsIncluded: [],
        charged: [],
        contract: [],
        rate: uniqueSorted(rafLines.map(rateFilterLabel)),
        validation: uniqueSorted(rafLines.map(validationFilterLabel)),
        particular: uniqueSorted(rafLines.map(rafParticularLabel)),
        equipmentCode: uniqueSorted(rafLines.map(rafEquipmentCodeLabel)),
        qty: uniqueSorted(rafLines.map(rafQtyLabel)),
        unitPrice: uniqueSorted(rafLines.map(rafUnitPriceLabel)),
      } satisfies TableColumnFilterOptions;
    }

    return EMPTY_COLUMN_FILTER_OPTIONS;
  }, [
    config.fetchMethod,
    flightDomFilteredRows,
    formatCustomer,
    adsBriefFilters,
    adsErrorsOnly,
    rafEquipmentFilters,
  ]);

  const sourceRows = useMemo(() => {
    if (config.fetchMethod !== 'listScheduledFlights') {
      return flightDomFilteredRows;
    }

    const filtered = flightDomFilteredRows.filter((r) =>
      scheduledRowMatchesColumnFilters(r, columnFilters, customerDirectory),
    );

    return sortBillingRowsUnsentFirst(filtered);
  }, [config.fetchMethod, flightDomFilteredRows, columnFilters, customerDirectory]);

  /** ADS equipment/manpower usage lines (ungrouped) after palette / errors filters. */
  const adsLineRows = useMemo(() => {
    if (config.fetchMethod !== 'listAds') return [];
    let next = filterBillingRowsByAdsBriefs(sourceRows, adsBriefFilters);
    if (adsErrorsOnly) {
      const errorFlightKeys = new Set(
        next
          .filter((r) => !r.validationStatus.passed)
          .map((r) => billingAdsFlightKey(r))
          .filter(Boolean),
      );
      next = next.filter((r) => errorFlightKeys.has(billingAdsFlightKey(r)));
    }
    return next;
  }, [config.fetchMethod, sourceRows, adsBriefFilters, adsErrorsOnly]);

  /** ADS flight display key → its underlying equipment/manpower lines (for send/unsend). */
  const adsLinesByFlightKey = useMemo(() => {
    const map = new Map<string, BillingSourceRow[]>();
    if (config.fetchMethod !== 'listAds') return map;
    for (const line of adsLineRows) {
      const key = billingAdsFlightKey(line) || adsLineKey(line);
      const list = map.get(key);
      if (list) list.push(line);
      else map.set(key, [line]);
    }
    return map;
  }, [config.fetchMethod, adsLineRows]);

  const adsGroupedRowsBeforeColumnFilter = useMemo(() => {
    if (config.fetchMethod !== 'listAds') return [];
    return groupAdsRowsByFlight(adsLineRows);
  }, [config.fetchMethod, adsLineRows]);

  const rafRowsBeforeColumnFilter = useMemo(() => {
    if (config.fetchMethod !== 'listRaf') return [];
    return filterBillingRowsByRafEquipmentCodes(sourceRows, rafEquipmentFilters);
  }, [config.fetchMethod, sourceRows, rafEquipmentFilters]);

  const rows = useMemo(() => {
    if (config.fetchMethod === 'listScheduledFlights') {
      return sortBillingRowsUnsentFirst(
        filterBillingRowsByStatCategories(sourceRows, statFilters),
      );
    }
    if (config.fetchMethod === 'listAds') {
      return adsGroupedRowsBeforeColumnFilter.filter((r) =>
        adsFlightRowMatchesColumnFilters(
          r,
          columnFilters,
          formatCustomer,
          adsLinesByFlightKey,
          adsBriefFilters,
        ),
      );
    }
    if (config.fetchMethod === 'listRaf') {
      return rafRowsBeforeColumnFilter.filter((r) =>
        rafRowMatchesColumnFilters(r, columnFilters, formatCustomer),
      );
    }
    return sourceRows;
  }, [
    config.fetchMethod,
    sourceRows,
    statFilters,
    adsGroupedRowsBeforeColumnFilter,
    columnFilters,
    formatCustomer,
    adsLinesByFlightKey,
    adsBriefFilters,
    rafRowsBeforeColumnFilter,
  ]);

  const unsentRows = useMemo(
    () => rows.filter((r) => !r.sentToPreparation),
    [rows],
  );

  const sentRows = useMemo(
    () => rows.filter((r) => r.sentToPreparation),
    [rows],
  );

  const sentCount = sentRows.length;

  const scheduledFlightStats = useMemo(() => {
    if (config.fetchMethod !== 'listScheduledFlights') return null;
    return computeBillingScheduledFlightStats(sourceRows);
  }, [config.fetchMethod, sourceRows]);

  const adsBriefStats = useMemo(() => {
    if (!usesAdsEquipmentPalette(config.fetchMethod)) return null;
    return computeBillingAdsBriefStats(sourceRows);
  }, [config.fetchMethod, sourceRows]);

  const adsWchBreakdown = useMemo(() => {
    if (!usesAdsEquipmentPalette(config.fetchMethod)) return EMPTY_BILLING_ADS_WCH_BREAKDOWN;
    return computeBillingAdsWchBreakdown(sourceRows);
  }, [config.fetchMethod, sourceRows]);

  const adsBriefSelectionTotals = useMemo(() => {
    if (!usesAdsEquipmentPalette(config.fetchMethod) || adsBriefFilters.size === 0) {
      return null;
    }
    return computeAdsBriefSelectionTotals(sourceRows, adsBriefFilters);
  }, [adsBriefFilters, config.fetchMethod, sourceRows]);

  const adsTotalFlights = useMemo(() => {
    if (!usesAdsEquipmentPalette(config.fetchMethod)) return 0;
    return countUniqueAdsFlights(sourceRows);
  }, [config.fetchMethod, sourceRows]);

  const rafEquipmentStats = useMemo(() => {
    if (!usesRafEquipmentPalette(config.fetchMethod)) return null;
    return computeRafEquipmentPaletteStats(sourceRows);
  }, [config.fetchMethod, sourceRows]);

  const rafEquipmentSelectionTotals = useMemo(() => {
    if (!usesRafEquipmentPalette(config.fetchMethod) || rafEquipmentFilters.size === 0) {
      return null;
    }
    return computeRafEquipmentSelectionTotals(sourceRows, rafEquipmentFilters);
  }, [config.fetchMethod, rafEquipmentFilters, sourceRows]);

  const rafTotalFlights = useMemo(() => {
    if (!usesRafEquipmentPalette(config.fetchMethod)) return 0;
    return countUniqueRafFlights(sourceRows);
  }, [config.fetchMethod, sourceRows]);

  const toggleStatFilter = (key: BillingScheduledFlightStatKey) => {
    setStatFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setSelected(new Set());
  };

  const clearStatFilters = () => {
    setStatFilters(new Set());
    setSelected(new Set());
  };

  const toggleAdsBriefFilter = (key: BillingAdsBriefKey) => {
    setAdsBriefFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setSelected(new Set());
  };

  const toggleAdsBriefFilterGroup = (keys: readonly BillingAdsBriefKey[]) => {
    setAdsBriefFilters((prev) => {
      const next = new Set(prev);
      const allSelected = keys.every((key) => next.has(key));
      if (allSelected) {
        for (const key of keys) next.delete(key);
      } else {
        for (const key of keys) next.add(key);
      }
      return next;
    });
    setSelected(new Set());
  };

  const clearAdsBriefFilters = () => {
    setAdsBriefFilters(new Set());
    setSelected(new Set());
  };

  const toggleRafEquipmentFilter = (code: RafSeededEquipmentCode) => {
    setRafEquipmentFilters((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
    setSelected(new Set());
  };

  const clearRafEquipmentFilters = () => {
    setRafEquipmentFilters(new Set());
    setSelected(new Set());
  };

  const toggleAdsErrorsFilter = () => {
    setAdsErrorsOnly((prev) => !prev);
    setSelected(new Set());
  };

  const clearAdsErrorsFilter = () => {
    setAdsErrorsOnly(false);
    setSelected(new Set());
  };

  const setColumnFilter = (key: TableColumnFilterKey, value: string) => {
    setColumnFilters((prev) => ({ ...prev, [key]: value }));
    setSelected(new Set());
  };

  const clearColumnFilters = () => {
    setColumnFilters(EMPTY_COLUMN_FILTERS);
    setSelected(new Set());
  };

  const hasColumnFilters = Object.values(columnFilters).some(Boolean);

  const summary = useMemo(() => {
    if (config.fetchMethod === 'listScheduledFlights') {
      const eligible = rows.filter((r) => r.billingEligibility.eligible).length;
      const errors = rows.filter((r) => !r.validationStatus.passed).length;
      const ready = rows.filter(
        (r) => r.billingEligibility.eligible && r.validationStatus.passed,
      ).length;
      return { total: rows.length, eligible, errors, ready };
    }
    if (config.fetchMethod === 'listAds') {
      // Chip counts are unique flights (ignore errors-only filter so Errors stays stable).
      const base = filterBillingRowsByAdsBriefs(sourceRows, adsBriefFilters);
      const byFlight = new Map<string, BillingSourceRow[]>();
      for (const row of base) {
        const key = billingAdsFlightKey(row);
        if (!key) continue;
        const list = byFlight.get(key) ?? [];
        list.push(row);
        byFlight.set(key, list);
      }
      let eligible = 0;
      let errors = 0;
      let ready = 0;
      for (const flightRows of byFlight.values()) {
        const hasError = flightRows.some((r) => !r.validationStatus.passed);
        const hasEligible = flightRows.some((r) => r.billingEligibility.eligible);
        if (hasError) errors += 1;
        if (hasEligible) eligible += 1;
        if (hasEligible && !hasError) ready += 1;
      }
      return { total: byFlight.size, eligible, errors, ready, usageLines: base.length };
    }
    return data?.summary;
  }, [
    config.fetchMethod,
    rows,
    sourceRows,
    adsBriefFilters,
    data?.summary,
  ]);

  const isScheduledFlights = config.fetchMethod === 'listScheduledFlights';
  const isAds = config.fetchMethod === 'listAds';
  const isRaf = config.fetchMethod === 'listRaf';
  const isMaas = config.fetchMethod === 'listMaas';

  const maasStats = useMemo(() => {
    if (!isMaas) return null;
    return computeMaasBillingStats(rows);
  }, [isMaas, rows]);

  /**
   * Display/selection key. ADS is grouped by flight, so its key is the flight
   * identity (many equipment lines share one row). Ingest still keys on the
   * per-line {@link adsLineKey}. RAF keeps one row per equipment/cleaning line.
   */
  const rowKey = useCallback(
    (r: BillingSourceRow) => {
      if (isScheduledFlights) return billingScheduledFlightRowKey(r);
      if (isAds) return billingAdsFlightKey(r) || adsLineKey(r);
      if (isRaf) return rafLineKey(r);
      return adsLineKey(r);
    },
    [isScheduledFlights, isAds, isRaf],
  );

  const selectedSentCount = useMemo(
    () =>
      rows.filter((r) => r.sentToPreparation && selected.has(rowKey(r))).length,
    [rows, selected, rowKey],
  );

  const selectedUnsentCount = useMemo(
    () =>
      rows.filter((r) => !r.sentToPreparation && selected.has(rowKey(r))).length,
    [rows, selected, rowKey],
  );

  const selectedCount = selectedSentCount + selectedUnsentCount;

  const selectableRowKeys = useMemo(() => {
    // Dedupe — duplicate React keys must not inflate select-all / selection state.
    return [...new Set(rows.map((r) => rowKey(r)).filter(Boolean))];
  }, [rows, rowKey]);

  const allSelected =
    selectableRowKeys.length > 0 && selectableRowKeys.every((k) => selected.has(k));
  const someSelected = selectableRowKeys.some((k) => selected.has(k)) && !allSelected;

  const mapRowsForIngest = (source: BillingSourceRow[]) => {
    const filterCustomerCode = queryCustomerCode.trim().toUpperCase();
    return source.map((r) => {
      const op = r.operationalData as Record<string, unknown>;
      const existingCode = String(op.customerCode ?? '').trim();
      const operationalData =
        !existingCode && filterCustomerCode
          ? { ...op, customerCode: filterCustomerCode }
          : r.operationalData;
      return {
        sourceType: r.sourceType,
        sourceRef: {
          serialNo:
            r.sourceRef.serialNo ??
            String(r.operationalData.serialNumber ?? ''),
          flightNo: r.sourceRef.flightNo,
          // ADS / equipment / manpower lines — required so BHS serial ingest does not collide.
          usageRowId: r.sourceRef.usageRowId,
        },
        operationalData,
        contractMatch: r.contractMatch,
        rateMatch: r.rateMatch,
        validationStatus: r.validationStatus,
        validationResults: r.validationStatus.errors,
      };
    });
  };

  /** Ingest identity is always per-line (ADS rowKey is flight-level after grouping). */
  const ingestKey = useCallback(
    (r: BillingSourceRow) => {
      if (isAds) return adsLineKey(r);
      if (isRaf) return rafLineKey(r);
      return rowKey(r);
    },
    [isAds, isRaf, rowKey],
  );

  const dedupeRowsForIngest = (source: BillingSourceRow[]) => {
    const seen = new Set<string>();
    const unique: BillingSourceRow[] = [];
    for (const row of source) {
      const key = ingestKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(row);
    }
    return unique;
  };

  const ingestRowsInBatches = async (source: BillingSourceRow[]) => {
    let totalCreated = 0;
    let totalSkipped = 0;
    const statusTotals: Record<string, number> = {};
    const allSkipped: Array<{ sourceRef?: unknown; reason?: string }> = [];

    const batches: BillingSourceRow[][] = [];
    for (let i = 0; i < source.length; i += INGEST_BATCH_SIZE) {
      batches.push(source.slice(i, i + INGEST_BATCH_SIZE));
    }

    const workerCount = Math.min(INGEST_BATCH_CONCURRENCY, batches.length);
    let cursor = 0;
    const workers = Array.from({ length: workerCount }, async () => {
      while (cursor < batches.length) {
        const batch = batches[cursor];
        cursor += 1;
        const res = await api.ingestPreparation({
          billingPeriodStart: queryFrom,
          billingPeriodEnd: queryTo,
          rows: mapRowsForIngest(batch),
        });
        const data = (res as { data?: {
          created?: number;
          skipped?: Array<{ sourceRef?: unknown; reason?: string }>;
          statusBreakdown?: Record<string, number>;
        } }).data;
        totalCreated += data?.created ?? 0;
        totalSkipped += data?.skipped?.length ?? 0;
        allSkipped.push(...(data?.skipped ?? []));
        for (const [status, count] of Object.entries(data?.statusBreakdown ?? {})) {
          statusTotals[status] = (statusTotals[status] ?? 0) + count;
        }
      }
    });
    await Promise.all(workers);

    return { totalCreated, totalSkipped, statusTotals, allSkipped };
  };

  const markRowsUnsentLocally = (ids: {
    serialNos?: string[];
    usageRowIds?: string[];
  }) => {
    const serials = new Set((ids.serialNos ?? []).map((s) => s.trim()).filter(Boolean));
    const usageIds = new Set((ids.usageRowIds ?? []).map((s) => s.trim()).filter(Boolean));
    if (serials.size === 0 && usageIds.size === 0) return;

    setData((prev) => {
      if (!prev?.rows?.length) return prev;
      return {
        ...prev,
        rows: prev.rows.map((r) => {
          const serial = String(
            r.sourceRef.serialNo ?? r.operationalData.serialNumber ?? '',
          ).trim();
          const usage = String(r.sourceRef.usageRowId ?? '').trim();
          if ((serial && serials.has(serial)) || (usage && usageIds.has(usage))) {
            return { ...r, sentToPreparation: false };
          }
          return r;
        }),
      };
    });
  };

  const markRowsSentLocally = (
    sent: BillingSourceRow[],
    skipped: Array<{ sourceRef?: unknown; reason?: string }>,
  ) => {
    const skipKey = (ref: {
      serialNo?: string;
      usageRowId?: string;
      flightNo?: string;
    } | undefined) => `${ref?.serialNo ?? ''}-${ref?.usageRowId ?? ''}-${ref?.flightNo ?? ''}`;

    /** Skips that mean the row was not stored in preparation. */
    const notStoredKeys = new Set(
      skipped
        .filter((s) => {
          const reason = String(s.reason ?? '');
          return (
            reason === 'Duplicate row in this send batch' ||
            reason.startsWith('Missing source identity') ||
            reason.startsWith('Missing customer code')
          );
        })
        .map((s) =>
          skipKey(
            s.sourceRef as {
              serialNo?: string;
              usageRowId?: string;
              flightNo?: string;
            } | undefined,
          ),
        )
        .filter((k) => k !== '--'),
    );

    const keysToMark = new Set(
      sent
        .map((r) => ingestKey(r))
        .filter((key) => key && !notStoredKeys.has(key)),
    );

    setData((prev) => {
      if (!prev?.rows?.length) return prev;
      return {
        ...prev,
        rows: prev.rows.map((r) => {
          const key = ingestKey(r);
          if (key && keysToMark.has(key)) {
            return { ...r, sentToPreparation: true };
          }
          return r;
        }),
      };
    });
  };

  const preferredPrepTab = (statusTotals: Record<string, number>): string => {
    const order = [
      'pending',
      'eligible',
      'validation_error',
      'ready_for_invoice',
      'rejected',
    ];
    return order.find((id) => (statusTotals[id] ?? 0) > 0) ?? 'pending';
  };

  const buildPrepHref = (
    statusTotals: Record<string, number>,
    sourceTypeHint?: string,
  ) => {
    const params = new URLSearchParams();
    params.set('from', queryFrom);
    params.set('to', queryTo);
    const isCustom =
      String(sourceTypeHint ?? '').trim().toLowerCase() === 'custom';
    params.set('tab', isCustom ? 'custom' : preferredPrepTab(statusTotals));
    if (queryCustomerCode.trim()) {
      params.set('customer', queryCustomerCode.trim());
    }
    return `/billing/preparation?${params.toString()}`;
  };

  const toggleRow = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const keys = selectableRowKeys;
    const allVisibleSelected = keys.length > 0 && keys.every((k) => selected.has(k));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const key of keys) next.delete(key);
      } else {
        for (const key of keys) next.add(key);
      }
      return next;
    });
  };

  const formatIngestMessage = (
    totalCreated: number,
    totalSkipped: number,
    statusTotals: Record<string, number>,
    sentCount: number,
    skippedRows: Array<{ sourceRef?: unknown; reason?: string }> = [],
  ) => {
    const statusLabels: Record<string, string> = {
      pending: 'pending',
      eligible: 'eligible (missing contract/rate)',
      validation_error: 'validation errors',
      ready_for_invoice: 'ready',
    };
    const breakdown = Object.entries(statusTotals)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${n} ${statusLabels[k] ?? k.replace(/_/g, ' ')}`)
      .join(', ');
    const breakdownNote = breakdown ? ` (${breakdown})` : '';
    const skippedNote =
      totalSkipped > 0
        ? (() => {
            const reasons = new Map<string, number>();
            for (const s of skippedRows) {
              const reason = String(s.reason ?? 'skipped').trim() || 'skipped';
              reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
            }
            const detail = [...reasons.entries()]
              .map(([reason, n]) => `${n}× ${reason}`)
              .join('; ');
            return ` ${totalSkipped} skipped${detail ? ` (${detail})` : ''}.`;
          })()
        : '';
    const mismatchNote =
      sentCount > totalCreated + totalSkipped
        ? ` ${sentCount - totalCreated - totalSkipped} row(s) were not ingested — check for API errors.`
        : '';
    return `Ingested ${totalCreated} of ${sentCount} row${sentCount === 1 ? '' : 's'}${breakdownNote}.${skippedNote}${mismatchNote}`;
  };

  const sendToPreparation = async (rowsToSend: BillingSourceRow[]) => {
    const uniqueRows = dedupeRowsForIngest(rowsToSend);
    if (uniqueRows.length === 0) {
      setIngestMsg('No unsent flights to send to preparation.');
      return;
    }

    setIngesting(true);
    setIngestMsg('');
    setPrepAfterIngestHref(null);
    setUnsendMsg('');
    try {
      const { totalCreated, totalSkipped, statusTotals, allSkipped } =
        await ingestRowsInBatches(uniqueRows);
      markRowsSentLocally(uniqueRows, allSkipped);
      setIngestMsg(
        formatIngestMessage(
          totalCreated,
          totalSkipped,
          statusTotals,
          uniqueRows.length,
          allSkipped,
        ),
      );
      if (totalCreated > 0 || Object.values(statusTotals).some((n) => n > 0)) {
        setPrepAfterIngestHref(
          buildPrepHref(statusTotals, uniqueRows[0]?.sourceType),
        );
      } else if (
        allSkipped.some((s) =>
          String(s.reason ?? '').includes('Already in preparation'),
        )
      ) {
        setPrepAfterIngestHref(
          buildPrepHref({ pending: 1 }, uniqueRows[0]?.sourceType),
        );
      }
      void Promise.allSettled([
        api.listPreparation({
          from: queryFrom,
          to: queryTo,
          page: 1,
          limit: 100,
        }),
        api.listInvoiceDrafts({ status: 'draft' }),
      ]);
      setSelected(new Set());
    } catch (e) {
      setIngestMsg(e instanceof Error ? e.message : 'Ingest failed');
      setPrepAfterIngestHref(null);
    } finally {
      setIngesting(false);
    }
  };

  /** ADS: expand selected flight rows to their underlying (matching) equipment lines. */
  const adsLinesForSelectedFlights = (
    predicate: (line: BillingSourceRow) => boolean,
  ): BillingSourceRow[] =>
    [...selected].flatMap((flightKey) =>
      (adsLinesByFlightKey.get(flightKey) ?? []).filter(predicate),
    );

  const sendSelectedToPreparation = () => {
    const selectedRows = isAds
      ? adsLinesForSelectedFlights((l) => !l.sentToPreparation)
      : rows.filter((r) => selected.has(rowKey(r)) && !r.sentToPreparation);
    void sendToPreparation(selectedRows);
  };

  const serialsFromRows = (source: BillingSourceRow[]) =>
    [
      ...new Set(
        source
          .map((r) =>
            String(
              r.sourceRef.serialNo ?? r.operationalData.serialNumber ?? '',
            ).trim(),
          )
          .filter(Boolean),
      ),
    ];

  const usageRowIdsFromRows = (source: BillingSourceRow[]) =>
    [
      ...new Set(
        source.map((r) => String(r.sourceRef.usageRowId ?? '').trim()).filter(Boolean),
      ),
    ];

  const formatUnsendMessage = (
    unsent: number,
    failed: Array<{ serialNo: string; message: string }>,
    requested: number,
  ) => {
    const unit = isAds ? 'ADS row' : 'flight';
    const failNote =
      failed.length > 0
        ? ` ${failed.length} could not be unsent${
            failed.length <= 3
              ? `: ${failed.map((f) => `${f.serialNo} (${f.message})`).join('; ')}`
              : ' — see preparation page for linked drafts or invoiced rows'
          }.`
        : '';
    return `Unsent ${unsent} of ${requested} ${unit}${requested === 1 ? '' : 's'} from preparation.${failNote}`;
  };

  const unsendFromPreparation = async (rowsToUnsend: BillingSourceRow[]) => {
    const uniqueRows = dedupeRowsForIngest(rowsToUnsend);
    const usageRowIds = usageRowIdsFromRows(uniqueRows);
    const serialNos = usageRowIds.length > 0 ? [] : serialsFromRows(uniqueRows);
    if (usageRowIds.length === 0 && serialNos.length === 0) return;

    setUnsending(true);
    setUnsendMsg('');
    setIngestMsg('');
    try {
      const res = await api.unsendPreparationBySource({
        billingPeriodStart: queryFrom,
        sourceType: uniqueRows[0]?.sourceType ?? (isAds ? 'ads' : 'scheduled_flight'),
        ...(usageRowIds.length > 0 ? { usageRowIds } : { serialNos }),
      });
      const data = res.data;
      const failedSerials = new Set((data?.failed ?? []).map((f) => f.serialNo));
      const unsentSerials =
        data?.unsentSerialNos ??
        serialNos.filter((serial) => !failedSerials.has(serial));
      const unsentUsage =
        data?.unsentUsageRowIds ??
        usageRowIds.filter((id) => !failedSerials.has(id));
      markRowsUnsentLocally({
        serialNos: unsentSerials,
        usageRowIds: unsentUsage,
      });
      setUnsendMsg(
        formatUnsendMessage(
          data?.unsent ?? 0,
          data?.failed ?? [],
          data?.requested ?? (usageRowIds.length || serialNos.length),
        ),
      );
      setSelected(new Set());
    } catch (e) {
      setUnsendMsg(e instanceof Error ? e.message : 'Unsend failed');
    } finally {
      setUnsending(false);
    }
  };

  const unsendSelectedFromPreparation = () => {
    const selectedRows = isAds
      ? adsLinesForSelectedFlights((l) => Boolean(l.sentToPreparation))
      : rows.filter((r) => selected.has(rowKey(r)) && r.sentToPreparation);
    void unsendFromPreparation(selectedRows);
  };

  const unsendAllVisibleSentFromPreparation = () => {
    if (sentRows.length === 0) return;
    const ok = window.confirm(
      `Remove ${sentRows.length} sent flight${sentRows.length === 1 ? '' : 's'} from preparation? They can be sent again from this page.`,
    );
    if (!ok) return;
    // ADS: unsend every already-sent line across the visible flights.
    const rowsToUnsend = isAds
      ? adsLineRows.filter((l) => l.sentToPreparation)
      : sentRows;
    void unsendFromPreparation(rowsToUnsend);
  };

  const tableFilteredByStats =
    ((isScheduledFlights && statFilters.size > 0) ||
      (usesAdsEquipmentPalette(config.fetchMethod) &&
        (adsBriefFilters.size > 0 || adsErrorsOnly)) ||
      (usesRafEquipmentPalette(config.fetchMethod) && rafEquipmentFilters.size > 0)) &&
    sourceRows.length !== rows.length;

  const tableFilteredByColumns =
    hasColumnFilters &&
    (isScheduledFlights
      ? flightDomFilteredRows.length !== sourceRows.length
      : isAds
        ? adsGroupedRowsBeforeColumnFilter.length !== rows.length
        : isRaf
          ? rafRowsBeforeColumnFilter.length !== rows.length
          : false);

  const supportsUnsend = isScheduledFlights || isAds || isRaf || isMaas;
  const supportsSendToPreparation = true;

  const handleExportAdsExcel = async () => {
    if (!isAds || rows.length === 0) return;
    setExportingExcel(true);
    setExportExcelMsg('');
    try {
      await exportAdsFlightsToExcel({
        rows,
        adsLinesByFlightKey,
        adsBriefFilters,
        flightKeyForRow: rowKey,
        from: queryFrom,
        to: queryTo,
        customerCode: queryCustomerCode,
      });
      setExportExcelMsg(
        `Exported ${rows.length} flight${rows.length === 1 ? '' : 's'} to Excel.`,
      );
    } catch (e) {
      setExportExcelMsg(
        e instanceof Error ? e.message : 'Excel export failed',
      );
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <div className="flex min-w-0 w-full max-w-full flex-col">
      <BillingPageHeader
        title={config.title}
        description={config.description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {supportsUnsend && sentRows.length > 0 ? (
              <button
                type="button"
                disabled={unsending || ingesting}
                onClick={unsendAllVisibleSentFromPreparation}
                className="rounded-lg border border-amber-600 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-40"
              >
                {unsending ? 'Unsending…' : `Unsend all sent (${sentRows.length})`}
              </button>
            ) : null}
            {supportsUnsend && selectedSentCount > 0 ? (
              <button
                type="button"
                disabled={unsending || ingesting}
                onClick={unsendSelectedFromPreparation}
                className="rounded-lg border border-amber-600 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-40"
              >
                {unsending ? 'Unsending…' : `Unsend selected (${selectedSentCount})`}
              </button>
            ) : null}
            {supportsSendToPreparation ? (
              <button
                type="button"
                disabled={selectedUnsentCount === 0 || ingesting || unsending}
                onClick={sendSelectedToPreparation}
                title={
                  selectedCount > 0 && selectedUnsentCount === 0
                    ? 'Selected rows are already in preparation — use Unsend selected first, or open Preparation'
                    : selectedUnsentCount > 0
                      ? `Send ${selectedUnsentCount} unsent row(s) to preparation`
                      : 'Select one or more unsent rows'
                }
                className="rounded-lg bg-[color:var(--billing-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)] disabled:opacity-40"
              >
                {ingesting
                  ? 'Sending…'
                  : selectedCount > 0 && selectedUnsentCount === 0
                    ? 'Send selected (0 — already in prep)'
                    : `Send selected (${selectedUnsentCount})`}
              </button>
            ) : null}
            {isAds && searchSubmitted ? (
              <button
                type="button"
                disabled={exportingExcel || loading || rows.length === 0}
                onClick={() => void handleExportAdsExcel()}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-40"
              >
                {exportingExcel ? 'Exporting…' : 'Export Excel'}
              </button>
            ) : null}
          </div>
        }
      />

      {exportExcelMsg ? (
        <div
          className="mb-4 rounded-lg border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] px-4 py-3 text-sm text-[color:var(--billing-heading)]"
          role="status"
        >
          {exportExcelMsg}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          From
          <input
            type="date"
            value={draftFrom}
            onChange={(e) => setDraftFrom(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          To
          <input
            type="date"
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          />
        </label>
        {config.fetchMethod === 'listScheduledFlights' ||
        config.fetchMethod === 'listAds' ? (
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Date basis
            <select
              value={draftDateBasis}
              onChange={(e) =>
                setDraftDateBasis(e.target.value as ScheduledFlightsDateBasis)
              }
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="schedule-date">
                Schedule date (STA){config.fetchMethod === 'listAds' ? ' — default' : ''}
              </option>
              <option value="atd-date">
                ATD date{config.fetchMethod === 'listScheduledFlights' ? ' — default' : ''}
              </option>
              <option value="exported-date">Exported date</option>
            </select>
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Customer
          {usesCustomerDropdown(config.fetchMethod) ? (
            <CustomerNameFilter
              value={customerCode}
              options={customerDropdownOptions}
              onChange={handleCustomerChange}
            />
          ) : (
            <input
              type="text"
              value={customerCode}
              onChange={(e) => setCustomerCode(e.target.value.toUpperCase())}
              placeholder="Optional"
              className="w-28 rounded-lg border border-gray-300 px-2 py-1.5 text-sm uppercase"
            />
          )}
        </label>
        {config.fetchMethod === 'listScheduledFlights' ||
        config.fetchMethod === 'listAds' ||
        config.fetchMethod === 'listMaas' ? (
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Dom / Int
            <select
              value={domIntFilter}
              onChange={(e) => {
                setDomIntFilter(e.target.value as ScheduledFlightsDomIntFilter);
                setSelected(new Set());
              }}
              className="min-w-[8rem] rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              aria-label="Filter by domestic or international"
            >
              <option value="">All</option>
              <option value="domestic">Domestic</option>
              <option value="international">International</option>
            </select>
          </label>
        ) : null}
        {config.fetchMethod === 'listScheduledFlights' ||
        config.fetchMethod === 'listAds' ||
        config.fetchMethod === 'listMaas' ? (
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Flight / serial
            <input
              type="text"
              value={flightNo}
              onChange={(e) => setFlightNo(e.target.value)}
              placeholder="e.g. 17604 or IX1254"
              className="min-w-[9rem] rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              aria-label="Filter by flight number or serial number"
            />
          </label>
        ) : null}
        {config.fetchMethod === 'listMaas' ? (
          <>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              Shift
              <select
                value={maasFilters.shift}
                onChange={(e) =>
                  setMaasFilters((prev) => ({
                    ...prev,
                    shift: e.target.value as MaasBillingFilters['shift'],
                  }))
                }
                className="min-w-[10rem] rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                aria-label="Filter by MAAS shift"
              >
                {MAAS_SHIFT_OPTIONS.map((opt) => (
                  <option key={opt.value || 'all-shift'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              Service type
              <select
                value={maasFilters.serviceType}
                onChange={(e) =>
                  setMaasFilters((prev) => ({
                    ...prev,
                    serviceType: e.target.value as MaasBillingFilters['serviceType'],
                  }))
                }
                className="min-w-[9rem] rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                aria-label="Filter by MAAS service type"
              >
                {MAAS_SERVICE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value || 'all-service'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              Staff type
              <select
                value={maasFilters.staffType}
                onChange={(e) =>
                  setMaasFilters((prev) => ({
                    ...prev,
                    staffType: e.target.value as MaasBillingFilters['staffType'],
                  }))
                }
                className="min-w-[8rem] rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                aria-label="Filter by MAAS staff type"
              >
                {MAAS_STAFF_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value || 'all-staff'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
              Glove service
              <select
                value={maasFilters.glove}
                onChange={(e) =>
                  setMaasFilters((prev) => ({
                    ...prev,
                    glove: e.target.value as MaasBillingFilters['glove'],
                  }))
                }
                className="min-w-[9rem] rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                aria-label="Filter by MAAS glove service"
              >
                {MAAS_GLOVE_OPTIONS.map((opt) => (
                  <option key={opt.value || 'all-glove'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <button
          type="button"
          disabled={loading}
          onClick={() => void applyDateSearch()}
          className="rounded-lg bg-[color:var(--billing-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)] disabled:cursor-wait disabled:opacity-70"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {requiresManualSearch(config.fetchMethod) && !searchSubmitted ? (
        <div className="mb-4 rounded-xl border border-dashed border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] px-4 py-3 text-sm text-[color:var(--billing-heading)]">
          Set the filters above, then click <span className="font-medium">Search</span> to fetch{' '}
          {config.fetchMethod === 'listAds'
            ? 'ADS usage'
            : config.fetchMethod === 'listEquipment'
              ? 'equipment'
              : config.fetchMethod === 'listManpower'
                ? 'manpower'
                : config.fetchMethod === 'listScheduledFlights'
                  ? 'BHS'
                  : config.fetchMethod === 'listRaf'
                    ? 'RAF'
                    : config.fetchMethod === 'listMaas'
                      ? 'MAAS escort'
                      : 'source'}{' '}
          rows.
          {config.fetchMethod === 'listAds' ? (
            <>
              {' '}
              Default is <span className="font-medium">Schedule date (STA)</span> for MIS /
              equipment-export parity. Use ATD date only when reconciling to actual departure
              month.
            </>
          ) : null}
          {config.fetchMethod === 'listRaf' ? (
            <>
              {' '}
              Use station <span className="font-medium">MAA</span> and range{' '}
              <span className="font-medium">2026-08-01</span>–
              <span className="font-medium">2026-08-31</span> for seeded RAF equipment.
            </>
          ) : null}
          {config.fetchMethod === 'listMaas' ? (
            <>
              {' '}
              MAAS bills meet-and-greet escorts (single or group, day/night shift, white/blue
              glove). Same period as ops MAAS reports.
            </>
          ) : null}
        </div>
      ) : null}

      {config.fetchMethod === 'listScheduledFlights' && scheduledFlightStats ? (
        <BillingScheduledFlightsStatsBar
          stats={scheduledFlightStats}
          selectedFilters={statFilters}
          onToggleFilter={toggleStatFilter}
          onClearFilters={clearStatFilters}
          loading={loading}
        />
      ) : null}

      {usesAdsEquipmentPalette(config.fetchMethod) && adsBriefStats && searchSubmitted ? (
        <BillingAdsBriefStatsBar
          stats={adsBriefStats}
          wchBreakdown={adsWchBreakdown}
          totalFlights={adsTotalFlights}
          selectedFilters={adsBriefFilters}
          onToggleFilter={toggleAdsBriefFilter}
          onToggleFilterGroup={toggleAdsBriefFilterGroup}
          onClearFilters={clearAdsBriefFilters}
          loading={loading}
          selectionTotals={adsBriefSelectionTotals}
        />
      ) : null}

      {usesRafEquipmentPalette(config.fetchMethod) &&
      rafEquipmentStats &&
      searchSubmitted ? (
        <BillingRafEquipmentPaletteBar
          stats={rafEquipmentStats}
          totalFlights={rafTotalFlights}
          selectedFilters={rafEquipmentFilters}
          onToggleFilter={toggleRafEquipmentFilter}
          onClearFilters={clearRafEquipmentFilters}
          loading={loading}
          selectionTotals={rafEquipmentSelectionTotals}
        />
      ) : null}

      {isMaas && maasStats && searchSubmitted ? (
        <BillingMaasStatsBar stats={maasStats} loading={loading} />
      ) : null}

      {summary && searchSubmitted ? (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-gray-100 px-3 py-1">
            {isAds
              ? `Flights: ${summary.total}`
              : isRaf
                ? `Usage lines: ${rows.length}`
                : `Total: ${summary.total}`}
          </span>
          {isAds && 'usageLines' in summary && typeof summary.usageLines === 'number' ? (
            <span
              className="rounded-full bg-gray-50 px-3 py-1 text-gray-600"
              title="Equipment / manpower usage lines across those flights"
            >
              Usage lines: {summary.usageLines}
            </span>
          ) : null}
          {isRaf && rafTotalFlights > 0 ? (
            <span
              className="rounded-full bg-gray-50 px-3 py-1 text-gray-600"
              title="Distinct RAF flights in the current airline / date filter"
            >
              Flights: {rafTotalFlights}
            </span>
          ) : null}
          {supportsUnsend && sentCount > 0 ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
              Sent: {sentCount}
            </span>
          ) : null}
          {supportsUnsend && unsentRows.length > 0 ? (
            <span className="rounded-full bg-[color:var(--billing-secondary-soft)] px-3 py-1 text-[color:var(--billing-secondary-hover)]">
              Unsent: {unsentRows.length}
            </span>
          ) : null}
          <span className="rounded-full bg-[color:var(--billing-accent-soft)] px-3 py-1 text-[color:var(--billing-accent-strong)]">
            Eligible: {summary.eligible}
          </span>
          {isAds ? (
            <button
              type="button"
              onClick={toggleAdsErrorsFilter}
              disabled={summary.errors === 0 && !adsErrorsOnly}
              aria-pressed={adsErrorsOnly}
              title={
                adsErrorsOnly
                  ? 'Showing flights with validation errors — click to clear'
                  : summary.errors === 0
                    ? 'No validation errors in current results'
                    : 'Show only flights with validation errors'
              }
              className={`rounded-full px-3 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-50 ${
                adsErrorsOnly
                  ? 'bg-red-600 text-white ring-2 ring-red-300 ring-offset-1'
                  : 'bg-red-50 text-red-800 hover:bg-red-100'
              }`}
            >
              Errors: {summary.errors}
            </button>
          ) : (
            <span className="rounded-full bg-red-50 px-3 py-1 text-red-800">
              Errors: {summary.errors}
            </span>
          )}
          <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-800">
            Ready: {summary.ready}
          </span>
        </div>
      ) : null}

      {isAds && adsErrorsOnly ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          Errors filter active — showing {rows.length} flight
          {rows.length === 1 ? '' : 's'} with validation errors.
          <button
            type="button"
            onClick={clearAdsErrorsFilter}
            className="ml-2 font-medium text-red-800 underline hover:text-red-950"
          >
            Clear errors filter
          </button>
        </p>
      ) : null}

      {tableFilteredByColumns ? (
        <p className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          Column filters are active — showing{' '}
          {isAds || isRaf ? rows.length : sourceRows.length} of{' '}
          {isAds
            ? adsGroupedRowsBeforeColumnFilter.length
            : isRaf
              ? rafRowsBeforeColumnFilter.length
              : flightDomFilteredRows.length}{' '}
          loaded {isRaf ? 'usage line' : 'flight'}
          {(isAds
            ? adsGroupedRowsBeforeColumnFilter.length
            : isRaf
              ? rafRowsBeforeColumnFilter.length
              : flightDomFilteredRows.length) === 1
            ? ''
            : 's'}
          .
          <button
            type="button"
            onClick={clearColumnFilters}
            className="ml-2 font-medium text-[color:var(--billing-info)] underline hover:text-sky-950"
          >
            Clear column filters
          </button>
        </p>
      ) : null}

      {tableFilteredByStats ? (
        <p className="mb-3 text-xs text-amber-800 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          {isRaf
            ? `Equipment No palette filter active — showing ${rows.length} usage line${
                rows.length === 1 ? '' : 's'
              } (seeded Chennai codes: GPU-140KV, GPU-NB, PBNB, ISTNB, RC, WC, EBT, UH).`
            : `Category filters are active — Total and selection apply to the ${rows.length} visible flight${
                rows.length === 1 ? '' : 's'
              } in the table${supportsUnsend ? ` (${unsentRows.length} unsent)` : ''}.`}
        </p>
      ) : null}

      {ingestMsg ? (
        <div className="mb-4 rounded-lg border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] px-4 py-3 text-sm text-[color:var(--billing-heading)]">
          <p>{ingestMsg}</p>
          {prepAfterIngestHref ? (
            <p className="mt-2">
              <Link
                href={prepAfterIngestHref}
                className="font-semibold text-[color:var(--billing-accent-strong)] underline hover:text-[color:var(--billing-heading)]"
              >
                Open preparation
              </Link>
              <span className="text-[color:var(--billing-accent-strong)]/80">
                {' '}
                with this period — matched flights show under Pending, not Eligible.
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      {unsendMsg ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {unsendMsg}
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {requiresManualSearch(config.fetchMethod) && !searchSubmitted ? null : (
      <BillingDataTable
        loading={loading}
        rows={rows}
        getRowKey={rowKey}
        getRowClassName={
          supportsUnsend
            ? (r) => (r.sentToPreparation ? 'bg-slate-50/80 text-gray-500' : undefined)
            : undefined
        }
        emptyMessage={
          loading
            ? isAds
              ? 'Loading ADS flights…'
              : 'Loading…'
            : error
              ? 'Could not load this period. Use Search to retry.'
              : statFilters.size > 0 || hasColumnFilters
                ? 'No flights match the selected filters'
                : 'No operational rows in this period'
        }
        footer={
          supportsUnsend && rows.length > 0 ? (
            <span>
              {rows.length} flight
              {rows.length === 1 ? '' : 's'} in table
              {sentCount > 0 ? ` — ${unsentRows.length} unsent, ${sentCount} sent` : ''}
            </span>
          ) : rows.length > 0 ? (
            <span>
              {rows.length} flight
              {rows.length === 1 ? '' : 's'} in table
              {supportsUnsend && sentCount > 0
                ? ` — ${unsentRows.length} unsent, ${sentCount} sent`
                : ''}
            </span>
          ) : undefined
        }
        columns={[
          ...(supportsSendToPreparation || supportsUnsend
            ? [
                {
                  key: 'select',
                  header: (
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el: HTMLInputElement | null) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleSelectAll}
                      disabled={rows.length === 0}
                      aria-label="Select all listed flights"
                    />
                  ),
                  className: isRaf ? 'w-10 text-center' : 'w-10',
                  render: (r: BillingSourceRow) => {
                    const key = rowKey(r);
                    const sent = Boolean(r.sentToPreparation);
                    return (
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => toggleRow(key)}
                        aria-label={
                          sent
                            ? 'Select sent flight to unsend from preparation'
                            : 'Select row to send to preparation'
                        }
                      />
                    );
                  },
                },
              ]
            : []),
          ...(supportsUnsend
            ? [
                {
                  key: 'status',
                  header:
                    isAds || isRaf ? (
                    <BillingTableHeaderFilter
                      label="Prep"
                      value={columnFilters.prep}
                      onChange={(value) => setColumnFilter('prep', value)}
                      options={columnFilterOptions.prep}
                      disabled={loading}
                    />
                  ) : (
                    'Prep'
                  ),
                  className: isRaf ? 'w-20 text-center' : 'w-20',
                  render: (r: BillingSourceRow) =>
                    r.sentToPreparation ? (
                      <span className="inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                        Sent
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    ),
                },
              ]
            : []),
          {
            key: 'serial',
            header:
              isAds || isRaf ? (
              <BillingTableHeaderFilter
                label="Serial / ID"
                value={columnFilters.serial}
                onChange={(value) => setColumnFilter('serial', value)}
                options={columnFilterOptions.serial}
                disabled={loading}
              />
            ) : (
              'Serial / ID'
            ),
            className: isRaf ? 'text-center' : undefined,
            render: (r) => {
              const serial = String(r.sourceRef.serialNo ?? '').trim();
              const label = serial || r.sourceRef.usageRowId || '—';
              if (!serial) return label;
              const href = isRaf
                ? buildRafFormsHrefFromBillingSerial(serial, {
                    fromYmd: queryFrom,
                    toYmd: queryTo,
                    returnTo: sourcePageReturnPath(config.fetchMethod),
                    snap: r.operationalData,
                  })
                : buildScheduledAirlinesHrefFromBillingSerial(serial, {
                    fromYmd: queryFrom,
                    toYmd: queryTo,
                    returnTo: sourcePageReturnPath(config.fetchMethod),
                    snap: r.operationalData,
                  });
              return (
                <Link
                  href={href}
                  scroll={false}
                  className="font-medium text-[color:var(--billing-accent-strong)] underline decoration-[color:var(--billing-accent)]/40 underline-offset-2 hover:text-[color:var(--billing-heading)]"
                  title={
                    isRaf
                      ? 'Open this flight on Ramp Assistance Forms'
                      : 'Open this flight on Scheduled Airlines'
                  }
                >
                  {label}
                </Link>
              );
            },
          },
          ...(isRaf
            ? []
            : [
                {
                  key: 'flight',
                  header: isAds ? (
                    <BillingTableHeaderFilter
                      label="Flight"
                      value={columnFilters.flight}
                      onChange={(value) => setColumnFilter('flight', value)}
                      options={columnFilterOptions.flight}
                      disabled={loading}
                    />
                  ) : (
                    'Flight'
                  ),
                  className: 'min-w-[10rem]',
                  render: (r: BillingSourceRow) => {
                    const raw =
                      r.operationalData.flightNoEquipmentNo ??
                      r.operationalData.flightNo ??
                      r.sourceRef.flightNo ??
                      '';
                    return stripCancelledFlightPrefix(raw) || String(raw || '—');
                  },
                },
              ]),
          ...(isMaas
            ? [
                {
                  key: 'maasDate',
                  header: 'Date',
                  className: 'min-w-[7rem]',
                  render: (r: BillingSourceRow) => maasServiceDateLabel(r),
                },
                {
                  key: 'maasShift',
                  header: 'Shift',
                  className: 'min-w-[8rem]',
                  render: (r: BillingSourceRow) => maasShiftLabel(r) || '—',
                },
                {
                  key: 'maasAirline',
                  header: 'Airline',
                  className: 'min-w-[8rem]',
                  render: (r: BillingSourceRow) => maasAirlineLabel(r),
                },
                {
                  key: 'maasPassenger',
                  header: 'Passenger',
                  className: 'min-w-[8rem]',
                  render: (r: BillingSourceRow) => maasPassengerLabel(r),
                },
                {
                  key: 'maasPnr',
                  header: 'PNR',
                  className: 'min-w-[6rem]',
                  render: (r: BillingSourceRow) => maasPnrLabel(r),
                },
                {
                  key: 'maasPax',
                  header: 'Pax',
                  className: 'min-w-[4rem] text-center',
                  render: (r: BillingSourceRow) => (
                    <span className="tabular-nums">{maasPaxLabel(r)}</span>
                  ),
                },
                {
                  key: 'maasServiceType',
                  header: 'Service',
                  className: 'min-w-[5rem]',
                  render: (r: BillingSourceRow) => maasServiceTypeLabel(r),
                },
                {
                  key: 'maasGlove',
                  header: 'Glove',
                  className: 'min-w-[6rem]',
                  render: (r: BillingSourceRow) => maasGloveLabel(r),
                },
                {
                  key: 'maasStaff',
                  header: 'Staff',
                  className: 'min-w-[10rem]',
                  render: (r: BillingSourceRow) => maasStaffLabel(r),
                },
              ]
            : []),
          ...(isRaf
            ? [
                {
                  key: 'aircraftType',
                  header: (
                    <BillingTableHeaderFilter
                      label="Aircraft type"
                      value={columnFilters.aircraftType}
                      onChange={(value) => setColumnFilter('aircraftType', value)}
                      options={columnFilterOptions.aircraftType}
                      disabled={loading}
                    />
                  ),
                  className: 'min-w-[6rem] text-center',
                  render: (r: BillingSourceRow) => scheduledFlightAircraftType(r),
                },
                {
                  key: 'particular',
                  header: (
                    <BillingTableHeaderFilter
                      label="Particular"
                      value={columnFilters.particular}
                      onChange={(value) => setColumnFilter('particular', value)}
                      options={columnFilterOptions.particular}
                      disabled={loading}
                    />
                  ),
                  className: 'min-w-[12rem] text-center',
                  render: (r: BillingSourceRow) => rafParticularLabel(r),
                },
                {
                  key: 'equipmentCode',
                  header: (
                    <BillingTableHeaderFilter
                      label="Eq. code"
                      value={columnFilters.equipmentCode}
                      onChange={(value) => setColumnFilter('equipmentCode', value)}
                      options={columnFilterOptions.equipmentCode}
                      disabled={loading}
                    />
                  ),
                  className: 'min-w-[5.5rem] text-center',
                  render: (r: BillingSourceRow) => rafEquipmentCodeLabel(r),
                },
                {
                  key: 'qty',
                  header: (
                    <BillingTableHeaderFilter
                      label="Qty"
                      value={columnFilters.qty}
                      onChange={(value) => setColumnFilter('qty', value)}
                      options={columnFilterOptions.qty}
                      disabled={loading}
                    />
                  ),
                  className: 'min-w-[4rem] text-center',
                  render: (r: BillingSourceRow) => (
                    <span className="tabular-nums">{rafQtyLabel(r)}</span>
                  ),
                },
                {
                  key: 'customer',
                  header: (
                    <BillingTableHeaderFilter
                      label="Customer"
                      value={columnFilters.customer}
                      onChange={(value) => setColumnFilter('customer', value)}
                      options={columnFilterOptions.customer}
                      disabled={loading}
                    />
                  ),
                  className: 'min-w-[10rem] text-center',
                  render: (r: BillingSourceRow) => formatCustomer(r),
                },
                {
                  key: 'rateAmount',
                  header: (
                    <BillingTableHeaderFilter
                      label="Unit price"
                      value={columnFilters.unitPrice}
                      onChange={(value) => setColumnFilter('unitPrice', value)}
                      options={columnFilterOptions.unitPrice}
                      disabled={loading}
                    />
                  ),
                  className: 'min-w-[6rem] text-center',
                  render: (r: BillingSourceRow) => {
                    const label = rafUnitPriceLabel(r);
                    if (label === '—') {
                      return <span className="text-gray-400">—</span>;
                    }
                    return <span className="tabular-nums">{label}</span>;
                  },
                },
              ]
            : []),
          ...(isAds
            ? [
                {
                  key: 'aircraftType',
                  header: (
                    <BillingTableHeaderFilter
                      label="Aircraft type"
                      value={columnFilters.aircraftType}
                      onChange={(value) => setColumnFilter('aircraftType', value)}
                      options={columnFilterOptions.aircraftType}
                      disabled={loading}
                    />
                  ),
                  className: 'min-w-[6rem]',
                  render: (r: BillingSourceRow) => scheduledFlightAircraftType(r),
                },
                {
                  key: 'aircraftBody',
                  header: (
                    <BillingTableHeaderFilter
                      label="Aircraft body"
                      value={columnFilters.aircraftBody}
                      onChange={(value) => setColumnFilter('aircraftBody', value)}
                      options={columnFilterOptions.aircraftBody}
                      disabled={loading}
                    />
                  ),
                  className: 'min-w-[5rem]',
                  render: (r: BillingSourceRow) => scheduledFlightAircraftBody(r),
                },
                {
                  key: 'engagementTime',
                  header: (
                    <BillingTableHeaderFilter
                      label="Equipment engagement"
                      value={columnFilters.engagement}
                      onChange={(value) => setColumnFilter('engagement', value)}
                      options={columnFilterOptions.engagement}
                      disabled={loading}
                    />
                  ),
                  className: 'min-w-[10rem] max-w-[18rem]',
                  render: (r: BillingSourceRow) => {
                    if (adsBriefFilters.size === 0) {
                      return (
                        <span className="text-xs text-gray-400">
                          Check palette equipment
                        </span>
                      );
                    }

                    const flightKey = rowKey(r);
                    const lines = adsLinesByFlightKey.get(flightKey) ?? [];
                    const scoped = filterBillingRowsByAdsBriefs(
                      lines,
                      adsBriefFilters,
                    );
                    const entries = formatAdsFlightEngagementEntries(scoped);
                    if (entries.length === 0) {
                      return <span className="text-xs text-gray-400">—</span>;
                    }

                    return (
                      <div className="flex max-w-[18rem] flex-col gap-0.5">
                        {entries.map((entry, index) => (
                          <div
                            key={`${entry.label}-${entry.value}-${index}`}
                            className="text-[11px] leading-snug text-gray-700"
                          >
                            <span className="font-medium text-gray-900">
                              {entry.label}
                            </span>
                            <span className="text-gray-400"> · </span>
                            <span
                              className={`tabular-nums ${
                                entry.isCount
                                  ? 'font-semibold text-gray-900'
                                  : 'text-[color:var(--billing-accent-strong)]'
                              }`}
                            >
                              {entry.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  },
                },
                {
                  key: 'bhsIncluded',
                  header: (
                    <BillingTableHeaderFilter
                      label="Included in BHS"
                      value={columnFilters.bhsIncluded}
                      onChange={(value) => setColumnFilter('bhsIncluded', value)}
                      options={columnFilterOptions.bhsIncluded}
                      disabled={loading}
                    />
                  ),
                  className: 'min-w-[9rem] max-w-[16rem]',
                  render: (r: BillingSourceRow) => {
                    if (adsBriefFilters.size === 0) {
                      return (
                        <span className="text-xs text-gray-400">
                          Check palette equipment
                        </span>
                      );
                    }

                    const flightKey = rowKey(r);
                    const lines = adsLinesByFlightKey.get(flightKey) ?? [];
                    const scoped = filterBillingRowsByAdsBriefs(
                      lines,
                      adsBriefFilters,
                    );
                    const entries = formatAdsFlightBhsIncludedEntries(scoped);
                    if (entries.length === 0) {
                      return <span className="text-xs text-gray-400">—</span>;
                    }

                    return (
                      <div className="flex max-w-[16rem] flex-col gap-0.5">
                        {entries.map((entry, index) => (
                          <div
                            key={`${entry.label}-${entry.count}-${index}`}
                            className="text-[11px] leading-snug text-gray-700"
                          >
                            <span className="font-medium text-gray-900">
                              {entry.label}
                            </span>
                            <span className="text-gray-400"> · </span>
                            <span className="font-semibold tabular-nums text-[color:var(--billing-primary)]">
                              {entry.count}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  },
                },
                {
                  key: 'charged',
                  header: (
                    <BillingTableHeaderFilter
                      label="Charged"
                      value={columnFilters.charged}
                      onChange={(value) => setColumnFilter('charged', value)}
                      options={columnFilterOptions.charged}
                      disabled={loading}
                    />
                  ),
                  className: 'min-w-[8rem] max-w-[16rem]',
                  render: (r: BillingSourceRow) => {
                    if (adsBriefFilters.size === 0) {
                      return (
                        <span className="text-xs text-gray-400">
                          Check palette equipment
                        </span>
                      );
                    }

                    const flightKey = rowKey(r);
                    const lines = adsLinesByFlightKey.get(flightKey) ?? [];
                    const scoped = filterBillingRowsByAdsBriefs(
                      lines,
                      adsBriefFilters,
                    );
                    const entries = formatAdsFlightChargedEntries(scoped);
                    if (entries.length === 0) {
                      return <span className="text-xs text-gray-400">—</span>;
                    }

                    return (
                      <div className="flex max-w-[16rem] flex-col gap-0.5">
                        {entries.map((entry, index) => (
                          <div
                            key={`${entry.label}-${entry.count}-${index}`}
                            className="text-[11px] leading-snug text-gray-700"
                          >
                            <span className="font-medium text-gray-900">
                              {entry.label}
                            </span>
                            <span className="text-gray-400"> · </span>
                            <span className="font-semibold tabular-nums text-[color:var(--billing-accent-strong)]">
                              {entry.count}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  },
                },
              ]
            : []),
          ...(isScheduledFlights
            ? [
                {
                  key: 'category',
                  header: (
                    <BillingTableHeaderFilter
                      label="Category"
                      value={columnFilters.category}
                      onChange={(value) => setColumnFilter('category', value)}
                      options={columnFilterOptions.category}
                      disabled={loading}
                    />
                  ),
                  className: 'min-w-[7rem]',
                  render: (r: BillingSourceRow) => scheduledFlightCategory(r),
                },
                {
                  key: 'typeOfHandling',
                  header: (
                    <BillingTableHeaderFilter
                      label="Type of handling"
                      value={columnFilters.typeOfHandling}
                      onChange={(value) => setColumnFilter('typeOfHandling', value)}
                      options={columnFilterOptions.typeOfHandling}
                      disabled={loading}
                    />
                  ),
                  className: 'min-w-[8rem]',
                  render: (r: BillingSourceRow) => scheduledFlightTypeOfHandling(r),
                },
                {
                  key: 'paxFreight',
                  header: (
                    <BillingTableHeaderFilter
                      label="Pax / Freight"
                      value={columnFilters.paxFreight}
                      onChange={(value) => setColumnFilter('paxFreight', value)}
                      options={columnFilterOptions.paxFreight}
                      disabled={loading}
                    />
                  ),
                  className: 'min-w-[6.5rem]',
                  render: (r: BillingSourceRow) => scheduledFlightPaxFreight(r),
                },
                {
                  key: 'ops',
                  header: (
                    <BillingTableHeaderFilter
                      label="Ops"
                      value={columnFilters.ops}
                      onChange={(value) => setColumnFilter('ops', value)}
                      options={columnFilterOptions.ops}
                      disabled={loading}
                    />
                  ),
                  className: 'min-w-[5.5rem]',
                  render: (r: BillingSourceRow) => scheduledFlightOps(r),
                },
                {
                  key: 'aircraftType',
                  header: (
                    <BillingTableHeaderFilter
                      label="Aircraft type"
                      value={columnFilters.aircraftType}
                      onChange={(value) => setColumnFilter('aircraftType', value)}
                      options={columnFilterOptions.aircraftType}
                      disabled={loading}
                    />
                  ),
                  className: 'min-w-[6rem]',
                  render: (r: BillingSourceRow) => scheduledFlightAircraftType(r),
                },
                {
                  key: 'aircraftBody',
                  header: (
                    <BillingTableHeaderFilter
                      label="Aircraft body"
                      value={columnFilters.aircraftBody}
                      onChange={(value) => setColumnFilter('aircraftBody', value)}
                      options={columnFilterOptions.aircraftBody}
                      disabled={loading}
                    />
                  ),
                  className: 'min-w-[6.5rem]',
                  render: (r: BillingSourceRow) => scheduledFlightAircraftBody(r),
                },
                {
                  key: 'customer',
                  header: (
                    <BillingTableHeaderFilter
                      label="Customer"
                      value={columnFilters.customer}
                      onChange={(value) => setColumnFilter('customer', value)}
                      options={columnFilterOptions.customer}
                      disabled={loading}
                    />
                  ),
                  className: 'min-w-[10rem]',
                  render: (r: BillingSourceRow) => formatCustomer(r),
                },
              ]
            : []),
          {
            key: 'eligible',
            header:
              isScheduledFlights || isAds || isRaf ? (
              <BillingTableHeaderFilter
                label="Eligible"
                value={columnFilters.eligible}
                onChange={(value) => setColumnFilter('eligible', value)}
                options={columnFilterOptions.eligible}
                disabled={loading}
              />
            ) : (
              'Eligible'
            ),
            className: isRaf ? 'min-w-[6rem] text-center' : 'min-w-[6.5rem]',
            render: (r) => (
              <span
                className={
                  r.billingEligibility.eligible ? 'text-[color:var(--billing-accent-strong)]' : 'text-red-600'
                }
              >
                {scheduledFlightEligibleLabel(r)}
              </span>
            ),
          },
          ...(isRaf
            ? []
            : [
                {
                  key: 'contract',
                  header: isAds ? (
                    <BillingTableHeaderFilter
                      label="Contract"
                      value={columnFilters.contract}
                      onChange={(value: string) => setColumnFilter('contract', value)}
                      options={columnFilterOptions.contract}
                      disabled={loading}
                    />
                  ) : (
                    'Contract'
                  ),
                  className: 'min-w-[6.5rem] text-center',
                  render: (r: BillingSourceRow) => (
                    <MatchIndicator matched={r.contractMatch.matched} label="Contract" />
                  ),
                },
              ]),
          {
            key: 'rate',
            header:
              isAds || isRaf ? (
              <BillingTableHeaderFilter
                label="Rate"
                value={columnFilters.rate}
                onChange={(value) => setColumnFilter('rate', value)}
                options={columnFilterOptions.rate}
                disabled={loading}
              />
            ) : (
              'Rate'
            ),
            className: isRaf ? 'min-w-[5.5rem] text-center' : 'min-w-[5.5rem] text-center',
            render: (r) => <MatchIndicator matched={r.rateMatch.matched} label="Rate" />,
          },
          {
            key: 'validation',
            header:
              isAds || isRaf ? (
              <BillingTableHeaderFilter
                label="Validation"
                value={columnFilters.validation}
                onChange={(value) => setColumnFilter('validation', value)}
                options={columnFilterOptions.validation}
                disabled={loading}
              />
            ) : (
              'Validation'
            ),
            className: isRaf ? 'min-w-[7rem] text-center' : 'min-w-[7.5rem] text-center',
            render: (r) => (
              <ValidationIndicator
                passed={r.validationStatus.passed}
                errorCount={r.validationStatus.errors.filter((e) => !e.passed).length}
              />
            ),
          },
        ]}
      />
      )}
    </div>
  );
}
