'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  MOTION_CARD_SPRING,
  dashboardCardInteractiveWillChange,
  dashboardCardTransition,
  dashboardCardTransformGpu,
} from '@/components/fris/dashboard/dashboardCardInteraction';

type MotionDashboardCardProps = Omit<HTMLMotionProps<'div'>, 'whileHover' | 'whileTap'> & {
  children: React.ReactNode;
  /** When true, skips motion scale/lift (uses CSS shadow from className only). */
  disableMotionHover?: boolean;
};

/**
 * Optional wrapper: spring hover/tap while `className` supplies border/shadow/color transitions
 * via `dashboardCardTransition` — avoid duplicating CSS `hover:-translate-y-*` on the same node.
 */
export function MotionDashboardCard({
  className,
  children,
  disableMotionHover,
  ...props
}: MotionDashboardCardProps) {
  const reduceMotion = useReducedMotion();
  const motionOff = Boolean(reduceMotion || disableMotionHover);

  return (
    <motion.div
      className={cn(dashboardCardTransformGpu, dashboardCardInteractiveWillChange, dashboardCardTransition, className)}
      whileHover={motionOff ? undefined : { y: -3, transition: MOTION_CARD_SPRING }}
      whileTap={undefined}
      {...props}
    >
      {children}
    </motion.div>
  );
}
