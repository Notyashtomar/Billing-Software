'use client';

import type { ReactNode } from 'react';
import { DatePicker } from '@/components/ui/DatePicker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** Safety-style select trigger (navy/gold focus). */
const selectTriggerClass =
  'flex h-10 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-[color:var(--billing-border-strong)] focus:border-[color:var(--billing-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--billing-accent)]/40 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1';

const selectContentClass =
  '!z-[10060] rounded-xl border border-slate-200 bg-white text-slate-800 shadow-lg';

export type ContractSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type ContractSystemSelectProps = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: ContractSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  'aria-label'?: string;
  className?: string;
};

/** Radix Select — Safety visual language; portals above dialogs. */
export function ContractSystemSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  disabled,
  'aria-label': ariaLabel,
  className,
}: ContractSystemSelectProps) {
  return (
    <Select value={value || undefined} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id} aria-label={ariaLabel} className={cn(selectTriggerClass, className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={selectContentClass} position="popper" sideOffset={6}>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const CONTRACT_SECTOR_OPTIONS = [
  { value: 'Dom', label: 'Domestic' },
  { value: 'Int', label: 'International' },
  { value: 'DomCargo', label: 'Domestic-Cargo' },
  { value: 'IntCargo', label: 'International-Cargo' },
] as const;

export type ContractSector = (typeof CONTRACT_SECTOR_OPTIONS)[number]['value'];

export function contractSectorsFromRecord(record: {
  category?: string;
  categories?: string[];
}): ContractSector[] {
  const allowed = new Set(CONTRACT_SECTOR_OPTIONS.map((option) => option.value));
  const stored = (record.categories ?? []).filter((value): value is ContractSector =>
    allowed.has(value as ContractSector),
  );
  if (stored.length > 0) return stored;
  if (record.category === 'Dom' || record.category === 'Int') return [record.category];
  if (record.category === 'Both') return ['Dom', 'Int'];
  return ['Int'];
}

export function legacyCategoryFromSectors(sectors: ContractSector[]): 'Dom' | 'Int' | 'Both' {
  const passenger = sectors.filter((sector) => sector === 'Dom' || sector === 'Int');
  if (passenger.length === 1 && sectors.length === 1) return passenger[0];
  return 'Both';
}

/** Checkbox dropdown. Several sectors can be selected on one contract. */
export function ContractCategoryMultiSelect({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: ContractSector[];
  onChange: (value: ContractSector[]) => void;
}) {
  const label =
    CONTRACT_SECTOR_OPTIONS.filter((option) => value.includes(option.value))
      .map((option) => option.label)
      .join(', ') || 'Select categories…';
  return (
    <details className="group relative">
      <summary
        id={id}
        className={cn(selectTriggerClass, 'list-none [&::-webkit-details-marker]:hidden')}
      >
        <span className="truncate">{label}</span>
      </summary>
      <div className="absolute z-[10060] mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
        {CONTRACT_SECTOR_OPTIONS.map((option) => {
          const checked = value.includes(option.value);
          return (
            <label
              key={option.value}
              className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-slate-800 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={checked}
                onChange={() => {
                  const next = checked
                    ? value.filter((item) => item !== option.value)
                    : [...value, option.value];
                  onChange(next.length > 0 ? next : value);
                }}
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </details>
  );
}

type ContractSystemDateProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
  minDate?: Date;
  maxDate?: Date;
};

/** System DatePicker — remapped billing theme inherits Safety CSS vars in contract-dialog. */
export function ContractSystemDate({
  id,
  value,
  onChange,
  disabled,
  placeholder = 'Select date',
  className,
  minDate,
  maxDate,
}: ContractSystemDateProps) {
  return (
    <DatePicker
      id={id}
      value={value}
      onChange={onChange}
      valueFormat="yyyy-MM-dd"
      theme="billing"
      placeholder={placeholder}
      disabled={disabled}
      minDate={minDate}
      maxDate={maxDate}
      className={cn(
        'w-full [&_button]:rounded-xl [&_button]:border-slate-200 [&_button]:shadow-xs [&_button]:hover:border-[color:var(--billing-border-strong)] [&_button]:focus-visible:ring-[color:var(--billing-accent)]/40',
        className,
      )}
    />
  );
}

export function ContractControlHint({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium text-slate-500">{children}</p>;
}
