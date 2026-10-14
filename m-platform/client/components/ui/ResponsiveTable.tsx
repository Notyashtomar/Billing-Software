'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';
import { adminScrollXClass } from '@/components/admin/admin-auth-styles';

/**
 * ResponsiveTable — an accessible, enterprise data table that adapts by viewport:
 *   - md+ : a semantic <table> with an optional sticky header inside a
 *           horizontally scrollable region (keyboard focusable per WCAG).
 *   - <md : each row collapses into a stacked "label / value" card, so wide
 *           data never forces horizontal page scroll on phones.
 *
 * It ships with loading skeletons, an empty state, and dark-mode variants so
 * pages don't re-implement these patterns. Generic over the row type.
 */
export type ResponsiveTableColumn<T> = {
  /** Stable key for React + the mobile card label association. */
  key: string;
  /** Column header content. */
  header: React.ReactNode;
  /** Cell renderer for a given row. */
  cell: (row: T, index: number) => React.ReactNode;
  /** Text alignment for the desktop cell. */
  align?: 'left' | 'center' | 'right';
  /** Extra classes applied to the desktop <td>. */
  cellClassName?: string;
  /** Extra classes applied to the desktop <th>. */
  headerClassName?: string;
  /**
   * Treat this column as the card title on mobile (rendered prominently at the
   * top of the card without a label). Only the first such column is used.
   */
  isPrimary?: boolean;
  /** Hide this column's label/value pair on the mobile card. */
  hideOnCard?: boolean;
};

export type ResponsiveTableProps<T> = {
  columns: ResponsiveTableColumn<T>[];
  rows: T[];
  /** Unique key for each row. */
  rowKey: (row: T, index: number) => string;
  /** Accessible name for the table (visually hidden <caption>). */
  caption: string;
  isDark?: boolean;
  loading?: boolean;
  /** Skeleton row count while loading. */
  skeletonRows?: number;
  /** Rendered when not loading and there are no rows. */
  emptyState?: React.ReactNode;
  /** Sticky header on desktop. */
  stickyHeader?: boolean;
  /** Optional minimum table width to preserve column layout before scroll. */
  minWidthClassName?: string;
  /** Optional row click handler (adds button semantics to mobile cards). */
  onRowClick?: (row: T, index: number) => void;
  /** Accessible action label for interactive desktop rows and mobile cards. */
  rowActionLabel?: (row: T, index: number) => string;
  className?: string;
};

