// @ts-nocheck
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BillingPageHeader } from '../BillingLayout';
import { BillingDataTable } from '../BillingDataTable';
import { CustomerFormDialog } from './CustomerFormDialog';
import { CustomerDeleteDialog, type CustomerDeleteMode } from './CustomerDeleteDialog';
import { TableEditButton } from '../TableEditButton';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingCustomer } from '@/lib/billing-shared/types';
import {
  expandCustomersForDisplay,
} from '@/lib/billing-shared/expand-customers-for-display';
import { downloadCustomerTemplate, parseCustomerWorkbook } from './customerImport';
import { MasterSectionTabs } from '../MasterSectionTabs';
import { billingUi } from '../billingUi';

type Props = { api: BillingApi };

function ColumnTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <span className="inline-flex flex-col gap-0.5 normal-case tracking-normal">
      <span>{title}</span>
      <span className="text-[10px] font-normal normal-case tracking-normal text-[color:var(--billing-text-muted)]">
        {hint}
      </span>
    </span>
  );
}

function PrintSettingSwitch({
  on,
  busy,
  onText,
  offText,
  title,
  label,
  needsDetails = false,
  onClick,
}: {
  on: boolean;
  busy: boolean;
  onText: string;
  offText: string;
  title: string;
  label: string;
  needsDetails?: boolean;
  onClick: () => void;
}) {
  const tone = !on
    ? 'border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] text-[color:var(--billing-text-muted)]'
    : needsDetails
      ? 'border-[color:var(--billing-warning-border)] bg-[color:var(--billing-warning-soft)] text-[color:var(--billing-warning)]'
      : 'border-[color:var(--billing-success-border)] bg-[color:var(--billing-success-soft)] text-[color:var(--billing-success)]';
  const track = !on
    ? 'bg-[color:var(--billing-text-muted)]'
    : needsDetails
      ? 'bg-[color:var(--billing-warning)]'
      : 'bg-[color:var(--billing-success)]';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={title}
      disabled={busy}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--billing-primary)] disabled:opacity-60 ${tone}`}
    >
      <span className={`relative h-4 w-7 shrink-0 rounded-full ${track}`} aria-hidden>
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-[color:var(--billing-surface)] shadow-sm transition-transform ${
            on ? 'left-3.5' : 'left-0.5'
          }`}
        />
      </span>
      {busy ? 'Saving…' : on ? onText : offText}
    </button>
  );
}

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
  const [deleteRecord, setDeleteRecord] = useState<BillingCustomer | null>(null);
  const [deleteMode, setDeleteMode] = useState<CustomerDeleteMode>('single');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panToggleBusyId, setPanToggleBusyId] = useState<string | null>(null);
  const [vatToggleBusyId, setVatToggleBusyId] = useState<string | null>(null);
  const [intermediaryToggleBusyId, setIntermediaryToggleBusyId] = useState<string | null>(null);
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

  const toggleIntermediaryAccount = async (customer: BillingCustomer, next: boolean) => {
    if (customer.intermediaryAccountEnabled === next) return;
    setIntermediaryToggleBusyId(customer._id);
    setError('');
    setSuccess('');
    try {
      await api.updateCustomer(customer._id, { intermediaryAccountEnabled: next });
      const updated = { ...customer, intermediaryAccountEnabled: next };
      setRows((prev) => prev.map((row) => (row._id === customer._id ? updated : row)));
      if (next) {
        setCreateOpen(false);
        setEditRecord(updated);
        setSuccess(
          `Intermediary account is on for ${customer.customerCode}. Enter the account details.`,
        );
      } else {
        setSuccess(`Intermediary account hidden on invoices for ${customer.customerCode}.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update intermediary account');
    } finally {
      setIntermediaryToggleBusyId(null);
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
      <p className="mb-3 text-sm text-[color:var(--billing-text-muted)]">
        One row is one airline. Print PAN, Print VAT, and Extra bank choose what is added to that airline’s invoice. Hidden is the usual setting.
      </p>
      <BillingDataTable
        footer={
          <span>
            {displayRows.length} airline{displayRows.length === 1 ? '' : 's'}
            {selected.size > 0 ? ` · ${selected.size} selected` : ''}
          </span>
        }
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
          {
            key: 'code',
            header: <ColumnTitle title="Code" hint="Airline" />,
            className: 'whitespace-nowrap',
            render: (r) => (
              <span className="inline-flex rounded-md bg-[color:var(--billing-primary-soft)] px-2 py-0.5 font-mono text-xs font-semibold tracking-wide text-[color:var(--billing-heading)]">
                {r.customerCode}
              </span>
            ),
          },
          {
            key: 'name',
            header: <ColumnTitle title="Airline" hint="Bill-to name" />,
            render: (r) => (
              <span className="font-medium text-[color:var(--billing-text)]">{r.name}</span>
            ),
          },
          {
            key: 'currency',
            header: <ColumnTitle title="Currency" hint="Invoice currency" />,
            className: 'whitespace-nowrap',
            render: (r) => (
              <span className={r.currencyCode === 'USD' ? billingUi.badgeInfo : billingUi.badgeSuccess}>
                {r.currencyCode}
              </span>
            ),
          },
          {
            key: 'ebc',
            header: <ColumnTitle title="EBC %" hint="Collection commission" />,
            className: 'whitespace-nowrap',
            render: (r) => {
              if (r.ebcCommissionEnabled !== true || !(Number(r.ebcCommissionPercent) > 0)) {
                return <span className="text-sm text-[color:var(--billing-text-muted)]">None</span>;
              }
              const mode =
                r.ebcCommissionMode === 'cash'
                  ? 'Cash only'
                  : r.ebcCommissionMode === 'card'
                    ? 'Card only'
                    : r.ebcCommissionMode === 'upi'
                      ? 'UPI only'
                      : 'All modes';
              return (
                <span className="inline-flex flex-col">
                  <span className="text-sm font-medium text-[color:var(--billing-text)]">
                    {r.ebcCommissionPercent}%
                  </span>
                  <span className="text-xs text-[color:var(--billing-text-muted)]">{mode}</span>
                </span>
              );
            },
          },
          {
            key: 'showPan',
            header: <ColumnTitle title="Print PAN" hint="On the invoice" />,
            className: 'whitespace-nowrap',
            render: (r) => {
              const on = r.showPanOnInvoice === true;
              return (
                <PrintSettingSwitch
                  on={on}
                  busy={panToggleBusyId === r._id}
                  onText="Prints"
                  offText="Hidden"
                  title={
                    on
                      ? 'PAN prints on BHS, ADS, and RAF invoices'
                      : 'PAN stays off the invoice'
                  }
                  label={`${on ? 'Hide' : 'Print'} PAN for ${r.customerCode}`}
                  onClick={() => void toggleShowPanOnInvoice(r, !on)}
                />
              );
            },
          },
          {
            key: 'showVat',
            header: <ColumnTitle title="Print VAT" hint="On the invoice" />,
            className: 'whitespace-nowrap',
            render: (r) => {
              const on = r.showVatOnInvoice === true;
              return (
                <PrintSettingSwitch
                  on={on}
                  busy={vatToggleBusyId === r._id}
                  onText="Prints"
                  offText="Hidden"
                  title={
                    on
                      ? 'VAT number prints on BHS, ADS, and RAF invoices'
                      : 'VAT stays off the invoice'
                  }
                  label={`${on ? 'Hide' : 'Print'} VAT for ${r.customerCode}`}
                  onClick={() => void toggleShowVatOnInvoice(r, !on)}
                />
              );
            },
          },
          {
            key: 'intermediary',
            header: <ColumnTitle title="Extra bank" hint="Besides the station account" />,
            className: 'whitespace-nowrap',
            render: (r) => {
              const on = r.intermediaryAccountEnabled === true;
              const account = r.intermediaryAccount?.accountNumber?.trim();
              return (
                <PrintSettingSwitch
                  on={on}
                  needsDetails={on && !account}
                  busy={intermediaryToggleBusyId === r._id}
                  onText={account ? 'Prints' : 'Add details'}
                  offText="Hidden"
                  title={
                    on
                      ? 'This account prints under the station bank on invoices'
                      : 'Invoice shows only the station bank account'
                  }
                  label={`${on ? 'Hide' : 'Show'} extra bank account for ${r.customerCode}`}
                  onClick={() => void toggleIntermediaryAccount(r, !on)}
                />
              );
            },
          },
          {
            key: 'status',
            header: <ColumnTitle title="Status" hint="Can be billed" />,
            className: 'whitespace-nowrap',
            render: (r) =>
              r.blocked ? (
                <span className={billingUi.badgeDanger}>Blocked</span>
              ) : r.active ? (
                <span className={billingUi.badgeSuccess}>Active</span>
              ) : (
                <span className={billingUi.badgeNeutral}>Inactive</span>
              ),
          },
          {
            key: 'actions',
            header: <span className="normal-case tracking-normal">Actions</span>,
            className: 'whitespace-nowrap',
            render: (r) => (
              <div className="flex items-center gap-3">
                <TableEditButton
                  onClick={() => {
                    setCreateOpen(false);
                    setEditRecord(r);
                  }}
                />
                <button
                  type="button"
                  onClick={() => openDeleteDialog('single', r)}
                  className="text-sm font-medium text-[color:var(--billing-danger)] hover:underline underline-offset-2"
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
