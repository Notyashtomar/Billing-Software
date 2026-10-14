'use client';

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import {
  CircleAlert,
  Clock3,
  Plane,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  fetchQualityReportNonScheduledTable,
  fetchQualityReportScheduledTable,
  type QualityReportNonScheduledAirlineRow,
  type QualityReportScheduledAirlineRow,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { ReportsResponsiveTable } from '@/components/fris/reports/ReportsResponsiveTable';
const EMERALD = '#1D9E75';
const EMERALD_DARK = '#0F6E56';
const AMBER = '#EF9F27';
const AMBER_LIGHT = '#F6C66B';
const RED = '#E24B4A';
const SLATE_BORDER = '#E2E8F0';
const MUTED = '#64748B';

const QUALITY_BTN_TRANSITION =
  'transition-[transform,opacity,background-color,border-color] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]';

const numberFormat = new Intl.NumberFormat('en-IN');
const compactFormat = new Intl.NumberFormat('en-IN', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

type NonScheduledRow = QualityReportNonScheduledAirlineRow;

const panelClass =
  'rounded-[26px] border border-emerald-100/90 bg-white/90 shadow-sm shadow-emerald-900/[0.03] ring-1 ring-emerald-900/[0.04] backdrop-blur-sm transition-[transform,box-shadow,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-emerald-200/90 hover:shadow-md hover:shadow-emerald-900/[0.05]';
const chartPanelClass = `${panelClass} p-4 sm:p-5`;
const scheduledTableHeaderClass =
  'border-b border-emerald-100/80 bg-emerald-50/55 px-2 py-2 text-left align-top text-[11px] font-semibold leading-tight text-emerald-950';
const scheduledTableCellClass = 'border-b border-emerald-50 px-2 py-2 text-xs leading-tight text-slate-700';
const tooltipContentStyle = {
  borderRadius: 16,
  border: '1px solid rgba(167, 243, 208, 0.9)',
  backgroundColor: 'rgba(255, 255, 255, 0.96)',
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
};

function formatNumber(value: number): string {
  return numberFormat.format(value);
}

function formatCompact(value: number): string {
  return compactFormat.format(value);
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatTableNumber(value: number): string {
  return value === 0 ? '-' : formatNumber(value);
}

function formatTableCompact(value: number): string {
  return value === 0 ? '-' : formatCompact(value);
}

function formatTablePercent(value: number): string {
  return value === 0 ? '-' : formatPercent(value);
}

function getRatingLabel(score: number): 'Not Satisfactory' | 'Satisfactory' | 'Good' | 'Excellent' {
  if (score < 50) return 'Not Satisfactory';
  if (score < 75) return 'Satisfactory';
  if (score < 90) return 'Good';
  return 'Excellent';
}

function getOtherFlightsCount(row: QualityReportScheduledAirlineRow): number {
  return Math.max(0, row.flights - row.cancels - row.additional);
}

function renderBarPercentLabel(value: unknown): string {
  return `${Math.round(Number(value) || 0)}%`;
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-emerald-950">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  badge: string;
  icon: LucideIcon;
}) {
  const shouldReduceMotion = useReducedMotion();
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const pointerX = useMotionValue(50);
  const pointerY = useMotionValue(50);
  const springRotateX = useSpring(rotateX, { stiffness: 180, damping: 18, mass: 0.9 });
  const springRotateY = useSpring(rotateY, { stiffness: 180, damping: 18, mass: 0.9 });
  const springPointerX = useSpring(pointerX, { stiffness: 160, damping: 20, mass: 0.8 });
  const springPointerY = useSpring(pointerY, { stiffness: 160, damping: 20, mass: 0.8 });
  const sheen = useMotionTemplate`radial-gradient(circle at ${springPointerX}% ${springPointerY}%, rgba(255,255,255,0.82), rgba(255,255,255,0.28) 18%, transparent 56%)`;

  const handlePointerMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (shouldReduceMotion) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / rect.width;
    const relativeY = (event.clientY - rect.top) / rect.height;

    pointerX.set(relativeX * 100);
    pointerY.set(relativeY * 100);
    rotateY.set((relativeX - 0.5) * 10);
    rotateX.set((0.5 - relativeY) * 10);
  };

  const handlePointerLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
    pointerX.set(50);
    pointerY.set(50);
  };

  return (
    <div className="[perspective:1200px]">
      <motion.article
        whileTap={shouldReduceMotion ? undefined : { scale: 0.985 }}
        onMouseMove={handlePointerMove}
        onMouseLeave={handlePointerLeave}
        className={cn(
          panelClass,
          'relative overflow-hidden p-3.5 [transform-style:preserve-3d] sm:p-4',
        )}
        style={
          shouldReduceMotion
            ? undefined
            : {
                rotateX: springRotateX,
                rotateY: springRotateY,
              }
        }
      >
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 h-20 rounded-t-[inherit]',
            'bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.16),transparent_68%)]',
          )}
        />
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(135deg,rgba(255,255,255,0.75),transparent_42%,rgba(16,185,129,0.08)_100%)]" />
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-80"
          style={shouldReduceMotion ? undefined : { backgroundImage: sheen }}
        />
        <div className="pointer-events-none absolute inset-x-3 bottom-0 h-14 rounded-full bg-emerald-950/8 blur-2xl" />

        <div className="relative z-10 flex items-center gap-3 [transform:translateZ(28px)]">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-md shadow-emerald-900/20 ring-1 ring-white/35',
            )}
          >
            <Icon className="h-4.5 w-4.5" aria-hidden />
          </span>
          <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-slate-900">
            {label}
          </p>
        </div>

        <div className="relative z-10 mt-3 [transform:translateZ(20px)]">
          <p className="text-[1.45rem] font-semibold leading-none tracking-tight text-emerald-950 sm:text-[1.55rem]">
            {value}
          </p>
        </div>
      </motion.article>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(chartPanelClass, 'min-w-0', className)}>
      <SectionTitle title={title} subtitle={subtitle} />
      {children}
    </section>
  );
}

