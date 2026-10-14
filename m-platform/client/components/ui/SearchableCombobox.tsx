'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { FRIS_NATIVE_FIELD_FOCUS } from '@/lib/fris-field-classes';
import { FRIS_HIDDEN_SCROLLBAR_CLASS } from '@/lib/fris-responsive-nav';
import {
  computePortalMenuPlacement,
  type PortalMenuPlacement,
} from '@/lib/portal-dropdown-placement';
import {
  bindPortaledMenuWheelLock,
  bindPortalScrollListeners,
} from '@/lib/portal-dropdown-scroll';
import { bindDeferredOutsidePointerDismiss } from '@/lib/deferred-outside-listener';
import { preventMouseBlurDefault } from '@/lib/prevent-mouse-blur';
import { PICKER_OUTSIDE_DISMISS_DELAY_MS } from '@/lib/use-picker-sheet-guard';
import { isTouchPrimaryViewport } from '@/lib/touch-viewport';
import { cn } from '@/lib/utils';

export type SearchableComboOption = {
  id: string;
  label: string;
  description?: string;
  /** Defaults to `label` + `description`. */
  searchIndex?: string;
  /** Optional metadata when picking operation employees (or similar). */
  employeeCode?: string;
  employeeName?: string;
  /** Optional metadata when picking airline contacts. */
  airlineRepresentative?: string;
  airline?: string;
};

export type SearchableComboboxProps = {
  fieldLabel: string;
  value: string;
  onChange: (next: string) => void;
  options: SearchableComboOption[];
  loading?: boolean;
  placeholder?: string;
  /** Called when the field is focused (e.g. load options once from API). */
  onRequestOptions?: () => void | Promise<void>;
  /** Called when the user picks a row from the list (not while typing). Return `true` if the pick fully updated value (skip default). */
  onPickOption?: (option: SearchableComboOption) => boolean | void;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  invalid?: boolean;
  hideLabel?: boolean;
  /** Minimum distance from viewport top (sticky headers). */
  stickyHeaderInset?: number;
  /** Extra native input props (e.g. onBlur for commit-on-blur selects). */
  inputProps?: Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'onChange' | 'disabled' | 'className'
  >;
  /** Optional ref for the native input element. */
  inputRef?: RefObject<HTMLInputElement | null>;
  /** When true, matches only if employee code or name starts with the typed text (not mid-string). */
  matchFromStart?: boolean;
  /** Called when the dropdown opens or closes. */
  onOpenChange?: (open: boolean) => void;
  /** Max options shown before filtering (default 60). */
  maxVisibleOptions?: number;
  /** Hide secondary description line under each option label. */
  hideOptionDescription?: boolean;
  /** Extra classes on the dropdown list panel. */
  listPanelClassName?: string;
};

const inputClass = cn(
  'w-full rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-9 text-sm text-gray-900 shadow-sm transition-colors hover:border-gray-300 placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-60',
  FRIS_NATIVE_FIELD_FOCUS,
);

const portalListClass = cn(
  'fixed z-[10050] flex flex-col gap-0.5 overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg border border-gray-200 bg-white py-1 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.28)] touch-pan-y',
  FRIS_HIDDEN_SCROLLBAR_CLASS,
);

function optionSearchText(o: SearchableComboOption): string {
  return (o.searchIndex ?? `${o.label} ${o.description ?? ''}`).toLowerCase();
}

function optionMatchesQuery(o: SearchableComboOption, q: string, fromStart: boolean): boolean {
  if (!fromStart) return optionSearchText(o).includes(q);

  const code = (o.employeeCode ?? '').trim().toLowerCase();
  const name = (o.employeeName ?? '').trim().toLowerCase();
  if (code && code.startsWith(q)) return true;
  if (name && name.startsWith(q)) return true;

  const label = o.label.trim().toLowerCase();
  const description = (o.description ?? '').trim().toLowerCase();
  return label.startsWith(q) || description.startsWith(q);
}

