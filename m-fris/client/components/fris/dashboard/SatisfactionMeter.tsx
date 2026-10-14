"use client";

import { useId } from "react";
// gg
type SatisfactionMeterProps = {
  value: number;
  previousValue?: number;
  label?: string;
  bands?: string[];
  className?: string;
};

const DEFAULT_BANDS = [
  "Not Satisfactory",
  "Below Average",
  "Satisfactory",
  "Good",
  "Excellent",
];

function clampPercent(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function resolveBandIndex(value: number): number {
  if (value <= 20) return 0;
  if (value <= 40) return 1;
  if (value <= 60) return 2;
  if (value <= 80) return 3;
  return 4;
}

function resolveRateColor(value: number): string {
  if (value <= 50) return "#6ee7b7";
  if (value <= 75) return "#34d399";
  return "#059669";
}

export default function SatisfactionMeter({
  value,
  previousValue,
  label = "Customer Satisfaction",
  bands = DEFAULT_BANDS,
  className,
}: SatisfactionMeterProps) {
  const gradientId = useId();
  const safeValue = clampPercent(value);
  const safePrev =
    typeof previousValue === "number" ? clampPercent(previousValue) : undefined;
  const delta =
    typeof safePrev === "number" ? Math.round((safeValue - safePrev) * 10) / 10 : null;

  const bandIndex = resolveBandIndex(safeValue);
  const gaugeColor = resolveRateColor(safeValue);
  const activeBand = bands[bandIndex] ?? "";
  const cx = 80;
  const cy = 80;
  const radius = 58;
  const theta = Math.PI - (safeValue / 100) * Math.PI; // 0%: left, 100%: right
  const tipX = cx + radius * Math.cos(theta);
  const tipY = cy - radius * Math.sin(theta);
  const needleX = cx + (radius - 10) * Math.cos(theta);
  const needleY = cy - (radius - 10) * Math.sin(theta);

  return (
    <div
      className={`mx-auto w-full max-w-[170px] overflow-hidden ${className ?? ""}`}
      title={`Satisfaction Rate: ${activeBand} (${Math.round(
        safeValue
      )}%) | Levels: ${bands.slice(0, 5).join(" / ")}`}
    >
      <div className="relative mx-auto -mt-1 h-full w-[160px]">
        <svg viewBox="0 0 160 100" className="h-full w-full">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#d1fae5" />
              <stop offset="52%" stopColor="#6ee7b7" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
          </defs>
          <path
            d="M 22 80 A 58 58 0 0 1 138 80"
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth="11"
            strokeLinecap="round"
          />
          <line
            x1={cx}
            y1={cy}
            x2={needleX}
            y2={needleY}
            stroke="#065f46"
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{ transition: "all 450ms ease-out" }}
          />
          <circle cx={cx} cy={cy} r="5" fill="#065f46" />
          <circle cx={tipX} cy={tipY} r="2.5" fill="#065f46" fillOpacity="0.7" />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-end ">
          <span className="text-sm font-bold tabular-nums leading-none" style={{ color: gaugeColor }}>
            {Math.round(safeValue)}%
          </span>
          {delta !== null ? (
            <span
              className={`text-[6px] font-semibold ${
                delta >= 0 ? "text-emerald-600" : "text-emerald-500/80"
              }`}
            >
              {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}%
            </span>
          ) : null}
        </div>
      </div>

    </div>
  );
}

