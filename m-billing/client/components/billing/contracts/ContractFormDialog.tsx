'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import {
  ContractAlert,
  ContractField,
  ContractInput,
  ContractSection,
  ContractToggleCard,
  contractUi,
} from './ContractUi';
import {
  ContractCategoryMultiSelect,
  ContractSystemDate,
  ContractSystemSelect,
  contractSectorsFromRecord,
  legacyCategoryFromSectors,
  type ContractSector,
} from './ContractControls';
import { ContractClausesEditor } from './ContractClausesEditor';
import { ContractAircraftTypePicker } from './ContractAircraftTypePicker';
import { ContractPdfPanel, type ContractPdfState } from './ContractPdfPanel';
import { cn } from '@/lib/utils';
import type { BillingApi, EquipmentMasterRecord } from '@/lib/billing-api';
import type {
  BillingContract,
  BillingContractAdsEquipmentRule,
  BillingContractClause,
  BillingContractFortnightBillingRange,
  BillingContractFortnightMonthRate,
  BillingCustomer,
  BillingExchangeRate,
  BillingServiceCatalogItem,
} from '@/lib/billing-shared/types';
import type { ContractCategory } from '@/lib/billing-shared/enums';
import { formatBillingDate } from '@/lib/billing-shared/billing-date-format';
import {
  clausesFromContract,
  defaultContractClauses,
} from '@/lib/billing-shared/contract-clauses';
import {
  conditionalChargesFromContract,
  contractChargeFieldId,
  emptyConcessionRatesForm,
  parseConditionalChargesForm,
  type ContractConcessionRatesForm,
} from '@/lib/billing-shared/contract-concessions';
import {
  fetchAdvanceAircraftMasterTypes,
  fetchContractAircraftTypeOptions,
} from '@/lib/billing-shared/contract-aircraft-types';
import { ContractAdsEquipmentRulesEditor, adsRuleHasFreeAllowance, isWheelchairAdsService } from './ContractAdsEquipmentRulesEditor';
import { ContractBhsVolumeEditor } from './ContractBhsVolumeEditor';
import {
  validateBhsVolumeSchedules,
} from '@/lib/billing-shared/bhs-volume-schedule';
import type { BillingBhsVolumeSchedule } from '@/lib/billing-shared/types';
import { roundBillingAmount, resolveRateToInr } from '@/lib/billing-shared/currency-convert';
import {
  canonicalizeWchrSServiceCode,
  collapseAdsEquipmentRules,
  expandAdsEquipmentRulesAcrossValidity,
} from '@/lib/billing-shared/ads-equipment-rules-validity';
import { sanitizeContractAircraftTypes } from './sanitizeContractAircraftTypes';
import { type BhsPricingMode } from '@/lib/billing-shared/exclusive-bhs-concession';

function normalizeContractCategory(value: string | undefined | null): ContractCategory {
  return value === 'Dom' || value === 'Int' || value === 'Both' ? value : 'Both';
}

const emptyForm = {
  contractNumber: '',
  customerCode: '',
  category: 'Int' as ContractCategory,
  aircraftTypes: '',
  priceValidFrom: '',
  priceValidTo: '',
  cancellationWithinHours: '',
  status: 'active' as 'draft' | 'active' | 'expired',
};

type ContractFormState = typeof emptyForm;

const DIVERTED_PERCENT_FIELDS = [
  {
    key: 'divertedDom',
    id: 'divertedDomPercent',
    label: 'Diverted domestic (%)',
    hint: 'Applied when a domestic flight is diverted.',
  },
  {
    key: 'divertedInt',
    id: 'divertedIntPercent',
    label: 'Diverted international (%)',
    hint: 'Applied when an international flight is diverted.',
  },
  {
    key: 'divertedDomBme',
    id: 'divertedDomBmePercent',
    label: 'Domestic BME (%)',
    hint: 'Applied when a domestic BME flight is diverted.',
  },
  {
    key: 'divertedIntBme',
    id: 'divertedIntBmePercent',
    label: 'International BME (%)',
    hint: 'Applied when an international BME flight is diverted.',
  },
  {
    key: 'divertedDomCargo',
    id: 'divertedDomCargoPercent',
    label: 'Domestic-Cargo (%)',
    hint: 'Applied when a Domestic-Cargo flight is diverted.',
  },
  {
    key: 'divertedIntCargo',
    id: 'divertedIntCargoPercent',
    label: 'International-Cargo (%)',
    hint: 'Applied when an International-Cargo flight is diverted.',
  },
  {
    key: 'divertedDomInt',
    id: 'divertedDomIntPercent',
    label: 'Domestic-International (%)',
    hint: 'Applied when a Domestic-International flight is diverted.',
  },
  {
    key: 'divertedIntDom',
    id: 'divertedIntDomPercent',
    label: 'International-Domestic (%)',
    hint: 'Applied when an International-Domestic flight is diverted.',
  },
] as const;

function SghaDisclosure({
  open,
  onToggle,
  title,
  description,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={cn(
          'flex w-full cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-left transition-colors',
          open
            ? 'border-[#1C0770] bg-[#1C0770] text-white hover:border-[#1C0770] hover:bg-[#16065a] hover:text-white'
            : 'border-slate-200 bg-white text-slate-800 hover:border-[#1C0770] hover:bg-slate-50 hover:text-slate-800',
        )}
      >
        <ChevronRight
          className={cn('mt-0.5 h-4 w-4 shrink-0 transition-transform', open && 'rotate-90')}
          aria-hidden
        />
        <span className="min-w-0">
          <span className={cn('block text-sm font-bold', open ? 'text-white' : 'text-slate-800')}>
            {title}
          </span>
          <span
            className={cn(
              'mt-0.5 block text-xs font-medium',
              open ? 'text-white/80' : 'text-slate-500',
            )}
          >
            {description}
          </span>
        </span>
      </button>
      {open ? children : null}
    </>
  );
}

function sghaPanelForFocus(focus: string | null | undefined): string | null {
  if (!focus) return null;
  if (DIVERTED_PERCENT_FIELDS.some((field) => field.key === focus)) return 'diverted';
  if (focus === 'returnToRamp') return 'returnToRamp';
  if (focus === 'originateTerminatePercent') return 'originate';
  if (focus === 'cancellationWithinHoursPercent' || focus === 'cancellationWithinHours') {
    return 'cancellation';
  }
  if (focus === 'technicalHandlingChargesPercent') return 'technical';
  if (focus === 'standbyChargesPercent') return 'standby';
  if (
    focus === 'filoChargesPercent' ||
    focus === 'lifoChargesPercent' ||
    focus === 'filoLifoChargesPercent'
  ) {
    return 'ferry';
  }
  if (focus === 'ronAdditionalPercent') return 'ron';
  if (focus === 'lateArrivalAdditionalPercent') return 'late';
  if (focus === 'extraGroundTimeAdditionalPercent') return 'ground';
  if (
    focus === 'splitIntArrivalDomDeparturePercent' ||
    focus === 'splitDomArrivalIntDeparturePercent'
  ) {
    return 'split';
  }
  return null;
}

type EditableSnapshotInput = {
  form: ContractFormState;
  bhsConcessionCoverage: BhsPricingMode;
  clauses: BillingContractClause[];
  flightConcessions: ContractConcessionRatesForm;
  showDivertedConcessions: boolean;
  showReturnToRampConcession: boolean;
  showOriginateTerminate: boolean;
  showCancellationWindow: boolean;
  showTechnicalHandlingCharges: boolean;
  showStandbyCharges: boolean;
  showFiloLifoCharges: boolean;
  showRonCharges: boolean;
  showLateArrivalCharges: boolean;
  showExtraGroundCharges: boolean;
  adsEquipmentRules: BillingContractAdsEquipmentRule[];
  bhsVolumeSchedules: BillingBhsVolumeSchedule[];
  selectedAircraftTypes: string[];
  contractPdf: ContractPdfState | null;
  fortnightBillingEnabled: boolean;
  fortnightEdgeDayCap: boolean;
  additionalCustomerCodes: string[];
  additionalCustomerInherit: AdditionalCustomerInheritChoice[];
  contractCategories: ContractSector[];
  billBmeEquipment: boolean;
  inrUsdInvoiceEnabled: boolean;
  inrUsdInvoiceCategories: string[];
  fortnightBillingPartCount: string;
  fortnightBillingRanges: Array<{ startDay: string; endDay: string; exchangeRatePerUsd: string }>;
  fortnightMonthRates: FortnightMonthRateForm[];
};

const LEGACY_FORTNIGHT_ROE_MONTH = '2026-08';

type AdditionalCustomerInheritChoice = {
  customerCode: string;
  concessions: boolean;
  rateCards: boolean;
  contract: boolean;
  conversionRates: boolean;
  customer: boolean;
};

const INHERIT_MASTER_OPTIONS: Array<{
  key: keyof Omit<AdditionalCustomerInheritChoice, 'customerCode'>;
  label: string;
}> = [
  { key: 'concessions', label: 'Concessions' },
  { key: 'rateCards', label: 'Rate cards' },
  { key: 'contract', label: 'Contract' },
  { key: 'conversionRates', label: 'Conversion rates' },
  { key: 'customer', label: 'Customer' },
];

function emptyInheritChoice(customerCode: string): AdditionalCustomerInheritChoice {
  return {
    customerCode,
    concessions: false,
    rateCards: false,
    contract: false,
    conversionRates: false,
    customer: false,
  };
}

type FortnightMonthRateForm = { month: string; rates: Record<string, string> };

function daysInFortnightMonth(month: string): number | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month.trim());
  if (!match) return null;
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) return null;
  return new Date(Date.UTC(Number(match[1]), monthNumber, 0)).getUTCDate();
}

function formatFortnightMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function seedFortnightMonthRates(
  ranges: Array<{ startDay: number; exchangeRatePerUsd?: number }>,
  stored?: BillingContractFortnightMonthRate[],
): FortnightMonthRateForm[] {
  if (stored && stored.length > 0) {
    return [...stored]
      .sort((left, right) => left.month.localeCompare(right.month))
      .map((entry) => ({
        month: entry.month,
        rates: Object.fromEntries(
          entry.parts.map((part) => [String(part.startDay), String(part.exchangeRatePerUsd)]),
        ),
      }));
  }
  const legacy = ranges.filter((range) => Number(range.exchangeRatePerUsd) > 0);
  if (legacy.length === 0) return [];
  return [
    {
      month: LEGACY_FORTNIGHT_ROE_MONTH,
      rates: Object.fromEntries(
        legacy.map((range) => [String(range.startDay), String(range.exchangeRatePerUsd)]),
      ),
    },
  ];
}

function buildEditableSnapshot(input: EditableSnapshotInput): string {
  return JSON.stringify(input);
}

function validatePercentageField(value: string | undefined): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return 'Enter a valid percentage.';
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return 'Enter a valid percentage.';
  if (parsed < 0 || parsed > 100) return 'Percentage must be between 0 and 100.';
  if (!Number.isInteger(parsed)) return 'Use a whole number percentage.';
  return '';
}

function validateWholeNumberField(value: string | undefined): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  if (!/^\d+$/.test(trimmed)) return 'Use whole hours only.';
  return '';
}

function validateDateRange(from: string, to: string): string {
  const fromTrimmed = from.trim();
  const toTrimmed = to.trim();
  if (!fromTrimmed || !toTrimmed) return '';
  if (toTrimmed < fromTrimmed) return 'Valid To cannot be before Valid From.';
  return '';
}

function defaultFortnightRanges(
  partCount: number,
): Array<{ startDay: string; endDay: string; exchangeRatePerUsd: string }> {
  if (!Number.isFinite(partCount) || partCount < 2) return [];
  const ranges: Array<{ startDay: string; endDay: string; exchangeRatePerUsd: string }> = [];
  const base = Math.floor(31 / partCount);
  const remainder = 31 % partCount;
  let cursor = 1;
  for (let index = 0; index < partCount; index += 1) {
    const span = base + (index < remainder ? 1 : 0);
    const startDay = cursor;
    const endDay = Math.min(31, cursor + span - 1);
    ranges.push({ startDay: String(startDay), endDay: String(endDay), exchangeRatePerUsd: '' });
    cursor = endDay + 1;
  }
  return ranges;
}

function parseContractFortnightRanges(
  ranges: Array<{ startDay: string; endDay: string; exchangeRatePerUsd: string }>,
): BillingContractFortnightBillingRange[] {
  return ranges.map((range) => ({
    startDay: Number(range.startDay),
    endDay: Number(range.endDay),
  }));
}