export function SearchableCombobox({
  fieldLabel,
  value,
  onChange,
  options,
  loading,
  placeholder,
  onRequestOptions,
  onPickOption,
  className = '',
  inputClassName,
  disabled = false,
  invalid = false,
  hideLabel = false,
  stickyHeaderInset,
  inputProps,
  inputRef,
  matchFromStart = false,
  onOpenChange,
  maxVisibleOptions = 60,
  hideOptionDescription = false,
  listPanelClassName,
}: SearchableComboboxProps) {
  const reactId = useId();
  const inputId = `${reactId}-combo`;
  const listId = `${reactId}-listbox`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const menuPlacementRef = useRef<PortalMenuPlacement | null>(null);
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [menuPlacement, setMenuPlacement] = useState<PortalMenuPlacement | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const disabledRef = useRef(disabled);
  const effectiveOpen = open && !disabled;

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
    disabledRef.current = disabled;
  });

  const setOpenState = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setOpen((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      if (resolved !== prev) {
        onOpenChangeRef.current?.(resolved && !disabledRef.current);
      }
      return resolved;
    });
  }, []);

  useEffect(() => {
    onOpenChange?.(effectiveOpen);
  }, [effectiveOpen, onOpenChange]);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const filtered = useMemo(() => {
    const q = inputValue.trim().toLowerCase();
    if (!q) return options.slice(0, maxVisibleOptions);
    return options
      .filter((o) => optionMatchesQuery(o, q, matchFromStart))
      .slice(0, maxVisibleOptions);
  }, [options, inputValue, matchFromStart, maxVisibleOptions]);

  const selectedValue = value.trim().toLowerCase();

  const placementOptionCount = useMemo(
    () =>
      Math.max(
        filtered.length,
        loading ? 1 : 0,
        !loading && options.length === 0 ? 1 : 0,
      ),
    [filtered.length, loading, options.length],
  );

  const updateMenuPlacement = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const placement = computePortalMenuPlacement(
      trigger,
      placementOptionCount,
      stickyHeaderInset,
      44,
    );
    menuPlacementRef.current = placement;
    setMenuPlacement(placement);
  }, [placementOptionCount, stickyHeaderInset]);

  const syncMenuPlacement = useCallback(() => {
    updateMenuPlacement();
  }, [updateMenuPlacement]);

  useLayoutEffect(() => {
    if (!effectiveOpen) return;
    updateMenuPlacement();
  }, [effectiveOpen, updateMenuPlacement, filtered.length, loading, options.length]);

  useLayoutEffect(() => {
    if (!effectiveOpen) return;
    const menu = menuRef.current;
    if (!menu) return;
    return bindPortaledMenuWheelLock(menu);
  }, [effectiveOpen, filtered.length, loading, options.length, menuPlacement]);

  useEffect(() => {
    if (!effectiveOpen || !triggerRef.current) return;

    const unbindScroll = bindPortalScrollListeners(triggerRef.current, {
      getMenu: () => menuRef.current,
      onScroll: isTouchPrimaryViewport()
        ? () => updateMenuPlacement()
        : () => setOpenState(false),
      onViewportChange: updateMenuPlacement,
    });

    const onResize = () => updateMenuPlacement();
    window.addEventListener('resize', onResize);

    return () => {
      unbindScroll();
      window.removeEventListener('resize', onResize);
    };
  }, [effectiveOpen, updateMenuPlacement]);

  useEffect(() => {
    if (!effectiveOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpenState(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenState(false);
    };

    const unbindPointer = bindDeferredOutsidePointerDismiss(
      onPointerDown,
      PICKER_OUTSIDE_DISMISS_DELAY_MS,
    );
    document.addEventListener('keydown', onKeyDown);
    return () => {
      unbindPointer();
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [effectiveOpen, setOpenState]);

  const openDropdown = useCallback(() => {
    if (disabled) return;
    void onRequestOptions?.();
    syncMenuPlacement();
    setOpenState(true);
  }, [disabled, onRequestOptions, syncMenuPlacement, setOpenState]);

  const onFocusInput = useCallback(() => {
    openDropdown();
  }, [openDropdown]);

  const toggleDropdown = useCallback(() => {
    if (disabled) return;
    if (open) {
      setOpenState(false);
      return;
    }
    openDropdown();
  }, [disabled, open, openDropdown, setOpenState]);

  const pickOption = useCallback(
    (option: SearchableComboOption) => {
      const handled = onPickOption?.(option);
      setOpenState(false);
      if (handled !== true) {
        onChange(option.label);
      }
    },
    [onChange, onPickOption, setOpenState],
  );

  const resolvedMenuPlacement = menuPlacement ?? menuPlacementRef.current;

  const listContent = (
    <>
      {loading && options.length === 0 ? (
        <li className="px-3 py-2.5 text-sm text-gray-500 sm:px-3.5">Loading…</li>
      ) : null}
      {!loading && options.length === 0 ? (
        <li className="px-3 py-2.5 text-sm text-gray-500 sm:px-3.5">No options loaded yet.</li>
      ) : null}
      {!loading && options.length > 0 && filtered.length === 0 ? (
        <li className="px-3 py-2.5 text-sm text-gray-500 sm:px-3.5">
          No matches — try another search.
        </li>
      ) : null}
      {filtered.map((o, optionIndex) => (
        <li key={`${o.id}::${optionIndex}`} role="presentation">
          <button
            type="button"
            role="option"
            aria-selected={o.label.trim().toLowerCase() === selectedValue}
            className="flex min-h-[44px] w-full touch-manipulation flex-col items-stretch justify-center gap-0.5 px-3 py-2.5 text-left text-sm hover:bg-emerald-50 active:bg-emerald-100 sm:px-3.5"
            onMouseDown={preventMouseBlurDefault}
            onClick={() => pickOption(o)}
          >
            <span className="break-words font-medium leading-snug text-gray-900">
              {o.label}
            </span>
            {o.description && !hideOptionDescription ? (
              <span className="break-words text-xs leading-snug text-gray-500">
                {o.description}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </>
  );

  return (
    <div ref={wrapRef} className={cn('relative w-full min-w-0', className)}>
      {hideLabel ? null : (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600"
        >
          {fieldLabel}
        </label>
      )}
      <div ref={triggerRef} className="relative w-full min-w-0">
        <input
          ref={inputRef}
          id={inputProps?.id ?? inputId}
          type="text"
          autoComplete="off"
          enterKeyHint="search"
          role="combobox"
          aria-expanded={effectiveOpen}
          aria-controls={listId}
          aria-busy={loading}
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
          value={inputValue}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            setInputValue(v);
            onChange(v);
            setOpenState(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpenState(false);
            inputProps?.onKeyDown?.(e);
          }}
          onFocus={(e) => {
            onFocusInput();
            inputProps?.onFocus?.(e);
          }}
          onBlur={inputProps?.onBlur}
          className={cn(
            inputClass,
            inputClassName,
            invalid &&
              'border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/25',
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={`${effectiveOpen ? 'Close' : 'Open'} ${fieldLabel} options`}
          aria-expanded={effectiveOpen}
          disabled={disabled}
          onMouseDown={preventMouseBlurDefault}
          onClick={toggleDropdown}
          className="absolute right-0 top-0 flex h-full min-w-[44px] touch-manipulation items-center justify-center px-2.5 text-gray-400 transition-colors hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 transition-transform duration-200',
              effectiveOpen && 'rotate-180',
            )}
            aria-hidden
          />
        </button>
      </div>
      {effectiveOpen &&
      typeof document !== 'undefined' &&
      resolvedMenuPlacement
        ? createPortal(
            <ul
              ref={menuRef}
              id={listId}
              role="listbox"
              aria-label={fieldLabel}
              className={cn(portalListClass, 'pointer-events-auto', listPanelClassName)}
              style={{
                top: resolvedMenuPlacement.top,
                left: resolvedMenuPlacement.left,
                width: resolvedMenuPlacement.width,
                maxHeight: resolvedMenuPlacement.maxHeight,
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {listContent}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
