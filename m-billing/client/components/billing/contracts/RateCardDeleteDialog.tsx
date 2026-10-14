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
import type { BillingRateCard } from '@/lib/billing-shared/types';
import { cn } from '@/lib/utils';
import { contractUi } from './ContractUi';

export type RateCardDeleteMode = 'single' | 'selected' | 'all';

type Props = {
  mode: RateCardDeleteMode;
  record: BillingRateCard | null;
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  deleting: boolean;
};

export function RateCardDeleteDialog({
  mode,
  record,
  count,
  open,
  onOpenChange,
  onConfirm,
  deleting,
}: Props) {
  const singleLabel = record
    ? `${record.customerCode} · ${record.serviceCode}${
        record.category ? ` · ${record.category}` : ''
      }`
    : 'this rate card';

  const title =
    mode === 'all'
      ? 'Delete all rate cards?'
      : mode === 'selected'
        ? `Delete ${count} rate card${count === 1 ? '' : 's'}?`
        : 'Delete rate card?';

  const description =
    mode === 'single' ? (
      <>
        Permanently remove <span className="font-bold text-slate-900">{singleLabel}</span>. Invoices
        already generated from this rate are not affected.
      </>
    ) : mode === 'selected' ? (
      <>
        Permanently remove <span className="font-bold text-slate-900">{count}</span> selected rate
        card{count === 1 ? '' : 's'}. Existing invoices are not affected.
      </>
    ) : (
      <>
        Permanently remove <span className="font-bold text-slate-900">all rate cards</span> for this
        station. Existing invoices are not affected.
      </>
    );

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="contract-dialog rounded-2xl !border-slate-200 !bg-white !text-slate-800 sm:max-w-md">
        <AlertDialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M9 3h6m-8 4h10m-1.5 0-.7 12.1a2 2 0 0 1-2 1.9h-2.6a2 2 0 0 1-2-1.9L7.5 7"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <AlertDialogTitle className="text-slate-900">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-slate-500">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting} className={contractUi.btnSecondary}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            className={cn(
              'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:opacity-60',
              'border-0',
            )}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
