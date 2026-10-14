'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldGroup, TextInput } from '../settings/SettingsFormFields';
import { ContractSystemDate } from './ContractControls';
import {
  SearchableCombobox,
  type SearchableComboOption,
} from '@/components/ui/SearchableCombobox';
import type { BillingApi } from '@/lib/billing-api';
import { fetchGatewayAircraftOptions } from '@/lib/advance-aircraft-options';
import type { BillingCustomer, BillingPriceCardAirline } from '@/lib/billing-shared/types';
import {
  PRICE_CARD_AIRLINE_CATEGORIES,
  formatPriceCardAirlineCategory,
} from '@/lib/billing-shared/enums';

type Props = {
  api: BillingApi;
  entry: BillingPriceCardAirline | null;
  customers: BillingCustomer[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

function parsePrice(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function EditPriceCardAirlineDialog({
  api,
  entry,
  customers,
  open,
  onOpenChange,
  onSaved,
  onError,
  onSuccess,
}: Props) {
  const [airlineName, setAirlineName] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [aircraftType, setAircraftType] = useState('');
  const [category, setCategory] = useState<BillingPriceCardAirline['category']>('Int');
  const [flightOperation, setFlightOperation] = useState<'scheduled' | 'additional'>('scheduled');
  const [incrementalOn, setIncrementalOn] = useState(false);
  const [incrementalPrice, setIncrementalPrice] = useState('');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [aircraftOptions, setAircraftOptions] = useState<SearchableComboOption[]>([]);
  const [loadingAircraft, setLoadingAircraft] = useState(false);

  const isBhs = entry?.handlingType === 'BHS';

  const customer = useMemo(
    () => customers.find((c) => c.customerCode === entry?.customerCode),
    [customers, entry?.customerCode],
  );
  const priceCurrency = customer?.currencyCode ?? 'INR';

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
    if (!open || !entry) return;
    setError('');
    setAirlineName(entry.airlineName);
    setValidFrom(entry.validFrom.slice(0, 10));
    setValidTo(entry.validTo.slice(0, 10));
    setRemarks(entry.remarks ?? '');
    setAircraftType(entry.aircraftType);
    setCategory(entry.category);
    setFlightOperation(entry.flightOperation === 'additional' ? 'additional' : 'scheduled');
    setPrice(entry.price != null ? String(entry.price) : '');
    setIncrementalOn(entry.incrementalFlightsActive === true);
    setIncrementalPrice(entry.incrementalPrice != null ? String(entry.incrementalPrice) : '');
    void loadAircraftOptions();
  }, [entry, loadAircraftOptions, open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entry) return;

    if (!airlineName.trim() || !validFrom || !validTo || !aircraftType.trim() || !category) {
      setError('Fill airline name, validity dates, aircraft type, and category.');
      return;
    }
    if (isBhs) {
      const parsed = parsePrice(price);
      if (parsed == null || parsed < 0) {
        setError('Enter a valid price for this BHS entry.');
        return;
      }
    }

    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        airlineName: airlineName.trim(),
        validFrom,
        validTo,
        remarks: remarks.trim() || undefined,
        aircraftType: aircraftType.trim().toUpperCase(),
        category,
      };
      if (isBhs) {
        body.price = parsePrice(price);
        body.flightOperation = flightOperation;
        body.incrementalFlightsActive = incrementalOn;
        if (incrementalOn) {
          const incremental = parsePrice(incrementalPrice);
          if (incremental == null || incremental <= 0) {
            setError('Enter an incremental price greater than zero, or turn incremental flights off.');
            setSaving(false);
            return;
          }
          body.incrementalPrice = incremental;
        }
      }
      await api.updatePriceCardAirline(entry._id, body);
      onSuccess(`Updated ${entry.customerCode} · ${aircraftType.trim().toUpperCase()}.`);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update airline entry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto !border-[color:var(--billing-border-strong)] !bg-[#ffffff] !text-[color:var(--billing-text)]">
        <DialogHeader>
          <DialogTitle>Edit airline entry</DialogTitle>
          <DialogDescription>
            {entry
              ? `${entry.handlingType} · ${entry.customerCode} — update aircraft type and other fields for this row.`
              : 'Update airline entry details.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void submit(e)} className="grid gap-4">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label="Customer code" htmlFor="editCustomerCode">
              <p
                id="editCustomerCode"
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-900"
              >
                {entry?.customerCode ?? '—'}
              </p>
            </FieldGroup>
            <FieldGroup label="Handling type" htmlFor="editHandlingType">
              <p
                id="editHandlingType"
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-900"
              >
                {entry?.handlingType ?? '—'}
              </p>
            </FieldGroup>
          </div>

          <FieldGroup label="Airline name" htmlFor="editAirlineName">
            <TextInput
              id="editAirlineName"
              value={airlineName}
              onChange={setAirlineName}
              required
            />
          </FieldGroup>

          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label="Valid from" htmlFor="editValidFrom">
              <ContractSystemDate
                id="editValidFrom"
                value={validFrom}
                onChange={setValidFrom}
              />
            </FieldGroup>
            <FieldGroup label="Valid to" htmlFor="editValidTo">
              <ContractSystemDate
                id="editValidTo"
                value={validTo}
                onChange={setValidTo}
                minDate={validFrom ? new Date(`${validFrom}T00:00:00`) : undefined}
              />
            </FieldGroup>
          </div>

          <FieldGroup label="Remarks" htmlFor="editRemarks">
            <TextInput
              id="editRemarks"
              value={remarks}
              onChange={setRemarks}
              placeholder="Optional"
            />
          </FieldGroup>

          <SearchableCombobox
            fieldLabel="Aircraft type"
            value={aircraftType}
            onChange={(next) => setAircraftType(next.toUpperCase())}
            onPickOption={(option) => setAircraftType(option.label.toUpperCase())}
            options={aircraftOptions}
            loading={loadingAircraft}
            placeholder="Search aircraft…"
            onRequestOptions={() => void loadAircraftOptions()}
            maxVisibleOptions={1000}
            listPanelClassName="absolute left-0 right-0 top-full z-[200] mt-1 max-h-[11.5rem] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          />

          {isBhs ? (
            <FieldGroup label={`Price (${priceCurrency})`} htmlFor="editPrice">
              <TextInput
                id="editPrice"
                type="number"
                value={price}
                onChange={setPrice}
                placeholder="0.00"
                required
              />
            </FieldGroup>
          ) : null}

          <FieldGroup label="Category" htmlFor="editCategory">
            <select
              id="editCategory"
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as BillingPriceCardAirline['category'])
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {PRICE_CARD_AIRLINE_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {formatPriceCardAirlineCategory(value)}
                </option>
              ))}
              {category === 'Ta' ? (
                <option value="Ta">{formatPriceCardAirlineCategory('Ta')}</option>
              ) : null}
            </select>
          </FieldGroup>

          {isBhs ? (
            <FieldGroup label="Flight" htmlFor="editFlightOperation" hint="Scheduled is the default. Additional uses this BHS package for additional flights of this aircraft.">
              <select
                id="editFlightOperation"
                value={flightOperation}
                onChange={(e) =>
                  setFlightOperation(e.target.value === 'additional' ? 'additional' : 'scheduled')
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="scheduled">Scheduled</option>
                <option value="additional">Additional</option>
              </select>
            </FieldGroup>
          ) : null}

          {isBhs ? (
            <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3">
              <label className="flex items-start gap-2 text-sm text-gray-900">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={incrementalOn}
                  onChange={(e) => setIncrementalOn(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Incremental flights</span>
                  <span className="mt-0.5 block text-xs text-gray-600">
                    Turn on when a later flight of this airline and aircraft on the same day should use a different rate. The first flight that day keeps the package price. Regenerate invoice applies it.
                  </span>
                </span>
              </label>
              {incrementalOn ? (
                <div className="mt-3">
                  <FieldGroup
                    label="Incremental price"
                    htmlFor="editIncrementalPrice"
                    hint="Charged on the second and later flights of this aircraft on the same calendar day."
                  >
                    <TextInput
                      id="editIncrementalPrice"
                      type="number"
                      value={incrementalPrice}
                      onChange={setIncrementalPrice}
                      placeholder="0.00"
                      required
                    />
                  </FieldGroup>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !entry}
              className="rounded-lg bg-[#1C0770] px-4 py-2 text-sm font-medium text-white hover:bg-[#150558] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
