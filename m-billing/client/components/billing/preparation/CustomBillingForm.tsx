'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import type { BillingApi } from '@/lib/billing-api';
import {
  buildCustomBillingEquipmentOptions,
  buildCustomBillingUnitOptions,
  loadCustomBillingLineLookups,
  type CustomBillingEquipmentOption,
} from './customBillingLineOptions';
import {
  CustomBillingEquipmentCell,
  CustomBillingUnitCell,
} from './CustomBillingTableComboboxes';

export type CustomBillingLine = {
  particular: string;
  used: number;
  charged: number;
  aircraftType: string;
  unit: string;
  ratePerUnit: number;
};

type Props = {
  api: BillingApi;
  defaultFrom?: string;
  defaultTo?: string;
  defaultCustomerCode?: string;
  onSubmitted: (message: string) => void;
};

function emptyLine(aircraftType = ''): CustomBillingLine {
  return {
    particular: '',
    used: 1,
    charged: 1,
    aircraftType,
    unit: 'Per Service',
    ratePerUnit: 0,
  };
}

const selectClass =
  'w-full min-w-[8rem] rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500';

export function CustomBillingForm({
  api,
  defaultFrom = '',
  defaultTo = '',
  defaultCustomerCode = '',
  onSubmitted,
}: Props) {
  const [customerCode, setCustomerCode] = useState(defaultCustomerCode);
  const [periodFrom, setPeriodFrom] = useState(defaultFrom);
  const [periodTo, setPeriodTo] = useState(defaultTo);
  const [customers, setCustomers] = useState<Array<{ customerCode: string; name: string }>>(
    [],
  );
  const [lines, setLines] = useState<CustomBillingLine[]>(() => [emptyLine()]);
  const [concessionPercent, setConcessionPercent] = useState(0);
  const [conversionRate, setConversionRate] = useState<number | ''>('');
  const [masterConversionRate, setMasterConversionRate] = useState<number | null>(null);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingLookups, setLoadingLookups] = useState(false);
  const [equipmentOptions, setEquipmentOptions] = useState<CustomBillingEquipmentOption[]>([]);
  /** Distinct TypeCraft from FHR flights for selected airline + period. */
  const [aircraftTypes, setAircraftTypes] = useState<string[]>([]);
  const [loadingAircraft, setLoadingAircraft] = useState(false);
  const [unitOptions, setUnitOptions] = useState<string[]>(() => buildCustomBillingUnitOptions());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setPeriodFrom(defaultFrom);
    setPeriodTo(defaultTo);
  }, [defaultFrom, defaultTo]);

  useEffect(() => {
    if (defaultCustomerCode) setCustomerCode(defaultCustomerCode);
  }, [defaultCustomerCode]);

  useEffect(() => {
    let cancelled = false;
    setLoadingCustomers(true);
    void (async () => {
      try {
        const res = await api.listCustomers({ limit: 5000, active: 'all' });
        const list = (res.data ?? []) as Array<{ customerCode: string; name: string }>;
        if (cancelled) return;
        list.sort((a, b) =>
          String(a.customerCode ?? '').localeCompare(String(b.customerCode ?? ''), undefined, {
            sensitivity: 'base',
          }),
        );
        setCustomers(list);
      } catch {
        if (!cancelled) setCustomers([]);
      } finally {
        if (!cancelled) setLoadingCustomers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    setLoadingLookups(true);
    void (async () => {
      try {
        const lookups = await loadCustomBillingLineLookups(api);
        if (cancelled) return;
        setEquipmentOptions(lookups.equipmentOptions);
        setUnitOptions(lookups.unitOptions);
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
  }, [api]);

  // Clear aircraft picks when airline / period changes — FHR set is scoped to that window.
  useEffect(() => {
    setAircraftTypes([]);
    setLines((prev) => prev.map((line) => ({ ...line, aircraftType: '' })));
  }, [customerCode, periodFrom, periodTo]);

  // Distinct TypeCraft from fhr_collection flights for selected airline + period.
  useEffect(() => {
    const customer = customerCode.trim();
    const from = periodFrom.trim();
    const to = periodTo.trim();
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
  }, [api, customerCode, periodFrom, periodTo]);

  // Master USD→INR rate for the billing month (hint when customer bills in USD).
  useEffect(() => {
    const from = periodFrom.trim();
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
  }, [api, periodFrom]);

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
    Boolean(customerCode.trim()) && Boolean(periodFrom.trim()) && Boolean(periodTo.trim());

  const aircraftPlaceholder = () => {
    if (!customerCode.trim()) return 'Select customer first';
    if (!periodFrom.trim() || !periodTo.trim()) return 'Set period first';
    if (loadingAircraft) return 'Loading from FHR…';
    if (aircraftTypes.length === 0) return 'No aircraft types for this airline in period';
    return 'Select aircraft type';
  };

  const updateLine = (index: number, patch: Partial<CustomBillingLine>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const onParticularChange = (index: number, particular: string, unitHint?: string) => {
    const patch: Partial<CustomBillingLine> = { particular };
    if (unitHint) patch.unit = unitHint.trim() || 'Per Service';
    updateLine(index, patch);
  };

  const addLine = () => {
    const ac = lines[0]?.aircraftType ?? '';
    setLines((prev) => [...prev, emptyLine(ac)]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const payloadLines = () =>
    lines.map((line) => ({
      particular: line.particular.trim(),
      used: Number(line.used) || 0,
      charged: Number(line.charged) || 0,
      aircraftType: line.aircraftType.trim() || undefined,
      unit: line.unit.trim() || 'Per Service',
      ratePerUnit: Number(line.ratePerUnit) || 0,
    }));

  const validate = (): string | null => {
    if (!customerCode.trim()) return 'Select a customer.';
    if (!periodFrom.trim() || !periodTo.trim()) return 'Set billing period from and to.';
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

  const submit = async () => {
    const issue = validate();
    if (issue) {
      setError(issue);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.submitCustomBilling({
        customerCode: customerCode.trim().toUpperCase(),
        billingPeriodStart: periodFrom.trim(),
        billingPeriodEnd: periodTo.trim(),
        concessionPercent: Number(concessionPercent) || 0,
        conversionRate: conversionRate === '' ? undefined : Number(conversionRate),
        lines: payloadLines(),
      });
      setCustomerCode('');
      setPeriodFrom(defaultFrom);
      setPeriodTo(defaultTo);
      setConcessionPercent(0);
      setConversionRate('');
      setLines([emptyLine()]);
      setError('');
      onSubmitted(
        'Custom invoice draft created — open Invoice drafts → Custom Bills.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit custom billing');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-amber-200/80 bg-amber-50/40 p-3 sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Custom billing lines</h3>
          <p className="mt-0.5 text-xs text-gray-600">
            Select customer and period first — aircraft types load from FHR flights for that
            airline. Pick or type equipment and unit names. Optional concession % reduces the
            invoice total; optional conversion rate overrides the master USD→INR rate on the
            invoice. Per 15 Minutes = 1 unit per 15 minutes used. Form clears after submit.
          </p>
        </div>
        <button
          type="button"
          onClick={addLine}
          disabled={submitting}
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add line
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-gray-600">
          Customer
          <select
            value={customerCode}
            onChange={(e) => setCustomerCode(e.target.value)}
            disabled={submitting || loadingCustomers}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
            aria-label="Customer for custom billing"
          >
            <option value="">
              {loadingCustomers ? 'Loading customers…' : 'Select customer'}
            </option>
            {customers.map((c) => (
              <option key={c.customerCode} value={c.customerCode}>
                {c.customerCode} — {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Period from
          <input
            type="date"
            value={periodFrom}
            onChange={(e) => setPeriodFrom(e.target.value)}
            disabled={submitting}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Period to
          <input
            type="date"
            value={periodTo}
            onChange={(e) => setPeriodTo(e.target.value)}
            disabled={submitting}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Concession %
          <input
            type="number"
            min={0}
            max={100}
            step="any"
            value={concessionPercent}
            onChange={(e) => setConcessionPercent(Number(e.target.value))}
            disabled={submitting}
            className="w-24 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
            aria-label="Concession percent for custom bill"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
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
            disabled={submitting}
            placeholder={
              masterConversionRate != null
                ? `Master: ${masterConversionRate}`
                : 'USD→INR (optional)'
            }
            className="w-36 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
            aria-label="Custom USD to INR conversion rate"
          />
        </label>
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
                      disabled={submitting}
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
                      disabled={submitting}
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
                      disabled={submitting}
                      aria-label={`Charged line ${index + 1}`}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={line.aircraftType}
                      onChange={(e) => updateLine(index, { aircraftType: e.target.value })}
                      className={`${selectClass} min-w-[7rem]`}
                      disabled={submitting || !aircraftReady || loadingAircraft}
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
                      disabled={submitting}
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
                      disabled={submitting}
                      aria-label={`Rate per unit line ${index + 1}`}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      disabled={submitting || lines.length <= 1}
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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Submit → Invoice draft
        </button>
      </div>
    </div>
  );
}
