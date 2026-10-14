"use client";

import { motion } from "framer-motion";

type TopAirlineItem = {
  name: string;
  count: number;
  percentage: number;
};

type TopAirlinesCardProps = {
  className?: string;
  items: TopAirlineItem[];
  onClick?: () => void;
};

export default function TopAirlinesCard({
  className,
  items,
  onClick,
}: TopAirlinesCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`flex h-full min-h-0 flex-col rounded-lg border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white px-2 pt-2  shadow-[0_12px_20px_-16px_rgba(16,185,129,0.6)] ${className ?? ""}`}
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
      <div className=" flex shrink-0 items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-emerald-900 md:text-sm">
          Top Airlines Concentration
        </h3>
      </div>

      <div className="min-h-0 flex-1 max-h-[150px] space-y-2 overflow-y-auto pr-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {items.length === 0 ? (
          <p className="text-xs text-emerald-700/80">No flight data</p>
        ) : (
          items.map((item) => (
            <div key={item.name} className="rounded-md bg-white/75 p-1.5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold text-emerald-800 md:text-sm">
                  {item.name}
                </span>
                <span className="text-xs font-bold text-emerald-900 tabular-nums">
                  {item.count}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-emerald-100">
                <div
                  className="h-1.5 rounded-full bg-emerald-500"
                  style={{ width: `${Math.max(item.percentage, 2)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}
