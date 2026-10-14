'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BillingPageHeader } from '../BillingLayout';
import { MasterSectionTabs } from '../MasterSectionTabs';
import { BillingDataTable } from '../BillingDataTable';
import { StatusBadge } from '../StatusBadge';
import { ServiceCatalogFormDialog } from './ServiceCatalogFormDialog';
import { ServiceCatalogDeleteDialog, type ServiceCatalogDeleteMode } from './ServiceCatalogDeleteDialog';
import { TableEditButton } from '../TableEditButton';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingServiceCatalogItem } from '@/lib/billing-shared/types';
import {
  dedupeServiceCatalogItems,
  formatServiceCatalogDisplayCode,
  serviceCatalogCodesForDisplayKey,
} from '@/lib/billing-shared/service-catalog-labels';

type Props = { api: BillingApi };

type BulkDeleteResult = {
  deleted: number;
  failed: Array<{ serviceCode: string; message: string }>;
  requested: number;
};

function serviceCodeTableLabel(code: string): string {
  const formatted = formatServiceCatalogDisplayCode(code) || code;
  return formatted.replace(
    /^(equipment|manpower|flight|service|services)\s*-\s*/i,
    '',
  );
}

/**
 * BC: Items
 * Audit: BC_SCREEN_INVENTORY.md §A2
 * FRIS: /billing/service-catalog
 * Collection: billing (docType: service_catalog)
 */
