'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { billingUi } from '../billingUi';
import type { BillingApi, EquipmentMasterRecord, EquipmentMasterUomRecord } from '@/lib/billing-api';

const inputClass = billingUi.input;
const DROPDOWN_ITEM_CLASS = 'flex h-9 w-full items-center justify-between gap-3 px-3 text-left text-sm';
/** Five option rows, then the rest scroll. */
const DROPDOWN_LIST_CLASS =
  'absolute z-20 mt-1 max-h-[11.25rem] w-full overflow-y-auto rounded-[var(--billing-radius)] border border-[color:var(--billing-border-strong)] bg-[color:var(--billing-surface)] shadow-[var(--billing-shadow-sm)]';
/** Five 2.25rem rows plus the 0.25rem gap under the input. */
const DROPDOWN_RESERVE_PX = 184;

export type EquipmentMasterReplaceColumn =
  | 'itemNo'
  | 'description'
  | 'unitType'
  | 'uom'
  | 'abbreviation';

const REPLACE_COLUMNS: Array<{ id: EquipmentMasterReplaceColumn; label: string }> = [
  { id: 'itemNo', label: 'Code' },
  { id: 'description', label: 'Description' },
  { id: 'unitType', label: 'Type' },
  { id: 'uom', label: 'UOM' },
  { id: 'abbreviation', label: 'Abbreviation' },
];

function columnLabel(column: EquipmentMasterReplaceColumn): string {
  return REPLACE_COLUMNS.find((item) => item.id === column)?.label ?? column;
}

function rewriteUomPairs(
  uoms: EquipmentMasterUomRecord[],
  field: 'uom' | 'abbreviation',
  fromValue: string,
  toValue: string,
): EquipmentMasterUomRecord[] {
  const from = fromValue.trim();
  const to = toValue.trim();
  if (!from || !to || from === to) return uoms;
  const next: EquipmentMasterUomRecord[] = [];
  const seen = new Set<string>();
  for (const pair of uoms) {
    const uom = field === 'uom' && pair.uom.trim() === from ? to : pair.uom.trim();
    const abbreviation =
      field === 'abbreviation' && pair.abbreviation.trim() === from ? to : pair.abbreviation.trim();
    if (!uom && !abbreviation) continue;
    if (field === 'uom') {
      const key = uom.toLowerCase();
      if (uom && seen.has(key)) continue;
      if (uom) seen.add(key);
    }
    next.push({ uom, abbreviation });
  }
  return next;
}

export function applyEquipmentMasterUomReplace(
  uoms: EquipmentMasterUomRecord[],
  fromUom: string,
  toUom: string,
): EquipmentMasterUomRecord[] {
  return rewriteUomPairs(uoms, 'uom', fromUom, toUom);
}

export function applyEquipmentMasterColumnReplace(
  row: EquipmentMasterRecord,
  column: EquipmentMasterReplaceColumn,
  fromValue: string,
  toValue: string,
): EquipmentMasterRecord {
  const from = fromValue.trim();
  const to = toValue.trim();
  if (!from || !to || from === to) return row;
  if (column === 'uom') {
    return { ...row, uoms: rewriteUomPairs(row.uoms ?? [], 'uom', from, to) };
  }
  if (column === 'abbreviation') {
    return { ...row, uoms: rewriteUomPairs(row.uoms ?? [], 'abbreviation', from, to) };
  }
  if (column === 'itemNo' && row.itemNo.trim() === from) return { ...row, itemNo: to };
  if (column === 'description' && row.description.trim() === from) return { ...row, description: to };
  if (column === 'unitType' && row.unitType.trim() === from) return { ...row, unitType: to };
  return row;
}

function valuesForColumn(
  rows: EquipmentMasterRecord[],
  column: EquipmentMasterReplaceColumn,
): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  const add = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  };
  for (const row of rows) {
    if (column === 'itemNo') add(row.itemNo);
    else if (column === 'description') add(row.description);
    else if (column === 'unitType') add(row.unitType);
    else {
      const seenOnRow = new Set<string>();
      for (const pair of row.uoms ?? []) {
        const value = (column === 'uom' ? pair.uom : pair.abbreviation).trim();
        if (!value || seenOnRow.has(value)) continue;
        seenOnRow.add(value);
        add(value);
      }
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value, undefined, { sensitivity: 'base' }));
}

