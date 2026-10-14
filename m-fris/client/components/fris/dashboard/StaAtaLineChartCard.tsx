"use client";

import { motion } from "framer-motion";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
export type StaAtaChartFlightInput = {
  /** ISO-8601 arrival scheduled time (preferred). */
  sta?: string | null;
  /** ISO-8601 arrival actual time (preferred). */
  ata?: string | null;
  /** Legacy `Flight` fields — used when ISO strings are absent. */
  STADate?: string;
  STATime?: string;
  ATADate?: string;
  ATATime?: string;
  STDDate?: string;
};

type StaAtaLineChartCardProps = {
  className?: string;
  flights: StaAtaChartFlightInput[];
  loading?: boolean;
};

type ChartRow = {
  name: string;
  sta: number | null;
  ata: number | null;
};

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function parseTimeToMinutes(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const match = raw.match(/^(\d{1,2}):(\d{2})(?:\s*([APap][Mm]))?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (minutes < 0 || minutes > 59) return null;

  if (meridiem) {
    if (hours === 12) hours = 0;
    if (meridiem === "PM") hours += 12;
  }
  if (hours < 0 || hours > 23) return null;

  return hours * 60 + minutes;
}

function formatMinutes(value: number): string {
  const safe = Math.max(0, Math.min(1439, Math.round(value)));
  const hh = String(Math.floor(safe / 60)).padStart(2, "0");
  const mm = String(safe % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function parseFlightDate(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  // Supports dd/MM/yyyy and dd-MM-yyyy
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    const dt = new Date(year, month - 1, day);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  // Supports yyyy-MM-dd
  const ymd = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    const dt = new Date(year, month - 1, day);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function getWeekdayIndexMondayFirst(date: Date): number {
  const jsDay = date.getDay(); // Sun=0...Sat=6
  return jsDay === 0 ? 6 : jsDay - 1; // Mon=0...Sun=6
}

/** Parse ISO timestamps with the same local date/time logic used for drill tables. */
function parseIsoToLocalContext(iso: string): { date: Date; minutes: number } | null {
  const raw = String(iso ?? "").trim();
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return {
    date,
    minutes: date.getHours() * 60 + date.getMinutes(),
  };
}

function parseLegacyTimeContext(
  dateValue: unknown,
  timeValue: unknown,
): { date: Date; minutes: number } | null {
  const date = parseFlightDate(dateValue);
  const minutes = parseTimeToMinutes(timeValue);
  if (!date || minutes == null) return null;
  return { date, minutes };
}

export default function StaAtaLineChartCard({
  className,
  flights,
  loading = false,
}: StaAtaLineChartCardProps) {
  const weekdayBuckets = WEEK_DAYS.map(() => ({
    staSum: 0,
    staCount: 0,
    ataSum: 0,
    ataCount: 0,
  }));

  flights.forEach((flight) => {
    const staCtx =
      parseIsoToLocalContext(String(flight.sta ?? "")) ??
      parseLegacyTimeContext(flight.STADate, flight.STATime);
    const ataCtx =
      parseIsoToLocalContext(String(flight.ata ?? "")) ??
      parseLegacyTimeContext(flight.ATADate ?? flight.STADate, flight.ATATime);

    if (staCtx) {
      const idx = getWeekdayIndexMondayFirst(staCtx.date);
      weekdayBuckets[idx].staSum += staCtx.minutes;
      weekdayBuckets[idx].staCount += 1;
    }
    if (ataCtx) {
      const idx = getWeekdayIndexMondayFirst(ataCtx.date);
      weekdayBuckets[idx].ataSum += ataCtx.minutes;
      weekdayBuckets[idx].ataCount += 1;
    }
  });

  const chartData: ChartRow[] = WEEK_DAYS.map((day, idx) => {
    const bucket = weekdayBuckets[idx];
    return {
      name: day,
      sta:
        bucket.staCount > 0 ? Math.round(bucket.staSum / bucket.staCount) : null,
      ata:
        bucket.ataCount > 0 ? Math.round(bucket.ataSum / bucket.ataCount) : null,
    };
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`flex h-full min-h-[220px] flex-col rounded-lg border border-emerald-200/80 bg-white p-2 shadow-[0_10px_18px_-16px_rgba(16,185,129,0.75)] sm:min-h-[260px] ${className ?? ""}`}
    >
      <div className="mb-1 flex shrink-0 items-center justify-between">
        <h3 className="text-sm font-semibold text-emerald-800 md:text-base">
          STA vs ATA
        </h3>
      </div>

      <div className="mt-1 min-h-[200px] flex-1 sm:min-h-0">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            Loading chart...
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            No flight data
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 2 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                minTickGap={12}
              />
              <YAxis
                domain={[0, 1439]}
                tickFormatter={formatMinutes}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={36}
              />
              <Tooltip
                formatter={(value, name) => [
                  value == null ? "-" : formatMinutes(Number(value)),
                  String(name ?? "").toUpperCase(),
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="ata"
                name="ATA"
                stroke="#F59E0B"
                strokeWidth={2}
                dot={{ r: 2, strokeWidth: 2, fill: "#fff" }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="sta"
                name="STA"
                stroke="#10B981"
                strokeWidth={2.5}
                strokeDasharray="6 4"
                dot={{ r: 3, strokeWidth: 2, fill: "#fff" }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </motion.div>
  );
}
