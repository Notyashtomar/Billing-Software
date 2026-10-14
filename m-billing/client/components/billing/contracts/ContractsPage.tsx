'use client';

import { useCallback, useEffect, useMemo, useState, useRef, type ReactNode } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Download,
  Eye,
  FileSpreadsheet,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { BillingDataTable } from '../BillingDataTable';
import { MasterSectionTabs } from '../MasterSectionTabs';
import { StatusBadge } from '../StatusBadge';
import { billingUi } from '../billingUi';
import { ContractFormDialog } from './ContractFormDialog';
import { ContractExcelImportDialog } from './ContractExcelImportDialog';
import { ContractExcelExportDialog } from './ContractExcelExportDialog';
import { ContractHandlingPreviewDialog } from './ContractHandlingPreviewDialog';
import { RateCardFormDialog } from './RateCardFormDialog';
import { AdsRateCardDualCountPanel } from './AdsRateCardDualCountPanel';
import { ContractDeleteDialog, type ContractDeleteMode } from './ContractDeleteDialog';
import { RateCardDeleteDialog, type RateCardDeleteMode } from './RateCardDeleteDialog';
import {
  exportFilledContractPdf,
  selectBhsPackageCardsForContract,
} from './exportContractPdf';
import {
  PriceCardHandlingSection,
  type PriceCardNavLevel,
} from './PriceCardHandlingSection';
import {
  ContractAlert,
  ContractEmptyState,
  ContractHero,
  ContractLoadingBlock,
  contractUi,
} from './ContractUi';
import { sanitizeContractAircraftTypes } from './sanitizeContractAircraftTypes';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingContract, BillingCustomer, BillingPriceCardAirline, BillingRateCard, BillingServiceCatalogItem } from '@/lib/billing-shared/types';
import {
  buildServiceCategoryMap,
  countRateCardsForPriceCardEntry,
  filterRateCardsForHandling,
  filterRateCardsForPriceCardAirlineRow,
  findPriceCardEntry,
  groupBhsPriceCardAirlines,
  listPriceCardEntriesForCustomer,
  type BhsAirlineCardGroup,
} from '@/lib/billing-shared/price-card-handling';
import { formatBillingScope } from '@/lib/billing-shared/rate-card-billing-scope';
import {
  CONTRACT_CATEGORIES,
  CONTRACT_CONDITIONAL_CHARGE_SCENARIOS,
  CONTRACT_CONCESSION_SCENARIO_LABELS,
  PRICE_CARD_AIRLINE_CATEGORIES,
  PRICE_CARD_HANDLING_TYPES,
  formatContractCategory,
  formatPriceCardAirlineCategory,
  isOpenEndedBillingDate,
  type PriceCardAirlineCategory,
  type PriceCardHandlingType,
} from '@/lib/billing-shared/enums';
import { defaultContractForCustomer } from '@/lib/billing-shared/price-card-airline-rows';
import { formatConditionalChargeCell } from '@/lib/billing-shared/contract-concessions';
import { formatBillingDate, formatBillingDateRange } from '@/lib/billing-shared/billing-date-format';
import { cn } from '@/lib/utils';

type Props = { api: BillingApi };

type EndingTone = 'ok' | 'warn' | 'danger' | 'muted';

function parseContractEndDate(priceValidTo: string): Date | null {
  const raw = String(priceValidTo ?? '').trim();
  if (!raw) return null;
  const ymd = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  // End-of-day local so “ends today” matches ops calendar date.
  return new Date(`${ymd}T23:59:59`);
}

function formatContractEndStamp(priceValidTo: string): string {
  const raw = String(priceValidTo ?? '').trim();
  if (!raw) return '—';
  const datePart = formatBillingDate(raw, '');
  if (!datePart) return '—';
  const timePart = raw.length > 10 ? raw.slice(11, 19).replace('Z', '').trim() : '';
  if (timePart && timePart !== '00:00:00') {
    return `${datePart} ${timePart.slice(0, 5)}`;
  }
  return datePart;
}