type Props = {
  fromYmd: string;
  toYmd: string;
  airlineValue: string;
  airlineLabel?: string;
  stationCode?: string;
  refreshNonce?: number;
};

export type QualityReportResultsHandle = {
  exportPdf: () => Promise<void>;
};

function ymdToDisplay(value: string): string {
  const parts = value.split('-');
  if (parts.length !== 3) return value;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

const QualityReportResultsTables = forwardRef<QualityReportResultsHandle, Props>(function QualityReportResultsTables(
  { fromYmd, toYmd, airlineValue, airlineLabel = 'All airlines', stationCode = '', refreshNonce = 0 },
  ref,
) {
  const baggageChartRef = useRef<HTMLDivElement>(null);
  const cargoChartRef = useRef<HTMLDivElement>(null);
  const [detailsView, setDetailsView] = useState<'scheduled' | 'nonScheduled'>('scheduled');
  const [scheduledRows, setScheduledRows] = useState<QualityReportScheduledAirlineRow[]>([]);
  const [scheduledRowsLoadedKey, setScheduledRowsLoadedKey] = useState('');
  const [scheduledRowsError, setScheduledRowsError] = useState<string | null>(null);
  const [nonScheduledRows, setNonScheduledRows] = useState<NonScheduledRow[]>([]);
  const [nonScheduledLoadedKey, setNonScheduledLoadedKey] = useState('');
  const [nonScheduledError, setNonScheduledError] = useState<string | null>(null);
  const scheduledRowsRequestKey = `${fromYmd}|${toYmd}|${refreshNonce}`;
  const scheduledRowsLoading = scheduledRowsLoadedKey !== scheduledRowsRequestKey;
  const nonScheduledLoading = nonScheduledLoadedKey !== scheduledRowsRequestKey;

  useEffect(() => {
    const ac = new AbortController();

    void fetchQualityReportScheduledTable(fromYmd, toYmd, undefined, { signal: ac.signal })
      .then((rows) => {
        if (ac.signal.aborted) return;
        setScheduledRows(rows);
        setScheduledRowsError(null);
        setScheduledRowsLoadedKey(scheduledRowsRequestKey);
      })
      .catch((error: unknown) => {
        if (ac.signal.aborted) return;
        setScheduledRows([]);
        setScheduledRowsError(
          error instanceof Error
            ? error.message
            : 'Could not load the scheduled flight detail table.',
        );
        setScheduledRowsLoadedKey(scheduledRowsRequestKey);
      });

    return () => ac.abort();
  }, [fromYmd, scheduledRowsRequestKey, toYmd]);

  useEffect(() => {
    const ac = new AbortController();

    void fetchQualityReportNonScheduledTable(fromYmd, toYmd, undefined, { signal: ac.signal })
      .then((rows) => {
        if (ac.signal.aborted) return;
        setNonScheduledRows(rows);
        setNonScheduledError(null);
        setNonScheduledLoadedKey(scheduledRowsRequestKey);
      })
      .catch((error: unknown) => {
        if (ac.signal.aborted) return;
        setNonScheduledRows([]);
        setNonScheduledError(
          error instanceof Error
            ? error.message
            : 'Could not load the non-scheduled flight detail table.',
        );
        setNonScheduledLoadedKey(scheduledRowsRequestKey);
      });

    return () => ac.abort();
  }, [fromYmd, scheduledRowsRequestKey, toYmd]);

  const filteredScheduledRows = useMemo(() => {
    if (!airlineValue.trim()) return scheduledRows;
    const selected = airlineValue.trim().toLowerCase();
    return scheduledRows.filter((row) => row.airline.toLowerCase() === selected);
  }, [airlineValue, scheduledRows]);

  const filteredNonScheduledRows = useMemo(() => {
    if (!airlineValue.trim()) return nonScheduledRows;
    const selected = airlineValue.trim().toLowerCase();
    return nonScheduledRows.filter((row) => row.operator.toLowerCase() === selected);
  }, [airlineValue, nonScheduledRows]);

  const currentAirlineRow = useMemo(() => {
    if (!airlineValue.trim()) return null;
    const selected = airlineValue.trim().toLowerCase();
    return scheduledRows.find((row) => row.airline.toLowerCase() === selected) ?? null;
  }, [airlineValue, scheduledRows]);

  const overview = useMemo(() => {
    const sourceRows = currentAirlineRow ? [currentAirlineRow] : filteredScheduledRows;
    if (sourceRows.length === 0) {
      return {
        flights: 0,
        cancels: 0,
        firstBagPct: 0,
        lastBagPct: 0,
        arrivalPax: 0,
        qualityScore: 0,
      };
    }

    let flights = 0;
    let cancels = 0;
    let arrivalPax = 0;
    let firstBagWeighted = 0;
    let lastBagWeighted = 0;
    let qualityWeighted = 0;

    for (const row of sourceRows) {
      flights += row.flights;
      cancels += row.cancels;
      arrivalPax += row.arrivalPax;
      firstBagWeighted += row.firstBagPct * row.flights;
      lastBagWeighted += row.lastBagPct * row.flights;
      qualityWeighted += row.qualityScore * row.flights;
    }

    return {
      flights,
      cancels,
      firstBagPct:
        flights > 0 ? Math.round(firstBagWeighted / flights) : 0,
      lastBagPct:
        flights > 0 ? Math.round(lastBagWeighted / flights) : 0,
      arrivalPax,
      qualityScore:
        flights > 0 ? Math.round(qualityWeighted / flights) : 0,
    };
  }, [currentAirlineRow, filteredScheduledRows]);

  const ratingDistribution = useMemo(() => {
    const buckets = [
      { label: 'Not Satisfactory', color: RED, value: 0, airlines: 0 },
      { label: 'Satisfactory', color: AMBER, value: 0, airlines: 0 },
      { label: 'Good', color: EMERALD, value: 0, airlines: 0 },
      { label: 'Excellent', color: EMERALD_DARK, value: 0, airlines: 0 },
    ];

    for (const row of filteredScheduledRows) {
      const label = getRatingLabel(row.qualityScore);
      const bucket = buckets.find((item) => item.label === label);
      if (!bucket) continue;
      bucket.value += row.flights;
      bucket.airlines += 1;
    }

    return buckets;
  }, [filteredScheduledRows]);

  const cargoMailData = useMemo(
    () =>
      [...filteredScheduledRows]
        .sort((a, b) => b.arrivalCargo - a.arrivalCargo)
        .slice(0, 5)
        .map((row) => ({
          code: row.code,
          airline: row.airline,
          arrivalCargo: row.arrivalCargo,
          departCargo: row.departCargo,
          arrivalMail: row.arrivalMail,
        })),
    [filteredScheduledRows],
  );

  const passengerFlowData = useMemo(
    () =>
      filteredScheduledRows.map((row) => ({
        code: row.code,
        airline: row.airline,
        arrivalPax: row.arrivalPax,
        departPax: row.departPax,
      })),
    [filteredScheduledRows],
  );

  const scheduledTableRows = useMemo(() => {
    return [...filteredScheduledRows].sort((left, right) => right.flights - left.flights);
  }, [filteredScheduledRows]);
  const scheduledTableTotals = useMemo(() => {
    let flights = 0;
    let cancels = 0;
    let additional = 0;
    let other = 0;
    let firstBagWeighted = 0;
    let lastBagWeighted = 0;
    let holdClosedWeighted = 0;
    let arrivalPax = 0;
    let departPax = 0;
    let arrivalCargo = 0;
    let departCargo = 0;
    let arrivalMail = 0;
    let departMail = 0;
    let arrivalBaggage = 0;
    let departBaggage = 0;

    for (const row of scheduledTableRows) {
      flights += row.flights;
      cancels += row.cancels;
      additional += row.additional;
      other += getOtherFlightsCount(row);
      firstBagWeighted += row.firstBagPct * row.flights;
      lastBagWeighted += row.lastBagPct * row.flights;
      holdClosedWeighted += row.holdClosedPct * row.flights;
      arrivalPax += row.arrivalPax;
      departPax += row.departPax;
      arrivalCargo += row.arrivalCargo;
      departCargo += row.departCargo;
      arrivalMail += row.arrivalMail;
      departMail += row.departMail;
      arrivalBaggage += row.arrivalBaggage;
      departBaggage += row.departBaggage;
    }

    return {
      flights,
      cancels,
      additional,
      other,
      firstBagPct:
        flights > 0 ? Math.round(firstBagWeighted / flights) : 0,
      lastBagPct:
        flights > 0 ? Math.round(lastBagWeighted / flights) : 0,
      holdClosedPct:
        flights > 0 ? Math.round(holdClosedWeighted / flights) : 0,
      arrivalPax,
      departPax,
      arrivalCargo,
      departCargo,
      arrivalMail,
      departMail,
      arrivalBaggage,
      departBaggage,
    };
  }, [scheduledTableRows]);

  const scheduledPanelHeight = useMemo(
    () => Math.max(540, 200 + (scheduledTableRows.length + 1) * 34),
    [scheduledTableRows.length],
  );
  const nonScheduledPanelHeight = useMemo(
    () => Math.max(340, 170 + Math.max(filteredNonScheduledRows.length, 1) * 34),
    [filteredNonScheduledRows.length],
  );
  const detailsPanelHeight =
    detailsView === 'scheduled' ? scheduledPanelHeight : nonScheduledPanelHeight;

  useImperativeHandle(
    ref,
    () => ({
      exportPdf: async () => {
        const scheduledRowsPdf = scheduledTableRows.map((row) => [
          row.code,
          row.airline,
          formatNumber(row.flights),
          formatNumber(row.cancels),
          formatNumber(row.additional),
          formatNumber(getOtherFlightsCount(row)),
          formatPercent(row.holdClosedPct),
          formatPercent(row.firstBagPct),
          formatPercent(row.lastBagPct),
          formatCompact(row.arrivalPax),
          formatCompact(row.departPax),
          formatCompact(row.arrivalCargo),
          formatCompact(row.departCargo),
          formatCompact(row.arrivalMail),
          formatCompact(row.departMail),
          formatCompact(row.arrivalBaggage),
          formatCompact(row.departBaggage),
        ]);

        const scheduledTotalRow =
          scheduledTableRows.length > 0
            ? [
                'Total',
                'All airlines',
                formatNumber(scheduledTableTotals.flights),
                formatNumber(scheduledTableTotals.cancels),
                formatNumber(scheduledTableTotals.additional),
                formatNumber(scheduledTableTotals.other),
                formatPercent(scheduledTableTotals.holdClosedPct),
                formatPercent(scheduledTableTotals.firstBagPct),
                formatPercent(scheduledTableTotals.lastBagPct),
                formatCompact(scheduledTableTotals.arrivalPax),
                formatCompact(scheduledTableTotals.departPax),
                formatCompact(scheduledTableTotals.arrivalCargo),
                formatCompact(scheduledTableTotals.departCargo),
                formatCompact(scheduledTableTotals.arrivalMail),
                formatCompact(scheduledTableTotals.departMail),
                formatCompact(scheduledTableTotals.arrivalBaggage),
                formatCompact(scheduledTableTotals.departBaggage),
              ]
            : undefined;

        const nonScheduledRowsPdf = filteredNonScheduledRows.map((row) => [
          row.operator,
          formatNumber(row.flights),
          formatNumber(row.cancelNoOp),
          formatCompact(row.arrivalPax),
          formatCompact(row.departPax),
          formatCompact(row.arrivalCargo),
          formatCompact(row.departCargo),
          formatCompact(row.arrivalMail),
          formatCompact(row.departMail),
          formatCompact(row.arrivalBaggage),
          formatCompact(row.departBaggage),
        ]);

        const { exportQualityReportPdf } = await import(
          '@/components/fris/reports/quality-report/exportPDF'
        );
        await exportQualityReportPdf({
          title: 'Quality Report',
          airlineLabel,
          fromLabel: ymdToDisplay(fromYmd),
          toLabel: ymdToDisplay(toYmd),
          charts: [
            { title: 'Baggage on-time', element: baggageChartRef.current },
            { title: 'Cargo and mail mix', element: cargoChartRef.current },
          ],
          tables: [
            {
              title: 'Scheduled Flight Detail',
              columns: [
                { header: 'Code', width: 4 },
                { header: 'Airlines', width: 11 },
                { header: 'Total Flights', width: 5, align: 'right' },
                { header: 'Cancel / No Ops', width: 5, align: 'right' },
                { header: 'Additional Flights', width: 5, align: 'right' },
                { header: 'Other Flights', width: 5, align: 'right' },
                { header: 'Hold closed', width: 5, align: 'right' },
                { header: 'First Bag (Arr)', width: 5, align: 'right' },
                { header: 'Last Bag (Arr)', width: 5, align: 'right' },
                { header: 'Arrival Pax', width: 5, align: 'right' },
                { header: 'Depart Pax', width: 5, align: 'right' },
                { header: 'Arrival Cargo', width: 5.5, align: 'right' },
                { header: 'Depart Cargo', width: 5.5, align: 'right' },
                { header: 'Arrival Mail', width: 5, align: 'right' },
                { header: 'Depart Mail', width: 5, align: 'right' },
                { header: 'Arrival Baggage', width: 5.5, align: 'right' },
                { header: 'Depart Baggage', width: 5.5, align: 'right' },
              ],
              rows: scheduledRowsPdf,
              totalRow: scheduledTotalRow,
              emptyText: stationCode
                ? `No scheduled FHR for station ${stationCode} in this date range.`
                : 'No scheduled flights found for the selected date range.',
            },
            {
              title: 'Non-Scheduled Flight Detail',
              columns: [
                { header: 'Airlines', width: 22 },
                { header: 'Total Flights', width: 8, align: 'right' },
                { header: 'Cancel / No Ops', width: 9, align: 'right' },
                { header: 'Arrival Pax', width: 7.5, align: 'right' },
                { header: 'Depart Pax', width: 7.5, align: 'right' },
                { header: 'Arrival Cargo', width: 7.5, align: 'right' },
                { header: 'Depart Cargo', width: 7.5, align: 'right' },
                { header: 'Arrival Mail', width: 7.5, align: 'right' },
                { header: 'Depart Mail', width: 7.5, align: 'right' },
                { header: 'Arrival Baggage', width: 7.5, align: 'right' },
                { header: 'Depart Baggage', width: 7.5, align: 'right' },
              ],
              rows: nonScheduledRowsPdf,
              emptyText: stationCode
                ? `No non-scheduled FHR for station ${stationCode} in this date range.`
                : 'No non-scheduled flights found for the selected date range.',
            },
          ],
          filename: `quality-report_${fromYmd}_${toYmd}.pdf`,
        });
      },
    }),
    [
      airlineLabel,
      filteredNonScheduledRows,
      fromYmd,
      stationCode,
      toYmd,
      scheduledTableRows,
      scheduledTableTotals,
    ],
  );

  return (
    <div className="mt-6 space-y-6">
      {scheduledRowsError && !scheduledRowsLoading ? (
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          Could not load the scheduled quality table for the selected date range.
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 xl:gap-3">
        <KpiCard
          label="Total Flights"
          value={formatNumber(overview.flights)}
          badge="Movement"
          icon={Plane}
        />
        <KpiCard
          label="Cancellations"
          value={formatNumber(overview.cancels)}
          badge="Watch"
          icon={CircleAlert}
        />
        <KpiCard
          label="First Bag On-Time"
          value={formatPercent(overview.firstBagPct)}
          badge={overview.firstBagPct >= 75 ? 'On track' : 'Review'}
          icon={Clock3}
        />
        <KpiCard
          label="Last Bag On-Time"
          value={formatPercent(overview.lastBagPct)}
          badge={overview.lastBagPct >= 75 ? 'On track' : 'Review'}
          icon={Clock3}
        />
        <KpiCard
          label="Arrival Pax"
          value={formatNumber(overview.arrivalPax)}
          badge="Flow"
          icon={Users}
        />
        <KpiCard
          label="Overall Quality"
          value={formatPercent(overview.qualityScore)}
          badge={getRatingLabel(overview.qualityScore)}
          icon={ShieldCheck}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="min-w-0" ref={baggageChartRef}>
          <ChartCard
            title="Baggage on-time"
            subtitle="Grouped airline view for first bag and last bag performance."
          >
            <div className="h-[220px] sm:h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filteredScheduledRows} margin={{ top: 8, right: 8, left: -16, bottom: 8 }} barGap={8}>
                  <CartesianGrid stroke={SLATE_BORDER} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="code" tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: '#F8FAFC' }}
                    formatter={(value) => `${value}%`}
                    labelFormatter={(value, payload) => `${payload?.[0]?.payload?.airline ?? value}`}
                    contentStyle={tooltipContentStyle}
                  />
                  <Bar dataKey="firstBagPct" name="First bag" radius={[8, 8, 0, 0]} fill={EMERALD}>
                    <LabelList
                      dataKey="firstBagPct"
                      position="top"
                      formatter={renderBarPercentLabel}
                      fill={EMERALD_DARK}
                      fontSize={11}
                    />
                  </Bar>
                  <Bar dataKey="lastBagPct" name="Last bag" radius={[8, 8, 0, 0]} fill={AMBER}>
                    <LabelList
                      dataKey="lastBagPct"
                      position="top"
                      formatter={renderBarPercentLabel}
                      fill="#B45309"
                      fontSize={11}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        <div className="min-w-0">
          <ChartCard
            title="Quality rating split"
            subtitle="Donut chart with HTML legend for the four quality bands."
          >
            <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
              <div className="flex justify-center">
                <div className="h-[220px] w-[220px] sm:h-[240px] sm:w-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={ratingDistribution}
                        dataKey="value"
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={92}
                        paddingAngle={2}
                      >
                        {ratingDistribution.map((entry) => (
                          <Cell key={entry.label} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `${value} flights`} contentStyle={tooltipContentStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="mx-auto w-full max-w-[200px] space-y-1.5 sm:mx-0">
                {ratingDistribution.map((entry) => (
                  <div key={entry.label} className="rounded-2xl border border-emerald-100/90 bg-white/85 px-3 py-1.5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="text-sm font-medium text-slate-700">{entry.label}</span>
                      </div>
                      <span className="text-sm font-semibold text-slate-900">{formatNumber(entry.value)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {entry.airlines} airline{entry.airlines === 1 ? '' : 's'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </ChartCard>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="min-w-0">
          <ChartCard
            title="Passenger flow"
            subtitle="Arrival vs departure passenger stack by airline."
            className="border-amber-200/90 bg-amber-50/75 ring-amber-900/[0.04]"
          >
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={passengerFlowData} margin={{ top: 10, right: 8, left: -10, bottom: 8 }} stackOffset="none">
                  <CartesianGrid stroke={SLATE_BORDER} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="code" tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 12 }} />
                  <YAxis tickFormatter={(value) => compactFormat.format(value)} tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 12 }} />
                  <Tooltip
                    formatter={(value) => formatNumber(Number(value))}
                    labelFormatter={(value, payload) => `${payload?.[0]?.payload?.airline ?? value}`}
                    contentStyle={tooltipContentStyle}
                  />
                  <Bar stackId="pax" dataKey="arrivalPax" name="Arrival pax" fill={AMBER_LIGHT}>
                    {passengerFlowData.map((row) => (
                      <Cell
                        key={`arrival-${row.code}`}
                        radius={(row.departPax > 0 ? [0, 0, 8, 8] : [8, 8, 8, 8]) as never}
                      />
                    ))}
                  </Bar>
                  <Bar stackId="pax" dataKey="departPax" name="Departure pax" fill={AMBER}>
                    {passengerFlowData.map((row) => (
                      <Cell
                        key={`depart-${row.code}`}
                        radius={(row.arrivalPax > 0 ? [8, 8, 0, 0] : [8, 8, 8, 8]) as never}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        <div className="min-w-0" ref={cargoChartRef}>
          <ChartCard
            title="Cargo and mail mix"
            subtitle="Top 5 airlines by arrival cargo with arrival cargo, departure cargo and arrival mail."
          >
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cargoMailData} margin={{ top: 10, right: 8, left: -10, bottom: 8 }} barGap={8}>
                  <CartesianGrid stroke={SLATE_BORDER} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="code" tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 12 }} />
                  <YAxis tickFormatter={(value) => compactFormat.format(value)} tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 12 }} />
                  <Tooltip
                    formatter={(value) => formatNumber(Number(value))}
                    labelFormatter={(value, payload) => `${payload?.[0]?.payload?.airline ?? value}`}
                    contentStyle={tooltipContentStyle}
                  />
                  <Bar dataKey="arrivalCargo" name="Arrival cargo" radius={[8, 8, 0, 0]} fill={EMERALD_DARK} />
                  <Bar dataKey="departCargo" name="Depart cargo" radius={[8, 8, 0, 0]} fill={EMERALD} />
                  <Bar dataKey="arrivalMail" name="Arrival mail" radius={[8, 8, 0, 0]} fill={AMBER} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      </section>

      <section className={cn(panelClass, 'overflow-hidden')} style={{ minHeight: `${detailsPanelHeight}px` }}>
        <div className="flex flex-col gap-3 border-b border-emerald-100/80 bg-gradient-to-r from-emerald-50/55 to-white px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-emerald-950">Flight detail</h2>
              <p className="mt-1 text-sm text-slate-600">
                Airline handling with passenger, cargo, mail and baggage columns.
              </p>
            </div>
            <div
              role="tablist"
              aria-label="Flight type"
              className="inline-flex rounded-xl border border-emerald-200 bg-white p-1 shadow-sm"
            >
              <button
                type="button"
                role="tab"
                aria-selected={detailsView === 'scheduled'}
                onClick={() => setDetailsView('scheduled')}
                className={cn(
                  'inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold',
                  QUALITY_BTN_TRANSITION,
                  detailsView === 'scheduled'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-emerald-800 hover:bg-emerald-50',
                )}
              >
                Scheduled Flights
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={detailsView === 'nonScheduled'}
                onClick={() => setDetailsView('nonScheduled')}
                className={cn(
                  'inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold',
                  QUALITY_BTN_TRANSITION,
                  detailsView === 'nonScheduled'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-emerald-800 hover:bg-emerald-50',
                )}
              >
                Non-Scheduled Flights
              </button>
            </div>
          </div>
        </div>

        {detailsView === 'scheduled' ? (
          <div role="tabpanel">
            <ReportsResponsiveTable
                showScrollHint={false}
                scrollClassName="h-[calc(100%-5.5rem)] overflow-auto overscroll-contain"
              >
                <table className="w-full min-w-[56rem] table-fixed">
                  <colgroup>
                    <col style={{ width: '4%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '6%' }} />
                    <col style={{ width: '6%' }} />
                    <col style={{ width: '6%' }} />
                    <col style={{ width: '5.5%' }} />
                    <col style={{ width: '5.5%' }} />
                    <col style={{ width: '6.5%' }} />
                    <col style={{ width: '6.5%' }} />
                    <col style={{ width: '5.5%' }} />
                    <col style={{ width: '5.5%' }} />
                    <col style={{ width: '6%' }} />
                    <col style={{ width: '6%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className={scheduledTableHeaderClass}>Code</th>
                      <th className={scheduledTableHeaderClass}>Airlines</th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>
                        <span className="block">Total Flights</span>
                        <span className="mt-1 block text-[10px] font-medium text-emerald-900/65">(per week)</span>
                      </th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>
                        <span className="block">Cancel /</span>
                        <span className="block">No Ops</span>
                      </th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>
                        <span className="block">Additional</span>
                        <span className="block">Flights</span>
                      </th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>
                        <span className="block">Other</span>
                        <span className="block">Flights</span>
                      </th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>
                        <span className="block">Hold closed</span>
                        <span className="mt-1 block text-[10px] font-medium text-emerald-900/65">(STD -5)</span>
                      </th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>
                        <span className="block">First Bag (Arr)</span>
                        <span className="mt-1 block text-[10px] font-medium text-emerald-900/65">
                          within ATA -15 min
                        </span>
                        <span className="block text-[10px] font-medium text-emerald-900/65">
                          for Cochin ATA +10 min
                        </span>
                      </th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>
                        <span className="block">Last Bag (Arr)</span>
                        <span className="mt-1 block text-[10px] font-medium text-emerald-900/65">
                          within ATA +40 min
                        </span>
                      </th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>Arrival Pax</th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>Depart Pax</th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>Arrival Cargo</th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>Depart Cargo</th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>Arrival Mail</th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>Depart Mail</th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>Arrival baggage</th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>Depart baggage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduledRowsLoading && scheduledTableRows.length === 0 ? (
                      <tr>
                        <td colSpan={17} className="px-3 py-12 text-center text-sm text-slate-500">
                          Loading scheduled flight detail...
                        </td>
                      </tr>
                    ) : scheduledTableRows.length === 0 ? (
                      <tr>
                        <td colSpan={17} className="px-3 py-12 text-center text-sm text-slate-500">
                          {stationCode
                            ? `No scheduled FHR for station ${stationCode} in this date range. Try dates where this station has Open / FHR records.`
                            : 'No scheduled flights found for the selected date range.'}
                        </td>
                      </tr>
                    ) : (
                      scheduledTableRows.map((row) => (
                        <tr key={row.code} className="transition-colors hover:bg-emerald-50/35">
                          <td className={cn(scheduledTableCellClass, 'font-semibold text-slate-900')}>{row.code}</td>
                          <td className={cn(scheduledTableCellClass, 'whitespace-normal break-words')}>{row.airline}</td>
                          <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTableNumber(row.flights)}</td>
                          <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTableNumber(row.cancels)}</td>
                          <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTableNumber(row.additional)}</td>
                          <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTableNumber(getOtherFlightsCount(row))}</td>
                          <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTablePercent(row.holdClosedPct)}</td>
                          <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTablePercent(row.firstBagPct)}</td>
                          <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTablePercent(row.lastBagPct)}</td>
                          <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTableCompact(row.arrivalPax)}</td>
                          <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTableCompact(row.departPax)}</td>
                          <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTableCompact(row.arrivalCargo)}</td>
                          <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTableCompact(row.departCargo)}</td>
                          <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTableCompact(row.arrivalMail)}</td>
                          <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTableCompact(row.departMail)}</td>
                          <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTableCompact(row.arrivalBaggage)}</td>
                          <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTableCompact(row.departBaggage)}</td>
                        </tr>
                      ))
                    )}
                    {scheduledTableRows.length > 0 ? (
                      <tr className="bg-emerald-500">
                        <td className={cn(scheduledTableCellClass, 'border-emerald-400 bg-emerald-500 font-semibold text-white')}>
                          Total
                        </td>
                        <td className={cn(scheduledTableCellClass, 'border-emerald-400 bg-emerald-500 font-semibold text-white')}>
                          All airlines
                        </td>
                        <td className={cn(scheduledTableCellClass, 'border-emerald-400 bg-emerald-500 text-right font-semibold text-white')}>
                          {formatTableNumber(scheduledTableTotals.flights)}
                        </td>
                        <td className={cn(scheduledTableCellClass, 'border-emerald-400 bg-emerald-500 text-right font-semibold text-white')}>
                          {formatTableNumber(scheduledTableTotals.cancels)}
                        </td>
                        <td className={cn(scheduledTableCellClass, 'border-emerald-400 bg-emerald-500 text-right font-semibold text-white')}>
                          {formatTableNumber(scheduledTableTotals.additional)}
                        </td>
                        <td className={cn(scheduledTableCellClass, 'border-emerald-400 bg-emerald-500 text-right font-semibold text-white')}>
                          {formatTableNumber(scheduledTableTotals.other)}
                        </td>
                        <td className={cn(scheduledTableCellClass, 'border-emerald-400 bg-emerald-500 text-right font-semibold text-white')}>
                          {formatTablePercent(scheduledTableTotals.holdClosedPct)}
                        </td>
                        <td className={cn(scheduledTableCellClass, 'border-emerald-400 bg-emerald-500 text-right font-semibold text-white')}>
                          {formatTablePercent(scheduledTableTotals.firstBagPct)}
                        </td>
                        <td className={cn(scheduledTableCellClass, 'border-emerald-400 bg-emerald-500 text-right font-semibold text-white')}>
                          {formatTablePercent(scheduledTableTotals.lastBagPct)}
                        </td>
                        <td className={cn(scheduledTableCellClass, 'border-emerald-400 bg-emerald-500 text-right font-semibold text-white')}>
                          {formatTableCompact(scheduledTableTotals.arrivalPax)}
                        </td>
                        <td className={cn(scheduledTableCellClass, 'border-emerald-400 bg-emerald-500 text-right font-semibold text-white')}>
                          {formatTableCompact(scheduledTableTotals.departPax)}
                        </td>
                        <td className={cn(scheduledTableCellClass, 'border-emerald-400 bg-emerald-500 text-right font-semibold text-white')}>
                          {formatTableCompact(scheduledTableTotals.arrivalCargo)}
                        </td>
                        <td className={cn(scheduledTableCellClass, 'border-emerald-400 bg-emerald-500 text-right font-semibold text-white')}>
                          {formatTableCompact(scheduledTableTotals.departCargo)}
                        </td>
                        <td className={cn(scheduledTableCellClass, 'border-emerald-400 bg-emerald-500 text-right font-semibold text-white')}>
                          {formatTableCompact(scheduledTableTotals.arrivalMail)}
                        </td>
                        <td className={cn(scheduledTableCellClass, 'border-emerald-400 bg-emerald-500 text-right font-semibold text-white')}>
                          {formatTableCompact(scheduledTableTotals.departMail)}
                        </td>
                        <td className={cn(scheduledTableCellClass, 'border-emerald-400 bg-emerald-500 text-right font-semibold text-white')}>
                          {formatTableCompact(scheduledTableTotals.arrivalBaggage)}
                        </td>
                        <td className={cn(scheduledTableCellClass, 'border-emerald-400 bg-emerald-500 text-right font-semibold text-white')}>
                          {formatTableCompact(scheduledTableTotals.departBaggage)}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </ReportsResponsiveTable>
          </div>
        ) : (
          <div role="tabpanel">
            {nonScheduledError && !nonScheduledLoading ? (
              <div className="px-4 py-3 text-sm text-amber-900">
                Could not load non-scheduled quality table.
              </div>
            ) : null}
            <ReportsResponsiveTable showScrollHint={false} scrollClassName="overflow-x-auto">
                <table className="w-full min-w-[48rem] table-fixed">
                  <colgroup>
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '7.5%' }} />
                    <col style={{ width: '7.5%' }} />
                    <col style={{ width: '7.5%' }} />
                    <col style={{ width: '7.5%' }} />
                    <col style={{ width: '7.5%' }} />
                    <col style={{ width: '7.5%' }} />
                    <col style={{ width: '7.5%' }} />
                    <col style={{ width: '7.5%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className={scheduledTableHeaderClass}>Airlines</th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>
                        <span className="block">Total</span>
                        <span className="block">Flights</span>
                        <span className="mt-1 block text-[10px] font-medium text-emerald-900/65">(per week)</span>
                      </th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>
                        <span className="block">Cancel / No Ops</span>
                      </th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>Arrival Pax</th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>Depart Pax</th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>Arrival Cargo</th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>Depart Cargo</th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>Arrival Mail</th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>Depart Mail</th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>Arrival baggage</th>
                      <th className={cn(scheduledTableHeaderClass, 'text-right')}>Depart baggage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nonScheduledLoading && filteredNonScheduledRows.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-3 py-12 text-center text-sm text-slate-500">
                          Loading non-scheduled flight detail...
                        </td>
                      </tr>
                    ) : filteredNonScheduledRows.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-3 py-12 text-center text-sm text-slate-500">
                          {stationCode
                            ? `No non-scheduled FHR for station ${stationCode} in this date range.`
                            : 'No non-scheduled flights found for the selected date range.'}
                        </td>
                      </tr>
                    ) : (
                      filteredNonScheduledRows.map((row) => (
                      <tr key={row.operator} className="transition-colors hover:bg-emerald-50/35">
                        <td className={cn(scheduledTableCellClass, 'font-medium text-slate-900 whitespace-normal break-words')}>
                          {row.operator}
                        </td>
                        <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTableNumber(row.flights)}</td>
                        <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTableNumber(row.cancelNoOp)}</td>
                        <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTableCompact(row.arrivalPax)}</td>
                        <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTableCompact(row.departPax)}</td>
                        <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTableCompact(row.arrivalCargo)}</td>
                        <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTableCompact(row.departCargo)}</td>
                        <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTableCompact(row.arrivalMail)}</td>
                        <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTableCompact(row.departMail)}</td>
                        <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTableCompact(row.arrivalBaggage)}</td>
                        <td className={cn(scheduledTableCellClass, 'text-right')}>{formatTableCompact(row.departBaggage)}</td>
                      </tr>
                    ))
                    )}
                  </tbody>
                </table>
              </ReportsResponsiveTable>
          </div>
        )}
      </section>

    </div>
  );
});

export default QualityReportResultsTables;
