'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, Plane, Plus, Search, Trash2, Upload } from 'lucide-react';
import { BillingPageHeader } from '../BillingLayout';
import { billingUi } from '../billingUi';
import { getExcelJSModule } from '@/lib/dynamic-imports';
import type { AircraftMasterRecord, AircraftMasterWrite, BillingApi } from '@/lib/billing-api';

const PAGE_SIZE = 40;

const inputClass = billingUi.input;
const selectClass = `${billingUi.select} h-10`;

const EXPORT_HEADERS = [
  'S_No_',
  'Aircraft Type',
  'Manufacturer',
  'Aircraft Body',
  'ICAO Code',
  'Wingspan (m)',
  'MTOW (kg)',
  'Passenger Capacity',
  'Description',
  'Active',
  'Category',
  'Category code',
  'Status',
  'Ceiling rate',
  'Aera rates',
  'Valid till',
] as const;

type CatalogFilter = 'all' | 'missing-description' | 'missing-icao' | 'inactive';

function normalizeHeader(value: unknown): string {
  const key = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (key === 'array rate' || key === 'aera rate') return 'aera rates';
  if (key === 'active') return 'status';
  if (key === 'valid until' || key === 'valid to' || key === 'validity') return 'valid till';
  return key;
}

const HEADER_FIELD: Record<string, keyof AircraftMasterWrite> = {
  s_no_: 'serialNo',
  's no': 'serialNo',
  's no.': 'serialNo',
  'serial no': 'serialNo',
  'aircraft type': 'aircraftType',
  type: 'aircraftType',
  'icao code': 'icaoCode',
  icao: 'icaoCode',
  'mtow (kg)': 'mtowKg',
  mtow: 'mtowKg',
  'passenger capacity': 'passengerCapacity',
  manufacturer: 'manufacturer',
  'aircraft body': 'aircraftBody',
  body: 'aircraftBody',
  'wingspan (m)': 'wingspanM',
  wingspan: 'wingspanM',
  description: 'description',
  'category code': 'categoryCode',
  'tariff category': 'categoryCode',
  'ceiling rate': 'ceilingRate',
  'aera rates': 'arrayRate',
  'valid till': 'validTill',
};

function textValue(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'object' && value && 'text' in value) {
    return String((value as { text?: unknown }).text ?? '').trim();
  }
  return String(value).trim();
}

function toWrite(row: AircraftMasterRecord): AircraftMasterWrite {
  return {
    serialNo: row.serialNo ?? '',
    aircraftType: row.aircraftType ?? '',
    icaoCode: row.icaoCode ?? '',
    mtowKg: row.mtowKg ?? '',
    passengerCapacity: row.passengerCapacity ?? '',
    manufacturer: row.manufacturer ?? '',
    aircraftBody: row.aircraftBody ?? '',
    wingspanM: row.wingspanM ?? '',
    description: row.description ?? '',
    active: row.active ?? '',
    category: row.category ?? '',
    categoryCode: row.categoryCode ?? '',
    activeSecondary: row.activeSecondary ?? '',
    ceilingRate: row.ceilingRate ?? '',
    arrayRate: row.arrayRate ?? '',
    validTill: row.validTill ?? '',
  };
}

function isInactive(row: AircraftMasterRecord): boolean {
  return row.activeSecondary.trim().toLowerCase() === 'no';
}

function statusLabel(row: AircraftMasterRecord): string {
  const value = row.activeSecondary.trim();
  if (!value) return 'No status';
  if (isInactive(row)) return 'Inactive';
  if (value.toLowerCase() === 'yes') return 'Active';
  return value;
}

function bodyTone(body: string): string {
  const key = body.trim().toLowerCase();
  if (key === 'nb' || key.includes('narrow')) return billingUi.badgeSuccess;
  if (key === 'wb' || key.includes('wide')) return billingUi.badgeInfo;
  if (key.includes('helicopter') || key.includes('fighter')) return billingUi.badgeWarning;
  return billingUi.badgeNeutral;
}

