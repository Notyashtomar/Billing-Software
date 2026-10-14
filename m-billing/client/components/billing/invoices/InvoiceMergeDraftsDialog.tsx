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

type Props = {
  selected: BillingInvoiceHeader[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  merging: boolean;
};

function labelFor(invoice: BillingInvoiceHeader) {
  return invoice.draftNumber ?? invoice.invoiceNumber ?? invoice.customerCode;
}

export function InvoiceMergeDraftsDialog({
  selected,
  open,
  onOpenChange,
  onConfirm,
  merging,
}: Props) {
  const count = selected.length;
  const airline = selected[0]?.customerCode ?? 'airline';
  const sample = selected
    .slice(0, 3)
    .map((row) => labelFor(row))
    .join(', ');
  const more = count > 3 ? ` and ${count - 3} more` : '';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Merge {count} drafts into one?</AlertDialogTitle>
          <AlertDialogDescription>
            Selected drafts for <span className="font-medium text-gray-900">{airline}</span> will
            become a single invoice. Lines and totals are recomputed together.
            {sample ? (
              <>
                {' '}
                Drafts: <span className="font-medium text-gray-900">{sample}</span>
                {more}.
              </>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={merging}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={merging || count < 2}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            className="bg-[color:var(--billing-primary)] hover:bg-[color:var(--billing-primary-hover)] focus:ring-[color:var(--billing-accent)]"
          >
            {merging ? 'Merging…' : 'Merge into one'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
