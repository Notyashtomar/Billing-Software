'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { FRIS_REPORTS_TABLE_SCROLL_CLASS } from '@/lib/fris-reports-responsive';

type ReportsResponsiveTableProps = {
  children: ReactNode;
  className?: string;
  scrollClassName?: string;
  showScrollHint?: boolean;
};

/** Wide report tables: horizontal scroll + mobile swipe hint. */
export function ReportsResponsiveTable({
  children,
  className,
  scrollClassName,
  showScrollHint = true,
}: ReportsResponsiveTableProps) {
  return (
    <div className={cn('w-full min-w-0', className)}>
      {showScrollHint ? (
        <p
          className="mb-2 hidden px-0.5 text-[11px] font-medium text-slate-500 max-lg:block lg:hidden"
          role="note"
        >
          Swipe sideways to see more columns
        </p>
      ) : null}
      <div className={cn(FRIS_REPORTS_TABLE_SCROLL_CLASS, scrollClassName)}>{children}</div>
    </div>
  );
}

type ReportsHeaderActionsProps = {
  children: ReactNode;
  className?: string;
};

/** Stacks header actions 2-up on mobile, inline on tablet+. */
export function ReportsHeaderActions({ children, className }: ReportsHeaderActionsProps) {
  return (
    <div
      className={cn(
        'grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end',
        className,
      )}
    >
      {children}
    </div>
  );
}