type Props = {
  api: BillingApi;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  record?: BillingContract | null;
  /** SGHA charge key to scroll into view when the dialog opens. */
  focusCondition?: string | null;
  /** `page` renders a full screen with a sidebar. `dialog` keeps the window. */
  presentation?: 'dialog' | 'page';
};

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function ContractFormDialog({
  api,
  open,
  onOpenChange,
  onSaved,
  record,
  focusCondition,
  presentation = 'dialog',
}: Props) {
  const visible = presentation === 'page' || open;
  const [form, setForm] = useState(emptyForm);
  const [clauses, setClauses] = useState<BillingContractClause[]>(defaultContractClauses());
  const [customers, setCustomers] = useState<BillingCustomer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [availableAircraftTypes, setAvailableAircraftTypes] = useState<string[]>([]);
  const [advanceAircraftCatalog, setAdvanceAircraftCatalog] = useState<string[]>([]);
  const [selectedAircraftTypes, setSelectedAircraftTypes] = useState<string[]>([]);
  const [loadingAircraftTypes, setLoadingAircraftTypes] = useState(false);
  const [loadingAdvanceCatalog, setLoadingAdvanceCatalog] = useState(false);
  const [flightConcessions, setFlightConcessions] =
    useState<ContractConcessionRatesForm>(emptyConcessionRatesForm());
  const [showDivertedConcessions, setShowDivertedConcessions] = useState(false);
  const [showReturnToRampConcession, setShowReturnToRampConcession] = useState(false);
  const [showOriginateTerminate, setShowOriginateTerminate] = useState(false);
  const [showCancellationWindow, setShowCancellationWindow] = useState(false);
  const [showTechnicalHandlingCharges, setShowTechnicalHandlingCharges] = useState(false);
  const [showStandbyCharges, setShowStandbyCharges] = useState(false);
  const [showFiloLifoCharges, setShowFiloLifoCharges] = useState(false);
  const [showRonCharges, setShowRonCharges] = useState(false);
  const [showLateArrivalCharges, setShowLateArrivalCharges] = useState(false);
  const [showExtraGroundCharges, setShowExtraGroundCharges] = useState(false);
  const [showSplitTurnaround, setShowSplitTurnaround] = useState(false);
  const [showVolumeRates, setShowVolumeRates] = useState(false);
  const [showAdditionalTerms, setShowAdditionalTerms] = useState(false);
  const [adsEquipmentRules, setAdsEquipmentRules] = useState<BillingContractAdsEquipmentRule[]>(
    [],
  );
  const [bhsVolumeSchedules, setBhsVolumeSchedules] = useState<BillingBhsVolumeSchedule[]>([]);
  const [contractPdf, setContractPdf] = useState<ContractPdfState | null>(null);
  const pdfTouchedRef = useRef(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [fortnightBillingEnabled, setFortnightBillingEnabled] = useState(false);
  const [fortnightEdgeDayCap, setFortnightEdgeDayCap] = useState(false);
  const [additionalCustomerCodes, setAdditionalCustomerCodes] = useState<string[]>([]);
  const [additionalCustomerInherit, setAdditionalCustomerInherit] = useState<
    AdditionalCustomerInheritChoice[]
  >([]);
  const [inheritEditor, setInheritEditor] = useState<{
    customerCode: string;
    flags: AdditionalCustomerInheritChoice;
    adding: boolean;
  } | null>(null);
  const [additionalCustomerQuery, setAdditionalCustomerQuery] = useState('');
  const [additionalCustomersOpen, setAdditionalCustomersOpen] = useState(false);
  const [contractCategories, setContractCategories] = useState<ContractSector[]>(['Int']);
  const [billBmeEquipment, setBillBmeEquipment] = useState(false);
  const [inrUsdInvoiceEnabled, setInrUsdInvoiceEnabled] = useState(false);
  const [inrUsdInvoiceCategories, setInrUsdInvoiceCategories] = useState<string[]>([]);
  const [fortnightBillingPartCount, setFortnightBillingPartCount] = useState('2');
  const [fortnightBillingRanges, setFortnightBillingRanges] = useState<
    Array<{ startDay: string; endDay: string; exchangeRatePerUsd: string }>
  >(defaultFortnightRanges(2));
  const [fortnightMonthRates, setFortnightMonthRates] = useState<FortnightMonthRateForm[]>([]);
  const [roeEditor, setRoeEditor] = useState<FortnightMonthRateForm | null>(null);
  const [adsServices, setAdsServices] = useState<BillingServiceCatalogItem[]>([]);
  const [equipmentMaster, setEquipmentMaster] = useState<EquipmentMasterRecord[]>([]);
  const [roe, setRoe] = useState<BillingExchangeRate | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('general');
  const [baselineSnapshot, setBaselineSnapshot] = useState('');
  const [bhsConcessionCoverage, setBhsConcessionCoverage] =
    useState<BhsPricingMode>('comprehensive');
  const [loadedMixedCoverage, setLoadedMixedCoverage] = useState(false);
  /** Airline-specific: concession percent applied to the AERA ceiling rate instead of the billed amount. */
  const [aeraConcessionEnabled, setAeraConcessionEnabled] = useState(false);
  const [aeraConcessionIntPercent, setAeraConcessionIntPercent] = useState('');
  const [aeraConcessionDomPercent, setAeraConcessionDomPercent] = useState('');
  const [aeraConcessionBaseline, setAeraConcessionBaseline] = useState('');
  const aeraConcessionSnapshot = JSON.stringify({
    aeraConcessionEnabled,
    aeraConcessionIntPercent,
    aeraConcessionDomPercent,
  });
  const isEdit = Boolean(record);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.customerCode === form.customerCode),
    [customers, form.customerCode],
  );

  const currentSnapshot = useMemo(
    () =>
      buildEditableSnapshot({
        form,
        bhsConcessionCoverage,
        clauses,
        flightConcessions,
        showDivertedConcessions: false,
        showReturnToRampConcession: false,
        showOriginateTerminate: false,
        showCancellationWindow: false,
        showTechnicalHandlingCharges: false,
        showStandbyCharges: false,
        showFiloLifoCharges: false,
        showRonCharges: false,
        showLateArrivalCharges: false,
        showExtraGroundCharges: false,
        adsEquipmentRules,
        bhsVolumeSchedules,
        selectedAircraftTypes,
        contractPdf,
        fortnightBillingEnabled,
        fortnightEdgeDayCap,
        additionalCustomerCodes,
        additionalCustomerInherit,
        contractCategories,
        billBmeEquipment,
        inrUsdInvoiceEnabled,
        inrUsdInvoiceCategories,
        fortnightBillingPartCount,
        fortnightBillingRanges,
        fortnightMonthRates,
      }),
    [
      form,
      bhsConcessionCoverage,
      clauses,
      flightConcessions,
      adsEquipmentRules,
      bhsVolumeSchedules,
      selectedAircraftTypes,
      contractPdf,
      fortnightBillingEnabled,
      fortnightEdgeDayCap,
      additionalCustomerCodes,
      additionalCustomerInherit,
      contractCategories,
      billBmeEquipment,
      inrUsdInvoiceEnabled,
      inrUsdInvoiceCategories,
      fortnightBillingPartCount,
      fortnightBillingRanges,
      fortnightMonthRates,
    ],
  );

  const isDirty =
    Boolean(baselineSnapshot) &&
    (currentSnapshot !== baselineSnapshot || aeraConcessionSnapshot !== aeraConcessionBaseline);

  const validationErrors = useMemo(
    () => ({
      divertedDom: validatePercentageField(flightConcessions.divertedDom),
      divertedInt: validatePercentageField(flightConcessions.divertedInt),
      divertedDomBme: validatePercentageField(flightConcessions.divertedDomBme),
      divertedIntBme: validatePercentageField(flightConcessions.divertedIntBme),
      divertedDomCargo: validatePercentageField(flightConcessions.divertedDomCargo),
      divertedIntCargo: validatePercentageField(flightConcessions.divertedIntCargo),
      divertedDomInt: validatePercentageField(flightConcessions.divertedDomInt),
      divertedIntDom: validatePercentageField(flightConcessions.divertedIntDom),
      returnToRamp: validatePercentageField(flightConcessions.returnToRamp),
      originateTerminatePercent: validatePercentageField(
        flightConcessions.originateTerminatePercent,
      ),
      cancellationWithinHoursPercent: validatePercentageField(
        flightConcessions.cancellationWithinHoursPercent,
      ),
      technicalHandlingChargesPercent: validatePercentageField(
        flightConcessions.technicalHandlingChargesPercent,
      ),
      standbyChargesPercent: validatePercentageField(flightConcessions.standbyChargesPercent),
      filoLifoChargesPercent: validatePercentageField(flightConcessions.filoLifoChargesPercent),
      filoChargesPercent: validatePercentageField(flightConcessions.filoChargesPercent),
      lifoChargesPercent: validatePercentageField(flightConcessions.lifoChargesPercent),
      ronAdditionalPercent: validatePercentageField(flightConcessions.ronAdditionalPercent),
      lateArrivalAdditionalPercent: validatePercentageField(
        flightConcessions.lateArrivalAdditionalPercent,
      ),
      extraGroundTimeAdditionalPercent: validatePercentageField(
        flightConcessions.extraGroundTimeAdditionalPercent,
      ),
      splitIntArrivalDomDeparturePercent: validatePercentageField(
        flightConcessions.splitIntArrivalDomDeparturePercent,
      ),
      splitDomArrivalIntDeparturePercent: validatePercentageField(
        flightConcessions.splitDomArrivalIntDeparturePercent,
      ),
      cancellationWithinHours: validateWholeNumberField(form.cancellationWithinHours),
      priceValidTo: validateDateRange(form.priceValidFrom, form.priceValidTo),
      bhsVolumeSchedules: validateBhsVolumeSchedules(bhsVolumeSchedules),
      fortnightBilling: (() => {
        if (!fortnightBillingEnabled) return '';
        if (!/^\d+$/.test(fortnightBillingPartCount.trim())) {
          return 'Enter a whole number of parts.';
        }
        const partCount = Number(fortnightBillingPartCount);
        if (partCount < 2 || partCount > 31) {
          return 'Parts must be between 2 and 31.';
        }
        if (fortnightBillingRanges.length !== partCount) {
          return 'Define a date range for each billing part.';
        }
        const parsed = parseContractFortnightRanges(fortnightBillingRanges);
        if (parsed.some((row) => !Number.isFinite(row.startDay) || !Number.isFinite(row.endDay))) {
          return 'Every part requires start and end day.';
        }
        const roeMonth =
          roeEditor?.month && daysInFortnightMonth(roeEditor.month) ? roeEditor.month : '';
        const monthLength = roeMonth ? daysInFortnightMonth(roeMonth) : null;
        const maxDay = monthLength ?? 31;
        if (parsed.some((row) => row.startDay < 1 || row.endDay > maxDay || row.startDay > row.endDay)) {
          return monthLength
            ? `Each range must stay inside day 1 to ${monthLength} for ${formatFortnightMonth(roeMonth)}.`
            : 'Each range must be valid and stay inside 1 to 31.';
        }
        const sorted = [...parsed].sort((left, right) => left.startDay - right.startDay);
        if (sorted[0]?.startDay !== 1) return 'First billing part must start at day 1.';
        let expectedStart = 1;
        for (const row of sorted) {
          if (row.startDay !== expectedStart) {
            return row.startDay < expectedStart
              ? 'Date ranges cannot overlap.'
              : 'Date ranges cannot have gaps.';
          }
          expectedStart = row.endDay + 1;
        }
        const closingDay = sorted[sorted.length - 1]?.endDay ?? 0;
        if (monthLength) {
          if (closingDay !== monthLength) {
            return `Last billing part must end on day ${monthLength} for ${formatFortnightMonth(roeMonth)}.`;
          }
        } else if (closingDay < 28 || closingDay > 31) {
          return 'Last billing part must end on the last day of the month (28, 29, 30, or 31).';
        }
        const months = roeEditor?.month
          ? [
              ...fortnightMonthRates.filter((entry) => entry.month !== roeEditor.month),
              roeEditor,
            ]
          : fortnightMonthRates;
        for (const entry of months) {
          if (!/^\d{4}-\d{2}$/.test(entry.month)) return 'Choose a month for the ROE.';
          for (const row of parsed) {
            const rate = Number(entry.rates[String(row.startDay)]);
            if (!Number.isFinite(rate) || rate <= 0) {
              return `${formatFortnightMonth(entry.month)} needs a USD to INR rate for every part.`;
            }
          }
        }
        return '';
      })(),
    }),
    [
      flightConcessions,
      form.cancellationWithinHours,
      form.priceValidFrom,
      form.priceValidTo,
      bhsVolumeSchedules,
      fortnightBillingEnabled,
      fortnightEdgeDayCap,
      fortnightBillingPartCount,
      fortnightBillingRanges,
      fortnightMonthRates,
      roeEditor,
    ],
  );

  const hasValidationErrors = useMemo(
    () => Object.values(validationErrors).some(Boolean),
    [validationErrors],
  );

  useEffect(() => {
    if (validationErrors.bhsVolumeSchedules) setShowVolumeRates(true);
    const divertedError = DIVERTED_PERCENT_FIELDS.some((field) => validationErrors[field.key]);
    const termError =
      divertedError ||
      Boolean(
        validationErrors.returnToRamp ||
          validationErrors.originateTerminatePercent ||
          validationErrors.cancellationWithinHoursPercent ||
          validationErrors.cancellationWithinHours ||
          validationErrors.technicalHandlingChargesPercent ||
          validationErrors.standbyChargesPercent ||
          validationErrors.filoChargesPercent ||
          validationErrors.lifoChargesPercent ||
          validationErrors.ronAdditionalPercent ||
          validationErrors.lateArrivalAdditionalPercent ||
          validationErrors.extraGroundTimeAdditionalPercent,
      );
    if (
      validationErrors.splitIntArrivalDomDeparturePercent ||
      validationErrors.splitDomArrivalIntDeparturePercent
    ) {
      setShowSplitTurnaround(true);
    }
    if (!termError) return;
    setShowAdditionalTerms(true);
    if (divertedError) setShowDivertedConcessions(true);
    if (validationErrors.returnToRamp) setShowReturnToRampConcession(true);
    if (validationErrors.originateTerminatePercent) setShowOriginateTerminate(true);
    if (validationErrors.cancellationWithinHoursPercent || validationErrors.cancellationWithinHours) {
      setShowCancellationWindow(true);
    }
    if (validationErrors.technicalHandlingChargesPercent) setShowTechnicalHandlingCharges(true);
    if (validationErrors.standbyChargesPercent) setShowStandbyCharges(true);
    if (validationErrors.filoChargesPercent || validationErrors.lifoChargesPercent) {
      setShowFiloLifoCharges(true);
    }
    if (validationErrors.ronAdditionalPercent) setShowRonCharges(true);
    if (validationErrors.lateArrivalAdditionalPercent) setShowLateArrivalCharges(true);
    if (validationErrors.extraGroundTimeAdditionalPercent) setShowExtraGroundCharges(true);
  }, [validationErrors]);

  const resolvedRoeRate = useMemo(() => resolveRateToInr(roe?.rateToINR), [roe?.rateToINR]);

  const setFlightConcessionField = (key: keyof ContractConcessionRatesForm, value: string) => {
    setFlightConcessions((prev) => ({ ...prev, [key]: value }));
  };

  const resetFlightConcessions = () => {
    setFlightConcessions({
      ...emptyConcessionRatesForm(),
    });
    setShowDivertedConcessions(false);
    setShowReturnToRampConcession(false);
    setShowOriginateTerminate(false);
    setShowCancellationWindow(false);
    setShowTechnicalHandlingCharges(false);
    setShowStandbyCharges(false);
    setShowFiloLifoCharges(false);
    setShowRonCharges(false);
    setShowLateArrivalCharges(false);
    setShowExtraGroundCharges(false);
    setShowSplitTurnaround(false);
    setShowAdditionalTerms(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isDirty && !saving) {
      const discard = window.confirm(
        'You have unsaved contract changes. Discard changes?',
      );
      if (!discard) return;
    }
    onOpenChange(nextOpen);
  };

  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const res = await api.listCustomers({ limit: 5000, active: 'all' });
      setCustomers((res.data as BillingCustomer[]) ?? []);
    } catch {
      setCustomers([]);
    } finally {
      setLoadingCustomers(false);
    }
  }, [api]);

  const loadAdsServices = useCallback(async () => {
    try {
      const res = await api.listServiceCatalog();
      const data = res.data as { items?: BillingServiceCatalogItem[] };
      setAdsServices(data.items ?? []);
    } catch {
      setAdsServices([]);
    }
  }, [api]);

  const loadEquipmentMaster = useCallback(async () => {
    try {
      const res = await api.listEquipmentMaster();
      setEquipmentMaster(res.data ?? []);
    } catch {
      setEquipmentMaster([]);
    }
  }, [api]);

  const loadAdvanceAircraftCatalog = useCallback(async () => {
    setLoadingAdvanceCatalog(true);
    try {
      setAdvanceAircraftCatalog(await fetchAdvanceAircraftMasterTypes());
    } catch {
      setAdvanceAircraftCatalog([]);
    } finally {
      setLoadingAdvanceCatalog(false);
    }
  }, []);

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

  useEffect(() => {
    if (!visible) return;
    setError('');
    setActiveTab(focusCondition ? 'sgha' : 'general');
    void loadCustomers();
    void loadAdsServices();
    void loadEquipmentMaster();
    void loadAdvanceAircraftCatalog();
    if (record) {
      const nextSelectedAircraftTypes = sanitizeContractAircraftTypes(record.aircraftTypes ?? []);
      const nextForm: ContractFormState = {
        contractNumber: record.contractNumber,
        customerCode: record.customerCode,
        category: normalizeContractCategory(record.category),
        aircraftTypes: (record.aircraftTypes ?? []).join(', '),
        priceValidFrom: record.priceValidFrom.slice(0, 10),
        priceValidTo: record.priceValidTo.slice(0, 10),
        cancellationWithinHours:
          record.cancellationWithinHours != null
            ? String(record.cancellationWithinHours)
            : '',
        status: record.status,
      };
      const nextClauses = clausesFromContract(record);
      const nextFlightConcessions = {
        ...emptyConcessionRatesForm(),
        ...conditionalChargesFromContract(record),
      };
      if (
        !String(nextFlightConcessions.filoChargesPercent ?? '').trim() &&
        !String(nextFlightConcessions.lifoChargesPercent ?? '').trim() &&
        String(nextFlightConcessions.filoLifoChargesPercent ?? '').trim()
      ) {
        nextFlightConcessions.filoChargesPercent = nextFlightConcessions.filoLifoChargesPercent;
        nextFlightConcessions.lifoChargesPercent = nextFlightConcessions.filoLifoChargesPercent;
        nextFlightConcessions.filoLifoChargesPercent = '';
      }
      const focusedPanel = sghaPanelForFocus(focusCondition);
      const nextAdsEquipmentRules = collapseAdsEquipmentRules(
        (record.adsEquipmentRules ?? []).map((rule) => {
        const aircraftTypes = (rule.aircraftTypes ?? [])
          .map((a) => String(a ?? '').trim().toUpperCase())
          .filter(Boolean);
        const legacy = rule.aircraftType?.trim().toUpperCase();
        return {
          serviceCode: canonicalizeWchrSServiceCode(rule.serviceCode) || rule.serviceCode || '',
          freePerFlight: rule.freePerFlight,
          freePerFlightNb:
            rule.freePerFlightNb ??
            (isWheelchairAdsService(rule.serviceCode) ? rule.freePerFlight : undefined),
          freePerFlightWb:
            rule.freePerFlightWb ??
            (isWheelchairAdsService(rule.serviceCode) ? rule.freePerFlight : undefined),
          alwaysChargeable: Boolean(rule.alwaysChargeable),
          cumulativeMonthlyBasis: Boolean(rule.cumulativeMonthlyBasis),
          includedForAds: rule.includedForAds !== false,
          unitPriceINR:
            rule.unitPriceINR != null && Number.isFinite(Number(rule.unitPriceINR))
              ? roundBillingAmount(Number(rule.unitPriceINR))
              : rule.unitPriceINR,
          unitPriceUSD:
            rule.unitPriceUSD != null && Number.isFinite(Number(rule.unitPriceUSD))
              ? roundBillingAmount(Number(rule.unitPriceUSD))
              : rule.unitPriceUSD,
          uom: rule.uom ?? 'EA',
          aircraftTypes:
            aircraftTypes.length > 0
              ? aircraftTypes
              : legacy
                ? [legacy]
                : (record.aircraftTypes ?? [])
                    .map((a) => String(a ?? '').trim().toUpperCase())
                    .filter(Boolean),
          effectiveMonth: undefined,
          category: rule.category,
          remarks: rule.remarks,
        };
      }),
      );
      pdfTouchedRef.current = false;
      const nextContractPdf =
        record.contractPdfBase64 && record.contractPdfFileName
          ? {
              fileName: record.contractPdfFileName,
              contentType: record.contractPdfContentType || 'application/pdf',
              base64: record.contractPdfBase64,
              uploadedAt: record.contractPdfUploadedAt
                ? String(record.contractPdfUploadedAt)
                : undefined,
            }
          : null;
      const nextFortnightEnabled = Boolean(record.fortnightBillingEnabled);
      const nextFortnightPartCount = String(record.fortnightBillingPartCount ?? 2);
      const nextFortnightRanges =
        record.fortnightBillingRanges && record.fortnightBillingRanges.length > 0
          ? record.fortnightBillingRanges.map((row) => ({
              startDay: String(row.startDay),
              endDay: String(row.endDay),
              exchangeRatePerUsd:
                row.exchangeRatePerUsd != null && Number(row.exchangeRatePerUsd) > 0
                  ? String(row.exchangeRatePerUsd)
                  : '',
            }))
          : defaultFortnightRanges(Number(nextFortnightPartCount));

      setForm(nextForm);
      setSelectedAircraftTypes(nextSelectedAircraftTypes);
      setClauses(nextClauses);
      setFlightConcessions(nextFlightConcessions);
      setShowVolumeRates(false);
      setShowAdditionalTerms(focusedPanel != null && focusedPanel !== 'split');
      setShowDivertedConcessions(focusedPanel === 'diverted');
      setShowReturnToRampConcession(focusedPanel === 'returnToRamp');
      setShowOriginateTerminate(focusedPanel === 'originate');
      setShowCancellationWindow(focusedPanel === 'cancellation');
      setShowTechnicalHandlingCharges(focusedPanel === 'technical');
      setShowStandbyCharges(focusedPanel === 'standby');
      setShowFiloLifoCharges(focusedPanel === 'ferry');
      setShowRonCharges(focusedPanel === 'ron');
      setShowLateArrivalCharges(focusedPanel === 'late');
      setShowExtraGroundCharges(focusedPanel === 'ground');
      setShowSplitTurnaround(focusedPanel === 'split');
      setAdsEquipmentRules(nextAdsEquipmentRules);
      setBhsVolumeSchedules(record.bhsVolumeSchedules ?? []);
      setContractPdf(nextContractPdf);
      setFortnightBillingEnabled(nextFortnightEnabled);
      setFortnightEdgeDayCap(Boolean(record.fortnightEdgeDayCap));
      setAdditionalCustomersOpen(false);
      setAdditionalCustomerCodes(
        (record.additionalCustomerCodes ?? [])
          .map((code) => String(code).trim().toUpperCase())
          .filter((code) => code && code !== record.customerCode),
      );
      setAdditionalCustomerInherit(
        (record.additionalCustomerInherit ?? []).map((row) => ({
          customerCode: String(row.customerCode).trim().toUpperCase(),
          concessions: Boolean(row.concessions),
          rateCards: Boolean(row.rateCards),
          contract: Boolean(row.contract),
          conversionRates: Boolean(row.conversionRates),
          customer: Boolean(row.customer),
        })),
      );
      setInheritEditor(null);
      setContractCategories(contractSectorsFromRecord(record));
      setBillBmeEquipment(record.billBmeEquipment === true);
      setInrUsdInvoiceEnabled(record.inrUsdInvoiceEnabled === true);
      setInrUsdInvoiceCategories(record.inrUsdInvoiceCategories ?? []);
      setFortnightBillingPartCount(nextFortnightPartCount);
      setFortnightBillingRanges(nextFortnightRanges);
      const nextMonthRates = seedFortnightMonthRates(
        record.fortnightBillingRanges ?? [],
        record.fortnightBillingMonthRates,
      );
      setFortnightMonthRates(nextMonthRates);
      setRoeEditor(null);
      const nextBhsCoverage: BhsPricingMode =
        record.bhsConcessionCoverage === 'non_comprehensive'
          ? 'non_comprehensive'
          : 'comprehensive';
      setLoadedMixedCoverage(record.bhsConcessionCoverage === 'mixed');
      setBhsConcessionCoverage(nextBhsCoverage);
      const nextAeraEnabled = record.concessionBase === 'aera_ceiling';
      const nextAeraInt =
        nextAeraEnabled && record.concessionRates?.int != null ? String(record.concessionRates.int) : '';
      const nextAeraDom =
        nextAeraEnabled && record.concessionRates?.dom != null ? String(record.concessionRates.dom) : '';
      setAeraConcessionEnabled(nextAeraEnabled);
      setAeraConcessionIntPercent(nextAeraInt);
      setAeraConcessionDomPercent(nextAeraDom);
      setAeraConcessionBaseline(
        JSON.stringify({
          aeraConcessionEnabled: nextAeraEnabled,
          aeraConcessionIntPercent: nextAeraInt,
          aeraConcessionDomPercent: nextAeraDom,
        }),
      );
      setBaselineSnapshot(
        buildEditableSnapshot({
          form: nextForm,
          bhsConcessionCoverage: nextBhsCoverage,
          clauses: nextClauses,
          flightConcessions: nextFlightConcessions,
          showDivertedConcessions: false,
          showReturnToRampConcession: false,
          showOriginateTerminate: false,
          showCancellationWindow: false,
          showTechnicalHandlingCharges: false,
          showStandbyCharges: false,
          showFiloLifoCharges: false,
          showRonCharges: false,
          showLateArrivalCharges: false,
          showExtraGroundCharges: false,
          adsEquipmentRules: nextAdsEquipmentRules,
          bhsVolumeSchedules: record.bhsVolumeSchedules ?? [],
          selectedAircraftTypes: nextSelectedAircraftTypes,
          contractPdf: nextContractPdf,
          fortnightBillingEnabled: nextFortnightEnabled,
          fortnightEdgeDayCap: Boolean(record.fortnightEdgeDayCap),
          additionalCustomerCodes: (record.additionalCustomerCodes ?? [])
            .map((code) => String(code).trim().toUpperCase())
            .filter((code) => code && code !== record.customerCode),
          additionalCustomerInherit: (record.additionalCustomerInherit ?? []).map((row) => ({
            customerCode: String(row.customerCode).trim().toUpperCase(),
            concessions: Boolean(row.concessions),
            rateCards: Boolean(row.rateCards),
            contract: Boolean(row.contract),
            conversionRates: Boolean(row.conversionRates),
            customer: Boolean(row.customer),
          })),
          contractCategories: contractSectorsFromRecord(record),
          billBmeEquipment: record.billBmeEquipment === true,
          inrUsdInvoiceEnabled: record.inrUsdInvoiceEnabled === true,
          inrUsdInvoiceCategories: record.inrUsdInvoiceCategories ?? [],
          fortnightBillingPartCount: nextFortnightPartCount,
          fortnightBillingRanges: nextFortnightRanges,
          fortnightMonthRates: nextMonthRates,
        }),
      );
    } else {
      const nextForm: ContractFormState = { ...emptyForm, status: 'active' };
      const nextClauses = defaultContractClauses();
      const nextFlightConcessions = emptyConcessionRatesForm();
      setForm(nextForm);
      setSelectedAircraftTypes([]);
      setClauses(nextClauses);
      resetFlightConcessions();
      setShowVolumeRates(false);
      setAdsEquipmentRules([]);
      setBhsVolumeSchedules([]);
      pdfTouchedRef.current = false;
      setContractPdf(null);
      setFortnightBillingEnabled(false);
      setFortnightEdgeDayCap(false);
      setAdditionalCustomersOpen(false);
      setAdditionalCustomerCodes([]);
      setAdditionalCustomerInherit([]);
      setInheritEditor(null);
      setContractCategories(['Int']);
      setBillBmeEquipment(false);
      setInrUsdInvoiceEnabled(false);
      setInrUsdInvoiceCategories([]);
      setFortnightBillingPartCount('2');
      setFortnightBillingRanges(defaultFortnightRanges(2));
      setFortnightMonthRates([]);
      setRoeEditor(null);
      setLoadedMixedCoverage(false);
      setBhsConcessionCoverage('comprehensive');
      setAeraConcessionEnabled(false);
      setAeraConcessionIntPercent('');
      setAeraConcessionDomPercent('');
      setAeraConcessionBaseline(
        JSON.stringify({
          aeraConcessionEnabled: false,
          aeraConcessionIntPercent: '',
          aeraConcessionDomPercent: '',
        }),
      );
      setBaselineSnapshot(
        buildEditableSnapshot({
          form: nextForm,
          bhsConcessionCoverage: 'comprehensive',
          clauses: nextClauses,
          flightConcessions: nextFlightConcessions,
          showDivertedConcessions: false,
          showReturnToRampConcession: false,
          showOriginateTerminate: false,
          showCancellationWindow: false,
          showTechnicalHandlingCharges: false,
          showStandbyCharges: false,
          showFiloLifoCharges: false,
          showRonCharges: false,
          showLateArrivalCharges: false,
          showExtraGroundCharges: false,
          adsEquipmentRules: [],
          bhsVolumeSchedules: [],
          selectedAircraftTypes: [],
          contractPdf: null,
          fortnightBillingEnabled: false,
          fortnightEdgeDayCap: false,
          additionalCustomerCodes: [],
          additionalCustomerInherit: [],
          contractCategories: ['Int'],
          billBmeEquipment: false,
          inrUsdInvoiceEnabled: false,
          inrUsdInvoiceCategories: [],
          fortnightBillingPartCount: '2',
          fortnightBillingRanges: defaultFortnightRanges(2),
          fortnightMonthRates: [],
        }),
      );
    }
    setAvailableAircraftTypes([]);
  }, [visible, record, focusCondition, loadCustomers, loadAdsServices, loadEquipmentMaster, loadAdvanceAircraftCatalog]);

  useEffect(() => {
    if (!visible || !focusCondition) return;
    const fieldId = contractChargeFieldId(focusCondition);
    const timer = window.setTimeout(() => {
      const el = document.getElementById(fieldId);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (el instanceof HTMLElement) el.focus({ preventScroll: true });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [visible, focusCondition, activeTab]);

  useEffect(() => {
    if (!visible) return;
    void loadRoe(form.priceValidFrom);
  }, [visible, form.priceValidFrom, loadRoe]);

  useEffect(() => {
    if (!visible || isEdit) return;
    setSelectedAircraftTypes([]);
  }, [form.customerCode, isEdit, visible]);

  useEffect(() => {
    if (!visible) return;
    const customerCode = form.customerCode.trim();
    const validFrom = form.priceValidFrom;
    const validTo = form.priceValidTo;
    if (!customerCode || !validFrom || !validTo || validFrom > validTo) {
      setAvailableAircraftTypes([]);
      return;
    }

    let cancelled = false;
    setLoadingAircraftTypes(true);
    void fetchContractAircraftTypeOptions({
      api,
      customerCode,
      validFrom,
      validTo,
      customer: selectedCustomer,
    })
      .then((options) => {
        if (cancelled) return;
        setAvailableAircraftTypes(options);
        setSelectedAircraftTypes((prev) => {
          if (prev.length > 0) return prev;
          return options;
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingAircraftTypes(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    api,
    form.customerCode,
    form.priceValidFrom,
    form.priceValidTo,
    visible,
    selectedCustomer,
  ]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      aircraftTypes: selectedAircraftTypes.join(', '),
    }));
  }, [selectedAircraftTypes]);

  const applyAircraftToEquipmentRules = (nextAircraft: string[]) => {
    const normalized = nextAircraft
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
    setSelectedAircraftTypes(normalized);
    if (normalized.length === 0) return;
    setAdsEquipmentRules((rules) =>
      rules.map((rule) => ({
        ...rule,
        aircraftTypes: [...normalized],
        aircraftType: normalized.length === 1 ? normalized[0] : undefined,
      })),
    );
  };

  const handleFortnightPartCountChange = (value: string) => {
    setFortnightBillingPartCount(value);
    if (!/^\d+$/.test(value.trim())) return;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 2 || parsed > 31) return;
    setFortnightBillingRanges((prev) => {
      if (prev.length === parsed) return prev;
      const fallback = defaultFortnightRanges(parsed);
      return Array.from({ length: parsed }, (_, index) => prev[index] ?? fallback[index]);
    });
  };

  const blankRoeRates = () =>
    Object.fromEntries(
      fortnightBillingRanges.map((range) => [String(Number(range.startDay)), '']),
    );

  const openRoeEditor = (existing?: FortnightMonthRateForm) => {
    setError('');
    setRoeEditor(
      existing
        ? {
            month: existing.month,
            rates: {
              ...blankRoeRates(),
              ...existing.rates,
            },
          }
        : { month: '', rates: blankRoeRates() },
    );
  };

  const commitRoeEditor = () => {
    if (!roeEditor) return;
    if (!/^\d{4}-\d{2}$/.test(roeEditor.month)) {
      setError('Choose a month for the ROE.');
      return;
    }
    for (const range of fortnightBillingRanges) {
      const rate = Number(roeEditor.rates[String(Number(range.startDay))]);
      if (!Number.isFinite(rate) || rate <= 0) {
        setError(`${formatFortnightMonth(roeEditor.month)} needs a USD to INR rate for every part.`);
        return;
      }
    }
    const saved = roeEditor;
    setFortnightMonthRates((prev) =>
      [...prev.filter((entry) => entry.month !== saved.month), saved].sort((left, right) =>
        left.month.localeCompare(right.month),
      ),
    );
    setRoeEditor(null);
    setError('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (hasValidationErrors) {
      setError('Fix the highlighted input errors before saving the contract.');
      return;
    }

    setSaving(true);

    try {
      const aircraftTypes = selectedAircraftTypes
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean);
      const conditionalCharges = parseConditionalChargesForm(flightConcessions);
      const cancellationWithinHours = form.cancellationWithinHours.trim();
      const cancellationWithinHoursValue = cancellationWithinHours
        ? Number(cancellationWithinHours)
        : undefined;
      const normalizedCancellationWithinHours =
        cancellationWithinHoursValue != null && Number.isFinite(cancellationWithinHoursValue)
          ? cancellationWithinHoursValue
          : undefined;

      const clausePayload = clauses.map((c) => ({
        clauseType: c.clauseType,
        label: String(c.label ?? '').trim() || undefined,
        body: String(c.body ?? ''),
        appliesTo: c.appliesTo,
        percent:
          c.percent == null || !Number.isFinite(Number(c.percent))
            ? undefined
            : Number(c.percent),
        amount:
          c.amount == null || !Number.isFinite(Number(c.amount))
            ? undefined
            : Number(c.amount),
        validFrom: c.validFrom ? String(c.validFrom).slice(0, 10) : undefined,
        validTo: c.validTo ? String(c.validTo).slice(0, 10) : undefined,
      }));

      const adsRulesPayload = expandAdsEquipmentRulesAcrossValidity(
        adsEquipmentRules,
        form.priceValidFrom,
        form.priceValidTo,
      )
        .map((rule) => {
          const fromRule = (rule.aircraftTypes ?? [])
            .map((a) => a.trim().toUpperCase())
            .filter(Boolean);
          const selectedAircraft = fromRule.length > 0 ? fromRule : aircraftTypes;
          return {
            serviceCode: canonicalizeWchrSServiceCode(rule.serviceCode) || String(rule.serviceCode ?? '').trim(),
            freePerFlight: rule.alwaysChargeable ? 0 : rule.freePerFlight,
            freePerFlightNb: rule.alwaysChargeable ? 0 : rule.freePerFlightNb,
            freePerFlightWb: rule.alwaysChargeable ? 0 : rule.freePerFlightWb,
            alwaysChargeable: Boolean(rule.alwaysChargeable),
            cumulativeMonthlyBasis:
              !rule.alwaysChargeable &&
              adsRuleHasFreeAllowance(rule) &&
              Boolean(rule.cumulativeMonthlyBasis),
            includedForAds: rule.includedForAds !== false,
            unitPriceINR:
              rule.unitPriceINR == null
                ? undefined
                : roundBillingAmount(Number(rule.unitPriceINR)),
            unitPriceUSD:
              rule.unitPriceUSD == null
                ? undefined
                : roundBillingAmount(Number(rule.unitPriceUSD)),
            uom: String(rule.uom ?? '').trim() || 'EA',
            aircraftTypes: selectedAircraft,
            aircraftType: selectedAircraft.length === 1 ? selectedAircraft[0] : undefined,
            effectiveMonth: undefined,
            category: String(rule.category ?? '').trim() || form.category,
            remarks: String(rule.remarks ?? '').trim() || undefined,
          };
        })
        .filter((rule) => rule.serviceCode);

      const pdfPayload = !pdfTouchedRef.current
        ? {}
        : contractPdf
          ? {
              contractPdfFileName: contractPdf.fileName,
              contractPdfContentType: contractPdf.contentType || 'application/pdf',
              contractPdfBase64: contractPdf.base64,
              contractPdfUploadedAt: contractPdf.uploadedAt || new Date().toISOString(),
            }
          : {
              contractPdfFileName: '',
              contractPdfContentType: '',
              contractPdfBase64: '',
              contractPdfUploadedAt: undefined as string | undefined,
            };
      if (adsRulesPayload.some((rule) => (rule.aircraftTypes?.length ?? 0) === 0)) {
        setError('Select at least one aircraft for each ADS equipment rule.');
        setSaving(false);
        return;
      }

      const volumePayload = bhsVolumeSchedules.map((schedule) => ({
        chargeKind: 'comprehensive' as const,
        flightScope: schedule.flightScope,
        carrierKind: schedule.carrierKind ?? 'any',
        allocation: schedule.allocation,
        overridesSavedRate: schedule.overridesSavedRate !== false,
        effectiveFrom: schedule.effectiveFrom?.slice(0, 10) || undefined,
        effectiveTo: schedule.effectiveTo?.slice(0, 10) || undefined,
        label: schedule.label?.trim() || undefined,
        note: schedule.note?.trim() || undefined,
        bands: schedule.bands.map((band) => ({
          fromCount: Math.trunc(Number(band.fromCount)),
          toCount:
            band.toCount == null || !Number.isFinite(Number(band.toCount))
              ? null
              : Math.trunc(Number(band.toCount)),
          unitPriceINR: Number(band.unitPriceINR),
        })),
      }));

      // Airline-specific "x% of the AERA ceiling rate" concession.
      const aeraInt = aeraConcessionIntPercent.trim() === '' ? null : Number(aeraConcessionIntPercent);
      const aeraDom = aeraConcessionDomPercent.trim() === '' ? null : Number(aeraConcessionDomPercent);
      const aeraActive = aeraConcessionEnabled && bhsConcessionCoverage === 'non_comprehensive';
      if (aeraActive) {
        const bad = (v: number | null) => v != null && (!Number.isFinite(v) || v < 0 || v > 100);
        if (bad(aeraInt) || bad(aeraDom)) {
          setError('AERA concession percents must be between 0 and 100.');
          setSaving(false);
          return;
        }
        if (aeraInt == null && aeraDom == null) {
          setError('Enter the AERA concession percent for international and/or domestic flights.');
          setSaving(false);
          return;
        }
      }
      const aeraConcessionPayload: Record<string, unknown> = aeraActive
        ? {
            concessionBase: 'aera_ceiling',
            concessionRatesOverrideStation: true,
            concessionRates: {
              ...(record?.concessionRates ?? {}),
              ...(aeraInt != null ? { int: aeraInt } : {}),
              ...(aeraDom != null ? { dom: aeraDom } : {}),
            },
          }
        : record?.concessionBase === 'aera_ceiling'
          ? { concessionBase: 'invoice_amount', concessionRatesOverrideStation: false }
          : { concessionBase: 'invoice_amount' };
      const fortnightRangesPayload = parseContractFortnightRanges(fortnightBillingRanges);
      const fortnightPartCountPayload = Number(fortnightBillingPartCount);
      const monthsForSave = (
        roeEditor?.month
          ? [
              ...fortnightMonthRates.filter((entry) => entry.month !== roeEditor.month),
              roeEditor,
            ]
          : fortnightMonthRates
      ).sort((left, right) => left.month.localeCompare(right.month));
      const fortnightMonthRatesPayload: BillingContractFortnightMonthRate[] = monthsForSave.map(
        (entry) => ({
          month: entry.month,
          parts: fortnightBillingRanges.map((range) => ({
            startDay: Number(range.startDay),
            exchangeRatePerUsd: Number(entry.rates[String(Number(range.startDay))]),
          })),
        }),
      );

      if (isEdit && record) {
        await api.updateContract(record._id, {
          category: legacyCategoryFromSectors(contractCategories),
          categories: contractCategories,
          priceValidFrom: form.priceValidFrom,
          priceValidTo: form.priceValidTo,
          aircraftTypes,
          conditionalCharges,
          cancellationWithinHours: normalizedCancellationWithinHours,
          clauses: clausePayload,
          adsBillingEnabled: adsRulesPayload.length > 0,
          billBmeEquipment,
          inrUsdInvoiceEnabled,
          inrUsdInvoiceCategories: inrUsdInvoiceEnabled ? inrUsdInvoiceCategories : [],
          adsEquipmentRules: adsRulesPayload,
          bhsVolumeSchedules: volumePayload,
          bhsConcessionCoverage,
          extendedRoyaltyEnabled: false,
          ...aeraConcessionPayload,
          fortnightBillingEnabled,
          fortnightEdgeDayCap,
          additionalCustomerCodes: additionalCustomerCodes.filter(
            (code) => code !== form.customerCode,
          ),
          additionalCustomerInherit: additionalCustomerInherit.filter((row) =>
            additionalCustomerCodes.includes(row.customerCode),
          ),
          fortnightBillingPartCount: fortnightBillingEnabled
            ? fortnightPartCountPayload
            : undefined,
          fortnightBillingRanges: fortnightBillingEnabled ? fortnightRangesPayload : [],
          fortnightBillingMonthRates: fortnightBillingEnabled ? fortnightMonthRatesPayload : [],
          status: 'active',
          ...pdfPayload,
        });
      } else {
        if (
          !form.contractNumber.trim() ||
          !form.customerCode ||
          !form.priceValidFrom ||
          !form.priceValidTo
        ) {
          setError('Contract number, customer, and valid dates are required.');
          setSaving(false);
          return;
        }

        const body: Record<string, unknown> = {
          contractNumber: form.contractNumber.trim(),
          customerCode: form.customerCode,
          category: legacyCategoryFromSectors(contractCategories),
          categories: contractCategories,
          priceValidFrom: form.priceValidFrom,
          priceValidTo: form.priceValidTo,
          aircraftTypes,
          conditionalCharges,
          cancellationWithinHours: normalizedCancellationWithinHours,
          clauses: clausePayload,
          adsBillingEnabled: adsRulesPayload.length > 0,
          billBmeEquipment,
          inrUsdInvoiceEnabled,
          inrUsdInvoiceCategories: inrUsdInvoiceEnabled ? inrUsdInvoiceCategories : [],
          adsEquipmentRules: adsRulesPayload,
          bhsVolumeSchedules: volumePayload,
          bhsConcessionCoverage,
          extendedRoyaltyEnabled: false,
          ...aeraConcessionPayload,
          fortnightBillingEnabled,
          fortnightEdgeDayCap,
          additionalCustomerCodes: additionalCustomerCodes.filter(
            (code) => code !== form.customerCode,
          ),
          additionalCustomerInherit: additionalCustomerInherit.filter((row) =>
            additionalCustomerCodes.includes(row.customerCode),
          ),
          fortnightBillingPartCount: fortnightBillingEnabled
            ? fortnightPartCountPayload
            : undefined,
          fortnightBillingRanges: fortnightBillingEnabled ? fortnightRangesPayload : [],
          fortnightBillingMonthRates: fortnightBillingEnabled ? fortnightMonthRatesPayload : [],
          ...pdfPayload,
        };

        await api.createContract(body);
      }

      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save contract');
    } finally {
      setSaving(false);
    }
  };

  const formTabs = [
    {
      value: 'general',
      label: 'General',
      hint: 'Identity & validity',
      short: 'G',
    },
    {
      value: 'aircraft',
      label: 'Aircraft',
      hint: 'Covered types',
      short: 'A',
    },
    {
      value: 'sgha',
      label: 'SGHA',
      hint: 'Concession rates',
      short: 'S',
    },
    {
      value: 'clauses',
      label: 'Clauses',
      hint: 'Terms & ADS',
      short: 'C',
    },
    {
      value: 'document',
      label: 'Document',
      hint: 'Contract PDF',
      short: 'P',
    },
  ] as const;

  useEffect(() => {
    if (!visible || !record?._id || !record.contractPdfFileName || record.contractPdfBase64) return;
    let cancelled = false;
    void api
      .getContractSignedPdf(record._id)
      .then(async (blob) => {
        if (cancelled) return;
        const base64 = await blobToBase64(blob);
        if (cancelled) return;
        setContractPdf({
          fileName: record.contractPdfFileName || 'contract.pdf',
          contentType: record.contractPdfContentType || blob.type || 'application/pdf',
          base64,
          uploadedAt: record.contractPdfUploadedAt
            ? String(record.contractPdfUploadedAt)
            : undefined,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api, visible, record]);

  const editorHeader = presentation === 'page' ? (
    <header className="fixed inset-x-0 top-[3.3rem] z-30 flex h-10 items-center border-b border-slate-200 bg-white px-4">
      <nav
        className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3"
        aria-label="Contract sections"
      >
        {formTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            title={tab.hint}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-semibold transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--billing-accent)]/40',
              activeTab === tab.value ? contractUi.railItemActive : contractUi.railItemIdle,
            )}
            aria-current={activeTab === tab.value ? 'page' : undefined}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <button
        type="button"
        onClick={() => handleOpenChange(false)}
        className={cn(contractUi.btnSecondary, 'ml-auto')}
      >
        Back to contracts
      </button>
    </header>
  ) : (
    <DialogHeader className={contractUi.dialogHeader}>
      <div className="flex flex-wrap items-center gap-2">
        <DialogTitle className="text-white">
          {isEdit ? 'Edit contract' : 'New contract'}
        </DialogTitle>
        {isDirty ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F1FF5E]/50 bg-[#F1FF5E]/25 px-2 py-0.5 text-[11px] font-bold text-[#F1FF5E]">
            <span className={contractUi.dirtyDot} aria-hidden />
            Unsaved
          </span>
        ) : null}
        {isEdit && form.contractNumber ? (
          <span className="inline-flex items-center rounded-full border border-[#F1FF5E]/50 bg-[#F1FF5E]/25 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-[#F1FF5E]">
            {form.contractNumber}
          </span>
        ) : null}
      </div>
      <DialogDescription className="text-[#F1FF5E]">
        Station-scoped handling agreement. Move through sections, then save.
      </DialogDescription>
    </DialogHeader>
  );

  const editor = (
    <>
      {editorHeader}

        <form
          onSubmit={(e) => void submit(e)}
          className={presentation === 'page' ? 'flex min-h-0 flex-1 flex-col pt-10' : 'flex min-h-0 flex-1 flex-col'}
        >
          <div className={presentation === 'page'
            ? 'flex min-h-0 w-full flex-1 flex-col'
            : 'flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 py-4 sm:flex-row sm:px-6'}>
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className={presentation === 'page'
                ? 'flex min-h-0 min-w-0 flex-1 flex-col'
                : 'flex min-h-0 min-w-0 flex-1 flex-col gap-4 sm:flex-row'}
            >
              {presentation === 'page' ? null : (
              <nav
                className={cn(
                  sidebarCollapsed ? contractUi.railCollapsed : contractUi.rail,
                  'flex-col flex-nowrap overflow-x-hidden overflow-y-auto',
                )}
                aria-label="Contract sections"
              >
                {presentation === 'page' ? null : (
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed((v) => !v)}
                  className={cn(contractUi.railToggle, 'mb-1 hidden sm:inline-flex')}
                  aria-pressed={sidebarCollapsed}
                  aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  {sidebarCollapsed ? (
                    <PanelLeftOpen className="h-4 w-4" aria-hidden />
                  ) : (
                    <>
                      <PanelLeftClose className="h-4 w-4" aria-hidden />
                      <span>Collapse</span>
                    </>
                  )}
                </button>
                )}
                {formTabs.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setActiveTab(tab.value)}
                    title={`${tab.label} — ${tab.hint}`}
                    className={cn(
                      presentation === 'page'
                        ? 'rounded-xl px-3 py-1.5 text-left text-sm font-semibold leading-tight transition-[background-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--billing-accent)]/40'
                        : !sidebarCollapsed
                          ? contractUi.railItem
                          : contractUi.railItemCollapsed,
                      presentation !== 'page' && !sidebarCollapsed && 'min-w-[7.5rem] sm:min-w-0',
                      activeTab === tab.value ? contractUi.railItemActive : contractUi.railItemIdle,
                    )}
                    aria-current={activeTab === tab.value ? 'page' : undefined}
                  >
                    {presentation !== 'page' && sidebarCollapsed ? (
                      <span aria-hidden>{tab.short}</span>
                    ) : (
                      <>
                        {tab.label}
                        <span className={contractUi.railItemHint}>{tab.hint}</span>
                      </>
                    )}
                    {presentation !== 'page' && sidebarCollapsed ? <span className="sr-only">{tab.label}</span> : null}
                  </button>
                ))}
              </nav>
              )}

              <div className={presentation === 'page'
                ? 'min-w-0 w-full flex-1 bg-white px-6 py-4'
                : 'relative z-10 min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-white pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'}>
                {!isEdit && loadingCustomers ? (
                  <p className="mb-4 text-sm text-[color:var(--billing-text-muted)]">Loading customers…</p>
                ) : null}
                {!isEdit && !loadingCustomers && customers.length === 0 ? (
                  <ContractAlert tone="warning">Add a customer first (Priority 2).</ContractAlert>
                ) : null}

              <TabsContent value="general" className="mt-0 bg-white focus-visible:outline-none data-[state=inactive]:hidden">
                <ContractSection
                  title="Identity & validity"
                  description="Contract name, airline, flight category, and price window."
                >
                <div className="grid min-w-0 gap-4">
                  <ContractField label="Contract name" htmlFor="contractNumber">
                    <ContractInput
                      id="contractNumber"
                      value={form.contractNumber}
                      onChange={(e) => setForm((f) => ({ ...f, contractNumber: e.target.value }))}
                      required={!isEdit}
                    />
                  </ContractField>

                  {!isEdit ? (
                    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                      <ContractField label="Customer" htmlFor="customerCode">
                        <ContractSystemSelect
                          id="customerCode"
                          value={form.customerCode}
                          onValueChange={(v) => setForm((f) => ({ ...f, customerCode: v }))}
                          disabled={customers.length === 0}
                          placeholder="Select airline…"
                          options={customers.map((c) => ({
                            value: c.customerCode,
                            label: `${c.customerCode} — ${c.name}`,
                          }))}
                        />
                      </ContractField>
                      <ContractField label="Category" htmlFor="category">
                        <ContractCategoryMultiSelect
                          id="category"
                          value={contractCategories}
                          onChange={setContractCategories}
                        />
                      </ContractField>
                    </div>
                  ) : (
                    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                      <div className={contractUi.fieldCard}>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--billing-text-muted)]">
                          Customer
                        </p>
                        <p className="mt-1 font-semibold text-[color:var(--billing-heading)]">
                          {form.customerCode}
                          {selectedCustomer?.name ? (
                            <span className="font-normal text-[color:var(--billing-text-muted)]">
                              {' '}
                              — {selectedCustomer.name}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-1 text-xs text-[color:var(--billing-text-muted)]">
                          Airline cannot be changed after create.
                        </p>
                      </div>
                      <ContractField label="Category" htmlFor="category">
                        <ContractCategoryMultiSelect
                          id="category"
                          value={contractCategories}
                          onChange={setContractCategories}
                        />
                      </ContractField>
                    </div>
                  )}

                  <fieldset className="min-w-0 rounded-xl border border-[color:var(--billing-border)] bg-[color:var(--billing-surface-muted)]/60 p-4">
                    <legend className="px-1 text-sm font-semibold text-[color:var(--billing-heading)]">
                      INR + USD invoice
                    </legend>
                    <label className="mt-2 flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0 accent-[color:var(--billing-primary)]"
                        checked={inrUsdInvoiceEnabled}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setInrUsdInvoiceEnabled(checked);
                          if (!checked) setInrUsdInvoiceCategories([]);
                        }}
                      />
                      <span>
                        <span className="block text-sm font-semibold text-[color:var(--billing-heading)]">
                          Generate the invoice in INR + USD
                        </span>
                        <span className="mt-0.5 block text-xs text-[color:var(--billing-text-muted)]">
                          USD invoices keep the same totals. Each line also shows the ROE and the INR amount. Royalty, gross, GST, and the amount in words are printed in both currencies.
                        </span>
                      </span>
                    </label>
                    {inrUsdInvoiceEnabled ? (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-[color:var(--billing-heading)]">
                          Apply this format to
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {['BHS', 'ADS', 'RAF', 'MAAS', 'CUSTOM'].map((category) => {
                            const selected = inrUsdInvoiceCategories.includes(category);
                            return (
                              <label
                                key={category}
                                className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--billing-border)] bg-white px-3 py-1.5 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-[color:var(--billing-primary)]"
                                  checked={selected}
                                  onChange={() => {
                                    setInrUsdInvoiceCategories((current) =>
                                      selected
                                        ? current.filter((item) => item !== category)
                                        : [...current, category],
                                    );
                                  }}
                                />
                                {category === 'CUSTOM' ? 'Custom' : category}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </fieldset>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <button
                      type="button"
                      className="rounded-md border border-[color:var(--billing-border)] bg-white px-3 py-1.5 text-sm font-semibold text-[color:var(--billing-heading)]"
                      onClick={() => setAdditionalCustomersOpen(true)}
                    >
                      Include Customers in this Contract
                    </button>
                    {additionalCustomerCodes.length > 0 ? (
                      <span className="text-xs text-[color:var(--billing-text-muted)]">
                        {additionalCustomerCodes.join(', ')}
                      </span>
                    ) : null}
                  </div>
                  {additionalCustomersOpen ? (
                    <div
                      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center"
                      role="presentation"
                      onClick={() => setAdditionalCustomersOpen(false)}
                    >
                      <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="include-customers-title"
                        className="flex max-h-[min(32rem,85vh)] w-full max-w-lg flex-col rounded-xl border border-[color:var(--billing-border)] bg-white p-4 shadow-lg"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 id="include-customers-title" className="text-sm font-semibold text-[color:var(--billing-heading)]">
                              Include Customers in this Contract
                            </h3>
                            <p className="mt-1 text-xs text-[color:var(--billing-text-muted)]">
                              Add one airline at a time. Each added airline gets its own invoice. Choose which masters from{' '}
                              {form.customerCode || 'the primary customer'} apply. Unchecked masters stay on the added airline.
                            </p>
                          </div>
                          <button
                            type="button"
                            className="shrink-0 rounded-md border border-[color:var(--billing-border)] px-2 py-1 text-xs font-semibold"
                            onClick={() => setAdditionalCustomersOpen(false)}
                          >
                            Close
                          </button>
                        </div>
                    <input
                      type="search"
                      value={additionalCustomerQuery}
                      onChange={(e) => setAdditionalCustomerQuery(e.target.value)}
                      placeholder="Type customer code or name, for example MSF"
                      className="mt-3 w-full rounded-lg border border-[color:var(--billing-border)] bg-white px-3 py-2 text-sm"
                      aria-label="Find a customer to bill on this contract"
                    />
                    <div className="mt-3 grid min-h-0 flex-1 gap-1 overflow-y-auto sm:grid-cols-2">
                      {customers
                        .filter((customer) => customer.customerCode !== form.customerCode)
                        .filter((customer) => {
                          const query = additionalCustomerQuery.trim().toLowerCase();
                          if (!query) return true;
                          return (
                            customer.customerCode.toLowerCase().includes(query) ||
                            String(customer.name ?? '').toLowerCase().includes(query)
                          );
                        })
                        .map((customer) => {
                          const checked = additionalCustomerCodes.includes(customer.customerCode);
                          return (
                            <div
                              key={customer.customerCode}
                              className="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm text-[color:var(--billing-heading)]"
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4"
                                checked={checked}
                                aria-label={`Bill ${customer.customerCode} on this contract`}
                                onChange={() => {
                                  if (checked) {
                                    setAdditionalCustomerCodes((prev) =>
                                      prev.filter((code) => code !== customer.customerCode),
                                    );
                                    setAdditionalCustomerInherit((prev) =>
                                      prev.filter((row) => row.customerCode !== customer.customerCode),
                                    );
                                    return;
                                  }
                                  setInheritEditor({
                                    customerCode: customer.customerCode,
                                    flags: emptyInheritChoice(customer.customerCode),
                                    adding: true,
                                  });
                                }}
                              />
                              <span className="min-w-0 flex-1">
                                {customer.customerCode}
                                {customer.name ? ` — ${customer.name}` : ''}
                              </span>
                              {checked ? (
                                <button
                                  type="button"
                                  className="shrink-0 text-xs font-semibold text-[color:var(--billing-primary)]"
                                  onClick={() =>
                                    setInheritEditor({
                                      customerCode: customer.customerCode,
                                      flags:
                                        additionalCustomerInherit.find(
                                          (row) => row.customerCode === customer.customerCode,
                                        ) ?? emptyInheritChoice(customer.customerCode),
                                      adding: false,
                                    })
                                  }
                                >
                                  Edit masters
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                    </div>
                    {(() => {
                      const query = additionalCustomerQuery.trim().toUpperCase();
                      const known = customers.some(
                        (customer) =>
                          customer.customerCode !== form.customerCode &&
                          (customer.customerCode.toUpperCase().includes(query) ||
                            String(customer.name ?? '').toUpperCase().includes(query)),
                      );
                      const canAdd =
                        /^[A-Z0-9]{2,6}$/.test(query) &&
                        query !== form.customerCode.trim().toUpperCase() &&
                        !additionalCustomerCodes.includes(query) &&
                        !known;
                      if (!additionalCustomerQuery.trim() || known) return null;
                      return (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <p className="text-xs text-[color:var(--billing-text-muted)]">
                            {query} is not in the billing customer list. Cargo codes such as MSF can
                            still be billed on this contract.
                          </p>
                          {canAdd ? (
                            <button
                              type="button"
                              className="rounded-md border border-[color:var(--billing-border)] bg-white px-2 py-1 text-xs font-semibold text-[color:var(--billing-primary)]"
                              onClick={() => {
                                setInheritEditor({
                                  customerCode: query,
                                  flags: emptyInheritChoice(query),
                                  adding: true,
                                });
                              }}
                            >
                              Add {query}
                            </button>
                          ) : null}
                        </div>
                      );
                    })()}
                    {additionalCustomerCodes.filter(
                      (code) => !customers.some((customer) => customer.customerCode === code),
                    ).length > 0 ? (
                      <p className="mt-2 text-xs text-[color:var(--billing-heading)]">
                        Added outside the list:{' '}
                        {additionalCustomerCodes
                          .filter(
                            (code) => !customers.some((customer) => customer.customerCode === code),
                          )
                          .join(', ')}
                      </p>
                    ) : null}
                    {additionalCustomerCodes.length > 0 ? (
                      <ul className="mt-3 space-y-1 text-xs text-[color:var(--billing-heading)]">
                        {additionalCustomerCodes.map((code) => {
                          const flags =
                            additionalCustomerInherit.find((row) => row.customerCode === code) ??
                            emptyInheritChoice(code);
                          const selected = INHERIT_MASTER_OPTIONS.filter((option) => flags[option.key]).map(
                            (option) => option.label,
                          );
                          return (
                            <li key={code} className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold">{code}</span>
                              <span className="text-[color:var(--billing-text-muted)]">
                                {selected.length > 0 ? selected.join(', ') : 'No primary masters'}
                              </span>
                              {!customers.some((customer) => customer.customerCode === code) ? (
                                <button
                                  type="button"
                                  className="font-semibold text-[color:var(--billing-primary)]"
                                  onClick={() =>
                                    setInheritEditor({
                                      customerCode: code,
                                      flags,
                                      adding: false,
                                    })
                                  }
                                >
                                  Edit masters
                                </button>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                      </div>
                    </div>
                  ) : null}
                  {inheritEditor ? (
                    <div
                      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center"
                      role="presentation"
                      onClick={() => setInheritEditor(null)}
                    >
                      <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="inherit-masters-title"
                        className="w-full max-w-md rounded-xl border border-[color:var(--billing-border)] bg-white p-4 shadow-lg"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <h3 id="inherit-masters-title" className="text-sm font-semibold text-[color:var(--billing-heading)]">
                          Masters for {inheritEditor.customerCode}
                        </h3>
                        <p className="mt-1 text-xs text-[color:var(--billing-text-muted)]">
                          Tick the {form.customerCode || 'primary customer'} masters that should apply on{' '}
                          {inheritEditor.customerCode} invoices. You can change this later.
                        </p>
                        <div className="mt-3 grid gap-2">
                          {INHERIT_MASTER_OPTIONS.map((option) => (
                            <label key={option.key} className="flex min-h-9 items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                className="h-4 w-4"
                                checked={inheritEditor.flags[option.key]}
                                onChange={() =>
                                  setInheritEditor((current) =>
                                    current
                                      ? {
                                          ...current,
                                          flags: {
                                            ...current.flags,
                                            [option.key]: !current.flags[option.key],
                                          },
                                        }
                                      : current,
                                  )
                                }
                              />
                              {option.label}
                            </label>
                          ))}
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                          <button
                            type="button"
                            className="rounded-md border border-[color:var(--billing-border)] px-3 py-1.5 text-sm"
                            onClick={() => setInheritEditor(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="rounded-md bg-[color:var(--billing-primary)] px-3 py-1.5 text-sm font-semibold text-white"
                            onClick={() => {
                              const choice = inheritEditor.flags;
                              const code = inheritEditor.customerCode;
                              setAdditionalCustomerCodes((prev) =>
                                prev.includes(code) ? prev : [...prev, code],
                              );
                              setAdditionalCustomerInherit((prev) => [
                                ...prev.filter((row) => row.customerCode !== code),
                                choice,
                              ]);
                              setAdditionalCustomerQuery('');
                              setInheritEditor(null);
                            }}
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <fieldset className="min-w-0 rounded-xl border border-[color:var(--billing-border)] bg-[color:var(--billing-surface-muted)]/60 p-4">
                    <legend className="px-1 text-sm font-semibold text-[color:var(--billing-heading)]">
                      Concession pricing mode
                    </legend>
                    {loadedMixedCoverage ? (
                      <ContractAlert tone="warning">
                        This contract was imported as Mixed coverage. Choose Inclusive or Exclusive
                        below — save to apply a single mode on BHS, ADS, and RAF invoices.
                      </ContractAlert>
                    ) : null}
                    <div className="mt-2 flex flex-col gap-3">
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[color:var(--billing-border)] bg-white p-3 has-[:checked]:border-[color:var(--billing-primary)] has-[:checked]:ring-1 has-[:checked]:ring-[color:var(--billing-primary)]">
                        <input
                          type="radio"
                          name="bhsConcessionCoverage"
                          className="mt-1 h-4 w-4 shrink-0 accent-[color:var(--billing-primary)]"
                          checked={bhsConcessionCoverage === 'comprehensive'}
                          onChange={() => {
                            setBhsConcessionCoverage('comprehensive');
                            setExtendedRoyaltyEnabled(false);
                            setLoadedMixedCoverage(false);
                          }}
                          disabled={saving}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-[color:var(--billing-heading)]">
                            Inclusive
                          </span>
                          <span className="mt-0.5 block text-xs text-[color:var(--billing-text-muted)]">
                            Concession is part of the BHS package. BHS, ADS, and RAF invoices do not
                            add a separate concession line.
                          </span>
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[color:var(--billing-border)] bg-white p-3 has-[:checked]:border-[color:var(--billing-primary)] has-[:checked]:ring-1 has-[:checked]:ring-[color:var(--billing-primary)]">
                        <input
                          type="radio"
                          name="bhsConcessionCoverage"
                          className="mt-1 h-4 w-4 shrink-0 accent-[color:var(--billing-primary)]"
                          checked={bhsConcessionCoverage === 'non_comprehensive'}
                          onChange={() => {
                            setBhsConcessionCoverage('non_comprehensive');
                            setLoadedMixedCoverage(false);
                          }}
                          disabled={saving}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-[color:var(--billing-heading)]">
                            Exclusive
                          </span>
                          <span className="mt-0.5 block text-xs text-[color:var(--billing-text-muted)]">
                            Concession is billed separately on BHS, ADS, and RAF invoices. The percent
                            comes from Royalty Setup for international, domestic, and general aviation
                            flights. Royalty on Gross uses percent / (100 − percent). Royalty on Net
                            uses percent / 100. When MAG rates are uploaded, the invoice uses the
                            higher of that royalty and the MAG for the airline&apos;s flights that month.
                          </span>
                        </span>
                      </label>
                    </div>
                    {bhsConcessionCoverage === 'non_comprehensive' ? (
                      <div className="mt-3 grid gap-3">
                        <ContractToggleCard
                          checked={aeraConcessionEnabled}
                          onChange={(checked) => setAeraConcessionEnabled(checked)}
                          disabled={saving}
                          title="Concession is a percent of the AERA ceiling rate (this airline only)"
                          description="For SGHAs worded “x% of the AERA ceiling rate”. The percent below is applied to the AERA maximum for each flight’s aircraft code, flight type and financial year (Master → AERA Tariff) instead of the discounted handling rate. Other airlines on this station keep the Royalty Setup percent on the invoice amount."
                        />
                        {aeraConcessionEnabled ? (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <ContractField
                              label="International flights — % of AERA ceiling"
                              htmlFor="aeraConcessionIntPercent"
                            >
                              <ContractInput
                                id="aeraConcessionIntPercent"
                                type="number"
                                min={0}
                                max={100}
                                step="0.01"
                                value={aeraConcessionIntPercent}
                                onChange={(e) => setAeraConcessionIntPercent(e.target.value)}
                                placeholder="e.g. 24"
                                disabled={saving}
                              />
                            </ContractField>
                            <ContractField
                              label="Domestic flights — % of AERA ceiling"
                              htmlFor="aeraConcessionDomPercent"
                            >
                              <ContractInput
                                id="aeraConcessionDomPercent"
                                type="number"
                                min={0}
                                max={100}
                                step="0.01"
                                value={aeraConcessionDomPercent}
                                onChange={(e) => setAeraConcessionDomPercent(e.target.value)}
                                placeholder="Leave blank if not applicable"
                                disabled={saving}
                              />
                            </ContractField>
                            <p className="text-xs text-[color:var(--billing-text-muted)] sm:col-span-2">
                              Example: KLM at Hyderabad — 24% × AERA Code E international full handling
                              (₹2,16,575 in FY 2025-26) = ₹51,978 per flight, whatever the negotiated rate.
                              Flights with no matching AERA rate fall back to the percent of the invoice amount.
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </fieldset>

                  <fieldset className="min-w-0 rounded-xl border border-[color:var(--billing-border)] bg-[color:var(--billing-surface-muted)]/60 p-4">
                    <legend className="flex w-full items-center justify-between gap-3 px-1">
                      <span className="text-sm font-semibold text-[color:var(--billing-heading)]">
                        Fortnight / split billing
                      </span>
                      {fortnightBillingEnabled ? (
                        <button
                          type="button"
                          className={cn(contractUi.btnPrimary, 'px-3 py-1.5 text-xs')}
                          onClick={() => openRoeEditor()}
                        >
                          Add ROE
                        </button>
                      ) : null}
                    </legend>
                    <div className="mt-2 grid gap-3">
                      <ContractToggleCard
                        checked={fortnightBillingEnabled}
                        onChange={(checked) => setFortnightBillingEnabled(checked)}
                        title="Generate multiple invoices per month"
                        description="Enable when this airline bills in calendar-date parts. 1–15 means the 1st through the 15th of the month, using each flight’s ATA date."
                      />
                      {fortnightBillingEnabled ? (
                        <ContractToggleCard
                          checked={fortnightEdgeDayCap}
                          onChange={(checked) => setFortnightEdgeDayCap(checked)}
                          title="1-day boundary cap"
                          description="The 1st is billed on the previous month’s last part (1 Sep counts in 16–31 Aug). The last day of a month is billed on the next month’s first part (31 Jul counts in 1–15 Aug). Leave this off to keep each date in its own month."
                        />
                      ) : null}
                      {fortnightBillingEnabled ? (
                        <div className={cn(contractUi.nestedCard, 'grid gap-4')}>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <ContractField label="Number of parts" htmlFor="fortnightBillingPartCount">
                              <ContractInput
                                id="fortnightBillingPartCount"
                                type="number"
                                min={2}
                                max={31}
                                step={1}
                                value={fortnightBillingPartCount}
                                onChange={(e) => handleFortnightPartCountChange(e.target.value)}
                              />
                            </ContractField>
                          </div>
                          {fortnightMonthRates.length > 0 ? (
                            <div className="grid gap-2">
                              {fortnightMonthRates.map((entry) => (
                                <div
                                  key={entry.month}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:var(--billing-border)] bg-white px-3 py-2"
                                >
                                  <div className="min-w-0 text-sm text-[color:var(--billing-heading)]">
                                    <span className="font-semibold">{formatFortnightMonth(entry.month)}</span>
                                    <span className="ml-2 text-[color:var(--billing-text-muted)]">
                                      {fortnightBillingRanges
                                        .map((range, index) => {
                                          const rate = entry.rates[String(Number(range.startDay))];
                                          return rate ? `Part ${index + 1}: ${rate}` : null;
                                        })
                                        .filter(Boolean)
                                        .join(' · ')}
                                    </span>
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      className={contractUi.btnSecondary}
                                      onClick={() => openRoeEditor(entry)}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      className={contractUi.btnSecondary}
                                      onClick={() =>
                                        setFortnightMonthRates((prev) =>
                                          prev.filter((row) => row.month !== entry.month),
                                        )
                                      }
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {roeEditor ? (
                            <div className="grid gap-3 rounded-lg border border-[color:var(--billing-border)] bg-white p-3">
                              <ContractField label="Month" htmlFor="fortnight-roe-month">
                                <ContractInput
                                  id="fortnight-roe-month"
                                  type="month"
                                  value={roeEditor.month}
                                  onChange={(e) => {
                                    const month = e.target.value;
                                    setRoeEditor((prev) =>
                                      prev ? { ...prev, month } : prev,
                                    );
                                    const length = daysInFortnightMonth(month);
                                    if (!length) return;
                                    setFortnightBillingRanges((prev) => {
                                      if (prev.length === 0) return prev;
                                      const lastIndex = prev.length - 1;
                                      const end = Number(prev[lastIndex]?.endDay);
                                      if (!Number.isFinite(end) || end < 28 || end === length) {
                                        return prev;
                                      }
                                      return prev.map((row, rowIndex) =>
                                        rowIndex === lastIndex
                                          ? { ...row, endDay: String(length) }
                                          : row,
                                      );
                                    });
                                  }}
                                />
                              </ContractField>
                              <div className="grid gap-3 sm:grid-cols-2">
                                {fortnightBillingRanges.map((range, index) => (
                                  <ContractField
                                    key={`roe-part-${index}`}
                                    label={`Part ${index + 1} USD to INR rate (days ${range.startDay}–${range.endDay})`}
                                    htmlFor={`fortnight-roe-part-${index}`}
                                  >
                                    <ContractInput
                                      id={`fortnight-roe-part-${index}`}
                                      type="number"
                                      min={0}
                                      step="0.0001"
                                      inputMode="decimal"
                                      placeholder="e.g. 84.25"
                                      value={roeEditor.rates[String(Number(range.startDay))] ?? ''}
                                      onChange={(e) =>
                                        setRoeEditor((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                rates: {
                                                  ...prev.rates,
                                                  [String(Number(range.startDay))]: e.target.value,
                                                },
                                              }
                                            : prev,
                                        )
                                      }
                                    />
                                  </ContractField>
                                ))}
                              </div>
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  className={contractUi.btnSecondary}
                                  onClick={() => setRoeEditor(null)}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  className={contractUi.btnPrimary}
                                  onClick={commitRoeEditor}
                                >
                                  Save ROE
                                </button>
                              </div>
                            </div>
                          ) : null}
                          <div className="grid gap-3">
                            {fortnightBillingRanges.map((range, index) => (
                              <div key={`fortnight-range-${index}`} className="grid gap-3 sm:grid-cols-2">
                                <div className="text-sm font-medium text-[color:var(--billing-heading)] sm:col-span-2">
                                  Part {index + 1}
                                </div>
                                <ContractField label="Start day" htmlFor={`fortnight-start-${index}`}>
                                  <ContractInput
                                    id={`fortnight-start-${index}`}
                                    type="number"
                                    min={1}
                                    max={31}
                                    step={1}
                                    value={range.startDay}
                                    onChange={(e) =>
                                      setFortnightBillingRanges((prev) =>
                                        prev.map((row, rowIndex) =>
                                          rowIndex === index
                                            ? { ...row, startDay: e.target.value }
                                            : row,
                                        ),
                                      )
                                    }
                                  />
                                </ContractField>
                                <ContractField label="End day" htmlFor={`fortnight-end-${index}`}>
                                  <ContractInput
                                    id={`fortnight-end-${index}`}
                                    type="number"
                                    min={1}
                                    max={
                                      index === fortnightBillingRanges.length - 1 &&
                                      daysInFortnightMonth(roeEditor?.month ?? '')
                                        ? daysInFortnightMonth(roeEditor?.month ?? '')!
                                        : 31
                                    }
                                    step={1}
                                    value={range.endDay}
                                    onChange={(e) =>
                                      setFortnightBillingRanges((prev) =>
                                        prev.map((row, rowIndex) =>
                                          rowIndex === index ? { ...row, endDay: e.target.value } : row,
                                        ),
                                      )
                                    }
                                  />
                                </ContractField>
                              </div>
                            ))}
                          </div>
                          {validationErrors.fortnightBilling ? (
                            <ContractAlert tone="danger">{validationErrors.fortnightBilling}</ContractAlert>
                          ) : (
                            <p className="text-xs text-[color:var(--billing-text-muted)]">
                              Day 1 is the 1st and day 15 is the 15th. Both ends are included, so 1–15 is the 1st through the 15th by ATA date. Ranges must run from the 1st to the 31st with no gaps. Add ROE, pick the month, then enter each part’s USD to INR rate. That rate is used only for flights in that month.
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </fieldset>

                  <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                    <ContractField label="Price valid from" htmlFor="priceValidFrom">
                      <ContractSystemDate
                        id="priceValidFrom"
                        value={form.priceValidFrom}
                        onChange={(v) => setForm((f) => ({ ...f, priceValidFrom: v }))}
                      />
                    </ContractField>
                    <ContractField
                      label="Price valid to"
                      htmlFor="priceValidTo"
                      error={validationErrors.priceValidTo || undefined}
                    >
                      <ContractSystemDate
                        id="priceValidTo"
                        value={form.priceValidTo}
                        onChange={(v) => setForm((f) => ({ ...f, priceValidTo: v }))}
                        minDate={
                          form.priceValidFrom
                            ? new Date(`${form.priceValidFrom}T00:00:00`)
                            : undefined
                        }
                      />
                    </ContractField>
                  </div>

                  <p className="text-sm text-[color:var(--billing-text-muted)]">
                    Flights in this date range use this contract and its ADS lines. No extra
                    Active / ADS switch.
                  </p>
                </div>
                </ContractSection>
              </TabsContent>

              <TabsContent value="aircraft" className="mt-0 bg-white focus-visible:outline-none data-[state=inactive]:hidden">
                <ContractSection
                  title="Aircraft coverage"
                  description="Pick types this agreement prices. The same list is applied to every ADS equipment rule on Clauses."
                >
                  <ContractField label="Aircraft types" htmlFor="aircraftTypes">
                    <ContractAircraftTypePicker
                      options={availableAircraftTypes}
                      advanceCatalog={advanceAircraftCatalog}
                      loadingAdvanceCatalog={loadingAdvanceCatalog}
                      onReloadAdvanceCatalog={() => void loadAdvanceAircraftCatalog()}
                      selected={selectedAircraftTypes}
                      onChange={applyAircraftToEquipmentRules}
                      loading={loadingAircraftTypes}
                      disabled={saving}
                      customerCode={form.customerCode}
                      validFrom={form.priceValidFrom}
                      validTo={form.priceValidTo}
                    />
                  </ContractField>
                </ContractSection>
              </TabsContent>

              <TabsContent value="sgha" className="mt-0 bg-white focus-visible:outline-none data-[state=inactive]:hidden">
                <ContractSection
                  title="Comprehensive volume rates"
                  description="Optional. Use this when the BHS package rate changes with how many flights the airline operates in the month. Leave it empty to keep the saved price-card rate."
                  collapsible
                  open={showVolumeRates}
                  onOpenChange={setShowVolumeRates}
                >
                  <ContractBhsVolumeEditor
                    schedules={bhsVolumeSchedules}
                    onChange={setBhsVolumeSchedules}
                    error={validationErrors.bhsVolumeSchedules || undefined}
                  />
                </ContractSection>
                <div className="h-4" />
                <ContractSection
                  title="Additional SGHA terms"
                  description="Open a term to enter its percent. Closing it keeps the number already entered."
                  collapsible
                  open={showAdditionalTerms}
                  onOpenChange={setShowAdditionalTerms}
                >
                  <div className="mb-3 flex justify-end">
                    <button
                      type="button"
                      onClick={resetFlightConcessions}
                      className={contractUi.btnGhost}
                    >
                      Reset all
                    </button>
                  </div>
                  <div className="grid gap-3">
                    <SghaDisclosure
                      open={showDivertedConcessions}
                      onToggle={() => setShowDivertedConcessions((open) => !open)}
                      title="Diverted flight percentages"
                      description="Domestic, international, BME, cargo, and split-sector rates."
                    >
                      <div className={cn(contractUi.nestedCard, 'grid gap-4 sm:grid-cols-2')}>
                        {DIVERTED_PERCENT_FIELDS.map((field) => (
                          <ContractField
                            key={field.key}
                            label={field.label}
                            htmlFor={field.id}
                            hint={validationErrors[field.key] ? undefined : field.hint}
                            error={validationErrors[field.key] || undefined}
                          >
                            <ContractInput
                              id={field.id}
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              value={flightConcessions[field.key]}
                              onChange={(e) => setFlightConcessionField(field.key, e.target.value)}
                              placeholder="Optional"
                              aria-invalid={Boolean(validationErrors[field.key])}
                            />
                          </ContractField>
                        ))}
                      </div>
                    </SghaDisclosure>

                    <SghaDisclosure
                      open={showReturnToRampConcession}
                      onToggle={() => setShowReturnToRampConcession((open) => !open)}
                      title="Return to ramp percentage"
                      description="A return-to-ramp flight is charged this percent of the BHS package rate."
                    >
                      <div className={cn(contractUi.nestedCard, 'grid gap-4 sm:grid-cols-2')}>
                        <ContractField
                          label="Return to ramp (%)"
                          htmlFor="returnToRampPercent"
                          error={validationErrors.returnToRamp || undefined}
                        >
                          <ContractInput
                            id="returnToRampPercent"
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={flightConcessions.returnToRamp}
                            onChange={(e) => setFlightConcessionField('returnToRamp', e.target.value)}
                            placeholder="Optional"
                            aria-invalid={Boolean(validationErrors.returnToRamp)}
                          />
                        </ContractField>
                      </div>
                    </SghaDisclosure>

                    <SghaDisclosure
                      open={showOriginateTerminate}
                      onToggle={() => setShowOriginateTerminate((open) => !open)}
                      title="Originate / terminate percentage"
                      description="Flights with only an ATA time (originate) or only an ATD time (terminate) are charged this percent of the BHS package rate."
                    >
                      <div className={cn(contractUi.nestedCard, 'grid gap-4 sm:grid-cols-2')}>
                        <ContractField
                          label="Originate / terminate (%)"
                          htmlFor="originateTerminatePercent"
                          hint="Percent of the aircraft BHS package rate on the rate card."
                          error={validationErrors.originateTerminatePercent || undefined}
                        >
                          <ContractInput
                            id="originateTerminatePercent"
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={flightConcessions.originateTerminatePercent}
                            onChange={(e) =>
                              setFlightConcessionField('originateTerminatePercent', e.target.value)
                            }
                            placeholder="Optional"
                            aria-invalid={Boolean(validationErrors.originateTerminatePercent)}
                          />
                        </ContractField>
                      </div>
                    </SghaDisclosure>

                    <SghaDisclosure
                      open={showCancellationWindow}
                      onToggle={() => setShowCancellationWindow((open) => !open)}
                      title="Cancellation within hours"
                      description="Percentage charged when cancelled inside the window."
                    >
                      <div className={cn(contractUi.nestedCard, 'grid gap-4 sm:grid-cols-2')}>
                        <ContractField
                          label="Cancellation percentage (%)"
                          htmlFor="cancellationWithinHoursPercent"
                          hint="Applied when cancellation happens within the contract window."
                          error={validationErrors.cancellationWithinHoursPercent || undefined}
                        >
                          <ContractInput
                            id="cancellationWithinHoursPercent"
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={flightConcessions.cancellationWithinHoursPercent}
                            onChange={(e) =>
                              setFlightConcessionField('cancellationWithinHoursPercent', e.target.value)
                            }
                            placeholder="Optional"
                            aria-invalid={Boolean(validationErrors.cancellationWithinHoursPercent)}
                          />
                        </ContractField>
                        <ContractField
                          label="Within hours"
                          htmlFor="cancellationWithinHours"
                          hint={
                            !validationErrors.cancellationWithinHours
                              ? 'How many hours before STA the cancellation must occur.'
                              : undefined
                          }
                          error={validationErrors.cancellationWithinHours || undefined}
                        >
                          <ContractInput
                            id="cancellationWithinHours"
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            value={form.cancellationWithinHours}
                            onChange={(e) => setForm((prev) => ({ ...prev, cancellationWithinHours: e.target.value }))}
                            placeholder="Optional"
                            aria-invalid={Boolean(validationErrors.cancellationWithinHours)}
                          />
                        </ContractField>
                      </div>
                    </SghaDisclosure>

                    <SghaDisclosure
                      open={showTechnicalHandlingCharges}
                      onToggle={() => setShowTechnicalHandlingCharges((open) => !open)}
                      title="Technical handling charges"
                      description="Percentage applied on technical handling."
                    >
                      <div className={cn(contractUi.nestedCard, 'grid gap-4 sm:grid-cols-2')}>
                        <ContractField
                          label="Technical handling charges (%)"
                          htmlFor="technicalHandlingChargesPercent"
                          error={validationErrors.technicalHandlingChargesPercent || undefined}
                        >
                          <ContractInput
                            id="technicalHandlingChargesPercent"
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={flightConcessions.technicalHandlingChargesPercent}
                            onChange={(e) =>
                              setFlightConcessionField('technicalHandlingChargesPercent', e.target.value)
                            }
                            placeholder="Optional"
                            aria-invalid={Boolean(validationErrors.technicalHandlingChargesPercent)}
                          />
                        </ContractField>
                      </div>
                    </SghaDisclosure>

                    <SghaDisclosure
                      open={showStandbyCharges}
                      onToggle={() => setShowStandbyCharges((open) => !open)}
                      title="Standby charges"
                      description="Percentage applied on standby."
                    >
                      <div className={cn(contractUi.nestedCard, 'grid gap-4 sm:grid-cols-2')}>
                        <ContractField
                          label="Standby charges (%)"
                          htmlFor="standbyChargesPercent"
                          error={validationErrors.standbyChargesPercent || undefined}
                        >
                          <ContractInput
                            id="standbyChargesPercent"
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={flightConcessions.standbyChargesPercent}
                            onChange={(e) =>
                              setFlightConcessionField('standbyChargesPercent', e.target.value)
                            }
                            placeholder="Optional"
                            aria-invalid={Boolean(validationErrors.standbyChargesPercent)}
                          />
                        </ContractField>
                      </div>
                    </SghaDisclosure>

                    <SghaDisclosure
                      open={showFiloLifoCharges}
                      onToggle={() => setShowFiloLifoCharges((open) => !open)}
                      title="Ferry in / ferry out"
                      description="Replacement percent of the BHS package. Ferry in load out and load in ferry out can differ."
                    >
                      <div className={cn(contractUi.nestedCard, 'grid gap-4 sm:grid-cols-2')}>
                        <ContractField
                          label="Ferry in / load out (%)"
                          htmlFor="filoChargesPercent"
                          hint="FILO. FIFO stays at the full BHS package."
                          error={validationErrors.filoChargesPercent || undefined}
                        >
                          <ContractInput
                            id="filoChargesPercent"
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={flightConcessions.filoChargesPercent}
                            onChange={(e) =>
                              setFlightConcessionField('filoChargesPercent', e.target.value)
                            }
                            placeholder="Optional"
                            aria-invalid={Boolean(validationErrors.filoChargesPercent)}
                          />
                        </ContractField>
                        <ContractField
                          label="Load in / ferry out (%)"
                          htmlFor="lifoChargesPercent"
                          hint="LIFO."
                          error={validationErrors.lifoChargesPercent || undefined}
                        >
                          <ContractInput
                            id="lifoChargesPercent"
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={flightConcessions.lifoChargesPercent}
                            onChange={(e) => 
                              setFlightConcessionField('lifoChargesPercent', e.target.value)
                            }
                            placeholder="Optional"
                            aria-invalid={Boolean(validationErrors.lifoChargesPercent)}
                          />
                        </ContractField>
                      </div>
                    </SghaDisclosure>

                    <SghaDisclosure
                      open={showRonCharges}
                      onToggle={() => setShowRonCharges((open) => !open)}
                      title="Remain overnight additional"
                      description="Added on top of the handling rate. Arrive 22:00–04:00, depart by 06:00, ground time at least 75 minutes. Not on split-sector flights."
                    >
                      <div className={cn(contractUi.nestedCard, 'grid gap-4 sm:grid-cols-2')}>
                        <ContractField
                          label="RON additional (%)"
                          htmlFor="ronAdditionalPercent"
                          error={validationErrors.ronAdditionalPercent || undefined}
                        >
                          <ContractInput
                            id="ronAdditionalPercent"
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={flightConcessions.ronAdditionalPercent}
                            onChange={(e) =>
                              setFlightConcessionField('ronAdditionalPercent', e.target.value)
                            }
                            placeholder="Optional"
                            aria-invalid={Boolean(validationErrors.ronAdditionalPercent)}
                          />
                        </ContractField>
                      </div>
                    </SghaDisclosure>

                    <SghaDisclosure
                      open={showLateArrivalCharges}
                      onToggle={() => setShowLateArrivalCharges((open) => !open)}
                      title="Late arrival additional"
                      description="Added when the flight arrives more than 75 minutes after STA. Not added on a RON flight."
                    >
                      <div className={cn(contractUi.nestedCard, 'grid gap-4 sm:grid-cols-2')}>
                        <ContractField
                          label="Late arrival additional (%)"
                          htmlFor="lateArrivalAdditionalPercent"
                          hint="A 6-hour prior notice waiver is not detected automatically."
                          error={validationErrors.lateArrivalAdditionalPercent || undefined}
                        >
                          <ContractInput
                            id="lateArrivalAdditionalPercent"
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={flightConcessions.lateArrivalAdditionalPercent}
                            onChange={(e) =>
                              setFlightConcessionField('lateArrivalAdditionalPercent', e.target.value)
                            }
                            placeholder="Optional"
                            aria-invalid={Boolean(validationErrors.lateArrivalAdditionalPercent)}
                          />
                        </ContractField>
                      </div>
                    </SghaDisclosure>

                    <SghaDisclosure
                      open={showExtraGroundCharges}
                      onToggle={() => setShowExtraGroundCharges((open) => !open)}
                      title="Extra ground time additional"
                      description="Added when a domestic-to-domestic or international-to-international flight is on the ground more than 75 minutes. Not on split-sector or RON flights."
                    >
                      <div className={cn(contractUi.nestedCard, 'grid gap-4 sm:grid-cols-2')}>
                        <ContractField
                          label="Extra ground time additional (%)"
                          htmlFor="extraGroundTimeAdditionalPercent"
                          error={validationErrors.extraGroundTimeAdditionalPercent || undefined}
                        >
                          <ContractInput
                            id="extraGroundTimeAdditionalPercent"
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={flightConcessions.extraGroundTimeAdditionalPercent}
                            onChange={(e) =>
                              setFlightConcessionField(
                                'extraGroundTimeAdditionalPercent',
                                e.target.value,
                              )
                            }
                            placeholder="Optional"
                            aria-invalid={Boolean(validationErrors.extraGroundTimeAdditionalPercent)}
                          />
                        </ContractField>
                      </div>
                    </SghaDisclosure>
                  </div>
                </ContractSection>
                <div className="h-4" />
                <ContractSection
                  title="Split turnaround at Delhi"
                  description="International arrival and domestic departure is this percent over the domestic comprehensive rate. Domestic arrival and international departure is this percent over the international comprehensive rate."
                  collapsible
                  open={showSplitTurnaround}
                  onOpenChange={setShowSplitTurnaround}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ContractField
                      label="Int arrival / Dom departure (%)"
                      htmlFor="splitIntArrivalDomDeparturePercent"
                      hint="20% over the domestic comprehensive rate."
                      error={validationErrors.splitIntArrivalDomDeparturePercent || undefined}
                    >
                      <ContractInput
                        id="splitIntArrivalDomDeparturePercent"
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={flightConcessions.splitIntArrivalDomDeparturePercent}
                        onChange={(e) =>
                          setFlightConcessionField(
                            'splitIntArrivalDomDeparturePercent',
                            e.target.value,
                          )
                        }
                        placeholder="Optional"
                        aria-invalid={Boolean(
                          validationErrors.splitIntArrivalDomDeparturePercent,
                        )}
                      />
                    </ContractField>
                    <ContractField
                      label="Dom arrival / Int departure (%)"
                      htmlFor="splitDomArrivalIntDeparturePercent"
                      hint="25% over the international comprehensive rate."
                      error={validationErrors.splitDomArrivalIntDeparturePercent || undefined}
                    >
                      <ContractInput
                        id="splitDomArrivalIntDeparturePercent"
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={flightConcessions.splitDomArrivalIntDeparturePercent}
                        onChange={(e) =>
                          setFlightConcessionField(
                            'splitDomArrivalIntDeparturePercent',
                            e.target.value,
                          )
                        }
                        placeholder="Optional"
                        aria-invalid={Boolean(
                          validationErrors.splitDomArrivalIntDeparturePercent,
                        )}
                      />
                    </ContractField>
                  </div>
                </ContractSection>
              </TabsContent>

              <TabsContent value="clauses" className="mt-0 bg-white focus-visible:outline-none data-[state=inactive]:hidden">
                <div className="grid min-w-0 gap-4">
                  <ContractSection title="ADS equipment rules">
                    <ContractAdsEquipmentRulesEditor
                      rules={adsEquipmentRules}
                      onChange={setAdsEquipmentRules}
                      aircraftTypes={selectedAircraftTypes}
                      services={adsServices}
                      equipmentMaster={equipmentMaster}
                      airlineName={selectedCustomer?.name || record?.customerName || ''}
                      airlineCode={form.customerCode}
                      validFrom={form.priceValidFrom}
                      validTo={form.priceValidTo}
                      rateToInr={resolvedRoeRate}
                      roeHint=""
                      disabled={saving}
                    />
                  </ContractSection>

                  <ContractSection
                    title="BME equipment"
                    description="BME lines stay on the flight. They are left out of ADS invoices unless this is turned on."
                  >
                    <ContractToggleCard
                      checked={billBmeEquipment}
                      disabled={saving}
                      onChange={setBillBmeEquipment}
                      title="Bill BME equipment on ADS"
                      description="Covers Ground Power Unit (BME), Air Conditioner Unit (BME), and Water Cart (BME). Off by default."
                    />
                  </ContractSection>

                  <ContractSection
                    title="Contract clauses"
                    description="Each clause can carry a percent, an amount, and the dates it applies. Annual rate increase uses those figures on the annex price."
                  >
                    <ContractClausesEditor
                      clauses={clauses}
                      onChange={setClauses}
                      disabled={saving}
                    />
                  </ContractSection>
                </div>
              </TabsContent>

              <TabsContent value="document" className="mt-0 bg-white focus-visible:outline-none data-[state=inactive]:hidden">
                <ContractSection
                  title="Contract document"
                  description="Upload the signed PDF. Preview and download stay with this agreement."
                >
                  <ContractPdfPanel
                    value={contractPdf}
                    onChange={(next) => {
                      pdfTouchedRef.current = true;
                      setContractPdf(next);
                    }}
                    disabled={saving}
                  />
                </ContractSection>
              </TabsContent>
              </div>
            </Tabs>
          </div>

          <div className={contractUi.dialogFooter}>
            {error ? <ContractAlert tone="danger">{error}</ContractAlert> : null}
            <p className="text-xs text-[color:var(--billing-text-muted)]">
              {hasValidationErrors
                ? 'Fix highlighted fields before saving.'
                : isDirty
                  ? 'You have unsaved changes.'
                  : 'All changes saved when you submit.'}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className={contractUi.btnSecondary}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || (!isEdit && customers.length === 0) || hasValidationErrors}
                className={contractUi.btnPrimary}
              >
                {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create contract'}
              </button>
            </div>
          </div>
        </form>
      </>
  );

  if (presentation === 'page') {
    return (
      <div className="-mx-3 -mt-3 flex min-h-[calc(100dvh-3.3rem)] w-[calc(100%+1.5rem)] flex-col bg-white sm:-mx-6 sm:-mt-6 sm:w-[calc(100%+3rem)]">
        {editor}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={contractUi.dialogShell}
        onPointerDownOutside={(event) => {
          const target = event.target as HTMLElement | null;
          if (
            target?.closest('[data-ads-contract-floating]') ||
            target?.closest('[data-datepicker-panel]')
          ) {
            event.preventDefault();
          }
        }}
        onFocusOutside={(event) => {
          const target = event.target as HTMLElement | null;
          if (
            target?.closest('[data-ads-contract-floating]') ||
            target?.closest('[data-datepicker-panel]')
          ) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          const target = event.target as HTMLElement | null;
          if (
            target?.closest('[data-ads-contract-floating]') ||
            target?.closest('[data-datepicker-panel]')
          ) {
            event.preventDefault();
          }
        }}
      >
        {editor}
      </DialogContent>
    </Dialog>
  );
}
