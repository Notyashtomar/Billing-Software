'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';
import { FocusScope } from '@radix-ui/react-focus-scope';
import {
  bindPortaledMenuWheelLock,
  bindPortalScrollListeners,
} from '@/lib/portal-dropdown-scroll';
import { bindDeferredOutsidePointerDismiss } from '@/lib/deferred-outside-listener';
import { preventMouseBlurDefault } from '@/lib/prevent-mouse-blur';
import { PICKER_OUTSIDE_DISMISS_DELAY_MS } from '@/lib/use-picker-sheet-guard';
import { isTouchPrimaryViewport } from '@/lib/touch-viewport';
import {
  computePortalMenuPlacement,
  DEFAULT_PORTAL_STICKY_HEADER_INSET,
  type PortalMenuPlacement,
} from '@/lib/portal-dropdown-placement';
import styles from './admin-radio-dropdown.module.css';

export type RadioDropdownOption =
  | string
  | { value: string; label: string; description?: string };

type NormalizedOption = {
  value: string;
  label: string;
  description?: string;
  searchText: string;
};

function normalizeOptions(
  options: readonly RadioDropdownOption[],
): NormalizedOption[] {
  return options.map((option) => {
    const normalized =
      typeof option === 'string' ? { value: option, label: option } : option;
    return {
      ...normalized,
      searchText: `${normalized.label} ${normalized.value} ${
        normalized.description ?? ''
      }`.toLocaleLowerCase(),
    };
  });
}

type AdminRadioDropdownSharedProps = {
  options: readonly RadioDropdownOption[];
  /** @default false — FRIS light surfaces */
  isDark?: boolean;
  /** `safety` = navy / gold. Default FRIS emerald. */
  theme?: 'default' | 'safety';
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  'aria-labelledby'?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  onBlur?: () => void;
  /** Minimum distance from viewport top (sticky header). Defaults to 48px navbar. */
  stickyHeaderInset?: number;
  /**
   * Enable searchable option list inside the dropdown panel.
   * @default true — project-wide searchable selects
   */
  searchable?: boolean;
  /** Placeholder text for the search input when searchable is enabled. */
  searchPlaceholder?: string;
  /**
   * Show a clear control when a value is selected (X on trigger + Clear row in menu).
   * @default false
   */
  clearable?: boolean;
  /** Accessible label for the clear control. */
  clearLabel?: string;
  /** `sm` = 28px trigger for table / filter bars. Default stays 44px. */
  size?: 'default' | 'sm';
};

export type AdminRadioDropdownProps = AdminRadioDropdownSharedProps &
  (
    | {
        multiple?: false;
        value: string;
        onChange: (value: string) => void;
      }
    | {
        multiple: true;
        value: string[];
        onChange: (value: string[]) => void;
      }
  );

const DEFAULT_STICKY_HEADER_INSET = DEFAULT_PORTAL_STICKY_HEADER_INSET;
const CLOSE_ANIMATION_MS = 140;
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusAdjacentToTrigger(
  trigger: HTMLButtonElement | null,
  menu: HTMLDivElement | null,
  reverse: boolean,
) {
  if (!trigger) return;
  const focusable = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !menu?.contains(element) &&
      !element.hasAttribute('hidden') &&
      element.getAttribute('aria-hidden') !== 'true' &&
      element.getClientRects().length > 0,
  );
  const triggerIndex = focusable.indexOf(trigger);
  const target = focusable[triggerIndex + (reverse ? -1 : 1)];
  target?.focus();
}

