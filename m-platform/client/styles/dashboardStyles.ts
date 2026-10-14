import {
  DASH_CARD_HOVER_IN_DELAY,
  DASH_CARD_INTERACTION_DURATION,
  DASH_CARD_INTERACTION_EASE,
} from '@/components/fris/dashboard/dashboardCardInteraction';
import { cn } from '@/lib/utils';

/** Framer Motion: same curve as CSS for consistent 3D flips. */
export const DASH_CARD_MOTION_DURATION_SEC = 2.5;
export const DASH_CARD_MOTION_EASE: [number, number, number, number] = [0.4, 0, 0.2, 1];
/** KPI strip tile face: 3D bevel + colored shadow (lift is on the outer shell via `dashboardKpiStripShellHover`). */
export const KPI_STRIP_TILE_3D = cn(
  'relative z-0 flex h-full min-h-[4.125rem] min-w-0 flex-col items-center justify-center gap-1 overflow-visible antialiased rounded-[11px] px-2.5 pt-1.5 pb-3 sm:min-h-[4.375rem] sm:px-3',
  "after:pointer-events-none after:absolute after:left-1/2 after:bottom-2 after:z-[2] after:block after:h-[3px] after:w-[min(68%,5.5rem)] after:-translate-x-1/2 after:rounded-full after:content-['']",
  'after:opacity-0 after:transition-opacity',
  'transition-[box-shadow,filter]',
  DASH_CARD_INTERACTION_DURATION,
  DASH_CARD_INTERACTION_EASE,
  DASH_CARD_HOVER_IN_DELAY,
  'hover:after:opacity-100'
);

export const KPI_STRIP_AMBER_FACE = cn(
  KPI_STRIP_TILE_3D,
  'box-border border border-amber-400 border-b-amber-700/55 bg-gradient-to-b from-amber-50 via-amber-100/95 to-amber-200/75 text-black dark:!text-white',
  'after:bg-gradient-to-r after:from-amber-500 after:to-orange-500 after:shadow-sm dark:after:bg-[var(--dash-border)] dark:after:from-[var(--dash-border)] dark:after:to-[var(--dash-border)]',
  /** Light only: bottom-weighted glow (shadow + drop-shadow + soft under-pill). `dark:` dashboard uses halo instead. */
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.78),0_14px_22px_-2px_rgba(251,191,36,0.28),0_22px_34px_-6px_rgba(249,115,22,0.13)]',
  'drop-shadow-[0_12px_16px_rgba(251,191,36,0.22)]',
  "before:pointer-events-none before:absolute before:-bottom-3 before:left-1/2 before:z-[-1] before:h-5 before:w-[min(92%,9.5rem)] before:-translate-x-1/2 before:rounded-[100%] before:bg-amber-400/28 before:blur-[16px] before:content-[''] dark:before:hidden",
  /* Dark: flat neutral card (no amber fill/gradient); outer blur glow stays on the wrapper. */
  'dark:!border-[var(--dash-border-subtle)] dark:!border-b-[var(--dash-border)] dark:[background-image:none] dark:!bg-[var(--dash-card)]',
  'dark:!shadow-[0_12px_30px_-12px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-10px_16px_-12px_rgba(0,0,0,0.55)]',
  'dark:drop-shadow-none',
  'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_18px_28px_-2px_rgba(251,191,36,0.34),0_26px_40px_-6px_rgba(249,115,22,0.17)]',
  'hover:drop-shadow-[0_16px_22px_rgba(251,191,36,0.28)]',
  'dark:hover:!shadow-[0_16px_38px_-14px_rgba(0,0,0,0.70),inset_0_1px_0_rgba(255,255,255,0.1)]',
  'dark:hover:drop-shadow-none'
);

export const KPI_STRIP_EMERALD_FACE = cn(
  KPI_STRIP_TILE_3D,
  'box-border border border-emerald-400 border-b-emerald-800/55 bg-gradient-to-b from-emerald-50 via-emerald-100/95 to-emerald-200/75 text-black dark:!text-white',
  'after:bg-emerald-600 after:shadow-[0_1px_2px_rgba(5,150,105,0.35)] dark:after:bg-[var(--dash-border)]',
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.78),0_14px_22px_-2px_rgba(52,211,153,0.26),0_22px_34px_-6px_rgba(5,150,105,0.12)]',
  'drop-shadow-[0_12px_16px_rgba(16,185,129,0.2)]',
  "before:pointer-events-none before:absolute before:-bottom-3 before:left-1/2 before:z-[-1] before:h-5 before:w-[min(92%,9.5rem)] before:-translate-x-1/2 before:rounded-[100%] before:bg-emerald-400/25 before:blur-[16px] before:content-[''] dark:before:hidden",
  'dark:!border-[var(--dash-border-subtle)] dark:!border-b-[var(--dash-border)] dark:[background-image:none] dark:!bg-[var(--dash-card)]',
  'dark:!shadow-[0_12px_30px_-12px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-10px_16px_-12px_rgba(0,0,0,0.55)]',
  'dark:drop-shadow-none',
  'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_18px_28px_-2px_rgba(52,211,153,0.31),0_26px_40px_-6px_rgba(5,150,105,0.15)]',
  'hover:drop-shadow-[0_16px_22px_rgba(16,185,129,0.26)]',
  'dark:hover:!shadow-[0_16px_38px_-14px_rgba(0,0,0,0.70),inset_0_1px_0_rgba(255,255,255,0.1)]',
  'dark:hover:drop-shadow-none'
);