export function ServiceCatalogPage({ api }: Props) {
  const [rows, setRows] = useState<BillingServiceCatalogItem[]>([]);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<BillingServiceCatalogItem | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<BillingServiceCatalogItem | null>(null);
  const [deleteMode, setDeleteMode] = useState<ServiceCatalogDeleteMode>('single');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const dialogOpen = createOpen || editRecord != null;
  const closeDialog = () => {
    setCreateOpen(false);
    setEditRecord(null);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.listServiceCatalog({
        category: category || undefined,
        search: search.trim() || undefined,
      });
      const data = res.data as { items?: BillingServiceCatalogItem[] };
      setRows(data.items ?? []);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load catalog');
    } finally {
      setLoading(false);
    }
  }, [api, category, search]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Unique Equipment / Manpower / Flight rows for the table (twins collapsed). */
  const displayRows = useMemo(() => dedupeServiceCatalogItems(rows), [rows]);

  const allSelected =
    displayRows.length > 0 && displayRows.every((r) => selected.has(r.serviceCode));
  const someSelected = selected.size > 0 && !allSelected;

  const toggleSelect = (serviceCode: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(serviceCode)) next.delete(serviceCode);
      else next.add(serviceCode);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(displayRows.map((r) => r.serviceCode)));
  };

  const openDeleteDialog = (
    mode: ServiceCatalogDeleteMode,
    record: BillingServiceCatalogItem | null = null,
  ) => {
    setDeleteMode(mode);
    setDeleteRecord(record);
    setDeleteDialogOpen(true);
  };

  const codesForSelectedDisplayRows = useMemo(() => {
    const codes = new Set<string>();
    for (const code of selected) {
      for (const twin of serviceCatalogCodesForDisplayKey(rows, code)) {
        codes.add(twin);
      }
    }
    return [...codes];
  }, [rows, selected]);

  const deleteCount = useMemo(() => {
    if (deleteMode === 'single' && deleteRecord) {
      return Math.max(
        1,
        serviceCatalogCodesForDisplayKey(rows, deleteRecord.serviceCode).length,
      );
    }
    if (deleteMode === 'selected') {
      return Math.max(selected.size, codesForSelectedDisplayRows.length);
    }
    return rows.length;
  }, [codesForSelectedDisplayRows.length, deleteMode, deleteRecord, rows, selected.size]);

  const reportBulkResult = (result: BulkDeleteResult) => {
    const { deleted, failed, requested } = result;
    if (failed.length === 0) {
      setSuccess(`Deleted ${deleted} service${deleted === 1 ? '' : 's'}.`);
      return;
    }
    const skipped = failed
      .slice(0, 3)
      .map((f) => formatServiceCatalogDisplayCode(f.serviceCode) || f.serviceCode)
      .join(', ');
    const more = failed.length > 3 ? ` +${failed.length - 3} more` : '';
    setSuccess(`Deleted ${deleted} of ${requested}. Skipped: ${skipped}${more}.`);
    setError(failed[0]?.message ?? 'Some services could not be deleted.');
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setError('');
    setSuccess('');
    try {
      if (deleteMode === 'single' && deleteRecord) {
        const twinCodes = serviceCatalogCodesForDisplayKey(rows, deleteRecord.serviceCode);
        const codes = twinCodes.length > 0 ? twinCodes : [deleteRecord.serviceCode];
        if (codes.length === 1) {
          await api.deleteServiceCatalog(codes[0]!);
          setSuccess(
            `Deleted ${formatServiceCatalogDisplayCode(deleteRecord.serviceCode) || deleteRecord.serviceCode}.`,
          );
        } else {
          const res = await api.bulkDeleteServiceCatalog(codes);
          reportBulkResult((res as { data: BulkDeleteResult }).data);
        }
      } else if (deleteMode === 'selected') {
        const codes =
          codesForSelectedDisplayRows.length > 0
            ? codesForSelectedDisplayRows
            : [...selected];
        const res = await api.bulkDeleteServiceCatalog(codes);
        reportBulkResult((res as { data: BulkDeleteResult }).data);
      } else {
        const res = await api.deleteAllServiceCatalog();
        reportBulkResult((res as { data: BulkDeleteResult }).data);
      }
      setDeleteDialogOpen(false);
      setDeleteRecord(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete service(s)');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <MasterSectionTabs group="customers" />
      <BillingPageHeader
        title="Service catalog"
        description="Unique equipment, manpower, and service names for rate cards. Scheduled / RAF / Non-Scheduled twins are shown once."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={selected.size === 0}
              onClick={() => openDeleteDialog('selected')}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Delete selected{selected.size > 0 ? ` (${selected.size})` : ''}
            </button>
            <button
              type="button"
              disabled={displayRows.length === 0}
              onClick={() => openDeleteDialog('all')}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Delete all
            </button>
            <button
              type="button"
              onClick={() => {
                setEditRecord(null);
                setCreateOpen(true);
              }}
              className="rounded-lg bg-[color:var(--billing-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)]"
            >
              New service
            </button>
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
          <option value="scheduled">Scheduled</option>
          <option value="equipment">Equipment</option>
          <option value="manpower">Manpower</option>
          <option value="raf">RAF</option>
          <option value="cleaning">Cleaning</option>
          <option value="non_scheduled">Non-scheduled</option>
          <option value="delay">Delay</option>
          <option value="xxld">XXLD</option>
        </select>
        <input
          type="search"
          placeholder="Search code or description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50"
        >
          Search
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mb-4 rounded-lg border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] px-4 py-3 text-sm text-[color:var(--billing-heading)]">
          {success}
        </div>
      ) : null}

      <BillingDataTable
        loading={loading}
        rows={displayRows}
        getRowKey={(r) => r.serviceCode}
        emptyMessage="Catalog empty — add services with New service"
        columns={[
          {
            key: 'select',
            header: (
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={toggleSelectAll}
                aria-label="Select all services"
              />
            ),
            className: 'w-10',
            render: (r) => (
              <input
                type="checkbox"
                checked={selected.has(r.serviceCode)}
                onChange={() => toggleSelect(r.serviceCode)}
                aria-label={`Select ${formatServiceCatalogDisplayCode(r.serviceCode) || r.serviceCode}`}
              />
            ),
          },
          {
            key: 'code',
            header: 'Service code',
            render: (r) => (
              <span title={r.serviceCode}>
                {serviceCodeTableLabel(r.serviceCode)}
              </span>
            ),
          },
          { key: 'cat', header: 'Category', render: (r) => r.category },
          { key: 'uom', header: 'UOM', render: (r) => r.uom },
          {
            key: 'sac',
            header: 'SAC code',
            render: (r) => r.sacCode?.trim() || '—',
          },
          {
            key: 'active',
            header: 'Active',
            render: (r) => <StatusBadge status={r.active ? 'active' : 'expired'} />,
          },
          {
            key: 'actions',
            header: '',
            render: (r) => (
              <div className="flex flex-wrap items-center gap-3">
                <TableEditButton
                  onClick={() => {
                    setCreateOpen(false);
                    setEditRecord(r);
                  }}
                />
                <button
                  type="button"
                  onClick={() => openDeleteDialog('single', r)}
                  className="text-sm font-medium text-red-600 hover:text-red-800"
                >
                  Delete
                </button>
              </div>
            ),
          },
        ]}
      />

      <ServiceCatalogFormDialog
        api={api}
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        record={editRecord}
        onSaved={() => {
          setSuccess(editRecord ? 'Service updated.' : 'Service created for your station.');
          void load();
        }}
      />

      <ServiceCatalogDeleteDialog
        mode={deleteMode}
        record={deleteRecord}
        count={deleteCount}
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setDeleteDialogOpen(false);
            setDeleteRecord(null);
          }
        }}
        onConfirm={() => void confirmDelete()}
        deleting={deleting}
      />
    </>
  );
}
