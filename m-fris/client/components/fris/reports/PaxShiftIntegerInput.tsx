'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import {
  blockNonIntegerKeyDown,
  blockNonIntegerPaste,
} from '@/lib/paxShiftFieldCoercion';
import { cn } from '@/lib/utils';

export type PaxShiftIntegerInputProps = Omit<
  React.ComponentProps<typeof Input>,
  'type' | 'inputMode'
> & {
  min?: number;
};

function sanitizeIntegerInputValue(raw: string): string {
  const v = raw.replace(/\D/g, '');
  return v;
}

/** Whole-number field — type digits manually (no number spinners). */
export function PaxShiftIntegerInput({
  className,
  min = 0,
  onKeyDown,
  onPaste,
  onChange,
  onBlur,
  value,
  defaultValue,
  placeholder = '0',
  ...props
}: PaxShiftIntegerInputProps) {
  const isControlled = value !== undefined;

  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      className={cn(
        'tabular-nums',
        '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
        className,
      )}
      {...(isControlled ? { value } : { defaultValue })}
      onKeyDown={(e) => {
        blockNonIntegerKeyDown(e);
        onKeyDown?.(e);
      }}
      onPaste={(e) => {
        blockNonIntegerPaste(e);
        onPaste?.(e);
      }}
      onChange={(e) => {
        const next = sanitizeIntegerInputValue(e.target.value);
        if (next !== e.target.value) {
          e.target.value = next;
        }
        onChange?.(e);
      }}
      onBlur={(e) => {
        const next = sanitizeIntegerInputValue(e.target.value);
        if (next !== e.target.value) {
          e.target.value = next;
        }
        onBlur?.(e);
      }}
      {...props}
    />
  );
}
