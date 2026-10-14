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
import type { BillingServiceCatalogItem } from '@/lib/billing-shared/types';
import { formatServiceCatalogDisplayCode } from '@/lib/billing-shared/service-catalog-labels';

export type ServiceCatalogDeleteMode = 'single' | 'selected' | 'all';

type Props = {
  mode: ServiceCatalogDeleteMode;
  record: BillingServiceCatalogItem | null;
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  deleting: boolean;
};

export function ServiceCatalogDeleteDialog({
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
      ? 'Delete all services?'
      : mode === 'selected'
        ? `Delete ${count} service${count === 1 ? '' : 's'}?`
        : 'Delete service?';

  const singleLabel = record
    ? formatServiceCatalogDisplayCode(record.serviceCode) || record.serviceCode
    : '';

  const description =
    mode === 'single' && record ? (
      <>
        This will permanently remove{' '}
        <span className="font-medium text-gray-900">{singleLabel}</span>. Delete linked
        rate cards first if they exist.
      </>
    ) : mode === 'selected' ? (
      <>
        This will permanently remove <span className="font-medium text-gray-900">{count}</span>{' '}
        selected service{count === 1 ? '' : 's'}. Services with linked rate cards will be skipped.
      </>
    ) : (
      <>
        This will permanently remove <span className="font-medium text-gray-900">all services</span>{' '}
        in the catalog for this station. Services with linked rate cards will be skipped.
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
