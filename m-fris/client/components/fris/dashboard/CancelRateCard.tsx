"use client";

import { motion } from "framer-motion";

type CancelRateCardProps = {
  className?: string;
  wbPax: number | string;
  nbPax: number | string;
  wbF: number | string;
  nbF: number | string;
  onClick?: () => void;
};
// gg 
export default function CancelRateCard({
  className,
  wbPax,
  nbPax,
  wbF,
  nbF,
  onClick,
}: CancelRateCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`flex h-full min-h-0 flex-col rounded-lg border border-emerald-200/80 bg-emerald-50/70 p-2 shadow-[0_10px_18px_-16px_rgba(16,185,129,0.75)] ${className ?? ""}`}
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
      <h3 className="mb-1 text-sm font-semibold text-emerald-800 md:text-base">
        Cancel Rate 
      </h3>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-1">
        <div className="rounded-md border border-emerald-200 bg-white/80 px-2 py-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-700">WB P</span>
            <span className="text-sm font-bold text-emerald-900 tabular-nums">{wbPax}</span>
          </div>
        </div>
        <div className="rounded-md border border-amber-200 bg-white/80 px-2 py-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700">NB P</span>
            <span className="text-sm font-bold text-amber-900 tabular-nums">{nbPax}</span>
          </div>
        </div>
        <div className="rounded-md border border-emerald-200 bg-white/80 px-2 py-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-700">WB F</span>
            <span className="text-sm font-bold text-emerald-900 tabular-nums">{wbF}</span>
          </div>
        </div>
        <div className="rounded-md border border-amber-200 bg-white/80 px-2 py-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700">NB F</span>
            <span className="text-sm font-bold text-amber-900 tabular-nums">{nbF}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
