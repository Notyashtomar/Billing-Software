"use client";

import { motion } from "framer-motion";
import { PlaneTakeoff } from "lucide-react";

type FlightTypesCardProps = {
  className?: string;
  turnaround: number | string;
  rampHandling: number | string;
  onClick?: () => void;
};
// gg
export default function FlightTypesCard({
  className,
  turnaround,
  rampHandling,
  onClick,
}: FlightTypesCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`flex h-auto flex-col rounded-lg border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white p-2 shadow-[0_12px_20px_-16px_rgba(16,185,129,0.6)] ${className ?? ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="flex shrink-0 items-center gap-1.5 rounded-md bg-white/90 px-2 py-1 shadow-sm">
        <span className="rounded-md bg-emerald-100 p-1 text-emerald-700">
          <PlaneTakeoff size={12} />
        </span>
        <span className="text-sm font-semibold tracking-wide text-emerald-900">
          Flight Types
        </span>
      </div>

      <div className="mt-1.5 space-y-1">
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-700">Turnaround</span>
            <span className="text-sm font-bold text-emerald-900 tabular-nums">
              {turnaround}
            </span>
          </div>
        </div>

        <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700">Ramp Handling</span>
            <span className="text-sm font-bold text-amber-900 tabular-nums">
              {rampHandling}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
