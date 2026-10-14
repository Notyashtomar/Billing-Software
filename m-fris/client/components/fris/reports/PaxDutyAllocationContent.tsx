'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ClipboardList,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Search,
  Users,
  Calendar,
  Filter,
  Sparkles,
  Layers,
  Plane,
  X,
} from 'lucide-react';
import { DatePicker } from '@/components/ui/DatePicker';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { deletePaxDutyAllocation, listPaxDutyAllocations } from '@/lib/api';
import { mapPaxDutyAllocationFromApi, type PaxDutyAllocationRecord } from '@/lib/paxDutyAllocationStorage';
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
} from '@/components/fris/reports/ReportsMobileCards';
import { FRIS_REPORTS_ACTION_BTN_CLASS, FRIS_REPORTS_PAGE_SHELL_CLASS } from '@/lib/fris-reports-responsive';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { FLIGHT_FILTER_ACTIONS_PB } from '@/components/fris/flights/flightFilterBarLayout';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { FRIS_INVALID_PICKER_WRAP, validateYmdDateRange } from '@/lib/form-validation';
import { cn } from '@/lib/utils';
import {
  DutyChipList,
  GLASS_CARD_CLASS,
  EMERALD_HEADER_CLASS,
  SHIFT_FILTER_TABS,
  formatDutyDisplayDate,
  getShiftBadgeClass,
  uniqueDutiesFromRecord,
  type ShiftFilterTab,
} from './paxDutyAllocationUi';

const FILTER_FIELD_ORDER = ['fromDate', 'toDate'] as const;
type FilterField = (typeof FILTER_FIELD_ORDER)[number];

function localCalendarYmd(d = new Date()): string {
  const cal = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return `${cal.getFullYear()}-${String(cal.getMonth() + 1).padStart(2, '0')}-${String(cal.getDate()).padStart(2, '0')}`;
}

