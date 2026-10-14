'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingPreparationRecord } from '@/lib/billing-shared/types';
import {
  buildCustomBillingEquipmentOptions,
  buildCustomBillingUnitOptions,
  loadCustomBillingLineLookups,
  type CustomBillingEquipmentOption,
} from '../preparation/customBillingLineOptions';
import {
  CustomBillingEquipmentCell,
  CustomBillingUnitCell,
} from '../preparation/CustomBillingTableComboboxes';

export type CustomEditLine = {
  particular: string;
  used: number;
  charged: number;
  aircraftType: string;
  unit: string;
  ratePerUnit: number;
};

type Props = {
  api: BillingApi;
  draftId: string;
  currencyCode: string;
  totalReceivableInUsd?: boolean;
  preparationRecords: BillingPreparationRecord[];
  invoiceLines?: Array<Record<string, unknown>>;
  onSaved: (message: string) => void;
};

function emptyLine(): CustomEditLine {
  return {
    particular: '',
    used: 1,
    charged: 1,
    aircraftType: '',
    unit: 'Per Service',
    ratePerUnit: 0,
  };
}

const selectClass =
  'w-full min-w-[8rem] rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500';

function linesFromPrep(records: BillingPreparationRecord[]): CustomEditLine[] {
  const record = records.find((r) => String(r.sourceType ?? '').toLowerCase() === 'custom') ?? records[0];
  if (!record) return [emptyLine()];
  const rateMatch = (record.rateMatch ?? {}) as Record<string, unknown>;
  const snap = (record.operationalSnapshot ?? {}) as Record<string, unknown>;
  const defaultAc = String(
    rateMatch.aircraftType ?? snap.aircraftType ?? snap.ACType ?? '',
  )
    .trim()
    .toUpperCase();
  const raw = rateMatch.customLines;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((entry) => {
      const line = (entry ?? {}) as Record<string, unknown>;
      return {
        particular: String(line.particular ?? ''),
        used: Number(line.used ?? 1) || 0,
        charged: Number(line.charged ?? line.used ?? 1) || 0,
        aircraftType: String(line.aircraftType ?? defaultAc).trim().toUpperCase(),
        unit: String(line.unit ?? line.uom ?? 'Per Service') || 'Per Service',
        ratePerUnit: Number(line.ratePerUnit ?? line.unitPrice ?? 0) || 0,
      };
    });
  }
  const particular = String(rateMatch.particular ?? '').trim();
  if (particular) {
    return [
      {
        particular,
        used: Number(rateMatch.usedUnits ?? 1) || 0,
        charged: Number(rateMatch.chargedUnits ?? rateMatch.usedUnits ?? 1) || 0,
        aircraftType: defaultAc,
        unit: String(rateMatch.uom ?? 'Per Service') || 'Per Service',
        ratePerUnit: Number(rateMatch.unitPrice ?? 0) || 0,
      },
    ];
  }
  return [emptyLine()];
}

function linesFromInvoice(invoiceLines: Array<Record<string, unknown>>): CustomEditLine[] {
  const mapped = invoiceLines
    .filter((l) => String(l.lineType ?? 'service') === 'service')
    .map((l) => {
      const sourceRef = (l.sourceRef ?? {}) as Record<string, unknown>;
      return {
        particular: String(l.description ?? ''),
        used: Number(sourceRef.usedQuantity ?? l.quantity ?? 1) || 0,
        charged: Number(sourceRef.chargedQuantity ?? l.quantity ?? 1) || 0,
        aircraftType: String(sourceRef.aircraftType ?? '').trim().toUpperCase(),
        unit: String(l.uom ?? 'Per Service') || 'Per Service',
        ratePerUnit: Number(sourceRef.ratePerUnit ?? l.unitPrice ?? 0) || 0,
      };
    })
    .filter((l) => l.particular.trim());
  return mapped.length > 0 ? mapped : [emptyLine()];
}

