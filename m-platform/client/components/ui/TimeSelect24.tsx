'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCompactPickerViewport, clampPopoverPosition } from '@/lib/use-compact-picker-viewport';

/** Normalize time string to HH:mm or HH:mm:ss (24-hour). */
export function normalizeTime24(value: string, withSeconds = false): string {
  if (!value?.trim()) return withSeconds ? '00:00:00' : '00:00';
  const parts = value.trim().replace(/\./g, ':').split(':').map((p) => p.trim());
  const h = (parts[0] && /^\d{1,2}$/.test(parts[0]) ? parts[0].padStart(2, '0') : '00').slice(0, 2);
  const m = (parts[1] && /^\d{1,2}$/.test(parts[1]) ? parts[1].padStart(2, '0') : '00').slice(0, 2);
  const s = (parts[2] && /^\d{1,2}$/.test(parts[2]) ? parts[2].padStart(2, '0') : '00').slice(0, 2);
  return withSeconds ? `${h}:${m}:${s}` : `${h}:${m}`;
}

const HOURS_24 = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTES_ALL = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));
const SECONDS_ALL = MINUTES_ALL;

export type MinuteStep = 1 | 5 | 10 | 15 | 30;

function minuteListForStep(step: MinuteStep): string[] {
  if (step === 1) return MINUTES_ALL;
  const out: string[] = [];
  for (let i = 0; i < 60; i += step) {
    out.push(i.toString().padStart(2, '0'));
  }
  return out;
}

/** Merge stepped minutes with current value so odd minutes remain selectable in the list. */
function minuteColumnValues(step: MinuteStep, currentMinute: string): string[] {
  const base = minuteListForStep(step);
  if (base.includes(currentMinute)) return base;
  return [...base, currentMinute].sort((a, b) => Number(a) - Number(b));
}

