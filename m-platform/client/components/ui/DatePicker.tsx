'use client';

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  bindPortaledMenuWheelLock,
  bindPortalScrollListeners,
} from '@/lib/portal-dropdown-scroll';
import { bindDeferredOutsidePointerDismiss } from '@/lib/deferred-outside-listener';
import { preventMouseBlurDefault } from '@/lib/prevent-mouse-blur';
import {
  PICKER_OUTSIDE_DISMISS_DELAY_MS,
  usePickerSheetGuard,
} from '@/lib/use-picker-sheet-guard';
import { isTouchPrimaryViewport } from '@/lib/touch-viewport';
import {
  clampPopoverPosition,
  COMPACT_PICKER_BACKDROP_CLASS,
  COMPACT_PICKER_SHEET_BASE_CLASS,
  useCompactPickerViewport,
} from '@/lib/use-compact-picker-viewport';
import { cn } from '@/lib/utils';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Approximate panel height for flip positioning (px). */
const PANEL_HEIGHT_EST = 272;
const PANEL_WIDTH = 256;

/** Scrollable menus stay usable; native scrollbar chrome is hidden (matches admin dropdowns). */
const SCROLLBAR_HIDDEN =
  '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';

export type DatePickerValueFormat = 'dd/MM/yyyy' | 'yyyy-MM-dd';

export type DatePickerVariant = 'default' | 'icon';
/** `dashboard` = FRIS dash surface; `uld` / `chr` / `batest` / `hr` / `safety` / `ams` / `cms` = module brand accents. */
export type DatePickerTheme =
  | 'default'
  | 'dashboard'
  | 'uld'
  | 'chr'
  | 'batest'
  | 'hr'
  | 'safety'
  | 'billing'
  | 'ams'
  | 'cms';

/** CSS custom properties for light-surface brand accents (portal + trigger). */
type DatePickerBrandStyle = React.CSSProperties & {
  ['--dp-accent']?: string;
  ['--dp-accent-hover']?: string;
  ['--dp-accent-soft']?: string;
  ['--dp-accent-soft-mid']?: string;
  ['--dp-accent-ink']?: string;
  ['--dp-ring']?: string;
  ['--dp-icon']?: string;
  ['--dp-border-accent']?: string;
  ['--dp-cta']?: string;
  ['--dp-cta-hover']?: string;
  ['--dp-cta-text']?: string;
};

const DATE_PICKER_BRAND: Record<
  'default' | 'uld' | 'chr' | 'batest' | 'hr' | 'safety' | 'billing' | 'ams' | 'cms',
  DatePickerBrandStyle
