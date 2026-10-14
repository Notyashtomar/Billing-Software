'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Bell,
  CalendarRange,
  Layers,
  Loader2,
  Plane,
  Ticket,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ADVANCE_PATHS,
  advanceList,
  fetchFlightCancellations,
  type FlightCancellationRecord,
} from '@/lib/api';
import {
  fetchMySupportTickets,
  type SupportTicketSummary,
} from '@/lib/support-tickets-api';
import {
  fetchUserNotificationCenter,
  type UserNotificationCenterItem,
} from '@/lib/user-notification-center-api';
import { DashCountInt } from '@/components/fris/dashboard/DashboardCountUp';
import { ymdToDdMmYyyy } from '@/utils/cancellationDisplay';
import { ExpandableCancellationRowsList } from '@/components/fris/dashboard/ExpandableCancellationRowsList';

const SCROLL_AREA_NO_BAR =
  'max-lg:[scrollbar-width:thin] max-lg:[-ms-overflow-style:auto] max-lg:[&::-webkit-scrollbar]:block max-lg:[&::-webkit-scrollbar]:h-1.5 max-lg:[&::-webkit-scrollbar]:w-1.5 max-lg:[&::-webkit-scrollbar-thumb]:rounded-full max-lg:[&::-webkit-scrollbar-thumb]:bg-[var(--dash-text-muted)]/40 lg:[scrollbar-width:none] lg:[-ms-overflow-style:none] lg:[&::-webkit-scrollbar]:hidden';

export type NotificationCenterCardProps = {
  open: boolean;
  dashboardCancellationApiRange: { from: string; to: string } | null;
  /** Bump when FHR/cancellations change so the open panel refreshes. */
  refreshSeq?: number;
};

type TabId = 'cancellations' | 'tickets' | 'airlines' | 'aircraft' | 'messages';

type AirlineNotice = {
  id: string;
  name: string;
  code: string;
  createdAt: string;
};

type AircraftNotice = {
  id: string;
  aircraft: string;
  aircraftBody: string;
  createdAt: string;
};

type SectionState<T> = {
  rows: T[];
  loading: boolean;
  error: string | null;
};

function emptySection<T>(): SectionState<T> {
  return { rows: [], loading: false, error: null };
}