function getContractEndingInfo(priceValidTo: string): {
  daysLabel: string;
  endStamp: string;
  tone: EndingTone;
  daysLeft: number | null;
} {
  if (isOpenEndedBillingDate(priceValidTo)) {
    return { daysLabel: 'Open ended', endStamp: 'Open', tone: 'muted', daysLeft: null };
  }
  const endStamp = formatContractEndStamp(priceValidTo);
  const end = parseContractEndDate(priceValidTo);
  if (!end) {
    return { daysLabel: '—', endStamp, tone: 'muted', daysLeft: null };
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const daysLeft = Math.round((endDay.getTime() - startOfToday.getTime()) / 86_400_000);

  if (daysLeft < 0) {
    const ago = Math.abs(daysLeft);
    return {
      daysLabel: ago === 1 ? 'Expired 1 day ago' : `Expired ${ago} days ago`,
      endStamp,
      tone: 'danger',
      daysLeft,
    };
  }
  if (daysLeft === 0) {
    return { daysLabel: 'Ends today', endStamp, tone: 'warn', daysLeft };
  }
  if (daysLeft === 1) {
    return { daysLabel: '1 day left', endStamp, tone: 'warn', daysLeft };
  }
  return {
    daysLabel: `${daysLeft} days left`,
    endStamp,
    tone: daysLeft <= 30 ? 'warn' : 'ok',
    daysLeft,
  };
}

function formatAircraftTypesList(aircraftTypes?: string[]): string[] {
  return sanitizeContractAircraftTypes(aircraftTypes ?? []);
}

/** Match scheduled-flight heuristic: freighter codes typically include F (e.g. A330F). */
function isFreighterAircraftType(aircraftType: string): boolean {
  const ac = aircraftType.trim().toUpperCase();
  if (!ac) return false;
  if (/(FREIGHT|CARGO|CARGOAC)/.test(ac)) return true;
  return /F/.test(ac);
}

function resolveContractPaxFreight(aircraftTypes?: string[]): string | null {
  const list = formatAircraftTypesList(aircraftTypes);
  if (list.length === 0) return null;
  let freight = 0;
  let passenger = 0;
  for (const ac of list) {
    if (isFreighterAircraftType(ac)) freight += 1;
    else passenger += 1;
  }
  if (freight > 0 && passenger > 0) return 'Passenger + Freighter';
  if (freight > 0) return 'Freighter';
  return 'Passenger';
}

function isContractExpiredRow(contract: BillingContract): boolean {
  const daysLeft = getContractEndingInfo(contract.priceValidTo).daysLeft;
  return daysLeft != null && daysLeft < 0;
}

/** Status chip follows the validity dates. A stored "expired" flag does not override days still left. */
function displayContractStatus(contract: BillingContract): string {
  const daysLeft = getContractEndingInfo(contract.priceValidTo).daysLeft;
  if (daysLeft != null && daysLeft < 0) return 'expired';
  if (contract.status === 'expired') return 'active';
  return contract.status;
}

function contractIdentityIsFreighter(
  contract: Pick<BillingContract, 'contractNumber' | 'customerCode'>,
  customerName?: string,
): boolean {
  const blob = `${contract.contractNumber} ${contract.customerCode} ${customerName ?? ''}`.toUpperCase();
  return /\b(CARGO|FREIGHT|FREIGHTER)\b/.test(blob);
}

function ContractCategoryCell({
  category,
  aircraftTypes,
  forceFreighter = false,
}: {
  category: BillingContract['category'] | string;
  aircraftTypes?: string[];
  forceFreighter?: boolean;
}) {
  const paxFreight = forceFreighter ? 'Freighter' : resolveContractPaxFreight(aircraftTypes);
  return (
    <div className={contractUi.categoryCell}>
      <span className={contractUi.pill}>{formatContractCategory(category)}</span>
      {paxFreight ? <span className={contractUi.pillMuted}>{paxFreight}</span> : null}
    </div>
  );
}

function ContractAircraftTypeCell({ aircraftTypes }: { aircraftTypes?: string[] }) {
  const list = formatAircraftTypesList(aircraftTypes);
  if (list.length === 0) {
    return <span className="text-sm text-slate-400">—</span>;
  }
  return (
    <div className={contractUi.aircraftCell}>
      <div className={contractUi.aircraftList} title={list.join(', ')}>
        {list.map((ac) => (
          <span key={ac} className={contractUi.aircraftChip}>
            {ac}
          </span>
        ))}
      </div>
    </div>
  );
}

function ContractValidityCell({
  priceValidFrom,
  priceValidTo,
}: {
  priceValidFrom: string;
  priceValidTo: string;
}) {
  const from = formatBillingDate(priceValidFrom);
  const info = getContractEndingInfo(priceValidTo);
  const toneClass =
    info.tone === 'warn'
      ? contractUi.endingWarn
      : info.tone === 'danger'
        ? contractUi.endingDanger
        : info.tone === 'muted'
          ? contractUi.endingMuted
          : 'text-[color:var(--billing-primary)]';

  return (
    <div className={contractUi.validityCell}>
      <p className={contractUi.validityRange}>
        <span>{from}</span>
        <span className={contractUi.validityRangeArrow} aria-hidden>
          →
        </span>
        <span>{info.endStamp}</span>
      </p>
      <p className={cn(contractUi.validityCountdown, toneClass)}>{info.daysLabel}</p>
    </div>
  );
}

const SGHA_TABLE_LABELS: Record<(typeof CONTRACT_CONDITIONAL_CHARGE_SCENARIOS)[number], string> = {
  divertedDom: 'Div. domestic',
  divertedInt: 'Div. international',
  returnToRamp: 'Return to ramp',
  originateTerminatePercent: 'Originate / terminate',
  cancellationWithinHoursPercent: 'Cancellation',
  technicalHandlingChargesPercent: 'Tech. handling',
  standbyChargesPercent: 'Standby',
  filoLifoChargesPercent: 'FILO / LIFO',
  filoChargesPercent: 'Ferry in / load out',
  lifoChargesPercent: 'Load in / ferry out',
  ronAdditionalPercent: 'RON +',
  lateArrivalAdditionalPercent: 'Late arrival +',
  extraGroundTimeAdditionalPercent: 'Ground time +',
  splitIntArrivalDomDeparturePercent: 'Int arr / Dom dep +',
  splitDomArrivalIntDeparturePercent: 'Dom arr / Int dep +',
};

/** Display labels only — stored values stay comprehensive / non_comprehensive. */
function coverageBadgeLabel(
  coverage: 'comprehensive' | 'non_comprehensive' | 'mixed',
  stationCode: string | undefined,
): string {
  const isDelhi = String(stationCode ?? '').trim().toUpperCase() === 'DEL';
  if (coverage === 'mixed') return 'Mixed';
  if (coverage === 'comprehensive') return isDelhi ? 'Inclusive' : 'Comprehensive';
  return isDelhi ? 'Exclusive' : 'Non-comprehensive';
}

function ContractCoverageBadge({ contract }: { contract: BillingContract }) {
  const coverage = contract.bhsConcessionCoverage;
  if (
    coverage !== 'comprehensive' &&
    coverage !== 'non_comprehensive' &&
    coverage !== 'mixed'
  ) {
    return null;
  }
  const label = coverageBadgeLabel(coverage, contract.stationCode);
  const tone =
    coverage === 'comprehensive'
      ? contractUi.coverageComprehensive
      : coverage === 'non_comprehensive'
        ? contractUi.coverageSeparate
        : contractUi.coverageMixed;
  const hint =
    contract.bhsConcessionNote ||
    (coverage === 'comprehensive'
      ? 'Concession is already inside the BHS package.'
      : coverage === 'non_comprehensive'
        ? 'Charge concession separately from the BHS package.'
        : 'Scheduled and non-scheduled flights treat concession differently.');
  return (
    <span className={cn(contractUi.coverageBadge, tone)} title={hint}>
      {label}
    </span>
  );
}

function ContractSghaCell({ contract }: { contract: BillingContract }) {
  const rows = CONTRACT_CONDITIONAL_CHARGE_SCENARIOS.map((key) => {
    const value = formatConditionalChargeCell(contract, key);
    if (value === '—') return null;

    let displayValue = value;
    if (
      key === 'cancellationWithinHoursPercent' &&
      contract.cancellationWithinHours != null &&
      Number.isFinite(contract.cancellationWithinHours)
    ) {
      displayValue = `${value} · ${contract.cancellationWithinHours}h`;
    }

    return {
      key,
      shortLabel: SGHA_TABLE_LABELS[key],
      fullLabel: CONTRACT_CONCESSION_SCENARIO_LABELS[key],
      value: displayValue,
    };
  }).filter((row): row is NonNullable<typeof row> => row != null);

  // Show cancel window alone when percent missing but hours exist.
  const cancelHoursOnly =
    rows.every((row) => row.key !== 'cancellationWithinHoursPercent') &&
    contract.cancellationWithinHours != null &&
    Number.isFinite(contract.cancellationWithinHours)
      ? `${contract.cancellationWithinHours}h`
      : null;

  if (rows.length === 0 && !cancelHoursOnly) {
    return <span className={contractUi.sghaEmpty}>—</span>;
  }

  return (
    <ul className={contractUi.sghaStack} aria-label="SGHA terms">
      {rows.map((row) => (
        <li key={row.key} className={contractUi.sghaRow} title={row.fullLabel}>
          <span className={contractUi.sghaLabel}>{row.shortLabel}</span>
          <span className={contractUi.sghaValue}>{row.value}</span>
        </li>
      ))}
      {cancelHoursOnly ? (
        <li className={contractUi.sghaRow} title="Cancellation within hours window">
          <span className={contractUi.sghaLabel}>Cancel window</span>
          <span className={contractUi.sghaValue}>{cancelHoursOnly}</span>
        </li>
      ) : null}
    </ul>
  );
}

type BulkDeleteResult = {
  deleted: number;
  failed: Array<{ id: string; message: string; label?: string }>;
  requested: number;
};

function reportBulkDelete(
  result: BulkDeleteResult,
  entityLabel: string,
  setSuccess: (msg: string) => void,
  setError: (msg: string) => void,
) {
  const { deleted, failed, requested } = result;
  if (failed.length === 0) {
    setSuccess(`Deleted ${deleted} ${entityLabel}${deleted === 1 ? '' : 's'}.`);
    return;
  }
  const skipped = failed
    .slice(0, 3)
    .map((f) => f.label ?? f.id)
    .join(', ');
  const more = failed.length > 3 ? ` +${failed.length - 3} more` : '';
  setSuccess(`Deleted ${deleted} of ${requested} ${entityLabel}${requested === 1 ? '' : 's'}. Skipped: ${skipped}${more}.`);
  setError(failed[0]?.message ?? `Some ${entityLabel}s could not be deleted.`);
}

function mergeRateCardList(
  list: BillingRateCard[],
  saved: BillingRateCard,
): BillingRateCard[] {
  const index = list.findIndex((row) => row._id === saved._id);
  if (index >= 0) {
    const next = [...list];
    next[index] = saved;
    return next;
  }
  return [saved, ...list];
}

export function ContractsPage({ api }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [rows, setRows] = useState<BillingContract[]>([]);
  const [customerNameByCode, setCustomerNameByCode] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<BillingContract | null>(null);
  const [focusCondition, setFocusCondition] = useState<string | null>(null);
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteRecord, setDeleteRecord] = useState<BillingContract | null>(null);
  const [deleteMode, setDeleteMode] = useState<ContractDeleteMode>('single');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [viewRecord, setViewRecord] = useState<BillingContract | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [listSearch, setListSearch] = useState('');
  const [airlineFilter, setAirlineFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [aircraftFilter, setAircraftFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fortnightFilter, setFortnightFilter] = useState('');
  const dialogOpen = createOpen || editRecord != null;
  const closeDialog = () => {
    setCreateOpen(false);
    setEditRecord(null);
    setFocusCondition(null);
    if (searchParams.get('contract')) {
      router.replace('/billing/contracts', { scroll: false });
    }
  };

  const airlineOptions = useMemo(() => {
    const codes = new Set(
      rows.map((row) => String(row.customerCode ?? '').trim().toUpperCase()).filter(Boolean),
    );
    return [...codes].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const categoryOptions = useMemo(() => {
    const fromRows = new Set(
      rows.map((row) => String(row.category ?? '').trim()).filter(Boolean),
    );
    for (const cat of CONTRACT_CATEGORIES) fromRows.add(cat);
    return [...fromRows].sort((a, b) =>
      formatContractCategory(a).localeCompare(formatContractCategory(b)),
    );
  }, [rows]);

  const aircraftOptions = useMemo(() => {
    const types = new Set<string>();
    for (const row of rows) {
      for (const ac of formatAircraftTypesList(row.aircraftTypes)) types.add(ac);
    }
    return [...types].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const hasActiveListFilters = Boolean(
    listSearch.trim() ||
      airlineFilter ||
      categoryFilter ||
      aircraftFilter ||
      statusFilter ||
      fortnightFilter,
  );

  const clearListFilters = () => {
    setListSearch('');
    setAirlineFilter('');
    setCategoryFilter('');
    setAircraftFilter('');
    setStatusFilter('');
    setFortnightFilter('');
  };

  const visibleContractRows = useMemo(() => {
    const query = listSearch.trim().toLowerCase();
    const airline = airlineFilter.trim().toUpperCase();
    const category = categoryFilter.trim();
    const aircraft = aircraftFilter.trim().toUpperCase();

    return rows.filter((row) => {
      if (airline && String(row.customerCode ?? '').trim().toUpperCase() !== airline) {
        return false;
      }
      if (category && String(row.category ?? '').trim() !== category) {
        return false;
      }
      if (statusFilter) {
        const expired = isContractExpiredRow(row);
        if (statusFilter === 'active' && expired) return false;
        if (statusFilter === 'expired' && !expired) return false;
      }
      if (fortnightFilter === 'enabled' && !row.fortnightBillingEnabled) return false;
      if (fortnightFilter === 'off' && row.fortnightBillingEnabled) return false;
      if (aircraft) {
        const types = formatAircraftTypesList(row.aircraftTypes);
        if (!types.includes(aircraft)) return false;
      }
      if (!query) return true;
      const airlineName = customerNameByCode[
        String(row.customerCode ?? '').trim().toUpperCase()
      ] ?? '';
      const airlineNamePrefixMatch = airlineName.toLowerCase().startsWith(query);
      const haystack = [
        row.contractNumber,
        row.customerCode,
        airlineName,
        row.category,
        formatContractCategory(row.category),
        resolveContractPaxFreight(row.aircraftTypes) ?? '',
        ...(row.aircraftTypes ?? []),
        ...CONTRACT_CONDITIONAL_CHARGE_SCENARIOS.map((key) =>
          formatConditionalChargeCell(row, key),
        ),
        ...CONTRACT_CONDITIONAL_CHARGE_SCENARIOS.map(
          (key) => CONTRACT_CONCESSION_SCENARIO_LABELS[key],
        ),
        getContractEndingInfo(row.priceValidTo).daysLabel,
        row.priceValidFrom,
        row.priceValidTo,
        row.status,
      ]
        .join(' ')
        .toLowerCase();
      return airlineNamePrefixMatch || haystack.includes(query);
    });
  }, [
    aircraftFilter,
    airlineFilter,
    categoryFilter,
    fortnightFilter,
    customerNameByCode,
    listSearch,
    rows,
    statusFilter,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [contractsRes, customersRes] = await Promise.all([
        api.listContracts(),
        api.listCustomers({ limit: 5000, active: 'all' }).catch(() => null),
      ]);
      const data = contractsRes.data as { items?: BillingContract[] };
      setRows(data.items ?? []);
      const customers = ((customersRes?.data as BillingCustomer[]) ?? []).filter(Boolean);
      const names = customers.reduce<Record<string, string>>((acc, customer) => {
        const code = String(customer.customerCode ?? '').trim().toUpperCase();
        const name = String(customer.name ?? '').trim();
        if (code && name) acc[code] = name;
        return acc;
      }, {});
      setCustomerNameByCode(names);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load contracts');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const contractDeepLinkRef = useRef<string>('');
  useEffect(() => {
    if (loading) return;
    const contractId = searchParams.get('contract')?.trim() ?? '';
    if (!contractId) return;
    const condition = searchParams.get('condition')?.trim() ?? '';
    const token = `${contractId}|${condition}`;
    if (contractDeepLinkRef.current === token) return;
    const match = rows.find((row) => row._id === contractId);
    if (!match) return;
    contractDeepLinkRef.current = token;
    setFocusCondition(condition || null);
    setEditRecord(match);
  }, [loading, rows, searchParams]);

  const allSelected =
    visibleContractRows.length > 0 &&
    visibleContractRows.every((r) => selected.has(r._id));
  const someSelected =
    visibleContractRows.some((r) => selected.has(r._id)) && !allSelected;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const row of visibleContractRows) next.delete(row._id);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const row of visibleContractRows) next.add(row._id);
        return next;
      });
    }
  };

  const openDeleteDialog = (mode: ContractDeleteMode, record: BillingContract | null = null) => {
    setDeleteMode(mode);
    setDeleteRecord(record);
    setDeleteDialogOpen(true);
  };

  const deleteCount = useMemo(() => {
    if (deleteMode === 'single') return 1;
    if (deleteMode === 'selected') return selected.size;
    return rows.length;
  }, [deleteMode, selected.size, rows.length]);

  const downloadContractPdf = async (row: BillingContract) => {
    setDownloadingPdfId(row._id);
    setError('');
    try {
      let source = row;
      try {
        const res = await api.getContract(row._id);
        source = (res as { data: BillingContract }).data;
      } catch {
        // Fall back to list row if detail fetch fails.
      }

      const customerCode = String(source.customerCode ?? '')
        .trim()
        .toUpperCase();
      let packageCards: BillingPriceCardAirline[] = [];
      let rateCards: BillingRateCard[] = [];
      let serviceCategoryByCode = new Map<string, string>();

      if (customerCode) {
        const [airlineRes, rateRes, catalogRes] = await Promise.all([
          api
            .listPriceCardAirlines({ handlingType: 'BHS', customerCode })
            .catch(() => null),
          api.listRateCards({ customerCode }).catch(() => null),
          api.listServiceCatalog().catch(() => null),
        ]);

        const airlineData = airlineRes?.data as
          | { items?: BillingPriceCardAirline[] }
          | undefined;
        packageCards = selectBhsPackageCardsForContract(
          airlineData?.items ?? [],
          source,
        );

        const rateData = rateRes?.data as { items?: BillingRateCard[] } | undefined;
        rateCards = rateData?.items ?? [];

        const catalogData = catalogRes?.data as
          | { items?: BillingServiceCatalogItem[] }
          | BillingServiceCatalogItem[]
          | undefined;
        const catalogItems = Array.isArray(catalogData)
          ? catalogData
          : (catalogData?.items ?? []);
        serviceCategoryByCode = buildServiceCategoryMap(catalogItems);
      }

      await exportFilledContractPdf(source, {
        packageCards,
        rateCards,
        serviceCategoryByCode,
      });
      setSuccess(`Downloaded filled contract PDF for ${source.contractNumber}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to download contract PDF');
    } finally {
      setDownloadingPdfId(null);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setError('');
    setSuccess('');
    try {
      if (deleteMode === 'single' && deleteRecord) {
        await api.deleteContract(deleteRecord._id);
        setSuccess(`Deleted contract ${deleteRecord.contractNumber}.`);
      } else if (deleteMode === 'selected') {
        const res = await api.bulkDeleteContracts([...selected]);
        reportBulkDelete((res as { data: BulkDeleteResult }).data, 'contract', setSuccess, setError);
      } else {
        const res = await api.deleteAllContracts();
        reportBulkDelete((res as { data: BulkDeleteResult }).data, 'contract', setSuccess, setError);
      }
      setDeleteDialogOpen(false);
      setDeleteRecord(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete contract(s)');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="contract-workspace w-full space-y-0">
      <ContractHero
        title="Contracts"
        subtitle="Station handling agreements — validity, aircraft, SGHA terms, clauses."
        actions={
          <>
            <button
              type="button"
              disabled={rows.length === 0}
              onClick={() => setExportOpen(true)}
              className={contractUi.btnSecondary}
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              Export
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className={contractUi.btnOutline}
            >
              <Upload className="h-4 w-4" aria-hidden />
              Import
            </button>
            <button
              type="button"
              onClick={() => {
                setEditRecord(null);
                setCreateOpen(true);
              }}
              className={contractUi.btnPrimary}
            >
              <Plus className="h-4 w-4" aria-hidden />
              New contract
            </button>
          </>
        }
      />

      <div className={cn(contractUi.toolbar, 'mb-4 shrink-0')}>
        <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)] sm:max-w-sm">
            <span className="sr-only">Search contracts</span>
            <input
              type="search"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="Search contract #, airline, category…"
              className={cn(contractUi.search, 'sm:max-w-none')}
              aria-label="Search contracts"
            />
          </label>
          <label className="flex min-w-[9rem] flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)]">
            Airline
            <select
              value={airlineFilter}
              onChange={(e) => setAirlineFilter(e.target.value)}
              className={billingUi.select}
              aria-label="Filter by airline"
            >
              <option value="">All airlines</option>
              {airlineOptions.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[9rem] flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)]">
            Category
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className={billingUi.select}
              aria-label="Filter by category"
            >
              <option value="">All categories</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {formatContractCategory(category)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[9rem] flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)]">
            Aircraft type
            <select
              value={aircraftFilter}
              onChange={(e) => setAircraftFilter(e.target.value)}
              className={billingUi.select}
              aria-label="Filter by aircraft type"
            >
              <option value="">All aircraft</option>
              {aircraftOptions.map((aircraftType) => (
                <option key={aircraftType} value={aircraftType}>
                  {aircraftType}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[9rem] flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)]">
            Status
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={billingUi.select}
              aria-label="Filter by status"
            >
              <option value="">All status</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
            </select>
          </label>
          <label className="flex min-w-[9rem] flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)]">
            Fortnight
            <select
              value={fortnightFilter}
              onChange={(e) => setFortnightFilter(e.target.value)}
              className={billingUi.select}
              aria-label="Filter by fortnight billing"
            >
              <option value="">All contracts</option>
              <option value="enabled">Fortnight enabled</option>
              <option value="off">Fortnight off</option>
            </select>
          </label>
          {hasActiveListFilters ? (
            <button
              type="button"
              onClick={clearListFilters}
              className={contractUi.btnSecondary}
            >
              Clear filters
            </button>
          ) : null}
        </div>
        <div className={contractUi.toolbarGroup}>
          {selected.size > 0 ? (
            <button
              type="button"
              onClick={() => openDeleteDialog('selected')}
              className={contractUi.btnDangerOutline}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete ({selected.size})
            </button>
          ) : null}
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => openDeleteDialog('all')}
            className={contractUi.btnDangerOutline}
            title="Delete all contracts"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Delete all
          </button>
        </div>
      </div>

      {error ? <ContractAlert tone="danger">{error}</ContractAlert> : null}
      {success ? <ContractAlert tone="accent">{success}</ContractAlert> : null}

      {loading ? (
        <ContractLoadingBlock rows={5} />
      ) : visibleContractRows.length === 0 ? (
        <ContractEmptyState
          title={rows.length === 0 ? 'No contracts yet' : 'No matches'}
          description={
            rows.length === 0
              ? 'Create a handling agreement from your airline price card, or start a new contract for this station.'
              : 'Try another search term or clear airline, category, aircraft, status, or fortnight filters.'
          }
          action={
            rows.length === 0 ? (
              <button
                type="button"
                onClick={() => {
                  setEditRecord(null);
                  setCreateOpen(true);
                }}
                className={contractUi.btnPrimary}
              >
                <Plus className="h-4 w-4" aria-hidden />
                New contract
              </button>
            ) : (
              <button
                type="button"
                onClick={clearListFilters}
                className={contractUi.btnSecondary}
              >
                Clear filters
              </button>
            )
          }
        />
      ) : (
        <>
          {/* Mobile card stack */}
          <div className="mb-4 grid gap-3 md:hidden">
            {visibleContractRows.map((r) => (
              <article
                key={r._id}
                className={cn(
                  'contract-row-card rounded-2xl border border-slate-200 bg-white p-4 shadow-xs',
                  isContractExpiredRow(r) && 'contract-row-expired',
                )}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(r._id)}
                    onChange={() => toggleSelect(r._id)}
                    aria-label={`Select ${r.contractNumber}`}
                    className={cn(billingUi.checkbox, 'mt-1')}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={contractUi.identityPrimary}>{r.contractNumber}</p>
                      <StatusBadge status={displayContractStatus(r)} />
                      <ContractCategoryCell
                        category={r.category}
                        aircraftTypes={r.aircraftTypes}
                        forceFreighter={contractIdentityIsFreighter(
                          r,
                          customerNameByCode[String(r.customerCode ?? '').trim().toUpperCase()],
                        )}
                      />
                    </div>
                    <p className={contractUi.identitySecondary}>
                      {customerNameByCode[String(r.customerCode ?? '').trim().toUpperCase()] ??
                        r.customerCode}
                    </p>
                    <ContractCoverageBadge contract={r} />
                    <div className="mt-2 space-y-2">
                      <ContractAircraftTypeCell aircraftTypes={r.aircraftTypes} />
                      <ContractValidityCell
                        priceValidFrom={r.priceValidFrom}
                        priceValidTo={r.priceValidTo}
                      />
                      <ContractSghaCell contract={r} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setViewRecord(r)}
                        className={contractUi.iconBtn}
                        aria-label={`View ${r.contractNumber}`}
                        title="View"
                      >
                        <Eye className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        disabled={downloadingPdfId === r._id}
                        onClick={() => void downloadContractPdf(r)}
                        className={contractUi.iconBtn}
                        aria-label={`Download filled contract PDF ${r.contractNumber}`}
                        title={
                          downloadingPdfId === r._id
                            ? 'Generating PDF…'
                            : 'Download filled contract PDF'
                        }
                      >
                        <Download className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCreateOpen(false);
                          setEditRecord(r);
                        }}
                        className={contractUi.iconBtn}
                        aria-label={`Edit ${r.contractNumber}`}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => openDeleteDialog('single', r)}
                        className={contractUi.iconDanger}
                        aria-label={`Delete ${r.contractNumber}`}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <BillingDataTable
              loading={false}
              rows={visibleContractRows}
              getRowKey={(r) => r._id}
              getRowClassName={(r) =>
                isContractExpiredRow(r) ? 'contract-row-expired' : undefined
              }
              emptyMessage="No contracts"
              footer={`${visibleContractRows.length} contract${visibleContractRows.length === 1 ? '' : 's'}${
                visibleContractRows.length !== rows.length ? ` of ${rows.length}` : ''
              }`}
              columns={[
                {
                  key: 'select',
                  header: (
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleSelectAll}
                      aria-label="Select all contracts"
                      className={billingUi.checkbox}
                    />
                  ),
                  className: 'w-10',
                  render: (r) => (
                    <input
                      type="checkbox"
                      checked={selected.has(r._id)}
                      onChange={() => toggleSelect(r._id)}
                      aria-label={`Select ${r.contractNumber}`}
                      className={billingUi.checkbox}
                    />
                  ),
                },
                {
                  key: 'identity',
                  header: 'Agreement',
                  render: (r) => (
                    <div className={contractUi.identityCell}>
                      <p className={contractUi.identityPrimary}>{r.contractNumber}</p>
                      <p className={contractUi.identitySecondary}>
                        {customerNameByCode[String(r.customerCode ?? '').trim().toUpperCase()] ??
                          r.customerCode}
                      </p>
                      <ContractCoverageBadge contract={r} />
                    </div>
                  ),
                },
                {
                  key: 'cat',
                  header: 'Category',
                  render: (r) => (
                    <ContractCategoryCell
                      category={r.category}
                      aircraftTypes={r.aircraftTypes}
                      forceFreighter={contractIdentityIsFreighter(
                        r,
                        customerNameByCode[String(r.customerCode ?? '').trim().toUpperCase()],
                      )}
                    />
                  ),
                },
                {
                  key: 'aircraft',
                  header: 'Aircraft type',
                  className: 'min-w-[10rem] max-w-[18rem]',
                  render: (r) => <ContractAircraftTypeCell aircraftTypes={r.aircraftTypes} />,
                },
                {
                  key: 'concessions',
                  header: 'SGHA',
                  className: 'min-w-[15rem] max-w-[22rem]',
                  render: (r) => <ContractSghaCell contract={r} />,
                },
                {
                  key: 'valid',
                  header: 'Validity',
                  className: 'min-w-[11rem]',
                  render: (r) => (
                    <ContractValidityCell
                      priceValidFrom={r.priceValidFrom}
                      priceValidTo={r.priceValidTo}
                    />
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (r) => <StatusBadge status={displayContractStatus(r)} />,
                },
                {
                  key: 'actions',
                  header: 'Actions',
                  className: 'w-[11.5rem] text-right',
                  render: (r) => (
                    <div className="inline-flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => setViewRecord(r)}
                        className={contractUi.iconBtn}
                        aria-label={`View ${r.contractNumber}`}
                        title="View"
                      >
                        <Eye className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        disabled={downloadingPdfId === r._id}
                        onClick={() => void downloadContractPdf(r)}
                        className={contractUi.iconBtn}
                        aria-label={`Download filled contract PDF ${r.contractNumber}`}
                        title={
                          downloadingPdfId === r._id
                            ? 'Generating PDF…'
                            : 'Download filled contract PDF'
                        }
                      >
                        <Download className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCreateOpen(false);
                          setEditRecord(r);
                        }}
                        className={contractUi.iconBtn}
                        aria-label={`Edit ${r.contractNumber}`}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => openDeleteDialog('single', r)}
                        className={contractUi.iconDanger}
                        aria-label={`Delete ${r.contractNumber}`}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </>
      )}

      <ContractExcelExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        contracts={rows}
        onExported={() => setSuccess('Contracts exported to Excel.')}
      />

      <ContractExcelImportDialog
        api={api}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={async () => {
          setSuccess('Contracts imported from Excel.');
          await load();
        }}
      />

      <ContractFormDialog
        api={api}
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        record={editRecord}
        focusCondition={focusCondition}
        onSaved={() => {
          setSuccess('Contract saved for your station.');
          void load();
        }}
      />

      <ContractHandlingPreviewDialog
        api={api}
        contract={viewRecord}
        open={viewRecord != null}
        onOpenChange={(open) => {
          if (!open) setViewRecord(null);
        }}
      />

      <ContractDeleteDialog
        mode={deleteMode}
        record={deleteRecord}
        count={deleteCount}
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setDeleteDialogOpen(false);
            setDeleteRecord(null);
          }
        }}
        onConfirm={() => void confirmDelete()}
        deleting={deleting}
      />
    </div>
  );
}

export function RateCardsPage({ api }: Props) {
  const searchParams = useSearchParams();
  const deepLinkAppliedRef = useRef(false);
  const [rows, setRows] = useState<BillingRateCard[]>([]);
  const [allRateCards, setAllRateCards] = useState<BillingRateCard[]>([]);
  const [navLevel, setNavLevel] = useState<PriceCardNavLevel>('categories');
  const [selectedHandling, setSelectedHandling] = useState<PriceCardHandlingType | null>(null);
  const [selectedCustomerCode, setSelectedCustomerCode] = useState<string | null>(null);
  const [selectedPriceCardEntry, setSelectedPriceCardEntry] =
    useState<BillingPriceCardAirline | null>(null);
  const [selectedAircraftType, setSelectedAircraftType] = useState<string | null>(null);
  const [customerFilter, setCustomerFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [appliedCustomer, setAppliedCustomer] = useState('');
  const [appliedService, setAppliedService] = useState('');
  const [rateCardSearch, setRateCardSearch] = useState('');
  const [bhsTableAircraftFilter, setBhsTableAircraftFilter] = useState('');
  const [customers, setCustomers] = useState<BillingCustomer[]>([]);
  const [contracts, setContracts] = useState<BillingContract[]>([]);
  const [allPriceCardAirlines, setAllPriceCardAirlines] = useState<BillingPriceCardAirline[]>([]);
  const [services, setServices] = useState<BillingServiceCatalogItem[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<BillingRateCard | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteRecord, setDeleteRecord] = useState<BillingRateCard | null>(null);
  const [deleteMode, setDeleteMode] = useState<RateCardDeleteMode>('single');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copyingServices, setCopyingServices] = useState(false);
  const dialogOpen = createOpen || editRecord != null;
  const closeDialog = () => {
    setCreateOpen(false);
    setEditRecord(null);
  };

  const loadRefs = useCallback(async () => {
    setLoadingRefs(true);
    try {
      const [customerRes, catalogRes, contractRes] = await Promise.all([
        api.listCustomers({ limit: 5000, active: 'all' }),
        api.listServiceCatalog(),
        api.listContracts(),
      ]);
      setCustomers((customerRes.data as BillingCustomer[]) ?? []);
      const catalogData = catalogRes.data as { items?: BillingServiceCatalogItem[] };
      setServices(catalogData.items ?? []);
      const contractData = contractRes.data as { items?: BillingContract[] };
      setContracts(contractData.items ?? []);
    } catch {
      setCustomers([]);
      setServices([]);
      setContracts([]);
    }

    try {
      const airlineRes = await api.listPriceCardAirlines();
      const airlineData = airlineRes.data as { items?: BillingPriceCardAirline[] };
      setAllPriceCardAirlines(airlineData.items ?? []);
    } catch {
      setAllPriceCardAirlines([]);
    } finally {
      setLoadingRefs(false);
    }
  }, [api]);

  const loadAllRateCards = useCallback(async () => {
    try {
      const res = await api.listRateCards();
      const data = res.data as { items?: BillingRateCard[] };
      setAllRateCards(data.items ?? []);
      return data.items ?? [];
    } catch {
      setAllRateCards([]);
      return [];
    }
  }, [api]);

  useEffect(() => {
    void loadRefs();
    void loadAllRateCards();
  }, [loadRefs, loadAllRateCards]);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError('');
    try {
      const res = await api.listRateCards({
        customerCode: appliedCustomer || undefined,
        serviceCode: appliedService || undefined,
      });
      const data = res.data as { items?: BillingRateCard[] };
      setRows(data.items ?? []);
      if (!options?.silent) setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load rate cards');
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [api, appliedCustomer, appliedService]);

  const refreshRateCards = useCallback(
    async (saved?: BillingRateCard) => {
      if (saved) {
        setRows((prev) => mergeRateCardList(prev, saved));
        setAllRateCards((prev) => mergeRateCardList(prev, saved));
      }
      await Promise.all([load({ silent: Boolean(saved) }), loadAllRateCards()]);
    },
    [load, loadAllRateCards],
  );

  const openManualAdd = () => {
    setEditRecord(null);
    setCreateOpen(true);
  };

  useEffect(() => {
    if (navLevel === 'rates') {
      void load();
      return;
    }
    setLoading(false);
    setRows([]);
    setSelected(new Set());
  }, [load, navLevel]);

  const serviceCategoryByCode = useMemo(
    () => buildServiceCategoryMap(services),
    [services],
  );

  const selectedBhsAirlineGroup = useMemo((): BhsAirlineCardGroup | null => {
    if (
      !selectedCustomerCode ||
      (selectedHandling !== 'BHS' && selectedHandling !== 'ADS')
    ) {
      return null;
    }
    const entries = allPriceCardAirlines.filter(
      (entry) =>
        entry.handlingType === selectedHandling &&
        entry.customerCode === selectedCustomerCode,
    );
    if (entries.length === 0) return null;
    return groupBhsPriceCardAirlines(entries)[0] ?? null;
  }, [allPriceCardAirlines, selectedCustomerCode, selectedHandling]);

  const rateCardSource = useMemo(() => {
    if (navLevel !== 'rates') return rows;
    if (selectedPriceCardEntry) {
      let source = allRateCards.filter(
        (r) => r.customerCode === selectedPriceCardEntry.customerCode,
      );
      if (appliedService) {
        source = source.filter((r) => r.serviceCode === appliedService);
      }
      return source;
    }
    return rows;
  }, [allRateCards, appliedService, navLevel, rows, selectedPriceCardEntry]);

  const displayRows = useMemo(() => {
    if (navLevel !== 'rates' || !selectedHandling) return rateCardSource;
    if (selectedPriceCardEntry) {
      return filterRateCardsForPriceCardAirlineRow(
        rateCardSource,
        selectedHandling,
        selectedPriceCardEntry,
        serviceCategoryByCode,
      );
    }
    const customerCode = selectedCustomerCode ?? (appliedCustomer || undefined);
    return filterRateCardsForHandling(
      rateCardSource,
      selectedHandling,
      customerCode,
      serviceCategoryByCode,
    );
  }, [
    appliedCustomer,
    navLevel,
    rateCardSource,
    selectedCustomerCode,
    selectedHandling,
    selectedPriceCardEntry,
    serviceCategoryByCode,
  ]);

  const bhsAirlineEntries = useMemo(
    () => allPriceCardAirlines.filter((e) => e.handlingType === 'BHS'),
    [allPriceCardAirlines],
  );

  const customerScopeEntries = useMemo(() => {
    if (!selectedHandling || !selectedCustomerCode) return [];
    return listPriceCardEntriesForCustomer(
      allPriceCardAirlines,
      selectedHandling,
      selectedCustomerCode,
    );
  }, [allPriceCardAirlines, selectedCustomerCode, selectedHandling]);

  const scopeAircraftOptions = useMemo(() => {
    const values = new Set(customerScopeEntries.map((e) => e.aircraftType.trim().toUpperCase()));
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [customerScopeEntries]);

  const scopeValidityOptions = useMemo(() => {
    if (!selectedPriceCardEntry) return [];
    const aircraft = selectedPriceCardEntry.aircraftType.trim().toUpperCase();
    const keys = new Map<string, { validFrom: string; validTo: string }>();
    for (const entry of customerScopeEntries) {
      if (entry.aircraftType.trim().toUpperCase() !== aircraft) continue;
      const validFrom = entry.validFrom.slice(0, 10);
      const validTo = entry.validTo.slice(0, 10);
      keys.set(`${validFrom}|${validTo}`, { validFrom, validTo });
    }
    return [...keys.values()].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  }, [customerScopeEntries, selectedPriceCardEntry]);

  const scopeCategoryOptions = useMemo(() => {
    if (!selectedPriceCardEntry) return [...PRICE_CARD_AIRLINE_CATEGORIES];
    const aircraft = selectedPriceCardEntry.aircraftType.trim().toUpperCase();
    const validFrom = selectedPriceCardEntry.validFrom.slice(0, 10);
    const validTo = selectedPriceCardEntry.validTo.slice(0, 10);
    const categories = customerScopeEntries
      .filter(
        (entry) =>
          entry.aircraftType.trim().toUpperCase() === aircraft &&
          entry.validFrom.slice(0, 10) === validFrom &&
          entry.validTo.slice(0, 10) === validTo,
      )
      .map((entry) => entry.category);
    return [...new Set(categories)] as PriceCardAirlineCategory[];
  }, [customerScopeEntries, selectedPriceCardEntry]);

  const refillSources = useMemo(() => {
    if (!selectedPriceCardEntry || !selectedHandling) return [];
    return customerScopeEntries
      .filter(
        (entry) =>
          entry._id !== selectedPriceCardEntry._id &&
          entry.aircraftType.trim().toUpperCase() ===
            selectedPriceCardEntry.aircraftType.trim().toUpperCase() &&
          entry.validFrom.slice(0, 10) === selectedPriceCardEntry.validFrom.slice(0, 10) &&
          entry.validTo.slice(0, 10) === selectedPriceCardEntry.validTo.slice(0, 10),
      )
      .map((entry) => ({
        entry,
        count: countRateCardsForPriceCardEntry(
          allRateCards,
          selectedHandling,
          entry,
          serviceCategoryByCode,
        ),
      }))
      .filter((source) => source.count > 0);
  }, [
    allRateCards,
    customerScopeEntries,
    selectedHandling,
    selectedPriceCardEntry,
    serviceCategoryByCode,
  ]);

  const navigateScope = (
    aircraftType: string,
    category: PriceCardAirlineCategory,
    validFrom: string,
    validTo: string,
  ) => {
    if (!selectedHandling || !selectedCustomerCode) return;
    const entry = findPriceCardEntry(
      allPriceCardAirlines,
      selectedHandling,
      selectedCustomerCode,
      aircraftType,
      category,
      validFrom,
      validTo,
    );
    if (entry) {
      openHandlingAirline(entry);
      return;
    }
    setError(
      `No ${formatPriceCardAirlineCategory(category)} price-card row for ${aircraftType} in this validity period.`,
    );
  };

  const copyServicesFromEntry = async (sourceEntry: BillingPriceCardAirline) => {
    if (!selectedPriceCardEntry || !selectedHandling) return;

    const contract = defaultContractForCustomer(
      selectedPriceCardEntry.customerCode,
      contracts,
    );
    if (!contract) {
      setError('Add an active contract for this airline before copying services.');
      return;
    }

    const sourceRows = filterRateCardsForPriceCardAirlineRow(
      allRateCards,
      selectedHandling,
      sourceEntry,
      serviceCategoryByCode,
    );
    const existing = new Set(displayRows.map((row) => row.serviceCode));
    const toCopy = sourceRows.filter((row) => !existing.has(row.serviceCode));

    if (toCopy.length === 0) {
      setSuccess('All services from that category are already listed here.');
      return;
    }

    setCopyingServices(true);
    setError('');
    setSuccess('');

    const validFrom = selectedPriceCardEntry.validFrom.slice(0, 10);
    const validTo = selectedPriceCardEntry.validTo.slice(0, 10);
    const aircraftType = selectedPriceCardEntry.aircraftType.trim().toUpperCase();
    let added = 0;

    try {
      for (const row of toCopy) {
        await api.createRateCard({
          contractId: contract._id,
          customerCode: selectedPriceCardEntry.customerCode,
          serviceCode: row.serviceCode,
          billingReference: row.billingReference,
          currency: row.currency,
          uom: row.uom,
          validFrom,
          validTo,
          aircraftType,
          category: selectedPriceCardEntry.category,
          remarks: row.remarks,
        });
        added += 1;
      }
      await refreshRateCards();
      setSuccess(
        `Copied ${added} service${added === 1 ? '' : 's'} from ${formatPriceCardAirlineCategory(sourceEntry.category)}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to copy services');
    } finally {
      setCopyingServices(false);
    }
  };

  const openHandlingCategory = (handling: PriceCardHandlingType) => {
    setSelectedHandling(handling);
    setSelectedCustomerCode(null);
    setSelectedPriceCardEntry(null);
    setNavLevel('airlines');
    setCustomerFilter('');
    setServiceFilter('');
    setAppliedCustomer('');
    setAppliedService('');
    setRateCardSearch('');
    setBhsTableAircraftFilter('');
    setSuccess('');
    setError('');
  };

  const openBhsAirline = (group: BhsAirlineCardGroup) => {
    setSelectedCustomerCode(group.customerCode);
    setSelectedPriceCardEntry(null);
    setSelectedAircraftType(null);
    setCustomerFilter(group.customerCode);
    setAppliedCustomer(group.customerCode);
    setRateCardSearch('');
    setBhsTableAircraftFilter('');
    setNavLevel('airline-rate-cards');
    setSuccess('');
    setError('');
  };

  const openHandlingAirline = (entry: BillingPriceCardAirline) => {
    setSelectedCustomerCode(entry.customerCode);
    setSelectedPriceCardEntry(entry);
    setSelectedAircraftType(entry.aircraftType.trim().toUpperCase());
    setCustomerFilter(entry.customerCode);
    setAppliedCustomer(entry.customerCode);
    setRateCardSearch('');
    setBhsTableAircraftFilter('');
    setNavLevel('rates');
    setSuccess('');
    setError('');
  };

  const backToCategories = () => {
    setNavLevel('categories');
    setSelectedHandling(null);
    setSelectedCustomerCode(null);
    setSelectedPriceCardEntry(null);
    setSelectedAircraftType(null);
    setCustomerFilter('');
    setServiceFilter('');
    setAppliedCustomer('');
    setAppliedService('');
    setRateCardSearch('');
    setBhsTableAircraftFilter('');
  };

  const backToAirlines = () => {
    setNavLevel('airlines');
    setSelectedCustomerCode(null);
    setSelectedPriceCardEntry(null);
    setSelectedAircraftType(null);
    setCustomerFilter('');
    setAppliedCustomer('');
    setRateCardSearch('');
    setBhsTableAircraftFilter('');
  };

  const backToAirlineRateCards = () => {
    setNavLevel('airline-rate-cards');
    setSelectedPriceCardEntry(null);
    setSelectedAircraftType(null);
    setRateCardSearch('');
    setBhsTableAircraftFilter('');
    setSelected(new Set());
  };

  useEffect(() => {
    if (deepLinkAppliedRef.current || loadingRefs) return;

    const handlingParam = searchParams.get('handling')?.trim().toUpperCase();
    if (
      !handlingParam ||
      !PRICE_CARD_HANDLING_TYPES.includes(handlingParam as PriceCardHandlingType)
    ) {
      return;
    }

    const handling = handlingParam as PriceCardHandlingType;
    const customer = searchParams.get('customer')?.trim().toUpperCase() ?? '';
    const service = searchParams.get('service')?.trim() ?? '';

    deepLinkAppliedRef.current = true;
    setSelectedHandling(handling);
    setSuccess('');
    setError('');

    if (handling === 'BHS' && customer) {
      const entries = allPriceCardAirlines.filter(
        (entry) => entry.handlingType === 'BHS' && entry.customerCode === customer,
      );
      const group = groupBhsPriceCardAirlines(entries)[0];
      if (group) {
        setSelectedCustomerCode(group.customerCode);
        setSelectedPriceCardEntry(null);
        setSelectedAircraftType(null);
        setCustomerFilter(group.customerCode);
        setAppliedCustomer(group.customerCode);
        setRateCardSearch('');
        setBhsTableAircraftFilter('');
        setNavLevel('airline-rate-cards');
      } else {
        setNavLevel('airlines');
        setCustomerFilter(customer);
        setAppliedCustomer(customer);
      }
    } else if (customer) {
      const entry = allPriceCardAirlines.find(
        (row) => row.handlingType === handling && row.customerCode === customer,
      );
      if (entry) {
        setSelectedCustomerCode(entry.customerCode);
        setSelectedPriceCardEntry(entry);
        setSelectedAircraftType(entry.aircraftType.trim().toUpperCase());
        setCustomerFilter(entry.customerCode);
        setAppliedCustomer(entry.customerCode);
        setRateCardSearch('');
        setBhsTableAircraftFilter('');
        setNavLevel('rates');
      } else {
        setNavLevel('airlines');
        setSelectedCustomerCode(customer);
        setCustomerFilter(customer);
        setAppliedCustomer(customer);
      }
    } else {
      setNavLevel('airlines');
    }

    if (service) {
      setServiceFilter(service);
      setAppliedService(service);
    }
  }, [allPriceCardAirlines, loadingRefs, searchParams]);

  const refreshAfterCustomerAssign = () => {
    void loadRefs();
    void loadAllRateCards();
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(visibleRows.map((r) => r._id)));
  };

  const openDeleteDialog = (mode: RateCardDeleteMode, record: BillingRateCard | null = null) => {
    setDeleteMode(mode);
    setDeleteRecord(record);
    setDeleteDialogOpen(true);
  };

  const applyFilters = () => {
    setAppliedCustomer(customerFilter);
    setAppliedService(serviceFilter);
  };

  const clearFilters = () => {
    setCustomerFilter('');
    setServiceFilter('');
    setAppliedCustomer('');
    setAppliedService('');
  };

  const serviceOptions = useMemo(() => {
    const fromCatalog = services.map((s) => s.serviceCode);
    const fromRows = rows.map((r) => r.serviceCode);
    return [...new Set([...fromCatalog, ...fromRows])].sort((a, b) =>
      a.localeCompare(b),
    );
  }, [services, rows]);

  const hasActiveFilters = Boolean(appliedCustomer || appliedService);
  const isBhsRatesView = selectedHandling === 'BHS';
  const isAdsRatesView = selectedHandling === 'ADS';
  const isScopedServicesView = selectedHandling === 'BHS' || selectedHandling === 'ADS';

  const bhsTableAircraftOptions = useMemo(() => {
    if (!isBhsRatesView) return [];
    const values = new Set(
      displayRows
        .map((row) => row.aircraftType?.trim().toUpperCase() ?? '')
        .filter(Boolean),
    );
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [displayRows, isBhsRatesView]);

  const visibleRows = useMemo(() => {
    let rows = displayRows;
    if (isBhsRatesView && bhsTableAircraftFilter) {
      rows = rows.filter(
        (row) =>
          (row.aircraftType?.trim().toUpperCase() ?? '') === bhsTableAircraftFilter,
      );
    }
    const query = rateCardSearch.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => {
      const haystack = [
        row.customerCode,
        row.serviceCode,
        row.billingReference ?? '',
        row.aircraftType ?? '',
        row.category ? formatPriceCardAirlineCategory(row.category) : row.category ?? '',
        row.remarks ?? '',
        row.uom,
        row.unitPriceINR != null ? String(row.unitPriceINR) : '',
        row.unitPriceUSD != null ? String(row.unitPriceUSD) : '',
        row.validFrom,
        row.validTo,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [bhsTableAircraftFilter, displayRows, isBhsRatesView, rateCardSearch]);

  const hasActiveRateTableFilters = Boolean(
    rateCardSearch.trim() || (isBhsRatesView && bhsTableAircraftFilter),
  );

  const clearRateTableFilters = () => {
    setRateCardSearch('');
    setBhsTableAircraftFilter('');
  };

  const allSelected = visibleRows.length > 0 && selected.size === visibleRows.length;
  const someSelected = selected.size > 0 && !allSelected;

  const rateCardColumns = useMemo(() => {
    const base: {
      key: string;
      header: ReactNode;
      render: (r: BillingRateCard) => ReactNode;
      className?: string;
    }[] = [
      {
        key: 'select',
        header: (
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={toggleSelectAll}
            aria-label="Select all rate cards"
          />
        ),
        className: 'w-10',
        render: (r: BillingRateCard) => (
          <input
            type="checkbox"
            checked={selected.has(r._id)}
            onChange={() => toggleSelect(r._id)}
            aria-label={`Select ${r.serviceCode}`}
          />
        ),
      },
      { key: 'customer', header: 'Customer', render: (r: BillingRateCard) => r.customerCode },
      { key: 'service', header: 'Service', render: (r: BillingRateCard) => r.serviceCode },
      {
        key: 'ref',
        header: 'Reference',
        render: (r: BillingRateCard) => r.billingReference ?? '—',
      },
      {
        key: 'band',
        header: isBhsRatesView ? 'Aircraft type' : 'Aircraft band',
        render: (r: BillingRateCard) => r.aircraftType?.trim() || r.category || '—',
      },
    ];

    if (isBhsRatesView) {
      base.push({
        key: 'flightCategory',
        header: 'Flight category',
        render: (r: BillingRateCard) =>
          r.aircraftType?.trim() && r.category
            ? formatPriceCardAirlineCategory(r.category)
            : '—',
      });
    }

    if (isScopedServicesView) {
      base.push(
        {
          key: 'scope',
          header: 'Scope',
          render: (r: BillingRateCard) => formatBillingScope(r.billingScope),
        },
        {
          key: 'serviceCount',
          header: 'Count',
          render: (r: BillingRateCard) =>
            r.serviceCount != null ? String(r.serviceCount) : '—',
        },
      );
    }

    if (!isBhsRatesView) {
      base.push(
        {
          key: 'inr',
          header: 'INR',
          render: (r: BillingRateCard) => (r.unitPriceINR != null ? String(r.unitPriceINR) : '—'),
        },
        {
          key: 'usd',
          header: 'USD',
          render: (r: BillingRateCard) => (r.unitPriceUSD != null ? String(r.unitPriceUSD) : '—'),
        },
      );
    }

    base.push(
      { key: 'uom', header: 'UOM', render: (r: BillingRateCard) => r.uom },
      {
        key: 'valid',
        header: 'Valid',
        render: (r: BillingRateCard) => formatBillingDateRange(r.validFrom, r.validTo),
      },
      {
        key: 'actions',
        header: 'Actions',
        className: 'w-24 text-right',
        render: (r: BillingRateCard) => (
          <div className="inline-flex items-center justify-end gap-0.5">
            <button
              type="button"
              onClick={() => {
                setCreateOpen(false);
                setEditRecord(r);
              }}
              className={contractUi.iconBtn}
              aria-label={`Edit ${r.serviceCode}`}
              title="Edit"
            >
              <Pencil className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => openDeleteDialog('single', r)}
              className={contractUi.iconDanger}
              aria-label={`Delete ${r.serviceCode}`}
              title="Delete"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ),
      },
    );

    return base;
  }, [
    allSelected,
    isBhsRatesView,
    isScopedServicesView,
    openDeleteDialog,
    selected,
    someSelected,
    toggleSelect,
    toggleSelectAll,
  ]);

  const deleteCount = useMemo(() => {
    if (deleteMode === 'single') return 1;
    if (deleteMode === 'selected') return selected.size;
    return visibleRows.length;
  }, [deleteMode, selected.size, visibleRows.length]);

  const confirmDelete = async () => {
    setDeleting(true);
    setError('');
    setSuccess('');
    try {
      if (deleteMode === 'single' && deleteRecord) {
        await api.deleteRateCard(deleteRecord._id);
        setSuccess('Rate card deleted.');
      } else if (deleteMode === 'selected') {
        const res = await api.bulkDeleteRateCards([...selected]);
        reportBulkDelete((res as { data: BulkDeleteResult }).data, 'rate card', setSuccess, setError);
      } else {
        const res = await api.deleteAllRateCards();
        reportBulkDelete((res as { data: BulkDeleteResult }).data, 'rate card', setSuccess, setError);
      }
      setDeleteDialogOpen(false);
      setDeleteRecord(null);
      await refreshRateCards();
      void loadRefs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete rate card(s)');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="contract-workspace w-full space-y-0">
      <MasterSectionTabs group="rates" />
      <ContractHero
        title="Rate cards"
        subtitle="Handling → airline → aircraft period → service prices."
        actions={
          navLevel === 'rates' ? (
            <div className="flex flex-wrap gap-2">
              {refillSources.length === 1 ? (
                <button
                  type="button"
                  disabled={copyingServices}
                  onClick={() => void copyServicesFromEntry(refillSources[0].entry)}
                  className={contractUi.btnOutline}
                >
                  {copyingServices
                    ? 'Copying…'
                    : `Copy from ${formatPriceCardAirlineCategory(refillSources[0].entry.category)} (${refillSources[0].count})`}
                </button>
              ) : refillSources.length > 1 ? (
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  <span className="sr-only">Copy services from another category</span>
                  <select
                    value=""
                    disabled={copyingServices}
                    onChange={(e) => {
                      const entry = refillSources.find((s) => s.entry._id === e.target.value)?.entry;
                      if (entry) void copyServicesFromEntry(entry);
                      e.target.value = '';
                    }}
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-xs"
                  >
                    <option value="">Copy from…</option>
                    {refillSources.map((source) => (
                      <option key={source.entry._id} value={source.entry._id}>
                        {formatPriceCardAirlineCategory(source.entry.category)} ({source.count} services)
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button type="button" onClick={openManualAdd} className={contractUi.btnPrimary}>
                <Plus className="h-4 w-4" aria-hidden />
                Add service
              </button>
              {selected.size > 0 ? (
                <button
                  type="button"
                  onClick={() => openDeleteDialog('selected')}
                  className={contractUi.btnDangerOutline}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Delete ({selected.size})
                </button>
              ) : null}
              <button
                type="button"
                disabled={visibleRows.length === 0}
                onClick={() => openDeleteDialog('all')}
                className={contractUi.btnDangerOutline}
                title="Delete all in view"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Delete all
              </button>
            </div>
          ) : null
        }
      />

      <PriceCardHandlingSection
        api={api}
        customers={customers}
        contracts={contracts}
        allRateCards={allRateCards}
        allPriceCardAirlines={allPriceCardAirlines}
        services={services}
        selectedHandling={selectedHandling}
        selectedCustomerCode={selectedCustomerCode}
        selectedPriceCardEntry={selectedPriceCardEntry}
        selectedBhsAirlineGroup={selectedBhsAirlineGroup}
        navLevel={navLevel}
        onSelectHandling={openHandlingCategory}
        onSelectCustomer={openHandlingAirline}
        onOpenAirline={openBhsAirline}
        onBackToCategories={backToCategories}
        onBackToAirlines={backToAirlines}
        onBackToAirlineRateCards={backToAirlineRateCards}
        onCustomerAssigned={refreshAfterCustomerAssign}
        onError={setError}
        onSuccess={setSuccess}
      />

      {navLevel === 'rates' ? (
      <div className={cn(contractUi.toolbar, 'mb-4')}>
        <div className="flex w-full flex-wrap items-end gap-3">
        {selectedPriceCardEntry && selectedHandling ? (
          <>
            <label className="flex min-w-[8rem] flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)]">
              Aircraft
              <select
                value={selectedPriceCardEntry.aircraftType.trim().toUpperCase()}
                onChange={(e) =>
                  navigateScope(
                    e.target.value,
                    selectedPriceCardEntry.category,
                    selectedPriceCardEntry.validFrom.slice(0, 10),
                    selectedPriceCardEntry.validTo.slice(0, 10),
                  )
                }
                className={billingUi.select}
              >
                {scopeAircraftOptions.map((aircraft) => (
                  <option key={aircraft} value={aircraft}>
                    {aircraft}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[9rem] flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)]">
              Flight category
              <select
                value={selectedPriceCardEntry.category}
                onChange={(e) =>
                  navigateScope(
                    selectedPriceCardEntry.aircraftType,
                    e.target.value as PriceCardAirlineCategory,
                    selectedPriceCardEntry.validFrom.slice(0, 10),
                    selectedPriceCardEntry.validTo.slice(0, 10),
                  )
                }
                className={billingUi.select}
              >
                {scopeCategoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {formatPriceCardAirlineCategory(category)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[12rem] flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)]">
              Validity
              <select
                value={`${selectedPriceCardEntry.validFrom.slice(0, 10)}|${selectedPriceCardEntry.validTo.slice(0, 10)}`}
                onChange={(e) => {
                  const [validFrom, validTo] = e.target.value.split('|');
                  navigateScope(
                    selectedPriceCardEntry.aircraftType,
                    selectedPriceCardEntry.category,
                    validFrom,
                    validTo,
                  );
                }}
                className={billingUi.select}
              >
                {scopeValidityOptions.map((period) => (
                  <option
                    key={`${period.validFrom}|${period.validTo}`}
                    value={`${period.validFrom}|${period.validTo}`}
                  >
                    {formatBillingDateRange(period.validFrom, period.validTo)}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)]">
            Customer
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              disabled={loadingRefs}
              className={billingUi.select}
            >
              <option value="">All customers</option>
              {customers.map((c) => (
                <option key={c._id} value={c.customerCode}>
                  {c.customerCode} — {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)]">
          Service
          <select
            value={serviceFilter}
            onChange={(e) => {
              const value = e.target.value;
              setServiceFilter(value);
              if (selectedPriceCardEntry) setAppliedService(value);
            }}
            disabled={loadingRefs}
            className={billingUi.select}
          >
            <option value="">All services</option>
            {serviceOptions.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        {isBhsRatesView && bhsTableAircraftOptions.length > 0 ? (
          <label className="flex min-w-[8rem] flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)]">
            Aircraft type
            <select
              value={bhsTableAircraftFilter}
              onChange={(e) => setBhsTableAircraftFilter(e.target.value)}
              className={billingUi.select}
            >
              <option value="">All aircraft types</option>
              {bhsTableAircraftOptions.map((aircraftType) => (
                <option key={aircraftType} value={aircraftType}>
                  {aircraftType}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-[color:var(--billing-text-secondary)] sm:max-w-md">
          Search
          <input
            type="search"
            value={rateCardSearch}
            onChange={(e) => setRateCardSearch(e.target.value)}
            placeholder="Service, reference, remarks, UOM…"
            className={contractUi.search}
          />
        </label>
        {hasActiveRateTableFilters ? (
          <button
            type="button"
            onClick={clearRateTableFilters}
            className={contractUi.btnSecondary}
          >
            Clear table filters
          </button>
        ) : null}
        {!selectedPriceCardEntry ? (
          <>
            <button
              type="button"
              onClick={() => applyFilters()}
              className={contractUi.btnPrimary}
            >
              Apply filters
            </button>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={() => clearFilters()}
                className={contractUi.btnSecondary}
              >
                Clear
              </button>
            ) : null}
            {hasActiveFilters ? (
              <span className="text-sm text-[color:var(--billing-text-muted)]">
                Showing filtered results
                {appliedCustomer ? ` · ${appliedCustomer}` : ''}
                {appliedService ? ` · ${appliedService}` : ''}
              </span>
            ) : null}
          </>
        ) : appliedService || hasActiveRateTableFilters ? (
          <span className="text-sm text-[color:var(--billing-text-muted)]">
            {appliedService ? `Filtered by service · ${appliedService}` : null}
            {appliedService && hasActiveRateTableFilters ? ' · ' : null}
            {hasActiveRateTableFilters
              ? `Showing ${visibleRows.length} of ${displayRows.length} services`
              : null}
          </span>
        ) : null}
        </div>
      </div>
      ) : null}

      {error ? <ContractAlert tone="danger">{error}</ContractAlert> : null}
      {success ? <ContractAlert tone="accent">{success}</ContractAlert> : null}

      {navLevel === 'rates' ? (
        isAdsRatesView && selectedPriceCardEntry ? (
          <AdsRateCardDualCountPanel
            api={api}
            entry={selectedPriceCardEntry}
            allRateCards={allRateCards}
            services={services}
            contracts={contracts}
            serviceCategoryByCode={serviceCategoryByCode}
            searchQuery={rateCardSearch}
            onSaved={() => void refreshRateCards()}
            onError={setError}
            onSuccess={setSuccess}
            onEditExclusive={(record) => {
              setCreateOpen(false);
              setEditRecord(record);
            }}
          />
        ) : (
          <div className="contract-workspace">
          <BillingDataTable
            loading={loading}
            rows={visibleRows}
            getRowKey={(r) => String(r._id)}
            footer={`${visibleRows.length} service${visibleRows.length === 1 ? '' : 's'}${
              visibleRows.length !== displayRows.length
                ? ` (filtered from ${displayRows.length})`
                : ''
            }`}
            emptyMessage={
              selectedPriceCardEntry
                ? 'No services yet — use Add service'
                : 'No rate cards'
            }
            columns={rateCardColumns}
          />
          </div>
        )
      ) : null}

      <RateCardFormDialog
        api={api}
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        record={editRecord}
        handlingType={selectedHandling}
        bhsContextEntry={selectedPriceCardEntry}
        defaultCustomerCode={selectedCustomerCode}
        defaultAircraftType={selectedAircraftType}
        bhsAirlineEntries={bhsAirlineEntries}
        customers={customers}
        existingServiceCodes={displayRows.map((r) => r.serviceCode)}
        onSaved={(saved) => {
          setSuccess(
            saved
              ? `Service “${saved.serviceCode}” saved and added to this list.`
              : 'Rate card saved for your station.',
          );
          void refreshRateCards(saved);
          // BHS rate-card changes must refresh ADS airline twins + lists.
          void loadRefs();
        }}
      />

      <RateCardDeleteDialog
        mode={deleteMode}
        record={deleteRecord}
        count={deleteCount}
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setDeleteDialogOpen(false);
            setDeleteRecord(null);
          }
        }}
        onConfirm={() => void confirmDelete()}
        deleting={deleting}
      />
    </div>
  );
}
