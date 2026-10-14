'use client';

import React from 'react';
import Link from 'next/link';
import {
  FlightData,
  displayFlightInstanceSerial,
  isScheduleCancelledFlightNo,
} from '@/utils/dataProcessor';
import { motion } from 'framer-motion';
import { ExternalLink, Eye, Lock, Plane, Unlock, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  paxShiftReportViewHref,
  stashPaxShiftReportViewFlight,
} from '@/components/fris/reports/paxShiftReportStorageKeys';
import { ReportsResponsiveTable } from '@/components/fris/reports/ReportsResponsiveTable';
import {
  ReportsAdaptiveTable,
  ReportsMobileCard,
  ReportsMobileCardActions,
  ReportsMobileCardButton,
  ReportsMobileCardField,
  ReportsMobileCardGrid,
  ReportsMobileCardHeader,
  ReportsMobileCardList,
  ReportsMobileEmpty,
  type ReportsMobileCardTone,
} from '@/components/fris/reports/ReportsMobileCards';
import { FRIS_REPORTS_OPEN_BTN_CLASS } from '@/lib/fris-reports-responsive';

type Props = {
  data: FlightData[];
  selectedSlNo: string | null;
  onSelectRow: (flight: FlightData) => void;
  onOpenRow: (flight: FlightData) => void;
};

function isLockedValue(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'locked' || s === '1';
}

function isCancelledFlight(flight: FlightData): boolean {
  return (
    flight.isCancelled ||
    isScheduleCancelledFlightNo(flight.flightNo) ||
    String(flight.flightStatus ?? '').trim().toLowerCase() === 'cancelled'
  );
}

function getFlightStatus(flight: FlightData): 'Open' | 'Closed' | 'Cancelled' {
  if (isCancelledFlight(flight)) return 'Cancelled';
  if (
    isLockedValue(flight.rampLocked) &&
    isLockedValue(flight.paxLocked) &&
    isLockedValue(flight.gsdLocked)
  ) {
    return 'Closed';
  }
  return 'Open';
}

function statusTone(status: 'Open' | 'Closed' | 'Cancelled'): ReportsMobileCardTone {
  if (status === 'Cancelled') return 'cancelled';
  if (status === 'Closed') return 'closed';
  return 'open';
}

function statusBadgeClass(status: 'Open' | 'Closed' | 'Cancelled'): string {
  if (status === 'Cancelled') return 'bg-rose-100 text-rose-800';
  if (status === 'Closed') return 'bg-emerald-100 text-emerald-800';
  return 'bg-amber-100 text-amber-900';
}

function openButtonClass(status: 'Open' | 'Closed' | 'Cancelled'): string {
  if (status === 'Cancelled') return 'bg-red-600 hover:bg-red-700';
  if (status === 'Closed') return 'bg-emerald-600 hover:bg-emerald-700';
  return 'bg-amber-500 hover:bg-amber-600';
}

function PaxLockLabel({ flight }: { flight: FlightData }) {
  const cancelled = isCancelledFlight(flight);
  if (cancelled) {
    return (
      <span className="inline-flex items-center gap-1 text-rose-700">
        <X className="h-4 w-4" aria-hidden />
        N/A
      </span>
    );
  }
  const locked = isLockedValue(flight.paxLocked);
  return (
    <span className="inline-flex items-center gap-1">
      {locked ? (
        <Lock className="h-4 w-4 text-emerald-600" aria-hidden />
      ) : (
        <Unlock className="h-4 w-4 text-rose-600" aria-hidden />
      )}
      {locked ? 'Locked' : 'Open'}
    </span>
  );
}