function toYmd(value: unknown): string {
  if (value == null || value === '') return '';
  const dt = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

function inYmdRange(isoOrDate: unknown, from: string, to: string): boolean {
  const day = toYmd(isoOrDate);
  return Boolean(day && day >= from && day <= to);
}

function formatWhen(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso || '—';
  return dt.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function asRecord(row: unknown): Record<string, unknown> {
  return row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
}

function normalizeAirline(row: unknown): AirlineNotice | null {
  const r = asRecord(row);
  const id = String(r._id ?? r.id ?? '').trim();
  const name = String(r.name ?? '').trim();
  const code = String(r.code ?? '').trim();
  const createdAt = String(r.createdAt ?? '').trim();
  if (!id || !name) return null;
  return { id, name, code, createdAt };
}

function normalizeAircraft(row: unknown): AircraftNotice | null {
  const r = asRecord(row);
  const id = String(r._id ?? r.id ?? '').trim();
  const aircraft = String(r.aircraft ?? '').trim();
  const aircraftBody = String(r.aircraftBody ?? '').trim();
  const createdAt = String(r.createdAt ?? '').trim();
  if (!id || !aircraft) return null;
  return { id, aircraft, aircraftBody, createdAt };
}

const TABS: Array<{
  id: TabId;
  label: string;
  icon: typeof XCircle;
}> = [
  { id: 'cancellations', label: 'Cancellations', icon: XCircle },
  { id: 'tickets', label: 'Tickets', icon: Ticket },
  { id: 'airlines', label: 'Airlines', icon: Plane },
  { id: 'aircraft', label: 'Aircraft', icon: Layers },
  { id: 'messages', label: 'Messages', icon: Bell },
];

export function NotificationCenterCard({
  open,
  dashboardCancellationApiRange,
  refreshSeq = 0,
}: NotificationCenterCardProps) {
  const [tab, setTab] = useState<TabId>('cancellations');
  const [cancellations, setCancellations] = useState<SectionState<FlightCancellationRecord>>(emptySection);
  const [tickets, setTickets] = useState<SectionState<SupportTicketSummary>>(emptySection);
  const [airlines, setAirlines] = useState<SectionState<AirlineNotice>>(emptySection);
  const [aircraft, setAircraft] = useState<SectionState<AircraftNotice>>(emptySection);
  const [messages, setMessages] = useState<SectionState<UserNotificationCenterItem>>(emptySection);

  const apiRangeLabel = dashboardCancellationApiRange
    ? `${ymdToDdMmYyyy(dashboardCancellationApiRange.from)} – ${ymdToDdMmYyyy(dashboardCancellationApiRange.to)}`
    : null;

  useEffect(() => {
    if (!open) return;
    let ignore = false;
    const range = dashboardCancellationApiRange;

    setCancellations({ rows: [], loading: true, error: null });
    setTickets({ rows: [], loading: true, error: null });
    setAirlines({ rows: [], loading: true, error: null });
    setAircraft({ rows: [], loading: true, error: null });
    setMessages({ rows: [], loading: true, error: null });

    const loadCancellations = async () => {
      if (!range) {
        if (!ignore) setCancellations({ rows: [], loading: false, error: null });
        return;
      }
      try {
        const rows = await fetchFlightCancellations(range);
        if (ignore) return;
        const sorted = [...rows].sort((a, b) => {
          const d = a.cancelledDate.localeCompare(b.cancelledDate);
          if (d !== 0) return d;
          const t = a.staTime.localeCompare(b.staTime);
          if (t !== 0) return t;
          return a.flightNo.localeCompare(b.flightNo);
        });
        setCancellations({ rows: sorted, loading: false, error: null });
      } catch (e) {
        if (ignore) return;
        setCancellations({
          rows: [],
          loading: false,
          error: e instanceof Error ? e.message : 'Failed to load cancellations',
        });
      }
    };

    const loadTickets = async () => {
      try {
        const rows = await fetchMySupportTickets();
        if (ignore) return;
        const filtered = range
          ? rows.filter((row) => inYmdRange(row.raisedAt, range.from, range.to))
          : rows;
        filtered.sort((a, b) => b.raisedAt.localeCompare(a.raisedAt));
        setTickets({ rows: filtered, loading: false, error: null });
      } catch (e) {
        if (ignore) return;
        setTickets({
          rows: [],
          loading: false,
          error: e instanceof Error ? e.message : 'Failed to load tickets',
        });
      }
    };

    const loadAirlines = async () => {
      try {
        const raw = await advanceList(ADVANCE_PATHS.airline);
        if (ignore) return;
        const normalized = raw
          .map(normalizeAirline)
          .filter((row): row is AirlineNotice => row != null);
        const filtered = range
          ? normalized.filter((row) => inYmdRange(row.createdAt, range.from, range.to))
          : normalized;
        filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setAirlines({ rows: filtered.slice(0, 100), loading: false, error: null });
      } catch (e) {
        if (ignore) return;
        setAirlines({
          rows: [],
          loading: false,
          error: e instanceof Error ? e.message : 'Failed to load airlines',
        });
      }
    };

    const loadAircraft = async () => {
      try {
        const raw = await advanceList(ADVANCE_PATHS.aircraft);
        if (ignore) return;
        const normalized = raw
          .map(normalizeAircraft)
          .filter((row): row is AircraftNotice => row != null);
        const filtered = range
          ? normalized.filter((row) => inYmdRange(row.createdAt, range.from, range.to))
          : normalized;
        filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setAircraft({ rows: filtered.slice(0, 100), loading: false, error: null });
      } catch (e) {
        if (ignore) return;
        setAircraft({
          rows: [],
          loading: false,
          error: e instanceof Error ? e.message : 'Failed to load aircraft',
        });
      }
    };

    const loadMessages = async () => {
      try {
        const res = await fetchUserNotificationCenter(
          range ? { fromDate: range.from, toDate: range.to } : undefined,
        );
        if (ignore) return;
        const rows = [...(res.rows ?? [])].sort((a, b) =>
          b.notificationDate.localeCompare(a.notificationDate),
        );
        setMessages({ rows, loading: false, error: null });
      } catch (e) {
        if (ignore) return;
        setMessages({
          rows: [],
          loading: false,
          error: e instanceof Error ? e.message : 'Failed to load messages',
        });
      }
    };

    void Promise.all([
      loadCancellations(),
      loadTickets(),
      loadAirlines(),
      loadAircraft(),
      loadMessages(),
    ]);

    return () => {
      ignore = true;
    };
  }, [
    open,
    dashboardCancellationApiRange?.from,
    dashboardCancellationApiRange?.to,
    refreshSeq,
  ]);

  const counts = useMemo(
    () => ({
      cancellations: cancellations.rows.length,
      tickets: tickets.rows.length,
      airlines: airlines.rows.length,
      aircraft: aircraft.rows.length,
      messages: messages.rows.length,
    }),
    [cancellations.rows, tickets.rows, airlines.rows, aircraft.rows, messages.rows],
  );

  const totalCount =
    counts.cancellations + counts.tickets + counts.airlines + counts.aircraft + counts.messages;

  const anyLoading =
    cancellations.loading ||
    tickets.loading ||
    airlines.loading ||
    aircraft.loading ||
    messages.loading;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--dash-card)]">
      {/* Summary strip */}
      <div className="shrink-0 border-b border-[var(--dash-border-subtle)] px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <SummaryChip
            label="Total updates"
            value={anyLoading ? null : totalCount}
            tone="neutral"
          />
          <SummaryChip
            label="Cancelled"
            value={cancellations.loading ? null : counts.cancellations}
            tone="danger"
          />
          <SummaryChip
            label="Tickets"
            value={tickets.loading ? null : counts.tickets}
            tone="warn"
          />
          <SummaryChip
            label="Airlines"
            value={airlines.loading ? null : counts.airlines}
            tone="accent"
          />
          <SummaryChip
            label="Aircraft"
            value={aircraft.loading ? null : counts.aircraft}
            tone="accent"
          />
          <div className="ml-auto min-w-0">
            {apiRangeLabel ? (
              <span
                className={cn(
                  'inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--dash-border-subtle)]',
                  'bg-[var(--dash-chart-well)] px-2.5 py-1 text-[11px] font-medium tabular-nums text-[var(--dash-text)]',
                )}
              >
                <CalendarRange className="h-3 w-3 shrink-0 text-[var(--dash-text-muted)]" aria-hidden />
                <span className="truncate">{apiRangeLabel}</span>
              </span>
            ) : (
              <span className="text-[11px] text-[var(--dash-text-muted)]">Select a dashboard date range</span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="shrink-0 overflow-x-auto border-b border-[var(--dash-border-subtle)] px-2 pt-2 sm:px-4"
        role="tablist"
        aria-label="Notification categories"
      >
        <div className="flex min-w-min gap-1 pb-2">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            const count = counts[id];
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(id)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12px] font-semibold transition-colors',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dash-ring)]',
                  'active:scale-[0.98]',
                  active
                    ? 'bg-[var(--dash-hover-surface)] text-[var(--dash-text-strong)] ring-1 ring-[var(--dash-border)]'
                    : 'text-[var(--dash-text-muted)] hover:bg-[var(--dash-chart-well)] hover:text-[var(--dash-text)]',
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {label}
                <span
                  className={cn(
                    'rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                    active
                      ? 'bg-[var(--dash-card)] text-[var(--dash-text)]'
                      : 'bg-[var(--dash-chart-well)] text-[var(--dash-text-muted)]',
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab panels */}
      <div className={cn('min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5', SCROLL_AREA_NO_BAR)}>
        {tab === 'cancellations' ? (
          <CancellationsPanel
            range={dashboardCancellationApiRange}
            state={cancellations}
          />
        ) : null}
        {tab === 'tickets' ? <TicketsPanel state={tickets} hasRange={Boolean(dashboardCancellationApiRange)} /> : null}
        {tab === 'airlines' ? <AirlinesPanel state={airlines} hasRange={Boolean(dashboardCancellationApiRange)} /> : null}
        {tab === 'aircraft' ? <AircraftPanel state={aircraft} hasRange={Boolean(dashboardCancellationApiRange)} /> : null}
        {tab === 'messages' ? <MessagesPanel state={messages} hasRange={Boolean(dashboardCancellationApiRange)} /> : null}
      </div>
    </div>
  );
}

function SummaryChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: 'neutral' | 'danger' | 'warn' | 'accent';
}) {
  const toneClass =
    tone === 'danger'
      ? 'border-[color-mix(in_srgb,var(--dash-negative)_22%,var(--dash-border))] bg-[color-mix(in_srgb,var(--dash-negative)_6%,var(--dash-card))]'
      : tone === 'warn'
        ? 'border-[color-mix(in_srgb,var(--dash-warning)_28%,var(--dash-border))] bg-[color-mix(in_srgb,var(--dash-warning)_8%,var(--dash-card))]'
        : tone === 'accent'
          ? 'border-[color-mix(in_srgb,var(--dash-accent)_28%,var(--dash-border))] bg-[color-mix(in_srgb,var(--dash-accent)_8%,var(--dash-card))]'
          : 'border-[var(--dash-border-subtle)] bg-[var(--dash-chart-well)]';

  return (
    <div className={cn('min-w-[5.5rem] rounded-xl border px-2.5 py-2', toneClass)}>
      <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--dash-text-soft)]">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums leading-none text-[var(--dash-text-strong)]">
        {value == null ? (
          <span className="text-sm font-medium text-[var(--dash-text-muted)]">…</span>
        ) : (
          <DashCountInt end={value} />
        )}
      </p>
    </div>
  );
}

