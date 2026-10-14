'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
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
const PANEL_WIDTH = 288;
const PANEL_HEIGHT_EST = 360;

type DateRangePickerProps = {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

function parseDdMmYyyy(str: string): Date | null {
  if (!str?.trim()) return null;
  const [d, m, y] = str.trim().split(/[/-]/).map((p) => Number(p.trim()));
  if (!d || !m || !y) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function toDdMmYyyy(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function sameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function inRange(d: Date, from: Date | null, to: Date | null): boolean {
  if (!from || !to) return false;
  return d >= from && d <= to;
}

function getDaysInMonth(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const days: (Date | null)[] = Array(startPad).fill(null);
  for (let day = 1; day <= last.getDate(); day++) days.push(new Date(year, month, day));
  return days;
}

export function DateRangePicker({
  from,
  to,
  onFromChange,
  onToChange,
  placeholder = 'Date range',
  className = '',
  disabled = false,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [selectingEnd, setSelectingEnd] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const compactSheet = useCompactPickerViewport();

  const fromDate = parseDdMmYyyy(from);
  const toDate = parseDdMmYyyy(to);
  const [viewDate, setViewDate] = useState(() => {
    const base = fromDate ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const displayValue = useMemo(() => {
    if (fromDate && toDate) return `${toDdMmYyyy(fromDate)} - ${toDdMmYyyy(toDate)}`;
    return '';
  }, [fromDate, toDate]);

  const updatePosition = useCallback(() => {
    if (!ref.current || compactSheet) return;
    const rect = ref.current.getBoundingClientRect();
    const navbarHeight = 48;
    if (rect.bottom <= navbarHeight + 8) {
      setOpen(false);
      return;
    }
    const panelHeight = dropdownRef.current?.offsetHeight ?? PANEL_HEIGHT_EST;
    const panelWidth = dropdownRef.current?.offsetWidth ?? PANEL_WIDTH;
    const { top, left } = clampPopoverPosition({
      triggerRect: rect,
      panelWidth,
      panelHeight,
      margin: 8,
      navbarHeight,
    });
    setPosition({ top, left });
  }, [compactSheet]);

  useLayoutEffect(() => {
    if (!open || compactSheet) return;
    updatePosition();
  }, [open, compactSheet, updatePosition, viewDate, selectingEnd]);

  useEffect(() => {
    if (!open || compactSheet) return;
    const onMove = () => updatePosition();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, compactSheet, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const prevMonth = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  const days = getDaysInMonth(viewDate.getFullYear(), viewDate.getMonth());

  const handleDayClick = (d: Date) => {
    if (!selectingEnd) {
      onFromChange(toDdMmYyyy(d));
      onToChange(toDdMmYyyy(d));
      setSelectingEnd(true);
      return;
    }

    const anchor = fromDate ?? d;
    if (d < anchor) {
      onFromChange(toDdMmYyyy(d));
      onToChange(toDdMmYyyy(anchor));
    } else {
      onToChange(toDdMmYyyy(d));
    }
    setSelectingEnd(false);
    setOpen(false);
  };

  const clearRange = () => {
    onFromChange('');
    onToChange('');
    setSelectingEnd(false);
  };

  const toggleOpen = () => {
    if (disabled) return;
    const nextOpen = !open;
    if (nextOpen) {
      const base = fromDate ?? new Date();
      setViewDate(new Date(base.getFullYear(), base.getMonth(), 1));
      setSelectingEnd(false);
      setOpen(true);
      if (!compactSheet) {
        requestAnimationFrame(() => updatePosition());
      }
      return;
    }
    setOpen(false);
  };

  const calendarPanel = (
    <>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold text-slate-800">
          {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Next month"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="mb-2 text-xs text-slate-500">
        {selectingEnd ? 'Select end date' : 'Select start date'}
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="py-1 text-xs font-medium text-slate-500">
            {wd}
          </div>
        ))}
        {days.map((d, i) => {
          if (!d) return <div key={`pad-${i}`} />;
          const isStart = sameDay(d, fromDate);
          const isEnd = sameDay(d, toDate);
          const isMid = inRange(d, fromDate, toDate) && !isStart && !isEnd;

          return (
            <button
              key={d.getTime()}
              type="button"
              onClick={() => handleDayClick(d)}
              className={`rounded-lg py-2 text-sm transition ${
                isStart || isEnd
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : isMid
                    ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
                    : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={clearRange}
          className="w-full rounded-lg bg-slate-100 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
        >
          Done
        </button>
      </div>
    </>
  );

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={toggleOpen}
        disabled={disabled}
        className="box-border flex h-10 min-h-10 w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-left text-sm text-gray-900 transition-colors hover:border-gray-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Calendar className="h-4 w-4 shrink-0 text-gray-400" />
        <span className={displayValue ? 'text-gray-900' : 'text-gray-400'}>
          {displayValue || placeholder}
        </span>
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
                  ? cn(COMPACT_PICKER_SHEET_BASE_CLASS, 'max-w-md p-4')
                  : 'fixed z-[10050] w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl ring-1 ring-slate-900/5',
              )}
              style={compactSheet ? undefined : { top: position.top, left: position.left }}
              role="dialog"
              aria-modal={compactSheet ? true : undefined}
              aria-label="Choose date range"
            >
              {calendarPanel}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

export default DateRangePicker;
