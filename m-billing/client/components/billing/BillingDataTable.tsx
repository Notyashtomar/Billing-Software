'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { billingUi } from './billingUi';

type Column<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
};

type BillingDataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  emptyMessage?: string;
  getRowKey: (row: T) => string;
  getRowClassName?: (row: T) => string | undefined;
  /** When set, caps table height and scrolls inside the card (use sparingly — page scroll is preferred). */
  maxScrollHeight?: string;
  /**
   * Legacy flag — headers stick via `.billing-app .billing-table thead th` on page scroll.
   * Does not create an inner scroll region (use `maxScrollHeight` only when a capped panel is required).
   */
  stickyHeader?: boolean;
  /** Optional footer below the table (e.g. row count). */
  footer?: ReactNode;
};

export function BillingDataTable<T>({
  columns,
  rows,
  loading,
  emptyMessage = 'No records found',
  getRowKey,
  getRowClassName,
  maxScrollHeight,
  stickyHeader = false,
  footer,
}: BillingDataTableProps<T>) {
  if (loading) {
    return (
      <div className={`${billingUi.card} p-8 text-center text-sm text-[color:var(--billing-text-muted)]`}>
        Loading…
      </div>
    );
  }

  const scrollInside = Boolean(maxScrollHeight);

  return (
    <div className={cn(billingUi.tableWrap, scrollInside && 'flex min-h-0 flex-col')}>
      <p className="billing-table-scroll-hint px-3 pt-3 sm:px-4" aria-live="polite">
        Swipe horizontally to see all columns.
      </p>
      <div
        className={cn(
          'billing-table-scroll overflow-x-auto',
          scrollInside &&
            'min-h-0 flex-1 overflow-y-auto overscroll-y-auto touch-pan-y [-webkit-overflow-scrolling:touch]',
        )}
        style={maxScrollHeight ? { maxHeight: maxScrollHeight } : undefined}
      >
        <table className={billingUi.table}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(billingUi.tableHeadCell, col.className)}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--billing-border)] bg-[color:var(--billing-surface)]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={billingUi.tableEmpty}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr
                  key={`${getRowKey(row)}__${index}`}
                  className={cn(getRowClassName?.(row))}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(billingUi.tableCell, col.className)}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {footer ? (
        <div className={cn(billingUi.tableFooter, stickyHeader && 'shrink-0')}>{footer}</div>
      ) : null}
    </div>
  );
}
