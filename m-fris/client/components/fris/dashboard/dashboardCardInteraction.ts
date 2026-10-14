import { cn } from '@/lib/utils';

/** Unified premium easing — smooth deceleration (Linear / Stripe-like). */
export const DASH_CARD_INTERACTION_EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]';

export const DASH_CARD_INTERACTION_DURATION = 'duration-300';
/** Synced with transform timing — no trailing color lag. */
export const DASH_CARD_INTERACTION_BG_DURATION = 'duration-300';

/**
 * Hover-in only: trims jitter when the cursor skims across cards. Hover-out stays instant (`delay-0`).
 */
export const DASH_CARD_HOVER_IN_DELAY = 'delay-0 md:hover:delay-[50ms]';

/** GPU layer without eager `will-change` (reserved for hover). */
export const dashboardCardTransformGpu = 'origin-center transform-gpu';

/** Reserved for rare cases — hover `will-change` + scale caused fuzzy text on some GPUs. */
export const dashboardCardInteractiveWillChange = '';

/**
 * Core transition stack for interactive dashboard surfaces.
 * Include `box-shadow` so elevation interpolates smoothly (exit uses the same ease, no snap).
 */
export const dashboardCardTransition = cn(
  'transition-[transform,box-shadow,border-color,background-color,opacity,color]',
  DASH_CARD_INTERACTION_DURATION,
  DASH_CARD_INTERACTION_EASE,
  DASH_CARD_HOVER_IN_DELAY
);

export const dashboardCardBgTransition = cn(
  'transition-[background,background-color]',
  DASH_CARD_INTERACTION_BG_DURATION,
  DASH_CARD_INTERACTION_EASE,
  DASH_CARD_HOVER_IN_DELAY
);

export const dashboardCardRingTransition = cn(
  'transition-shadow',
  DASH_CARD_INTERACTION_DURATION,
  DASH_CARD_INTERACTION_EASE,
  DASH_CARD_HOVER_IN_DELAY
);

/** Strips / chrome: background + border + shadow (no transform, no hover delay). */
export const dashboardSurfaceTransition = cn(
  'transition-[background-color,border-color,box-shadow]',
  DASH_CARD_INTERACTION_DURATION,
  DASH_CARD_INTERACTION_EASE
);

/**
 * Shared lift: md+ uses -3px + scale 1.015; tap 0.98.
 * Mobile: no scale lift — subtle elevation only.
 */
export const dashboardCardHoverLift = cn(
  dashboardCardTransformGpu,
  dashboardCardInteractiveWillChange,
  dashboardCardTransition,
  'max-md:hover:translate-y-0',
  'max-md:hover:shadow-[0_8px_22px_-8px_rgba(0,0,0,0.06)] dark:max-md:hover:shadow-[0_10px_28px_-10px_rgba(0,0,0,0.36)]',
  'md:hover:-translate-y-[3px]',
  'md:hover:shadow-[0_12px_36px_-10px_rgba(0,0,0,0.065),0_4px_18px_-6px_rgba(0,0,0,0.04)]',
  'dark:md:hover:shadow-[0_14px_40px_-12px_rgba(0,0,0,0.38),0_6px_20px_-10px_rgba(0,0,0,0.22)]'
);

/** Top KPI row: outer shell (lifts halo + rim + face together in dark mode). */
export const dashboardKpiStripShellHover = cn(dashboardCardHoverLift, 'hover:z-10');

/**
 * Analytics tiles (Overview, TypeCraft): emerald accent + shared lift (~18% softer glow vs prior).
 */
export const dashboardAnalyticsCardHover = cn(
  dashboardCardTransformGpu,
  dashboardCardInteractiveWillChange,
  dashboardCardTransition,
  'hover:z-30',
  'max-md:hover:translate-y-0',
  'max-md:hover:shadow-[0_8px_22px_-8px_rgba(0,0,0,0.06)] dark:max-md:hover:shadow-[0_10px_28px_-10px_rgba(0,0,0,0.36)]',
  'md:hover:-translate-y-[3px]',
  'md:hover:border-emerald-400/80 dark:md:hover:border-emerald-400/65',
  'md:hover:shadow-[0_12px_34px_-10px_rgba(0,0,0,0.062),0_16px_40px_-17px_rgba(16,185,129,0.18),0_0_52px_-16px_rgba(255,184,8,0.098)]',
  'dark:md:hover:shadow-[0_14px_40px_-12px_rgba(0,0,0,0.38),0_18px_46px_-19px_rgba(16,185,129,0.148),0_0_56px_-18px_rgba(52,211,153,0.098)]'
);

/** Month summary & large panels: same system, slightly lower z than dense analytics grid. */
export const dashboardPanelCardHover = cn(
  'relative z-0 overflow-visible',
  dashboardCardTransformGpu,
  dashboardCardInteractiveWillChange,
  dashboardCardTransition,
  'hover:z-20',
  'max-md:hover:translate-y-0',
  'max-md:hover:shadow-[0_8px_22px_-8px_rgba(0,0,0,0.06)] dark:max-md:hover:shadow-[0_10px_28px_-10px_rgba(0,0,0,0.36)]',
  'md:hover:-translate-y-[3px]',
  'md:hover:border-emerald-400/72 dark:md:hover:border-emerald-400/55',
  'md:hover:shadow-[0_12px_34px_-10px_rgba(0,0,0,0.062),0_18px_46px_-18px_rgba(16,185,129,0.148)]',
  'dark:md:hover:shadow-[0_14px_40px_-12px_rgba(0,0,0,0.38),0_22px_56px_-20px_rgba(52,211,153,0.115)]'
);

/**
 * When the element already uses `transform` (3D flip) — shadow/ring only.
 * ~18% softer than previous step.
 */
export const dashboardCardHoverShadowOnly = cn(
  'transition-[box-shadow,border-color,ring-color]',
  DASH_CARD_INTERACTION_DURATION,
  DASH_CARD_INTERACTION_EASE,
  DASH_CARD_HOVER_IN_DELAY,
  'hover:shadow-[0_12px_32px_-10px_rgba(0,0,0,0.085),0_2px_12px_-6px_rgba(0,0,0,0.04)] hover:ring-slate-300/85',
  'dark:hover:shadow-[0_14px_38px_-12px_rgba(0,0,0,0.40),0_4px_16px_-8px_rgba(0,0,0,0.22)] dark:hover:ring-slate-500/50'
);

/** Extra emerald/amber lift on legacy green cards (`DashboardCard`) — layered over `dashboardCardHoverLift`. */
export const dashboardLegacyEmeraldHoverShadow =
  'md:hover:shadow-[0_12px_34px_-10px_rgba(0,0,0,0.062),0_14px_38px_-16px_rgba(16,185,129,0.34),0_0_40px_-12px_rgba(255,184,8,0.10)]';

/** Optional MotionDashboardCard spring — slightly softer settle than CSS hover. */
export const MOTION_CARD_SPRING = { type: 'spring' as const, stiffness: 260, damping: 24 };
