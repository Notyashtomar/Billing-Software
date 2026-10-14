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
import type { BillingPriceCardAirline } from '@/lib/billing-shared/types';

type Props = {
  entry: BillingPriceCardAirline | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  deleting: boolean;
};

export function PriceCardAirlineDeleteDialog({
  entry,
  open,
  onOpenChange,
  onConfirm,
  deleting,
}: Props) {
  const label = entry
    ? `${entry.customerCode} · ${entry.airlineName} · ${entry.aircraftType}`
    : 'this airline entry';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-2xl !border-[color:var(--billing-border-strong)] !bg-[#ffffff] !text-[color:var(--billing-text)] sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[color:var(--billing-heading)]">
            Delete airline entry?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[color:var(--billing-text-muted)]">
            This will permanently remove{' '}
            <span className="font-semibold text-[color:var(--billing-heading)]">{label}</span> from{' '}
            {entry?.handlingType ?? 'this handling type'}. Rate cards for this airline are not
            deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            className="bg-[color:var(--billing-danger)] hover:bg-[color:var(--billing-danger-hover)] focus:ring-[color:var(--billing-danger)]"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
