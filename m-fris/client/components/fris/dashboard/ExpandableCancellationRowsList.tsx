'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  Calendar,
  Clock,
  Plane,
  MapPin,
  User,
  Mail,
  Tag,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { FlightCancellationRecord } from '@/lib/api';
import {
  buildCancellationHistoryHref,
  type CancellationHistoryNavContext,
} from '@/lib/cancellation-history-nav';
import { displayCancellationRoute, ymdToDdMmYyyy } from '@/utils/cancellationDisplay';
import { displayFlightInstanceSerial } from '@/utils/dataProcessor';

const PLACEHOLDER = '—';

function DetailItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--dash-chart-well)] text-[var(--dash-text-muted)]">
        <Icon className="h-3 w-3" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--dash-text-soft)]">
          {label}
        </p>
        <p
          className={cn(
            'mt-0.5 text-[12px] font-medium leading-snug text-[var(--dash-text-strong)]',
            !value && 'text-[var(--dash-text-muted)]',
          )}
        >
          {value || PLACEHOLDER}
        </p>
      </div>
    </div>
  );
}

function formatTime(value: string): string {
  const s = String(value ?? '').trim();
  return s || PLACEHOLDER;
}

function formatCreatedAt(iso?: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ExpandableCancellationRowsList({
  rows,
  emptyMessage,
  historyNavContext,
}: {
  rows: FlightCancellationRecord[];
  emptyMessage?: string;
  historyNavContext?: CancellationHistoryNavContext;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--dash-border-subtle)] bg-[var(--dash-chart-well)] px-4 py-10 text-center">
        <p className="max-w-[24rem] text-[12px] leading-relaxed text-[var(--dash-text-soft)]">
          {emptyMessage || 'No individual cancellation records for this range.'}
        </p>
      </div>
    );
  }

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <ul className="space-y-2" role="list">
      {rows.map((row) => {
        const routeLabel = displayCancellationRoute(row);
        const isExpanded = expandedIds.has(row._id);
        const airlineName = row.airlineName || PLACEHOLDER;
        const flightNo = row.flightNo || PLACEHOLDER;
        const serial = displayFlightInstanceSerial(row.instanceSerial);
        const cancelledDateLabel = row.cancelledDate ? ymdToDdMmYyyy(row.cancelledDate) : '';
        const historyHref = buildCancellationHistoryHref(row, historyNavContext);

        return (
          <li
            key={row._id}
            className={cn(
              'overflow-hidden rounded-xl border transition-[border-color,background-color,box-shadow] duration-200 ease-out',
              isExpanded
                ? 'border-[color-mix(in_srgb,var(--dash-negative)_32%,var(--dash-border))] bg-[var(--dash-card)] shadow-sm'
                : 'border-[var(--dash-border-subtle)] bg-[var(--dash-card)] hover:border-[color-mix(in_srgb,var(--dash-negative)_24%,var(--dash-border))] hover:bg-[color-mix(in_srgb,var(--dash-negative)_4%,var(--dash-card))]',
            )}
          >
            <div className="flex">
              <span
                className={cn(
                  'w-1 shrink-0 self-stretch',
                  isExpanded ? 'bg-[var(--dash-negative)]' : 'bg-[color-mix(in_srgb,var(--dash-negative)_55%,transparent)]',
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-stretch gap-1 px-2.5 py-2 sm:gap-2 sm:px-3 sm:py-2.5">
                  <button
                    type="button"
                    onClick={() => toggle(row._id)}
                    className="min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--dash-ring)] active:scale-[0.995]"
                    aria-expanded={isExpanded}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[13px] font-semibold tabular-nums tracking-tight text-[var(--dash-text-strong)]">
                            {flightNo}
                          </span>
                          <span className="truncate text-[12px] font-medium text-[var(--dash-text)]">
                            {airlineName}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--dash-text-muted)]">
                          <span className="tabular-nums">Sl. {serial}</span>
                          <span className="text-[var(--dash-border)]" aria-hidden>
                            ·
                          </span>
                          <span className="min-w-0 truncate" title={routeLabel}>
                            {routeLabel}
                          </span>
                          {cancelledDateLabel ? (
                            <>
                              <span className="text-[var(--dash-border)]" aria-hidden>
                                ·
                              </span>
                              <span className="tabular-nums">{cancelledDateLabel}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <span
                        className={cn(
                          'mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          'bg-[color-mix(in_srgb,var(--dash-negative)_12%,transparent)] text-[var(--dash-negative)]',
                          'ring-1 ring-[color-mix(in_srgb,var(--dash-negative)_22%,transparent)]',
                        )}
                      >
                        Cancelled
                      </span>
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-1">
                    <Link
                      href={historyHref}
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        'inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--dash-border-subtle)] bg-[var(--dash-chart-well)] px-2',
                        'text-[10px] font-semibold text-[var(--dash-text-strong)] transition-colors',
                        'hover:border-[var(--dash-accent)] hover:bg-[var(--dash-hover-surface)]',
                        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dash-ring)]',
                        'active:scale-[0.97]',
                      )}
                      aria-label={`View ${flightNo} in cancellation history`}
                    >
                      <span className="hidden sm:inline">History</span>
                      <ExternalLink className="h-3 w-3 text-[var(--dash-accent)]" aria-hidden />
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggle(row._id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--dash-text-muted)] transition-colors hover:bg-[var(--dash-hover-surface)] hover:text-[var(--dash-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dash-ring)] active:scale-[0.97]"
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                    >
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 transition-transform duration-200 ease-out',
                          isExpanded && 'rotate-180',
                        )}
                        aria-hidden
                      />
                    </button>
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-[var(--dash-border-subtle)] bg-[var(--dash-chart-well)] px-3 pb-3 pt-3 sm:px-4">
                        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                          <DetailItem
                            icon={Calendar}
                            label="Cancelled date"
                            value={cancelledDateLabel}
                          />
                          <DetailItem
                            icon={Clock}
                            label="STA / STD"
                            value={
                              row.staDate && row.staTime
                                ? `${ymdToDdMmYyyy(row.staDate)} ${formatTime(row.staTime)} / ${ymdToDdMmYyyy(row.stdDate)} ${formatTime(row.stdTime)}`
                                : ''
                            }
                          />
                          <DetailItem icon={Plane} label="Aircraft" value={row.aircraft} />
                          <DetailItem icon={MapPin} label="Route" value={routeLabel} />
                          <DetailItem
                            icon={Tag}
                            label="Flight kind"
                            value={row.flightKind === 'non-scheduled' ? 'Non-scheduled' : 'Scheduled'}
                          />
                          {row.stationCode ? (
                            <DetailItem icon={MapPin} label="Station" value={row.stationCode} />
                          ) : null}
                          {row.intimationMode ? (
                            <DetailItem
                              icon={Mail}
                              label="Intimation"
                              value={`${row.intimationMode}${row.intimatedBy ? ` · ${row.intimatedBy}` : ''}`}
                            />
                          ) : null}
                          {row.cancelledByUserId ? (
                            <DetailItem icon={User} label="Cancelled by" value={row.cancelledByUserId} />
                          ) : null}
                          {row.reason ? (
                            <DetailItem icon={AlertCircle} label="Reason" value={row.reason} />
                          ) : null}
                          {row.createdAt ? (
                            <DetailItem
                              icon={Clock}
                              label="Recorded at"
                              value={formatCreatedAt(row.createdAt)}
                            />
                          ) : null}
                        </div>
                        <div className="mt-3.5 border-t border-[var(--dash-border-subtle)] pt-3">
                          <Link
                            href={historyHref}
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                              'inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-card)] px-3 py-2.5',
                              'text-[12px] font-semibold text-[var(--dash-text-strong)] shadow-sm transition-[color,background-color,border-color]',
                              'hover:border-[var(--dash-accent)] hover:bg-[var(--dash-hover-surface)]',
                              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dash-ring)]',
                              'active:scale-[0.98] sm:w-auto',
                            )}
                          >
                            View in cancellation history
                            <ExternalLink className="h-3.5 w-3.5 text-[var(--dash-accent)]" aria-hidden />
                          </Link>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
