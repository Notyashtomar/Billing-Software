'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, Plus, Search, Trash2, Upload, Wrench } from 'lucide-react';
import { BillingPageHeader } from '../BillingLayout';
import { billingUi } from '../billingUi';
import { getExcelJSModule } from '@/lib/dynamic-imports';
import type { BillingApi } from '@/lib/billing-api';
import type { EquipmentMasterRecord, EquipmentMasterUomRecord } from '@/lib/billing-api';
import {
  applyEquipmentMasterColumnReplace,
  EquipmentMasterUomReplace,
} from './EquipmentMasterUomReplace';

const PAGE_SIZE = 40;

const inputClass = billingUi.input;
const selectClass = `${billingUi.select} h-10`;

type CatalogFilter = 'all' | 'multi' | 'missing-description' | 'missing-uom';

function emptyUom(): EquipmentMasterUomRecord {
  return { uom: '', abbreviation: '' };
}

function filledUoms(uoms: EquipmentMasterUomRecord[]): EquipmentMasterUomRecord[] {
  return uoms.filter((pair) => pair.uom.trim() || pair.abbreviation.trim());
}

function uomSummary(uoms: EquipmentMasterUomRecord[]): string {
  const filled = filledUoms(uoms);
  if (filled.length === 0) return 'No UOM yet';
  const first = filled[0];
  return first.abbreviation.trim()
    ? `${first.uom.trim()} (${first.abbreviation.trim()})`
    : first.uom.trim() || first.abbreviation.trim();
}

function typeTone(unitType: string): string {
  const key = unitType.trim().toLowerCase();
  if (key.includes('manpower')) return billingUi.badgeWarning;
  if (key.includes('service')) return billingUi.badgeInfo;
  if (key.includes('equipment')) return billingUi.badgeSuccess;
  return billingUi.badgeNeutral;
}

