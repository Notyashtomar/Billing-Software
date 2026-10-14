'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BillingPageHeader } from '../BillingLayout';
import { MasterSectionTabs } from '../MasterSectionTabs';
import { BillingDataTable } from '../BillingDataTable';
import { StatusBadge } from '../StatusBadge';
import { TableEditButton } from '../TableEditButton';
import { ConcessionAddDialog } from './ConcessionAddDialog';
import { ConcessionEditDialog } from './ConcessionEditDialog';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingContract } from '@/lib/billing-shared/types';
import {
  clearAllConcessionsPatchBody,
  contractHasAnyConcessionData,
  formatConcessionRateCell,
} from '@/lib/billing-shared/contract-concessions';
import { formatBillingDateRange } from '@/lib/billing-shared/billing-date-format';
import {
  EXCLUSIVE_BHS_INVOICE_CONCESSION_PERCENT,
  contractHasSavedCeilingRate,
  exclusiveBhsContractsMissingCeiling,
  isExclusiveBhsConcessionContract,
  isInclusiveBhsConcessionContract,
} from '@/lib/billing-shared/exclusive-bhs-concession';
import { fetchLoginStationOptions } from '@/lib/admin-stations-api';
import {
  formatAdminStationLabel,
  resolveAdminStationCode,
} from '@/lib/org-structure-options';
import type { StationRecord } from '@/lib/stationAnalyticsMock';
import { billingUi } from '../billingUi';

/** ~one compact table row (py-2 + text-sm line); alert list shows 5 body rows then scrolls. */
const MISSING_CEILING_ALERT_ROW_REM = 2.25;
const MISSING_CEILING_ALERT_MAX_BODY_ROWS = 5;

function formatCeilingRates(contract: BillingContract): string {
  const parts: string[] = [];
  if (contract.ceilingRatePerFlightINR != null && contract.ceilingRatePerFlightINR > 0) {
    parts.push(`₹${contract.ceilingRatePerFlightINR}`);
  }
  if (contract.ceilingRatePerFlightUSD != null && contract.ceilingRatePerFlightUSD > 0) {
    parts.push(`$${contract.ceilingRatePerFlightUSD}`);
  }
  return parts.length > 0 ? parts.join(' · ') : '—';
}

type Props = { api: BillingApi };