/** Dark mode (theme toggle): transparent KPI face with only amber border; glow wrapper remains outside. */
export const KPI_STRIP_AMBER_DARK_TRANSPARENT = cn(
  '!border-amber-400/85 !border-b-amber-500/85',
  '![background-image:none] !bg-transparent',
  '!shadow-none hover:!shadow-none',
  'after:!bg-gradient-to-r after:!from-amber-400/85 after:!to-orange-400/85'
);

/** Dark mode (theme toggle): transparent KPI face with only emerald border; glow wrapper remains outside. */
export const KPI_STRIP_EMERALD_DARK_TRANSPARENT = cn(
  '!border-emerald-400/85 !border-b-emerald-500/85',
  '![background-image:none] !bg-transparent',
  '!shadow-none hover:!shadow-none',
  'after:!bg-emerald-400/85'
);

/** KPI row: light theme — plain cell (no halo / glowing rim). */
export const KPI_CELL_LIGHT =
  'relative flex h-full min-h-[4.125rem] w-full min-w-0 flex-col overflow-visible sm:min-h-[4.375rem]';
/** Dashboard dark only: halos above strip bg; glowing border wrap above halo. */
export const KPI_SLOT_SHELL =
  'relative isolate z-0 flex h-full min-h-[4.125rem] w-full min-w-0 flex-col overflow-visible sm:min-h-[4.375rem]';

/** Shared label row — `whitespace-nowrap` keeps “NS Flights” one line like other KPIs at equal column widths. */
export const KPI_STRIP_LABEL_CLASS =
  'text-center text-xs font-bold leading-snug tracking-tight whitespace-nowrap sm:text-sm md:text-[17px]';

/** 2px gradient rim + outer glow — four top KPI tiles, dashboard dark toggle only. */
export const KPI_GLOW_BORDER_WRAP_AMBER_DARK = cn(
  'relative z-10 w-full rounded-xl p-[2px]',
  'bg-gradient-to-br from-amber-400 via-orange-500 to-amber-700',
  'shadow-[0_0_0_1px_rgba(251,191,36,0.34),0_0_22px_rgba(251,191,36,0.36),0_0_44px_rgba(249,115,22,0.2),14px_0_32px_-10px_rgba(251,191,36,0.18),-14px_0_32px_-10px_rgba(251,191,36,0.18)]'
);
export const KPI_GLOW_BORDER_WRAP_EMERALD_DARK = cn(
  'relative z-10 w-full rounded-xl p-[2px]',
  'bg-gradient-to-br from-emerald-400 via-teal-500 to-emerald-700',
  'shadow-[0_0_0_1px_rgba(52,211,153,0.34),0_0_22px_rgba(16,185,129,0.36),0_0_44px_rgba(45,212,191,0.18),14px_0_32px_-10px_rgba(16,185,129,0.17),-14px_0_32px_-10px_rgba(16,185,129,0.17)]'
);

/** Soft halo behind KPI tiles — dashboard dark only (paired with glowing rim). Wider horizontal inset so edge cards aren’t clipped. */
export const KPI_HALO_AMBER_DARK = cn(
  'pointer-events-none absolute z-0 -inset-y-[5px] -inset-x-[14px] rounded-[14px] bg-gradient-to-br from-amber-500/24 via-amber-600/18 to-amber-900/24 blur-lg',
  'shadow-[0_0_36px_rgba(245,158,11,0.24),12px_0_28px_-8px_rgba(245,158,11,0.14),-12px_0_28px_-8px_rgba(245,158,11,0.14)]'
);
export const KPI_HALO_EMERALD_DARK = cn(
  'pointer-events-none absolute z-0 -inset-y-[5px] -inset-x-[14px] rounded-[14px] bg-gradient-to-br from-emerald-500/21 via-teal-500/16 to-emerald-900/24 blur-lg',
  'shadow-[0_0_36px_rgba(16,185,129,0.22),12px_0_28px_-8px_rgba(16,185,129,0.13),-12px_0_28px_-8px_rgba(16,185,129,0.13)]'
);

/** Ambient glow animation disabled — infinite box-shadow pulse read as flicker; hover shadows remain on tiles. */
export const DASH_CARD_GLOW_ANIM = '';
