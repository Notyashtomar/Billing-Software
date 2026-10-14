'use client';

import { memo } from 'react';
import {
  ExternalLink,
  FileText,
  Lock,
  Plane,
  Unlock,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NonScheduledFlightData } from './types';
import { resolveNonScheduledFlightStatus } from './adaptNonScheduledFlight';
import type { NonScheduledReportType } from './nonScheduledReportDownloads';
import { openNonScheduledReportPreview } from './nonScheduledReportPreview';

interface NonScheduledFlightsTableProps {
  data: NonScheduledFlightData[];
  onOpenRow?: (flight: NonScheduledFlightData) => void;
  /** From dashboard deep-link (`?serialNo=`) — matching rows get an orange outline. */
  highlightSerial?: string;
}

function formatDateTime(date: string, time: string): string {
  const d = String(date ?? '').trim();
  const t = String(time ?? '').trim();
  if (d && t) return `${d} ${t}`;
  return d || t || '—';
}

function matchesHighlightSerial(
  flight: NonScheduledFlightData,
  highlightSerial: string,
): boolean {
  const wanted = highlightSerial.trim();
  if (!wanted) return false;
  const serial = String(flight.flightSerialNo ?? flight.sNo ?? '').trim();
  return serial === wanted;
}

function isLockedValue(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'locked' || s === '1';
}

const HEADERS = [
  { label: 'Open', width: '9%' },
  { label: 'S.No', width: '7%' },
  { label: 'Flight No', width: '11%' },
  { label: 'Airline', width: '12%' },
  { label: 'Aircraft Code', width: '11%' },
  { label: 'STA', width: '11%' },
  { label: 'STD', width: '11%' },
  { label: 'Locks', width: '13%' },
  { label: 'Actions', width: '15%' },
] as const;

const REPORT_ACTIONS = [
  {
    type: 'fhr',
    label: 'FHR',
    icon: FileText,
    className: 'border-blue-500 bg-blue-500 text-white hover:border-blue-600 hover:bg-blue-600',
  },
  {
    type: 'gse',
    label: 'GSE',
    icon: Wrench,
    className: 'border-amber-500 bg-amber-500 text-white hover:border-amber-600 hover:bg-amber-600',
  },
  {
    type: 'team',
    label: 'Team',
    icon: Users,
    className: 'border-emerald-500 bg-emerald-500 text-white hover:border-violet-600 hover:bg-violet-600',
  },
] as const satisfies ReadonlyArray<{
  type: NonScheduledReportType;
  label: string;
  icon: typeof FileText;
  className: string;
}>;

const LOCK_HINTS = {
  ramp: {
    locked: 'Ramp details — saved (locked)',
    unlocked: 'Fill: Ramp details — Open → Ramp → Ramp details',
  },
  pax: {
    locked: 'Terminal (Pax) details — saved (locked)',
    unlocked: 'Fill: Terminal details — Open → Terminal details',
  },
  gsd: {
    locked: 'Equipment / Manpower — saved and GSD verified (locked)',
    unlocked: 'Fill: Equipment / Manpower — Open → Equipment/Manpower (verify as GSD)',
  },
} as const;

function rowSurfaceClass(status: string, cancelled: boolean) {
  return cancelled
    ? 'bg-red-200 hover:bg-red-50'
    : status === 'Closed'
      ? 'bg-emerald-200 hover:bg-slate-100'
      : 'bg-yellow-200/90 hover:bg-yellow-100';
}

function openButtonClass(status: string, cancelled: boolean) {
  return cancelled
    ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500'
    : status === 'Closed'
      ? 'bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500'
      : 'bg-yellow-500 hover:bg-yellow-600 focus-visible:ring-yellow-500';
}

function airlineLabel(flight: NonScheduledFlightData): string {
  return String(flight.airline || flight.airlineCode || '').trim() || '—';
}