function scheduleFilterCapDate(): Date {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

export default function PaxDutyAllocationContent() {
  const router = useRouter();
  const [fromDate, setFromDate] = useState(() => localCalendarYmd());
  const [toDate, setToDate] = useState(() => localCalendarYmd());
  const [records, setRecords] = useState<PaxDutyAllocationRecord[]>([]);
  const [tableVisible, setTableVisible] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [shiftFilter, setShiftFilter] = useState<ShiftFilterTab>('ALL');

  const { errors, clearField, applyAndFocus } = useFieldErrors<FilterField>(FILTER_FIELD_ORDER);

  const scheduleFilterMaxDate = scheduleFilterCapDate();
  const scheduleFilterMaxYyyyMmDd = localCalendarYmd();

  const scheduleFilterStartMaxDate = useMemo(() => {
    if (!toDate?.trim()) return scheduleFilterMaxDate;
    const parts = toDate.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return scheduleFilterMaxDate;
    const [y, m, day] = parts;
    const end = new Date(y!, m! - 1, day!);
    return end.getTime() <= scheduleFilterMaxDate.getTime() ? end : scheduleFilterMaxDate;
  }, [toDate, scheduleFilterMaxDate]);

  const getRecords = useCallback(async () => {
    const next = validateYmdDateRange(fromDate, toDate, { toNotAfterToday: true });
    if (applyAndFocus(next)) return;
    setListLoading(true);
    try {
      const raw = await listPaxDutyAllocations(fromDate, toDate);
      const mapped = raw
        .map((row) => mapPaxDutyAllocationFromApi(row))
        .filter((r): r is PaxDutyAllocationRecord => r != null);
      setRecords(mapped);
      setTableVisible(true);
      setExpandedId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load records.');
      setRecords([]);
    } finally {
      setListLoading(false);
    }
  }, [fromDate, toDate, applyAndFocus]);

  useEffect(() => {
    void getRecords();
  }, [getRecords]);

  const filteredRows = useMemo(() => {
    return records.filter((r) => {
      const d = (r.date ?? '').trim();
      if (!d || d < fromDate || d > toDate) return false;

      if (shiftFilter !== 'ALL' && (r.shift || '').toLowerCase() !== shiftFilter.toLowerCase()) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchFlight = (r.flight || '').toLowerCase().includes(q);
        const matchFlightNo = (r.flightNo || '').toLowerCase().includes(q);
        const matchShift = (r.shift || '').toLowerCase().includes(q);
        const matchStaff = r.staffAssignments.some(
          (s) =>
            (s.staff || '').toLowerCase().includes(q) ||
            (s.employeeName || '').toLowerCase().includes(q) ||
            (s.employeeCode || '').toLowerCase().includes(q) ||
            s.dutyAllocations.some((duty) => duty.toLowerCase().includes(q)),
        );
        return matchFlight || matchFlightNo || matchShift || matchStaff;
      }

      return true;
    });
  }, [records, fromDate, toDate, shiftFilter, searchQuery]);

  const metrics = useMemo(() => {
    const totalRecords = filteredRows.length;
    let totalStaffCount = 0;
    const shiftCounts: Record<string, number> = {};

    filteredRows.forEach((r) => {
      totalStaffCount += r.staffAssignments?.length || 0;
      const s = (r.shift || 'General').trim() || 'General';
      shiftCounts[s] = (shiftCounts[s] || 0) + 1;
    });

    const tabCounts: Record<ShiftFilterTab, number> = {
      ALL: records.filter((r) => {
        const d = (r.date ?? '').trim();
        return d && d >= fromDate && d <= toDate;
      }).length,
      Morning: 0,
      Day: 0,
      Evening: 0,
      Night: 0,
    };
    for (const r of records) {
      const d = (r.date ?? '').trim();
      if (!d || d < fromDate || d > toDate) continue;
      const key = (r.shift || '').trim();
      if (key === 'Morning' || key === 'Day' || key === 'Evening' || key === 'Night') {
        tabCounts[key] += 1;
      }
    }

    return { totalRecords, totalStaffCount, shiftCounts, tabCounts };
  }, [filteredRows, records, fromDate, toDate]);

  const handleDelete = async (id: string) => {
    try {
      await deletePaxDutyAllocation(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      if (expandedId === id) setExpandedId(null);
      toast.success('Report deleted.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed.');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    setDeleteTargetId(null);
    await handleDelete(id);
  };

  const toggleDetails = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const hasLiveFilter = Boolean(searchQuery.trim()) || shiftFilter !== 'ALL';

  return (
    <div className={`${FRIS_REPORTS_PAGE_SHELL_CLASS} bg-slate-50/80 min-h-screen pb-12`}>
      <div className="mx-auto max-w-[1280px]">
        <Link
          href="/fris/reports/pax-shift"
          className="mb-4 inline-flex min-h-11 items-center gap-2 pt-4 text-xs font-semibold uppercase tracking-wider text-emerald-700 transition-colors hover:text-emerald-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Pax Shift Report
        </Link>

        <section
          className={cn(
            'mb-5 overflow-hidden rounded-2xl border border-emerald-800/20 shadow-md shadow-emerald-900/10',
            EMERALD_HEADER_CLASS,
          )}
        >
          <div className="flex flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-md">
                <ClipboardList className="h-6 w-6 text-white" aria-hidden />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                    Pax Duty Allocation
                  </h1>
                  <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
                    Roster
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-emerald-100/90">
                  Station-wise passenger shift staffing by flight
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.push('/fris/reports/pax-shift/duty-allocation/new')}
              className={cn(
                FRIS_REPORTS_ACTION_BTN_CLASS,
                'w-full border border-white/25 bg-white font-semibold text-emerald-800 shadow-sm hover:bg-emerald-50 sm:w-auto',
              )}
            >
              <Sparkles className="h-4 w-4" />
              Create new allocation
            </button>
          </div>
        </section>

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className={cn(GLASS_CARD_CLASS, 'flex items-center gap-3.5 p-4')}>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
              <Layers className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Allocated flights</p>
              <p className="text-xl font-bold tabular-nums text-slate-900" aria-live="polite">
                {metrics.totalRecords}
              </p>
            </div>
          </div>

          <div className={cn(GLASS_CARD_CLASS, 'flex items-center gap-3.5 p-4')}>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
              <Users className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Staff assigned</p>
              <p className="text-xl font-bold tabular-nums text-slate-900" aria-live="polite">
                {metrics.totalStaffCount}
              </p>
            </div>
          </div>

          <div className={cn(GLASS_CARD_CLASS, 'flex items-center gap-3.5 p-4')}>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
              <Calendar className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">Active shift distribution</p>
              {Object.keys(metrics.shiftCounts).length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {Object.entries(metrics.shiftCounts).map(([s, c]) => (
                    <span
                      key={s}
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                        getShiftBadgeClass(s),
                      )}
                    >
                      {s} {c}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs font-medium text-slate-500">No active shifts</p>
              )}
            </div>
          </div>
        </div>

        <section className={cn(GLASS_CARD_CLASS, 'mb-6 overflow-hidden')}>
          <div className={cn('flex items-center gap-2 px-4 py-3 sm:px-6', EMERALD_HEADER_CLASS)}>
            <Filter className="h-4 w-4 text-white" aria-hidden />
            <h2 className="text-sm font-semibold text-white">Filters &amp; search</h2>
          </div>
          <div className="space-y-4 p-4 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:max-w-xl">
                <div className={cn(errors.fromDate && FRIS_INVALID_PICKER_WRAP)}>
                  <label
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600"
                    htmlFor="field-fromDate"
                  >
                    From date
                  </label>
                  <DatePicker
                    id="field-fromDate"
                    value={fromDate}
                    onChange={(v) => {
                      let next = v ?? '';
                      if (next > scheduleFilterMaxYyyyMmDd) next = scheduleFilterMaxYyyyMmDd;
                      if (toDate && next && next > toDate) next = toDate;
                      setFromDate(next);
                      clearField('fromDate');
                    }}
                    valueFormat="yyyy-MM-dd"
                    maxDate={scheduleFilterStartMaxDate}
                  />
                  <FormFieldError id="field-fromDate-error" message={errors.fromDate} />
                </div>
                <div className={cn(errors.toDate && FRIS_INVALID_PICKER_WRAP)}>
                  <label
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600"
                    htmlFor="field-toDate"
                  >
                    To date
                  </label>
                  <DatePicker
                    id="field-toDate"
                    value={toDate}
                    onChange={(v) => {
                      let next = v ?? '';
                      if (next > scheduleFilterMaxYyyyMmDd) next = scheduleFilterMaxYyyyMmDd;
                      if (fromDate && next && next < fromDate) next = fromDate;
                      setToDate(next);
                      clearField('toDate');
                    }}
                    valueFormat="yyyy-MM-dd"
                    minDate={
                      fromDate
                        ? (() => {
                            const [y, m, d] = fromDate.split('-').map(Number);
                            return new Date(y!, m! - 1, d!);
                          })()
                        : undefined
                    }
                    maxDate={scheduleFilterMaxDate}
                  />
                  <FormFieldError id="field-toDate-error" message={errors.toDate} />
                </div>
              </div>

              <div className={FLIGHT_FILTER_ACTIONS_PB}>
                <button
                  type="button"
                  onClick={() => void getRecords()}
                  disabled={listLoading}
                  className="h-11 w-full rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white shadow-sm transition-[background-color,transform,opacity] duration-150 ease-out hover:bg-emerald-700 active:scale-[0.97] disabled:opacity-60 lg:w-auto lg:min-w-[140px]"
                >
                  {listLoading ? 'Loading…' : 'Fetch records'}
                </button>
              </div>
            </div>

            <div className="h-px bg-slate-200/80" />

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative max-w-md flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search flight, flight number, staff name, or employee code…"
                  aria-label="Search allocations by flight, flight number, staff name, or employee code"
                  className="h-11 w-full rounded-xl border border-slate-200/80 bg-white/80 pl-9 pr-9 text-sm text-slate-900 transition-[border-color,box-shadow,background-color] duration-150 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition-colors hover:text-slate-600"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>

              <div
                className="flex flex-wrap items-center gap-1.5"
                role="tablist"
                aria-label="Filter by shift"
              >
                {SHIFT_FILTER_TABS.map((shift) => {
                  const active = shiftFilter === shift;
                  const count = metrics.tabCounts[shift];
                  return (
                    <button
                      key={shift}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setShiftFilter(shift)}
                      className={cn(
                        'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97]',
                        active
                          ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                          : 'border-slate-200/80 bg-white/80 text-slate-600 hover:border-slate-300 hover:text-slate-900',
                      )}
                    >
                      {shift === 'ALL' ? 'All' : shift}
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums',
                          active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500',
                        )}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {tableVisible ? (
          <section className={cn(GLASS_CARD_CLASS, 'overflow-hidden')}>
            <div className={cn('flex items-center justify-between px-4 py-3 sm:px-6', EMERALD_HEADER_CLASS)}>
              <div>
                <h2 className="text-base font-semibold text-white">Duty allocation roster</h2>
                <p className="mt-0.5 text-xs text-emerald-100/90" aria-live="polite">
                  Showing {filteredRows.length} record{filteredRows.length === 1 ? '' : 's'} from{' '}
                  {formatDutyDisplayDate(fromDate)} to {formatDutyDisplayDate(toDate)}
                </p>
              </div>
            </div>

            <ReportsAdaptiveTable
              mobile={
                listLoading && filteredRows.length === 0 ? (
                  <ReportsMobileEmpty title="Loading saved duty allocations…" />
                ) : filteredRows.length === 0 ? (
                  <ReportsMobileEmpty
                    title="No allocations found"
                    description={
                      hasLiveFilter
                        ? 'Try clearing search or shift filters.'
                        : 'Tap Create new allocation to add a duty roster in this date range.'
                    }
                  />
                ) : (
                  <ReportsMobileCardList className="p-3">
                    {filteredRows.map((r) => {
                      const duties = uniqueDutiesFromRecord(r);
                      return (
                        <ReportsMobileCard key={r.id}>
                          <ReportsMobileCardHeader
                            title={r.flight || r.flightNo || 'Duty Allocation'}
                            subtitle={`${formatDutyDisplayDate(r.date)} · ${r.shift || 'General Shift'}`}
                          />
                          <ReportsMobileCardGrid>
                            <ReportsMobileCardField label="Flight name" value={r.flight || '—'} />
                            <ReportsMobileCardField label="Flight no" value={r.flightNo || '—'} />
                            <ReportsMobileCardField
                              label="Staff count"
                              value={`${r.staffAssignments?.length || 0} assigned`}
                            />
                            <ReportsMobileCardField label="Shift" value={r.shift || '—'} />
                          </ReportsMobileCardGrid>
                          <div className="mt-3">
                            <DutyChipList duties={duties} max={5} />
                          </div>

                          {expandedId === r.id ? (
                            <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 text-sm">
                              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                                Assigned staff &amp; duties
                              </p>
                              <div className="mt-2 space-y-2">
                                {r.staffAssignments.map((s, idx) => (
                                  <div
                                    key={`${r.id}-m-${idx}`}
                                    className="rounded-lg border border-emerald-100/80 bg-white p-2.5 shadow-xs"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="font-semibold text-slate-900">{s.staff || '—'}</p>
                                      {s.employeeCode ? (
                                        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
                                          {s.employeeCode}
                                        </span>
                                      ) : null}
                                    </div>
                                    <div className="mt-2">
                                      <DutyChipList duties={s.dutyAllocations} max={8} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <ReportsMobileCardActions>
                            <ReportsMobileCardButton variant="secondary" onClick={() => toggleDetails(r.id)}>
                              {expandedId === r.id ? (
                                <>
                                  <ChevronUp className="h-4 w-4" />
                                  Hide details
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="h-4 w-4" />
                                  Details
                                </>
                              )}
                            </ReportsMobileCardButton>
                            <ReportsMobileCardButton
                              onClick={() =>
                                router.push(
                                  `/fris/reports/pax-shift/duty-allocation/${encodeURIComponent(r.id)}/edit`,
                                )
                              }
                            >
                              <Pencil className="h-4 w-4" />
                              Edit
                            </ReportsMobileCardButton>
                            <ReportsMobileCardButton variant="danger" onClick={() => setDeleteTargetId(r.id)}>
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </ReportsMobileCardButton>
                          </ReportsMobileCardActions>
                        </ReportsMobileCard>
                      );
                    })}
                  </ReportsMobileCardList>
                )
              }
              desktop={
                <ReportsResponsiveTable showScrollHint={false}>
                  <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80">
                        <th className="px-4 py-3.5 font-semibold text-slate-700 sm:px-5">Date</th>
                        <th className="px-4 py-3.5 font-semibold text-slate-700 sm:px-5">Shift</th>
                        <th className="px-4 py-3.5 font-semibold text-slate-700 sm:px-5">Flight</th>
                        <th className="px-4 py-3.5 font-semibold text-slate-700 sm:px-5">Flight no</th>
                        <th className="px-4 py-3.5 font-semibold text-slate-700 sm:px-5">Coverage</th>
                        <th className="px-4 py-3.5 text-right font-semibold text-slate-700 sm:px-5">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {listLoading && filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-12 text-center text-slate-500 sm:px-5">
                            Loading saved allocations…
                          </td>
                        </tr>
                      ) : filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-12 text-center text-slate-500 sm:px-5">
                            <div className="flex flex-col items-center justify-center">
                              <ClipboardList className="mb-2 h-10 w-10 text-slate-300" />
                              <p className="font-medium text-slate-700">No duty allocations found</p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {hasLiveFilter
                                  ? 'Try resetting search or shift filters.'
                                  : 'Use Create new allocation above to add a record.'}
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((r) => {
                          const duties = uniqueDutiesFromRecord(r);
                          return (
                            <React.Fragment key={r.id}>
                              <tr className="transition-colors duration-150 hover:bg-slate-50/80">
                                <td className="px-4 py-3.5 font-medium text-slate-900 sm:px-5">
                                  {formatDutyDisplayDate(r.date)}
                                </td>
                                <td className="px-4 py-3.5 sm:px-5">
                                  <span
                                    className={cn(
                                      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                                      getShiftBadgeClass(r.shift || 'General'),
                                    )}
                                  >
                                    {r.shift || 'General'}
                                  </span>
                                </td>
                                <td className="px-4 py-3.5 font-semibold text-slate-800 sm:px-5">
                                  <div className="flex items-center gap-2">
                                    <Plane className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                                    {r.flight || '—'}
                                  </div>
                                </td>
                                <td className="px-4 py-3.5 text-slate-700 sm:px-5">{r.flightNo || '—'}</td>
                                <td className="px-4 py-3.5 sm:px-5">
                                  <div className="flex flex-col gap-1.5">
                                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                      <Users className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                                      {r.staffAssignments?.length || 0} staff
                                    </span>
                                    <DutyChipList duties={duties} max={4} />
                                  </div>
                                </td>
                                <td className="px-4 py-3.5 text-right sm:px-5">
                                  <div className="flex flex-wrap justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => toggleDetails(r.id)}
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition-[background-color,transform] duration-150 ease-out hover:bg-slate-50 active:scale-[0.97]"
                                    >
                                      {expandedId === r.id ? (
                                        <>
                                          <ChevronUp className="h-3.5 w-3.5" />
                                          Hide
                                        </>
                                      ) : (
                                        <>
                                          <ChevronDown className="h-3.5 w-3.5" />
                                          Details
                                        </>
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        router.push(
                                          `/fris/reports/pax-shift/duty-allocation/${encodeURIComponent(r.id)}/edit`,
                                        )
                                      }
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-xs transition-[background-color,transform] duration-150 ease-out hover:bg-emerald-100 active:scale-[0.97]"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeleteTargetId(r.id)}
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 shadow-xs transition-[background-color,transform] duration-150 ease-out hover:bg-red-50 active:scale-[0.97]"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {expandedId === r.id ? (
                                <tr className="bg-emerald-50/20">
                                  <td colSpan={6} className="px-4 py-4 sm:px-5">
                                    <div className="rounded-xl border border-emerald-100 bg-white/90 p-4 shadow-sm backdrop-blur-sm">
                                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                                          Assigned staff coverage
                                        </p>
                                        <span className="text-xs text-slate-500">
                                          Flight: {r.flight} ({r.flightNo})
                                        </span>
                                      </div>
                                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {r.staffAssignments.map((s, idx) => (
                                          <div
                                            key={`${r.id}-d-${idx}`}
                                            className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3"
                                          >
                                            <div className="flex items-center justify-between gap-2">
                                              <p className="font-semibold text-slate-900">{s.staff || '—'}</p>
                                              {s.employeeCode ? (
                                                <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                                                  {s.employeeCode}
                                                </span>
                                              ) : null}
                                            </div>
                                            <div className="mt-2">
                                              <DutyChipList duties={s.dutyAllocations} max={8} />
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </ReportsResponsiveTable>
              }
            />
          </section>
        ) : null}

        <AlertDialog open={deleteTargetId !== null} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
          <AlertDialogContent className="border-slate-200 bg-white">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-slate-900">Delete this duty allocation report?</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-600">
                This will permanently remove the duty allocation record from the database, including all assigned staff
                duties for this flight.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-slate-200">Cancel</AlertDialogCancel>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition-[background-color,transform] duration-150 ease-out hover:bg-red-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 sm:mt-0"
              >
                Delete
              </button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
