'use client';

import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AdvanceCardItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  description?: string;
};

type AdvanceCardGridProps = {
  items: AdvanceCardItem[];
  onSelect: (id: string) => void;
  ariaLabel: string;
  className?: string;
  /** Override default responsive columns */
  columnsClassName?: string;
};

export function AdvanceCardGrid({
  items,
  onSelect,
  ariaLabel,
  className,
  columnsClassName = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
}: AdvanceCardGridProps) {
  return (
    <ul
      className={cn('grid gap-3 sm:gap-4', columnsClassName, className)}
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <li key={item.id} className="min-w-0">
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                'group flex h-full min-h-[7.5rem] w-full flex-col items-start gap-3 rounded-2xl',
                'border border-slate-200/90 bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,40,30,0.04)]',
                'transition-[transform,border-color,box-shadow,background-color] duration-150 ease-out',
                'hover:border-emerald-400/50 hover:bg-emerald-50/40 hover:shadow-[0_8px_24px_rgba(15,60,40,0.08)]',
                'active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60',
                'sm:min-h-[8.25rem] sm:p-5',
              )}
            >
              <div className="flex w-full items-start justify-between gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 transition-colors duration-150 group-hover:bg-emerald-100 sm:h-12 sm:w-12">
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} aria-hidden />
                </span>
                <ChevronRight
                  className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-emerald-600"
                  aria-hidden
                />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-800 sm:text-base">
                  {item.label}
                </span>
                {item.description ? (
                  <span className="mt-1 line-clamp-2 block text-xs leading-snug text-slate-500 sm:text-sm">
                    {item.description}
                  </span>
                ) : null}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
