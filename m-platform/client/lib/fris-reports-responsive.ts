import { FRIS_HIDDEN_SCROLLBAR_CLASS } from '@/lib/fris-responsive-nav';

/** Horizontal scroll for wide report tables on phones/tablets. */
export const FRIS_REPORTS_TABLE_SCROLL_CLASS = `w-full min-w-0 overflow-x-auto overscroll-x-contain touch-pan-x ${FRIS_HIDDEN_SCROLLBAR_CLASS}`;

/** Breakpoint: card lists below this, data tables at/above (matches Tailwind `lg`). */
export const FRIS_REPORTS_TABLE_DESKTOP_CLASS = 'hidden lg:block';

/** Card lists for read-only report data on phones/tablets. */
export const FRIS_REPORTS_MOBILE_LIST_CLASS = 'lg:hidden';

/** Standard report page shell padding (navbar offset + safe areas). */
export const FRIS_REPORTS_PAGE_SHELL_CLASS =
  'min-h-[calc(100dvh-3rem)] w-full min-w-0 px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-4 md:px-6 lg:px-8 xl:px-10';

/** Touch-friendly header / filter action buttons. */
export const FRIS_REPORTS_ACTION_BTN_CLASS =
  'inline-flex min-h-[44px] touch-manipulation items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition-[background-color,border-color,transform] duration-150 active:scale-[0.98] sm:px-4';

/** Primary emerald action (Apply, Search, etc.). */
export const FRIS_REPORTS_PRIMARY_BTN_CLASS = `${FRIS_REPORTS_ACTION_BTN_CLASS} bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60`;

/** Secondary bordered action. */
export const FRIS_REPORTS_SECONDARY_BTN_CLASS = `${FRIS_REPORTS_ACTION_BTN_CLASS} border border-gray-200 bg-white text-gray-800 shadow-sm hover:border-emerald-300 hover:bg-emerald-50`;

/** Responsive filter field grid. */
export const FRIS_REPORTS_FILTER_GRID_CLASS =
  'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5';

/** Compact filter row for 2–3 controls + actions. */
export const FRIS_REPORTS_FILTER_ROW_CLASS =
  'flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end';

/** Open / status pill in report tables. */
export const FRIS_REPORTS_OPEN_BTN_CLASS =
  'inline-flex min-h-[36px] min-w-[4.5rem] touch-manipulation items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white transition-colors active:scale-[0.97] sm:min-h-[32px]';
