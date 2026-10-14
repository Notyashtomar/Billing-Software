'use client';

import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

type AdvanceSectionChromeProps = {
  title: string;
  description?: string;
  backLabel: string;
  onBack: () => void;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function AdvanceSectionChrome({
  title,
  description,
  backLabel,
  onBack,
  children,
  className,
  contentClassName,
}: AdvanceSectionChromeProps) {
  return (
    <div className={cn('flex min-h-0 w-full flex-col gap-3 sm:gap-4', className)}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold tracking-tight text-slate-800 sm:text-xl md:text-2xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">{description}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onBack}
          className={cn(
            'inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-full',
            'border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700',
            'transition-[border-color,background-color,transform] duration-150 ease-out',
            'hover:border-emerald-300 hover:bg-emerald-50 active:scale-[0.97]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60',
            'sm:w-auto',
          )}
        >
          <ArrowLeft className="h-4 w-4 text-emerald-600" aria-hidden />
          {backLabel}
        </button>
      </header>
      <div className={cn('min-h-0 flex-1', contentClassName)}>{children}</div>
    </div>
  );
}
