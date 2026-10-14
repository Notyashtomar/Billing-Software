'use client';

import { useCallback, useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  SearchableCombobox,
  type SearchableComboOption,
} from '@/components/ui/SearchableCombobox';

type Props = {
  /** Aircraft types suggested from scheduled flights & advance schedule for this airline/period. */
  options: string[];
  /** Full Advance → Aircraft master catalog. */
  advanceCatalog: string[];
  loadingAdvanceCatalog?: boolean;
  onReloadAdvanceCatalog?: () => void;
  selected: string[];
  onChange: (next: string[]) => void;
  loading?: boolean;
  disabled?: boolean;
  customerCode?: string;
  validFrom?: string;
  validTo?: string;
};

function normalizeTypes(values: Iterable<string>): string[] {
  return [...new Set([...values].map((v) => v.trim().toUpperCase()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function ContractAircraftTypePicker({
  options,
  advanceCatalog,
  loadingAdvanceCatalog = false,
  onReloadAdvanceCatalog,
  selected,
  onChange,
  loading = false,
  disabled = false,
  customerCode,
  validFrom,
  validTo,
}: Props) {
  const [manualDraft, setManualDraft] = useState('');

  const selectedSet = useMemo(
    () => new Set(selected.map((v) => v.trim().toUpperCase()).filter(Boolean)),
    [selected],
  );
  const contextualSet = useMemo(
    () => new Set(options.map((v) => v.trim().toUpperCase()).filter(Boolean)),
    [options],
  );

  const combinedOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of selected) {
      if (item?.trim()) set.add(item.trim().toUpperCase());
    }
    for (const item of options) {
      if (item?.trim()) set.add(item.trim().toUpperCase());
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [options, selected]);

  const advanceComboOptions = useMemo((): SearchableComboOption[] => {
    return advanceCatalog.map((aircraft) => ({
      id: aircraft,
      label: aircraft,
      searchIndex: aircraft,
    }));
  }, [advanceCatalog]);

  const canLoad = Boolean(customerCode?.trim() && validFrom && validTo && validFrom <= validTo);

  const toggle = (aircraftType: string, checked: boolean) => {
    const key = aircraftType.trim().toUpperCase();
    const next = new Set(selected.map((v) => v.trim().toUpperCase()).filter(Boolean));
    if (checked) next.add(key);
    else next.delete(key);
    onChange(normalizeTypes(next));
  };

  const selectAllContextual = () => {
    onChange(normalizeTypes([...selected, ...options]));
  };

  const populateAllAdvanceAircraft = () => {
    onChange(normalizeTypes([...selected, ...advanceCatalog]));
  };

  const clearAll = () => onChange([]);

  const addManualType = useCallback(
    (raw: string) => {
      const token = raw.trim().toUpperCase();
      if (!token) return;
      onChange(normalizeTypes([...selected, token]));
      setManualDraft('');
    },
    [onChange, selected],
  );

  if (!canLoad) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-600">
        Select customer and price validity dates to load aircraft types from scheduled flights and
        advance schedule data.
      </p>
    );
  }

  if (loading) {
    return (
      <p className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500">
        Loading aircraft types from schedule data…
      </p>
    );
  }

  const allContextualSelected =
    combinedOptions.length > 0 &&
    combinedOptions.every((option) => selectedSet.has(option.trim().toUpperCase()));

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/80 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-gray-600">
            {combinedOptions.length} aircraft type{combinedOptions.length === 1 ? '' : 's'} assigned &amp; suggested
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled || combinedOptions.length === 0}
              onClick={selectAllContextual}
              className="text-xs font-medium text-[color:var(--billing-accent-strong)] hover:underline disabled:opacity-50"
            >
              Select all
            </button>
            <button
              type="button"
              disabled={disabled || selected.length === 0}
              onClick={clearAll}
              className="text-xs font-medium text-gray-600 hover:underline disabled:opacity-50"
            >
              Clear all
            </button>
          </div>
        </div>

        {combinedOptions.length === 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            No aircraft types found for this airline in the selected validity period. Use Advance
            Aircraft or add types manually below.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {combinedOptions.map((aircraftType) => {
              const checked = selectedSet.has(aircraftType.trim().toUpperCase());
              return (
                <button
                  key={aircraftType}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(aircraftType, !checked)}
                  className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm select-none ${
                    checked
                      ? 'border-[color:var(--billing-accent-border)] bg-white text-gray-900 font-semibold'
                      : 'border-[color:var(--billing-border)] bg-[#ffffff] text-[color:var(--billing-text-secondary)]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    disabled={disabled}
                    className="pointer-events-none h-4 w-4 rounded border-gray-300 text-[color:var(--billing-accent)] cursor-pointer"
                  />
                  <span className="min-w-0 truncate">{aircraftType}</span>
                </button>
              );
            })}
          </div>
        )}

        {!allContextualSelected && selected.length > 0 ? (
          <p className="text-xs text-gray-500">{selected.length} selected</p>
        ) : null}
      </div>

      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-gray-900">Advance → Aircraft master</p>
            <p className="mt-0.5 text-xs text-gray-600">
              {advanceCatalog.length} type{advanceCatalog.length === 1 ? '' : 's'} in catalog
              {loadingAdvanceCatalog ? ' · loading…' : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onReloadAdvanceCatalog ? (
              <button
                type="button"
                disabled={disabled || loadingAdvanceCatalog}
                onClick={onReloadAdvanceCatalog}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {loadingAdvanceCatalog ? 'Loading…' : 'Reload catalog'}
              </button>
            ) : null}
            <button
              type="button"
              disabled={disabled || loadingAdvanceCatalog || advanceCatalog.length === 0}
              onClick={populateAllAdvanceAircraft}
              className="rounded-lg border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] px-3 py-1.5 text-xs font-medium text-[color:var(--billing-heading)] hover:bg-[color:var(--billing-accent-soft)] disabled:opacity-50"
            >
              Select all Advance aircraft
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <SearchableCombobox
              fieldLabel="Add aircraft manually"
              value={manualDraft}
              onChange={setManualDraft}
              onPickOption={(option) => addManualType(option.label)}
              options={advanceComboOptions}
              loading={loadingAdvanceCatalog}
              placeholder="Search Advance aircraft or type a code…"
              onRequestOptions={onReloadAdvanceCatalog}
              maxVisibleOptions={1000}
              listPanelClassName="absolute left-0 right-0 top-full z-[200] mt-1 max-h-[11.5rem] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
            />
          </div>
          <button
            type="button"
            disabled={disabled || !manualDraft.trim()}
            onClick={() => addManualType(manualDraft)}
            className="shrink-0 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Add type
          </button>
        </div>
      </div>

      {selected.filter((value) => !contextualSet.has(value.toUpperCase())).length > 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3">
          <p className="mb-2 text-xs font-medium text-gray-600">
            Also selected (Advance catalog &amp; manual)
          </p>
          <div className="flex flex-wrap gap-2">
            {selected
              .filter((value) => !contextualSet.has(value.toUpperCase()))
              .map((aircraftType) => (
                <label
                  key={aircraftType}
                  className="inline-flex items-center gap-2 rounded-md border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] px-2.5 py-1.5 text-sm"
                >
                  <Checkbox
                    checked
                    disabled={disabled}
                    onCheckedChange={(value) => toggle(aircraftType, value === true)}
                  />
                  <span>{aircraftType}</span>
                </label>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
