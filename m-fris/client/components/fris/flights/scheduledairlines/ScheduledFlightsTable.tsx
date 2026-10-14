'use client';

import React from 'react';
import {
  FlightData,
  displayScheduledAirlinesTableSerial,
  resolveScheduledAirlinesFlightStatus,
  scheduledAirlinesRowDedupeKey,
  scheduledAirlinesRowDomId,
  serialSearchMatches,
} from '@/utils/dataProcessor';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock, Unlock, Plane, ExternalLink, Eye, ClipboardList, ListChecks, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  data: FlightData[];
  onOpenRow?: (flight: FlightData) => void;
  onViewReport?: (flight: FlightData) => void;
  onViewFHRReport?: (flight: FlightData) => void;
  onViewEquipment?: (flight: FlightData) => void;
  onViewDetailedEquipment?: (flight: FlightData) => void;
  /** From `?highlightSerial=` — matching rows get an orange outline. */
  highlightSerial?: string;
  /** Per-button visibility from admin permission flags (default visible). */
  canViewFHR?: boolean;
  canViewGSE?: boolean;
  canViewTeam?: boolean;
}

const ScheduledFlightsTable: React.FC<Props> = ({
  data,
  onOpenRow,
  onViewReport,
  onViewFHRReport,
  onViewEquipment,
  onViewDetailedEquipment,
  highlightSerial = '',
  canViewFHR = true,
  canViewGSE = true,
  canViewTeam = true,
}) => {
  const isLockedValue = (v: unknown) => {
    const s = String(v ?? '').trim().toLowerCase();
    return s === 'true' || s === 'yes' || s === 'locked' || s === '1';
  };

  const getFlightStatus = resolveScheduledAirlinesFlightStatus;

  const lockHints = {
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

  const getLockIcon = (isLocked: boolean, hint: { locked: string; unlocked: string }) => {
    const title = isLocked ? hint.locked : hint.unlocked;
    return (
      <span
        title={title}
        className="inline-flex cursor-help rounded p-0.5"
        aria-label={title}
      >
        {isLocked ? (
          <Lock className="w-4 h-4 text-emerald-600" aria-hidden />
        ) : (
          <Unlock className="w-4 h-4 text-red-600" aria-hidden />
        )}
      </span>
    );
  };

  const getCancelledLockIcon = (label: string) => {
    const title = `${label} form not required for cancelled flight`;
    return (
      <span
        title={title}
        className="inline-flex cursor-help rounded p-0.5"
        aria-label={title}
      >
        <X className="w-4 h-4 text-red-600" aria-hidden />
      </span>
    );
  };

  const rowSurfaceClass = (status: string, cancelled: boolean) =>
    cancelled
      ? 'bg-red-200 hover:bg-red-50'
      : status === 'Closed'
        ? 'bg-emerald-200 hover:bg-slate-100'
        : 'bg-yellow-200/90 hover:bg-yellow-100';

  const openButtonClass = (status: string, cancelled: boolean) =>
    cancelled
      ? 'bg-red-600 hover:bg-red-700'
      : status === 'Closed'
        ? 'bg-emerald-600 hover:bg-emerald-700'
        : 'bg-yellow-500 hover:bg-yellow-600';

  const renderOpenButton = (flight: FlightData, status: string, cancelled: boolean) => (
    <motion.button
      type="button"
      onClick={() => onOpenRow?.(flight)}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={cn(
        'inline-flex items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-white transition-colors whitespace-nowrap',
        openButtonClass(status, cancelled),
      )}
    >
      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      {status}
    </motion.button>
  );

  const renderActionButtons = (flight: FlightData) => (
    <div className="flex flex-wrap items-center gap-1.5">
      {canViewFHR && (
        <motion.button
          type="button"
          onClick={() => onViewReport?.(flight)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="inline-flex items-center gap-1 rounded bg-blue-500 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-600 shrink-0"
        >
          <Eye className="h-3.5 w-3.5 shrink-0" />
          FHR
        </motion.button>
      )}
      {canViewGSE && (
        <motion.button
          type="button"
          onClick={() => onViewEquipment?.(flight)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="inline-flex items-center gap-1 rounded bg-amber-500 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-amber-600 shrink-0"
        >
          <ClipboardList className="h-3.5 w-3.5 shrink-0" />
          GSE
        </motion.button>
      )}
      {canViewTeam && (
        <motion.button
          type="button"
          onClick={() => onViewDetailedEquipment?.(flight)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="inline-flex items-center justify-center gap-1 rounded bg-emerald-500 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-violet-600 shrink-0"
        >
          <ListChecks className="h-3.5 w-3.5 shrink-0" />
          Team
        </motion.button>
      )}
      {!canViewFHR && !canViewGSE && !canViewTeam && (
        <span className="text-xs text-gray-400">—</span>
      )}
    </div>
  );

  const renderCategoryBadge = (flight: FlightData) => {
    const category = String(flight.cateOfFlight ?? '').trim();
    if (!category) return <span className="text-sm text-gray-400">—</span>;
    const lower = category.toLowerCase();
    const intl =
      lower.includes('international') || lower === 'sip' || lower === 'sif';
    const dom =
      lower.startsWith('domestic') ||
      lower === 'sdp' ||
      lower === 'sdf' ||
      (lower.includes('domestic') && !intl);
    const badgeClass = intl
      ? 'bg-purple-100 text-purple-800'
      : dom
        ? 'bg-blue-100 text-blue-800'
        : 'bg-slate-100 text-slate-800';
    return (
      <span
        className={cn('rounded px-2 py-1 text-sm font-medium', badgeClass)}
        title="Category of flight (from FHR / main details)"
      >
        {category}
      </span>
    );
  };

  const renderLocks = (flight: FlightData, cancelled: boolean) => (
    <div className="flex items-center gap-4">
      <div className="flex flex-col items-center">
        <span className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-500">Ramp</span>
        {cancelled
          ? getCancelledLockIcon('Ramp')
          : getLockIcon(isLockedValue(flight.rampLocked), lockHints.ramp)}
      </div>
      <div className="flex flex-col items-center">
        <span className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-500">Pax</span>
        {cancelled
          ? getCancelledLockIcon('Pax')
          : getLockIcon(isLockedValue(flight.paxLocked), lockHints.pax)}
      </div>
      <div className="flex flex-col items-center">
        <span className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-500">GSD</span>
        {cancelled
          ? getCancelledLockIcon('GSD')
          : getLockIcon(isLockedValue(flight.gsdLocked), lockHints.gsd)}
      </div>
    </div>
  );

  const emptyState = (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-4 rounded-full bg-gray-100 p-3">
        <Plane className="h-8 w-8 text-gray-400" />
      </div>
      <h3 className="mb-2 text-lg font-medium text-gray-900">No flights found</h3>
      <p className="text-gray-500">Try adjusting your filters to see more results</p>
    </div>
  );

  if (data.length === 0) {
    return emptyState;
  }

  return (
    <div className="w-full min-w-0">
      {/* Mobile: stacked cards */}
      <ul className="space-y-3 p-3 md:hidden" aria-label="Scheduled flights">
        <AnimatePresence>
          {data.map((flight, index) => {
            const rowKey = scheduledAirlinesRowDedupeKey(flight) || `row-${index}`;
            const status = getFlightStatus(flight);
            const cancelled = status === 'Cancelled';
            const hl =
              Boolean(highlightSerial.trim()) && serialSearchMatches(flight, highlightSerial);

            return (
              <motion.li
                key={rowKey}
                id={scheduledAirlinesRowDomId(flight)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, delay: index * 0.02 }}
                className={cn(
                  'overflow-hidden rounded-xl border border-gray-200/80 shadow-sm',
                  rowSurfaceClass(status, cancelled),
                  hl && 'ring-2 ring-orange-500 ring-inset',
                )}
              >
                <div className="flex items-start justify-between gap-3 border-b border-black/5 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-blue-700">{flight.flightNo}</p>
                    <p className="text-xs text-gray-600">
                      Sl. {displayScheduledAirlinesTableSerial(flight)} · {flight.aircraft}
                    </p>
                  </div>
                  {renderOpenButton(flight, status, cancelled)}
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 text-sm">
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">STA</dt>
                    <dd className={cn('font-medium', cancelled ? 'text-red-600' : 'text-gray-900')}>
                      {flight.staDate}
                      <span className="ml-1 text-xs text-gray-500">{flight.staTime}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">STD</dt>
                    <dd className={cn('font-medium', cancelled ? 'text-red-600' : 'text-gray-900')}>
                      {flight.stdDate}
                      <span className="ml-1 text-xs text-gray-500">{flight.stdTime}</span>
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Locks</dt>
                    <dd>{renderLocks(flight, cancelled)}</dd>
                  </div>
                  <div>
                    <dt className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Category</dt>
                    <dd>{renderCategoryBadge(flight)}</dd>
                  </div>
                  {status === 'Closed' ? (
                    <div className="col-span-2">
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Bags</dt>
                      <dd className="text-gray-900">
                        F: {flight.fBag || '—'} · L: {flight.lBag || '—'}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                <div className="border-t border-black/5 bg-white/40 px-4 py-3">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">Reports</p>
                  {renderActionButtons(flight)}
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      {/* Desktop / tablet: scrollable table */}
      <div className="hidden w-full min-w-0 overflow-x-auto md:block">
        <table className="w-full table-auto min-w-[960px]">
          <thead>
            <tr className="bg-gray-50">
              {[
                { label: 'Open', width: 'w-20' },
                { label: 'Sl.No', width: 'w-16' },
                { label: 'Flight No', width: 'w-28' },
                { label: 'Aircraft', width: 'w-24' },
                { label: 'STA', width: 'w-32' },
                { label: 'STD', width: 'w-32' },
                { label: 'Locks', width: 'w-40' },
                { label: 'Category', width: 'w-44' },
                { label: 'Bags', width: 'w-44' },
                { label: 'Actions', width: 'w-36 min-w-[140px]' },
              ].map((header) => (
                <th
                  key={header.label}
                  className={`px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider ${header.width}`}
                >
                  {header.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            <AnimatePresence>
              {data.map((flight, index) => {
                const rowKey = scheduledAirlinesRowDedupeKey(flight) || `row-${index}`;
                const status = getFlightStatus(flight);
                const cancelled = status === 'Cancelled';
                const hl =
                  Boolean(highlightSerial.trim()) &&
                  serialSearchMatches(flight, highlightSerial);

                return (
                  <motion.tr
                    key={rowKey}
                    id={scheduledAirlinesRowDomId(flight)}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2, delay: index * 0.02 }}
                    className={cn(
                      'transition-colors',
                      rowSurfaceClass(status, cancelled),
                      hl &&
                        'relative z-[1] shadow-[inset_0_0_0_1px_rgba(249,115,22,0.35)] ring-2 ring-orange-500 ring-inset',
                    )}
                  >
                    <td className="px-3 py-2 align-middle">
                      {renderOpenButton(flight, status, cancelled)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {displayScheduledAirlinesTableSerial(flight)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'text-sm font-semibold',
                          cancelled ? 'text-red-700' : 'text-blue-700',
                        )}
                      >
                        {flight.flightNo}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700">{flight.aircraft}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span
                          className={cn(
                            'text-sm font-medium',
                            cancelled ? 'text-red-600' : 'text-gray-900',
                          )}
                        >
                          {flight.staDate}
                        </span>
                        <span className="text-xs text-gray-500">{flight.staTime}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span
                          className={cn(
                            'text-sm font-medium',
                            cancelled ? 'text-red-600' : 'text-gray-900',
                          )}
                        >
                          {flight.stdDate}
                        </span>
                        <span className="text-xs text-gray-500">{flight.stdTime}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">{renderLocks(flight, cancelled)}</td>
                    <td className="px-3 py-3">{renderCategoryBadge(flight)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col">
                        <span className="text-sm text-gray-900">
                          F:{' '}
                          <span className="whitespace-nowrap">
                            {status === 'Closed' ? flight.fBag : ''}
                          </span>
                        </span>
                        <span className="text-sm text-gray-900">
                          L:{' '}
                          <span className="whitespace-nowrap">
                            {status === 'Closed' ? flight.lBag : ''}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2 align-middle">
                      {renderActionButtons(flight)}
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ScheduledFlightsTable;