export function EquipmentMasterUomReplace({
  api,
  rows,
  onApplied,
}: {
  api: BillingApi;
  rows: EquipmentMasterRecord[];
  onApplied: (column: EquipmentMasterReplaceColumn, fromValue: string, toValue: string) => void;
}) {
  const [column, setColumn] = useState<EquipmentMasterReplaceColumn | ''>('');
  const [fromValue, setFromValue] = useState('');
  const [toValue, setToValue] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sectionOpen, setSectionOpen] = useState(false);
  const [bodyHeight, setBodyHeight] = useState(0);
  const pickerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const usage = useMemo(
    () => (column ? valuesForColumn(rows, column) : []),
    [rows, column],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return usage;
    return usage.filter((item) => item.value.toLowerCase().includes(query));
  }, [usage, search]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    const measure = () =>
      setBodyHeight(sectionOpen ? node.scrollHeight + (open ? DROPDOWN_RESERVE_PX : 0) : 0);
    measure();
    if (!sectionOpen) return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [sectionOpen, open, column, error, notice]);

  const selected = usage.find((item) => item.value === fromValue);
  const label = column ? columnLabel(column) : 'value';

  const resetValues = () => {
    setFromValue('');
    setSearch('');
    setToValue('');
    setOpen(false);
    setError('');
  };

  const save = async () => {
    const next = toValue.trim();
    setError('');
    setNotice('');
    if (!column) {
      setError('Choose a column to replace.');
      return;
    }
    if (!fromValue) {
      setError(`Choose a ${label} from the list.`);
      return;
    }
    if (!next) {
      setError(`Type the ${label} that should appear instead.`);
      return;
    }
    if (fromValue === next) {
      setError(`The replacement must be different from the current ${label}.`);
      return;
    }
    setSaving(true);
    try {
      const result = await api.replaceEquipmentMasterColumn({
        column,
        fromValue,
        toValue: next,
      });
      onApplied(result.data.column, result.data.fromValue, result.data.toValue);
      resetValues();
      const extras = [
        result.data.contracts ? `${result.data.contracts} contract${result.data.contracts === 1 ? '' : 's'}` : '',
        result.data.serviceCatalog
          ? `${result.data.serviceCatalog} catalog service${result.data.serviceCatalog === 1 ? '' : 's'}`
          : '',
        result.data.rateCards ? `${result.data.rateCards} rate card${result.data.rateCards === 1 ? '' : 's'}` : '',
        result.data.rafAdhoc ? `${result.data.rafAdhoc} RAF adhoc rate${result.data.rafAdhoc === 1 ? '' : 's'}` : '',
      ].filter(Boolean);
      setNotice(
        extras.length > 0
          ? `Replaced “${result.data.fromValue}” with “${result.data.toValue}” on ${result.data.equipmentMaster} catalog rows, plus ${extras.join(', ')}.`
          : `Replaced “${result.data.fromValue}” with “${result.data.toValue}” on ${result.data.equipmentMaster} catalog rows.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not replace this ${label}.`);
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = () => {
    setSectionOpen((current) => {
      if (current) setOpen(false);
      return !current;
    });
  };

  const subtitle = notice
    ? notice
    : column
      ? `Replacing ${label} values.`
      : 'Choose a column, pick a spelling, and type the keyword that should appear instead.';

  return (
    <section className={`${billingUi.card} mb-4 overflow-hidden`}>
      <div className="flex h-14 items-center justify-between gap-3 px-4">
        <button
          type="button"
          aria-expanded={sectionOpen}
          onClick={toggleSection}
          className="flex min-w-0 items-center gap-2.5 text-left"
        >
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[color:var(--billing-primary)] transition-transform duration-500 ease-out ${sectionOpen ? 'rotate-180' : '-rotate-90'}`}
            aria-hidden
          />
          <span className="min-w-0">
            <span className={`block leading-none ${billingUi.sectionTitle}`}>Replace catalog values</span>
            <span className={`mt-1 block truncate ${billingUi.sectionDesc}`}>{subtitle}</span>
          </span>
        </button>
        <button
          type="button"
          aria-expanded={sectionOpen}
          onClick={toggleSection}
          className={`${billingUi.btnSecondary} h-9 shrink-0`}
        >
          {sectionOpen ? 'Hide replace' : 'Show replace'}
        </button>
      </div>
      <div
        className="overflow-hidden transition-[height] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ height: bodyHeight }}
      >
        <div ref={bodyRef}>
          <div
            className={`border-t border-[color:var(--billing-border)] px-4 pb-4 pt-4 ${sectionOpen ? 'equipment-filter-drop' : ''}`}
          >
      <div className="mb-3 flex min-h-9 flex-wrap items-center gap-2" role="group" aria-label="Column to replace">
        {REPLACE_COLUMNS.map((item) => {
          const active = column === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setColumn(item.id);
                resetValues();
                setNotice('');
              }}
              className={`${active ? billingUi.btnAccent : billingUi.btnSecondary} h-9`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {column ? (
        <div className="grid items-end gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]">
          <div className="flex min-w-0 flex-col gap-1.5 text-xs font-medium leading-4 text-[color:var(--billing-text-secondary)]">
            Current {label}
            <div ref={pickerRef} className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--billing-text-muted)]"
                aria-hidden
              />
              <input
                type="search"
                value={open ? search : fromValue}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setOpen(true);
                  if (!event.target.value) setFromValue('');
                }}
                onFocus={() => {
                  setSearch('');
                  setOpen(true);
                }}
                placeholder={usage.length ? `Search or select a ${label}` : `No ${label} values in the catalog yet`}
                disabled={usage.length === 0}
                className={`${inputClass} h-10 pl-9`}
                aria-expanded={open}
                aria-controls="equipment-column-replace-list"
              />
              {open ? (
                <ul
                  id="equipment-column-replace-list"
                  role="listbox"
                  className={DROPDOWN_LIST_CLASS}
                >
                  {filtered.length === 0 ? (
                    <li className="flex h-9 items-center px-3 text-sm text-[color:var(--billing-text-muted)]">
                      No {label} matches that search.
                    </li>
                  ) : (
                    filtered.map((item) => {
                      const active = item.value === fromValue;
                      return (
                        <li key={item.value}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={active}
                            onClick={() => {
                              setFromValue(item.value);
                              setSearch(item.value);
                              setOpen(false);
                              setError('');
                              setNotice('');
                            }}
                            className={`${DROPDOWN_ITEM_CLASS} ${
                              active
                                ? 'bg-[color:var(--billing-primary-soft)] text-[color:var(--billing-primary)]'
                                : 'text-[color:var(--billing-text)] hover:bg-[color:var(--billing-surface-muted)]'
                            }`}
                          >
                            <span className="min-w-0 truncate">{item.value}</span>
                            <span className="shrink-0 text-xs text-[color:var(--billing-text-muted)]">
                              {item.count} {item.count === 1 ? 'row' : 'rows'}
                            </span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              ) : null}
            </div>
            {selected ? (
              <span className={billingUi.hint}>
                {selected.count} catalog {selected.count === 1 ? 'row uses' : 'rows use'} this exact spelling.
              </span>
            ) : (
              <span className={billingUi.hint}>Five values show at a time. Scroll or search for the rest.</span>
            )}
          </div>

          <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium leading-4 text-[color:var(--billing-text-secondary)]">
            Replace with
            <input
              type="text"
              value={toValue}
              onChange={(event) => {
                setToValue(event.target.value);
                setError('');
                setNotice('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void save();
                }
              }}
              placeholder={`Type the ${label} keyword`}
              className={`${inputClass} h-10`}
            />
          </label>

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || usage.length === 0}
            className={`${billingUi.btnPrimary} h-10`}
          >
            {saving ? 'Saving…' : 'Save replacement'}
          </button>
        </div>
      ) : (
        <p className={billingUi.hint}>Select a column to see its values and replace a spelling.</p>
      )}

      {error ? <p className={`${billingUi.alertDanger} mt-3`}>{error}</p> : null}
      {notice ? <p className={`${billingUi.alertSuccess} mt-3`}>{notice}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
