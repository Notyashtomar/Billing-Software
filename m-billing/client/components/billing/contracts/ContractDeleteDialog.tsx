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
import type { BillingContract } from '@/lib/billing-shared/types';
import { cn } from '@/lib/utils';
import { contractUi } from './ContractUi';

export type ContractDeleteMode = 'single' | 'selected' | 'all';

type Props = {
  mode: ContractDeleteMode;
  record: BillingContract | null;
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  deleting: boolean;
};

export function ContractDeleteDialog({
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
      ? 'Delete all contracts?'
      : mode === 'selected'
        ? `Delete ${count} contract${count === 1 ? '' : 's'}?`
        : 'Delete contract?';

  const description =
    mode === 'single' && record ? (
      <>
        Permanently remove{' '}
        <span className="font-bold text-slate-900">{record.contractNumber}</span> for{' '}
        {record.customerCode}. Delete linked rate cards first if they exist.
      </>
    ) : mode === 'selected' ? (
      <>
        Permanently remove <span className="font-bold text-slate-900">{count}</span> selected
        contract{count === 1 ? '' : 's'}. Contracts with linked rate cards will be skipped.
      </>
    ) : (
      <>
        Permanently remove <span className="font-bold text-slate-900">all contracts</span> for this
        station. Contracts with linked rate cards will be skipped.
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