export function ResponsiveTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  isDark = false,
  loading = false,
  skeletonRows = 5,
  emptyState,
  stickyHeader = true,
  minWidthClassName = 'min-w-[720px]',
  onRowClick,
  rowActionLabel,
  className,
}: ResponsiveTableProps<T>) {
  const primaryColumn = columns.find((c) => c.isPrimary) ?? columns[0];
  const headerTextClass = isDark
    ? 'border-white/10 text-slate-400'
    : 'border-slate-200 text-slate-500';
  const rowBorderClass = isDark
    ? 'border-white/10 hover:bg-white/[0.04]'
    : 'border-slate-100 hover:bg-slate-50/90';
  const headerBgClass = isDark ? 'bg-[#0f172a]/95' : 'bg-slate-50';
  const cardBorderClass = isDark
    ? 'border-white/10 bg-white/[0.03]'
    : 'border-slate-200 bg-white';
  const labelClass = isDark ? 'text-slate-400' : 'text-slate-500';

  const alignClass = (align?: 'left' | 'center' | 'right') =>
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  if (!loading && rows.length === 0 && emptyState) {
    return <div className={className}>{emptyState}</div>;
  }

  return (
    <div className={className}>
      {/* Desktop / tablet: real table inside a focusable horizontal scroll region */}
      <div
        className={cn('hidden w-full md:block', adminScrollXClass)}
        tabIndex={0}
        role="region"
        aria-label={caption}
      >
        <table className={cn('w-full text-left', minWidthClassName)}>
          <caption className="sr-only">{caption}</caption>
          <thead className={cn(stickyHeader && 'sticky top-0 z-10', headerBgClass)}>
            <tr
              className={cn(
                'border-b text-[11px] font-semibold uppercase tracking-wider',
                headerTextClass,
              )}
            >
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn('px-4 py-3.5', alignClass(column.align), column.headerClassName)}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: skeletonRows }).map((_, rowIndex) => (
                  <tr key={`skeleton-${rowIndex}`} className={cn('border-t', rowBorderClass)}>
                    {columns.map((column) => (
                      <td key={column.key} className="px-4 py-3.5">
                        <div
                          className={cn(
                            'h-4 w-full max-w-[8rem] animate-pulse rounded',
                            isDark ? 'bg-white/10' : 'bg-slate-200',
                          )}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row, rowIndex) => (
                  <tr
                    key={rowKey(row, rowIndex)}
                    onClick={onRowClick ? () => onRowClick(row, rowIndex) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (event) => {
                            if (event.target !== event.currentTarget) return;
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onRowClick(row, rowIndex);
                            }
                          }
                        : undefined
                    }
                    tabIndex={onRowClick ? 0 : undefined}
                    role={onRowClick ? 'button' : undefined}
                    aria-label={
                      onRowClick
                        ? rowActionLabel?.(row, rowIndex) ?? `Open row ${rowIndex + 1}`
                        : undefined
                    }
                    className={cn(
                      'border-t transition-colors',
                      rowBorderClass,
                      onRowClick &&
                        'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500',
                    )}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn('px-4 py-3.5', alignClass(column.align), column.cellClassName)}
                      >
                        {column.cell(row, rowIndex)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: each row as a stacked card */}
      <ul className="space-y-3 md:hidden" aria-label={caption}>
        {loading
          ? Array.from({ length: skeletonRows }).map((_, rowIndex) => (
              <li
                key={`m-skeleton-${rowIndex}`}
                className={cn('rounded-xl border p-4', cardBorderClass)}
              >
                <div
                  className={cn(
                    'mb-3 h-4 w-2/3 animate-pulse rounded',
                    isDark ? 'bg-white/10' : 'bg-slate-200',
                  )}
                />
                <div
                  className={cn(
                    'h-3 w-full animate-pulse rounded',
                    isDark ? 'bg-white/5' : 'bg-slate-100',
                  )}
                />
              </li>
            ))
          : rows.map((row, rowIndex) => {
              const CardTag = onRowClick ? 'button' : 'div';
              return (
                <li key={rowKey(row, rowIndex)}>
                  <CardTag
                    {...(onRowClick
                      ? {
                          type: 'button' as const,
                          onClick: () => onRowClick(row, rowIndex),
                          'aria-label':
                            rowActionLabel?.(row, rowIndex) ?? `Open row ${rowIndex + 1}`,
                        }
                      : {})}
                    className={cn(
                      'w-full rounded-xl border p-4 text-left',
                      cardBorderClass,
                      onRowClick &&
                        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 active:scale-[0.99]',
                    )}
                  >
                    {primaryColumn ? (
                      <div
                        className={cn(
                          'mb-3 text-sm font-semibold',
                          isDark ? 'text-slate-100' : 'text-slate-900',
                        )}
                      >
                        {primaryColumn.cell(row, rowIndex)}
                      </div>
                    ) : null}
                    <dl className="grid grid-cols-1 gap-2 xs:grid-cols-2">
                      {columns
                        .filter((c) => c !== primaryColumn && !c.hideOnCard)
                        .map((column) => (
                          <div key={column.key} className="min-w-0">
                            <dt
                              className={cn(
                                'text-[11px] font-medium uppercase tracking-wide',
                                labelClass,
                              )}
                            >
                              {column.header}
                            </dt>
                            <dd
                              className={cn(
                                'mt-0.5 truncate text-sm',
                                isDark ? 'text-slate-200' : 'text-slate-700',
                              )}
                            >
                              {column.cell(row, rowIndex)}
                            </dd>
                          </div>
                        ))}
                    </dl>
                  </CardTag>
                </li>
              );
            })}
      </ul>
    </div>
  );
}
