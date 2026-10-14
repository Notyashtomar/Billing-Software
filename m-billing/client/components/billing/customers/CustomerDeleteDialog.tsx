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
import type { BillingCustomer } from '@/lib/billing-shared/types';

export type CustomerDeleteMode = 'single' | 'selected' | 'all';

type Props = {
  mode: CustomerDeleteMode;
  record: BillingCustomer | null;
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  deleting: boolean;
};

export function CustomerDeleteDialog({
  mode,
  record,
  count,
  open,
  onOpenChange,
  onConfirm,
  deleting,
}: Props) {
  const title =
    mode === 'all'
      ? 'Delete all customers?'
      : mode === 'selected'
        ? `Delete ${count} customer${count === 1 ? '' : 's'}?`
        : 'Delete customer?';

  const description =
    mode === 'single' && record ? (
      <>
        This will permanently remove{' '}
        <span className="font-medium text-gray-900">
          {record.customerCode} — {record.name}
        </span>
        . Delete linked contracts and rate cards first if they exist.
      </>
    ) : mode === 'selected' ? (
      <>
        This will permanently remove <span className="font-medium text-gray-900">{count}</span>{' '}
        selected customer{count === 1 ? '' : 's'}. Customers with linked contracts or rate cards
        will be skipped and reported after deletion.
      </>
    ) : (
      <>
        This will permanently remove <span className="font-medium text-gray-900">all customers</span>{' '}
        for this station. Customers with linked contracts or rate cards will be skipped and reported
        after deletion.
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
