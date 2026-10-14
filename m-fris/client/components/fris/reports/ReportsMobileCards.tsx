'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ReportsMobileCardTone = 'default' | 'open' | 'closed' | 'cancelled' | 'warning';

const TONE_CLASS: Record<ReportsMobileCardTone, string> = {
  default: 'border-slate-200/90 bg-white',
  open: 'border-amber-200/90 bg-amber-50/70',
  closed: 'border-emerald-200/90 bg-emerald-50/60',
  cancelled: 'border-rose-200/90 bg-rose-50/65',
  warning: 'border-amber-300/90 bg-amber-50/80',
};

/** Card list — shown below `lg` when paired with `ReportsAdaptiveTable`. */
export function ReportsMobileCardList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul className={cn('m-0 flex list-none flex-col gap-3 p-0 lg:hidden', className)} role="list">
      {children}
    </ul>
  );
}

export function ReportsMobileCard({
  tone = 'default',
  selected,
  onSelect,
  className,
  children,
}: {
  tone?: ReportsMobileCardTone;
  selected?: boolean;
  onSelect?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const baseClass = cn(
    'block w-full rounded-2xl border p-4 text-left shadow-sm shadow-slate-900/[0.03]',
    'transition-[border-color,box-shadow,transform] duration-150',
    TONE_CLASS[tone],
    selected && 'ring-2 ring-amber-400 ring-offset-2',
    onSelect && 'touch-manipulation active:scale-[0.995]',
    className,
  );

  if (onSelect) {
    return (
      <li>
        <div
          role="button"
          tabIndex={0}
          onClick={onSelect}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect();
            }
          }}
          className={baseClass}
        >
          {children}
        </div>
      </li>
    );
  }

  return (
    <li className={baseClass} role="listitem">
      {children}
    </li>
  );
}

export function ReportsMobileCardHeader({
  title,
  subtitle,
  badge,
  trailing,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base font-semibold leading-snug text-slate-900">{title}</p>
          {badge}
        </div>
        {subtitle ? <p className="mt-1 text-sm leading-relaxed text-slate-600">{subtitle}</p> : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

export function ReportsMobileCardGrid({
  children,
  columns = 2,
}: {
  children: ReactNode;
  columns?: 1 | 2;
}) {
  return (
    <dl
      className={cn(
        'mt-3 grid gap-x-4 gap-y-2.5 border-t border-slate-200/70 pt-3',
        columns === 1 ? 'grid-cols-1' : 'grid-cols-2',
      )}
    >
      {children}
    </dl>
  );
}

export function ReportsMobileCardField({
  label,
  value,
  className,
  fullWidth,
}: {
  label: string;
  value: ReactNode;
  className?: string;
  fullWidth?: boolean;
}) {
  return (
    <div className={cn('min-w-0', fullWidth && 'col-span-2', className)}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium leading-snug text-slate-900">{value}</dd>
    </div>
  );
}

export function ReportsMobileCardActions({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-slate-200/70 pt-3 sm:flex-row sm:flex-wrap">
      {children}
    </div>
  );
}

export function ReportsMobileCardButton({
  children,
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}) {
  const variantClass = {
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700',
    secondary: 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50',
    danger: 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50',
    ghost: 'bg-slate-100 text-slate-800 hover:bg-slate-200',
  }[variant];

  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-[44px] flex-1 touch-manipulation items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors duration-150 active:scale-[0.98]',
        variantClass,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function ReportsMobileEmpty({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-10 text-center lg:hidden">
      <p className="text-sm font-medium text-slate-800">{title}</p>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
    </div>
  );
}

/** Mobile cards + desktop table (table from `lg` and up). */
export function ReportsAdaptiveTable({
  mobile,
  desktop,
  className,
}: {
  mobile: ReactNode;
  desktop: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('w-full min-w-0', className)}>
      {mobile}
      <div className="hidden lg:block">{desktop}</div>
    </div>
  );
}
