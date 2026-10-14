'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { billingUi } from '../../billingUi';
import type { CtaLink, KpiItem, ListRow, SparkPoint } from '../insightsMock';
import { InsightsCountUp } from './InsightsCountUp';

const BLUE = '#1C0770';
const YELLOW = '#F1FF5E';
const NAVY = '#261CC1';
const MUTED = 'var(--billing-text-muted)';
const GRID = 'var(--billing-border)';

const kpiValueClass =
  'insights-kpi-value block w-full text-right text-4xl font-bold tabular-nums leading-none tracking-tight sm:text-5xl lg:text-[3.25rem]';

export function InsightsHero({
  label,
  value,
  spark,
  valueFormatted,
}: {
  label: string;
  value?: number;
  valueFormatted: string;
  spark: SparkPoint[];
}) {
  return (
    <section
      className={`${billingUi.insightsCard} billing-tile-enter relative overflow-hidden p-5 sm:p-6`}
      aria-label={label}
    >
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-50"
        style={{
          background:
            'radial-gradient(600px 200px at 80% 20%, rgba(58,154,255,0.18), transparent)',
        }}
        aria-hidden
      />
      <div className="relative flex min-h-[7.5rem] flex-col justify-between gap-3 sm:min-h-[8.5rem]">
        <p className="text-sm font-semibold uppercase tracking-wide text-[color:var(--billing-text-muted)] sm:text-base">
          {label}
        </p>
        <p className="insights-kpi-value m-0 text-4xl font-bold tracking-tight text-[color:var(--billing-heading)] sm:text-5xl lg:text-6xl">
          {value != null ? (
            <InsightsCountUp
              to={value}
              format="inr"
              fallback={valueFormatted}
              durationMs={1200}
            />
          ) : (
            valueFormatted
          )}
        </p>
        <div className="ml-auto h-14 w-full max-w-xs lg:w-72" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark}>
              <defs>
                <linearGradient id="insightsSpark" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BLUE} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={BLUE}
                fill="url(#insightsSpark)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

function kpiToneClass(tone: KpiItem['tone']): string {
  if (tone === 'danger') return 'text-[color:var(--billing-danger)]';
  if (tone === 'warning') return 'text-[color:var(--billing-warning)]';
  if (tone === 'success') return 'text-[color:var(--billing-success)]';
  return 'text-[color:var(--billing-heading)]';
}

