'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, Plus, Trash2, Upload } from 'lucide-react';
import {
  ADS_EQUIPMENT_RULES_EMPTY_EXPORT_MESSAGE,
  ADS_EQUIPMENT_RULES_INVALID_EXCEL_MESSAGE,
  exportAdsEquipmentRulesExcel,
  parseAdsEquipmentRulesWorkbook,
} from './adsEquipmentRulesExcel';
import type { EquipmentMasterRecord } from '@/lib/billing-api';
import type {
  BillingContractAdsEquipmentRule,
  BillingServiceCatalogItem,
} from '@/lib/billing-shared/types';
import { formatBillingDateRange } from '@/lib/billing-shared/billing-date-format';
import {
  adsCatalogServiceDisplayName,
  buildAdsContractCatalogOptions,
  inferCatalogMeta,
  resolveAdsContractCatalogValue,
  SERVICE_CATALOG_LABELS,
  type AdsContractCatalogOption,
} from '@/lib/billing-shared/service-catalog-labels';
import {
  inrToUsd,
  resolveRateToInr,
  roundBillingAmount,
  usdToInr,
} from '@/lib/billing-shared/currency-convert';
import {
  adsEquipmentIdentity,
  canonicalizeWchrSServiceCode,
  collapseAdsEquipmentRules,
} from '@/lib/billing-shared/ads-equipment-rules-validity';

type Props = {
  rules: BillingContractAdsEquipmentRule[];
  onChange: (rules: BillingContractAdsEquipmentRule[]) => void;
  aircraftTypes: string[];
  services: BillingServiceCatalogItem[];
  equipmentMaster?: EquipmentMasterRecord[];
  validFrom?: string;
  validTo?: string;
  rateToInr?: number | null;
  roeHint?: string;
  disabled?: boolean;
  airlineName?: string;
  airlineCode?: string;
};

function emptyRule(aircraftTypes: string[] = []): BillingContractAdsEquipmentRule {
  return {
    serviceCode: '',
    freePerFlight: 0,
    freePerFlightNb: undefined,
    freePerFlightWb: undefined,
    alwaysChargeable: false,
    includedForAds: true,
    unitPriceINR: undefined,
    unitPriceUSD: undefined,
    uom: 'EA',
    aircraftTypes: [...aircraftTypes],
    effectiveMonth: undefined,
  };
}