> = {
  default: {
    '--dp-accent': '#059669',
    '--dp-accent-hover': '#047857',
    '--dp-accent-soft': '#ecfdf5',
    '--dp-accent-soft-mid': '#d1fae5',
    '--dp-accent-ink': '#065f46',
    '--dp-ring': 'rgba(16, 185, 129, 0.25)',
    '--dp-icon': '#10b981',
    '--dp-border-accent': '#34d399',
    '--dp-cta': '#059669',
    '--dp-cta-hover': '#047857',
    '--dp-cta-text': '#ffffff',
  },
  /** ULD Coolors — maroon accent on navy chrome */
  uld: {
    '--dp-accent': '#840032',
    '--dp-accent-hover': '#6a0028',
    '--dp-accent-soft': 'rgba(132, 0, 50, 0.1)',
    '--dp-accent-soft-mid': 'rgba(132, 0, 50, 0.18)',
    '--dp-accent-ink': '#840032',
    '--dp-ring': 'rgba(132, 0, 50, 0.28)',
    '--dp-icon': '#840032',
    '--dp-border-accent': '#840032',
    '--dp-cta': '#840032',
    '--dp-cta-hover': '#6a0028',
    '--dp-cta-text': '#ffffff',
  },
  /** CHR — navy primary + lime CTA */
  chr: {
    '--dp-accent': '#03045E',
    '--dp-accent-hover': '#02033a',
    '--dp-accent-soft': 'rgba(184, 251, 60, 0.28)',
    '--dp-accent-soft-mid': 'rgba(184, 251, 60, 0.45)',
    '--dp-accent-ink': '#03045E',
    '--dp-ring': 'rgba(184, 251, 60, 0.45)',
    '--dp-icon': '#03045E',
    '--dp-border-accent': '#B8FB3C',
    '--dp-cta': '#B8FB3C',
    '--dp-cta-hover': '#9fd932',
    '--dp-cta-text': '#03045E',
  },
  /** BA Test — Yale Blue + Cream */
  batest: {
    '--dp-accent': '#124e78',
    '--dp-accent-hover': '#0c3552',
    '--dp-accent-soft': 'rgba(240, 240, 201, 0.55)',
    '--dp-accent-soft-mid': 'rgba(240, 240, 201, 0.85)',
    '--dp-accent-ink': '#124e78',
    '--dp-ring': 'rgba(18, 78, 120, 0.28)',
    '--dp-icon': '#124e78',
    '--dp-border-accent': '#124e78',
    '--dp-cta': '#124e78',
    '--dp-cta-hover': '#0c3552',
    '--dp-cta-text': '#ffffff',
  },
  /** HR — Yale Blue + Amber Gold */
  hr: {
    '--dp-accent': '#0d3959',
    '--dp-accent-hover': '#071d2c',
    '--dp-accent-soft': 'rgba(250, 193, 5, 0.22)',
    '--dp-accent-soft-mid': 'rgba(250, 193, 5, 0.38)',
    '--dp-accent-ink': '#0d3959',
    '--dp-ring': 'rgba(250, 193, 5, 0.45)',
    '--dp-icon': '#0d3959',
    '--dp-border-accent': '#fac105',
    '--dp-cta': '#fac105',
    '--dp-cta-hover': '#c89a04',
    '--dp-cta-text': '#0d3959',
  },
  /** Safety & Incident / TRP — navy + gold */
  safety: {
    '--dp-accent': '#00296B',
    '--dp-accent-hover': '#001e52',
    '--dp-accent-soft': 'rgba(0, 41, 107, 0.08)',
    '--dp-accent-soft-mid': 'rgba(0, 41, 107, 0.18)',
    '--dp-accent-ink': '#00296B',
    '--dp-ring': 'rgba(255, 213, 0, 0.6)',
    '--dp-icon': '#00296B',
    '--dp-border-accent': '#00296B',
    '--dp-cta': '#00296B',
    '--dp-cta-hover': '#001e52',
    '--dp-cta-text': '#ffffff',
  },
  /** AMS — hangar slate + safety orange */
  ams: {
    '--dp-accent': '#1b2838',
    '--dp-accent-hover': '#121a24',
    '--dp-accent-soft': 'rgba(255, 107, 53, 0.22)',
    '--dp-accent-soft-mid': 'rgba(255, 107, 53, 0.38)',
    '--dp-accent-ink': '#1b2838',
    '--dp-ring': 'rgba(255, 107, 53, 0.45)',
    '--dp-icon': '#1b2838',
    '--dp-border-accent': '#ff6b35',
    '--dp-cta': '#ff6b35',
    '--dp-cta-hover': '#e85a28',
    '--dp-cta-text': '#1b2838',
  },
  /** CMS — Fleet Aviation emerald + deep navy */
  cms: {
    '--dp-accent': '#059669',
    '--dp-accent-hover': '#047857',
    '--dp-accent-soft': '#ecfdf5',
    '--dp-accent-soft-mid': '#d1fae5',
    '--dp-accent-ink': '#065f46',
    '--dp-ring': 'rgba(16, 185, 129, 0.28)',
    '--dp-icon': '#0F172A',
    '--dp-border-accent': '#10B981',
    '--dp-cta': '#059669',
    '--dp-cta-hover': '#047857',
    '--dp-cta-text': '#ffffff',
  },
  /** Billing Calm Ledger — navy + sky */
  billing: {
    '--dp-accent': '#1c0770',
    '--dp-accent-hover': '#150558',
    '--dp-accent-soft': 'rgba(58, 154, 255, 0.12)',
    '--dp-accent-soft-mid': 'rgba(58, 154, 255, 0.22)',
    '--dp-accent-ink': '#1c0770',
    '--dp-ring': 'rgba(37, 99, 235, 0.28)',
    '--dp-icon': '#261cc1',
    '--dp-border-accent': '#3a9aff',
    '--dp-cta': '#1c0770',
    '--dp-cta-hover': '#150558',
    '--dp-cta-text': '#ffffff',
  },
};

function brandStyleForTheme(theme: DatePickerTheme): DatePickerBrandStyle {
  if (theme === 'uld') return DATE_PICKER_BRAND.uld;
  if (theme === 'chr') return DATE_PICKER_BRAND.chr;
  if (theme === 'batest') return DATE_PICKER_BRAND.batest;
  if (theme === 'hr') return DATE_PICKER_BRAND.hr;
  if (theme === 'safety') return DATE_PICKER_BRAND.safety;
  if (theme === 'billing') return DATE_PICKER_BRAND.billing;
  if (theme === 'ams') return DATE_PICKER_BRAND.ams;
  if (theme === 'cms') return DATE_PICKER_BRAND.cms;
  return DATE_PICKER_BRAND.default;
}

