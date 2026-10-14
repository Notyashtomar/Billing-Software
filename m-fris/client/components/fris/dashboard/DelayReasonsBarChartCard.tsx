"use client";

import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
// gg
type DelayReasonRow = {
  reason: string;
  count: number;
};

type DelayReasonsBarChartCardProps = {
  className?: string;
  data: DelayReasonRow[];
  loading?: boolean;
};

export default function DelayReasonsBarChartCard({
  className,
  data,
  loading = false,
}: DelayReasonsBarChartCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`flex h-full min-h-0 flex-col rounded-lg border border-emerald-200/80 bg-white p-2 shadow-[0_10px_18px_-16px_rgba(16,185,129,0.75)] ${className ?? ""}`}
    >
      <div className="mb-1 flex shrink-0 items-center justify-between">
        <h3 className="text-sm font-semibold text-emerald-800 md:text-base">
          Delay Reasons
        </h3>
      </div>

      <div className="mt-1 min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            Loading chart...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 12, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                type="number"
                domain={[0, "dataMax + 1"]}
                allowDecimals={false}
                tick={{ fontSize: 10 }}
              />
              <YAxis
                type="category"
                dataKey="reason"
                tick={{ fontSize: 10 }}
                width={90}
              />
              <Tooltip formatter={(value) => [`${value ?? ""}`, "Count"]} />
              <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                {(data.length ? data : [{ reason: "", count: 0 }]).map((entry, index) => (
                  <Cell
                    key={`${entry.reason || "empty"}-${index}`}
                    fill={index % 2 === 0 ? "#10B981" : "#F59E0B"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </motion.div>
  );
}
