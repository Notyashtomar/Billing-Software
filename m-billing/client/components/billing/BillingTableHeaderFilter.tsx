'use client';

import { ChevronDown } from 'lucide-react';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  disabled?: boolean;
  ariaLabel?: string;
};

export function BillingTableHeaderFilter({
  label,
  value,
  onChange,
  options,
  disabled = false,
  ariaLabel,
}: Props) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide leading-tight text-[color:var(--billing-heading)]">
        {label}
      </span>
      <div className="relative w-full min-w-[6.5rem] max-w-[11rem]">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || options.length === 0}
          aria-label={ariaLabel ?? `Filter by ${label}`}
          className="w-full cursor-pointer appearance-none rounded-md border border-[color:var(--billing-border-strong)] bg-[color:var(--billing-surface)] py-1.5 pl-2 pr-7 text-xs font-medium text-[color:var(--billing-text)] shadow-[var(--billing-shadow-sm)] transition-colors hover:border-[color:var(--billing-accent)] focus:border-[color:var(--billing-accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--billing-accent)]/25 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">All</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--billing-secondary)]"
          aria-hidden
        />
      </div>
    </div>
  );
}
