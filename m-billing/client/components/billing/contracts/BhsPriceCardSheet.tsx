'use client';

import { useEffect, useMemo, useState } from 'react';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import type { BillingContract, BillingPriceCardAirline } from '@/lib/billing-shared/types';
import {
  listBhsPriceCardSheetRows,
  type BhsPriceCardSheetRow,
} from './exportBhsPriceCardExcel';

const COLUMNS = [
  'Station',
  'Airline code',
  'Airline name',
  'Aircraft type',
  'Aircraft body',
  'Flight category',
  'Price type',
  'Currency',
  'Comprehensive price',
  'Price valid from',
  'Price valid to',
] as const;

type Props = {
  entries: BillingPriceCardAirline[];
  contracts: BillingContract[];
  onEdit: (entry: BillingPriceCardAirline) => void;
  onDelete: (entry: BillingPriceCardAirline) => void;
  onViewServices: (entry: BillingPriceCardAirline) => void;
};

function rowKey(row: BhsPriceCardSheetRow): string {
  return [
    row.entryId,
    row.aircraftType,
    row.category,
    row.currency,
    row.price ?? '',
    row.validFrom,
    row.validTo,
  ].join('|');
}

function formatPrice(price: number | null, currency: string): string {
  if (price == null) return '';
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

export function BhsPriceCardSheet({
  entries,
  contracts,
  onEdit,
  onDelete,
  onViewServices,
}: Props) {
  const [rows, setRows] = useState<BhsPriceCardSheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [airlineNameFilter, setAirlineNameFilter] = useState('');
  const [aircraftTypeFilter, setAircraftTypeFilter] = useState('');
  const [priceTypeFilter, setPriceTypeFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listBhsPriceCardSheetRows(entries, contracts, { onlyActive: false })
      .then((next) => {
        if (!cancelled) setRows(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contracts, entries]);

  useEffect(() => {
    if (selectedKey && !rows.some((row) => rowKey(row) === selectedKey)) {
      setSelectedKey(null);
    }
  }, [rows, selectedKey]);

  const entriesById = useMemo(() => {
    const map = new Map<string, BillingPriceCardAirline>();
    for (const entry of entries) map.set(entry._id, entry);
    return map;
  }, [entries]);

  const airlineNameOptions = useMemo(
    () => [...new Set(rows.map((row) => row.airlineName).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const aircraftTypeOptions = useMemo(() => {
    const scoped = airlineNameFilter
      ? rows.filter((row) => row.airlineName === airlineNameFilter)
      : rows;
    return [...new Set(scoped.map((row) => row.aircraftType).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    );
  }, [airlineNameFilter, rows]);
  const priceTypeOptions = useMemo(
    () => [...new Set(rows.map((row) => row.priceType).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const currencyOptions = useMemo(
    () => [...new Set(rows.map((row) => row.currency).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const visibleRows = useMemo(
    () =>
      rows.filter((row) => {
        if (airlineNameFilter && row.airlineName !== airlineNameFilter) return false;
        if (aircraftTypeFilter && row.aircraftType !== aircraftTypeFilter) return false;
        if (priceTypeFilter && row.priceType !== priceTypeFilter) return false;
        if (currencyFilter && row.currency !== currencyFilter) return false;
        return true;
      }),
    [aircraftTypeFilter, airlineNameFilter, currencyFilter, priceTypeFilter, rows],
  );

  const filtersActive = Boolean(
    airlineNameFilter || aircraftTypeFilter || priceTypeFilter || currencyFilter,
  );

  const selected = visibleRows.find((row) => rowKey(row) === selectedKey) ?? null;
  const selectedEntry = selected ? entriesById.get(selected.entryId) ?? null : null;
  const airlineBands = useMemo(() => {
    const bands: number[] = [];
    let band = 0;
    visibleRows.forEach((row, index) => {
      if (index === 0 || row.airlineCode !== visibleRows[index - 1]?.airlineCode) band += 1;
      bands.push(band);
    });
    return bands;
  }, [visibleRows]);

  const clearSheetFilters = () => {
    setAirlineNameFilter('');
    setAircraftTypeFilter('');
    setPriceTypeFilter('');
    setCurrencyFilter('');
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
        Loading price cards…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center">
        <p className="text-sm font-medium text-gray-800">No BHS prices match your filters</p>
        <p className="mt-1 text-xs text-gray-500">Try a different airline, aircraft type, or search term.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-gray-600">
          Airline name
          <select
            value={airlineNameFilter}
            onChange={(event) => {
              const value = event.target.value;
              setAirlineNameFilter(value);
              if (
                value &&
                aircraftTypeFilter &&
                !rows.some(
                  (row) => row.airlineName === value && row.aircraftType === aircraftTypeFilter,
                )
              ) {
                setAircraftTypeFilter('');
              }
            }}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">All airlines</option>
            {airlineNameOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-gray-600">
          Aircraft type
          <select
            value={aircraftTypeFilter}
            onChange={(event) => setAircraftTypeFilter(event.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">All aircraft</option>
            {aircraftTypeOptions.map((aircraftType) => (
              <option key={aircraftType} value={aircraftType}>
                {aircraftType}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[9rem] flex-col gap-1 text-xs font-medium text-gray-600">
          Price type
          <select
            value={priceTypeFilter}
            onChange={(event) => setPriceTypeFilter(event.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">All price types</option>
            {priceTypeOptions.map((priceType) => (
              <option key={priceType} value={priceType}>
                {priceType}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[8rem] flex-col gap-1 text-xs font-medium text-gray-600">
          Currency
          <select
            value={currencyFilter}
            onChange={(event) => setCurrencyFilter(event.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">All currencies</option>
            {currencyOptions.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </label>
        {filtersActive ? (
          <button
            type="button"
            onClick={clearSheetFilters}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!selectedEntry}
          onClick={() => selectedEntry && onEdit(selectedEntry)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-[color:var(--billing-primary)] hover:bg-[color:var(--billing-accent-soft)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pencil className="h-4 w-4" aria-hidden />
          Edit
        </button>
        <button
          type="button"
          disabled={!selectedEntry}
          onClick={() => selectedEntry && onDelete(selectedEntry)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          Delete
        </button>
        <button
          type="button"
          disabled={!selectedEntry}
          onClick={() => selectedEntry && onViewServices(selectedEntry)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--billing-primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Eye className="h-4 w-4" aria-hidden />
          View services
        </button>
        <p className="text-xs text-gray-500">
          {selected
            ? `${selected.airlineCode} · ${selected.aircraftType} · ${selected.category}`
            : 'Select a price row, then edit, delete, or view its services.'}
        </p>
      </div>

      {visibleRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-gray-800">No prices match these filters</p>
          <button
            type="button"
            onClick={clearSheetFilters}
            className="mt-3 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Clear filters
          </button>
        </div>
      ) : (
      <>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-[#1C0770] text-white">
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column}
                  className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => {
              const key = rowKey(row);
              const selectedRow = key === selectedKey;
              const shaded = (airlineBands[index] ?? 1) % 2 === 0;
              return (
                <tr
                  key={key}
                  onClick={() => setSelectedKey(selectedRow ? null : key)}
                  aria-selected={selectedRow}
                  className={
                    selectedRow
                      ? 'cursor-pointer bg-[color:var(--billing-accent-soft)]'
                      : shaded
                        ? 'cursor-pointer bg-[#EEF2FF] hover:bg-[#E4E9FF]'
                        : 'cursor-pointer bg-[#F7F8FC] hover:bg-[#EEF2FF]'
                  }
                >
                  <td className="whitespace-nowrap px-3 py-2 text-gray-800">{row.station}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-[color:var(--billing-accent-strong)]">
                    {row.airlineCode}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-900">{row.airlineName}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">{row.aircraftType}</td>
                  <td className="px-3 py-2 text-center text-xs font-bold text-[#1C0770]">{row.aircraftBody}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-700">{row.category}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {row.priceType ? (
                      <span
                        className={
                          row.priceType === 'Exclusive'
                            ? 'font-semibold text-amber-800'
                            : row.priceType === 'Mixed'
                              ? 'font-semibold text-slate-700'
                              : 'font-semibold text-emerald-800'
                        }
                      >
                        {row.priceType}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-700">{row.currency}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-[#1C0770]">
                    {formatPrice(row.price, row.currency)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-700">{row.validFrom}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-700">{row.validTo}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        {visibleRows.length} price{visibleRows.length === 1 ? '' : 's'}
        {filtersActive ? ` of ${rows.length}` : ''}
      </p>
      </>
      )}
    </div>
  );
}
