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

type TopAirlineItem = {
  name: string;
  count: number;
  percentage: number;
};

type TopAirlinesGraphModalProps = {
  open: boolean;
  onClose: () => void;
  items: TopAirlineItem[];
};

export default function TopAirlinesGraphModal({
  open,
  onClose,
  items,
}: TopAirlinesGraphModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="h-[70vh] w-full max-w-3xl rounded-xl border border-emerald-200 bg-white p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-emerald-800">
                Top Airlines Concentration
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-emerald-200 p-1.5 text-emerald-700 transition hover:bg-emerald-50"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid h-[calc(100%-44px)] grid-cols-1 gap-3 md:grid-cols-[2fr_1fr]">
              <div className="min-h-0 rounded-lg border border-emerald-100 bg-emerald-50/50 p-2">
                {items.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-emerald-700/80">
                    No data available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={items} margin={{ top: 10, right: 16, left: 4, bottom: 10 }}>
                      <defs>
                        <linearGradient id="airlineBarGrad" x1="0" y1="1" x2="0" y2="0">
                          <stop offset="0%" stopColor="#059669" />
                          <stop offset="100%" stopColor="#d97706" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="4 8" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        axisLine={{ stroke: "#cbd5e1" }}
                      />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 10,
                          borderColor: "#e2e8f0",
                          boxShadow: "0 8px 30px -12px rgba(15,23,42,0.2)",
                        }}
                        formatter={(value) => [`${value ?? ""}`, "Flights"]}
                      />
                      <Bar dataKey="count" fill="url(#airlineBarGrad)" radius={[8, 8, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="min-h-0 space-y-2 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50/40 p-2">
                {items.map((item) => (
                  <div
                    key={item.name}
                    className="rounded-md border border-amber-200 bg-white/80 p-2"
                  >
                    <p className="truncate text-sm font-semibold text-emerald-800">
                      {item.name}
                    </p>
                    <p className="mt-1 text-xs text-amber-700">
                      Flights: <span className="font-semibold">{item.count}</span>
                    </p>
                    <p className="text-xs text-amber-700">
                      Share: <span className="font-semibold">{item.percentage}%</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
