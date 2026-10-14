/** Shared layout tokens for flight-detail forms opened from Scheduled Airlines. */

/** Root shell inside the flight-details drawer (phones + desktop). */
export const FLIGHT_DETAILS_FORM_ROOT_CLASS =
  'flex h-full min-w-0 flex-col bg-gray-50';

/** Scrollable form body — vertical scroll only; wide tables scroll inside their own regions. */
export const FLIGHT_DETAILS_FORM_BODY_CLASS =
  'w-full min-w-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-4 sm:p-5';

/** Section card — allows nested horizontal scroll regions to size correctly in flex layouts. */
export const FLIGHT_DETAILS_SECTION_CLASS =
  'min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm';

/**
 * Horizontal scroll for wide tables (cargo, hold, equipment grids).
 * Use on a wrapper around `<table className="min-w-[…]">`.
 */
export const FLIGHT_DETAILS_H_SCROLL_CLASS =
  'w-full min-w-0 overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]';

/** Responsive field grid — single column on phones. `items-start` keeps controls level with FormFieldError slots. */
export const FLIGHT_DETAILS_FIELD_GRID_CLASS =
  'grid grid-cols-1 items-start gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';

/** Match FormFieldError slot when aligning action buttons beside validated fields. */
export const FLIGHT_DETAILS_FORM_ACTIONS_CLASS =
  'flex flex-wrap items-end gap-2 pb-[1.125rem]';
