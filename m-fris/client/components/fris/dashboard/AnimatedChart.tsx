'use client';

import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  AlertCircle,
  BarChart as BarChartIcon,
  PieChart as PieChartIcon,
  LineChart as LineChartIcon,
  TrendingUp,
} from 'lucide-react';

type ChartRow = Record<string, unknown>;

interface AnimatedChartProps {
  data: ChartRow[];
  type: 'bar' | 'line' | 'area' | 'pie';
  title: string;
  subtitle?: string;
  xKey: string;
  yKey: string;
  emptyMessage?: string;
  compact?: boolean;
  showSummary?: boolean;
  embedded?: boolean;
}

const PRIMARY_COLOR = '#059669';
const SECONDARY_COLOR = '#16A34A';
const NEUTRAL_COLOR = '#34D399';
const DANGER_COLOR = '#84CC16';
const BACKGROUND_COLOR = '#ffffff';
const TEXT_COLOR = '#0f172a';
const GRID_COLOR = '#e5e7eb'; // Gray-200

function numFromRow(item: ChartRow, key: string): number {
  const v = item[key];
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export const AnimatedChart = ({
  data,
  type,
  title,
  subtitle,
  xKey,
  yKey,
  emptyMessage = 'No data available',
  compact = false,
  showSummary = true,
  embedded = false,
}: AnimatedChartProps) => {
  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
      },
    },
  };

  const getBarColor = (index: number) => {
    const colors = [PRIMARY_COLOR, SECONDARY_COLOR, NEUTRAL_COLOR, DANGER_COLOR];
    return colors[index % colors.length];
  };

  const getPieColor = (index: number) => {
    const colors = [PRIMARY_COLOR, SECONDARY_COLOR, NEUTRAL_COLOR, DANGER_COLOR];
    return colors[index % colors.length];
  };

  const formatTooltipValue = (value: number) => {
    return value.toLocaleString();
  };

  // Check if data is empty or invalid
  const hasValidData =
    data &&
    Array.isArray(data) &&
    data.length > 0 &&
    data.some((item) => numFromRow(item, yKey) > 0);

  // Get appropriate icon based on chart type
  const getChartIcon = () => {
    switch (type) {
      case 'bar':
        return <BarChartIcon className="w-12 h-12 text-slate-300" />;
      case 'pie':
        return <PieChartIcon className="w-12 h-12 text-slate-300" />;
      case 'line':
        return <LineChartIcon className="w-12 h-12 text-slate-300" />;
      case 'area':
        return <TrendingUp className="w-12 h-12 text-slate-300" />;
      default:
        return <BarChartIcon className="w-12 h-12 text-slate-300" />;
    }
  };

  // Empty state component
  const renderEmptyState = () => (
    <div
      className={`${compact ? 'h-56' : 'h-80'} flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50`}
    >
      <div className="mb-4">{getChartIcon()}</div>
      <div className="text-center">
        <AlertCircle className="mx-auto mb-2 h-8 w-8 text-amber-500" />
        <p className="font-medium text-slate-700">{emptyMessage}</p>
        <p className="mt-1 text-sm text-slate-500">
          Try selecting a different date range or schedule type
        </p>
      </div>
    </div>
  );

  // Safely get chart data
  const getChartData = () => {
    if (!hasValidData) return [];

    // Filter out invalid data points
    return data.filter((item) => {
      const value = item[yKey];
      return value !== undefined && value !== null && !isNaN(Number(value));
    });
  };

  const chartData = getChartData();

  const renderBarChart = () => {
    if (!hasValidData) return renderEmptyState();

    return (
      <BarChart
        data={chartData}
        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        barCategoryGap={compact ? '34%' : '26%'}
        barGap={compact ? 4 : 6}
      >
        <defs>
          <linearGradient id="colorBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PRIMARY_COLOR} stopOpacity={0.8} />
            <stop offset="100%" stopColor={PRIMARY_COLOR} stopOpacity={0.3} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
        <XAxis
          dataKey={xKey}
          stroke={TEXT_COLOR}
          tick={{ fill: TEXT_COLOR, fontSize: 12 }}
          axisLine={{ stroke: GRID_COLOR }}
        />
        <YAxis
          stroke={TEXT_COLOR}
          tick={{ fill: TEXT_COLOR, fontSize: 12 }}
          axisLine={{ stroke: GRID_COLOR }}
          tickFormatter={formatTooltipValue}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: BACKGROUND_COLOR,
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 4px 8px -2px rgba(15, 23, 42, 0.12)',
            color: TEXT_COLOR,
          }}
          formatter={(value) => [formatTooltipValue(value as number), 'Count']}
          labelStyle={{ fontWeight: 600, color: TEXT_COLOR }}
        />
        <Bar dataKey={yKey} barSize={compact ? 14 : 18} radius={[6, 6, 0, 0]} name="Count">
          {chartData.map((_, index) => (
            <Cell key={`cell-${index}`} fill={getBarColor(index)} />
          ))}
        </Bar>
      </BarChart>
    );
  };

  const renderPieChart = () => {
    if (!hasValidData) return renderEmptyState();

    return (
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy={compact ? '50%' : '55%'}
          labelLine={false}
          label={
            compact
              ? embedded
                ? ({ name, percent, value }) =>
                    Number(value) > 0
                      ? `${String(name)} · ${(((percent ?? 0) as number) * 100).toFixed(0)}%`
                      : ''
                : false
              : ({ name, percent, value }) =>
                  Number(value) > 0
                    ? `${String(name)}: ${(((percent ?? 0) as number) * 100).toFixed(0)}%`
                    : ''
          }
          outerRadius={compact ? (embedded ? 72 : 62) : 120}
          innerRadius={0}
          paddingAngle={0}
          dataKey={yKey}
          nameKey={xKey}
        >
          {chartData.map((_, index) => (
            <Cell key={`cell-${index}`} fill={getPieColor(index)} stroke={BACKGROUND_COLOR} strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: BACKGROUND_COLOR,
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 4px 8px -2px rgba(15, 23, 42, 0.12)',
            color: TEXT_COLOR,
          }}
          formatter={(value) => formatTooltipValue(value as number)}
        />
        {!compact ? (
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value) => <span className="text-sm text-slate-600">{value}</span>}
          />
        ) : null}
      </PieChart>
    );
  };

  const renderLineChart = () => {
    if (!hasValidData) return renderEmptyState();

    return (
      <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <defs>
          <linearGradient id="colorLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={PRIMARY_COLOR} />
            <stop offset="100%" stopColor={SECONDARY_COLOR} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
        <XAxis
          dataKey={xKey}
          stroke={TEXT_COLOR}
          tick={{ fill: TEXT_COLOR, fontSize: 12 }}
          axisLine={{ stroke: GRID_COLOR }}
          tickMargin={10}
        />
        <YAxis
          stroke={TEXT_COLOR}
          tick={{ fill: TEXT_COLOR, fontSize: 12 }}
          axisLine={{ stroke: GRID_COLOR }}
          tickFormatter={formatTooltipValue}
          tickMargin={10}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: BACKGROUND_COLOR,
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 4px 8px -2px rgba(15, 23, 42, 0.12)',
            color: TEXT_COLOR,
          }}
          formatter={(value) => [formatTooltipValue(value as number), 'Value']}
          labelStyle={{ fontWeight: 600, color: TEXT_COLOR }}
        />
        <Line
          type="monotone"
          dataKey={yKey}
          stroke="url(#colorLine)"
          strokeWidth={3}
          dot={{
            fill: PRIMARY_COLOR,
            strokeWidth: 2,
            r: 4,
            stroke: BACKGROUND_COLOR,
          }}
          activeDot={{
            r: 6,
            fill: SECONDARY_COLOR,
            stroke: BACKGROUND_COLOR,
            strokeWidth: 2,
          }}
          name="Value"
        />
      </LineChart>
    );
  };

  const renderAreaChart = () => {
    if (!hasValidData) return renderEmptyState();

    return (
      <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <defs>
          <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={PRIMARY_COLOR} stopOpacity={0.8} />
            <stop offset="95%" stopColor={PRIMARY_COLOR} stopOpacity={0.1} />
          </linearGradient>
          <linearGradient id="strokeGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={PRIMARY_COLOR} />
            <stop offset="100%" stopColor={SECONDARY_COLOR} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
        <XAxis
          dataKey={xKey}
          stroke={TEXT_COLOR}
          tick={{ fill: TEXT_COLOR, fontSize: 12 }}
          axisLine={{ stroke: GRID_COLOR }}
          tickMargin={10}
        />
        <YAxis
          stroke={TEXT_COLOR}
          tick={{ fill: TEXT_COLOR, fontSize: 12 }}
          axisLine={{ stroke: GRID_COLOR }}
          tickFormatter={formatTooltipValue}
          tickMargin={10}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: BACKGROUND_COLOR,
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            color: TEXT_COLOR,
          }}
          formatter={(value) => [formatTooltipValue(value as number), 'Value']}
          labelStyle={{ fontWeight: 600, color: TEXT_COLOR }}
        />
        <Area
          type="monotone"
          dataKey={yKey}
          stroke="url(#strokeGradient)"
          strokeWidth={3}
          fill="url(#colorArea)"
          fillOpacity={1}
          dot={{
            fill: PRIMARY_COLOR,
            strokeWidth: 2,
            r: 4,
            stroke: BACKGROUND_COLOR,
          }}
          activeDot={{
            r: 6,
            fill: SECONDARY_COLOR,
            stroke: BACKGROUND_COLOR,
            strokeWidth: 2,
          }}
          name="Value"
        />
      </AreaChart>
    );
  };

  const chartContent = (
    <>
      {title ? (
        <div className={`flex items-center justify-between ${compact ? 'mb-3' : 'mb-6'}`}>
          <div>
            <h3 className={`${compact ? 'text-sm' : 'text-lg'} font-semibold text-slate-900`}>{title}</h3>
            {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
          </div>
          {!hasValidData && (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800">No Data</span>
          )}
        </div>
      ) : null}

      {!hasValidData ? (
        renderEmptyState()
      ) : (
        <div
          className={`${compact ? 'h-52 min-h-[200px]' : 'h-80 min-h-[280px]'} w-full min-w-0`}
          style={{ width: '100%' }}
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            {type === 'bar' && renderBarChart()}
            {type === 'pie' && renderPieChart()}
            {type === 'line' && renderLineChart()}
            {type === 'area' && renderAreaChart()}
          </ResponsiveContainer>
        </div>
      )}

      {hasValidData && showSummary && (
        <div className={`${compact ? 'mt-2 pt-2' : 'mt-4 pt-4'} border-t border-slate-100`}>
          <div className="flex items-center justify-between text-sm">
            <span className={`${compact ? 'text-xs' : ''} text-slate-500`}>{chartData.length} data points</span>
            <span className={`${compact ? 'text-xs' : ''} text-slate-500`}>
              Total:{' '}
              {chartData.reduce((sum, item) => sum + numFromRow(item, yKey), 0).toLocaleString()}
            </span>
          </div>
        </div>
      )}
    </>
  );

  if (embedded) {
    return <div className="h-full">{chartContent}</div>;
  }

  return (
    <motion.div
      className={`h-full transform-gpu overflow-hidden rounded-2xl border border-slate-200 bg-white ${
        compact ? 'p-4' : 'p-6'
      } shadow-sm transition-all duration-300 hover:shadow-md`}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {chartContent}
    </motion.div>
  );
};
