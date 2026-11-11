'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingPriceCardAirline } from '@/lib/billing-shared/types';
import type { BillingSourceRow } from '@/lib/billing-shared/billing-sources';
import { resolveDefaultBillingPeriod } from '@/lib/billing-default-period';
import { stripCancelledFlightPrefix } from '@/lib/billing-shared/preparation-flight-display';
import {
  findFlightsMissingRateCardAircraft,
  type MissingRateCardAircraftGap,
} from '@/lib/billing-shared/missing-rate-card-aircraft';

const STORAGE_KEY = 'billing.rate-card-aircraft-gaps.v1';
const UPDATE_EVENT = 'billing-rate-card-aircraft-gaps';

export type StoredRateCardAircraftGap = {
  stationCode: string;
  handlingType: string;
  customerCode: string;
  month: string;
  periodFrom: string;
  periodTo: string;
  airlineName: string;
  gaps: MissingRateCardAircraftGap[];
  checkedAt: string;
};

type StoreShape = { items: StoredRateCardAircraftGap[] };

function readStore(): StoredRateCardAircraftGap[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '') as StoreShape;
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

function writeAirlineGaps(next: StoredRateCardAircraftGap) {
  if (typeof window === 'undefined') return;
  const items = readStore().filter(
    (item) =>
      !(
        item.stationCode === next.stationCode &&
        item.handlingType === next.handlingType &&
        item.customerCode === next.customerCode &&
        item.month === next.month
      ),
  );
  items.unshift(next);
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ items: items.slice(0, 40) }),
  );
  window.dispatchEvent(new Event(UPDATE_EVENT));
}

export function readStoredRateCardAircraftGaps(filter: {
  stationCode: string;
  handlingType: string;
  month: string;
}): StoredRateCardAircraftGap[] {
  const station = filter.stationCode.trim().toUpperCase();
  const handling = filter.handlingType.trim().toUpperCase();
  return readStore().filter(
    (item) =>
      item.stationCode === station &&
      item.handlingType === handling &&
      item.month === filter.month &&
      item.gaps.length > 0,
  );
}

export function useStoredRateCardAircraftGaps(
  stationCode: string | null | undefined,
  handlingType: string | null | undefined,
) {
  const period = useMemo(
    () => resolveDefaultBillingPeriod(stationCode),
    [stationCode],
  );
  const month = period.from.slice(0, 7);
  const [items, setItems] = useState<StoredRateCardAircraftGap[]>([]);

  useEffect(() => {
    if (!stationCode || !handlingType) {
      setItems([]);
      return;
    }
    const load = () =>
      setItems(
        readStoredRateCardAircraftGaps({
          stationCode,
          handlingType,
          month,
        }),
      );
    load();
    window.addEventListener(UPDATE_EVENT, load);
    return () => window.removeEventListener(UPDATE_EVENT, load);
  }, [handlingType, month, stationCode]);

  return { items, period, month };
}

