'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BillingPageHeader } from '../BillingLayout';
import { billingUi } from '../billingUi';
import type { AeraTariffOrder, BillingApi } from '@/lib/billing-api';
import { formatBillingDate } from '@/lib/billing-shared/billing-date-format';

type Props = { api: BillingApi };

const CLASS_LABEL: Record<AeraTariffOrder['scheduled'][number]['flightClass'], string> = {
  DomesticPassenger: 'Domestic passenger flight',
  InternationalPassenger: 'International passenger flight',
  DomesticCargo: 'Domestic cargo flight',
  InternationalCargo: 'International cargo flight',
};

function inr(value: number | null | undefined): string {
  if (value == null) return 'N/A';
  return value.toLocaleString('en-IN');
}

function currentFinancialYear(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
}

export function AeraTariffPage({ api }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [orders, setOrders] = useState<AeraTariffOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [guideOpen, setGuideOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.listAeraTariffs();
      const rows = (res.data ?? []).filter((row) => row.active !== false);
      setOrders(rows);
      setSelectedId((current) => current || rows[0]?._id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load AERA tariff orders');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const order = useMemo(
    () => orders.find((row) => row._id === selectedId) ?? orders[0] ?? null,
    [orders, selectedId],
  );
  const fyNow = currentFinancialYear();

  const groupedScheduled = useMemo(() => {
    if (!order) return [];
    const groups = new Map<string, AeraTariffOrder['scheduled']>();
    for (const row of order.scheduled) {
      const list = groups.get(row.flightClass) ?? [];
      list.push(row);
      groups.set(row.flightClass, list);
    }
    return [...groups.entries()];
  }, [order]);

  return (
    <div>
      <BillingPageHeader
        title="AERA Tariff (ceiling rates)"
        actions={
          <>
            {orders.length > 1 ? (
              <select
                className={billingUi.select}
                value={order?._id ?? ''}
                onChange={(event) => setSelectedId(event.target.value)}
                aria-label="AERA order"
              >
                {orders.map((row) => (
                  <option key={row._id} value={row._id}>
                    {row.stationCode} · Order {row.orderNumber}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] text-sm font-semibold text-[color:var(--billing-heading)]"
              aria-expanded={guideOpen}
              aria-label="How this page works"
              onClick={() => setGuideOpen((open) => !open)}
            >
              i
            </button>
          </>
        }
      />

      {guideOpen ? (
        <section className={`${billingUi.card} mb-4 p-4 text-sm text-[color:var(--billing-text)]`}>
          <p className="font-semibold text-[color:var(--billing-heading)]">About this view</p>
          <p className="mt-2 text-[color:var(--billing-text-muted)]">
            AERA fixes the <strong>maximum</strong> ground-handling charge for this station per aircraft code
            (B–F), flight type and financial year. Negotiated rates in contracts may be lower, never higher.
            Rate cards and invoice lines above these figures are flagged. The royalty share you pay the airport
            owner is a separate thing and lives on Royalty Setup. MAG rates (minimum guarantee) are on Airport
            Setup.
          </p>
        </section>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {loading ? (
        <p className="text-sm text-[color:var(--billing-text-muted)]">Loading AERA tariff…</p>
      ) : !order ? (
        <section className={`${billingUi.card} p-5 text-sm text-[color:var(--billing-text-muted)]`}>
          No AERA tariff order is stored for this station. Stations that are not AERA-regulated (below 3.5
          million passengers a year) do not have one. For regulated stations, load the order with{' '}
          <code>node scripts/seed-aera-tariffs.mjs</code> or POST to <code>/billing/aera-tariff/import</code>.
        </section>
      ) : (
        <div className="space-y-4">
          <section className={`${billingUi.card} p-5 text-sm`}>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-[color:var(--billing-text-muted)]">Order</dt>
                <dd className="font-medium">
                  {order.orderNumber}
                  {order.orderDate ? ` · ${formatBillingDate(order.orderDate)}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-[color:var(--billing-text-muted)]">Ground handler (ISP)</dt>
                <dd className="font-medium">{order.isp || '—'}</dd>
              </div>
              <div>
                <dt className="text-[color:var(--billing-text-muted)]">Airport / operator</dt>
                <dd className="font-medium">
                  {order.airport || order.stationCode}
                  {order.airportOperator ? ` · ${order.airportOperator}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-[color:var(--billing-text-muted)]">Control period</dt>
                <dd className="font-medium">
                  {order.controlPeriodLabel ? `${order.controlPeriodLabel} · ` : ''}
                  {formatBillingDate(order.controlPeriodFrom)} – {formatBillingDate(order.controlPeriodTo)}
                </dd>
              </div>
              <div>
                <dt className="text-[color:var(--billing-text-muted)]">Card effective from</dt>
                <dd className="font-medium">{formatBillingDate(order.effectiveFrom)}</dd>
              </div>
              <div>
                <dt className="text-[color:var(--billing-text-muted)]">Source</dt>
                <dd className="font-medium">{order.sourceFile || '—'}</dd>
              </div>
            </dl>
            {order.verification ? (
              <p className="mt-3 text-xs text-[color:var(--billing-text-muted)]">{order.verification}</p>
            ) : null}
          </section>

          <section className={`${billingUi.card} p-5`}>
            <h2 className="text-base font-semibold text-[color:var(--billing-heading)]">
              Annexure I — Scheduled flights (maximum {order.currency} per flight)
            </h2>
            <p className="mt-1 text-xs text-[color:var(--billing-text-muted)]">
              Domestic scheduled rates also apply to domestic non-scheduled and general aviation. Cargo rates are
              printed under the {order.cargoRateColumn === 'full' ? 'Full' : 'Ramp'} column in this order.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left text-[color:var(--billing-text-muted)]">
                    <th rowSpan={2} className="py-1 pr-3 align-bottom">Code</th>
                    {order.financialYears.map((fy) => (
                      <th
                        key={fy}
                        colSpan={3}
                        className={`border-l border-[color:var(--billing-border)] px-2 py-1 text-center ${fy === fyNow ? 'text-[color:var(--billing-accent-strong)]' : ''}`}
                      >
                        FY {fy}
                        {fy === fyNow ? ' (current)' : ''}
                      </th>
                    ))}
                  </tr>
                  <tr className="text-right text-[color:var(--billing-text-muted)]">
                    {order.financialYears.map((fy) => (
                      <FyHeadCells key={fy} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groupedScheduled.map(([flightClass, rows]) => (
                    <GroupRows
                      key={flightClass}
                      label={CLASS_LABEL[flightClass as keyof typeof CLASS_LABEL] ?? flightClass}
                      rows={rows}
                      years={order.financialYears}
                      cargoColumn={order.cargoRateColumn}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {order.internationalNonScheduled.length > 0 ? (
            <section className={`${billingUi.card} p-5`}>
              <h2 className="text-base font-semibold text-[color:var(--billing-heading)]">
                Annexure II — International non-scheduled &amp; general aviation (by MTOW)
              </h2>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-left text-[color:var(--billing-text-muted)]">
                      <th className="py-1 pr-3">MTOW (kg)</th>
                      {order.financialYears.map((fy) => (
                        <th key={fy} className="px-2 py-1 text-right">
                          FY {fy}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {order.internationalNonScheduled.map((band) => (
                      <tr key={band.mtowFromKg} className="border-t border-[color:var(--billing-border)]">
                        <td className="py-1 pr-3">
                          {band.mtowToKg == null
                            ? `${band.mtowFromKg.toLocaleString('en-IN')} and above`
                            : `${band.mtowFromKg.toLocaleString('en-IN')} – ${band.mtowToKg.toLocaleString('en-IN')}`}
                        </td>
                        {band.rates.map((value, index) => (
                          <td key={index} className="px-2 py-1 text-right tabular-nums">
                            {inr(value)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className={`${billingUi.card} p-5 text-sm`}>
            <h2 className="text-base font-semibold text-[color:var(--billing-heading)]">
              Annexure III — Item-wise additional services
            </h2>
            {order.itemWise.length === 0 ? (
              <p className="mt-2 text-[color:var(--billing-text-muted)]">
                Not loaded yet for this order. The item-wise ceilings (GPU, ACU, pushback, wheelchair…) are still
                being verified from the PDF.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-left text-[color:var(--billing-text-muted)]">
                      <th className="py-1 pr-3">Item</th>
                      <th className="py-1 pr-3">Unit</th>
                      {order.financialYears.map((fy) => (
                        <th key={fy} colSpan={2} className="px-2 py-1 text-center">
                          FY {fy} (Dom / Intl)
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {order.itemWise.map((item) => (
                      <tr key={item.itemCode} className="border-t border-[color:var(--billing-border)]">
                        <td className="py-1 pr-3">{item.description || item.itemCode}</td>
                        <td className="py-1 pr-3">{item.uom}</td>
                        {order.financialYears.map((fy, index) => (
                          <FragmentCells
                            key={fy}
                            dom={item.domestic?.[index] ?? null}
                            intl={item.international?.[index] ?? null}
                          />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {order.rules.length > 0 || order.anomalies.length > 0 ? (
            <section className={`${billingUi.card} p-5 text-sm`}>
              {order.rules.length > 0 ? (
                <>
                  <h3 className="font-semibold text-[color:var(--billing-heading)]">Rules in the order</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[color:var(--billing-text-muted)]">
                    {order.rules.map((rule) => (
                      <li key={rule}>{rule}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {order.anomalies.length > 0 ? (
                <>
                  <h3 className="mt-4 font-semibold text-[color:var(--billing-heading)]">Notes on the printed order</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-800">
                    {order.anomalies.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function FyHeadCells() {
  return (
    <>
      <th className="border-l border-[color:var(--billing-border)] px-2 py-1">Pax</th>
      <th className="px-2 py-1">Ramp</th>
      <th className="px-2 py-1">Full</th>
    </>
  );
}

function FragmentCells({ dom, intl }: { dom: number | null; intl: number | null }) {
  return (
    <>
      <td className="px-2 py-1 text-right tabular-nums">{inr(dom)}</td>
      <td className="px-2 py-1 text-right tabular-nums">{inr(intl)}</td>
    </>
  );
}

function GroupRows({
  label,
  rows,
  years,
  cargoColumn,
}: {
  label: string;
  rows: AeraTariffOrder['scheduled'];
  years: string[];
  cargoColumn: 'ramp' | 'full';
}) {
  return (
    <>
      <tr className="border-t border-[color:var(--billing-border)] bg-[color:var(--billing-surface-muted)]">
        <td colSpan={1 + years.length * 3} className="py-1 pr-3 font-semibold text-[color:var(--billing-heading)]">
          {label}
        </td>
      </tr>
      {rows.map((row) => {
        const isCargo = row.flightClass === 'DomesticCargo' || row.flightClass === 'InternationalCargo';
        return (
          <tr key={`${row.flightClass}-${row.aircraftCode}`} className="border-t border-[color:var(--billing-border)]">
            <td className="py-1 pr-3 font-medium">Code {row.aircraftCode}</td>
            {years.map((fy, index) => {
              if (row.notApplicable) {
                return (
                  <FragmentTriple key={fy} pax="N/A" ramp="N/A" full="N/A" />
                );
              }
              if (isCargo) {
                const value = row.ramp?.[index] ?? row.full?.[index] ?? null;
                return (
                  <FragmentTriple
                    key={fy}
                    pax="—"
                    ramp={cargoColumn === 'ramp' ? inr(value) : '—'}
                    full={cargoColumn === 'full' ? inr(value) : '—'}
                  />
                );
              }
              return (
                <FragmentTriple
                  key={fy}
                  pax={inr(row.pax?.[index])}
                  ramp={inr(row.ramp?.[index])}
                  full={inr(row.full?.[index])}
                />
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

function FragmentTriple({ pax, ramp, full }: { pax: string; ramp: string; full: string }) {
  return (
    <>
      <td className="border-l border-[color:var(--billing-border)] px-2 py-1 text-right tabular-nums">{pax}</td>
      <td className="px-2 py-1 text-right tabular-nums">{ramp}</td>
      <td className="px-2 py-1 text-right tabular-nums font-medium">{full}</td>
    </>
  );
}
