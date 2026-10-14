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

export type InvoiceBinDialogAction = 'move' | 'restore';

type Props = {
  action: InvoiceBinDialogAction;
  selected: BillingInvoiceHeader[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  busy: boolean;
};

function labelFor(invoice: BillingInvoiceHeader) {
  return invoice.invoiceNumber ?? invoice.draftNumber ?? invoice.customerCode;
}

export function InvoiceBinDialog({
  action,
  selected,
  open,
  onOpenChange,
  onConfirm,
  busy,
}: Props) {
  const count = selected.length;
  const isMove = action === 'move';

  const title = isMove
    ? count === 1
      ? 'Move invoice to bin?'
      : `Move ${count} invoices to bin?`
    : count === 1
      ? 'Restore invoice from bin?'
      : `Restore ${count} invoices from bin?`;

  const single = selected[0];
  const description =
    count === 1 && single ? (
      isMove ? (
        <>
          <span className="font-medium text-gray-900">{labelFor(single)}</span>
          {single.customerCode ? ` (${single.customerCode})` : ''} will be hidden from drafts,
          review, and invoices. You can restore it later from the invoice bin.
        </>
      ) : (
        <>
          <span className="font-medium text-gray-900">{labelFor(single)}</span>
          {single.customerCode ? ` (${single.customerCode})` : ''} will return to the main
          workflow pages.
        </>
      )
    ) : isMove ? (
      <>
        <span className="font-medium text-gray-900">{count}</span> selected invoices will be hidden
        from drafts, review, and invoices. You can restore them later from the invoice bin.
      </>
    ) : (
      <>
        <span className="font-medium text-gray-900">{count}</span> selected invoices will return to
        the main workflow pages.
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
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            className={
              isMove
                ? 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-600'
                : 'bg-[color:var(--billing-primary)] hover:bg-[color:var(--billing-primary-hover)] focus:ring-[color:var(--billing-accent)]'
            }
          >
            {busy ? (isMove ? 'Moving…' : 'Restoring…') : isMove ? 'Move to bin' : 'Restore'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
