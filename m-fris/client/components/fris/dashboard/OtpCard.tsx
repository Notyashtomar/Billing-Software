"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";

type OtpCardProps = {
  className?: string;
  firstBag: number | string;
  lastBag: number | string;
  onClick?: () => void;
};

const panel =
  "rounded-2xl bg-white p-3 shadow-[0_4px_24px_-6px_rgba(15,23,42,0.12)] ring-1 ring-slate-200/70 md:p-4";

export default function OtpCard({
  className,
  firstBag,
  lastBag,
  onClick,
}: OtpCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const firstBagDisplay = typeof firstBag === "number" ? `${firstBag}%` : firstBag;
  const lastBagDisplay = typeof lastBag === "number" ? `${lastBag}%` : lastBag;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      whileHover={prefersReducedMotion ? undefined : { scale: 1.012 }}
      whileTap={{ scale: 0.995 }}
      className={cn("flex h-auto flex-col", panel, className)}
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
      <div
        className={cn(
          "flex min-h-0 flex-col",
          !prefersReducedMotion && "animate-otp-card-bounce",
        )}
      >
        <div className="flex shrink-0 items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
            <Timer className="h-4 w-4" strokeWidth={2} />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Baggage</p>
            <p className="text-sm font-semibold text-slate-800">OTP performance</p>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <div className="rounded-xl bg-emerald-50/80 px-3 py-2.5 ring-1 ring-emerald-100/80">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-600">First bag ≤ 15m</span>
              <span className="text-base font-bold tabular-nums text-emerald-700">{firstBagDisplay}</span>
            </div>
          </div>

          <div className="rounded-xl bg-amber-50/70 px-3 py-2.5 ring-1 ring-amber-100/80">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-600">Last bag ≤ 40m</span>
              <span className="text-base font-bold tabular-nums text-amber-800">{lastBagDisplay}</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
