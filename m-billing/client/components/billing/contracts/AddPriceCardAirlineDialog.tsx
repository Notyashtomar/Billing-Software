'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { BillingApi } from '@/lib/billing-api';
import { fetchGatewayAircraftOptions } from '@/lib/advance-aircraft-options';
import type {
  BillingContract,
  BillingCustomer,
  BillingPriceCardAirline,
} from '@/lib/billing-shared/types';
import {
  PRICE_CARD_AIRLINE_CATEGORIES,
  formatPriceCardAirlineCategory,
  type PriceCardHandlingType,
} from '@/lib/billing-shared/enums';
import {
  buildAddAirlineRows,
  buildBhsAddAirlineRows,
  filterNewAirlineRows,
  type AddPriceCardAirlineRow,
} from '@/lib/billing-shared/price-card-airline-rows';
import {
  SearchableCombobox,
  type SearchableComboOption,
} from '@/components/ui/SearchableCombobox';
import { ContractSystemDate } from './ContractControls';
import { billingUi } from '../billingUi';

type Props = {
  api: BillingApi;
  handling: PriceCardHandlingType;
  customers: BillingCustomer[];
  contracts: BillingContract[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  /** Pre-select customer when adding from an airline group (customer locked). */
  prefillCustomerCode?: string | null;
  /** Pre-select customer and rows when editing an existing BHS airline card. */
  prefillRows?: AddPriceCardAirlineRow[] | null;
  /** Existing price-card rows for this handling — excluded from generated add rows. */
  existingEntries?: BillingPriceCardAirline[];
};

function emptyRow(airlineName = ''): AddPriceCardAirlineRow {
  return {
    key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    airlineName,
    validFrom: '',
    validTo: '',
    remarks: '',
    aircraftType: '',
    category: 'Int',
    price: '',
    flightOperation: 'scheduled',
  };
}

function rowsForCustomer(
  customer: BillingCustomer,
  contracts: BillingContract[],
  handling: PriceCardHandlingType,
): AddPriceCardAirlineRow[] {
  if (handling === 'BHS') {
    const bhsRows = buildBhsAddAirlineRows(customer, contracts);
    if (bhsRows.some((row) => row.aircraftType.trim())) return bhsRows;
    return [emptyRow(customer.name)];
  }
  const fromAircraft = buildAddAirlineRows(customer, contracts).filter((row) =>
    row.aircraftType.trim(),
  );
  if (fromAircraft.length > 0) return fromAircraft;
  return [emptyRow(customer.name)];
}

export function AddPriceCardAirlineDialog({
  api,
  handling,
  customers: customersProp,
  contracts: contractsProp,
  open,
  onOpenChange,
  onSaved,
  onError,
  onSuccess,
  prefillCustomerCode = null,
  prefillRows = null,
  existingEntries = [],
}: Props) {
  const [customerId, setCustomerId] = useState('');
  const [rows, setRows] = useState<AddPriceCardAirlineRow[]>([]);
  const [originalEntryIds, setOriginalEntryIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [customers, setCustomers] = useState<BillingCustomer[]>(customersProp);
  const [contracts, setContracts] = useState<BillingContract[]>(contractsProp);
  const [aircraftOptions, setAircraftOptions] = useState<SearchableComboOption[]>([]);
  const [loadingAircraft, setLoadingAircraft] = useState(false);

  useEffect(() => {
    setCustomers(customersProp);
  }, [customersProp]);

  useEffect(() => {
    setContracts(contractsProp);
  }, [contractsProp]);

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      const [customerRes, contractRes] = await Promise.all([
        api.listCustomers({ limit: 5000, active: 'all' }),
        api.listContracts(),
      ]);
      setCustomers((customerRes.data as BillingCustomer[]) ?? []);
      const contractData = contractRes.data as { items?: BillingContract[] };
      setContracts(contractData.items ?? []);
    } catch {
      if (customersProp.length > 0) setCustomers(customersProp);
      if (contractsProp.length > 0) setContracts(contractsProp);
    } finally {
      setLoadingOptions(false);
    }
  }, [api, contractsProp, customersProp]);

  const loadAircraftOptions = useCallback(async () => {
    setLoadingAircraft(true);
    try {
      setAircraftOptions(await fetchGatewayAircraftOptions());
    } catch {
      setAircraftOptions([]);
    } finally {
      setLoadingAircraft(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (customersProp.length === 0 || contractsProp.length === 0) {
      void loadOptions();
    }
    void loadAircraftOptions();
  }, [contractsProp.length, customersProp.length, loadAircraftOptions, loadOptions, open]);

  const customerOptions = useMemo(
    () => [...customers].sort((a, b) => a.name.localeCompare(b.name)),
    [customers],
  );

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer._id === customerId),
    [customerId, customers],
  );

  const isEditMode = Boolean(prefillCustomerCode && prefillRows && prefillRows.length > 0);
  const lockCustomerSelect = isEditMode || Boolean(prefillCustomerCode);

  const existingForCustomer = useMemo(() => {
    if (!selectedCustomer) return [];
    const code = selectedCustomer.customerCode.trim().toUpperCase();
    return existingEntries.filter(
      (entry) => entry.customerCode.trim().toUpperCase() === code,
    );
  }, [existingEntries, selectedCustomer]);

  useEffect(() => {
    if (!open) {
      setCustomerId('');
      setRows([]);
      setOriginalEntryIds([]);
      return;
    }

    if (isEditMode && prefillCustomerCode && prefillRows) {
      const customer = customers.find(
        (row) => row.customerCode.trim().toUpperCase() === prefillCustomerCode.trim().toUpperCase(),
      );
      if (customer) setCustomerId(customer._id);
      setRows(prefillRows);
      setOriginalEntryIds(
        prefillRows.map((row) => row.entryId).filter((id): id is string => Boolean(id)),
      );
      return;
    }

    if (prefillCustomerCode && !customerId) {
      const customer = customers.find(
        (row) => row.customerCode.trim().toUpperCase() === prefillCustomerCode.trim().toUpperCase(),
      );
      if (customer) {
        setCustomerId(customer._id);
        return;
      }
    }

    if (!selectedCustomer) {
      setRows([]);
      return;
    }

    const generated = rowsForCustomer(selectedCustomer, contracts, handling);
    const newRows = filterNewAirlineRows(generated, existingForCustomer);
    setRows(newRows.length > 0 ? newRows : [emptyRow(selectedCustomer.name)]);
  }, [
    contracts,
    customerId,
    existingForCustomer,
    handling,
    isEditMode,
    open,
    prefillCustomerCode,
    prefillRows,
    selectedCustomer,
    customers,
  ]);

  const close = () => {
    if (!saving) onOpenChange(false);
  };

  const updateRow = (key: string, patch: Partial<AddPriceCardAirlineRow>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    setRows((prev) => [...prev, emptyRow(selectedCustomer?.name ?? '')]);
  };

  const removeRow = (key: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.key !== key)));
  };

  const submit = async () => {
    if (!selectedCustomer) {
      onError('Select an airline first.');
      return;
    }

    const invalid = rows.find((row) => {
      if (
        !row.airlineName.trim() ||
        !row.validFrom ||
        !row.validTo ||
        !row.aircraftType.trim() ||
        !row.category
      ) {
        return true;
      }
      if (isBhs) {
        const price = parsePrice(row.price);
        if (price == null || price < 0) return true;
      }
      return false;
    });
    if (invalid) {
      onError(
        isBhs
          ? 'Fill airline name, validity dates, aircraft type, category, and price on every row.'
          : 'Fill airline name, validity dates, aircraft type, and category on every row.',
      );
      return;
    }

    setSaving(true);
    try {
      if (isEditMode) {
        const keptIds = new Set(
          rows.map((row) => row.entryId).filter((id): id is string => Boolean(id)),
        );
        const toDelete = originalEntryIds.filter((id) => !keptIds.has(id));
        for (const id of toDelete) {
          await api.deletePriceCardAirline(id);
        }

        const toCreate: Record<string, unknown>[] = [];
        for (const row of rows) {
          const payload: Record<string, unknown> = {
            airlineName: row.airlineName.trim(),
            validFrom: row.validFrom,
            validTo: row.validTo,
            remarks: row.remarks.trim() || undefined,
            aircraftType: row.aircraftType.trim().toUpperCase(),
            category: row.category,
          };
          if (isBhs) {
            payload.price = parsePrice(row.price);
            payload.flightOperation = row.flightOperation === 'additional' ? 'additional' : 'scheduled';
          }
          if (row.entryId) {
            await api.updatePriceCardAirline(row.entryId, payload);
          } else {
            toCreate.push({
              customerCode: selectedCustomer.customerCode,
              ...payload,
            });
          }
        }

        if (toCreate.length > 0) {
          await api.createPriceCardAirlinesBulk({
            handlingType: handling,
            rows: toCreate,
          });
        }

        onSuccess(`${selectedCustomer.customerCode} updated in ${handling}.`);
      } else {
        await api.createPriceCardAirlinesBulk({
          handlingType: handling,
          rows: rows.map((row) => {
            const payload: Record<string, unknown> = {
              customerCode: selectedCustomer.customerCode,
              airlineName: row.airlineName.trim(),
              validFrom: row.validFrom,
              validTo: row.validTo,
              remarks: row.remarks.trim() || undefined,
              aircraftType: row.aircraftType.trim().toUpperCase(),
              category: row.category,
            };
            if (isBhs) {
              payload.price = parsePrice(row.price);
              payload.flightOperation =
                row.flightOperation === 'additional' ? 'additional' : 'scheduled';
            }
            return payload;
          }),
        });
        onSuccess(`${selectedCustomer.customerCode} added to ${handling}.`);
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      onError(
        e instanceof Error
          ? e.message
          : isEditMode
            ? 'Failed to update airline'
            : 'Failed to add airline',
      );
    } finally {
      setSaving(false);
    }
  };

  const customerPlaceholder = loadingOptions
    ? 'Loading airlines…'
    : customerOptions.length === 0
      ? 'No billing customers found'
      : 'Select airline…';

  const isBhs = handling === 'BHS';
  const priceCurrency = selectedCustomer?.currencyCode ?? 'INR';
  const tableColSpan = isBhs ? 9 : 7;

  const parsePrice = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : null;
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-2 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-price-card-airline-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="border-b border-gray-100 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <h2 id="add-price-card-airline-title" className="text-base font-semibold text-gray-900">
                {isEditMode ? `Edit airline — ${handling}` : `Add airline to ${handling}`}
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                {isBhs
                  ? 'One row per aircraft × flight category (Domestic or International). Enter the fixed BHS package price on each row — service lists are added separately per row.'
                  : 'Select a billing customer — one row is created per aircraft type from schedule and contract data. You can edit every field before saving.'}
              </p>
            </div>
            <label className="flex w-full shrink-0 flex-col gap-1 text-xs font-medium text-gray-600 sm:max-w-xs lg:ml-auto lg:w-72">
              <span>Billing customer</span>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                disabled={
                  saving || loadingOptions || customerOptions.length === 0 || lockCustomerSelect
                }
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">{customerPlaceholder}</option>
                {customerOptions.map((customer) => (
                  <option key={customer._id} value={customer._id}>
                    {customer.customerCode} — {customer.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4 sm:px-5">
          {customerOptions.length === 0 && !loadingOptions ? (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              No billing customers yet.{' '}
              <Link href="/billing/customers" className="font-medium underline">
                Add a customer
              </Link>{' '}
              first, then return here.
            </div>
          ) : null}

          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-500">
              {selectedCustomer
                ? `${rows.length} row${rows.length === 1 ? '' : 's'}${
                    rows.some((row) => row.aircraftType)
                      ? ' from aircraft types'
                      : ' — enter aircraft type manually'
                  }`
                : 'Select a billing customer to load rows'}
            </p>
            <button
              type="button"
              onClick={addRow}
              disabled={saving || !selectedCustomer}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add row
            </button>
          </div>

          <div className="min-h-[16rem] max-h-[22rem] flex-1 overflow-auto rounded-xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Airline name
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Valid from
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Valid to
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Remarks
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Aircraft type
                  </th>
                  {isBhs ? (
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      BHS package D/E ({priceCurrency})
                    </th>
                  ) : null}
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Category
                  </th>
                  {isBhs ? (
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Flight
                    </th>
                  ) : null}
                  <th className="w-10 px-2 py-2.5" aria-label="Remove row" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {selectedCustomer && rows.length > 0 ? (
                  rows.map((row) => (
                    <tr key={row.key} className="align-top">
                      <td className="px-3 py-2.5">
                        <input
                          type="text"
                          value={row.airlineName}
                          onChange={(e) => updateRow(row.key, { airlineName: e.target.value })}
                          disabled={saving}
                          className={billingUi.input}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <ContractSystemDate
                          value={row.validFrom}
                          onChange={(v) => updateRow(row.key, { validFrom: v })}
                          disabled={saving}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <ContractSystemDate
                          value={row.validTo}
                          onChange={(v) => updateRow(row.key, { validTo: v })}
                          disabled={saving}
                          minDate={
                            row.validFrom ? new Date(`${row.validFrom}T00:00:00`) : undefined
                          }
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="text"
                          value={row.remarks}
                          onChange={(e) => updateRow(row.key, { remarks: e.target.value })}
                          disabled={saving}
                          placeholder="Optional"
                          className="w-full min-w-[7rem] rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <SearchableCombobox
                          fieldLabel="Aircraft type"
                          hideLabel
                          hideOptionDescription
                          value={row.aircraftType}
                          onChange={(next) => updateRow(row.key, { aircraftType: next.toUpperCase() })}
                          onPickOption={(option) =>
                            updateRow(row.key, { aircraftType: option.label.toUpperCase() })
                          }
                          options={aircraftOptions}
                          loading={loadingAircraft}
                          placeholder="Search aircraft…"
                          onRequestOptions={() => void loadAircraftOptions()}
                          maxVisibleOptions={1000}
                          listPanelClassName="absolute left-0 right-0 top-full z-[200] mt-1 max-h-[11.5rem] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                          className="min-w-[7rem]"
                        />
                      </td>
                      {isBhs ? (
                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={row.price}
                            onChange={(e) => updateRow(row.key, { price: e.target.value })}
                            disabled={saving}
                            placeholder="0.00"
                            className="w-full min-w-[6rem] rounded-md border border-gray-300 px-2 py-1.5 text-sm tabular-nums"
                          />
                        </td>
                      ) : null}
                      <td className="px-3 py-2.5">
                        <select
                          value={row.category}
                          onChange={(e) =>
                            updateRow(row.key, {
                              category: e.target.value as AddPriceCardAirlineRow['category'],
                            })
                          }
                          disabled={saving}
                          className="w-full min-w-[7rem] rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                        >
                          {PRICE_CARD_AIRLINE_CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                              {formatPriceCardAirlineCategory(category)}
                            </option>
                          ))}
                          {row.category === 'Ta' ? (
                            <option value="Ta">{formatPriceCardAirlineCategory('Ta')}</option>
                          ) : null}
                        </select>
                      </td>
                      {isBhs ? (
                        <td className="px-3 py-2.5">
                          <select
                            value={row.flightOperation === 'additional' ? 'additional' : 'scheduled'}
                            onChange={(e) =>
                              updateRow(row.key, {
                                flightOperation:
                                  e.target.value === 'additional' ? 'additional' : 'scheduled',
                              })
                            }
                            disabled={saving}
                            aria-label="Flight operation"
                            className="w-full min-w-[8rem] rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                          >
                            <option value="scheduled">Scheduled</option>
                            <option value="additional">Additional</option>
                          </select>
                        </td>
                      ) : null}
                      <td className="px-2 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => removeRow(row.key)}
                          disabled={saving || rows.length <= 1}
                          className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={tableColSpan} className="px-4 py-16 text-center text-sm text-gray-500">
                      {customerOptions.length > 0
                        ? 'Select a billing customer in the top-right dropdown to load aircraft-type rows.'
                        : 'Create a billing customer to continue.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-4 py-4 sm:px-5">
          <button
            type="button"
            onClick={close}
            disabled={saving}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !selectedCustomer || rows.length === 0}
            className="rounded-lg bg-[color:var(--billing-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEditMode ? 'Save changes' : 'Save airline rows'}
          </button>
        </div>
      </div>
    </div>
  );
}
