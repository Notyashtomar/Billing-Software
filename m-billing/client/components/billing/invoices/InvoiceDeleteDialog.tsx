'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { BillingInvoiceHeader } from '@/lib/billing-shared/types';

export type InvoiceDeleteMode = 'single' | 'selected';

type Props = {
  mode: InvoiceDeleteMode;
  variant: 'draft' | 'invoice';
  record: BillingInvoiceHeader | null;
  selected: BillingInvoiceHeader[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  deleting: boolean;
};

function labelFor(invoice: BillingInvoiceHeader) {
  return invoice.invoiceNumber ?? invoice.draftNumber ?? invoice.customerCode;
}

export function InvoiceDeleteDialog({
  mode,
  variant,
  record,
  selected,
  open,
  onOpenChange,
  onConfirm,
  deleting,
}: Props) {
  const count = mode === 'single' ? 1 : selected.length;
  const subject = variant === 'draft' ? 'draft' : 'invoice';
  const plural = count === 1 ? subject : `${subject}s`;

  const title =
    mode === 'single'
      ? `Delete ${variant === 'draft' ? 'draft' : 'invoice'}?`
      : `Delete ${count} selected ${plural}?`;

  const single = record ?? selected[0];
  const scopeRows = mode === 'single' ? (single ? [single] : []) : selected;
  const hasApprovedOrGenerated = scopeRows.some(
    (r) => r.status === 'approved' || r.status === 'generated',
  );
  const hasPosted = scopeRows.some((r) => r.status === 'posted');
  const statusNote = hasPosted
    ? ' Posted invoices cannot be deleted from this screen.'
    : hasApprovedOrGenerated
      ? ' Approved or generated invoices will be permanently removed.'
      : '';

  const description =
    mode === 'single' && single ? (
      <>
        This will permanently delete{' '}
        <span className="font-medium text-gray-900">{labelFor(single)}</span>
        {single.customerCode ? ` (${single.customerCode})` : ''}. Linked preparation flights
        return to ready-for-invoice.{statusNote}
      </>
    ) : (
      <>
        This will permanently delete{' '}
        <span className="font-medium text-gray-900">{count}</span> selected {plural}. Linked
        preparation flights return to ready-for-invoice.{statusNote}
      </>
    );

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
