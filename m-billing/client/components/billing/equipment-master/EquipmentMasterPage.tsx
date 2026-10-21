'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { BillingPageHeader } from '../BillingLayout';
import { billingUi } from '../billingUi';
import { getExcelJSModule } from '@/lib/dynamic-imports';
import type { BillingApi } from '@/lib/billing-api';
import type { EquipmentMasterRecord, EquipmentMasterUomRecord } from '@/lib/billing-api';

const PAGE_SIZE = 40;

const inputClass =
  'h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900 focus:border-[color:var(--billing-primary)] focus:outline-none';

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

export function EquipmentMasterPage({ api }: { api: BillingApi }) {
  const [rows, setRows] = useState<EquipmentMasterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [uomFilter, setUomFilter] = useState('');
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

  const typeOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of rows) {
      const type = row.unitType?.trim();
      if (type) values.add(type);
    }
    return [...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [rows]);

  const uomOptions = useMemo(() => {
    const values = new Map<string, string>();
    for (const row of rows) {
      for (const pair of row.uoms ?? []) {
        const uom = pair.uom?.trim();
        if (!uom) continue;
        const key = uom.toLowerCase();
        if (!values.has(key)) values.set(key, uom);
      }
    }
    return [...values.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [rows]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const type = typeFilter.trim().toLowerCase();
    const uom = uomFilter.trim().toLowerCase();
    return rows.filter((row) => {
      if (type && row.unitType.trim().toLowerCase() !== type) return false;
      if (uom && !(row.uoms ?? []).some((pair) => pair.uom.trim().toLowerCase() === uom)) {
        return false;
      }
      if (!query) return true;
      const haystack = [
        row.itemNo,
        row.description,
        row.unitType,
        ...(row.uoms ?? []).flatMap((pair) => [pair.uom, pair.abbreviation]),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [rows, search, typeFilter, uomFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

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
    setRows((current) =>
      current.map((row) => (row._id === id ? { ...row, ...patch } : row)),
    );
  };

  const saveRow = async (row: EquipmentMasterRecord) => {
    const pendingEmpty = (row.uoms ?? []).filter(
      (pair) => !pair.uom.trim() && !pair.abbreviation.trim(),
    );
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

  return (
    <>
      <BillingPageHeader
        title="Equipment Master"
        description="Global catalog for every station. Equipment, services, and manpower keep their own UOMs and abbreviations."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void exportRows()}
              disabled={exporting || filtered.length === 0}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting ? 'Exporting…' : 'Export'}
            </button>
            <button
              type="button"
              onClick={() => void addRow()}
              className="rounded-lg bg-[color:var(--billing-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)]"
            >
              Add equipment
            </button>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(12rem,0.8fr)_minmax(12rem,0.8fr)]">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Search
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            placeholder="Number, description, type, or UOM"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          Equipment type
          <select
            value={typeFilter}
            onChange={(event) => {
              setTypeFilter(event.target.value);
              setPage(0);
            }}
            className={inputClass}
          >
            <option value="">All types</option>
            {typeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
          UOM
          <select
            value={uomFilter}
            onChange={(event) => {
              setUomFilter(event.target.value);
              setPage(0);
            }}
            className={inputClass}
          >
            <option value="">All UOMs</option>
            {uomOptions.map((uom) => (
              <option key={uom} value={uom}>
                {uom}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className={billingUi.tableWrap}>
        <p className="billing-table-scroll-hint px-3 pt-3 sm:px-4">
          Each equipment is one row. Click the arrow to edit its UOMs and abbreviations. Other fields save when you leave them.
        </p>
        <div className="billing-table-scroll max-h-[70vh] overflow-auto">
          <table className={`${billingUi.table} min-w-[64rem]`}>
            <thead>
              <tr>
                <th className={`${billingUi.tableHeadCell} w-12`} aria-label="Expand" />
                <th className={`${billingUi.tableHeadCell} min-w-[8rem]`}>No.</th>
                <th className={`${billingUi.tableHeadCell} min-w-[16rem]`}>Description</th>
                <th className={`${billingUi.tableHeadCell} min-w-[11rem]`}>Equipment type</th>
                <th className={`${billingUi.tableHeadCell} min-w-[14rem]`}>UOM and abbreviation</th>
                <th className={`${billingUi.tableHeadCell} w-16`} />
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--billing-border)] bg-white">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                    Loading equipment master…
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--billing-border)] px-4 py-3 text-sm text-gray-600">
          <span>
            {filtered.length} equipment{filtered.length === 1 ? '' : 's'}
            {filtered.length !== rows.length ? ` of ${rows.length}` : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <span>
              Page {safePage + 1} of {pageCount}
            </span>
            <button
              type="button"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-40"
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
      <tr className={expanded ? 'bg-slate-50' : undefined}>
        <td className="px-2 py-1.5">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
            title={expanded ? 'Hide UOMs' : 'Show UOMs'}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden />
            )}
          </button>
        </td>
        <td className="px-3 py-1.5">
          <input
            value={row.itemNo}
            disabled={busy}
            aria-label={`Equipment number ${label}`}
            onChange={(event) => onPatch({ itemNo: event.target.value })}
            onBlur={(event) => onSave({ ...row, itemNo: event.target.value })}
            className={`${inputClass} min-w-[7rem]`}
          />
        </td>
        <td className="px-3 py-1.5">
          <input
            value={row.description}
            disabled={busy}
            aria-label={`Description for ${row.itemNo || 'new equipment'}`}
            onChange={(event) => onPatch({ description: event.target.value })}
            onBlur={(event) => onSave({ ...row, description: event.target.value })}
            className={`${inputClass} min-w-[14rem]`}
          />
        </td>
        <td className="px-3 py-1.5">
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
        <td className="px-3 py-1.5">
          <button
            type="button"
            onClick={onToggle}
            className="flex h-9 w-full min-w-[12rem] items-center justify-between gap-2 rounded-md border border-transparent px-2 text-left text-sm text-gray-800 hover:border-gray-300 hover:bg-white"
          >
            <span className="truncate">{uomSummary(uoms)}</span>
            {extraCount > 0 ? (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                +{extraCount}
              </span>
            ) : null}
          </button>
        </td>
        <td className="px-3 py-1.5">
          <button
            type="button"
            onClick={onRemove}
            className="text-sm font-medium text-red-600 hover:text-red-800"
          >
            Delete
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr className="bg-slate-50">
          <td />
          <td colSpan={5} className="px-3 pb-3 pt-1">
            <div className="max-w-3xl rounded-lg border border-gray-200 bg-white p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                UOMs and abbreviations
              </p>
              <div className="flex flex-col gap-2">
                {uoms.map((pair, index) => (
                  <div key={`${row._id}-uom-${index}`} className="flex items-center gap-2">
                    <input
                      value={pair.uom}
                      disabled={busy}
                      placeholder="UOM"
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
                      className={`${inputClass} min-w-[12rem]`}
                    />
                    <input
                      value={pair.abbreviation}
                      disabled={busy}
                      placeholder="Abbreviation"
                      aria-label={`Abbreviation ${index + 1} for ${label}`}
                      onChange={(event) => {
                        const next = uoms.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, abbreviation: event.target.value }
                            : item,
                        );
                        onPatch({ uoms: next });
                      }}
                      onBlur={(event) => {
                        const next = uoms.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, abbreviation: event.target.value }
                            : item,
                        );
                        onSave({ ...row, uoms: next });
                      }}
                      className={`${inputClass} min-w-[8rem]`}
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
                      className="rounded-md p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onPatch({ uoms: [...uoms, emptyUom()] })}
                  className="inline-flex w-fit items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
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