function partsToTime(h: string, m: string, s?: string): string {
  if (s !== undefined) return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:${s.padStart(2, '0')}`;
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

function parseDraftFromValue(
  value: string,
  withSeconds: boolean,
  allowEmpty: boolean,
): { h: string; m: string; s: string } | null {
  if (allowEmpty && !String(value ?? '').trim()) return null;
  const n = normalizeTime24(value || '00:00', withSeconds);
  const [hh, mm, ss] = n.split(':');
  return {
    h: hh ?? '00',
    m: mm ?? '00',
    s: withSeconds ? ss ?? '00' : '00',
  };
}

function formatPreview(draft: { h: string; m: string; s: string } | null, withSeconds: boolean): string {
  if (!draft) return '—';
  return withSeconds ? `${draft.h}:${draft.m}:${draft.s}` : `${draft.h}:${draft.m}`;
}

export interface TimeSelect24Props {
  value: string;
  onChange: (v: string) => void;
  withSeconds?: boolean;
  className?: string;
  disabled?: boolean;
  /** When true, hour and minute can be cleared; onChange receives ''. Default true. */
  allowEmpty?: boolean;
  /** For <label htmlFor> on the trigger (accessibility). */
  hourSelectId?: string;
  compact?: boolean;
  title?: string;
  showClock?: boolean;
  /** Minute increments in the scroll column (1 = every minute 00–59). Default 1. */
  minuteStep?: MinuteStep;
  placeholder?: string;
  /** `batest` = Yale Blue / Cream. `safety` = navy / gold. Default emerald FRIS. */
  theme?: 'default' | 'batest' | 'safety';
}

type ColumnKind = 'hour' | 'minute' | 'second';

function useClientReady() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function ScrollColumn({
  label,
  items,
  value,
  onChange,
  listboxId,
  activeDescendantId,
  compact,
  onFocusColumn,
  onColumnKeyDown,
  theme = 'default',
}: {
  label: string;
  items: string[];
  value: string;
  onChange: (v: string) => void;
  listboxId: string;
  activeDescendantId: string | undefined;
  compact: boolean;
  onFocusColumn: () => void;
  onColumnKeyDown: (e: React.KeyboardEvent) => void;
  theme?: 'default' | 'batest' | 'safety';
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  const batest = theme === 'batest';
  const safety = theme === 'safety';

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [value]);

  return (
    <div className={cn('flex min-h-0 w-[4.25rem] shrink-0 flex-col gap-1 sm:w-[4.5rem]', compact && 'w-16 sm:w-[4.25rem]')}>
      <span className="text-center text-[10px] font-medium uppercase tracking-wide text-gray-500">{label}</span>
      <div
        id={listboxId}
        role="listbox"
        tabIndex={0}
        aria-label={label}
        aria-activedescendant={activeDescendantId}
        onFocus={onFocusColumn}
        onKeyDown={onColumnKeyDown}
        className={cn(
          'max-h-[min(220px,40vh)] overflow-y-auto rounded-xl border border-[#E5E7EB] bg-white/80 py-1.5 pl-1 pr-2',
          '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
          'scroll-py-2 snap-y snap-mandatory shadow-inner shadow-gray-100/80 outline-none',
          safety
            ? 'focus-visible:ring-2 focus-visible:ring-[rgba(255,213,0,0.55)] focus-visible:ring-offset-0'
            : batest
              ? 'focus-visible:ring-2 focus-visible:ring-[rgba(18,78,120,0.35)] focus-visible:ring-offset-0'
              : 'focus-visible:ring-2 focus-visible:ring-emerald-400/80 focus-visible:ring-offset-0',
          compact ? 'max-h-[min(180px,36vh)]' : '',
        )}
      >
        <div className="flex flex-col gap-px pr-0.5">
          {items.map((item) => {
            const selected = item === value;
            const optId = `${listboxId}-opt-${item}`;
            return (
              <button
                key={item}
                id={optId}
                ref={selected ? selectedRef : undefined}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onChange(item)}
                className={cn(
                  'min-h-9 shrink-0 snap-center rounded-md px-1 py-1.5 text-center text-[13px] font-semibold tabular-nums transition-colors duration-150',
                  'outline-none focus-visible:ring-2 focus-visible:ring-offset-0',
                  safety
                    ? 'focus-visible:ring-[rgba(255,213,0,0.55)]'
                    : batest
                      ? 'focus-visible:ring-[rgba(18,78,120,0.35)]'
                      : 'focus-visible:ring-emerald-400/80',
                  selected
                    ? safety
                      ? 'bg-[#00296B] text-white shadow-[0_2px_10px_-3px_rgba(0,41,107,0.45)]'
                      : batest
                        ? 'bg-gradient-to-br from-[#1a5f8f] to-[#124e78] text-white shadow-[0_2px_10px_-3px_rgba(18,78,120,0.45)]'
                        : 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-[0_2px_10px_-3px_rgba(16,185,129,0.45)]'
                    : safety
                      ? 'text-gray-700 hover:bg-[rgba(255,213,0,0.22)] hover:text-[#00296B]'
                      : batest
                        ? 'text-gray-700 hover:bg-[rgba(240,240,201,0.55)] hover:text-[#124e78]'
                        : 'text-gray-700 hover:bg-emerald-500/[0.07] hover:text-gray-900',
                )}
              >
                {item}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * 24-hour time picker: scroll columns; choosing hour/minute (or sec) applies immediately — light SaaS styling.
 */
export function TimeSelect24({
  value,
  onChange,
  withSeconds = false,
  className = '',
  disabled = false,
  allowEmpty = true,
  hourSelectId,
  compact = false,
  title,
  showClock = false,
  minuteStep = 1,
  placeholder = 'Select time',
  theme = 'default',
}: TimeSelect24Props) {
  const uid = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const batest = theme === 'batest';
  const safety = theme === 'safety';

  const [open, setOpen] = useState(false);
  const clientReady = useClientReady();
  const compactSheet = useCompactPickerViewport();
  const [draft, setDraft] = useState<{ h: string; m: string; s: string } | null>(null);
  const draftRef = useRef<{ h: string; m: string; s: string } | null>(null);
  const [focusColumn, setFocusColumn] = useState<ColumnKind>('hour');

  const hourListboxId = `${uid}-hours`;
  const minuteListboxId = `${uid}-minutes`;
  const secondListboxId = `${uid}-seconds`;

  const hydratePanelFromValue = useCallback(() => {
    const d = parseDraftFromValue(value, withSeconds, allowEmpty);
    draftRef.current = d;
    setDraft(d);
    setFocusColumn('hour');
  }, [value, withSeconds, allowEmpty]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => document.getElementById(hourListboxId)?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, hourListboxId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0, width: 168 });

  const updatePosition = useCallback(() => {
    if (compactSheet) return;
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.bottom <= 56) {
      setOpen(false);
      return;
    }
    const panelW = withSeconds ? 240 : 168;
    const panelH = panelRef.current?.offsetHeight ?? 260;
    const margin = 8;
    const { top } = clampPopoverPosition({
      triggerRect: r,
      panelWidth: panelW,
      panelHeight: panelH,
      margin,
      navbarHeight: 48,
    });
    let left = r.left + (r.width - panelW) / 2;
    if (left + panelW > window.innerWidth - margin) left = window.innerWidth - panelW - margin;
    if (left < margin) left = margin;
    setPopoverPos({ top, left, width: panelW });
  }, [compactSheet, withSeconds]);

  useLayoutEffect(() => {
    if (!open || compactSheet) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- popover position follows trigger layout measurements
    updatePosition();
  }, [open, compactSheet, updatePosition]);

  useEffect(() => {
    if (!open || compactSheet) return;
    const onWin = () => updatePosition();
    window.addEventListener('scroll', onWin, true);
    window.addEventListener('resize', onWin);
    return () => {
      window.removeEventListener('scroll', onWin, true);
      window.removeEventListener('resize', onWin);
    };
  }, [open, compactSheet, updatePosition]);

  const activeDescendantFor = (kind: ColumnKind): string | undefined => {
    if (!draft || focusColumn !== kind) return undefined;
    if (kind === 'hour') return `${hourListboxId}-opt-${draft.h}`;
    if (kind === 'minute') return `${minuteListboxId}-opt-${draft.m}`;
    return `${secondListboxId}-opt-${draft.s}`;
  };

  const moveInList = (kind: ColumnKind, delta: number) => {
    const base = draft ?? { h: '00', m: '00', s: '00' };
    const list =
      kind === 'hour' ? HOURS_24 : kind === 'minute' ? minuteColumnValues(minuteStep, base.m) : SECONDS_ALL;
    const cur = kind === 'hour' ? base.h : kind === 'minute' ? base.m : base.s;
    let idx = list.indexOf(cur);
    if (idx < 0) idx = 0;
    const nextIdx = Math.min(list.length - 1, Math.max(0, idx + delta));
    const nextVal = list[nextIdx];
    const nextDraft =
      kind === 'hour'
        ? { ...base, h: nextVal }
        : kind === 'minute'
          ? { ...base, m: nextVal }
          : { ...base, s: nextVal };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  };

  const applyAndClose = useCallback(
    (d: { h: string; m: string; s: string } | null) => {
      if (!d) {
        if (allowEmpty) onChange('');
        setOpen(false);
        return;
      }
      if (withSeconds) onChange(partsToTime(d.h, d.m, d.s));
      else onChange(partsToTime(d.h, d.m));
      setOpen(false);
    },
    [allowEmpty, onChange, withSeconds],
  );

  const handleColumnKeyDown = (e: React.KeyboardEvent, kind: ColumnKind) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveInList(kind, 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveInList(kind, -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const d = draftRef.current ?? { h: '00', m: '00', s: '00' };
      applyAndClose(d);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (kind === 'hour') setFocusColumn('minute');
      else if (kind === 'minute' && withSeconds) setFocusColumn('second');
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (kind === 'minute') setFocusColumn('hour');
      else if (kind === 'second') setFocusColumn('minute');
    }
  };

  const displayValue =
    allowEmpty && !String(value ?? '').trim()
      ? null
      : String(value ?? '').trim()
        ? formatPreview(parseDraftFromValue(value, withSeconds, false), withSeconds)
        : null;

  const triggerClass = cn(
    'flex w-full min-w-0 items-center justify-between gap-2 rounded-2xl border bg-white text-left text-sm font-semibold tabular-nums text-gray-900 shadow-[0_1px_3px_rgba(15,23,42,0.06)]',
    'transition-[box-shadow,border-color,background-color] duration-200',
    'focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
    safety
      ? 'border-[rgba(0,41,107,0.28)] text-[#00296B] hover:border-[#FFD500] hover:bg-[rgba(255,213,0,0.18)] focus-visible:border-[#00296B] focus-visible:ring-[3px] focus-visible:ring-[rgba(255,213,0,0.4)]'
      : batest
        ? 'border-[rgba(18,78,120,0.28)] text-[#124e78] hover:border-[#124e78] hover:bg-[rgba(240,240,201,0.4)] focus-visible:border-[#124e78] focus-visible:ring-[3px] focus-visible:ring-[rgba(18,78,120,0.22)]'
        : 'border-emerald-300 hover:border-emerald-400 hover:bg-emerald-50/40 focus-visible:border-emerald-500 focus-visible:ring-[3px] focus-visible:ring-emerald-500/20',
    compact ? 'h-9 px-3' : 'h-11 px-4',
    className,
  );

  const panelBody = (
    <div
      className={cn(
        'flex flex-col text-gray-900',
        compactSheet ? 'max-h-[min(72vh,520px)] overflow-y-auto overscroll-contain px-4 py-4' : 'px-3 py-3',
      )}
    >
      <div className={cn('flex justify-center gap-2', withSeconds && 'gap-1.5')}>
        <ScrollColumn
          label="Hour"
          items={HOURS_24}
          value={draft?.h ?? '00'}
          onChange={(h) => {
            const base = draft ?? { h: '00', m: '00', s: '00' };
            const next = { ...base, h };
            draftRef.current = next;
            setDraft(next);
          }}
          listboxId={hourListboxId}
          activeDescendantId={activeDescendantFor('hour')}
          compact={compact}
          theme={theme}
          onFocusColumn={() => setFocusColumn('hour')}
          onColumnKeyDown={(e) => handleColumnKeyDown(e, 'hour')}
        />
        <ScrollColumn
          label="Minute"
          items={minuteColumnValues(minuteStep, draft?.m ?? '00')}
          value={draft?.m ?? '00'}
          onChange={(m) => {
            const base = draft ?? { h: '00', m: '00', s: '00' };
            const next = { ...base, m };
            draftRef.current = next;
            setDraft(next);
            if (!withSeconds) applyAndClose(next);
          }}
          listboxId={minuteListboxId}
          activeDescendantId={activeDescendantFor('minute')}
          compact={compact}
          theme={theme}
          onFocusColumn={() => setFocusColumn('minute')}
          onColumnKeyDown={(e) => handleColumnKeyDown(e, 'minute')}
        />
        {withSeconds ? (
          <ScrollColumn
            label="Sec"
            items={SECONDS_ALL}
            value={draft?.s ?? '00'}
            onChange={(s) => {
              const base = draft ?? { h: '00', m: '00', s: '00' };
              const next = { ...base, s };
              draftRef.current = next;
              setDraft(next);
              applyAndClose(next);
            }}
            listboxId={secondListboxId}
            activeDescendantId={activeDescendantFor('second')}
            compact={compact}
            theme={theme}
            onFocusColumn={() => setFocusColumn('second')}
            onColumnKeyDown={(e) => handleColumnKeyDown(e, 'second')}
          />
        ) : null}
      </div>
      {allowEmpty ? (
        <div className="mt-3 flex gap-2 border-t border-gray-200/80 pt-3">
          <button
            type="button"
            onClick={() => applyAndClose(null)}
            disabled={!String(value ?? '').trim()}
            className={cn(
              'flex-1 rounded-xl bg-gray-100 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]',
              safety
                ? 'focus-visible:ring-[rgba(0,41,107,0.3)]'
                : batest
                  ? 'focus-visible:ring-[rgba(18,78,120,0.3)]'
                  : 'focus-visible:ring-emerald-500/30',
            )}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => {
              const d = draftRef.current ?? draft ?? { h: '00', m: '00', s: '00' };
              applyAndClose(d);
            }}
            className={cn(
              'flex-1 rounded-xl py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 active:scale-[0.98]',
              safety
                ? 'bg-[#FFD500] text-[#00296B] hover:bg-[#e6c000] focus-visible:ring-[rgba(255,213,0,0.55)]'
                : batest
                  ? 'bg-[#124e78] text-white hover:bg-[#0c3552] focus-visible:ring-[rgba(18,78,120,0.4)]'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500/40',
            )}
          >
            Done
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        id={hourSelectId}
        type="button"
        disabled={disabled}
        title={title}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (disabled) return;
          if (open) {
            setOpen(false);
            return;
          }
          hydratePanelFromValue();
          setOpen(true);
        }}
        className={triggerClass}
      >
        <span className="flex min-w-0 items-center gap-2">
          {showClock ? (
            <Clock
              className={cn(
                'shrink-0',
                safety ? 'text-[#00296B]' : batest ? 'text-[#124e78]' : 'text-emerald-500',
                compact ? 'h-4 w-4' : 'h-[18px] w-[18px]',
              )}
              aria-hidden
            />
          ) : null}
          <span className={cn('truncate', !displayValue && 'font-medium text-gray-400')}>
            {displayValue ?? placeholder}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'shrink-0 transition-transform duration-200',
            safety ? 'text-[#00296B]' : batest ? 'text-[#124e78]' : 'text-emerald-500',
            compact ? 'h-4 w-4' : 'h-[18px] w-[18px]',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {clientReady &&
        createPortal(
          <AnimatePresence>
            {open ? (
              <>
                <motion.div
                  key="time-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className={cn(
                    'fixed inset-0 z-[10049]',
                    compactSheet ? 'bg-gray-900/20 backdrop-blur-[2px]' : 'pointer-events-none bg-transparent',
                  )}
                  aria-hidden
                  onClick={compactSheet ? () => setOpen(false) : undefined}
                />
                <motion.div
                  key="time-panel"
                  ref={panelRef}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Select time"
                  initial={{ opacity: 0, y: compactSheet ? 24 : 8, scale: compactSheet ? 1 : 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: compactSheet ? 16 : 6, scale: compactSheet ? 1 : 0.98 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className={cn(
                    'overflow-hidden border border-[#E5E7EB] bg-[#F9FAFB]/92 text-gray-900 shadow-[0_24px_48px_-12px_rgba(15,23,42,0.18)] backdrop-blur-md',
                    // 10050 matches DatePicker / SearchableCombobox so the panel clears
                    // dialog layers (portalled modals sit at z-110…z-200).
                    compactSheet
                      ? 'fixed inset-x-0 bottom-0 z-[10050] max-h-[min(80vh,480px)] rounded-t-3xl rounded-b-none pb-[max(0.75rem,env(safe-area-inset-bottom))]'
                      : 'fixed z-[10050] max-h-[min(340px,90vh)] rounded-2xl',
                  )}
                  style={
                    compactSheet
                      ? undefined
                      : {
                          top: popoverPos.top,
                          left: popoverPos.left,
                          width: popoverPos.width,
                        }
                  }
                >
                  {panelBody}
                </motion.div>
              </>
            ) : null}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

export default TimeSelect24;
