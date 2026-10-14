'use client';

import type { ReactNode } from 'react';

/** Six data rows + sticky header stay in view; extra rows scroll inside the sheet. */
export const MIS_SHEET_VISIBLE_ROWS = 6;
const HEADER_REM = 2.25;
const ROW_REM = 1.75;

export function misSheetScrollMaxHeight(visibleRows = MIS_SHEET_VISIBLE_ROWS): string {
  return `calc(${HEADER_REM}rem + ${visibleRows} * ${ROW_REM}rem)`;
}

export function MisSheetInnerScroll({
  children,
  label,
  visibleRows = MIS_SHEET_VISIBLE_ROWS,
  className = '',
}: {
  children: ReactNode;
  label: string;
  visibleRows?: number;
  className?: string;
}) {
  return (
    <div
      className={`overflow-auto overscroll-contain rounded-lg border border-slate-100 ${className}`}
      style={{ maxHeight: misSheetScrollMaxHeight(visibleRows) }}
      tabIndex={0}
      role="region"
      aria-label={label}
    >
      {children}
    </div>
  );
}
