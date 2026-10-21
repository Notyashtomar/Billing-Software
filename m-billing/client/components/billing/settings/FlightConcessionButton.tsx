'use client';

import { useEffect, useState } from 'react';
import type { BillingApi } from '@/lib/billing-api';
import type { AirportCommercial } from './AirportRulesWizard';

type ConcessionKind = 'scheduledInternational' | 'scheduledDomestic' | 'generalAviation';

const KINDS: { key: ConcessionKind; label: string }[] = [
  { key: 'scheduledInternational', label: 'Scheduled international' },
  { key: 'scheduledDomestic', label: 'Scheduled domestic' },
  { key: 'generalAviation', label: 'General aviation' },
];

type Fee = { percent?: number };
type Side = {
  scheduledInternational?: Fee;
  scheduledDomestic?: Fee;
  generalAviation?: Fee;
};
type RoyaltyMaster = { net?: Side; gross?: Side };

type Customer = { customerCode?: string; customerName?: string; airlineName?: string };

function percentOf(side: Side | undefined, key: ConcessionKind): number | null {
  const n = Number(side?.[key]?.percent);
  return Number.isFinite(n) ? n : null;
}

export function FlightConcessionButton({ api }: { api: BillingApi }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [commercial, setCommercial] = useState<AirportCommercial | null>(null);
  const [master, setMaster] = useState<RoyaltyMaster>({});
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [airline, setAirline] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void Promise.all([
      api.getSettings(),
      api.listCustomers({ limit: 5000, active: 'all' }),
    ])
      .then(([settingsRes, customerRes]) => {
        if (cancelled) return;
        const data = (
          settingsRes as {
            data?: { airportCommercial?: AirportCommercial; royaltyMaster?: RoyaltyMaster };
          }
        ).data;
        setCommercial(data?.airportCommercial ?? null);
        setMaster(data?.royaltyMaster ?? {});
        const rows = ((customerRes as { data?: Customer[] }).data ?? []).filter(
          (row) => String(row.customerCode ?? '').trim(),
        );
        setCustomers(rows);
        setAirline((current) => current || String(rows[0]?.customerCode ?? ''));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load concessions');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, api]);

  const ownership = commercial?.ownership;
  const mechanism = commercial?.revenueShareMechanism;
  const invoiceSide: 'net' | 'gross' | null =
    ownership === 'private' && (mechanism === 'net' || mechanism === 'gross')
      ? mechanism
      : master.gross
        ? 'gross'
        : master.net
          ? 'net'
          : null;
  const side = invoiceSide === 'net' ? master.net : invoiceSide === 'gross' ? master.gross : undefined;
  const airlineName =
    customers.find((row) => row.customerCode === airline)?.customerName ||
    customers.find((row) => row.customerCode === airline)?.airlineName ||
    airline;

  return (
    <>
      <button
        type="button"
        className="min-h-10 rounded-lg border border-[color:var(--billing-border)] bg-white px-3 text-sm font-semibold text-[color:var(--billing-heading)]"
        onClick={() => setOpen(true)}
      >
        Flight concessions
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-labelledby="flight-concession-title"
            className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"
          >
            <h2 id="flight-concession-title" className="text-base font-semibold text-gray-900">
              Flight concessions
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              These are the station fees from Royalty Setup. An invoice uses the fee that matches
              the flight. Domestic and international flights are raised as separate invoices.
            </p>
            {loading ? <p className="mt-4 text-sm text-gray-500">Loading…</p> : null}
            {error ? (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}
            {!loading && !error ? (
              <div className="mt-4 space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  Airline
                  <select
                    value={airline}
                    onChange={(event) => setAirline(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm"
                  >
                    {customers.length === 0 ? <option value="">No airlines</option> : null}
                    {customers.map((row) => (
                      <option key={row.customerCode} value={row.customerCode}>
                        {row.customerCode}
                        {row.customerName || row.airlineName
                          ? ` — ${row.customerName || row.airlineName}`
                          : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-gray-500">
                  {airlineName
                    ? `${airlineName} uses the station fees below.`
                    : 'These station fees apply to every airline at this station.'}{' '}
                  {invoiceSide === 'gross'
                    ? 'Invoices use Royalty on Gross.'
                    : invoiceSide === 'net'
                      ? 'Invoices use Royalty on Net.'
                      : 'No royalty side is saved yet.'}
                </p>
                <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {KINDS.map((kind) => {
                    const value = percentOf(side, kind.key);
                    return (
                      <div key={kind.key} className="flex items-center justify-between px-3 py-2 text-sm">
                        <dt className="text-gray-600">{kind.label}</dt>
                        <dd className="font-semibold text-gray-900">
                          {value == null ? 'Not set' : `${value}%`}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ) : null}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="min-h-10 rounded-lg bg-[color:var(--billing-primary)] px-3 text-sm font-semibold text-white"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
