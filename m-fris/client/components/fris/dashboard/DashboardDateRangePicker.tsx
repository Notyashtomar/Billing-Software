'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  clampPopoverPosition,
  COMPACT_PICKER_BACKDROP_CLASS,
  COMPACT_PICKER_SHEET_BASE_CLASS,
  useCompactPickerViewport,
} from '@/lib/use-compact-picker-viewport';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const PANEL_HEIGHT_EST = 340;
const SINGLE_MONTH_W = 288;
const DUAL_GAP = 12;
/** Two month grids + padding (matches `w-72` × 2 + gap). */
const DUAL_PANEL_WIDTH = SINGLE_MONTH_W * 2 + DUAL_GAP + 32;

const HOVER_CLOSE_MS = 220;

function parseYmd(iso: string): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, mo, d] = iso.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

function toYmd(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${y}-${m}-${d}`;
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

function isToday(d: Date): boolean {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

export interface DashboardDateRangePickerProps {
  fromDate: string;
  toDate: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  minDate?: Date;
  maxDate?: Date;
  /** If From/To are empty, opening uses these months for the grids (yyyy-MM-dd). */
  fallbackFromYmd?: string;
  fallbackToYmd?: string;
  /** Human-readable range (e.g. “12 Jan 2025 → 15 Mar 2025”) shown beside the calendar control. */
  periodLabel: string;
  /** Slightly shorter trigger to align with compact dashboard header controls. */
  compact?: boolean;
}

export function DashboardDateRangePicker({
  fromDate,
  toDate,
  onFromChange,
  onToChange,
  minDate,
  maxDate,
  fallbackFromYmd,
  fallbackToYmd,
  periodLabel,
  compact = false,
}: DashboardDateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const compactSheet = useCompactPickerViewport();

  const fbFrom = useMemo(
    () => (fallbackFromYmd ? parseYmd(fallbackFromYmd) : null),
    [fallbackFromYmd],
  );
  const fbTo = useMemo(
    () => (fallbackToYmd ? parseYmd(fallbackToYmd) : null),
    [fallbackToYmd],
  );
  const [leftMonth, setLeftMonth] = useState(() =>
    fbFrom ? new Date(fbFrom.getFullYear(), fbFrom.getMonth(), 1) : new Date(),
  );
  const [rightMonth, setRightMonth] = useState(() =>
    fbTo ? new Date(fbTo.getFullYear(), fbTo.getMonth(), 1) : new Date(),
  );

  const selectedFrom = parseYmd(fromDate.trim());
  const selectedTo = parseYmd(toDate.trim());
  const rangeBounds = normalizedRangeHighlight(selectedFrom ?? undefined, selectedTo ?? undefined);

  useEffect(() => {
    const f = parseYmd(fromDate.trim());
    const t = parseYmd(toDate.trim());
    if (f) setLeftMonth(new Date(f.getFullYear(), f.getMonth(), 1));
    if (t) setRightMonth(new Date(t.getFullYear(), t.getMonth(), 1));
  }, [fromDate, toDate]);

  /** When opening before values exist, show fallback months so the default span is visible. */
  useEffect(() => {
    if (!open) return;
    if (!fromDate.trim() && fbFrom) {
      setLeftMonth(new Date(fbFrom.getFullYear(), fbFrom.getMonth(), 1));
    }
    if (!toDate.trim() && fbTo) {
      setRightMonth(new Date(fbTo.getFullYear(), fbTo.getMonth(), 1));
    }
  }, [open, fromDate, toDate, fbFrom, fbTo]);

  const cancelScheduledClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelScheduledClose();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, HOVER_CLOSE_MS);
  }, [cancelScheduledClose]);

  const openPanel = useCallback(() => {
    cancelScheduledClose();
    setOpen(true);
  }, [cancelScheduledClose]);

  const updatePosition = useCallback(() => {
    if (!rootRef.current || compactSheet) return;
    const rect = rootRef.current.getBoundingClientRect();
    const margin = 8;
    const navbarHeight = 48;
    const panelHeight = dropdownRef.current?.offsetHeight ?? PANEL_HEIGHT_EST;
    const panelWidth = dropdownRef.current?.offsetWidth ?? DUAL_PANEL_WIDTH;
    const { top, left } = clampPopoverPosition({
      triggerRect: rect,
      panelWidth,
      panelHeight,
      margin,
      navbarHeight,
    });
    setPosition({ top, left });
  }, [compactSheet]);

  useLayoutEffect(() => {
    if (!open || compactSheet) return;
    updatePosition();
  }, [open, compactSheet, updatePosition, leftMonth, rightMonth]);

  useEffect(() => {
    if (open && !compactSheet) updatePosition();
  }, [open, compactSheet, updatePosition]);

  useEffect(() => {
    if (!open || compactSheet) return;
    const handleScrollOrResize = () => updatePosition();
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  useEffect(
    () => () => {
      cancelScheduledClose();
    },
    [cancelScheduledClose],
  );

  const handleFromDay = (d: Date) => {
    if (minDate && d < minDate) return;
    if (maxDate && d > maxDate) return;
    onFromChange(toYmd(d));
  };

  const handleToDay = (d: Date) => {
    if (minDate && d < minDate) return;
    if (maxDate && d > maxDate) return;
    onToChange(toYmd(d));
  };

  const hasRange = Boolean(fromDate.trim() && toDate.trim());

  return (
    <div
      ref={rootRef}
      className="inline-flex max-w-full min-w-0 items-stretch justify-end"
      onMouseEnter={compactSheet ? undefined : openPanel}
      onMouseLeave={compactSheet ? undefined : scheduleClose}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`${periodLabel}. Open calendar to change dates.`}
        aria-expanded={open}
        className={cn(
          'box-border inline-flex max-w-full min-w-0 items-center gap-2 rounded-lg border py-0 transition-[border-color,box-shadow,background-color] duration-150',
          compact ? 'h-8 px-2' : 'h-9 px-2.5',
          'border-[var(--dash-border)] bg-[var(--dash-card)] text-[var(--dash-text-strong)]',
          'shadow-sm shadow-black/5',
          'hover:border-emerald-400/50 hover:bg-[var(--dash-hover-surface)]',
          'focus-visible:border-emerald-400/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25',
          hasRange && 'border-emerald-400/80 ring-1 ring-emerald-400/20',
        )}
      >
        <span
          aria-live="polite"
          className={cn(
            'min-w-0 flex-1 truncate text-left font-medium leading-snug tabular-nums',
            compact ? 'text-[11px] sm:text-[12px]' : 'text-[12px] sm:text-[13px]',
            hasRange ? 'text-[var(--dash-text-strong)]' : 'text-[var(--dash-text-muted)]'
          )}
        >
          {periodLabel}
        </span>
        <Calendar className={cn('shrink-0 text-emerald-500', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} aria-hidden />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            {compactSheet ? (
              <button
                type="button"
                className={COMPACT_PICKER_BACKDROP_CLASS}
                aria-label="Close calendar"
                onClick={() => setOpen(false)}
              />
            ) : null}
            <div
            ref={dropdownRef}
            className={cn(
              compactSheet
                ? cn(
                    COMPACT_PICKER_SHEET_BASE_CLASS,
                    'flex max-w-lg flex-col gap-4 p-4 text-[var(--dash-text)]',
                    'border-[var(--dash-border)] bg-[var(--dash-card)]',
                  )
                : 'fixed z-[10050] flex max-w-[calc(100vw-16px)] gap-3 overflow-x-auto rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-card)] p-4 text-[var(--dash-text)] shadow-[0_22px_50px_-12px_rgba(0,0,0,0.45)] ring-1 ring-white/5',
            )}
            style={
              compactSheet
                ? undefined
                : { top: position.top, left: position.left, width: DUAL_PANEL_WIDTH }
            }
            role="dialog"
            aria-modal={compactSheet ? true : undefined}
            aria-label="Choose from and to dates"
            onMouseEnter={compactSheet ? undefined : cancelScheduledClose}
            onMouseLeave={compactSheet ? undefined : scheduleClose}
          >
            <DualMonthColumn
              label="From"
              viewMonth={leftMonth}
              setViewMonth={setLeftMonth}
              selected={selectedFrom}
              rangeBounds={rangeBounds}
              minDate={minDate}
              maxDate={maxDate}
              onDayClick={handleFromDay}
            />
            <DualMonthColumn
              label="To"
              viewMonth={rightMonth}
              setViewMonth={setRightMonth}
              selected={selectedTo}
              rangeBounds={rangeBounds}
              minDate={minDate}
              maxDate={maxDate}
              onDayClick={handleToDay}
            />
          </div>
          </>,
          document.body,
        )}
    </div>
  );
}

function dayTimestamp(d: Date): number {
  return startOfCalendarDay(d).getTime();
}

function DualMonthColumn({
  label,
  viewMonth,
  setViewMonth,
  selected,
  rangeBounds,
  minDate,
  maxDate,
  onDayClick,
}: {
  label: string;
  viewMonth: Date;
  setViewMonth: React.Dispatch<React.SetStateAction<Date>>;
  selected: Date | null;
  rangeBounds: { lo: Date; hi: Date } | null;
  minDate?: Date;
  maxDate?: Date;
  onDayClick: (d: Date) => void;
}) {
  const days = getDaysInMonth(viewMonth.getFullYear(), viewMonth.getMonth());
  const prevMonth = () => setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  return (
    <div className="w-72 shrink-0">
      <p className="mb-2 text-center text-[13px] font-bold uppercase tracking-wide text-[var(--dash-text-soft)]">
        {label}
      </p>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={prevMonth}
          className="rounded-lg p-1.5 text-[var(--dash-text-muted)] transition-colors hover:bg-[var(--dash-hover-surface)] hover:text-[var(--dash-text-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-center text-sm font-semibold tracking-tight text-[var(--dash-text-strong)]">
          {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="rounded-lg p-1.5 text-[var(--dash-text-muted)] transition-colors hover:bg-[var(--dash-hover-surface)] hover:text-[var(--dash-text-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
          aria-label="Next month"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((wd) => (
          <div
            key={wd}
            className="py-1.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--dash-text-muted)]"
          >
            {wd}
          </div>
        ))}
        {days.map((d, i) => {
          if (!d) return <div key={`pad-${i}`} className="min-h-[2.25rem]" />;
          const t = dayTimestamp(d);
          const minTs = minDate ? dayTimestamp(minDate) : null;
          const maxTs = maxDate ? dayTimestamp(maxDate) : null;
          /** Outside loaded-data bounds; clicks may still clamp via parent. */
          const outsideDataBounds =
            (minTs !== null && t < minTs) || (maxTs !== null && t > maxTs);
          const selectedDay = selected && isSameDay(d, selected);
          const today = isToday(d);
          /** Always paint the active STA range, even when part of it lies outside min/max (e.g. Feb pick when JSON only has March). */
          const inSelRange =
            Boolean(rangeBounds) && isDayInInclusiveRange(d, rangeBounds!.lo, rangeBounds!.hi);
          const isRangeEndLow = inSelRange && isSameDay(d, rangeBounds!.lo);
          const isRangeEndHigh = inSelRange && isSameDay(d, rangeBounds!.hi);
          const rangeEndpoint =
            inSelRange &&
            (isRangeEndLow || isRangeEndHigh) &&
            rangeBounds!.lo.getTime() !== rangeBounds!.hi.getTime();
          return (
            <button
              key={d.getTime()}
              type="button"
              onClick={() => onDayClick(d)}
              disabled={outsideDataBounds}
              className={cn(
                'min-h-9 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--dash-card)]',
                outsideDataBounds &&
                  !inSelRange &&
                  !selectedDay &&
                  'cursor-not-allowed text-[var(--dash-text-muted)]/40',
                selectedDay &&
                  'bg-emerald-600 text-white shadow-sm shadow-emerald-600/25 hover:bg-emerald-700',
                !selectedDay &&
                  inSelRange &&
                  (rangeEndpoint
                    ? 'bg-emerald-500/25 text-emerald-900 ring-1 ring-emerald-500/50 hover:bg-emerald-500/35'
                    : 'rounded-md bg-emerald-500/12 text-[var(--dash-text-strong)] hover:bg-emerald-500/20'),
                !selectedDay &&
                  !inSelRange &&
                  today &&
                  'bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-500/40 hover:bg-emerald-500/25',
                !selectedDay &&
                  !inSelRange &&
                  !today &&
                  'text-[var(--dash-text)] hover:bg-[var(--dash-hover-surface)]',
                outsideDataBounds &&
                  inSelRange &&
                  !selectedDay &&
                  'opacity-[0.92]',
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
