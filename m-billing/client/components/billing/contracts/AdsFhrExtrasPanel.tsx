'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingPriceCardAirline, BillingRateCard } from '@/lib/billing-shared/types';
import {
  buildAdsDualCountServiceRows,
  calendarYmd,
} from '@/lib/billing-shared/price-card-handling';
import { formatPriceCardAirlineCategory } from '@/lib/billing-shared/enums';
import { resolveAdsPackageFreeAllowance } from '@/lib/billing-shared/rate-card-billing-scope';

type Props = {
  api: BillingApi;
  entry: BillingPriceCardAirline;
  allRateCards: BillingRateCard[];
  serviceCategoryByCode: Map<string, string>;
};

type ExtraRow = {
  particular: string;
  flights: number;
  usedTotal: number;
  freePerFlight: number;
  chargeableEstimate: number;
  aircraftType: string;
};

function particularFromRow(row: Record<string, unknown>): string {
  const candidates = [
    row.adsParticular,
    row.equipment,
    row.particular,
    row.serviceCode,
    row.serviceDescription,
  ];
  for (const c of candidates) {
    const s = String(c ?? '').trim();
    if (s) return s;
  }
  return 'Unknown equipment';
}

function usedFromRow(row: Record<string, unknown>): number {
  const raw = Number(
    row.adsUsedUnits ?? row.chargeableUnits ?? row.qty ?? row.quantity ?? 1,
  );
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.round(raw);
}

function aircraftFromRow(row: Record<string, unknown>): string {
  return String(
    row.aircraftType ?? row.TypeCraft ?? row.aircraft ?? row.ACType ?? '',
  )
    .trim()
    .toUpperCase();
}

export function AdsFhrExtrasPanel({
  api,
  entry,
  allRateCards,
  serviceCategoryByCode,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [extras, setExtras] = useState<ExtraRow[]>([]);

  const dualRows = useMemo(
    () => buildAdsDualCountServiceRows(allRateCards, entry, serviceCategoryByCode),
    [allRateCards, entry, serviceCategoryByCode],
  );

  const freeByService = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of dualRows) {
      const packageFree = resolveAdsPackageFreeAllowance({
        hasInclusiveCard: Boolean(row.inclusive),
        inclusiveServiceCount: row.inclusive?.serviceCount,
        exclusiveServiceCount: row.exclusive?.serviceCount,
        uom: row.exclusive?.uom ?? row.inclusive?.uom,
        alwaysChargeable: Boolean(
          row.exclusive?.alwaysChargeable || row.inclusive?.alwaysChargeable,
        ),
      });
      map.set(row.serviceCode.trim().toLowerCase(), packageFree.freeAllowance);
    }
    return map;
  }, [dualRows]);

  useEffect(() => {
    let cancelled = false;
    const from = calendarYmd(entry.validFrom);
    const to = calendarYmd(entry.validTo);
    const aircraft = entry.aircraftType.trim().toUpperCase();

    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await api.listAds({
          from,
          to,
          customerCode: entry.customerCode,
        });
        const items = ((res as { data?: { rows?: Array<{ operationalData?: Record<string, unknown> }> } })
          .data?.rows ?? []) as Array<{ operationalData?: Record<string, unknown> }>;

        const buckets = new Map<string, ExtraRow>();
        for (const sourceRow of items) {
          const row = (sourceRow.operationalData ?? {}) as Record<string, unknown>;
          const ac = aircraftFromRow(row);
          if (aircraft && ac && ac !== aircraft) continue;

          const particular = particularFromRow(row);
          const used = usedFromRow(row);
          const key = particular.toLowerCase();
          const freeLookup =
            freeByService.get(key) ??
            [...freeByService.entries()].find(([code]) => key.includes(code) || code.includes(key))?.[1] ??
            0;
          const freePerFlight =
            freeLookup >= Number.MAX_SAFE_INTEGER / 2 ? Number.MAX_SAFE_INTEGER : freeLookup;
          const charged = Math.max(
            0,
            used - (freePerFlight >= Number.MAX_SAFE_INTEGER / 2 ? used : freePerFlight),
          );

          const existing = buckets.get(key);
          if (existing) {
            existing.flights += 1;
            existing.usedTotal += used;
            existing.chargeableEstimate += charged;
          } else {
            buckets.set(key, {
              particular,
              flights: 1,
              usedTotal: used,
              freePerFlight:
                freePerFlight >= Number.MAX_SAFE_INTEGER / 2 ? -1 : freePerFlight,
              chargeableEstimate: charged,
              aircraftType: ac || aircraft,
            });
          }
        }

        // Only show equipment with chargeable extras or unknown free (needs config).
        const rows = [...buckets.values()]
          .filter((r) => r.chargeableEstimate > 0 || r.freePerFlight < 0 || r.freePerFlight === 0)
          .sort((a, b) => b.chargeableEstimate - a.chargeableEstimate || b.usedTotal - a.usedTotal);

        if (!cancelled) setExtras(rows);
      } catch (e) {
        if (!cancelled) {
          setExtras([]);
          setError(e instanceof Error ? e.message : 'Failed to load FHR ADS usage');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, entry, freeByService]);

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-[color:var(--billing-border)] bg-[#e0f2fe] px-4 py-3">
        <p className="text-sm font-semibold text-gray-900">
          FHR extra equipment — {entry.customerCode} · {entry.aircraftType} ·{' '}
          {formatPriceCardAirlineCategory(entry.category)}
        </p>
        <p className="mt-0.5 text-xs text-gray-600">
          Usage from FHR for this airline / aircraft in the rate-card validity window. Chargeable
          estimate = per-flight used minus free allowance from contract / rate cards.
        </p>
      </div>

      {error ? (
        <div className="px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="px-4 py-8 text-center text-sm text-gray-500">Loading FHR equipment…</div>
      ) : extras.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gray-500">
          No chargeable extra equipment found in FHR for this scope. Set free / flight on services
          above, or widen the validity dates.
        </div>
      ) : (
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-4 py-3">Equipment</th>
              <th className="px-4 py-3">Flights</th>
              <th className="px-4 py-3">Used (total)</th>
              <th className="px-4 py-3">Free / flight</th>
              <th className="px-4 py-3">Chargeable (est.)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {extras.map((row) => (
              <tr key={row.particular} className="hover:bg-gray-50/80">
                <td className="px-4 py-3 font-medium text-gray-900">{row.particular}</td>
                <td className="px-4 py-3 tabular-nums text-gray-700">{row.flights}</td>
                <td className="px-4 py-3 tabular-nums text-gray-700">{row.usedTotal}</td>
                <td className="px-4 py-3 tabular-nums text-gray-700">
                  {row.freePerFlight < 0 ? 'Package' : row.freePerFlight}
                </td>
                <td className="px-4 py-3 tabular-nums font-medium text-amber-900">
                  {row.chargeableEstimate}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