export interface DatePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Default dd/MM/yyyy. Use yyyy-MM-dd for API/input compatibility. */
  valueFormat?: DatePickerValueFormat;
  placeholder?: string;
  className?: string;
  /** Compact control: only a calendar icon; opens the same popover. */
  variant?: DatePickerVariant;
  /**
   * Visual skin:
   * - `default` — FRIS emerald accents
   * - `dashboard` — FRIS dashboard CSS vars
   * - `uld` — maroon / navy (ULD module)
   * - `chr` — navy / lime (CHR module)
   * - `batest` — Yale Blue / Cream (BA Test module)
   * - `safety` — navy / gold (Safety & Incident)
   * - `billing` — Calm Ledger navy / sky
   * - `ams` — hangar slate / safety orange (AMS module)
   * - `cms` — emerald / navy (Cab Management System)
   */
  theme?: DatePickerTheme;
  /** e.g. "Choose start date" for icon-only. */
  ariaLabel?: string;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  forceDark?: boolean;
  /** Month + year dropdowns in the header (default on; same as admin user forms). */
  showYearMonthSelect?: boolean;
  /** Inclusive dashboard range: highlights span (and endpoints) in the popover grid. */
  rangeFrom?: Date;
  rangeTo?: Date;
  /** Show Clear in the calendar footer (default true). */
  allowClear?: boolean;
}

