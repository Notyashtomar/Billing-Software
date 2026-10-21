// @ts-nocheck
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BillingPageHeader } from '../BillingLayout';
import { BillingDataTable } from '../BillingDataTable';
import { StatusBadge } from '../StatusBadge';
import { CustomerFormDialog } from './CustomerFormDialog';
import { CustomerAnnexureDialog } from './CustomerAnnexureDialog';
import { CustomerDeleteDialog, type CustomerDeleteMode } from './CustomerDeleteDialog';
import { TableEditButton } from '../TableEditButton';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingCustomer } from '@/lib/billing-shared/types';
import {
  expandCustomersForDisplay,
} from '@/lib/billing-shared/expand-customers-for-display';
import { downloadCustomerTemplate, parseCustomerWorkbook } from './customerImport';
import { MasterSectionTabs } from '../MasterSectionTabs';

type Props = { api: BillingApi };

type BulkDeleteResult = {
  deleted: number;
  failed: Array<{ id: string; customerCode?: string; message: string }>;
  requested: number;
};

/**
 * BC: Customers
 * Audit: BC_SCREEN_INVENTORY.md §A1
 * FRIS: /billing/customers
 * API: GET /billing/customers
 * Collection: billing_customers
 */
export function CustomersPage({ api }: Props) {
  const [rows, setRows] = useState<BillingCustomer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<BillingCustomer | null>(null);
  const [annexureRecord, setAnnexureRecord] = useState<BillingCustomer | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<BillingCustomer | null>(null);
  const [deleteMode, setDeleteMode] = useState<CustomerDeleteMode>('single');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panToggleBusyId, setPanToggleBusyId] = useState<string | null>(null);
  const [vatToggleBusyId, setVatToggleBusyId] = useState<string | null>(null);
  const dialogOpen = createOpen || editRecord != null;
  const closeDialog = () => {
    setCreateOpen(false);
    setEditRecord(null);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.listCustomers({ search: search || undefined, limit: 200 });
      setRows((res.data as BillingCustomer[]) ?? []);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [api, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayRows = useMemo(() => expandCustomersForDisplay(rows), [rows]);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(rows.map((r) => r._id)));
  };

  const toggleShowPanOnInvoice = async (customer: BillingCustomer, next: boolean) => {
    if (customer.showPanOnInvoice === next) return;
    setPanToggleBusyId(customer._id);
    setError('');
    setSuccess('');
    try {
      await api.updateCustomer(customer._id, { showPanOnInvoice: next });
      setRows((prev) =>
        prev.map((row) =>
          row._id === customer._id ? { ...row, showPanOnInvoice: next } : row,
        ),
      );
      setSuccess(
        next
          ? `PAN will print on invoices for ${customer.customerCode}.`
          : `PAN hidden on invoices for ${customer.customerCode}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update PAN setting');
    } finally {
      setPanToggleBusyId(null);
    }
  };

  const toggleShowVatOnInvoice = async (customer: BillingCustomer, next: boolean) => {
    if (customer.showVatOnInvoice === next) return;
    setVatToggleBusyId(customer._id);
    setError('');
    setSuccess('');
    try {
      await api.updateCustomer(customer._id, { showVatOnInvoice: next });
      setRows((prev) =>
        prev.map((row) =>
          row._id === customer._id ? { ...row, showVatOnInvoice: next } : row,
        ),
      );
      setSuccess(
        next
          ? `VAT will print on invoices for ${customer.customerCode}.`
          : `VAT hidden on invoices for ${customer.customerCode}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update VAT setting');
    } finally {
      setVatToggleBusyId(null);
    }
  };

  const openDeleteDialog = (mode: CustomerDeleteMode, record: BillingCustomer | null = null) => {
    setDeleteMode(mode);
    setDeleteRecord(record);
    setDeleteDialogOpen(true);
  };

  const deleteCount = useMemo(() => {
    if (deleteMode === 'single') return 1;
    if (deleteMode === 'selected') return selected.size;
    return rows.length;
  }, [deleteMode, selected.size, rows.length]);

  const reportBulkResult = (result: BulkDeleteResult) => {
    const { deleted, failed, requested } = result;
    if (failed.length === 0) {
      setSuccess(`Deleted ${deleted} customer${deleted === 1 ? '' : 's'}.`);
      return;
    }
    const skipped = failed
      .slice(0, 3)
      .map((f) => f.customerCode ?? f.id)
      .join(', ');
    const more = failed.length > 3 ? ` +${failed.length - 3} more` : '';
    setSuccess(`Deleted ${deleted} of ${requested}. Skipped: ${skipped}${more}.`);
    setError(failed[0]?.message ?? 'Some customers could not be deleted.');
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setError('');
    setSuccess('');
    try {
      if (deleteMode === 'single' && deleteRecord) {
        await api.deleteCustomer(deleteRecord._id);
        setSuccess(`Deleted ${deleteRecord.customerCode}.`);
      } else if (deleteMode === 'selected') {
        const res = await api.bulkDeleteCustomers([...selected]);
        reportBulkResult((res as { data: BulkDeleteResult }).data);
      } else {
        const res = await api.deleteAllCustomers();
        reportBulkResult((res as { data: BulkDeleteResult }).data);
      }
      setDeleteDialogOpen(false);
      setDeleteRecord(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete customer(s)');
    } finally {
      setDeleting(false);
    }
  };

  const importWorkbook = async (file: File) => {
    setImporting(true);
    setError('');
    setSuccess('');
    try {
      const imported = await parseCustomerWorkbook(file);
      const failures: string[] = [];
      let created = 0;
      for (const row of imported) {
        try {
          await api.createCustomer({
            customerCode: row.customerCode,
            name: row.name,
            currencyCode: row.currencyCode,
            showPanOnInvoice: row.showPanOnInvoice,
            showVatOnInvoice: row.showVatOnInvoice,
            active: true,
          });
          created += 1;
        } catch (error) {
          failures.push(
            `${row.customerCode}: ${error instanceof Error ? error.message : 'Could not save this customer.'}`,
          );
        }
      }
      await load();
      if (failures.length > 0) {
        setError(failures.join('\n'));
        setSuccess(
          created > 0
            ? `Imported ${created} of ${imported.length} customers. Fix the rows below and import them again.`
            : '',
        );
        return;
      }
      setSuccess(`Imported ${created} customer${created === 1 ? '' : 's'}.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not read the customer workbook.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <MasterSectionTabs group="customers" />
      <BillingPageHeader
        title="Customers"
        description="Airline billing master — maps to BC Sell-to Customer"
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
              disabled={rows.length === 0}
              onClick={() => openDeleteDialog('all')}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Delete all
            </button>
            <button
              type="button"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
              onClick={() => void downloadCustomerTemplate()}
            >
              Download template
            </button>
            <label className="inline-flex cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50">
              {importing ? 'Importing…' : 'Import Excel'}
              <input
                type="file"
                accept=".xlsx,.xls"
                className="sr-only"
                disabled={importing}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void importWorkbook(file);
                }}
              />
            </label>
            <button
              type="button"
              className="rounded-lg bg-[color:var(--billing-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)]"
              onClick={() => {
                setEditRecord(null);
                setCreateOpen(true);
              }}
            >
              New customer
            </button>
          </div>
        }
      />
      <div className="mb-4 flex gap-2">
        <input
          type="search"
          placeholder="Search code or name…"
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
        <div className="mb-4 whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mb-4 rounded-lg border border-[color:var(--billing-accent-border)] bg-[color:var(--billing-accent-soft)] px-4 py-3 text-sm text-[color:var(--billing-accent-strong)]">
          {success}
        </div>
      ) : null}
      <BillingDataTable
        loading={loading}
        rows={displayRows}
        getRowKey={(r) => r.rowKey}
        emptyMessage="No customers — import an Excel file or create one"
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
                aria-label="Select all customers"
              />
            ),
            className: 'w-10',
            render: (r) => (
              <input
                type="checkbox"
                checked={selected.has(r._id)}
                onChange={() => toggleSelect(r._id)}
                aria-label={`Select ${r.customerCode}`}
              />
            ),
          },
          { key: 'code', header: 'Code', render: (r) => r.customerCode },
          { key: 'name', header: 'Airline name', render: (r) => r.name },
          { key: 'currency', header: 'Currency', render: (r) => r.currencyCode },
          {
            key: 'showPan',
            header: 'PAN on invoice',
            render: (r) => {
              const on = r.showPanOnInvoice === true;
              const busy = panToggleBusyId === r._id;
              return (
                <label
                  className="inline-flex cursor-pointer items-center gap-2"
                  title={
                    on
                      ? 'PAN prints on BHS / ADS / RAF invoices'
                      : 'PAN hidden on invoices (default)'
                  }
                >
                  <span className="sr-only">
                    {on ? 'Hide' : 'Show'} PAN on invoices for {r.customerCode}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    disabled={busy}
                    onClick={() => void toggleShowPanOnInvoice(r, !on)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--billing-primary)] disabled:opacity-50 ${
                      on
                        ? 'bg-[color:var(--billing-primary)]'
                        : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        on ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className="text-xs font-medium text-gray-600">
                    {busy ? '…' : on ? 'On' : 'Off'}
                  </span>
                </label>
              );
            },
          },
          {
            key: 'showVat',
            header: 'VAT on invoice',
            render: (r) => {
              const on = r.showVatOnInvoice === true;
              const busy = vatToggleBusyId === r._id;
              return (
                <label
                  className="inline-flex cursor-pointer items-center gap-2"
                  title={
                    on
                      ? 'VAT number prints on BHS / ADS / RAF invoices'
                      : 'VAT hidden on invoices (default)'
                  }
                >
                  <span className="sr-only">
                    {on ? 'Hide' : 'Show'} VAT on invoices for {r.customerCode}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    disabled={busy}
                    onClick={() => void toggleShowVatOnInvoice(r, !on)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--billing-primary)] disabled:opacity-50 ${
                      on ? 'bg-[color:var(--billing-primary)]' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        on ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className="text-xs font-medium text-gray-600">
                    {busy ? '…' : on ? 'On' : 'Off'}
                  </span>
                </label>
              );
            },
          },
          {
            key: 'annexure',
            header: 'Annexure',
            render: (r) => {
              const saved = [
                r.annexures?.ads?.originalName ? 'ADS' : null,
                r.annexures?.bhs?.originalName ? 'BHS' : null,
              ].filter(Boolean);
              if (saved.length === 0) {
                return <span className="text-xs text-gray-400">—</span>;
              }
              return <span className="text-xs font-medium text-gray-700">{saved.join(' · ')}</span>;
            },
          },
          {
            key: 'status',
            header: 'Status',
            render: (r) =>
              r.blocked ? (
                <StatusBadge status="cancelled" />
              ) : r.active ? (
                <StatusBadge status="active" />
              ) : (
                <StatusBadge status="expired" />
              ),
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
                  onClick={() => setAnnexureRecord(r)}
                  className="text-sm font-medium text-[color:var(--billing-primary)] hover:underline"
                >
                  Annexure
                </button>
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
      <CustomerFormDialog
        api={api}
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        record={editRecord}
        onSaved={() => void load()}
      />
      <CustomerAnnexureDialog
        api={api}
        open={annexureRecord != null}
        customer={annexureRecord}
        onOpenChange={(open) => {
          if (!open) setAnnexureRecord(null);
        }}
        onUpdated={(updated) => {
          setRows((prev) => prev.map((row) => (row._id === updated._id ? { ...row, ...updated } : row)));
          setAnnexureRecord(updated);
        }}
      />
      <CustomerDeleteDialog
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