function concessionFromPrep(records: BillingPreparationRecord[]): number {
  const record =
    records.find((r) => String(r.sourceType ?? '').toLowerCase() === 'custom') ?? records[0];
  if (!record) return 0;
  const rateMatch = (record.rateMatch ?? {}) as Record<string, unknown>;
  const n = Number(rateMatch.customConcessionPercent ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.min(100, n) : 0;
}

function concessionFromInvoice(invoiceLines: Array<Record<string, unknown>>): number {
  for (const l of invoiceLines) {
    const sourceRef = (l.sourceRef ?? {}) as Record<string, unknown>;
    const n = Number(sourceRef.concessionFeePercent ?? 0);
    if (Number.isFinite(n) && n > 0) return Math.min(100, n);
  }
  return 0;
}

function conversionRateFromPrep(records: BillingPreparationRecord[]): number | '' {
  const record =
    records.find((r) => String(r.sourceType ?? '').toLowerCase() === 'custom') ?? records[0];
  if (!record) return '';
  const rateMatch = (record.rateMatch ?? {}) as Record<string, unknown>;
  const n = Number(rateMatch.customConversionRate ?? 0);
  return Number.isFinite(n) && n > 0 ? n : '';
}

function scopeFromPrep(records: BillingPreparationRecord[]): {
  customerCode: string;
  periodFrom: string;
  periodTo: string;
} {
  const record =
    records.find((r) => String(r.sourceType ?? '').toLowerCase() === 'custom') ?? records[0];
  if (!record) return { customerCode: '', periodFrom: '', periodTo: '' };
  return {
    customerCode: String(record.customerCode ?? '').trim().toUpperCase(),
    periodFrom: String(record.billingPeriodStart ?? '').slice(0, 10),
    periodTo: String(record.billingPeriodEnd ?? '').slice(0, 10),
  };
}

export function CustomInvoiceEditForm({
  api,
  draftId,
  currencyCode,
  totalReceivableInUsd = false,
  preparationRecords,
  invoiceLines = [],
  onSaved,
}: Props) {
  const seedKey = `${draftId}:${preparationRecords.map((r) => r._id).join(',')}:${invoiceLines.length}`;
  const [lines, setLines] = useState<CustomEditLine[]>(() => {
    const fromPrep = linesFromPrep(preparationRecords);
    if (fromPrep.some((l) => l.particular.trim() || l.ratePerUnit > 0)) return fromPrep;
    return linesFromInvoice(invoiceLines);
  });
  const [concessionPercent, setConcessionPercent] = useState(() => {
    const fromPrep = concessionFromPrep(preparationRecords);
    return fromPrep > 0 ? fromPrep : concessionFromInvoice(invoiceLines);
  });
  const [conversionRate, setConversionRate] = useState<number | ''>(() =>
    conversionRateFromPrep(preparationRecords),
  );
  const [masterConversionRate, setMasterConversionRate] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [settingUsdReceivable, setSettingUsdReceivable] = useState(false);
  const [settingInrReceivable, setSettingInrReceivable] = useState(false);
  const [error, setError] = useState('');
  const [loadingLookups, setLoadingLookups] = useState(false);
  const [equipmentOptions, setEquipmentOptions] = useState<CustomBillingEquipmentOption[]>([]);
  const [aircraftTypes, setAircraftTypes] = useState<string[]>([]);
  const [loadingAircraft, setLoadingAircraft] = useState(false);
  const [unitOptions, setUnitOptions] = useState<string[]>(() => buildCustomBillingUnitOptions());
  const scope = useMemo(() => scopeFromPrep(preparationRecords), [preparationRecords]);

  useEffect(() => {
    const fromPrep = linesFromPrep(preparationRecords);
    setLines(
      fromPrep.some((l) => l.particular.trim() || l.ratePerUnit > 0)
        ? fromPrep
        : linesFromInvoice(invoiceLines),
    );
    const conc = concessionFromPrep(preparationRecords);
    setConcessionPercent(conc > 0 ? conc : concessionFromInvoice(invoiceLines));
    setConversionRate(conversionRateFromPrep(preparationRecords));
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reseed when draft/prep identity changes
  }, [seedKey]);

  useEffect(() => {
    let cancelled = false;
    setLoadingLookups(true);
    void (async () => {
      try {
        const lookups = await loadCustomBillingLineLookups(api);
        if (cancelled) return;
        const seedLines = (() => {
          const fromPrep = linesFromPrep(preparationRecords);
          return fromPrep.some((l) => l.particular.trim() || l.ratePerUnit > 0)
            ? fromPrep
            : linesFromInvoice(invoiceLines);
        })();
        const extras = seedLines.map((l) => l.particular).filter(Boolean);
        const merged = new Map(
          lookups.equipmentOptions.map((e) => [e.code.toLowerCase(), e] as const),
        );
        for (const code of extras) {
          const key = code.trim().toLowerCase();
          if (!key || merged.has(key)) continue;
          merged.set(key, { code: code.trim(), label: code.trim(), uom: 'Per Service' });
        }
        setEquipmentOptions(
          [...merged.values()].sort((a, b) =>
            a.code.localeCompare(b.code, undefined, { sensitivity: 'base' }),
          ),
        );
        setUnitOptions(
          buildCustomBillingUnitOptions(
            lookups.unitOptions,
            seedLines.map((l) => l.unit),
          ),
        );
      } catch {
        if (!cancelled) {
          setEquipmentOptions(buildCustomBillingEquipmentOptions([]));
          setUnitOptions(buildCustomBillingUnitOptions());
        }
      } finally {
        if (!cancelled) setLoadingLookups(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, seedKey, preparationRecords, invoiceLines]);

  useEffect(() => {
    const customer = scope.customerCode.trim();
    const from = scope.periodFrom.trim();
    const to = scope.periodTo.trim();
    if (!customer || !from || !to || from > to) {
      setAircraftTypes([]);
      return;
    }

    let cancelled = false;
    setLoadingAircraft(true);
    void (async () => {
      try {
        const res = await api.listAdsAircraftTypes({
          from,
          to,
          customerCode: customer,
          dateBasis: 'schedule-date',
        });
        if (cancelled) return;
        const list = ((res as { data?: string[] }).data ?? [])
          .map((v) => String(v ?? '').trim().toUpperCase())
          .filter(Boolean);
        setAircraftTypes(list);
      } catch {
        if (!cancelled) setAircraftTypes([]);
      } finally {
        if (!cancelled) setLoadingAircraft(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, scope.customerCode, scope.periodFrom, scope.periodTo, seedKey]);

  useEffect(() => {
    const from = scope.periodFrom.trim();
    if (!from) {
      setMasterConversionRate(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.getEffectiveExchangeRate({
          currencyCode: 'USD',
          date: from,
        });
        if (cancelled) return;
        const rate = Number((res as { data?: { rateToINR?: number } }).data?.rateToINR ?? 0);
        setMasterConversionRate(Number.isFinite(rate) && rate > 0 ? rate : null);
      } catch {
        if (!cancelled) setMasterConversionRate(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, scope.periodFrom, seedKey]);

  const equipmentByCode = useMemo(() => {
    const map = new Map<string, CustomBillingEquipmentOption>();
    for (const opt of equipmentOptions) {
      map.set(opt.code.toLowerCase(), opt);
    }
    return map;
  }, [equipmentOptions]);

  const unitOptionsForLine = (unit: string) => {
    const trimmed = unit.trim();
    if (!trimmed || unitOptions.includes(trimmed)) return unitOptions;
    return [...unitOptions, trimmed].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
  };

  const aircraftOptionsForLine = (aircraftType: string) => {
    const trimmed = aircraftType.trim().toUpperCase();
    if (!trimmed || aircraftTypes.includes(trimmed)) return aircraftTypes;
    return [...aircraftTypes, trimmed].sort((a, b) => a.localeCompare(b));
  };

  const aircraftReady =
    Boolean(scope.customerCode.trim()) &&
    Boolean(scope.periodFrom.trim()) &&
    Boolean(scope.periodTo.trim());

  const aircraftPlaceholder = () => {
    if (!scope.customerCode.trim()) return 'Missing customer on draft';
    if (!scope.periodFrom.trim() || !scope.periodTo.trim()) return 'Missing period on draft';
    if (loadingAircraft) return 'Loading from FHR…';
    if (aircraftTypes.length === 0) return 'No aircraft types for this airline in period';
    return 'Select aircraft type';
  };

  const updateLine = (index: number, patch: Partial<CustomEditLine>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const onParticularChange = (index: number, particular: string, unitHint?: string) => {
    const patch: Partial<CustomEditLine> = { particular };
    if (unitHint) patch.unit = unitHint.trim() || 'Per Service';
    updateLine(index, patch);
  };

  const addLine = () => {
    const ac = lines[0]?.aircraftType ?? '';
    setLines((prev) => [...prev, { ...emptyLine(), aircraftType: ac }]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const validate = (): string | null => {
    const concession = Number(concessionPercent);
    if (!Number.isFinite(concession) || concession < 0 || concession > 100) {
      return 'Concession % must be between 0 and 100.';
    }
    if (conversionRate !== '') {
      const rate = Number(conversionRate);
      if (!Number.isFinite(rate) || rate <= 0) {
        return 'Conversion rate must be greater than zero when set.';
      }
    }
    if (lines.length === 0) return 'Add at least one custom billing line.';
    for (const line of lines) {
      if (!line.particular.trim()) return 'Select equipment (particulars) on every line.';
      if (!(Number(line.ratePerUnit) > 0)) return 'Rate/Unit must be greater than zero.';
      if (!(Number(line.charged) > 0) && !(Number(line.used) > 0)) {
        return 'Used or Charged must be greater than zero.';
      }
    }
    return null;
  };

  const save = async () => {
    const issue = validate();
    if (issue) {
      setError(issue);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.updateCustomInvoiceDraftLines(draftId, {
        concessionPercent: Number(concessionPercent) || 0,
        conversionRate: conversionRate === '' ? null : Number(conversionRate),
        lines: lines.map((line) => ({
          particular: line.particular.trim(),
          used: Number(line.used) || 0,
          charged: Number(line.charged) || 0,
          aircraftType: line.aircraftType.trim() || undefined,
          unit: line.unit.trim() || 'Per Service',
          ratePerUnit: Number(line.ratePerUnit) || 0,
        })),
      });
      onSaved('Custom bill lines updated and invoice recalculated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update custom invoice');
    } finally {
      setSaving(false);
    }
  };

  const usdReceivableActive = currencyCode === 'USD' && totalReceivableInUsd;
  const inrReceivableActive = currencyCode === 'INR' && !totalReceivableInUsd;

  const handleSetTotalReceivableUsd = async () => {
    if (usdReceivableActive) return;
    setSettingUsdReceivable(true);
    setError('');
    try {
      await api.setDraftTotalReceivableUsd(draftId);
      onSaved(
        'Amounts converted to USD. Concession and CGST/SGST are calculated on the USD gross.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set USD receivable');
    } finally {
      setSettingUsdReceivable(false);
    }
  };

  const handleSetTotalReceivableInr = async () => {
    if (inrReceivableActive) return;
    setSettingInrReceivable(true);
    setError('');
    try {
      await api.setDraftTotalReceivableInr(draftId);
      onSaved(
        'Amounts converted to INR. Concession and CGST/SGST are calculated on the INR gross.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set INR receivable');
    } finally {
      setSettingInrReceivable(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-amber-200/80 bg-amber-50/40 p-3 sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Edit custom billing lines</h3>
          <p className="mt-0.5 text-xs text-gray-600">
            Aircraft types load from FHR flights for this draft&apos;s airline and period.
            Pick or type equipment and unit names. Rate/Unit stays as entered; concession reduces
            the invoice total. Optional conversion rate overrides master USD→INR on the invoice.
            Per 15 Minutes = 1 unit per 15 minutes used.
          </p>
        </div>
        <button
          type="button"
          onClick={addLine}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add line
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="inline-flex flex-col gap-1 text-xs font-medium text-gray-600">
          Concession %
          <input
            type="number"
            min={0}
            max={100}
            step="any"
            value={concessionPercent}
            onChange={(e) => setConcessionPercent(Number(e.target.value))}
            disabled={saving}
            className="w-24 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            aria-label="Concession percent for custom bill"
          />
        </label>
        <label className="inline-flex flex-col gap-1 text-xs font-medium text-gray-600">
          Conversion rate
          <input
            type="number"
            min={0}
            step="any"
            value={conversionRate}
            onChange={(e) => {
              const raw = e.target.value;
              setConversionRate(raw === '' ? '' : Number(raw));
            }}
            disabled={saving}
            placeholder={
              masterConversionRate != null
                ? `Master: ${masterConversionRate}`
                : 'USD→INR (optional)'
            }
            className="w-36 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            aria-label="Custom USD to INR conversion rate"
          />
        </label>
        <button
          type="button"
          disabled={saving || settingUsdReceivable || settingInrReceivable || usdReceivableActive}
          onClick={() => void handleSetTotalReceivableUsd()}
          aria-pressed={usdReceivableActive}
          title="Convert amounts to USD, then calculate concession and CGST/SGST on the USD gross."
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed ${
            usdReceivableActive
              ? 'border-violet-400 bg-violet-100 text-violet-950'
              : 'border-violet-300 bg-violet-50 text-violet-900 hover:bg-violet-100'
          }`}
        >
          {settingUsdReceivable ? 'Applying USD receivable…' : 'Total amount receivable as USD'}
        </button>
        <button
          type="button"
          disabled={saving || settingUsdReceivable || settingInrReceivable || inrReceivableActive}
          onClick={() => void handleSetTotalReceivableInr()}
          aria-pressed={inrReceivableActive}
          title="Convert amounts to INR, then calculate concession and CGST/SGST on the INR gross."
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed ${
            inrReceivableActive
              ? 'border-emerald-400 bg-emerald-100 text-emerald-950'
              : 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
          }`}
        >
          {settingInrReceivable ? 'Applying INR receivable…' : 'Total amount receivable as INR'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-amber-200/80 text-[11px] uppercase tracking-wide text-gray-500">
              <th className="px-2 py-2 font-medium">Particulars</th>
              <th className="px-2 py-2 font-medium">Used</th>
              <th className="px-2 py-2 font-medium">Charged</th>
              <th className="px-2 py-2 font-medium">Aircraft type</th>
              <th className="px-2 py-2 font-medium">Unit</th>
              <th className="px-2 py-2 font-medium">Rate/Unit</th>
              <th className="px-2 py-2 font-medium">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index} className="border-b border-amber-100/80 align-top">
                  <td className="px-2 py-2">
                    <CustomBillingEquipmentCell
                      index={index}
                      particular={line.particular}
                      equipmentOptions={equipmentOptions}
                      equipmentByCode={equipmentByCode}
                      loadingLookups={loadingLookups}
                      disabled={saving}
                      onParticularChange={onParticularChange}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={line.used}
                      onChange={(e) => updateLine(index, { used: Number(e.target.value) })}
                      className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm"
                      disabled={saving}
                      aria-label={`Used line ${index + 1}`}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={line.charged}
                      onChange={(e) => updateLine(index, { charged: Number(e.target.value) })}
                      className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm"
                      disabled={saving}
                      aria-label={`Charged line ${index + 1}`}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={line.aircraftType}
                      onChange={(e) => updateLine(index, { aircraftType: e.target.value })}
                      className={`${selectClass} min-w-[7rem]`}
                      disabled={saving || !aircraftReady || loadingAircraft}
                      aria-label={`Aircraft type line ${index + 1}`}
                    >
                      <option value="">{aircraftPlaceholder()}</option>
                      {aircraftOptionsForLine(line.aircraftType).map((ac) => (
                        <option key={ac} value={ac}>
                          {ac}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <CustomBillingUnitCell
                      index={index}
                      unit={line.unit}
                      unitOptions={unitOptionsForLine(line.unit)}
                      loadingLookups={loadingLookups}
                      disabled={saving}
                      onUnitChange={(lineIndex, unit) => updateLine(lineIndex, { unit })}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={line.ratePerUnit}
                      onChange={(e) =>
                        updateLine(index, { ratePerUnit: Number(e.target.value) })
                      }
                      className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
                      disabled={saving}
                      aria-label={`Rate per unit line ${index + 1}`}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      disabled={saving || lines.length <= 1}
                      className="rounded p-1.5 text-gray-500 hover:bg-white hover:text-red-600 disabled:opacity-40"
                      aria-label={`Remove line ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Save custom lines
      </button>
    </div>
  );
}