function PanelShell({
  loading,
  error,
  empty,
  emptyTitle,
  emptyBody,
  children,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyTitle: string;
  emptyBody: string;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--dash-border-subtle)] bg-[var(--dash-chart-well)] px-4 py-14"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-5 w-5 animate-spin text-[var(--dash-accent)]" aria-hidden />
        <p className="text-xs font-medium text-[var(--dash-text-muted)]">Loading updates…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div
        className={cn(
          'flex items-start gap-3 rounded-xl border px-3.5 py-3',
          'border-[color-mix(in_srgb,var(--dash-negative)_28%,var(--dash-border))]',
          'bg-[color-mix(in_srgb,var(--dash-negative)_8%,var(--dash-card))]',
        )}
        role="alert"
      >
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--dash-negative)]" aria-hidden />
        <p className="text-[12px] leading-snug text-[var(--dash-negative)]">{error}</p>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--dash-border-subtle)] bg-[var(--dash-chart-well)] px-4 py-12 text-center">
        <p className="text-xs font-semibold text-[var(--dash-text-strong)]">{emptyTitle}</p>
        <p className="max-w-[26rem] text-[11px] leading-relaxed text-[var(--dash-text-soft)]">{emptyBody}</p>
      </div>
    );
  }
  return <>{children}</>;
}