export function isWheelchairAdsService(code: string | undefined | null): boolean {
  const raw = String(code ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return false;
  const compact = raw.replace(/\s+/g, '');
  if (/\bWCH[RSC]?\b/.test(raw)) return true;
  if (
    compact === 'WCH' ||
    compact.includes('WCHR') ||
    compact.includes('WCHS') ||
    compact.includes('WCHC')
  ) {
    return true;
  }
  return raw.includes('WHEEL CHAIR') || raw.includes('WHEELCHAIR');
}

function parseFreeCount(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}

function selectedAircraftForUi(
  rule: BillingContractAdsEquipmentRule,
  contractAircraft: string[],
): string[] {
  if (Array.isArray(rule.aircraftTypes)) {
    const picked = rule.aircraftTypes
      .map((a) => String(a ?? '').trim().toUpperCase())
      .filter(Boolean);
    if (picked.length > 0) return picked;
  }
  if (rule.aircraftType?.trim()) {
    return [rule.aircraftType.trim().toUpperCase()];
  }
  return [...contractAircraft];
}

function isAdsCatalogService(service: BillingServiceCatalogItem): boolean {
  return String(service.serviceCode ?? '').trim().length > 0;
}

function adsRuleSelectValue(
  ruleCode: string | undefined | null,
  options: AdsContractCatalogOption[],
): string {
  const resolved = resolveAdsContractCatalogValue(ruleCode, options);
  return options.some((option) => option.value === resolved) ? resolved : '';
}

function aircraftSummary(selected: string[], all: string[]): string {
  if (all.length === 0) return 'Select aircraft';
  if (selected.length === 0) return 'Select aircraft';
  if (selected.length === all.length && all.every((ac) => selected.includes(ac))) {
    return `All (${all.length})`;
  }
  if (selected.length <= 2) return selected.join(', ');
  return `${selected.slice(0, 2).join(', ')} +${selected.length - 2}`;
}

function CompactAircraftDropdown({
  aircraftTypes,
  selected,
  disabled,
  labelledBy,
  onChange,
}: {
  aircraftTypes: string[];
  selected: string[];
  disabled?: boolean;
  labelledBy: string;
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Detect whether to open upward (not enough space below) — runs synchronously after DOM paint
  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setOpenUp(spaceBelow < 230 && rect.top > 230);
  }, [open]);

  // Close on outside click — stays inside the Dialog so Radix won't intercept
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (wrapperRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selectedSet = useMemo(
    () => new Set(selected.map((s) => String(s ?? '').trim().toUpperCase()).filter(Boolean)),
    [selected],
  );

  const displayTypes = useMemo(() => {
    const map = new Map<string, string>();
    for (const ac of aircraftTypes) {
      if (!ac?.trim()) continue;
      const cleanKey = ac.trim().toUpperCase().replace(/\s*-\s*/g, '-');
      if (!map.has(cleanKey)) map.set(cleanKey, ac.trim());
    }
    return [...map.values()].sort((a, b) => a.localeCompare(b));
  }, [aircraftTypes]);

  const allSelected =
    displayTypes.length > 0 &&
    displayTypes.every((ac) => selectedSet.has(ac.trim().toUpperCase()));

  const toggleType = (ac: string, checking: boolean) => {
    const targetKey = ac.trim().toUpperCase().replace(/\s*-\s*/g, '-');
    const next = checking
      ? [...selected, ac]
      : selected.filter(
          (v) => v.trim().toUpperCase().replace(/\s*-\s*/g, '-') !== targetKey,
        );
    onChange(next);
  };

  return (
    <div ref={wrapperRef} className="relative min-w-0 w-full">
      <button
        type="button"
        disabled={disabled || aircraftTypes.length === 0}
        aria-labelledby={labelledBy}
        aria-expanded={open}
        onClick={() => {
          setOpenUp(false); // reset before layout effect
          setOpen((v) => !v);
        }}
        className="inline-flex h-9 w-full min-w-0 items-center justify-between gap-1 rounded-md border border-gray-300 bg-white px-2 text-left text-sm disabled:opacity-50"
      >
        <span className="truncate">{aircraftSummary(selected, aircraftTypes)}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
      </button>

      {open ? (
        <div
          className={[
            'absolute left-0 right-0 z-[200] max-h-56 min-w-0 overflow-y-auto rounded-md border border-gray-200 bg-white p-2 shadow-lg',
            openUp ? 'bottom-full mb-1' : 'top-full mt-1',
          ].join(' ')}
        >
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange(allSelected ? [] : [...displayTypes])}
            className="mb-1 flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs font-semibold hover:bg-gray-100 select-none"
          >
            <input
              type="checkbox"
              checked={allSelected}
              readOnly
              className="pointer-events-none h-3.5 w-3.5 rounded border-gray-300"
            />
            <span>All aircraft</span>
          </button>
          {displayTypes.map((ac) => {
            const checked = selectedSet.has(ac.trim().toUpperCase().replace(/\s*-\s*/g, '-'));
            return (
              <button
                key={ac}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => toggleType(ac, !checked)}
                className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-gray-100 select-none"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  className="pointer-events-none h-3.5 w-3.5 rounded border-gray-300"
                />
                <span className="font-medium tabular-nums">{ac}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function ContractAdsEquipmentRulesEditor({
  rules,
  onChange,
  aircraftTypes,
  services,
  equipmentMaster = [],
  validFrom = '',
  validTo = '',
  rateToInr = null,
  roeHint,
  disabled,
  airlineName = '',
  airlineCode = '',
}: Props) {
  const displayRules = useMemo(() => collapseAdsEquipmentRules(rules), [rules]);
  const adsServices = useMemo(() => {
    const sources: Array<{ serviceCode: string; uom?: string; category?: string }> = [];

    for (const service of services) {
      if (service.active === false || !isAdsCatalogService(service)) continue;
      const serviceCode = String(service.serviceCode ?? '').trim();
      if (!serviceCode) continue;
      sources.push({
        serviceCode,
        uom: service.uom,
        category: service.category,
      });
    }

    for (const label of SERVICE_CATALOG_LABELS) {
      const meta = inferCatalogMeta(label);
      sources.push({
        serviceCode: label,
        uom: meta.uom,
        category: meta.category,
      });
    }

    for (const item of equipmentMaster) {
      const description = String(item.description ?? '').trim();
      if (!description) continue;
      const uom = (item.uoms ?? []).find((pair) => pair.uom?.trim())?.uom;
      sources.push({
        serviceCode: description,
        uom,
        category: 'equipment',
      });
    }

    for (const rule of displayRules) {
      const code = String(rule.serviceCode ?? '').trim();
      if (!code) continue;
      sources.push({
        serviceCode: code,
        uom: rule.uom,
        category: 'equipment',
      });
    }

    return buildAdsContractCatalogOptions(sources);
  }, [services, displayRules, equipmentMaster]);

  const uomsForEquipment = (serviceCode: string | undefined) => {
    const names = new Set(
      [serviceCode ?? '', adsCatalogServiceDisplayName(serviceCode ?? '')]
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    );
    const identities = new Set(
      [serviceCode ?? '', adsCatalogServiceDisplayName(serviceCode ?? '')]
        .map((value) => adsEquipmentIdentity(value))
        .filter(Boolean),
    );
    const pairs = new Map<string, { uom: string; abbreviation: string }>();
    for (const item of equipmentMaster) {
      const labels = [item.description, item.itemNo].map((value) => String(value ?? '').trim());
      const keys = labels.map((value) => value.toLowerCase()).filter(Boolean);
      const itemIdentities = labels.map((value) => adsEquipmentIdentity(value)).filter(Boolean);
      if (!keys.some((key) => names.has(key)) && !itemIdentities.some((key) => identities.has(key))) {
        continue;
      }
      for (const pair of item.uoms ?? []) {
        const uom = String(pair.uom ?? '').trim();
        if (!uom || pairs.has(uom.toLowerCase())) continue;
        pairs.set(uom.toLowerCase(), {
          uom,
          abbreviation: String(pair.abbreviation ?? '').trim(),
        });
      }
    }
    return [...pairs.values()];
  };

  const uomChoicesForRule = (rule: BillingContractAdsEquipmentRule) => {
    const catalogUoms = uomsForEquipment(rule.serviceCode).map((pair) => pair.uom);
    const current = String(rule.uom ?? '').trim();
    if (current && !catalogUoms.some((uom) => uom.toLowerCase() === current.toLowerCase())) {
      return [current, ...catalogUoms];
    }
    return catalogUoms;
  };

  const [duplicateError, setDuplicateError] = useState('');
  const [excelError, setExcelError] = useState('');
  const [excelBusy, setExcelBusy] = useState<'export' | 'import' | ''>('');
  const excelFileInputRef = useRef<HTMLInputElement>(null);

  const resolvedRate = resolveRateToInr(rateToInr);

  const emitRules = (next: BillingContractAdsEquipmentRule[]) => {
    onChange(collapseAdsEquipmentRules(next));
  };

  const updateRule = (index: number, patch: Partial<BillingContractAdsEquipmentRule>) => {
    emitRules(displayRules.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const onUnitPriceInrChange = (index: number, raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === '') {
      updateRule(index, { unitPriceINR: undefined, unitPriceUSD: undefined });
      return;
    }
    const inr = Number(trimmed);
    if (!Number.isFinite(inr)) return;

    const patch: Partial<BillingContractAdsEquipmentRule> = {
      unitPriceINR: roundBillingAmount(inr),
    };
    if (resolvedRate != null) {
      const usd = inrToUsd(inr, resolvedRate);
      if (usd !== '') patch.unitPriceUSD = roundBillingAmount(Number(usd));
    }
    updateRule(index, patch);
  };

  const onUnitPriceUsdChange = (index: number, raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === '') {
      updateRule(index, { unitPriceUSD: undefined, unitPriceINR: undefined });
      return;
    }
    const usd = Number(trimmed);
    if (!Number.isFinite(usd)) return;

    const patch: Partial<BillingContractAdsEquipmentRule> = {
      unitPriceUSD: roundBillingAmount(usd),
    };
    if (resolvedRate != null) {
      const inr = usdToInr(usd, resolvedRate);
      if (inr !== '') patch.unitPriceINR = roundBillingAmount(Number(inr));
    }
    updateRule(index, patch);
  };

  const removeRule = (index: number) => {
    emitRules(displayRules.filter((_, i) => i !== index));
  };

  const onServiceChange = (index: number, serviceCode: string) => {
    const identity = adsEquipmentIdentity(serviceCode);
    const selected = adsServices.find((s) => s.value === serviceCode);
    const catalogUoms = uomsForEquipment(serviceCode);
    const current = displayRules[index];
    const keptUom = current?.uom?.trim() && current.uom !== 'EA' ? current.uom.trim() : '';
    const matchedKept = catalogUoms.find(
      (pair) => pair.uom === keptUom || pair.uom.toLowerCase() === keptUom.toLowerCase(),
    )?.uom;
    const primaryUom =
      matchedKept || catalogUoms[0]?.uom || selected?.uom?.trim() || keptUom || 'EA';
    const extraUoms = catalogUoms
      .map((pair) => pair.uom)
      .filter((uom) => uom.toLowerCase() !== primaryUom.toLowerCase());
    const nextUoms = [primaryUom, ...extraUoms];
    if (
      identity &&
      displayRules.some((row, rowIndex) => {
        if (rowIndex === index) return false;
        if (adsEquipmentIdentity(row.serviceCode) !== identity) return false;
        const rowUom = String(row.uom ?? '').trim().toUpperCase() || 'EA';
        return nextUoms.some((uom) => (uom.toUpperCase() || 'EA') === rowUom);
      })
    ) {
      const label =
        adsServices.find((service) => service.value === serviceCode)?.label ||
        serviceCode;
      setDuplicateError(`${label} is already in the equipment rules.`);
      return;
    }
    setDuplicateError('');
    const wheelchair = isWheelchairAdsService(serviceCode);
    const wheelchairPatch = wheelchair
      ? {
          freePerFlightNb: current?.freePerFlightNb ?? current?.freePerFlight ?? 0,
          freePerFlightWb: current?.freePerFlightWb ?? current?.freePerFlight ?? 0,
          freePerFlight: current?.freePerFlightNb ?? current?.freePerFlight ?? 0,
        }
      : {
          freePerFlightNb: undefined,
          freePerFlightWb: undefined,
        };
    const primary = {
      ...current,
      serviceCode: canonicalizeWchrSServiceCode(serviceCode) || serviceCode,
      uom: primaryUom,
      ...wheelchairPatch,
    };
    const extras = extraUoms.map((uom) => ({
      ...primary,
      uom,
      unitPriceINR: undefined,
      unitPriceUSD: undefined,
    }));
    emitRules([...displayRules.slice(0, index), primary, ...extras, ...displayRules.slice(index + 1)]);
  };

  const addRule = () => {
    emitRules([emptyRule(aircraftTypes), ...displayRules]);
  };

  const filledRules = displayRules.filter((rule) => String(rule.serviceCode ?? '').trim());

  const onExportExcel = async () => {
    setDuplicateError('');
    if (filledRules.length === 0) {
      setExcelError(ADS_EQUIPMENT_RULES_EMPTY_EXPORT_MESSAGE);
      return;
    }
    setExcelError('');
    setExcelBusy('export');
    try {
      await exportAdsEquipmentRulesExcel({
        rules: filledRules,
        catalogOptions: adsServices.map((service) => ({
          value: service.value,
          label: service.label,
        })),
        airlineName,
        airlineCode,
      });
    } catch (error) {
      setExcelError(
        error instanceof Error ? error.message : ADS_EQUIPMENT_RULES_EMPTY_EXPORT_MESSAGE,
      );
    } finally {
      setExcelBusy('');
    }
  };

  const onImportExcel = async (file: File | undefined) => {
    if (!file) return;
    setDuplicateError('');
    setExcelError('');
    setExcelBusy('import');
    try {
      const imported = await parseAdsEquipmentRulesWorkbook(
        file,
        adsServices.map((service) => ({
          value: service.value,
          label: service.label,
        })),
      );
      emitRules(imported);
    } catch (error) {
      setExcelError(
        error instanceof Error ? error.message : ADS_EQUIPMENT_RULES_INVALID_EXCEL_MESSAGE,
      );
    } finally {
      setExcelBusy('');
      if (excelFileInputRef.current) excelFileInputRef.current.value = '';
    }
  };

  const validityLabel =
    validFrom && validTo
      ? formatBillingDateRange(validFrom, validTo)
      : 'Set price validity on General first';

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">ADS conditions &amp; clauses</p>
          <p className="mt-0.5 text-xs text-gray-600">
            Equipment lines apply for the whole contract window{' '}
            <strong>{validityLabel}</strong>. Charge uses the UOM saved on each line.
            ADS invoices use FOC, Always bill, UOM, and price. Equipment with no priced row is left off the invoice.
          </p>
          {roeHint ? (
            <p
              className={`mt-1 text-xs ${resolvedRate != null ? 'text-gray-500' : 'text-amber-800'}`}
            >
              {roeHint}
              {resolvedRate != null ? ' — typing INR fills USD and vice versa.' : ''}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
          {adsServices.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              No services in the catalog yet. Seed or add them under Service catalog first.
            </p>
          ) : null}

          {!validFrom || !validTo ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Set <strong>Price valid from</strong> and <strong>Price valid to</strong> on the
              General tab so ADS rules cover the full agreement window.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">Equipment rules</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={disabled || excelBusy !== ''}
                onClick={() => void onExportExcel()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Download className="h-4 w-4" aria-hidden />
                {excelBusy === 'export' ? 'Exporting…' : 'Export Excel'}
              </button>
              <button
                type="button"
                disabled={disabled || excelBusy !== ''}
                onClick={() => excelFileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Upload className="h-4 w-4" aria-hidden />
                {excelBusy === 'import' ? 'Uploading…' : 'Upload Excel'}
              </button>
              <input
                ref={excelFileInputRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="sr-only"
                aria-label="Upload ADS equipment rules Excel"
                disabled={disabled}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  void onImportExcel(file);
                }}
              />
              <button
                type="button"
                disabled={disabled || adsServices.length === 0}
                onClick={addRule}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add equipment
              </button>
            </div>
          </div>
          {duplicateError ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {duplicateError}
            </p>
          ) : null}
          {excelError ? (
            <p
              role="alert"
              className="whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {excelError}
            </p>
          ) : null}
          <p className="text-xs text-gray-500">
            Export the rows to Excel, edit them there, then upload to replace this table. Save the
            contract afterwards.
          </p>

          <div className="relative w-full max-h-[min(36rem,58vh)] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
              <colgroup>
                <col className="w-[26%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[14%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[20%]" />
                <col className="w-[6%]" />
              </colgroup>
              <thead className="sticky top-0 z-40 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="sticky top-0 z-40 border-b border-gray-200 bg-gray-50 px-2 py-2 shadow-[inset_0_-1px_0_#e5e7eb]">
                    Equipment / service
                  </th>
                  <th className="sticky top-0 z-40 border-b border-gray-200 bg-gray-50 px-2 py-2 shadow-[inset_0_-1px_0_#e5e7eb]">
                    FOC
                    <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-gray-500">
                      NB + WB
                    </span>
                  </th>
                  <th className="sticky top-0 z-40 border-b border-gray-200 bg-gray-50 px-1 py-2 text-center shadow-[inset_0_-1px_0_#e5e7eb]">
                    Always bill
                  </th>
                  <th className="sticky top-0 z-40 border-b border-gray-200 bg-gray-50 px-2 py-2 shadow-[inset_0_-1px_0_#e5e7eb]">
                    UOM
                  </th>
                  <th className="sticky top-0 z-40 border-b border-gray-200 bg-gray-50 px-2 py-2 shadow-[inset_0_-1px_0_#e5e7eb]">
                    INR
                  </th>
                  <th className="sticky top-0 z-40 border-b border-gray-200 bg-gray-50 px-2 py-2 shadow-[inset_0_-1px_0_#e5e7eb]">
                    USD
                  </th>
                  <th className="sticky top-0 z-40 border-b border-gray-200 bg-gray-50 px-2 py-2 shadow-[inset_0_-1px_0_#e5e7eb]">
                    Aircraft
                  </th>
                  <th className="sticky top-0 z-40 w-10 border-b border-gray-200 bg-gray-50 px-1 py-2 shadow-[inset_0_-1px_0_#e5e7eb]" />
                </tr>
              </thead>
              <tbody className="[&_td]:border-b [&_td]:border-gray-100 [&_td]:bg-white">
                {displayRules.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-2 py-4 text-center text-xs text-gray-500">
                      No equipment rules yet for this validity period.
                    </td>
                  </tr>
                ) : null}
                {displayRules.map((rule, index) => {
                  const selectedAircraft = selectedAircraftForUi(rule, aircraftTypes);
                  const wheelchair = isWheelchairAdsService(rule.serviceCode);
                  const freeDisabled = disabled || rule.alwaysChargeable;
                  return (
                    <tr key={`ads-rule-${index}-${rule.serviceCode || 'new'}`}>
                      <td className="px-2 py-2">
                        <select
                          value={adsRuleSelectValue(rule.serviceCode ?? '', adsServices)}
                          disabled={disabled}
                          onChange={(e) => onServiceChange(index, e.target.value)}
                          aria-label={`ADS service row ${index + 1}`}
                          className="h-9 w-full min-w-0 rounded-md border border-gray-300 bg-white px-2 text-sm"
                        >
                          <option value="">Select equipment</option>
                          {adsServices.map((service) => (
                            <option key={`${service.label}:${service.value}`} value={service.value}>
                              {service.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        {wheelchair ? (
                          <div className="flex min-w-0 flex-col gap-1.5">
                            <label className="flex items-center gap-1 text-xs text-gray-600">
                              <span className="w-7 shrink-0 font-semibold text-gray-700">NB</span>
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={rule.freePerFlightNb ?? ''}
                                disabled={freeDisabled}
                                onChange={(e) => {
                                  const freePerFlightNb = parseFreeCount(e.target.value);
                                  updateRule(index, {
                                    freePerFlightNb,
                                    freePerFlight:
                                      freePerFlightNb ?? rule.freePerFlightWb ?? 0,
                                  });
                                }}
                                placeholder="0"
                                aria-label={`NB FOC row ${index + 1}`}
                                className="w-full min-w-0 rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
                              />
                            </label>
                            <label className="flex items-center gap-1 text-xs text-gray-600">
                              <span className="w-7 shrink-0 font-semibold text-gray-700">WB</span>
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={rule.freePerFlightWb ?? ''}
                                disabled={freeDisabled}
                                onChange={(e) => {
                                  const freePerFlightWb = parseFreeCount(e.target.value);
                                  updateRule(index, {
                                    freePerFlightWb,
                                    freePerFlight:
                                      rule.freePerFlightNb ?? freePerFlightWb ?? 0,
                                  });
                                }}
                                placeholder="0"
                                aria-label={`WB FOC row ${index + 1}`}
                                className="w-full min-w-0 rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
                              />
                            </label>
                          </div>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={rule.freePerFlight ?? ''}
                            disabled={freeDisabled}
                            onChange={(e) => {
                              updateRule(index, {
                                freePerFlight: parseFreeCount(e.target.value),
                              });
                            }}
                            placeholder="0"
                            aria-label={`FOC row ${index + 1}`}
                            className="w-full min-w-0 rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
                          />
                        )}
                      </td>
                      <td className="px-1 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={Boolean(rule.alwaysChargeable)}
                          disabled={disabled}
                          onChange={(e) =>
                            updateRule(index, {
                              alwaysChargeable: e.target.checked,
                              freePerFlight: e.target.checked ? 0 : rule.freePerFlight,
                              freePerFlightNb: e.target.checked
                                ? wheelchair
                                  ? 0
                                  : undefined
                                : rule.freePerFlightNb,
                              freePerFlightWb: e.target.checked
                                ? wheelchair
                                  ? 0
                                  : undefined
                                : rule.freePerFlightWb,
                            })
                          }
                          className="h-4 w-4 rounded border-gray-300 text-[color:var(--billing-accent)] focus:ring-[color:var(--billing-accent)]"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={rule.uom ?? ''}
                          disabled={disabled}
                          onChange={(e) => updateRule(index, { uom: e.target.value || undefined })}
                          className="h-9 w-full min-w-0 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                        >
                          <option value="">Select UOM</option>
                          {uomChoicesForRule(rule).map((uom) => (
                            <option key={uom} value={uom}>
                              {uom}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={rule.unitPriceINR ?? ''}
                          disabled={disabled}
                          onChange={(e) => onUnitPriceInrChange(index, e.target.value)}
                          placeholder={resolvedRate != null ? 'INR' : '—'}
                          className="w-full min-w-0 rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={rule.unitPriceUSD ?? ''}
                          disabled={disabled}
                          onChange={(e) => onUnitPriceUsdChange(index, e.target.value)}
                          placeholder={resolvedRate != null ? 'auto' : '—'}
                          className="w-full min-w-0 rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
                        />
                      </td>
                      <td className="px-2 py-2">
                        {aircraftTypes.length === 0 ? (
                          <p className="min-w-0 text-xs text-amber-800">
                            Pick aircraft types on the contract first.
                          </p>
                        ) : (
                          <CompactAircraftDropdown
                            aircraftTypes={aircraftTypes}
                            selected={selectedAircraft}
                            disabled={disabled}
                            labelledBy={`Aircraft types row ${index + 1}`}
                            onChange={(next) =>
                              updateRule(index, {
                                aircraftTypes: next,
                                aircraftType: undefined,
                              })
                            }
                          />
                        )}
                      </td>
                      <td className="px-1 py-2 text-center">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => removeRule(index)}
                          className="inline-flex items-center rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                          aria-label={`Remove ADS rule ${index + 1}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-500">
            Example: free 1 pax loader / flight applies for every flight inside Price valid from → to.
            Quantity billed follows the UOM on this line (each, per hour, per half hour, …).
          </p>
        </div>
    </div>
  );
}