function distinct(values: string[]): string[] {
  const map = new Map<string, string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!map.has(key)) map.set(key, trimmed);
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export function AircraftMasterPage({ api }: { api: BillingApi }) {
  const [rows, setRows] = useState<AircraftMasterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const filterBodyRef = useRef<HTMLDivElement>(null);
  const [filterHeight, setFilterHeight] = useState(0);
  const [search, setSearch] = useState('');
  const [bodyFilter, setBodyFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [codeFilter, setCodeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.listAircraftMaster();
      setRows(result.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load aircraft master.');
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

  const bodyOptions = useMemo(() => distinct(rows.map((row) => row.aircraftBody)), [rows]);
  const categoryOptions = useMemo(() => distinct(rows.map((row) => row.category)), [rows]);
  const codeOptions = useMemo(() => distinct(rows.map((row) => row.categoryCode)), [rows]);
  const manufacturerCount = useMemo(
    () => distinct(rows.map((row) => row.manufacturer)).length,
    [rows],
  );

  const stats = useMemo(() => {
    let missingDescription = 0;
    let missingIcao = 0;
    let inactive = 0;
    for (const row of rows) {
      if (!row.description.trim()) missingDescription += 1;
      if (!row.icaoCode.trim()) missingIcao += 1;
      if (isInactive(row)) inactive += 1;
    }
    return {
      total: rows.length,
      bodies: bodyOptions.length,
      missingDescription,
      missingIcao,
      inactive,
    };
  }, [rows, bodyOptions.length]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const body = bodyFilter.trim().toLowerCase();
    const category = categoryFilter.trim().toLowerCase();
    const code = codeFilter.trim().toLowerCase();
    const status = statusFilter.trim().toLowerCase();
    return rows.filter((row) => {
      if (body && row.aircraftBody.trim().toLowerCase() !== body) return false;
      if (category && row.category.trim().toLowerCase() !== category) return false;
      if (code && row.categoryCode.trim().toLowerCase() !== code) return false;
      if (status === 'active' && (isInactive(row) || !row.activeSecondary.trim())) return false;
      if (status === 'inactive' && !isInactive(row)) return false;
      if (status === 'missing' && row.activeSecondary.trim()) return false;
      if (catalogFilter === 'missing-description' && row.description.trim()) return false;
      if (catalogFilter === 'missing-icao' && row.icaoCode.trim()) return false;
      if (catalogFilter === 'inactive' && !isInactive(row)) return false;
      if (!query) return true;
      const haystack = [
        row.serialNo,
        row.aircraftType,
        row.manufacturer,
        row.aircraftBody,
        row.icaoCode,
        row.category,
        row.categoryCode,
        row.description,
        row.mtowKg,
        row.passengerCapacity,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [rows, search, bodyFilter, categoryFilter, codeFilter, statusFilter, catalogFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const filtersActive =
    Boolean(search.trim() || bodyFilter || categoryFilter || codeFilter || statusFilter) ||
    catalogFilter !== 'all';

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

  const replaceRow = (next: AircraftMasterRecord) => {
    setRows((current) => current.map((row) => (row._id === next._id ? { ...row, ...next } : row)));
  };

  const patchLocal = (id: string, patch: Partial<AircraftMasterRecord>) => {
    setRows((current) => current.map((row) => (row._id === id ? { ...row, ...patch } : row)));
  };

  const saveRow = async (row: AircraftMasterRecord) => {
    setSavingId(row._id);
    setError('');
    try {
      const result = await api.updateAircraftMaster(row._id, toWrite(row));
      replaceRow(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this aircraft.');
    } finally {
      setSavingId(null);
    }
  };

  const addRow = async () => {
    setError('');
    try {
      const result = await api.createAircraftMaster({
        serialNo: '',
        aircraftType: '',
        icaoCode: '',
        mtowKg: '',
        passengerCapacity: '',
        manufacturer: '',
        aircraftBody: bodyFilter,
        wingspanM: '',
        description: '',
        active: '',
        category: categoryFilter,
        categoryCode: codeFilter,
        activeSecondary: 'Yes',
        ceilingRate: '',
        arrayRate: '',
        validTill: '',
      });
      setRows((current) => [result.data, ...current]);
      setExpandedIds((current) => new Set(current).add(result.data._id));
      setPage(0);
      setSearch('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add an aircraft.');
    }
  };

  const removeRow = async (row: AircraftMasterRecord) => {
    const label = row.aircraftType || row.description || 'this aircraft';
    if (!window.confirm(`Remove ${label} from the aircraft master?`)) return;
    setError('');
    try {
      await api.deleteAircraftMaster(row._id);
      setRows((current) => current.filter((item) => item._id !== row._id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove this aircraft.');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setBodyFilter('');
    setCategoryFilter('');
    setCodeFilter('');
    setStatusFilter('');
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
      const sheet = workbook.addWorksheet('Aircraft', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });
      sheet.addRow([...EXPORT_HEADERS]);
      const header = sheet.getRow(1);
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      header.alignment = { vertical: 'middle', wrapText: true };
      for (const row of filtered) {
        sheet.addRow([
          row.serialNo,
          row.aircraftType,
          row.manufacturer,
          row.aircraftBody,
          row.icaoCode,
          row.wingspanM,
          row.mtowKg,
          row.passengerCapacity,
          row.description,
          row.active,
          row.category,
          row.categoryCode,
          row.activeSecondary,
          row.ceilingRate,
          row.arrayRate,
          row.validTill,
        ]);
      }
      sheet.columns.forEach((column, index) => {
        column.width = index === 8 ? 56 : 20;
      });
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'aircraft-master.xlsx';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export aircraft master.');
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
      const sheet =
        workbook.worksheets.find((item) => item.name.trim().toLowerCase() === 'aircraft') ??
        workbook.worksheets[0];
      if (!sheet) throw new Error('The file has no sheet.');
      const headerRow = sheet.getRow(1);
      const headers = headerRow.values as Array<string | undefined>;
      const hasType = headers.some((header) => normalizeHeader(header) === 'aircraft type');
      if (!hasType) {
        throw new Error('The sheet needs an Aircraft Type column. Export a file to see the layout.');
      }
      const parsed: AircraftMasterWrite[] = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const values = row.values as unknown[];
        const record: AircraftMasterWrite = {
          serialNo: '',
          aircraftType: '',
          icaoCode: '',
          mtowKg: '',
          passengerCapacity: '',
          manufacturer: '',
          aircraftBody: '',
          wingspanM: '',
          description: '',
          active: '',
          category: '',
          categoryCode: '',
          activeSecondary: '',
          ceilingRate: '',
          arrayRate: '',
          validTill: '',
        };
        let statusSeen = 0;
        let categorySeen = 0;
        for (let index = 1; index < headers.length; index += 1) {
          const key = normalizeHeader(headers[index]);
          if (!key) continue;
          let field: keyof AircraftMasterWrite | undefined;
          if (key === 'status') field = statusSeen++ === 0 ? 'active' : 'activeSecondary';
          else if (key === 'category') field = categorySeen++ === 0 ? 'category' : 'categoryCode';
          else field = HEADER_FIELD[key];
          if (!field || record[field]) continue;
          record[field] = textValue(values[index]);
        }
        if (Object.values(record).some((value) => value.trim())) parsed.push(record);
      });
      const result = await api.importAircraftMaster(parsed);
      await load();
      window.alert(`Imported ${result.data.created} new and updated ${result.data.updated}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import aircraft.');
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  return (
    <>
      <BillingPageHeader
        title="Aircraft Master"
        description="The shared aircraft catalog. Types, bodies, and categories are available to every station. Invoices do not read this page."
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
              Add aircraft
            </button>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="In catalog" value={loading ? '—' : String(stats.total)} detail="Aircraft types shared by every station" />
        <Stat label="Manufacturers" value={loading ? '—' : String(manufacturerCount)} detail={`${stats.bodies} aircraft bodies`} />
        <Stat
          label="Inactive"
          value={loading ? '—' : String(stats.inactive)}
          detail="Marked No in the status column"
          tone="info"
        />
        <Stat
          label="Needs attention"
          value={loading ? '—' : String(stats.missingDescription + stats.missingIcao)}
          detail={`${stats.missingDescription} without a description · ${stats.missingIcao} without an ICAO code`}
          tone={stats.missingDescription + stats.missingIcao > 0 ? 'warning' : 'success'}
        />
      </div>

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
              <span className={`block leading-none ${billingUi.sectionTitle}`}>Find aircraft</span>
              <span className={`mt-1 block truncate ${billingUi.sectionDesc}`}>
                {filtersActive
                  ? 'Filters are on. Export uses this result.'
                  : 'Search, body, category, code, and status.'}
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
              <div className="grid items-end gap-x-3 gap-y-3 md:grid-cols-2 xl:grid-cols-5">
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
                      placeholder="Type, manufacturer, ICAO, or description"
                      className={`${inputClass} h-10 pl-9`}
                    />
                  </span>
                </label>
                <FilterSelect
                  label="Aircraft body"
                  value={bodyFilter}
                  onChange={setBodyFilter}
                  allLabel="All bodies"
                  options={bodyOptions}
                  onPage={() => setPage(0)}
                />
                <FilterSelect
                  label="Category"
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  allLabel="All categories"
                  options={categoryOptions}
                  onPage={() => setPage(0)}
                />
                <FilterSelect
                  label="Category code"
                  value={codeFilter}
                  onChange={setCodeFilter}
                  allLabel="All codes"
                  options={codeOptions}
                  onPage={() => setPage(0)}
                />
                <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium leading-4 text-[color:var(--billing-text-secondary)]">
                  Status
                  <select
                    value={statusFilter}
                    onChange={(event) => {
                      setStatusFilter(event.target.value);
                      setPage(0);
                    }}
                    className={selectClass}
                  >
                    <option value="">All statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="missing">Missing status</option>
                  </select>
                </label>
              </div>
              <div className="mt-4 flex min-h-9 flex-wrap items-center gap-2" role="group" aria-label="Catalog status">
                {(
                  [
                    ['all', 'All aircraft'],
                    ['missing-description', 'Missing description'],
                    ['missing-icao', 'Missing ICAO'],
                    ['inactive', 'Inactive'],
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
              {bodyOptions.length > 0 ? (
                <div className="mt-3 flex min-h-8 flex-wrap items-center gap-2">
                  <span className="w-10 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--billing-text-muted)]">
                    Body
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setBodyFilter('');
                      setPage(0);
                    }}
                    className={`h-7 items-center ${!bodyFilter ? billingUi.badgeSuccess : billingUi.badgeNeutral}`}
                  >
                    All
                  </button>
                  {bodyOptions.map((body) => (
                    <button
                      key={body}
                      type="button"
                      onClick={() => {
                        setBodyFilter(body);
                        setPage(0);
                      }}
                      className={`h-7 items-center transition-transform duration-200 hover:-translate-y-px ${bodyFilter === body ? billingUi.badgeSuccess : bodyTone(body)}`}
                    >
                      {body}
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
            {filtered.length === 1 ? ' aircraft' : ' aircraft'}
            {filtered.length !== rows.length ? ` of ${rows.length}` : ''}
          </p>
          <p className="hidden text-xs text-[color:var(--billing-text-muted)] sm:block">
            Fields save when you leave them. Open a row for weights, capacity, and rates.
          </p>
        </div>
        <div className="billing-table-scroll max-h-[70vh] overflow-auto">
          <table className={`${billingUi.table} min-w-[72rem]`}>
            <thead className="sticky top-0 z-10 bg-[color:var(--billing-surface-muted)]">
              <tr>
                <th className={`${billingUi.tableHeadCell} w-12`} aria-label="Expand" />
                <th className={`${billingUi.tableHeadCell} min-w-[9rem]`}>Aircraft type</th>
                <th className={`${billingUi.tableHeadCell} min-w-[10rem]`}>Manufacturer</th>
                <th className={`${billingUi.tableHeadCell} min-w-[9rem]`}>Body</th>
                <th className={`${billingUi.tableHeadCell} min-w-[7rem]`}>ICAO</th>
                <th className={`${billingUi.tableHeadCell} min-w-[11rem]`}>Category</th>
                <th className={`${billingUi.tableHeadCell} w-24`}>Code</th>
                <th className={`${billingUi.tableHeadCell} w-28`}>Status</th>
                <th className={`${billingUi.tableHeadCell} w-16`} />
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--billing-border)] bg-[color:var(--billing-surface)]">
              {loading ? (
                <tr>
                  <td colSpan={9} className={billingUi.tableEmpty}>
                    Loading aircraft master…
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={9} className={billingUi.tableEmpty}>
                    <span className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-[color:var(--billing-surface-muted)]">
                      <Plane className="h-5 w-5" aria-hidden />
                    </span>
                    No aircraft match these filters.
                  </td>
                </tr>
              ) : (
                visible.map((row) => (
                  <AircraftMasterRows
                    key={row._id}
                    row={row}
                    busy={savingId === row._id}
                    expanded={expandedIds.has(row._id)}
                    onToggle={() => toggleExpanded(row._id)}
                    onPatch={(patch) => patchLocal(row._id, patch)}
                    onSave={(next) => void saveRow(next)}
                    onRemove={() => void removeRow(row)}
                  />
                ))
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
      <datalist id="aircraft-master-bodies">
        {bodyOptions.map((body) => (
          <option key={body} value={body} />
        ))}
      </datalist>
      <datalist id="aircraft-master-categories">
        {categoryOptions.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
      <datalist id="aircraft-master-codes">
        {codeOptions.map((code) => (
          <option key={code} value={code} />
        ))}
      </datalist>
    </>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  allLabel,
  options,
  onPage,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: string[];
  onPage: () => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium leading-4 text-[color:var(--billing-text-secondary)]">
      {label}
      <select
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          onPage();
        }}
        className={selectClass}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
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

function Field({
  label,
  value,
  disabled,
  onChange,
  onBlur,
  list,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
  list?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-[color:var(--billing-text-secondary)]">
      {label}
      <input
        value={value}
        disabled={disabled}
        list={list}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onBlur(event.target.value)}
        className={inputClass}
      />
    </label>
  );
}

function AircraftMasterRows({
  row,
  busy,
  expanded,
  onToggle,
  onPatch,
  onSave,
  onRemove,
}: {
  row: AircraftMasterRecord;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<AircraftMasterRecord>) => void;
  onSave: (next: AircraftMasterRecord) => void;
  onRemove: () => void;
}) {
  const label = row.aircraftType || row.manufacturer || 'this aircraft';
  return (
    <>
      <tr className={expanded ? 'bg-[color:var(--billing-accent-soft)]' : 'hover:bg-[color:var(--billing-surface-muted)]'}>
        <td className="px-2 py-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
            title={expanded ? 'Hide details' : 'Show details'}
            className={billingUi.iconAction}
          >
            <ChevronDown className={`h-4 w-4 transition ${expanded ? '' : '-rotate-90'}`} aria-hidden />
          </button>
        </td>
        <td className="px-3 py-2">
          <input
            value={row.aircraftType}
            disabled={busy}
            aria-label={`Aircraft type ${label}`}
            onChange={(event) => onPatch({ aircraftType: event.target.value })}
            onBlur={(event) => onSave({ ...row, aircraftType: event.target.value })}
            className={`${inputClass} min-w-[8rem] font-semibold tracking-wide`}
          />
        </td>
        <td className="px-3 py-2">
          <input
            value={row.manufacturer}
            disabled={busy}
            aria-label={`Manufacturer for ${label}`}
            onChange={(event) => onPatch({ manufacturer: event.target.value })}
            onBlur={(event) => onSave({ ...row, manufacturer: event.target.value })}
            className={`${inputClass} min-w-[8rem]`}
          />
        </td>
        <td className="px-3 py-2">
          <input
            value={row.aircraftBody}
            disabled={busy}
            list="aircraft-master-bodies"
            aria-label={`Body for ${label}`}
            onChange={(event) => onPatch({ aircraftBody: event.target.value })}
            onBlur={(event) => onSave({ ...row, aircraftBody: event.target.value })}
            className={`${inputClass} min-w-[8rem]`}
          />
        </td>
        <td className="px-3 py-2">
          <input
            value={row.icaoCode}
            disabled={busy}
            aria-label={`ICAO code for ${label}`}
            onChange={(event) => onPatch({ icaoCode: event.target.value })}
            onBlur={(event) => onSave({ ...row, icaoCode: event.target.value })}
            className={`${inputClass} min-w-[5rem]`}
          />
        </td>
        <td className="px-3 py-2">
          <input
            value={row.category}
            disabled={busy}
            list="aircraft-master-categories"
            aria-label={`Category for ${label}`}
            onChange={(event) => onPatch({ category: event.target.value })}
            onBlur={(event) => onSave({ ...row, category: event.target.value })}
            className={`${inputClass} min-w-[9rem]`}
          />
        </td>
        <td className="px-3 py-2">
          <input
            value={row.categoryCode}
            disabled={busy}
            list="aircraft-master-codes"
            aria-label={`Category code for ${label}`}
            onChange={(event) => onPatch({ categoryCode: event.target.value })}
            onBlur={(event) => onSave({ ...row, categoryCode: event.target.value })}
            className={`${inputClass} w-20`}
          />
        </td>
        <td className="px-3 py-2">
          <select
            value={row.activeSecondary || ''}
            disabled={busy}
            aria-label={`Status for ${label}`}
            onChange={(event) => {
              const next = { ...row, activeSecondary: event.target.value };
              onPatch({ activeSecondary: event.target.value });
              onSave(next);
            }}
            className={selectClass}
          >
            <option value="">—</option>
            {!['', 'Yes', 'No'].includes(row.activeSecondary) ? (
              <option value={row.activeSecondary}>{statusLabel(row)}</option>
            ) : null}
            <option value="Yes">Active</option>
            <option value="No">Inactive</option>
          </select>
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
          <td colSpan={8} className="px-3 pb-4 pt-1">
            <div className="rounded-[var(--billing-radius-xl)] border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] p-4 shadow-[var(--billing-shadow-sm)]">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className={billingUi.sectionTitle}>Aircraft details</p>
                  <p className={billingUi.sectionDesc}>{label}</p>
                </div>
                {busy ? <span className="text-xs text-[color:var(--billing-text-muted)]">Saving…</span> : null}
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Field
                  label="Serial no."
                  value={row.serialNo}
                  disabled={busy}
                  onChange={(value) => onPatch({ serialNo: value })}
                  onBlur={(value) => onSave({ ...row, serialNo: value })}
                />
                <Field
                  label="MTOW (kg)"
                  value={row.mtowKg}
                  disabled={busy}
                  onChange={(value) => onPatch({ mtowKg: value })}
                  onBlur={(value) => onSave({ ...row, mtowKg: value })}
                />
                <Field
                  label="Passenger capacity"
                  value={row.passengerCapacity}
                  disabled={busy}
                  onChange={(value) => onPatch({ passengerCapacity: value })}
                  onBlur={(value) => onSave({ ...row, passengerCapacity: value })}
                />
                <Field
                  label="Wingspan (m)"
                  value={row.wingspanM}
                  disabled={busy}
                  onChange={(value) => onPatch({ wingspanM: value })}
                  onBlur={(value) => onSave({ ...row, wingspanM: value })}
                />
                <Field
                  label="Ceiling rate"
                  value={row.ceilingRate}
                  disabled={busy}
                  onChange={(value) => onPatch({ ceilingRate: value })}
                  onBlur={(value) => onSave({ ...row, ceilingRate: value })}
                />
                <Field
                  label="Aera rates"
                  value={row.arrayRate}
                  disabled={busy}
                  onChange={(value) => onPatch({ arrayRate: value })}
                  onBlur={(value) => onSave({ ...row, arrayRate: value })}
                />
                <Field
                  label="Valid till"
                  value={row.validTill}
                  disabled={busy}
                  onChange={(value) => onPatch({ validTill: value })}
                  onBlur={(value) => onSave({ ...row, validTill: value })}
                />
                <Field
                  label="Other status"
                  value={row.active}
                  disabled={busy}
                  onChange={(value) => onPatch({ active: value })}
                  onBlur={(value) => onSave({ ...row, active: value })}
                />
              </div>
              <label className="mt-3 flex flex-col gap-1.5 text-xs font-medium text-[color:var(--billing-text-secondary)]">
                Description
                <textarea
                  value={row.description}
                  disabled={busy}
                  rows={3}
                  aria-label={`Description for ${label}`}
                  onChange={(event) => onPatch({ description: event.target.value })}
                  onBlur={(event) => onSave({ ...row, description: event.target.value })}
                  className={`${inputClass} min-h-[4.5rem] py-2`}
                />
              </label>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