export function InsightsKpiStrip({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((k, idx) => {
        const delay =
          idx === 0
            ? 'billing-tile-enter-delay-1'
            : idx === 1
              ? 'billing-tile-enter-delay-2'
              : idx === 2
                ? 'billing-tile-enter-delay-3'
                : 'billing-tile-enter-delay-4';
        const valueNode =
          k.countTo != null ? (
            <InsightsCountUp
              to={k.countTo}
              format={k.countFormat ?? 'int'}
              decimals={k.countDecimals ?? 0}
              fallback={k.value}
              durationMs={900 + idx * 120}
              className={`${kpiValueClass} ${kpiToneClass(k.tone)}`}
            />
          ) : (
            <span className={`${kpiValueClass} ${kpiToneClass(k.tone)}`}>
              {k.value}
            </span>
          );
        const body = (
          <div className="flex h-full min-h-[7.25rem] flex-col justify-between gap-2 sm:min-h-[8rem]">
            <p className="min-w-0 text-sm font-semibold leading-snug text-[color:var(--billing-text-muted)] sm:text-base">
              {k.label}
            </p>
            <div className="flex flex-1 items-end justify-end">{valueNode}</div>
            {k.hint ? (
              <p className="text-xs text-[color:var(--billing-text-muted)]">{k.hint}</p>
            ) : (
              <span className="h-4" aria-hidden />
            )}
          </div>
        );
        const cls = `${billingUi.insightsCard} ${billingUi.tileGlow} ${delay} block p-4`;
        if (k.href) {
          return (
            <Link
              key={k.id}
              href={k.href}
              scroll={false}
              className={`${cls} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--billing-info)]`}
            >
              {body}
            </Link>
          );
        }
        return (
          <div key={k.id} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

export function InsightsChartCard({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`${billingUi.insightsCard} billing-tile-enter flex min-h-[280px] flex-col p-4 ${className ?? ''}`}
    >
      <h2 className={`${billingUi.sectionTitle} mb-3`}>{title}</h2>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

const tooltipStyle = {
  borderRadius: 8,
  border: '1px solid var(--billing-border)',
  backgroundColor: 'var(--billing-surface-elevated)',
  color: 'var(--billing-text)',
  fontSize: 12,
};

export function StackedBarChart({
  data,
  stackedKeys,
}: {
  data: Record<string, string | number>[];
  stackedKeys: { key: string; color: string; name: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} strokeOpacity={0.6} />
        <XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} />
        <YAxis tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {stackedKeys.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            stackId="a"
            fill={s.color}
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GroupedBarChart({
  data,
  xKey,
  series,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  series: { key: string; color: string; name: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} strokeOpacity={0.6} />
        <XAxis dataKey={xKey} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} />
        <YAxis tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            fill={s.color}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SimpleBarChart({
  data,
  xKey,
  yKey,
  color = BLUE,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  yKey: string;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} strokeOpacity={0.6} />
        <XAxis dataKey={xKey} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} />
        <YAxis tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DualLineChart({
  data,
  series,
  xKey,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  series: { key: string; color: string; name: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} strokeOpacity={0.6} />
        <XAxis dataKey={xKey} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} />
        <YAxis tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({
  data,
}: {
  data: { name: string; value: number; fill: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={52}
          outerRadius={78}
          paddingAngle={2}
          isAnimationActive={false}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={d.fill} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function listTone(tone: ListRow['tone']): string {
  if (tone === 'danger') return billingUi.badgeDanger;
  if (tone === 'warning') return billingUi.badgeWarning;
  if (tone === 'success') return billingUi.badgeSuccess;
  return billingUi.badgeNeutral;
}

export function InsightsListCard({
  title,
  rows,
}: {
  title: string;
  rows: ListRow[];
}) {
  return (
    <section className={`${billingUi.insightsCard} billing-tile-enter p-4`}>
      <h2 className={`${billingUi.sectionTitle} mb-3`}>{title}</h2>
      <ul className="divide-y divide-[color:var(--billing-border)]">
        {rows.map((r) => {
          const rowInner = (
            <>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[color:var(--billing-text)]">
                  {r.title}
                </p>
                <p className="truncate text-xs text-[color:var(--billing-text-muted)]">
                  {r.subtitle}
                </p>
              </div>
              <span className={`${listTone(r.tone)} shrink-0 tabular-nums`}>{r.meta}</span>
            </>
          );
          if (r.href) {
            return (
              <li key={r.id} className="first:pt-0 last:pb-0">
                <Link
                  href={r.href}
                  scroll={false}
                  className="billing-tile-glow -mx-2 flex min-h-11 items-start justify-between gap-3 rounded-[var(--billing-radius)] border border-transparent px-2 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--billing-info)]"
                >
                  {rowInner}
                </Link>
              </li>
            );
          }
          return (
            <li
              key={r.id}
              className="flex min-h-11 items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              {rowInner}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function InsightsCtaRow({ links }: { links: CtaLink[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {links.map((c, idx) => {
        const delay =
          idx % 4 === 0
            ? 'billing-tile-enter-delay-1'
            : idx % 4 === 1
              ? 'billing-tile-enter-delay-2'
              : idx % 4 === 2
                ? 'billing-tile-enter-delay-3'
                : 'billing-tile-enter-delay-4';
        return (
          <Link
            key={c.href}
            href={c.href}
            scroll={false}
            className={`${billingUi.insightsCard} ${billingUi.tileGlow} ${delay} block p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--billing-info)]`}
          >
            <p className="text-base font-semibold text-[color:var(--billing-heading)]">
              {c.label}
            </p>
            <p className="mt-1 text-xs text-[color:var(--billing-text-muted)]">
              {c.description}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

export const INSIGHT_COLORS = { BLUE, YELLOW, NAVY };
