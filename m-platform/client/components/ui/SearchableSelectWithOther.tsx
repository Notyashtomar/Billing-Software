'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { SearchableCombobox } from '@/components/ui/SearchableCombobox';
import { FORM_OTHER_OPTION } from '@/lib/org-structure-options';
import {
  buildSearchableSelectOptions,
  matchCanonicalOption,
  resolveCommittedSelectValue,
} from '@/lib/searchable-select-other';
import { stringsToSearchableOptions } from '@/lib/org-structure-options';
import { cn } from '@/lib/utils';

export type SearchableSelectWithOtherProps = {
  fieldLabel: string;
  value: string;
  onChange: (value: string) => void;
  /** Canonical values (without "Other"). */
  options: readonly string[];
  placeholder?: string;
  customPlaceholder?: string;
  includeOther?: boolean;
  loading?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  hideLabel?: boolean;
  stickyHeaderInset?: number;
  className?: string;
  inputClassName?: string;
  onRequestOptions?: () => void | Promise<void>;
};

export function SearchableSelectWithOther({
  fieldLabel,
  value,
  onChange,
  options,
  placeholder = 'Search or select',
  customPlaceholder = 'Type your value here',
  includeOther = true,
  loading = false,
  disabled = false,
  invalid = false,
  hideLabel = false,
  stickyHeaderInset,
  className,
  inputClassName,
  onRequestOptions,
}: SearchableSelectWithOtherProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const focusedRef = useRef(false);
  const menuOpenRef = useRef(false);
  const otherEntryRef = useRef(false);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const baseOptions = useMemo(() => dedupeBase(options), [options]);
  const listOptions = useMemo(
    () =>
      buildSearchableSelectOptions(baseOptions, {
        includeOther,
        currentValue: value,
      }),
    [baseOptions, includeOther, value],
  );

  const [query, setQuery] = useState(value);
  const [customMode, setCustomMode] = useState(false);

  useEffect(() => {
    if (focusedRef.current || otherEntryRef.current) return;
    setQuery(value);
    setCustomMode(
      Boolean(
        value.trim() &&
          value.trim() !== FORM_OTHER_OPTION &&
          !matchCanonicalOption(value, baseOptions),
      ),
    );
  }, [value, baseOptions]);

  const exitOtherEntry = useCallback(() => {
    otherEntryRef.current = false;
  }, []);

  const commitValue = useCallback(
    (raw: string) => {
      const resolved = resolveCommittedSelectValue(raw, baseOptions);
      exitOtherEntry();
      onChange(resolved);
      setQuery(resolved);
      setCustomMode(
        Boolean(
          resolved &&
            resolved !== FORM_OTHER_OPTION &&
            !matchCanonicalOption(resolved, baseOptions),
        ),
      );
      return resolved;
    },
    [baseOptions, exitOtherEntry, onChange],
  );

  const focusInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const handlePick = useCallback(
    (picked: string): boolean => {
      if (picked === FORM_OTHER_OPTION) {
        otherEntryRef.current = true;
        setCustomMode(true);
        setQuery('');
        onChange('');
        window.setTimeout(() => {
          menuOpenRef.current = false;
          focusInput();
        }, 50);
        return true;
      }
      exitOtherEntry();
      setCustomMode(false);
      onChange(picked);
      setQuery(picked);
      return true;
    },
    [exitOtherEntry, focusInput, onChange],
  );

  const handleQueryChange = useCallback(
    (next: string) => {
      if (next.trim() === FORM_OTHER_OPTION) {
        otherEntryRef.current = true;
        setCustomMode(true);
        setQuery('');
        onChange('');
        return;
      }

      setQuery(next);
      if (customMode || otherEntryRef.current) {
        const canonical = matchCanonicalOption(next, baseOptions);
        if (canonical) {
          exitOtherEntry();
          setCustomMode(false);
          onChange(canonical);
          setQuery(canonical);
          return;
        }
        onChange(next);
      }
    },
    [baseOptions, customMode, exitOtherEntry, onChange],
  );

  const handleBlur = useCallback(() => {
    if (menuOpenRef.current) return;

    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }

    blurTimeoutRef.current = setTimeout(() => {
      blurTimeoutRef.current = null;
      if (menuOpenRef.current) return;

      focusedRef.current = false;

      if (customMode || otherEntryRef.current) {
        if (!query.trim()) {
          // Stay in custom entry mode — user selected Other but has not typed yet.
          if (otherEntryRef.current) return;
        }
        commitValue(query);
        return;
      }

      const canonical = matchCanonicalOption(query, baseOptions);
      if (canonical) {
        onChange(canonical);
        setQuery(canonical);
        return;
      }

      if (!query.trim()) {
        onChange('');
        setQuery('');
        return;
      }

      setQuery(value);
    }, 200);
  }, [baseOptions, commitValue, customMode, onChange, query, value]);

  useEffect(
    () => () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    },
    [],
  );

  const inOtherEntry = customMode;
  const effectivePlaceholder = inOtherEntry ? customPlaceholder : placeholder;

  return (
    <div className={cn('w-full min-w-0', className)}>
      <SearchableCombobox
        fieldLabel={fieldLabel}
        hideLabel={hideLabel}
        value={query}
        onChange={handleQueryChange}
        options={stringsToSearchableOptions(listOptions)}
        placeholder={effectivePlaceholder}
        loading={loading}
        disabled={disabled}
        invalid={invalid}
        stickyHeaderInset={stickyHeaderInset}
        onRequestOptions={onRequestOptions}
        onPickOption={(option) => handlePick(option.label)}
        inputClassName={inputClassName}
        inputRef={inputRef}
        onOpenChange={(nextOpen) => {
          menuOpenRef.current = nextOpen;
        }}
        inputProps={{
          id: inputId,
          onFocus: () => {
            if (blurTimeoutRef.current) {
              clearTimeout(blurTimeoutRef.current);
              blurTimeoutRef.current = null;
            }
            focusedRef.current = true;
          },
          onBlur: handleBlur,
        }}
      />
      {inOtherEntry ? (
        <p className="mt-1 text-xs text-slate-500">Enter a custom {fieldLabel.toLowerCase()}.</p>
      ) : null}
    </div>
  );
}

function dedupeBase(options: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const option of options) {
    const trimmed = option.trim();
    if (!trimmed || trimmed === FORM_OTHER_OPTION) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