export default function PaxShiftReportTable({
  data,
  selectedSlNo,
  onSelectRow,
  onOpenRow,
}: Props) {
  const colCount = 13;

  const handleViewReportNavigate = (flight: FlightData, e: React.MouseEvent) => {
    if (!stashPaxShiftReportViewFlight(flight)) {
      e.preventDefault();
      toast.error('Could not open report view for this flight.');
    }
  };

  const desktopTable = (
    <ReportsResponsiveTable showScrollHint={false}>
      <table className="w-full min-w-[1100px] table-auto">
        <thead>
          <tr className="bg-gray-50">
            {[
              { label: 'Open', w: 'w-[88px]' },
              { label: 'Serial No.', w: 'w-20' },
              { label: 'Airline', w: 'min-w-[120px]' },
              { label: 'Flight No.', w: 'w-28' },
              { label: 'Aircraft', w: 'w-24' },
              { label: 'STA Date', w: 'w-28' },
              { label: 'STA Time', w: 'w-24' },
              { label: 'STD Date', w: 'w-28' },
              { label: 'STD Time', w: 'w-24' },
              { label: 'Flight lock', w: 'w-32' },
              { label: 'For email', w: 'w-24' },
              { label: 'Mail sent', w: 'w-24' },
              { label: 'Report view', w: 'w-[100px]' },
            ].map((h) => (
              <th
                key={h.label}
                className={`px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-700 ${h.w}`}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
            {data.map((flight, index) => {
              const slKey = String(flight.slNo ?? '').trim();
              const rowKey = slKey
                ? `${slKey}-${index}`
                : `${flight.flightNo}-${flight.staDate}-${index}`;
              const status = getFlightStatus(flight);
              const cancelled = status === 'Cancelled';
              const rowBg = cancelled
                ? 'bg-red-200 hover:bg-red-50'
                : status === 'Closed'
                  ? 'bg-emerald-200 hover:bg-slate-100'
                  : 'bg-yellow-200/90 hover:bg-yellow-100';
              const sl = String(flight.slNo ?? '').trim();
              const isSelected = selectedSlNo != null && sl === selectedSlNo;
              const viewHref = sl ? paxShiftReportViewHref(sl) : '#';

              return (
                <motion.tr
                  key={rowKey}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectRow(flight)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectRow(flight);
                    }
                  }}
                  initial={false}
                  className={`cursor-pointer transition-colors ${rowBg} ${isSelected ? 'ring-2 ring-inset ring-amber-500' : ''}`}
                >
                  <td className="px-2 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
                    <motion.button
                      type="button"
                      onClick={() => onOpenRow(flight)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      title="Open pax shift forms"
                      aria-label={`Open (${status})`}
                      className={`${FRIS_REPORTS_OPEN_BTN_CLASS} ${openButtonClass(status)}`}
                    >
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                      {status}
                    </motion.button>
                  </td>
                  <td className="px-3 py-2 text-sm font-medium text-gray-900">
                    {displayFlightInstanceSerial(flight.slNo)}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-800">{flight.airline}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-sm font-semibold ${cancelled ? 'text-red-700' : 'text-blue-700'}`}
                    >
                      {flight.flightNo}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-700">{flight.aircraft}</td>
                  <td className="px-3 py-2 text-sm text-gray-900">{flight.staDate || '—'}</td>
                  <td className="px-3 py-2 text-sm text-gray-600">{flight.staTime || '—'}</td>
                  <td className="px-3 py-2 text-sm text-gray-900">{flight.stdDate || '—'}</td>
                  <td className="px-3 py-2 text-sm text-gray-600">{flight.stdTime || '—'}</td>
                  <td className="px-3 py-2">
                    <PaxLockLabel flight={flight} />
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-500">—</td>
                  <td className="px-3 py-2 text-sm text-gray-500">—</td>
                  <td className="px-2 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
                    <Link
                      href={viewHref}
                      prefetch
                      onClick={(e) => handleViewReportNavigate(flight, e)}
                      title="Open tabular Pax shift report"
                      aria-label={`Open Pax shift report for flight ${flight.flightNo}`}
                      className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
                    >
                      <Eye className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                      View
                    </Link>
                  </td>
                </motion.tr>
              );
            })}
          {data.length === 0 && (
            <tr>
              <td colSpan={colCount} className="px-4 py-12 text-center">
                <div className="flex flex-col items-center justify-center">
                  <div className="mb-4 rounded-full bg-gray-100 p-3">
                    <Plane className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="mb-2 text-lg font-medium text-gray-900">No flights found</h3>
                  <p className="text-gray-500">Try adjusting filters or the date range</p>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </ReportsResponsiveTable>
  );

  const mobileList =
    data.length === 0 ? (
      <ReportsMobileEmpty
        title="No flights found"
        description="Try adjusting filters or the date range."
      />
    ) : (
      <ReportsMobileCardList>
        {data.map((flight, index) => {
          const slKey = String(flight.slNo ?? '').trim();
          const rowKey = slKey ? `${slKey}-${index}` : `${flight.flightNo}-${flight.staDate}-${index}`;
          const status = getFlightStatus(flight);
          const sl = String(flight.slNo ?? '').trim();
          const isSelected = selectedSlNo != null && sl === selectedSlNo;

          return (
            <ReportsMobileCard
              key={rowKey}
              tone={statusTone(status)}
              selected={isSelected}
              onSelect={() => onSelectRow(flight)}
            >
              <ReportsMobileCardHeader
                title={
                  <>
                    {flight.airline}{' '}
                    <span className="text-blue-700">{flight.flightNo}</span>
                  </>
                }
                subtitle={`Serial ${displayFlightInstanceSerial(flight.slNo)} · ${flight.aircraft || 'Aircraft —'}`}
                badge={
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusBadgeClass(status)}`}
                  >
                    {status}
                  </span>
                }
              />

              <ReportsMobileCardGrid>
                <ReportsMobileCardField label="STA" value={`${flight.staDate || '—'} ${flight.staTime || ''}`.trim()} />
                <ReportsMobileCardField label="STD" value={`${flight.stdDate || '—'} ${flight.stdTime || ''}`.trim()} />
                <ReportsMobileCardField label="Pax lock" value={<PaxLockLabel flight={flight} />} />
                <ReportsMobileCardField label="Mail" value="—" />
              </ReportsMobileCardGrid>

              <ReportsMobileCardActions>
                <ReportsMobileCardButton
                  className={openButtonClass(status)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenRow(flight);
                  }}
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Open forms
                </ReportsMobileCardButton>
                <Link
                  href={sl ? paxShiftReportViewHref(sl) : '#'}
                  prefetch
                  onClick={(e) => {
                    e.stopPropagation();
                    handleViewReportNavigate(flight, e);
                  }}
                  className="inline-flex min-h-[44px] flex-1 touch-manipulation items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors duration-150 hover:bg-slate-50 active:scale-[0.98]"
                >
                  <Eye className="h-4 w-4" aria-hidden />
                  View report
                </Link>
              </ReportsMobileCardActions>
            </ReportsMobileCard>
          );
        })}
      </ReportsMobileCardList>
    );

  return <ReportsAdaptiveTable mobile={mobileList} desktop={desktopTable} />;
}