function CancellationsPanel({
  range,
  state,
}: {
  range: { from: string; to: string } | null;
  state: SectionState<FlightCancellationRecord>;
}) {
  if (!range) {
    return (
      <PanelShell
        loading={false}
        error={null}
        empty
        emptyTitle="Choose a date range"
        emptyBody="Set start and end dates on the dashboard to fetch cancellation rows."
      >
        {null}
      </PanelShell>
    );
  }
  return (
    <PanelShell
      loading={state.loading}
      error={state.error}
      empty={state.rows.length === 0}
      emptyTitle="No cancellations"
      emptyBody="No cancellation records for this date range. Cancel a flight from Scheduled or Non-Scheduled Airlines to see it here."
    >
      <ExpandableCancellationRowsList
        rows={state.rows}
        historyNavContext={{
          dashboardFrom: range.from,
          dashboardTo: range.to,
        }}
        emptyMessage="No cancellation records for this date range."
      />
    </PanelShell>
  );
}

function TicketsPanel({
  state,
  hasRange,
}: {
  state: SectionState<SupportTicketSummary>;
  hasRange: boolean;
}) {
  return (
    <PanelShell
      loading={state.loading}
      error={state.error}
      empty={state.rows.length === 0}
      emptyTitle="No tickets"
      emptyBody={
        hasRange
          ? 'No support tickets raised in this date range.'
          : 'No support tickets found for your account.'
      }
    >
      <ul className="space-y-2" role="list">
        {state.rows.map((row) => (
          <li
            key={row.ticketNumber}
            className="rounded-xl border border-[var(--dash-border-subtle)] bg-[var(--dash-card)] px-3 py-2.5"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold tabular-nums text-[var(--dash-text-strong)]">
                  {row.ticketNumber}
                </p>
                <p className="mt-0.5 truncate text-[12px] text-[var(--dash-text)]">
                  {row.issueReason || row.issueType}
                </p>
                <p className="mt-1 text-[11px] text-[var(--dash-text-muted)]">
                  {row.navigationPageLabel}
                  {row.subPageLabel ? ` · ${row.subPageLabel}` : ''}
                  {' · '}
                  {formatWhen(row.raisedAt)}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1',
                  row.status === 'open'
                    ? 'bg-[color-mix(in_srgb,var(--dash-warning)_12%,transparent)] text-[var(--dash-warning)] ring-[color-mix(in_srgb,var(--dash-warning)_25%,transparent)]'
                    : 'bg-[var(--dash-chart-well)] text-[var(--dash-text-muted)] ring-[var(--dash-border-subtle)]',
                )}
              >
                {row.status}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--dash-text-soft)]">
              {row.urgency} · {row.issueType}
            </p>
          </li>
        ))}
      </ul>
    </PanelShell>
  );
}