function NonScheduledFlightsTable({
  data,
  onOpenRow,
  highlightSerial = '',
}: NonScheduledFlightsTableProps) {
  const handleOpenReportPreview = (
    flight: NonScheduledFlightData,
    reportType: NonScheduledReportType,
  ) => {
    openNonScheduledReportPreview(flight, reportType);
  };

  const getLockIcon = (isLocked: boolean, hint: { locked: string; unlocked: string }) => {
    const title = isLocked ? hint.locked : hint.unlocked;
    return (
      <span title={title} className="inline-flex cursor-help rounded p-0.5" aria-label={title}>
        {isLocked ? (
          <Lock className="h-4 w-4 text-emerald-600" aria-hidden />
        ) : (
          <Unlock className="h-4 w-4 text-red-600" aria-hidden />
        )}
      </span>
    );
  };

  const getCancelledLockIcon = (label: string) => {
    const title = `${label} form not required for cancelled flight`;
    return (
      <span title={title} className="inline-flex cursor-help rounded p-0.5" aria-label={title}>
        <X className="h-4 w-4 text-red-600" aria-hidden />
      </span>
    );
  };

  const renderLocks = (flight: NonScheduledFlightData, cancelled: boolean) => (
    <div className="flex items-center justify-center gap-3">
      <div className="flex flex-col items-center">
        <span className="mb-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-500">
          Ramp
        </span>
        {cancelled
          ? getCancelledLockIcon('Ramp')
          : getLockIcon(isLockedValue(flight.rampLocked), LOCK_HINTS.ramp)}
      </div>
      <div className="flex flex-col items-center">
        <span className="mb-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-500">
          Pax
        </span>
        {cancelled
          ? getCancelledLockIcon('Pax')
          : getLockIcon(isLockedValue(flight.paxLocked), LOCK_HINTS.pax)}
      </div>
      <div className="flex flex-col items-center">
        <span className="mb-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-500">
          GSD
        </span>
        {cancelled
          ? getCancelledLockIcon('GSD')
          : getLockIcon(isLockedValue(flight.gsdLocked), LOCK_HINTS.gsd)}
      </div>
    </div>
  );

  const renderStatusButton = (
    flight: NonScheduledFlightData,
    status: string,
    cancelled: boolean,
    size: 'card' | 'table',
  ) => (
    <button
      type="button"
      onClick={() => onOpenRow?.(flight)}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1 font-semibold text-white shadow-sm transition-[background-color,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
        size === 'card'
          ? 'min-h-9 gap-1.5 rounded-lg px-3 text-xs focus-visible:ring-offset-2'
          : 'min-h-8 rounded-md px-1.5 text-[10px] xl:text-[11px]',
        openButtonClass(status, cancelled),
      )}
      aria-label={`${status} flight ${flight.flightNo || flight.sNo}`}
    >
      <ExternalLink className={size === 'card' ? 'h-3.5 w-3.5' : 'h-3 w-3'} aria-hidden />
      {status}
    </button>
  );

  const renderReportButtons = (flight: NonScheduledFlightData, size: 'card' | 'table') => (
    <div className={cn(size === 'card' ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-3 gap-1')}>
      {REPORT_ACTIONS.map((action) => (
        <button
          key={action.type}
          type="button"
          onClick={() => handleOpenReportPreview(flight, action.type)}
          className={cn(
            'inline-flex items-center justify-center gap-1 rounded-md border font-semibold transition-[background-color,transform] duration-150 active:scale-[0.97]',
            size === 'card'
              ? 'min-h-10 gap-1.5 rounded-lg px-2 text-xs'
              : 'min-h-8 px-1 text-[10px] xl:text-[11px]',
            action.className,
          )}
          aria-label={`Open ${action.label} report preview for ${flight.flightNo || flight.sNo}`}
        >
          <action.icon className={size === 'card' ? 'h-3.5 w-3.5' : 'h-3 w-3'} aria-hidden />
          {action.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="w-full min-w-0">
      <div className="grid gap-3 p-3 lg:hidden">
        {data.map((flight, index) => {
          const hl = matchesHighlightSerial(flight, highlightSerial);
          const status = resolveNonScheduledFlightStatus(flight);
          const cancelled = status === 'Cancelled';
          return (
            <article
              key={`${flight.bookingKey || flight.bookingNo || flight.flightNo}-${flight.sNo}-${index}-card`}
              className={cn(
                'min-w-0 rounded-xl border border-slate-200 p-3 shadow-sm',
                rowSurfaceClass(status, cancelled),
                hl && 'ring-2 ring-orange-500 ring-inset',
              )}
            >
              <div className="flex min-w-0 items-start justify-between gap-3 border-b border-black/5 pb-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-sky-700">
                    {flight.flightNo || 'Flight number unavailable'}
                  </p>
                  <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-600">
                    {airlineLabel(flight)}
                  </p>
                </div>
                {renderStatusButton(flight, status, cancelled, 'card')}
              </div>

              <dl className="mt-3 grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 text-xs">
                {[
                  ['S.No', flight.sNo || '—'],
                  ['Aircraft Code', flight.aircraft || '—'],
                  ['STA', formatDateTime(flight.staDate, flight.staTime)],
                  ['STD', formatDateTime(flight.stdDate, flight.stdTime)],
                ].map(([label, value]) => (
                  <div key={String(label)} className="min-w-0">
                    <dt className="font-medium text-slate-500">{label}</dt>
                    <dd
                      className={cn(
                        'mt-0.5 break-words font-medium',
                        cancelled ? 'text-red-700' : 'text-slate-800',
                      )}
                    >
                      {value}
                    </dd>
                  </div>
                ))}
                <div className="col-span-2 min-w-0">
                  <dt className="mb-1 font-medium text-slate-500">Locks</dt>
                  <dd>{renderLocks(flight, cancelled)}</dd>
                </div>
              </dl>

              <div className="mt-3 border-t border-black/5 pt-3">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Actions
                </p>
                {renderReportButtons(flight, 'card')}
              </div>
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-hidden rounded-b-2xl bg-white lg:block">
        <table className="w-full table-fixed border-separate border-spacing-0 text-left">
          <colgroup>
            {HEADERS.map((header) => (
              <col key={header.label} style={{ width: header.width }} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-slate-100">
              {HEADERS.map((header) => (
                <th
                  key={header.label}
                  scope="col"
                  className="whitespace-nowrap border-b border-slate-200 bg-slate-100 px-2 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.03em] text-slate-600 xl:px-3 xl:text-[11px]"
                >
                  {header.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((flight, index) => {
              const hl = matchesHighlightSerial(flight, highlightSerial);
              const status = resolveNonScheduledFlightStatus(flight);
              const cancelled = status === 'Cancelled';
              return (
                <tr
                  key={`${flight.bookingKey || flight.bookingNo || flight.flightNo}-${flight.sNo}-${index}`}
                  className={cn(
                    'group h-[4.5rem] transition-colors',
                    rowSurfaceClass(status, cancelled),
                    hl &&
                      'relative z-[1] shadow-[inset_0_0_0_1px_rgba(249,115,22,0.35)] ring-2 ring-orange-500 ring-inset',
                  )}
                >
                  <td className="border-b border-black/5 px-2 py-3 text-center align-middle xl:px-3">
                    {renderStatusButton(flight, status, cancelled, 'table')}
                  </td>

                  <td className="whitespace-nowrap border-b border-black/5 px-2 py-3 text-center align-middle text-xs font-semibold tabular-nums text-slate-900 xl:px-3 xl:text-sm">
                    {flight.sNo || '—'}
                  </td>

                  <td className="border-b border-black/5 px-2 py-3 text-center align-middle xl:px-3">
                    <span className="whitespace-nowrap text-xs font-semibold text-sky-700 xl:text-sm">
                      {flight.flightNo || '—'}
                    </span>
                  </td>

                  <td className="border-b border-black/5 px-2 py-3 text-center align-middle xl:px-3">
                    <span
                      className="line-clamp-2 break-words text-xs font-semibold uppercase text-slate-800 xl:text-sm"
                      title={airlineLabel(flight)}
                    >
                      {airlineLabel(flight)}
                    </span>
                  </td>

                  <td className="whitespace-nowrap border-b border-black/5 px-2 py-3 text-center align-middle text-xs text-slate-700 xl:px-3 xl:text-sm">
                    {flight.aircraft || '—'}
                  </td>

                  <td className="border-b border-black/5 px-2 py-3 text-center align-middle xl:px-3">
                    <div className="flex flex-col items-center gap-0.5">
                      <span
                        className={cn(
                          'whitespace-nowrap text-xs font-medium tabular-nums xl:text-sm',
                          cancelled ? 'text-red-700' : 'text-slate-900',
                        )}
                      >
                        {flight.staDate || '—'}
                      </span>
                      <span className="text-[11px] tabular-nums text-slate-500 xl:text-xs">
                        {flight.staTime || '—'}
                      </span>
                    </div>
                    <span className="sr-only">{formatDateTime(flight.staDate, flight.staTime)}</span>
                  </td>

                  <td className="border-b border-black/5 px-2 py-3 text-center align-middle xl:px-3">
                    <div className="flex flex-col items-center gap-0.5">
                      <span
                        className={cn(
                          'whitespace-nowrap text-xs font-medium tabular-nums xl:text-sm',
                          cancelled ? 'text-red-700' : 'text-slate-900',
                        )}
                      >
                        {flight.stdDate || '—'}
                      </span>
                      <span className="text-[11px] tabular-nums text-slate-500 xl:text-xs">
                        {flight.stdTime || '—'}
                      </span>
                    </div>
                    <span className="sr-only">{formatDateTime(flight.stdDate, flight.stdTime)}</span>
                  </td>

                  <td className="border-b border-black/5 px-2 py-3 text-center align-middle xl:px-3">
                    {renderLocks(flight, cancelled)}
                  </td>

                  <td className="border-b border-black/5 px-2 py-3 align-middle xl:px-3">
                    {renderReportButtons(flight, 'table')}
                  </td>
                </tr>
              );
            })}

            {data.length === 0 ? (
              <tr>
                <td colSpan={HEADERS.length} className="px-4 py-14 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center">
                    <div className="mb-3 rounded-full bg-slate-100 p-3">
                      <Plane className="h-7 w-7 text-slate-400" aria-hidden />
                    </div>
                    <h3 className="text-base font-semibold text-slate-900">No flights found</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Widen the STA date filter, or add a Non-Scheduled booking with challan for
                      the active station. MAA also has seeded Excel FHR rows (Feb–Jul 2026).
                    </p>
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default memo(NonScheduledFlightsTable);