export function EquipmentMasterPage({ api }: { api: BillingApi }) {
  const [rows, setRows] = useState<EquipmentMasterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const filterBodyRef = useRef<HTMLDivElement>(null);
  const [filterHeight, setFilterHeight] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [uomFilter, setUomFilter] = useState('');
  const [abbreviationFilter, setAbbreviationFilter] = useState('');
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.listEquipmentMaster();
      setRows(result.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load equipment master.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const node = filterBodyRef.current;
    if (!node) return;
    const measure = () => setFilterHeight(filtersOpen ? node.scrollHeight : 0);
    measure();
    if (!filtersOpen) return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [filtersOpen]);

  const typeOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of rows) {
      const type = row.unitType?.trim();
      if (type) values.add(type);
    }
    return [...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [rows]);

  const uomOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of rows) {
      for (const pair of row.uoms ?? []) {
        const uom = pair.uom?.trim();
        if (uom) values.add(uom);
      }
    }
    return [...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [rows]);

  const abbreviationOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of rows) {
      for (const pair of row.uoms ?? []) {
        const abbreviation = pair.abbreviation?.trim();
        if (abbreviation) values.add(abbreviation);
      }
    }
    return [...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [rows]);

  const stats = useMemo(() => {
    let multi = 0;
    let missingDescription = 0;
    let missingUom = 0;
    for (const row of rows) {
      const filled = filledUoms(row.uoms ?? []);
      if (filled.length > 1) multi += 1;
      if (!row.description.trim()) missingDescription += 1;
      if (filled.length === 0) missingUom += 1;
    }
    return { total: rows.length, types: typeOptions.length, multi, missingDescription, missingUom };
  }, [rows, typeOptions.length]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const type = typeFilter.trim().toLowerCase();
    const uom = uomFilter.trim();
    const abbreviation = abbreviationFilter.trim();
    return rows.filter((row) => {
      const filled = filledUoms(row.uoms ?? []);
      if (type && row.unitType.trim().toLowerCase() !== type) return false;
      if (uom && !filled.some((pair) => pair.uom.trim() === uom)) return false;
      if (abbreviation && !filled.some((pair) => pair.abbreviation.trim() === abbreviation)) {
        return false;
      }
      if (catalogFilter === 'multi' && filled.length < 2) return false;
      if (catalogFilter === 'missing-description' && row.description.trim()) return false;
      if (catalogFilter === 'missing-uom' && filled.length > 0) return false;
      if (!query) return true;
      const haystack = [
        row.itemNo,
        row.description,
        row.unitType,
        ...filled.flatMap((pair) => [pair.uom, pair.abbreviation]),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [rows, search, typeFilter, uomFilter, abbreviationFilter, catalogFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const filtersActive =
    Boolean(search.trim() || typeFilter || uomFilter || abbreviationFilter) || catalogFilter !== 'all';

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const replaceRow = (next: EquipmentMasterRecord) => {
    setRows((current) => current.map((row) => (row._id === next._id ? next : row)));
  };

  const patchLocal = (id: string, patch: Partial<EquipmentMasterRecord>) => {
    setRows((current) => current.map((row) => (row._id === id ? { ...row, ...patch } : row)));
  };

  const saveRow = async (row: EquipmentMasterRecord) => {
    const pendingEmpty = (row.uoms ?? []).filter((pair) => !pair.uom.trim() && !pair.abbreviation.trim());
    setSavingId(row._id);
    setError('');
    try {
      const result = await api.updateEquipmentMaster(row._id, {
        itemNo: row.itemNo,
        description: row.description,
        unitType: row.unitType,
        uoms: filledUoms(row.uoms ?? []),
      });
      replaceRow({
        ...result.data,
        uoms: [...(result.data.uoms ?? []), ...pendingEmpty],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this equipment.');
    } finally {
      setSavingId(null);
    }
  };

  const addRow = async () => {
    setError('');
    try {
      const result = await api.createEquipmentMaster({
        itemNo: '',
        description: '',
        unitType: typeFilter || 'Equipment Used',
        uoms: [emptyUom()],
      });
      setRows((current) => [result.data, ...current]);
      setExpandedIds((current) => new Set(current).add(result.data._id));
      setPage(0);
      setSearch('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add equipment.');
    }
  };

  const removeRow = async (row: EquipmentMasterRecord) => {
    const label = row.description || row.itemNo || 'this equipment';
    if (!window.confirm(`Remove ${label} from the equipment master?`)) return;
    setError('');
    try {
      await api.deleteEquipmentMaster(row._id);
      setRows((current) => current.filter((item) => item._id !== row._id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove this equipment.');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('');
    setUomFilter('');
    setAbbreviationFilter('');
    setCatalogFilter('all');
    setPage(0);
  };

  const exportRows = async () => {
    setExporting(true);
    setError('');
    try {
      const ExcelJS = await getExcelJSModule();
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'FRIS Billing';
      const sheet = workbook.addWorksheet('Equipment master', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });
      const maxPairs = Math.max(1, ...filtered.map((row) => (row.uoms ?? []).length));
      const headers = ['No.', 'Description', 'Equipment type'];
      for (let index = 1; index <= maxPairs; index += 1) {
        headers.push(`UOM ${index}`, `Abbreviation ${index}`);
      }
      sheet.addRow(headers);
      const header = sheet.getRow(1);
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      header.alignment = { vertical: 'middle', wrapText: true };
      for (const row of filtered) {
        const values: Array<string> = [row.itemNo, row.description, row.unitType];
        for (let index = 0; index < maxPairs; index += 1) {
          const pair = row.uoms?.[index];
          values.push(pair?.uom ?? '', pair?.abbreviation ?? '');
        }
        sheet.addRow(values);
      }
      sheet.columns.forEach((column, index) => {
        column.width = index === 1 ? 42 : 22;
      });
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'equipment-master.xlsx';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export equipment master.');
    } finally {
      setExporting(false);
    }
  };

  const importRows = async (file: File) => {
    setImporting(true);
    setError('');
    try {
      const ExcelJS = await getExcelJSModule();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error('The file has no sheet.');
      const headerRow = sheet.getRow(1);
      const headers = headerRow.values as Array<string | undefined>;
      const indexOf = (names: string[]) =>
        headers.findIndex((header) => names.includes(String(header ?? '').trim().toLowerCase()));
      const codeIndex = indexOf(['no.', 'no', 'code', 'item no', 'itemno']);
      const descriptionIndex = indexOf(['description', 'name']);
      const typeIndex = indexOf(['equipment type', 'type', 'unit type']);
      if (codeIndex < 0 && descriptionIndex < 0) {
        throw new Error('Use columns No., Description, and Equipment type. Export a file to see the layout.');
      }
      const text = (value: unknown) => {
        if (value == null) return '';
        if (typeof value === 'object' && value && 'text' in value) return String((value as { text?: string }).text ?? '').trim();
        return String(value).trim();
      };
      const parsed: Array<{ itemNo: string; description: string; unitType: string; uoms: Array<{ uom: string; abbreviation: string }> }> = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const values = row.values as unknown[];
        const uoms: Array<{ uom: string; abbreviation: string }> = [];
        for (let index = 1; index < headers.length; index += 1) {
          const header = String(headers[index] ?? '').trim().toLowerCase();
          if (!header.startsWith('uom')) continue;
          const uom = text(values[index]);
          const abbreviation = text(values[index + 1]);
          if (uom || abbreviation) uoms.push({ uom, abbreviation });
        }
        parsed.push({
          itemNo: codeIndex > 0 ? text(values[codeIndex]) : '',
          description: descriptionIndex > 0 ? text(values[descriptionIndex]) : '',
          unitType: typeIndex > 0 ? text(values[typeIndex]) : '',
          uoms,
        });
      });
      const result = await api.importEquipmentMaster(parsed);
      await load();
      setError('');
      window.alert(`Imported ${result.data.created} new and updated ${result.data.updated}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import equipment.');
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  return (
    <>
      <BillingPageHeader
        title="Equipment Master"
        description="The station catalog of equipment, services, and manpower. Each code keeps its own units of measure."
        actions={
          <div className={billingUi.pageHeaderActions}>
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importRows(file);
              }}
            />
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
              className={billingUi.btnSecondary}
            >
              <Upload className="h-4 w-4" aria-hidden />
              {importing ? 'Importing…' : 'Import'}
            </button>
            <button
              type="button"
              onClick={() => void exportRows()}
              disabled={exporting || filtered.length === 0}
              className={billingUi.btnSecondary}
            >
              <Download className="h-4 w-4" aria-hidden />
              {exporting ? 'Exporting…' : 'Export'}
            </button>
            <button type="button" onClick={() => void addRow()} className={billingUi.btnPrimary}>
              <Plus className="h-4 w-4" aria-hidden />
              Add equipment
            </button>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="In catalog" value={loading ? '—' : String(stats.total)} detail="Codes available to every station" />
        <Stat label="Equipment types" value={loading ? '—' : String(stats.types)} detail="Equipment, service, and manpower" />
        <Stat
          label="Multiple UOMs"
          value={loading ? '—' : String(stats.multi)}
          detail="Codes billed in more than one unit"
          tone="info"
        />
        <Stat
          label="Needs attention"
          value={loading ? '—' : String(stats.missingDescription + stats.missingUom)}
          detail={`${stats.missingDescription} without a description · ${stats.missingUom} without a UOM`}
          tone={stats.missingDescription + stats.missingUom > 0 ? 'warning' : 'success'}
        />
      </div>

      <EquipmentMasterUomReplace
        api={api}
        rows={rows}
        onApplied={(column, fromValue, toValue) => {
          setRows((current) =>
            current.map((row) => applyEquipmentMasterColumnReplace(row, column, fromValue, toValue)),
          );
          if (column === 'uom') {
            setUomFilter((current) => (current === fromValue ? toValue : current));
          }
          if (column === 'abbreviation') {
            setAbbreviationFilter((current) => (current === fromValue ? toValue : current));
          }
          if (column === 'unitType') {
            setTypeFilter((current) => (current === fromValue ? toValue : current));
          }
        }}
      />

      <section className={`${billingUi.card} mb-4 overflow-hidden`}>
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <button
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
            className="flex min-w-0 items-center gap-2.5 text-left"
          >
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-[color:var(--billing-primary)] transition-transform duration-500 ease-out ${filtersOpen ? 'rotate-180' : '-rotate-90'}`}
              aria-hidden
            />
            <span className="min-w-0">
              <span className={`block leading-none ${billingUi.sectionTitle}`}>Find equipment</span>
              <span className={`mt-1 block truncate ${billingUi.sectionDesc}`}>
                {filtersActive ? 'Filters are on. Export uses this result.' : 'Search, type, unit, and abbreviation.'}
              </span>
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-2">
            {filtersActive ? (
              <button type="button" onClick={clearFilters} className={`${billingUi.btnGhost} h-9`}>
                Clear filters
              </button>
            ) : null}
            <button
              type="button"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
              className={`${billingUi.btnSecondary} h-9`}
            >
              {filtersOpen ? 'Hide filters' : 'Show filters'}
            </button>
          </div>
        </div>
        <div
          className="overflow-hidden transition-[height] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ height: filterHeight }}
        >
          <div ref={filterBodyRef}>
            <div
              className={`border-t border-[color:var(--billing-border)] px-4 pb-4 pt-4 ${filtersOpen ? 'equipment-filter-drop' : ''}`}
            >
              <div className="grid items-end gap-x-3 gap-y-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium leading-4 text-[color:var(--billing-text-secondary)]">
                  Search
                  <span className="relative block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--billing-text-muted)]" aria-hidden />
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(0);
                      }}
                      placeholder="Code, name, type, or unit"
                      className={`${inputClass} h-10 pl-9`}
                    />
                  </span>
                </label>
                <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium leading-4 text-[color:var(--billing-text-secondary)]">
                  Equipment type
                  <select
                    value={typeFilter}
                    onChange={(event) => {
                      setTypeFilter(event.target.value);
                      setPage(0);
                    }}
                    className={selectClass}
                  >
                    <option value="">All types</option>
                    {typeOptions.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium leading-4 text-[color:var(--billing-text-secondary)]">
                  Unit of measure
                  <select
                    value={uomFilter}
                    onChange={(event) => {
                      setUomFilter(event.target.value);
                      setPage(0);
                    }}
                    className={selectClass}
                  >
                    <option value="">All UOMs</option>
                    {uomOptions.map((uom) => (
                      <option key={uom} value={uom}>
                        {uom}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium leading-4 text-[color:var(--billing-text-secondary)]">
                  Abbreviation
                  <select
                    value={abbreviationFilter}
                    onChange={(event) => {
                      setAbbreviationFilter(event.target.value);
                      setPage(0);
                    }}
                    className={selectClass}
                  >
                    <option value="">All abbreviations</option>
                    {abbreviationOptions.map((abbreviation) => (
                      <option key={abbreviation} value={abbreviation}>
                        {abbreviation}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-4 flex min-h-9 flex-wrap items-center gap-2" role="group" aria-label="Catalog status">
                {(
                  [
                    ['all', 'All codes'],
                    ['multi', 'Multiple UOMs'],
                    ['missing-description', 'Missing description'],
                    ['missing-uom', 'Missing UOM'],
                  ] as const
                ).map(([id, label]) => {
                  const active = catalogFilter === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setCatalogFilter(id);
                        setPage(0);
                      }}
                      className={`${active ? billingUi.btnAccent : billingUi.btnSecondary} h-9 transition-transform duration-200 hover:-translate-y-px`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {typeOptions.length > 0 ? (
                <div className="mt-3 flex min-h-8 flex-wrap items-center gap-2">
                  <span className="w-10 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--billing-text-muted)]">
                    Type
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setTypeFilter('');
                      setPage(0);
                    }}
                    className={`h-7 items-center ${!typeFilter ? billingUi.badgeSuccess : billingUi.badgeNeutral}`}
                  >
                    All
                  </button>
                  {typeOptions.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setTypeFilter(type);
                        setPage(0);
                      }}
                      className={`h-7 items-center transition-transform duration-200 hover:-translate-y-px ${typeFilter === type ? billingUi.badgeSuccess : typeTone(type)}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div role="alert" className={`${billingUi.alertDanger} mb-4`}>
          {error}
        </div>
      ) : null}

      <div className={billingUi.tableWrap}>
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--billing-border)] px-4 py-3">
          <p className="text-sm text-[color:var(--billing-text-secondary)]">
            <span className="font-semibold text-[color:var(--billing-heading)]">{filtered.length}</span>
            {filtered.length === 1 ? ' code' : ' codes'}
            {filtered.length !== rows.length ? ` of ${rows.length}` : ''}
          </p>
          <p className="hidden text-xs text-[color:var(--billing-text-muted)] sm:block">
            Fields save when you leave them. Open a row to edit its units.
          </p>
        </div>
        <div className="billing-table-scroll max-h-[70vh] overflow-auto">
          <table className={`${billingUi.table} min-w-[64rem]`}>
            <thead className="sticky top-0 z-10 bg-[color:var(--billing-surface-muted)]">
              <tr>
                <th className={`${billingUi.tableHeadCell} w-12`} aria-label="Expand" />
                <th className={`${billingUi.tableHeadCell} min-w-[8rem]`}>Code</th>
                <th className={`${billingUi.tableHeadCell} min-w-[16rem]`}>Description</th>
                <th className={`${billingUi.tableHeadCell} min-w-[11rem]`}>Type</th>
                <th className={`${billingUi.tableHeadCell} min-w-[14rem]`}>UOM</th>
                <th className={`${billingUi.tableHeadCell} w-16`} />
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--billing-border)] bg-[color:var(--billing-surface)]">
              {loading ? (
                <tr>
                  <td colSpan={6} className={billingUi.tableEmpty}>
                    Loading equipment master…
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className={billingUi.tableEmpty}>
                    <span className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-[color:var(--billing-surface-muted)]">
                      <Wrench className="h-5 w-5" aria-hidden />
                    </span>
                    No equipment matches these filters.
                  </td>
                </tr>
              ) : (
                visible.map((row) => {
                  const busy = savingId === row._id;
                  const expanded = expandedIds.has(row._id);
                  const uoms = row.uoms?.length ? row.uoms : [emptyUom()];
                  const extraCount = Math.max(0, filledUoms(uoms).length - 1);
                  const label = row.description || row.itemNo || 'this equipment';
                  return (
                    <EquipmentMasterRows
                      key={row._id}
                      row={row}
                      busy={busy}
                      expanded={expanded}
                      uoms={uoms}
                      extraCount={extraCount}
                      label={label}
                      onToggle={() => toggleExpanded(row._id)}
                      onPatch={(patch) => patchLocal(row._id, patch)}
                      onSave={(next) => void saveRow(next)}
                      onRemove={() => void removeRow(row)}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--billing-border)] px-4 py-3 text-sm text-[color:var(--billing-text-secondary)]">
          <span>
            Page {safePage + 1} of {pageCount}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              className={billingUi.btnSecondary}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((current) => current + 1)}
              className={billingUi.btnSecondary}
            >
              Next
            </button>
          </div>
        </div>
      </div>
      <datalist id="equipment-master-types">
        {typeOptions.map((type) => (
          <option key={type} value={type} />
        ))}
        <option value="Equipment Used" />
        <option value="Service Wise" />
        <option value="Manpower" />
      </datalist>
    </>
  );
}

function Stat({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: string;
  detail: string;
  tone?: 'default' | 'info' | 'warning' | 'success';
}) {
  const toneClass =
    tone === 'info'
      ? billingUi.kpiDefault
      : tone === 'warning'
        ? billingUi.kpiWarning
        : tone === 'success'
          ? billingUi.kpiSuccess
          : billingUi.kpiDefault;
  return (
    <article className={`${toneClass} transition duration-200 hover:-translate-y-0.5 hover:shadow-md`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--billing-text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--billing-heading)]">{value}</p>
      <p className="mt-1 text-xs text-[color:var(--billing-text-secondary)]">{detail}</p>
    </article>
  );
}

function EquipmentMasterRows({
  row,
  busy,
  expanded,
  uoms,
  extraCount,
  label,
  onToggle,
  onPatch,
  onSave,
  onRemove,
}: {
  row: EquipmentMasterRecord;
  busy: boolean;
  expanded: boolean;
  uoms: EquipmentMasterUomRecord[];
  extraCount: number;
  label: string;
  onToggle: () => void;
  onPatch: (patch: Partial<EquipmentMasterRecord>) => void;
  onSave: (next: EquipmentMasterRecord) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <tr className={expanded ? 'bg-[color:var(--billing-accent-soft)]' : 'hover:bg-[color:var(--billing-surface-muted)]'}>
        <td className="px-2 py-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
            title={expanded ? 'Hide UOMs' : 'Show UOMs'}
            className={billingUi.iconAction}
          >
            <ChevronDown className={`h-4 w-4 transition ${expanded ? '' : '-rotate-90'}`} aria-hidden />
          </button>
        </td>
        <td className="px-3 py-2">
          <input
            value={row.itemNo}
            disabled={busy}
            aria-label={`Equipment number ${label}`}
            onChange={(event) => onPatch({ itemNo: event.target.value })}
            onBlur={(event) => onSave({ ...row, itemNo: event.target.value })}
            className={`${inputClass} min-w-[7rem] font-semibold tracking-wide`}
          />
        </td>
        <td className="px-3 py-2">
          <input
            value={row.description}
            disabled={busy}
            aria-label={`Description for ${row.itemNo || 'new equipment'}`}
            onChange={(event) => onPatch({ description: event.target.value })}
            onBlur={(event) => onSave({ ...row, description: event.target.value })}
            className={`${inputClass} min-w-[14rem]`}
          />
        </td>
        <td className="px-3 py-2">
          <input
            value={row.unitType}
            disabled={busy}
            list="equipment-master-types"
            aria-label={`Equipment type for ${label}`}
            onChange={(event) => onPatch({ unitType: event.target.value })}
            onBlur={(event) => onSave({ ...row, unitType: event.target.value })}
            className={`${inputClass} min-w-[10rem]`}
          />
        </td>
        <td className="px-3 py-2">
          <button
            type="button"
            onClick={onToggle}
            className="flex h-10 w-full min-w-[12rem] items-center justify-between gap-2 rounded-[var(--billing-radius)] border border-transparent px-2 text-left text-sm text-[color:var(--billing-text)] hover:border-[color:var(--billing-border-strong)] hover:bg-[color:var(--billing-surface)]"
          >
            <span className="truncate">{uomSummary(uoms)}</span>
            {extraCount > 0 ? <span className={billingUi.badgeInfo}>+{extraCount}</span> : null}
          </button>
        </td>
        <td className="px-3 py-2">
          <button type="button" onClick={onRemove} aria-label={`Delete ${label}`} className={billingUi.iconDanger}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr className="bg-[color:var(--billing-accent-soft)]">
          <td />
          <td colSpan={5} className="px-3 pb-4 pt-1">
            <div className="max-w-3xl rounded-[var(--billing-radius-xl)] border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] p-4 shadow-[var(--billing-shadow-sm)]">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className={billingUi.sectionTitle}>Units of measure</p>
                  <p className={billingUi.sectionDesc}>{label}</p>
                </div>
                {busy ? <span className="text-xs text-[color:var(--billing-text-muted)]">Saving…</span> : null}
              </div>
              <div className="flex flex-col gap-2">
                {uoms.map((pair, index) => (
                  <div key={`${row._id}-uom-${index}`} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_auto] items-center gap-2">
                    <input
                      value={pair.uom}
                      disabled={busy}
                      placeholder="Unit of measure"
                      aria-label={`UOM ${index + 1} for ${label}`}
                      onChange={(event) => {
                        const next = uoms.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, uom: event.target.value } : item,
                        );
                        onPatch({ uoms: next });
                      }}
                      onBlur={(event) => {
                        const next = uoms.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, uom: event.target.value } : item,
                        );
                        onSave({ ...row, uoms: next });
                      }}
                      className={inputClass}
                    />
                    <input
                      value={pair.abbreviation}
                      disabled={busy}
                      placeholder="Abbreviation"
                      aria-label={`Abbreviation ${index + 1} for ${label}`}
                      onChange={(event) => {
                        const next = uoms.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, abbreviation: event.target.value } : item,
                        );
                        onPatch({ uoms: next });
                      }}
                      onBlur={(event) => {
                        const next = uoms.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, abbreviation: event.target.value } : item,
                        );
                        onSave({ ...row, uoms: next });
                      }}
                      className={inputClass}
                    />
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Remove UOM ${index + 1}`}
                      onClick={() => {
                        const next = uoms.filter((_, itemIndex) => itemIndex !== index);
                        const updated = { ...row, uoms: next.length > 0 ? next : [emptyUom()] };
                        onPatch({ uoms: updated.uoms });
                        onSave(updated);
                      }}
                      className={billingUi.iconDanger}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onPatch({ uoms: [...uoms, emptyUom()] })}
                  className={`${billingUi.btnOutline} mt-1 w-fit`}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Add UOM
                </button>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