/** Parse date string to Date or null. Supports dd/MM/yyyy, dd-MM-yyyy, yyyy-MM-dd. */
function parseValueToDate(str: string, format?: DatePickerValueFormat): Date | null {
  if (!str?.trim()) return null;
  const dateOnly = str.trim().split('T')[0] ?? str.trim();
  const parts = dateOnly.split(/[/-]/).map((p) => parseInt(p.trim(), 10));
  if (parts.length !== 3) return null;
  let d: number, m: number, y: number;
  if (format === 'yyyy-MM-dd') {
    [y, m, d] = [parts[0]!, parts[1]!, parts[2]!];
  } else {
    const [first, second, third] = parts;
    [d, m, y] = (first! <= 31 && second! <= 12) ? [first!, second!, third!] : [second!, first!, third!];
  }
  const date = new Date(y, (m ?? 1) - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

function formatDateToValue(date: Date, format: DatePickerValueFormat): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return format === 'yyyy-MM-dd' ? `${y}-${m}-${d}` : `${d}/${m}/${y}`;
}

function formatDateToDisplay(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function getDaysInMonth(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const days: (Date | null)[] = Array(startPad).fill(null);
  for (let day = 1; day <= last.getDate(); day++) {
    days.push(new Date(year, month, day));
  }
  return days;
}

function startOfCalendarDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Normalised inclusive bounds for range highlighting; null if nothing to draw or start > end. */
function normalizedRangeHighlight(
  rangeFrom: Date | undefined,
  rangeTo: Date | undefined,
): { lo: Date; hi: Date } | null {
  if (!rangeFrom && !rangeTo) return null;
  if (rangeFrom && !rangeTo) {
    const d = startOfCalendarDay(rangeFrom);
    return { lo: d, hi: d };
  }
  if (!rangeFrom && rangeTo) {
    const d = startOfCalendarDay(rangeTo);
    return { lo: d, hi: d };
  }
  const a = startOfCalendarDay(rangeFrom!);
  const b = startOfCalendarDay(rangeTo!);
  const t0 = a.getTime();
  const t1 = b.getTime();
  if (t0 > t1) return null;
  return { lo: a, hi: b };
}

function isDayInInclusiveRange(day: Date, lo: Date, hi: Date): boolean {
  const t = startOfCalendarDay(day).getTime();
  return t >= lo.getTime() && t <= hi.getTime();
}

function isBeforeMinDay(day: Date, minDate?: Date): boolean {
  if (!minDate) return false;
  return startOfCalendarDay(day).getTime() < startOfCalendarDay(minDate).getTime();
}

function isAfterMaxDay(day: Date, maxDate?: Date): boolean {
  if (!maxDate) return false;
  return startOfCalendarDay(day).getTime() > startOfCalendarDay(maxDate).getTime();
}

function isToday(d: Date): boolean {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

function yearRange(minDate?: Date, maxDate?: Date): number[] {
  const now = new Date().getFullYear();
  const minY = minDate?.getFullYear() ?? now - 100;
  const maxY = maxDate?.getFullYear() ?? now + 20;
  const years: number[] = [];
  for (let y = maxY; y >= minY; y -= 1) years.push(y);
  return years;
}

type HeaderSelectOption = { value: string; label: string };

function DatePickerHeaderSelect({
  value,
  onChange,
  options,
  ariaLabel,
  isDash,
  isDashDark,
  brandStyle,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: HeaderSelectOption[];
  ariaLabel: string;
  isDash: boolean;
  isDashDark: boolean;
  brandStyle?: DatePickerBrandStyle;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPlacement, setMenuPlacement] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? options[0]?.label ?? '';

  const updateMenuPlacement = useCallback(() => {
    const trigger = wrapperRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const preferredMax = 240;
    const spaceBelow = viewportH - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUpward = spaceBelow < 140 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(preferredMax, Math.max(openUpward ? spaceAbove - 6 : spaceBelow - 6, 120));
    let top = openUpward ? rect.top - maxHeight - 6 : rect.bottom + 6;
    top = Math.max(margin, Math.min(top, viewportH - maxHeight - margin));
    let left = rect.left;
    const width = Math.max(rect.width, 148);
    if (left + width > viewportW - margin) {
      left = Math.max(margin, viewportW - width - margin);
    }
    setMenuPlacement({ top, left, width, maxHeight });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPlacement();
  }, [open, updateMenuPlacement, value, options.length]);

  useLayoutEffect(() => {
    if (!open || !menuPlacement) return;
    const menu = menuRef.current;
    if (!menu) return;
    return bindPortaledMenuWheelLock(menu);
  }, [open, menuPlacement, options.length]);

  useEffect(() => {
    if (!open || !wrapperRef.current) return;

    const dismiss = () => setOpen(false);
    const unbindScroll = bindPortalScrollListeners(wrapperRef.current, {
      getMenu: () => menuRef.current,
      onScroll: isTouchPrimaryViewport() ? () => updateMenuPlacement() : dismiss,
      onViewportChange: updateMenuPlacement,
    });

    const onResize = () => updateMenuPlacement();
    window.addEventListener('resize', onResize);

    return () => {
      unbindScroll();
      window.removeEventListener('resize', onResize);
    };
  }, [open, updateMenuPlacement]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    const unbindPointer = bindDeferredOutsidePointerDismiss(onPointerDown, PICKER_OUTSIDE_DISMISS_DELAY_MS);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      unbindPointer();
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const triggerClass = cn(
    'flex w-full min-w-0 items-center justify-between gap-1 rounded-lg border px-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2',
    isDash
      ? 'h-7 text-xs font-semibold focus-visible:ring-emerald-500/30'
      : 'h-8 text-xs font-medium text-gray-900 focus-visible:ring-[color:var(--dp-ring)]',
    isDash
      ? isDashDark
        ? 'border-white/20 bg-white/[0.08] text-slate-100 hover:border-emerald-400/40 hover:bg-white/[0.12]'
        : 'border-[var(--dash-border)] bg-[var(--dash-card)] text-[var(--dash-text-strong)] hover:border-emerald-400/45 hover:bg-[var(--dash-hover-surface)]'
      : 'border-gray-200 bg-white hover:border-[var(--dp-border-accent)] hover:bg-[var(--dp-accent-soft)]',
    open &&
      (isDash
        ? isDashDark
          ? 'border-emerald-400/50 bg-white/[0.12] ring-1 ring-emerald-400/25'
          : 'border-emerald-400/60 bg-emerald-50/80 ring-1 ring-emerald-400/20'
        : 'border-[var(--dp-border-accent)] bg-[var(--dp-accent-soft)] ring-1 ring-[color:var(--dp-ring)]'),
    className,
  );

  const menuClass = cn(
    'pointer-events-auto fixed z-[10060] flex flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-xl border p-1 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.45)]',
    SCROLLBAR_HIDDEN,
    isDash
      ? isDashDark
        ? 'border-white/15 bg-[#0f172a] text-slate-100 ring-1 ring-white/10'
        : 'border-[var(--dash-border)] bg-[var(--dash-card)] text-[var(--dash-text)] ring-1 ring-slate-900/5'
      : 'border-slate-200/90 bg-white text-slate-800 ring-1 ring-slate-900/[0.06]',
  );

  const optionClass = (active: boolean) =>
    cn(
      'w-full shrink-0 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors',
      isDash
        ? isDashDark
          ? active
            ? 'bg-emerald-500/20 text-emerald-200'
            : 'text-slate-200 hover:bg-white/10'
          : active
            ? 'bg-emerald-500/15 text-emerald-800'
            : 'text-[var(--dash-text)] hover:bg-[var(--dash-hover-surface)]'
        : active
          ? 'bg-[var(--dp-accent-soft)] text-[var(--dp-accent-ink)]'
          : 'text-slate-700 hover:bg-slate-100',
    );

  return (
    <div ref={wrapperRef} className="relative min-w-0" style={isDash ? undefined : brandStyle}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => !prev);
          if (!open) requestAnimationFrame(() => updateMenuPlacement());
        }}
        className={triggerClass}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 opacity-70 transition-transform',
            open && 'rotate-180',
            isDash && isDashDark ? 'text-slate-300' : 'text-slate-500',
          )}
          aria-hidden
        />
      </button>
      {open && menuPlacement && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              aria-label={ariaLabel}
              data-datepicker-header-menu
              className={menuClass}
              style={{
                top: menuPlacement.top,
                left: menuPlacement.left,
                width: menuPlacement.width,
                maxHeight: menuPlacement.maxHeight,
                ...(isDash ? null : brandStyle),
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className={optionClass(option.value === value)}
                  onMouseDown={preventMouseBlurDefault}
                  onClick={(event) => {
                    event.stopPropagation();
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function DatePicker({
  id,
  value,
  onChange,
  valueFormat = 'dd/MM/yyyy',
  placeholder = 'DD/MM/YYYY',
  className = '',
  variant = 'default',
  theme = 'default',
  ariaLabel,
  disabled = false,
  minDate,
  maxDate,
  forceDark = false,
  showYearMonthSelect = true,
  rangeFrom,
  rangeTo,
  allowClear = true,
}: DatePickerProps) {
  const isDash = theme === 'dashboard';
  const isDashDark = isDash && forceDark;
  const brandStyle = brandStyleForTheme(theme);
  const isIcon = variant === 'icon';
  const [open, setOpen] = useState(false);
  /** Drives the enter transition: false on mount → true next frame so the panel scales/fades in. */
  const [entered, setEntered] = useState(false);
  /** When the panel flips above the trigger, scale from the bottom edge instead of the top. */
  const [openUpward, setOpenUpward] = useState(false);
  const compactSheet = useCompactPickerViewport();
  const { backdropReady, outsideDismissDelayMs } = usePickerSheetGuard(open, compactSheet);
  const ref = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const initial = parseValueToDate(value, valueFormat) || new Date();
  const [viewDate, setViewDate] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const selected = parseValueToDate(value, valueFormat);

  const updatePosition = useCallback(() => {
    if (!ref.current || compactSheet) return;
    const rect = ref.current.getBoundingClientRect();
    const margin = 8;
    const navbarHeight = 48;
    if (rect.bottom <= navbarHeight + margin) {
      setOpen(false);
      return;
    }
    const panelHeight = dropdownRef.current?.offsetHeight ?? PANEL_HEIGHT_EST;
    const panelWidth = dropdownRef.current?.offsetWidth ?? PANEL_WIDTH;
    const { top, left, openUpward: upward } = clampPopoverPosition({
      triggerRect: rect,
      panelWidth,
      panelHeight,
      margin,
      navbarHeight,
    });
    setOpenUpward(upward);
    setPosition({ top, left });
  }, [compactSheet]);

  useLayoutEffect(() => {
    if (!open || compactSheet) return;
    updatePosition();
  }, [open, compactSheet, updatePosition, viewDate, showYearMonthSelect]);

  useEffect(() => {
    if (!open || !ref.current || compactSheet) return;

    const handleScroll = () => updatePosition();
    const unbindScroll = bindPortalScrollListeners(ref.current, {
      getMenu: () => dropdownRef.current,
      shouldIgnoreEvent: (event) => {
        const target = event.target;
        return (
          target instanceof Element &&
          Boolean(
            target.closest('[data-datepicker-header-menu]') ||
              target.closest('[data-datepicker-panel]'),
          )
        );
      },
      onScroll: handleScroll,
      onViewportChange: updatePosition,
    });

    window.addEventListener('resize', handleScroll);
    return () => {
      unbindScroll();
      window.removeEventListener('resize', handleScroll);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (ref.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-datepicker-header-menu]')) {
        return;
      }
      setOpen(false);
    };

    const unbindPointer = bindDeferredOutsidePointerDismiss(handleClickOutside, outsideDismissDelayMs);
    return unbindPointer;
  }, [open, outsideDismissDelayMs]);

  const days = getDaysInMonth(viewDate.getFullYear(), viewDate.getMonth());
  const rangeBounds = normalizedRangeHighlight(rangeFrom, rangeTo);
  const years = yearRange(minDate, maxDate);

  const monthOptions = useMemo(
    () => MONTHS.map((label, idx) => ({ value: String(idx), label })),
    [],
  );
  const yearOptions = useMemo(
    () => years.map((y) => ({ value: String(y), label: String(y) })),
    [years],
  );

  const prevMonth = () => {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };
  const setToday = () => {
    const t = new Date();
    onChange(formatDateToValue(t, valueFormat));
    setViewDate(new Date(t.getFullYear(), t.getMonth(), 1));
    setOpen(false);
  };
  const clearDate = () => {
    onChange('');
    setOpen(false);
  };
  const handleDayClick = (d: Date) => {
    if (isBeforeMinDay(d, minDate) || isAfterMaxDay(d, maxDate)) return;
    onChange(formatDateToValue(d, valueFormat));
    setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
    setOpen(false);
  };

  const displayStr = selected ? formatDateToDisplay(selected) : '';
  const hasValue = Boolean(value?.trim());

  const getOpenViewDate = () => {
    const selectedDate = parseValueToDate(value, valueFormat);
    if (selectedDate) {
      return new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    }
    const bounds = normalizedRangeHighlight(rangeFrom, rangeTo);
    if (bounds) {
      return new Date(bounds.lo.getFullYear(), bounds.lo.getMonth(), 1);
    }
    return new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  };

  const toggleOpen = () => {
    if (disabled) return;
    const nextOpen = !open;
    if (nextOpen) {
      setViewDate(getOpenViewDate());
      setOpen(true);
      requestAnimationFrame(() => updatePosition());
      return;
    }
    setOpen(false);
  };

  return (
    <div
      ref={ref}
      className={cn('relative', isIcon ? 'inline-flex w-auto shrink-0' : 'w-full', className)}
      style={isDash ? undefined : brandStyle}
    >
      <button
        id={id}
        type="button"
        onClick={toggleOpen}
        disabled={disabled}
        aria-label={isIcon ? ariaLabel ?? placeholder : undefined}
        className={cn(
          'touch-manipulation',
          isIcon
            ? 'box-border inline-flex h-9 w-9 min-h-9 shrink-0 items-center justify-center rounded-lg border p-0 transition-[border-color,box-shadow,background-color] duration-150'
            : 'box-border flex h-10 min-h-10 w-full items-center gap-2 rounded-lg border border-slate-200/80 bg-white px-3 text-left text-sm font-medium text-slate-900',
          !isIcon &&
            'shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow,background-color] duration-150',
          !isIcon && 'hover:border-slate-300/90 hover:bg-slate-50/40',
          isDash &&
            isIcon && [
              isDashDark
                ? 'border-white/15 bg-white/[0.06] text-slate-100'
                : 'border-[var(--dash-border)] bg-[var(--dash-card)] text-[var(--dash-text-strong)]',
              'shadow-sm shadow-black/5',
              isDashDark
                ? 'hover:border-emerald-400/50 hover:bg-white/[0.12]'
                : 'hover:border-emerald-400/50 hover:bg-[var(--dash-hover-surface)]',
              'focus-visible:border-emerald-400/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25',
              hasValue && 'border-emerald-400/80 ring-1 ring-emerald-400/20',
            ],
          isDash && !isIcon && [
            isDashDark
              ? 'border-white/15 bg-white/[0.06] text-slate-100'
              : 'border-[var(--dash-border)] bg-[var(--dash-card)] text-[var(--dash-text-strong)]',
            'shadow-sm shadow-black/5',
            isDashDark
              ? 'hover:border-emerald-400/50 hover:bg-white/[0.12]'
              : 'hover:border-emerald-400/50 hover:bg-[var(--dash-hover-surface)]',
            'focus-visible:border-emerald-400/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25',
          ],
          !isDash &&
            isIcon && [
              'border-slate-200/80 bg-white text-slate-700',
              'shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
              'hover:border-[var(--dp-border-accent)] hover:bg-[var(--dp-accent-soft)]',
              'focus-visible:border-[var(--dp-border-accent)] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--dp-ring)]',
            ],
          !isDash &&
            !isIcon &&
            'focus-visible:border-[var(--dp-border-accent)] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--dp-ring)]',
          !isDash &&
            !isIcon &&
            hasValue &&
            'border-[var(--dp-border-accent)] ring-1 ring-[color:var(--dp-ring)]',
          'disabled:cursor-not-allowed disabled:opacity-55',
        )}
      >
        <Calendar
          className={cn(
            'h-4 w-4 shrink-0',
            isDash
              ? 'text-emerald-500'
              : 'text-[var(--dp-icon)]',
          )}
          aria-hidden
        />
        {!isIcon && (
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              displayStr
                ? isDash
                  ? isDashDark
                    ? 'text-slate-100'
                    : 'text-[var(--dash-text-strong)]'
                  : 'text-slate-900'
                : isDash
                  ? isDashDark
                    ? 'text-slate-400'
                    : 'text-[var(--dash-text-muted)]'
                  : 'text-slate-400 font-normal',
            )}
          >
            {displayStr || placeholder}
          </span>
        )}
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            {compactSheet && backdropReady ? (
              <button
                type="button"
                className={COMPACT_PICKER_BACKDROP_CLASS}
                aria-label="Close calendar"
                onClick={() => setOpen(false)}
              />
            ) : null}
            <div
            ref={dropdownRef}
            data-datepicker-panel
            className={cn(
              compactSheet
                ? cn(COMPACT_PICKER_SHEET_BASE_CLASS, 'max-w-md p-4')
                : 'pointer-events-auto fixed z-[10050] w-64 overflow-hidden rounded-xl p-3',
              !compactSheet &&
                'transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] will-change-transform',
              !compactSheet && (entered ? 'opacity-100 scale-100' : 'opacity-0 scale-95'),
              !compactSheet && 'motion-reduce:scale-100 motion-reduce:transition-opacity',
              isDash
                ? isDashDark
                  ? 'border border-white/15 bg-[#0b1220f2] text-slate-100 shadow-[0_22px_50px_-12px_rgba(0,0,0,0.55)] ring-1 ring-white/10 backdrop-blur-xl'
                  : 'border border-[var(--dash-border)] bg-[var(--dash-card)] text-[var(--dash-text)] shadow-[0_22px_50px_-12px_rgba(0,0,0,0.45)] ring-1 ring-white/5'
                : compactSheet
                  ? 'border-slate-200/90 bg-white text-slate-900'
                  : 'border border-slate-200/90 bg-white shadow-[0_22px_50px_-12px_rgba(15,23,42,0.28)] ring-1 ring-slate-900/[0.06]',
            )}
            style={
              compactSheet
                ? isDash
                  ? undefined
                  : brandStyle
                : {
                    top: position.top,
                    left: position.left,
                    transformOrigin: openUpward ? 'bottom left' : 'top left',
                    ...(isDash ? null : brandStyle),
                  }
            }
            role="dialog"
            aria-modal={compactSheet ? true : undefined}
            aria-label="Choose date"
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-1.5">
              <button
                type="button"
                onClick={prevMonth}
                className={cn(
                  'rounded-md p-1 transition-colors focus-visible:outline-none focus-visible:ring-2',
                  isDash
                    ? 'focus-visible:ring-emerald-500/30'
                    : 'focus-visible:ring-[color:var(--dp-ring)]',
                  isDash
                    ? isDashDark
                      ? 'text-slate-400 hover:bg-white/10 hover:text-slate-100'
                      : 'text-[var(--dash-text-muted)] hover:bg-[var(--dash-hover-surface)] hover:text-[var(--dash-text-strong)]'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
                )}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {showYearMonthSelect ? (
                <div
                  className="flex min-w-0 flex-1 items-center justify-center gap-1"
                  role="group"
                  aria-label="Month and year"
                >
                  <DatePickerHeaderSelect
                    ariaLabel="Month"
                    value={String(viewDate.getMonth())}
                    onChange={(next) => {
                      const month = Number(next);
                      setViewDate((d) => new Date(d.getFullYear(), month, 1));
                    }}
                    options={monthOptions}
                    isDash={isDash}
                    isDashDark={isDashDark}
                    brandStyle={brandStyle}
                    className={isDash ? 'max-w-[6.75rem]' : 'min-w-[5.5rem] max-w-[7.5rem] flex-1'}
                  />
                  <DatePickerHeaderSelect
                    ariaLabel="Year"
                    value={String(viewDate.getFullYear())}
                    onChange={(next) => {
                      const year = Number(next);
                      setViewDate((d) => new Date(year, d.getMonth(), 1));
                    }}
                    options={yearOptions}
                    isDash={isDash}
                    isDashDark={isDashDark}
                    brandStyle={brandStyle}
                    className={isDash ? 'max-w-[4.5rem]' : 'min-w-[3.75rem] max-w-[5.25rem]'}
                  />
                </div>
              ) : (
                <span
                  className={cn(
                    'text-center text-xs font-semibold tracking-tight',
                    isDash ? (isDashDark ? 'text-slate-100' : 'text-[var(--dash-text-strong)]') : 'text-slate-800',
                  )}
                >
                  {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
                </span>
              )}
              <button
                type="button"
                onClick={nextMonth}
                className={cn(
                  'rounded-md p-1 transition-colors focus-visible:outline-none focus-visible:ring-2',
                  isDash
                    ? 'focus-visible:ring-emerald-500/30'
                    : 'focus-visible:ring-[color:var(--dp-ring)]',
                  isDash
                    ? isDashDark
                      ? 'text-slate-400 hover:bg-white/10 hover:text-slate-100'
                      : 'text-[var(--dash-text-muted)] hover:bg-[var(--dash-hover-surface)] hover:text-[var(--dash-text-strong)]'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
                )}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {WEEKDAYS.map((wd) => (
                <div
                  key={wd}
                  className={cn(
                    'py-1 text-[9px] font-semibold uppercase tracking-wide',
                    isDash ? (isDashDark ? 'text-slate-400' : 'text-[var(--dash-text-muted)]') : 'text-slate-500',
                  )}
                >
                  {wd}
                </div>
              ))}
              {days.map((d, i) => {
                if (!d) return <div key={`pad-${i}`} className="min-h-8" />;
                const selectedDay = selected && isSameDay(d, selected);
                const today = isToday(d);
                const outOfRange = isBeforeMinDay(d, minDate) || isAfterMaxDay(d, maxDate);
                const inSelRange =
                  !outOfRange && rangeBounds && isDayInInclusiveRange(d, rangeBounds.lo, rangeBounds.hi);
                const isRangeEndLow = inSelRange && isSameDay(d, rangeBounds!.lo);
                const isRangeEndHigh = inSelRange && isSameDay(d, rangeBounds!.hi);
                const rangeEndpoint =
                  inSelRange && (isRangeEndLow || isRangeEndHigh) && rangeBounds!.lo.getTime() !== rangeBounds!.hi.getTime();
                return (
                  <button
                    key={d.getTime()}
                    type="button"
                    onClick={() => handleDayClick(d)}
                    disabled={!!outOfRange}
                    className={cn(
                      'min-h-8 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2',
                      isDash
                        ? 'focus-visible:ring-emerald-500/40'
                        : 'focus-visible:ring-[color:var(--dp-ring)]',
                      isDash
                        ? isDashDark
                          ? 'focus-visible:ring-offset-1 focus-visible:ring-offset-[#0b1220]'
                          : 'focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--dash-card)]'
                        : 'focus-visible:ring-offset-1',
                      outOfRange &&
                        (isDash
                          ? isDashDark
                            ? 'cursor-not-allowed text-slate-500/50'
                            : 'cursor-not-allowed text-[var(--dash-text-muted)]/40'
                          : 'cursor-not-allowed text-slate-300'),
                      !outOfRange &&
                        selectedDay &&
                        (isDash
                          ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/25 hover:bg-emerald-700'
                          : 'bg-[var(--dp-accent)] text-white shadow-sm hover:bg-[var(--dp-accent-hover)]'),
                      !outOfRange &&
                        !selectedDay &&
                        inSelRange &&
                        (isDash
                          ? isDashDark
                            ? rangeEndpoint
                              ? 'bg-emerald-500/35 text-emerald-50 ring-1 ring-emerald-400/50 hover:bg-emerald-500/45'
                              : 'rounded-md bg-emerald-500/18 text-emerald-100 hover:bg-emerald-500/28'
                            : rangeEndpoint
                              ? 'bg-emerald-500/25 text-emerald-900 ring-1 ring-emerald-500/50 hover:bg-emerald-500/35'
                              : 'rounded-md bg-emerald-500/12 text-[var(--dash-text-strong)] hover:bg-emerald-500/20'
                          : rangeEndpoint
                            ? 'bg-[var(--dp-accent-soft-mid)] text-[var(--dp-accent-ink)] ring-1 ring-[var(--dp-border-accent)] hover:bg-[var(--dp-accent-soft-mid)]'
                            : 'rounded-md bg-[var(--dp-accent-soft)] text-[var(--dp-accent-ink)] hover:bg-[var(--dp-accent-soft-mid)]'),
                      !outOfRange &&
                        !selectedDay &&
                        !inSelRange &&
                        today &&
                        (isDash
                          ? isDashDark
                            ? 'bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/40 hover:bg-emerald-500/30'
                            : 'bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-500/40 hover:bg-emerald-500/25'
                          : 'bg-[var(--dp-accent-soft)] text-[var(--dp-accent-ink)] ring-1 ring-[var(--dp-border-accent)] hover:bg-[var(--dp-accent-soft-mid)]'),
                      !outOfRange &&
                        !selectedDay &&
                        !inSelRange &&
                        !today &&
                        (isDash
                          ? isDashDark
                            ? 'text-slate-200 hover:bg-white/10'
                            : 'text-[var(--dash-text)] hover:bg-[var(--dash-hover-surface)]'
                          : 'text-slate-700 hover:bg-slate-100'),
                    )}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
            <div
              className={cn(
                'mt-2 flex gap-2 border-t pt-2',
                isDash ? (isDashDark ? 'border-white/10' : 'border-[var(--dash-border)]') : 'border-slate-100'
              )}
            >
              {allowClear ? (
                <button
                  type="button"
                  onClick={clearDate}
                  disabled={!hasValue}
                  className={cn(
                    'flex-1 rounded-md py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40',
                    isDash
                      ? isDashDark
                        ? 'bg-white/10 text-slate-100 hover:bg-white/15 focus-visible:ring-emerald-500/30'
                        : 'bg-[var(--dash-hover-surface)] text-[var(--dash-text-strong)] hover:bg-[var(--dash-surface)] focus-visible:ring-emerald-500/30'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 focus-visible:ring-[color:var(--dp-ring)]',
                  )}
                >
                  Clear
                </button>
              ) : null}
              <button
                type="button"
                onClick={setToday}
                className={cn(
                  'flex-1 rounded-md py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2',
                  isDash
                    ? isDashDark
                      ? 'bg-white/10 text-slate-100 hover:bg-white/15 focus-visible:ring-emerald-500/30'
                      : 'bg-[var(--dash-hover-surface)] text-[var(--dash-text-strong)] hover:bg-[var(--dash-surface)] focus-visible:ring-emerald-500/30'
                    : 'bg-[var(--dp-cta)] text-[var(--dp-cta-text)] hover:bg-[var(--dp-cta-hover)] focus-visible:ring-[color:var(--dp-ring)]',
                )}
              >
                Today
              </button>
            </div>
          </div>
          </>,
          document.body,
        )}
    </div>
  );
}

export default DatePicker;
