import { FRIS_HIDDEN_SCROLLBAR_CLASS } from '@/lib/fris-responsive-nav';

/** Table visible from `lg` up; card lists below. */
export const DASH_TABLE_DESKTOP_CLASS = 'hidden lg:block';

/** Card lists for phones/tablets. */
export const DASH_MOBILE_LIST_CLASS = 'lg:hidden';

/** Touch-friendly icon / control targets (44px). */
export const DASH_TOUCH_TARGET_CLASS =
  'inline-flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center';

/** Modal / sheet width on narrow viewports. */
export const DASH_MODAL_MOBILE_WIDTH_CLASS =
  'w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:w-full sm:max-w-none';

/** Modal padding — tighter on phones. */
export const DASH_MODAL_MOBILE_PADDING_CLASS = 'p-3 sm:p-6';

/** Horizontal scroll for wide dashboard tables on phones. */
export const DASH_TABLE_SCROLL_X_CLASS = `w-full min-w-0 overflow-x-auto overscroll-x-contain touch-pan-x ${FRIS_HIDDEN_SCROLLBAR_CLASS}`;

/** Dashboard page shell — matches FRIS navbar height (3rem). */
export const DASH_PAGE_SHELL_CLASS =
  'min-h-[calc(100dvh-3rem)] w-full min-w-0 overflow-x-hidden px-2 py-1.5 sm:px-3 sm:py-2 lg:px-4';