function monthLabel(from: string): string {
  const [year, month] = from.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return from;
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function flightFromSource(row: BillingSourceRow) {
  const data = row.operationalData ?? {};
  const cancelled = data.cancelled === true || data.isCancelled === true;
  const rawFlight =
    row.sourceRef?.flightNo ??
    data.flightNoEquipmentNo ??
    data.flightNo ??
    '';
  const aircraft = String(data.aircraftType ?? data.TypeCraft ?? '').trim();
  return {
    cancelled,
    flightNo: stripCancelledFlightPrefix(rawFlight),
    aircraftType: aircraft,
    airlineName: String(data.airlineName ?? data.customerName ?? ''),
  };
}

type NoticeProps = {
  api: BillingApi;
  stationCode: string | null | undefined;
  handlingType: string;
  customerCode: string;
  airlineName: string;
  rateCardRows: BillingPriceCardAirline[];
};

export function MissingRateCardAircraftNotice({
  api,
  stationCode,
  handlingType,
  customerCode,
  airlineName,
  rateCardRows,
}: NoticeProps) {
  const period = useMemo(
    () => resolveDefaultBillingPeriod(stationCode),
    [stationCode],
  );
  const [flights, setFlights] = useState<ReturnType<typeof flightFromSource>[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setFlights(null);
    void api
      .listScheduledFlights({
        from: period.from,
        to: period.to,
        customerCode,
      })
      .then((res) => {
        if (cancelled) return;
        const rows = res.data?.rows;
        if (!Array.isArray(rows)) {
          setFailed(true);
          return;
        }
        setFlights(rows.map(flightFromSource));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, customerCode, period.from, period.to]);

  const gaps = useMemo(() => {
    if (!flights) return [];
    return findFlightsMissingRateCardAircraft({
      airlineName,
      customerCode,
      periodFrom: period.from,
      periodTo: period.to,
      rateCardRows,
      flights,
    });
  }, [airlineName, customerCode, flights, period.from, period.to, rateCardRows]);

  useEffect(() => {
    if (!stationCode || flights == null) return;
    writeAirlineGaps({
      stationCode: stationCode.trim().toUpperCase(),
      handlingType: handlingType.trim().toUpperCase(),
      customerCode: customerCode.trim().toUpperCase(),
      month: period.from.slice(0, 7),
      periodFrom: period.from,
      periodTo: period.to,
      airlineName,
      gaps,
      checkedAt: new Date().toISOString(),
    });
  }, [
    airlineName,
    customerCode,
    flights,
    gaps,
    handlingType,
    period.from,
    period.to,
    stationCode,
  ]);

  const label = monthLabel(period.from);

  if (loading) {
    return (
      <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Checking {label} flights for aircraft that are not on this rate card…
      </p>
    );
  }

  if (failed) {
    return (
      <p className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        {label} flights could not be checked just now. Open this airline again to retry. The rate card is unchanged.
      </p>
    );
  }

  if (gaps.length === 0) return null;

  const flightCount = gaps.reduce((sum, gap) => sum + gap.flightCount, 0);

  return (
    <section
      className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 text-amber-950 shadow-sm"
      aria-label="Aircraft missing from this rate card"
    >
      <h3 className="text-sm font-semibold">
        {gaps.length} aircraft on {label} flights {gaps.length === 1 ? 'is' : 'are'} not on this rate card
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-amber-900">
        {airlineName} ({customerCode}) flew these aircraft in {label}
        {flightCount > 0 ? ` across ${flightCount} flight${flightCount === 1 ? '' : 's'}` : ''}.
        Add a rate card for each aircraft yourself when it should be billed.
      </p>
      <div className="mt-3 overflow-x-auto rounded-lg border border-amber-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-amber-100/80 text-xs uppercase tracking-wide text-amber-950">
            <tr>
              <th className="px-3 py-2 font-semibold">Airline</th>
              <th className="px-3 py-2 font-semibold">Flight number</th>
              <th className="px-3 py-2 font-semibold">Aircraft type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-100 text-gray-900">
            {gaps.map((gap) => (
              <tr key={gap.aircraftType}>
                <td className="px-3 py-2 align-top">
                  <span className="font-medium">{gap.airlineName || airlineName}</span>
                  <span className="mt-0.5 block text-xs text-gray-500">{gap.customerCode}</span>
                </td>
                <td className="px-3 py-2 align-top">
                  {gap.flightNumbers.length > 0 ? gap.flightNumbers.join(', ') : '—'}
                  {gap.flightCount > gap.flightNumbers.length ? (
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {gap.flightCount} flights in {label}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 align-top font-medium">{gap.aircraftType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type ReminderProps = {
  stationCode: string | null | undefined;
  handlingType: string;
  /** Controlled open state; omit to let the component manage it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** "button" renders only the ⓘ trigger, "panel" only the notice, default both stacked. */
  part?: 'button' | 'panel';
  className?: string;
};

export function MissingRateCardAircraftReminder({
  stationCode,
  handlingType,
  open: openProp,
  onOpenChange,
  part,
  className = '',
}: ReminderProps) {
  const { items, period } = useStoredRateCardAircraftGaps(stationCode, handlingType);
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  if (items.length === 0) return null;
  const label = monthLabel(period.from);
  const panelId = `rate-card-gaps-${handlingType.trim().toLowerCase()}`;

  const trigger = (
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        title={open ? 'Hide aircraft not on a rate card' : 'Show aircraft not on a rate card'}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--billing-warning)] ${
          open
            ? 'border-[color:var(--billing-warning-border)] bg-[color:var(--billing-warning-soft)] text-[color:var(--billing-warning)]'
            : 'border-[color:var(--billing-border-strong)] bg-[color:var(--billing-surface)] text-[color:var(--billing-text-secondary)] hover:border-[color:var(--billing-warning-border)] hover:bg-[color:var(--billing-warning-soft)] hover:text-[color:var(--billing-warning)]'
        }`}
      >
        <span
          aria-hidden
          className="flex h-5 w-5 items-center justify-center rounded-full border border-current font-serif text-[11px] font-bold italic leading-none"
        >
          i
        </span>
        <span>
          {items.length} airline{items.length === 1 ? '' : 's'} with aircraft not on a rate card
        </span>
        <span
          aria-hidden
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          ▾
        </span>
      </button>
  );

  const panel = (
      <div
        id={panelId}
        className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out ${
          open ? 'mb-4 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
        aria-hidden={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <section
            className={`rounded-xl border border-[color:var(--billing-warning-border)] bg-[color:var(--billing-warning-soft)] px-4 py-3 text-sm text-[color:var(--billing-text)] transition-transform duration-300 ease-out ${
              open ? 'translate-y-0' : '-translate-y-2'
            }`}
            aria-label="Airlines with aircraft missing from the rate card"
          >
            <p className="font-semibold text-[color:var(--billing-warning)]">
              Aircraft from {label} flights are not on a rate card
            </p>
            <ul className="mt-2 space-y-1 text-xs leading-relaxed text-[color:var(--billing-text-secondary)]">
              {items.map((item) => (
                <li key={item.customerCode}>
                  <span className="font-semibold text-[color:var(--billing-text)]">{item.airlineName}</span>{' '}
                  ({item.customerCode}):{' '}
                  {item.gaps
                    .map(
                      (gap) =>
                        `${gap.aircraftType}${
                          gap.flightNumbers.length > 0 ? ` (${gap.flightNumbers.slice(0, 4).join(', ')}${gap.flightNumbers.length > 4 ? '…' : ''})` : ''
                        }`,
                    )
                    .join('; ')}
                  . Open the airline to review the flights, then add the aircraft manually.
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
  );

  if (part === 'button') return <div className={className}>{trigger}</div>;
  if (part === 'panel') return <div className={className}>{panel}</div>;
  return (
    <div className={className}>
      <div className="mb-3">{trigger}</div>
      {panel}
    </div>
  );
}
