'use client';

import { useMemo, useState } from 'react';
import type { BillingBhsVolumeSchedule } from '@/lib/billing-shared/types';
import {
  BHS_VOLUME_SCOPE_OPTIONS,
  emptyBhsVolumeSchedule,
  previewVolumeMonth,
  volumeBandLabel,
} from '@/lib/billing-shared/bhs-volume-schedule';
import { ContractField, ContractInput, contractUi } from './ContractUi';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

type Props = {
  schedules: BillingBhsVolumeSchedule[];
  onChange: (next: BillingBhsVolumeSchedule[]) => void;
  error?: string;
};

export function ContractBhsVolumeEditor({
  schedules,
  onChange,
  error,
}: Props) {
  const [previewCounts, setPreviewCounts] = useState<Record<number, string>>({});

  const update = (index: number, patch: Partial<BillingBhsVolumeSchedule>) => {
    onChange(schedules.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const previewRows = useMemo(
    () =>
      schedules.map((schedule, index) => {
        const count = Number(previewCounts[index] ?? (index === 0 ? '720' : ''));
        if (!Number.isFinite(count) || count <= 0) return [];
        return previewVolumeMonth(count, schedule);
      }),
    [previewCounts, schedules],
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3">
        <p className="max-w-3xl text-sm text-slate-600">
          These comprehensive rates replace the saved price-card rate for matching flights.
          Stepwise bands fill in order: the first flights of the month take band 1, the next
          band 2, and the rest the open band. A RON flight then adds the RON percent on its
          own band rate. Passenger, freighter, and cargo share a band unless you restrict
          the carrier.
        </p>
      </div>

      {error ? <p className={contractUi.fieldError}>{error}</p> : null}

      {schedules.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          No volume rates. The saved comprehensive rate on the price card is used for every flight.
        </p>
      ) : null}

      {schedules.map((schedule, index) => {
        const slices = previewRows[index] ?? [];
        const previewTotal = slices.reduce((sum, slice) => sum + slice.amount, 0);
        return (
          <fieldset key={`${schedule.flightScope}-${index}`} className={contractUi.nestedCard}>
            <legend className="px-1 text-sm font-bold text-slate-900">
              {schedule.label?.trim() || `Comprehensive schedule ${index + 1}`}
            </legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ContractField label="Flights this applies to" htmlFor={`bhs-scope-${index}`}>
                <select
                  id={`bhs-scope-${index}`}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  value={schedule.flightScope}
                  onChange={(event) =>
                    update(index, {
                      flightScope: event.target.value as BillingBhsVolumeSchedule['flightScope'],
                    })
                  }
                >
                  {BHS_VOLUME_SCOPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </ContractField>
              <ContractField label="Carrier" htmlFor={`bhs-carrier-${index}`}>
                <select
                  id={`bhs-carrier-${index}`}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  value={schedule.carrierKind ?? 'any'}
                  onChange={(event) =>
                    update(index, {
                      carrierKind: event.target.value as BillingBhsVolumeSchedule['carrierKind'],
                    })
                  }
                >
                  <option value="any">Passenger, freighter, and cargo</option>
                  <option value="passenger">Passenger only</option>
                  <option value="freighter">Freighter only</option>
                  <option value="cargo">Cargo only</option>
                </select>
              </ContractField>
              <ContractField label="How the month is charged" htmlFor={`bhs-allocation-${index}`}>
                <select
                  id={`bhs-allocation-${index}`}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  value={schedule.allocation}
                  onChange={(event) =>
                    update(index, {
                      allocation: event.target.value as BillingBhsVolumeSchedule['allocation'],
                    })
                  }
                >
                  <option value="marginal">Stepwise bands</option>
                  <option value="flat">Same rate for every flight</option>
                </select>
              </ContractField>
              <ContractField label="Label" htmlFor={`bhs-label-${index}`}>
                <ContractInput
                  id={`bhs-label-${index}`}
                  value={schedule.label ?? ''}
                  onChange={(event) => update(index, { label: event.target.value })}
                />
              </ContractField>
              <ContractField label="Rate from" htmlFor={`bhs-from-${index}`} hint="YYYY-MM-DD">
                <ContractInput
                  id={`bhs-from-${index}`}
                  type="date"
                  value={schedule.effectiveFrom ?? ''}
                  onChange={(event) => update(index, { effectiveFrom: event.target.value })}
                />
              </ContractField>
              <ContractField label="Rate to" htmlFor={`bhs-to-${index}`} hint="YYYY-MM-DD">
                <ContractInput
                  id={`bhs-to-${index}`}
                  type="date"
                  value={schedule.effectiveTo ?? ''}
                  onChange={(event) => update(index, { effectiveTo: event.target.value })}
                />
              </ContractField>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead>
                  <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">From flight</th>
                    <th className="py-2 pr-3">To flight</th>
                    <th className="py-2 pr-3">Comprehensive INR</th>
                    <th className="py-2"> </th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.bands.map((band, bandIndex) => (
                    <tr key={`${index}-${bandIndex}`} className="border-t border-slate-100">
                      <td className="py-2 pr-3">
                        <ContractInput
                          aria-label={`Band ${bandIndex + 1} from flight`}
                          type="number"
                          min={1}
                          value={band.fromCount}
                          onChange={(event) => {
                            const fromCount = Number(event.target.value);
                            const bands = schedule.bands.map((row, i) =>
                              i === bandIndex ? { ...row, fromCount } : row,
                            );
                            update(index, { bands });
                          }}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <ContractInput
                          aria-label={`Band ${bandIndex + 1} to flight`}
                          type="number"
                          min={1}
                          placeholder="Open"
                          value={band.toCount ?? ''}
                          onChange={(event) => {
                            const raw = event.target.value.trim();
                            const toCount = raw === '' ? null : Number(raw);
                            const bands = schedule.bands.map((row, i) =>
                              i === bandIndex ? { ...row, toCount } : row,
                            );
                            update(index, { bands });
                          }}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <ContractInput
                          aria-label={`Band ${bandIndex + 1} comprehensive rate`}
                          type="number"
                          min={0}
                          value={band.unitPriceINR || ''}
                          onChange={(event) => {
                            const unitPriceINR = Number(event.target.value);
                            const bands = schedule.bands.map((row, i) =>
                              i === bandIndex ? { ...row, unitPriceINR } : row,
                            );
                            update(index, { bands });
                          }}
                        />
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          className={contractUi.btnGhost}
                          onClick={() =>
                            update(index, {
                              bands: schedule.bands.filter((_, i) => i !== bandIndex),
                            })
                          }
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={contractUi.btnGhost}
                onClick={() => {
                  const last = schedule.bands[schedule.bands.length - 1];
                  const fromCount = last?.toCount != null ? last.toCount + 1 : 1;
                  update(index, {
                    bands: [
                      ...schedule.bands,
                      { fromCount, toCount: null, unitPriceINR: 0 },
                    ],
                  });
                }}
              >
                Add band
              </button>
              <button
                type="button"
                className={contractUi.btnDangerOutline}
                onClick={() => onChange(schedules.filter((_, i) => i !== index))}
              >
                Remove schedule
              </button>
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 p-3">
              <ContractField
                label="Preview flight count for this group"
                htmlFor={`bhs-preview-${index}`}
                hint="Shows how one full month splits across the bands. RON is extra on top of the band."
              >
                <ContractInput
                  id={`bhs-preview-${index}`}
                  type="number"
                  min={1}
                  value={previewCounts[index] ?? (index === 0 ? '720' : '')}
                  onChange={(event) =>
                    setPreviewCounts((prev) => ({ ...prev, [index]: event.target.value }))
                  }
                />
              </ContractField>
              {slices.length > 0 ? (
                <ul className="mt-3 grid gap-1 text-sm text-slate-700">
                  {slices.map((slice) => (
                    <li key={`${slice.fromCount}-${slice.toCount ?? 'open'}`}>
                      {volumeBandLabel({
                        fromCount: slice.fromCount,
                        toCount: slice.toCount,
                        unitPriceINR: slice.unitPriceINR,
                      })}
                      : {slice.flights} × {inr.format(slice.unitPriceINR)} ={' '}
                      {inr.format(slice.amount)}
                    </li>
                  ))}
                  <li className="font-semibold text-slate-900">
                    Comprehensive total {inr.format(previewTotal)} before RON
                  </li>
                </ul>
              ) : null}
            </div>
          </fieldset>
        );
      })}

      <button
        type="button"
        className={contractUi.btnSecondary}
        onClick={() => onChange([...schedules, emptyBhsVolumeSchedule()])}
      >
        Add comprehensive schedule
      </button>
    </div>
  );
}