function AirlinesPanel({
  state,
  hasRange,
}: {
  state: SectionState<AirlineNotice>;
  hasRange: boolean;
}) {
  return (
    <PanelShell
      loading={state.loading}
      error={state.error}
      empty={state.rows.length === 0}
      emptyTitle="No new airlines"
      emptyBody={
        hasRange
          ? 'No airlines were added in this date range.'
          : 'No airline masters found.'
      }
    >
      <ul className="space-y-2" role="list">
        {state.rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--dash-border-subtle)] bg-[var(--dash-card)] px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-[var(--dash-text-strong)]">
                {row.name}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--dash-text-muted)]">
                <span className="font-medium tabular-nums text-[var(--dash-text)]">{row.code || '—'}</span>
                {row.createdAt ? ` · Added ${formatWhen(row.createdAt)}` : null}
              </p>
            </div>
            <Link
              href="/fris/advance"
              className="shrink-0 rounded-lg border border-[var(--dash-border-subtle)] bg-[var(--dash-chart-well)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--dash-text-strong)] transition-colors hover:border-[var(--dash-accent)] hover:bg-[var(--dash-hover-surface)] active:scale-[0.97]"
            >
              Open Advance
            </Link>
          </li>
        ))}
      </ul>
    </PanelShell>
  );
}

function AircraftPanel({
  state,
  hasRange,
}: {
  state: SectionState<AircraftNotice>;
  hasRange: boolean;
}) {
  return (
    <PanelShell
      loading={state.loading}
      error={state.error}
      empty={state.rows.length === 0}
      emptyTitle="No new aircraft"
      emptyBody={
        hasRange
          ? 'No aircraft types were added in this date range.'
          : 'No aircraft masters found.'
      }
    >
      <ul className="space-y-2" role="list">
        {state.rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--dash-border-subtle)] bg-[var(--dash-card)] px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold tabular-nums text-[var(--dash-text-strong)]">
                {row.aircraft}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--dash-text-muted)]">
                {row.aircraftBody || '—'}
                {row.createdAt ? ` · Added ${formatWhen(row.createdAt)}` : null}
              </p>
            </div>
            <Link
              href="/fris/advance"
              className="shrink-0 rounded-lg border border-[var(--dash-border-subtle)] bg-[var(--dash-chart-well)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--dash-text-strong)] transition-colors hover:border-[var(--dash-accent)] hover:bg-[var(--dash-hover-surface)] active:scale-[0.97]"
            >
              Open Advance
            </Link>
          </li>
        ))}
      </ul>
    </PanelShell>
  );
}

function MessagesPanel({
  state,
  hasRange,
}: {
  state: SectionState<UserNotificationCenterItem>;
  hasRange: boolean;
}) {
  return (
    <PanelShell
      loading={state.loading}
      error={state.error}
      empty={state.rows.length === 0}
      emptyTitle="No messages"
      emptyBody={
        hasRange
          ? 'No admin messages for this date range.'
          : 'No messages in your notification inbox.'
      }
    >
      <ul className="space-y-2" role="list">
        {state.rows.map((row) => (
          <li
            key={row.id}
            className="rounded-xl border border-[var(--dash-border-subtle)] bg-[var(--dash-card)] px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[13px] font-semibold text-[var(--dash-text-strong)]">{row.title}</p>
              {!row.readAt ? (
                <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--dash-accent)_14%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-[var(--dash-accent)]">
                  New
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[12px] leading-snug text-[var(--dash-text)]">{row.message}</p>
            <p className="mt-1.5 text-[11px] text-[var(--dash-text-muted)]">
              {row.shotByAdminName ? `${row.shotByAdminName} · ` : null}
              {formatWhen(row.notificationDate || row.createdAt)}
            </p>
          </li>
        ))}
      </ul>
    </PanelShell>
  );
}