export function ConcessionsPage({ api }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setupId = searchParams.get('setup');
  const [rows, setRows] = useState<BillingContract[]>([]);
  const [setupExclusive, setSetupExclusive] = useState(false);
  const [stations, setStations] = useState<StationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [stationsLoading, setStationsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [stationFilter, setStationFilter] = useState('');
  const [search, setSearch] = useState('');
  const [editContract, setEditContract] = useState<BillingContract | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [clearingId, setClearingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.listContracts();
      const data = res.data as { items?: BillingContract[] };
      setRows(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load contracts');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    setStationsLoading(true);
    void fetchLoginStationOptions()
      .then((items) => {
        if (!cancelled) setStations(items);
      })
      .catch(() => {
        if (!cancelled) setStations([]);
      })
      .finally(() => {
        if (!cancelled) setStationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stationOptions = useMemo(() => {
    const byCode = new Map<string, string>();

    for (const row of rows) {
      const code = row.stationCode?.trim().toUpperCase();
      if (!code || byCode.has(code)) continue;
      const station = stations.find((item) => resolveAdminStationCode(item) === code);
      byCode.set(code, station ? formatAdminStationLabel(station) : code);
    }

    return [...byCode.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([code, label]) => ({ code, label }));
  }, [stations, rows]);

  const exclusiveRows = useMemo(
    () => rows.filter((row) => isExclusiveBhsConcessionContract(row) && !isInclusiveBhsConcessionContract(row)),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return exclusiveRows.filter((row) => {
      if (stationFilter && row.stationCode !== stationFilter) return false;
      if (!query) return true;
      return (
        row.contractNumber.toLowerCase().includes(query) ||
        row.customerCode.toLowerCase().includes(query) ||
        row.stationCode.toLowerCase().includes(query)
      );
    });
  }, [exclusiveRows, search, stationFilter]);

  useEffect(() => {
    if (!setupId || loading) return;
    const match = exclusiveRows.find((row) => row._id === setupId);
    if (!match) return;
    setEditContract(match);
    setSetupExclusive(true);
    setEditOpen(true);
    router.replace('/billing/concessions');
  }, [setupId, loading, exclusiveRows, router]);

  const missingCeilingAlerts = useMemo(() => {
    const scoped = stationFilter
      ? rows.filter((row) => row.stationCode === stationFilter)
      : rows;
    return exclusiveBhsContractsMissingCeiling(scoped).sort((a, b) =>
      `${a.stationCode} ${a.customerCode}`.localeCompare(`${b.stationCode} ${b.customerCode}`),
    );
  }, [rows, stationFilter]);

  const openEdit = (contract: BillingContract) => {
    setSetupExclusive(false);
    setEditContract(contract);
    setEditOpen(true);
  };

  const mergeSavedContract = (updated?: BillingContract) => {
    if (!updated?._id) return;
    setRows((prev) => prev.map((row) => (row._id === updated._id ? { ...row, ...updated } : row)));
  };

  const clearConcessions = async (contract: BillingContract) => {
    if (clearingId) return;
    const label = `${contract.customerCode} · ${contract.contractNumber} (${contract.stationCode})`;
    const confirmed = window.confirm(
      `Remove all concession percents and ceiling rates for ${label}? Invoices will not add concession until you save new values.`,
    );
    if (!confirmed) return;
    setClearingId(contract._id);
    setError('');
    try {
      const res = await api.updateContract(contract._id, clearAllConcessionsPatchBody());
      const updated = (res as { data?: BillingContract }).data;
      mergeSavedContract(updated);
      setSuccess('Concessions removed.');
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove concessions');
    } finally {
      setClearingId(null);
    }
  };

  const missingCeilingScrollMaxHeight = `${
    MISSING_CEILING_ALERT_ROW_REM * (MISSING_CEILING_ALERT_MAX_BODY_ROWS + 1)
  }rem`;

  return (
    <div className="concessions-workspace w-full max-w-full pb-8">
      <MasterSectionTabs group="rates" />
      <div className="mb-3 shrink-0">
        <BillingPageHeader
          title="Concessions"
          description={`Scenario concession rates by contract. For Exclusive BHS airlines, invoice concession is the higher of ${EXCLUSIVE_BHS_INVOICE_CONCESSION_PERCENT}% of scheduled-flight total or the ceiling rate × flight count — save the ceiling here.`}
          actions={
            <button
              type="button"
              className={billingUi.btnPrimary}
              onClick={() => setAddOpen(true)}
              disabled={loading || exclusiveRows.length === 0}
            >
              Add concession
            </button>
          }
        />
      </div>

      {missingCeilingAlerts.length > 0 ? (
        <details
          className="group mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          <summary
            className="cursor-pointer list-none font-semibold text-amber-950 marker:content-none [&::-webkit-details-marker]:hidden"
          >
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Ceiling rate required for Exclusive BHS pricing</span>
              <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-xs font-semibold text-amber-950">
                {missingCeilingAlerts.length}
              </span>
              <span className="text-xs font-normal text-amber-800 group-open:hidden">
                (expand)
              </span>
            </span>
          </summary>
          <div className="mt-2" role="alert">
          <p className="text-amber-900">
            Save a ceiling rate per flight (INR or USD) so invoices can compare it with{' '}
            {EXCLUSIVE_BHS_INVOICE_CONCESSION_PERCENT}% of flight charges.
          </p>
          <p className="mt-1 text-xs font-medium text-amber-800">
            Scroll the list to open any row.
          </p>
          <div
            className="mt-2 overflow-y-auto overscroll-y-contain rounded-md border border-amber-200/90 bg-white/70 [-webkit-overflow-scrolling:touch]"
            style={{ maxHeight: missingCeilingScrollMaxHeight }}
          >
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-amber-200 bg-amber-100/95 backdrop-blur-sm">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold text-amber-950">Station</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-amber-950">Customer</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-amber-950">Contract</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold text-amber-950">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {missingCeilingAlerts.map((contract) => (
                  <tr
                    key={contract._id}
                    className="border-b border-amber-100/80 last:border-b-0"
                    style={{ height: `${MISSING_CEILING_ALERT_ROW_REM}rem` }}
                  >
                    <td className="px-3 py-2 align-middle">{contract.stationCode}</td>
                    <td className="px-3 py-2 align-middle font-medium">{contract.customerCode}</td>
                    <td className="px-3 py-2 align-middle text-amber-900">{contract.contractNumber}</td>
                    <td className="px-3 py-2 text-right align-middle">
                      <button
                        type="button"
                        onClick={() => openEdit(contract)}
                        className="font-medium text-[color:var(--billing-primary)] underline-offset-2 hover:underline"
                      >
                        Set ceiling
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        </details>
      ) : null}

      {error ? (
        <div className="mb-4 shrink-0 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mb-4 shrink-0 rounded-lg border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] px-4 py-3 text-sm text-[color:var(--billing-heading)]">
          {success}
        </div>
      ) : null}

      <div className="mb-3 shrink-0">
        <h2 className={billingUi.sectionTitle}>Contracts by station</h2>
        <p className={billingUi.sectionDesc}>
          Exclusive contracts only. Inclusive pricing does not show a concession row.
        </p>
      </div>

      <div className={`${billingUi.filterBar} mb-4 shrink-0`}>
        <label className={billingUi.filterField}>
          Station
          <select
            value={stationFilter}
            onChange={(e) => setStationFilter(e.target.value)}
            disabled={stationsLoading && stationOptions.length === 0}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">This station</option>
            {stationOptions.map(({ code, label }) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={billingUi.filterField}>
          Search
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Contract, customer, station…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <p className="text-sm text-gray-600 sm:pb-2">
          Showing{' '}
          <span className="font-semibold text-[color:var(--billing-accent-strong)]">{filteredRows.length}</span> of{' '}
          {exclusiveRows.length} exclusive contract{exclusiveRows.length === 1 ? '' : 's'}
        </p>
      </div>

      <BillingDataTable
          loading={loading}
          rows={filteredRows}
          getRowKey={(r) => r._id}
          emptyMessage="No exclusive contracts. Inclusive pricing stays off this list."
          footer={`${filteredRows.length} exclusive contract${filteredRows.length === 1 ? '' : 's'}${
            filteredRows.length !== exclusiveRows.length ? ` of ${exclusiveRows.length}` : ''
          }`}
          columns={[
          { key: 'station', header: 'Station', render: (r) => r.stationCode },
          { key: 'no', header: 'Contract #', render: (r) => r.contractNumber },
          { key: 'customer', header: 'Customer', render: (r) => r.customerCode },
          {
            key: 'bhs',
            header: 'Royalty Type',
            render: (r) =>
              isExclusiveBhsConcessionContract(r) ? (
                <span
                  className={
                    contractHasSavedCeilingRate(r)
                      ? 'text-xs font-medium text-amber-900'
                      : 'text-xs font-semibold text-red-700'
                  }
                  title={
                    contractHasSavedCeilingRate(r)
                      ? 'Exclusive — ceiling saved'
                      : 'Exclusive — save ceiling rate'
                  }
                >
                  Exclusive
                  {!contractHasSavedCeilingRate(r) ? ' · ceiling missing' : ''}
                </span>
              ) : (
                <span className="text-xs text-gray-500">—</span>
              ),
          },
          {
            key: 'valid',
            header: 'Price Validity',
            render: (r) =>
              formatBillingDateRange(r.priceValidFrom, r.priceValidTo),
          },
          {
            key: 'int',
            header: 'INTL%',
            render: (r) => formatConcessionRateCell(r, 'int'),
          },
          {
            key: 'dom',
            header: 'Dom %',
            render: (r) => formatConcessionRateCell(r, 'dom'),
          },
          {
            key: 'divInt',
            header: 'Div Int %',
            render: (r) => formatConcessionRateCell(r, 'divertedInt'),
          },
          {
            key: 'divDom',
            header: 'Div Dom %',
            render: (r) => formatConcessionRateCell(r, 'divertedDom'),
          },
          {
            key: 'ceiling',
            header: 'MAG per Flight',
            render: (r) => {
              const label = formatCeilingRates(r);
              return label === '—' ? (
                <span className="text-[color:var(--billing-text-muted)]">—</span>
              ) : (
                <span className="font-semibold text-[color:var(--billing-heading)]">{label}</span>
              );
            },
          },
          {
            key: 'status',
            header: 'Status',
            render: (r) => <StatusBadge status={r.status} />,
          },
          {
            key: 'actions',
            header: '',
            render: (r) => (
              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                <TableEditButton onClick={() => openEdit(r)} label="Edit concessions" />
                <button
                  type="button"
                  onClick={() => void clearConcessions(r)}
                  disabled={
                    clearingId === r._id || !contractHasAnyConcessionData(r)
                  }
                  className={`${billingUi.link} text-[color:var(--billing-danger)] hover:text-[color:var(--billing-danger-hover)] disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {clearingId === r._id ? 'Removing…' : 'Remove'}
                </button>
              </div>
            ),
          },
        ]}
      />

      <ConcessionEditDialog
        api={api}
        contract={editContract}
        open={editOpen}
        setupExclusive={setupExclusive}
        onOpenChange={(open) => {
          if (!open) {
            setEditContract(null);
            setSetupExclusive(false);
          }
          setEditOpen(open);
        }}
        onSaved={(updated) => {
          setSuccess('Concessions saved.');
          mergeSavedContract(updated);
          void load();
        }}
      />

      <ConcessionAddDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        contracts={exclusiveRows}
        onPick={(contract) => openEdit(contract)}
      />
    </div>
  );
}
