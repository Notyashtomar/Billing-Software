"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
// gg
type StatVariant = "emerald" | "success" | "danger" | "warning";

const variantStyles: Record<
  StatVariant,
  { shell: string; icon: string; value: string; hintPositive: string; glowShadow: string }
> = {
  emerald: {
    shell:
      "bg-gradient-to-br from-emerald-500/[0.14] via-white to-white",
    icon: "bg-emerald-500/15 text-emerald-600 shadow-inner shadow-emerald-500/10",
    value: "text-slate-900",
    hintPositive: "text-emerald-600",
    glowShadow: "shadow-[0_14px_36px_-18px_rgba(16,185,129,0.7),0_4px_20px_-8px_rgba(15,23,42,0.12)]",
  },
  success: {
    shell:
      "bg-gradient-to-br from-teal-500/[0.12] via-white to-cyan-50/30",
    icon: "bg-teal-500/15 text-teal-600 shadow-inner shadow-teal-500/10",
    value: "text-slate-900",
    hintPositive: "text-teal-600",
    glowShadow: "shadow-[0_14px_36px_-18px_rgba(16,185,129,0.7),0_4px_20px_-8px_rgba(15,23,42,0.12)]",
  },
  danger: {
    shell:
      "bg-gradient-to-br from-rose-500/[0.12] via-white to-orange-50/20",
    icon: "bg-rose-500/15 text-rose-600 shadow-inner shadow-rose-500/10",
    value: "text-slate-900",
    hintPositive: "text-rose-600",
    glowShadow: "shadow-[0_14px_36px_-18px_rgba(244,63,94,0.75),0_4px_20px_-8px_rgba(15,23,42,0.12)]",
  },
  warning: {
    shell:
      "bg-gradient-to-br from-amber-500/[0.14] via-white to-amber-50/25",
    icon: "bg-amber-500/15 text-amber-600 shadow-inner shadow-amber-500/10",
    value: "text-slate-900",
    hintPositive: "text-amber-700",
    glowShadow: "shadow-[0_14px_36px_-18px_rgba(245,158,11,0.75),0_4px_20px_-8px_rgba(15,23,42,0.12)]",
  },
};

type PremiumHeroStatProps = {
  label: string;
  value: string | number;
  footer?: string;
  hint?: string;
  /** When true, hint is styled as a positive/context line (green family). */
  hintTone?: "neutral" | "positive" | "warning" | "critical";
  icon: LucideIcon;
  variant: StatVariant;
  onClick?: () => void;
};

export default function PremiumHeroStat({
  label,
  value,
  footer,
  hint,
  hintTone = "neutral",
  icon: Icon,
  variant,
  onClick,
}: PremiumHeroStatProps) {
  const vs = variantStyles[variant];
  const hintClass =
    hintTone === "positive"
      ? vs.hintPositive
      : hintTone === "warning"
        ? "text-amber-600"
        : hintTone === "critical"
          ? "text-rose-600"
          : "text-slate-500";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      whileHover={onClick ? { y: -3, transition: { duration: 0.2 } } : undefined}
      whileTap={onClick ? { scale: 0.99 } : undefined}
      className={`relative flex h-full min-h-[82px] flex-col justify-between overflow-hidden rounded-2xl p-2.5 ring-1 ring-slate-200/70 ${vs.glowShadow} ${vs.shell} ${onClick ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white" : ""}`}
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
      <div className="pointer-events-none absolute -right-5 -top-5 h-16 w-16 rounded-full bg-white/40 blur-2xl" />
      <div className="relative flex items-start justify-between gap-2">
        <div>
          <p className="text-[20px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {label}
          </p>
          <p className={`mt-0.5 text-[48px] font-bold tabular-nums tracking-tight md:text-[48px] ${vs.value}`}>
            {value}
          </p>
        </div>
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${vs.icon}`}
        >
          <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
        </div>
      </div>
      <div className="relative mt-1 space-y-0">
        {hint ? (
          <p className={`text-[10px] font-medium ${hintClass}`}>{hint}</p>
        ) : null}
        {footer ? (
          <p className="text-[10px] font-normal leading-snug text-slate-500">{footer}</p>
        ) : null}
      </div>
    </motion.div>
  );
}