export function AdminRadioDropdown(
  props: AdminRadioDropdownSharedProps & {
    multiple?: false;
    value: string;
    onChange: (value: string) => void;
  },
): ReactElement;
export function AdminRadioDropdown(
  props: AdminRadioDropdownSharedProps & {
    multiple: true;
    value: string[];
    onChange: (value: string[]) => void;
  },
): ReactElement;
export function AdminRadioDropdown({
  value,
  onChange,
  options,
  isDark = false,
  theme = 'default',
  placeholder,
  className,
  disabled = false,
  id,
  'aria-labelledby': ariaLabelledBy,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  onBlur,
  stickyHeaderInset = DEFAULT_STICKY_HEADER_INSET,
  searchable = true,
  searchPlaceholder = 'Search...',
  clearable = false,
  clearLabel = 'Clear selection',
  multiple = false,
  size = 'default',
}: AdminRadioDropdownProps) {
  const reactId = useId();
  const listboxId = id ? `${id}-listbox` : `${reactId}-listbox`;
  const searchInputId = id ? `${id}-search` : `${reactId}-search`;
  const [isOpen, setIsOpen] = useState(false);
  const [renderMenu, setRenderMenu] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const ignoreScrollCloseUntilRef = useRef(0);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [menuPlacement, setMenuPlacement] = useState<PortalMenuPlacement | null>(null);
  const normalized = useMemo(() => normalizeOptions(options), [options]);
  const filteredOptions = useMemo(() => {
    if (!searchable) return normalized;
    const q = query.trim().toLocaleLowerCase();
    if (!q) return normalized;
    return normalized.filter((option) => option.searchText.includes(q));
  }, [normalized, query, searchable]);
  const menuVisualRowCount = useMemo(() => {
    const optionRows = Math.max(filteredOptions.length, searchable ? 1 : 0);
    return optionRows + (searchable ? 1 : 0);
  }, [filteredOptions.length, searchable]);
  const effectiveOpen = isOpen && !disabled;

  const selectedValues = useMemo((): string[] => {
    if (Array.isArray(value)) return value.filter((id) => id.length > 0);
    return value ? [value] : [];
  }, [value]);
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

  const selectedLabel = useMemo(() => {
    if (multiple) {
      if (selectedValues.length === 0) return placeholder ?? 'Select';
      const labels = selectedValues.map(
        (id) => normalized.find((option) => option.value === id)?.label ?? id,
      );
      if (labels.length <= 2) return labels.join(', ');
      return `${labels[0]}, ${labels[1]} +${labels.length - 2}`;
    }
    const singleValue = Array.isArray(value) ? '' : value;
    const hit = normalized.find((o) => o.value === singleValue);
    if (hit) return hit.label;
    if (placeholder) return placeholder;
    if (singleValue) return singleValue;
    return normalized[0]?.label ?? 'Select';
  }, [multiple, normalized, placeholder, selectedValues, value]);

  const showPlaceholderStyle = selectedValues.length === 0 && Boolean(placeholder);

  const updateMenuPlacement = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const placement = computePortalMenuPlacement(
      trigger,
      menuVisualRowCount,
      stickyHeaderInset,
      44,
    );
    setMenuPlacement(placement);
  }, [menuVisualRowCount, stickyHeaderInset]);

  useLayoutEffect(() => {
    if (!effectiveOpen) return;
    updateMenuPlacement();
  }, [effectiveOpen, updateMenuPlacement, menuVisualRowCount]);

  useEffect(() => {
    if (effectiveOpen || !renderMenu) return;
    const closeTimer = window.setTimeout(() => {
      setRenderMenu(false);
      setQuery('');
      setActiveIndex(-1);
    }, CLOSE_ANIMATION_MS);
    return () => window.clearTimeout(closeTimer);
  }, [effectiveOpen, renderMenu]);

  useEffect(() => {
    if (!effectiveOpen || !searchable) return;
    const focusTimer = window.setTimeout(
      () => searchInputRef.current?.focus({ preventScroll: true }),
      0,
    );
    return () => window.clearTimeout(focusTimer);
  }, [effectiveOpen, searchable]);

  useEffect(() => {
    if (!effectiveOpen || !triggerRef.current) return;

    const unbindScroll = bindPortalScrollListeners(triggerRef.current, {
      getMenu: () => menuRef.current,
      onScroll: () => {
        if (performance.now() < ignoreScrollCloseUntilRef.current) {
          updateMenuPlacement();
          return;
        }
        if (isTouchPrimaryViewport()) {
          updateMenuPlacement();
          return;
        }
        setIsOpen(false);
      },
      onViewportChange: updateMenuPlacement,
    });

    const onResize = () => updateMenuPlacement();
    window.addEventListener('resize', onResize);

    return () => {
      unbindScroll();
      window.removeEventListener('resize', onResize);
    };
  }, [effectiveOpen, updateMenuPlacement]);

  useLayoutEffect(() => {
    if (!renderMenu) return;
    const menu = menuRef.current;
    if (!menu) return;
    return bindPortaledMenuWheelLock(menu);
  }, [renderMenu, menuPlacement, filteredOptions.length]);

  useEffect(() => {
    if (!effectiveOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
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
  }, [effectiveOpen]);

  const themeClass = `${isDark ? styles.dark : styles.light}${
    theme === 'safety' ? ` ${styles.safety}` : ''
  }`;
  const resolvedMenuPlacement = menuPlacement;
  const safeActiveIndex =
    activeIndex >= 0 && activeIndex < filteredOptions.length
      ? activeIndex
      : filteredOptions.length > 0
        ? 0
        : -1;
  const activeOptionId =
    safeActiveIndex >= 0
      ? `${listboxId}-option-${safeActiveIndex}`
      : undefined;

  useLayoutEffect(() => {
    if (!effectiveOpen || safeActiveIndex < 0) return;
    const option = optionRefs.current[safeActiveIndex];
    const menu = menuRef.current;
    if (!option || !menu) return;
    const optionRect = option.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    if (optionRect.top < menuRect.top) {
      menu.scrollTop -= menuRect.top - optionRect.top;
    } else if (optionRect.bottom > menuRect.bottom) {
      menu.scrollTop += optionRect.bottom - menuRect.bottom;
    }
  }, [effectiveOpen, safeActiveIndex]);

  const closeDropdown = useCallback((restoreTriggerFocus = false) => {
    setIsOpen(false);
    if (restoreTriggerFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  const openDropdown = useCallback(() => {
    if (disabled) return;
    const selectedIndex = normalized.findIndex((option) => selectedSet.has(option.value));
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : normalized.length > 0 ? 0 : -1);
    ignoreScrollCloseUntilRef.current = performance.now() + 400;
    setRenderMenu(true);
    setIsOpen(true);
  }, [disabled, normalized, selectedSet]);

  const selectOption = useCallback(
    (option: NormalizedOption) => {
      if (multiple) {
        const next = selectedSet.has(option.value)
          ? selectedValues.filter((id) => id !== option.value)
          : [...selectedValues, option.value];
        (onChange as (value: string[]) => void)(next);
        return;
      }
      (onChange as (value: string) => void)(option.value);
      closeDropdown(true);
    },
    [closeDropdown, multiple, onChange, selectedSet, selectedValues],
  );

  const selectAllOptions = useCallback(() => {
    if (!multiple) return;
    (onChange as (value: string[]) => void)(normalized.map((option) => option.value));
  }, [multiple, normalized, onChange]);

  const canClear = (multiple || clearable) && selectedValues.length > 0 && !disabled;

  const clearSelection = useCallback(
    (event?: React.SyntheticEvent) => {
      event?.preventDefault();
      event?.stopPropagation();
      if (multiple) {
        (onChange as (value: string[]) => void)([]);
      } else {
        (onChange as (value: string) => void)('');
      }
      closeDropdown(true);
    },
    [closeDropdown, multiple, onChange],
  );

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeDropdown(true);
        return;
      }

      if (filteredOptions.length === 0) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex((current) =>
          current < 0 ? 0 : Math.min(current + 1, filteredOptions.length - 1),
        );
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex((current) =>
          current < 0 ? filteredOptions.length - 1 : Math.max(current - 1, 0),
        );
      } else if (event.key === 'Home') {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex(filteredOptions.length - 1);
      } else if (event.key === 'Enter' && safeActiveIndex >= 0) {
        event.preventDefault();
        event.stopPropagation();
        selectOption(filteredOptions[safeActiveIndex]);
      }
    },
    [closeDropdown, filteredOptions, safeActiveIndex, selectOption],
  );

  return (
    <div
      ref={wrapperRef}
      id={id}
      tabIndex={id ? -1 : undefined}
      className={`${styles.select} ${themeClass} ${effectiveOpen ? styles.openRoot : ''} ${
        disabled ? styles.disabled : ''
      }`}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.selected} ${
          size === 'sm' ? styles.selectedSm : 'min-h-[44px]'
        } touch-manipulation ${canClear ? styles.selectedClearable : ''} ${className ?? ''}`}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          if (triggerRef.current) {
            const placement = computePortalMenuPlacement(
              triggerRef.current,
              Math.max(normalized.length, searchable ? 1 : 0) +
                (searchable ? 1 : 0) +
                (canClear ? 1 : 0),
              stickyHeaderInset,
              44,
            );
            setMenuPlacement(placement);
          }
          if (effectiveOpen) {
            closeDropdown();
          } else {
            openDropdown();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && effectiveOpen) {
            event.preventDefault();
            closeDropdown();
            return;
          }

          if (
            canClear &&
            (event.key === 'Backspace' || event.key === 'Delete') &&
            !effectiveOpen
          ) {
            event.preventDefault();
            clearSelection();
            return;
          }

          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!effectiveOpen) {
              openDropdown();
              return;
            }
            setActiveIndex((current) => {
              if (event.key === 'ArrowDown') {
                return current < 0
                  ? 0
                  : Math.min(current + 1, filteredOptions.length - 1);
              }
              return current < 0
                ? filteredOptions.length - 1
                : Math.max(current - 1, 0);
            });
            return;
          }

          if (
            !searchable &&
            effectiveOpen &&
            event.key === 'Enter' &&
            safeActiveIndex >= 0
          ) {
            event.preventDefault();
            selectOption(filteredOptions[safeActiveIndex]);
          }
        }}
        onBlur={() => {
          onBlur?.();
          if (!searchable && effectiveOpen) setIsOpen(false);
        }}
        role="combobox"
        aria-expanded={effectiveOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-labelledby={ariaLabelledBy}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
      >
        <span
          className={`${styles.selectedText} ${showPlaceholderStyle ? styles.placeholderText : ''}`}
        >
          {selectedLabel}
        </span>
        {canClear ? (
          <span
            role="button"
            tabIndex={-1}
            className={styles.clearChip}
            aria-label={clearLabel}
            title={clearLabel}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              clearSelection(event);
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>
        ) : null}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 512 512"
          width={12}
          height={12}
          className={`${styles.arrow} ${effectiveOpen ? styles.arrowOpen : ''}`}
          style={{ width: 12, height: 12, flexShrink: 0 }}
          aria-hidden
          focusable="false"
        >
          <path d="M233.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 338.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z" />
        </svg>
      </button>

      {renderMenu &&
      typeof document !== 'undefined' &&
      resolvedMenuPlacement
        ? createPortal(
            <FocusScope
              asChild
              loop={false}
              trapped={false}
              onMountAutoFocus={(event) => event.preventDefault()}
            >
            <div
              ref={menuRef}
              data-admin-radio-menu=""
              aria-hidden={!effectiveOpen || undefined}
              className={`${themeClass} ${styles.portalOptions} ${
                resolvedMenuPlacement.openUpward ? styles.portalOptionsUpward : ''
              } ${
                !effectiveOpen ? styles.portalOptionsClosing : ''
              }`}
              style={{
                top: resolvedMenuPlacement.top,
                left: resolvedMenuPlacement.left,
                width: resolvedMenuPlacement.width,
                maxHeight: resolvedMenuPlacement.maxHeight,
              }}
            >
              {searchable ? (
                <div
                  className={styles.searchWrap}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    ref={searchInputRef}
                    id={searchInputId}
                    type="text"
                    role="combobox"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setActiveIndex(0);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Tab') {
                        event.preventDefault();
                        closeDropdown();
                        window.requestAnimationFrame(() =>
                          focusAdjacentToTrigger(
                            triggerRef.current,
                            menuRef.current,
                            event.shiftKey,
                          ),
                        );
                        return;
                      }
                      handleSearchKeyDown(event);
                    }}
                    placeholder={searchPlaceholder}
                    className={styles.searchInput}
                    aria-label={ariaLabel ? `Search ${ariaLabel}` : searchPlaceholder}
                    aria-labelledby={ariaLabelledBy}
                    aria-expanded={effectiveOpen}
                    aria-controls={listboxId}
                    aria-autocomplete="list"
                    aria-activedescendant={activeOptionId}
                    autoComplete="off"
                    enterKeyHint="search"
                  />
                </div>
              ) : null}
              <div
                id={listboxId}
                role="listbox"
                aria-multiselectable={multiple || undefined}
                aria-label={ariaLabel ?? (ariaLabelledBy ? undefined : 'Select an option')}
                aria-labelledby={ariaLabelledBy}
                aria-live="polite"
                className={styles.optionList}
              >
                {multiple && normalized.length > 0 ? (
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedValues.length === normalized.length}
                    className={`${styles.option} ${styles.clearOption}`}
                    onMouseDown={preventMouseBlurDefault}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      selectAllOptions();
                    }}
                  >
                    <span className={styles.optionContent}>
                      <span className={styles.optionLabel}>Select all</span>
                    </span>
                  </button>
                ) : null}
                {canClear ? (
                  <button
                    type="button"
                    role="option"
                    aria-selected="false"
                    className={`${styles.option} ${styles.clearOption}`}
                    onMouseDown={preventMouseBlurDefault}
                    onClick={(event) => clearSelection(event)}
                  >
                    <span className={styles.optionContent}>
                      <span className={styles.optionLabel}>{clearLabel}</span>
                    </span>
                  </button>
                ) : null}
                {filteredOptions.length === 0 ? (
                  <div
                    className={styles.emptyState}
                    role="option"
                    aria-selected="false"
                    aria-disabled="true"
                  >
                    <span className={styles.emptyStateTitle}>No results found</span>
                    <span className={styles.emptyStateHint}>Try a different search term.</span>
                  </div>
                ) : null}
                {filteredOptions.map((option, index) => (
                  <button
                    key={`${option.value}-${index}`}
                    ref={(node) => {
                      optionRefs.current[index] = node;
                    }}
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={selectedSet.has(option.value)}
                    tabIndex={-1}
                    className={`${styles.option} min-h-[44px] touch-manipulation ${
                      selectedSet.has(option.value) ? styles.active : ''
                    } ${index === safeActiveIndex ? styles.highlighted : ''}`}
                    onPointerDown={(event) => {
                      if (event.pointerType === 'touch') {
                        event.preventDefault();
                      } else {
                        preventMouseBlurDefault(event);
                      }
                      event.stopPropagation();
                    }}
                    onPointerMove={() => setActiveIndex(index)}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      selectOption(option);
                    }}
                  >
                    <span className={styles.optionContent}>
                      {option.description ? (
                        <span className={styles.optionTwoLine}>
                          <span className={styles.optionLabel}>{option.label}</span>
                          <span className={styles.optionDescription}>{option.description}</span>
                        </span>
                      ) : (
                        <span className={styles.optionLabel}>{option.label}</span>
                      )}
                      <span
                        className={`${styles.checkmark} ${
                          selectedSet.has(option.value) ? styles.checkmarkVisible : ''
                        }`}
                        aria-hidden
                      >
                        <svg viewBox="0 0 20 20">
                          <path d="m4.5 10 3.25 3.25L15.5 5.5" />
                        </svg>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            </FocusScope>,
            document.body,
          )
        : null}
    </div>
  );
}

/** Same as {@link AdminRadioDropdown} — use on FRIS (light) pages. */
export const RadioDropdown = AdminRadioDropdown;
