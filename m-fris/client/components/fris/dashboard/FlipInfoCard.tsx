"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  dashboardCardHoverLift,
  dashboardCardHoverShadowOnly,
} from "@/components/fris/dashboard/dashboardCardInteraction";

type FlipInfoCardProps = {
  className?: string;
  title: string;
  description: string;
  /** When false, shows a static card (no 3D flip). Title/description are unused. */
  flipOnHover?: boolean;
  children: ReactNode;
};

const shellClassStatic = cn(
  "relative h-full w-full rounded-2xl bg-white shadow-[0_10px_32px_-14px_rgba(15,23,42,0.16)] ring-1 ring-slate-200/80",
  dashboardCardHoverLift
);

/** Flip mode uses rotateY on this node — shadow-only hover avoids transform conflicts. */
const shellClassFlip = cn(
  "relative h-full w-full rounded-2xl bg-white shadow-[0_10px_32px_-14px_rgba(15,23,42,0.16)] ring-1 ring-slate-200/80",
  dashboardCardHoverShadowOnly
);

export default function FlipInfoCard({
  className,
  title,
  description,
  flipOnHover = true,
  children,
}: FlipInfoCardProps) {
  const backClass =
    "border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-teal-50/80 to-white text-slate-800 shadow-inner";

  if (!flipOnHover) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className={cn("group h-full", className)}
      >
        <div className={shellClassStatic}>
          <div className="h-full overflow-hidden rounded-2xl">{children}</div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={cn("group h-full [perspective:1400px]", className)}
    >
      <div
        className={`${shellClassFlip} group-hover:[transform:rotateY(180deg)] [transform-style:preserve-3d]`}
      >
        <div className="h-full overflow-hidden rounded-2xl [backface-visibility:hidden]">
          {children}
        </div>
        <div
          className={`absolute inset-0 flex h-full items-center justify-center rounded-2xl p-4 text-center [backface-visibility:hidden] [transform:rotateY(180deg)] ${backClass}`}
        >
          <div className="max-w-[220px]">
            <h4 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h4>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">{description}</p>
            <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-emerald-700/70">
              Flip back on hover
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
