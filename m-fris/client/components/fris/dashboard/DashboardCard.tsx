"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  dashboardCardHoverLift,
  dashboardLegacyEmeraldHoverShadow,
} from "@/components/fris/dashboard/dashboardCardInteraction";

type DashboardCardProps = {
  label: string;
  className?: string;
  labelColorClass?: string;
  bgColorClass?: string;
  value?: string | number;
  footer?: string;
  valuePosition?: "below" | "inline";
  onClick?: () => void;
};

export default function DashboardCard({
  label,
  className,
  labelColorClass = "text-emerald-700",
  bgColorClass = "bg-emerald-50/70",
  value,
  footer,
  valuePosition = "below",
  onClick,
}: DashboardCardProps) {
  const isInline = valuePosition === "inline";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "h-full rounded-lg border border-emerald-200/80 p-1 shadow-[0_10px_18px_-16px_rgba(16,185,129,0.75)]",
        dashboardCardHoverLift,
        "md:hover:border-emerald-400/72",
        dashboardLegacyEmeraldHoverShadow,
        onClick ? "cursor-pointer" : "",
        isInline ? "flex flex-col justify-center px-2" : "",
        bgColorClass,
        className
      )}
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
      <div className={isInline ? "flex items-center justify-between gap-2" : ""}>
        <span
          className={cn(
            `text-md font-semibold tracking-wide md:text-lg ${isInline ? "whitespace-nowrap" : ""}`,
            labelColorClass
          )}
        >
          {label}
        </span>
        {typeof value !== "undefined" && (
          <div
            className={
              isInline
                ? "min-w-10 text-right text-md font-semibold leading-none text-white tabular-nums md:text-lg"
                : "mt-0.5 text-xl font-bold leading-none text-white md:text-2xl"
            }
          >
            {value}
          </div>
        )}
      </div>
      {footer ? (
        <p className="mt-0.5 hidden text-xs font-medium text-white/90 2xl:block">
          {footer}
        </p>
      ) : null}
    </motion.div>
  );
}
