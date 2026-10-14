'use client';

import React from 'react';
import { ExternalLink, Plane, RefreshCw } from 'lucide-react';
import type { FlightData } from '@/utils/dataProcessor';
import {
  displayScheduledAirlinesTableSerial,
  resolveScheduledAirlinesFlightStatus,
} from '@/utils/dataProcessor';
import { cn } from '@/lib/utils';

export type RafCleaningFlags = {
  deepCleaning: boolean;
  nightHaltCleaning: boolean;
  exteriorCleaning: boolean;
};

type Props = {
  data: FlightData[];
  cleaningByAirline: Map<string, RafCleaningFlags>;
  onOpenRow: (flight: FlightData) => void;
  onViewCleaning?: (flight: FlightData, kind: 'deep' | 'night-halt' | 'exterior') => void;
  loading?: boolean;
  /** Billing / deep-link serial to visually highlight in the table. */
  highlightSerial?: string;
};

/** Legacy raf.aspx View column — plain blue hyperlinks, not pill buttons. */
const RAF_VIEW_LINK_CLASS =
  'cursor-pointer border-0 bg-transparent p-0 text-left text-sm font-normal text-blue-600 underline hover:text-blue-800';

function cellText(value: string | undefined | null): string {
  const v = String(value ?? '').trim();
  return v || '—';
}

export function airlineKey(airline: string, code?: string): string {
  const name = String(airline ?? '').trim().toLowerCase();
  const c = String(code ?? '').trim().toUpperCase();
  return c ? `${name}|${c}` : name;
}

export function resolveCleaningFlags(
  flight: FlightData,
  cleaningByAirline: Map<string, RafCleaningFlags>,
): RafCleaningFlags {
  const keys = [
    airlineKey(flight.airline),
    airlineKey(flight.airline, (flight as { airlineCode?: string }).airlineCode),
  ];
  for (const key of keys) {
    const hit = cleaningByAirline.get(key);
    if (hit) return hit;
  }
  return { deepCleaning: false, nightHaltCleaning: false, exteriorCleaning: false };
}

function openButtonClass(status: string, cancelled: boolean): string {
  if (cancelled) return 'bg-red-600 hover:bg-red-700';
  if (status === 'Closed') return 'bg-emerald-600 hover:bg-emerald-700';
  return 'bg-yellow-500 hover:bg-yellow-600';
}

function CleaningViewLink({
  label,
  className,
  onClick,
}: {
  label: string;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={`${RAF_VIEW_LINK_CLASS} ${className ?? ''}`}>
      {label}
    </button>
  );
}

function renderViewLinks(
  flight: FlightData,
  flags: RafCleaningFlags,
  onViewCleaning?: (flight: FlightData, kind: 'deep' | 'night-halt' | 'exterior') => void,
) {
  const hasAny =
    flags.deepCleaning || flags.nightHaltCleaning || flags.exteriorCleaning;

  if (!hasAny) {
    return <span className="text-sm text-gray-400">—</span>;
  }

  return (
    <div className="flex min-w-[11.5rem] flex-col items-start gap-1 py-0.5">
      {flags.deepCleaning ? (
        <CleaningViewLink
          label="Deep Cleaning"
          onClick={() => onViewCleaning?.(flight, 'deep')}
        />
      ) : null}
      {flags.nightHaltCleaning ? (
        <CleaningViewLink
          label="Night Halt Cleaning"
          onClick={() => onViewCleaning?.(flight, 'night-halt')}
        />
      ) : null}
      {flags.exteriorCleaning ? (
        <CleaningViewLink
          label="Exterior_Cleaning"
          onClick={() => onViewCleaning?.(flight, 'exterior')}
        />
      ) : null}
    </div>
  );
}

const TABLE_HEADERS: Array<{ label: string; className?: string }> = [
  { label: 'Open', className: 'w-24' },
  { label: 'S_No', className: 'w-20' },
  { label: 'Flight No', className: 'w-28' },
  { label: 'Airline', className: 'min-w-[10rem]' },
  { label: 'Aircraft', className: 'w-32' },
  { label: 'Routing', className: 'w-28' },
  { label: 'Ops', className: 'w-36' },
  { label: 'STA Date', className: 'w-28' },
  { label: 'STA Time', className: 'w-24' },
  { label: 'STD Date', className: 'w-28' },
  { label: 'STD Time', className: 'w-24' },
  { label: 'View', className: 'min-w-[11.5rem]' },
];

export default function RampAssistanceFlightsTable({
  data,
  cleaningByAirline,
  onOpenRow,
  onViewCleaning,
  loading = false,
  highlightSerial,
}: Props) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
        <RefreshCw className="mb-4 h-10 w-10 animate-spin text-emerald-500" aria-hidden />
        <p className="text-sm font-medium text-gray-600">Loading ramp assistance flights…</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
        <div className="mb-4 rounded-full bg-gray-100 p-4">
          <Plane className="h-12 w-12 text-gray-400" aria-hidden />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-gray-900">No RAF flights found</h3>
        <p className="max-w-md text-sm text-gray-600">
          Adjust the date range, airline, serial, or cleaning filters, or create flights from
          Creation → RAF.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1180px] table-auto text-sm">
        <thead>
          <tr className="bg-gray-50">
            {TABLE_HEADERS.map((header) => (
              <th
                key={header.label}
                className={cn(
                  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700',
                  header.className,
                )}
              >
                {header.label === 'Open' ? '' : header.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((flight) => {
            const flags = resolveCleaningFlags(flight, cleaningByAirline);
            const serial = String(flight.slNo ?? '').trim();
            const isHighlighted =
              Boolean(highlightSerial) && serial === String(highlightSerial).trim();
            const status = resolveScheduledAirlinesFlightStatus(flight);
            const cancelled = status === 'Cancelled';

            return (
              <tr
                key={`${flight.slNo}-${flight.flightNo}-${flight.staDate}`}
                className={cn(
                  'bg-white transition-colors hover:bg-gray-50/80',
                  isHighlighted &&
                    'relative z-[1] bg-amber-50 shadow-[inset_0_0_0_1px_rgba(249,115,22,0.35)] ring-2 ring-inset ring-orange-500',
                )}
                data-highlight-serial={isHighlighted ? serial : undefined}
              >
                <td className="px-3 py-2 align-middle">
                  <button
                    type="button"
                    onClick={() => onOpenRow(flight)}
                    className={cn(
                      'inline-flex items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-white transition-colors whitespace-nowrap',
                      openButtonClass(status, cancelled),
                    )}
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Open…
                  </button>
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
                    {cellText(flight.flightNo)}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{cellText(flight.airline)}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{cellText(flight.aircraft)}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{cellText(flight.route)}</td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {cellText(flight.typeOfHandling)}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {cellText(flight.staDate)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{cellText(flight.staTime)}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {cellText(flight.stdDate)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{cellText(flight.stdTime)}</td>
                <td className="px-4 py-3 align-top">
                  {renderViewLinks(flight, flags, onViewCleaning)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
