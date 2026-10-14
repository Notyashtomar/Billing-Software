"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
// gg
type MetricItem = {
  label: string;
  value: number;
};

type MetricGraphModalProps = {
  open: boolean;
  title: string;
  items: MetricItem[];
  onClose: () => void;
};

export default function MetricGraphModal({
  open,
  title,
  items,
  onClose,
}: MetricGraphModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="h-[64vh] w-full max-w-2xl rounded-xl border border-emerald-200 bg-white p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-emerald-800">{title}</h3>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-emerald-200 p-1.5 text-emerald-700 transition hover:bg-emerald-50"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="min-h-0 flex-1 bg-white p-4">
              <div className="h-full rounded-xl bg-slate-50/80 p-3 ring-1 ring-slate-100">
                {items.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    No data available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={items}
                      layout="vertical"
                      margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                    >
                      <defs>
                        <linearGradient id="metricBarGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#059669" />
                          <stop offset="100%" stopColor="#34d399" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="4 8" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fill: "#64748b", fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={120}
                        tick={{ fontSize: 11, fill: "#475569" }}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(16, 185, 129, 0.06)" }}
                        contentStyle={{
                          borderRadius: 10,
                          borderColor: "#e2e8f0",
                          boxShadow: "0 8px 30px -12px rgba(15,23,42,0.2)",
                        }}
                        formatter={(value) => [`${value ?? ""}`, "Value"]}
                      />
                      <Bar
                        dataKey="value"
                        fill="url(#metricBarGrad)"
                        radius={[0, 8, 8, 0]}
                        maxBarSize={28}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
