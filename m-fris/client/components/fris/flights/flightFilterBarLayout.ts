/**
 * Shared filter-bar alignment for Flights tab pages.
 * Keep action `pb` in sync with FormFieldError slot height.
 */

import { FORM_FIELD_ERROR_SLOT_CLASS } from '@/components/ui/FormFieldError';

/** Match {@link FORM_FIELD_ERROR_SLOT_CLASS} when aligning unlabeled actions beside validated fields. */
export const FLIGHT_FILTER_ACTIONS_PB = 'pb-[1.125rem]';

/** Row of action buttons beside labeled + FormFieldError fields (`items-end` parent). */
export const FLIGHT_FILTER_ACTIONS_CLASS =
  `flex shrink-0 flex-wrap items-center gap-2 ${FLIGHT_FILTER_ACTIONS_PB}`;

/** Desktop filter row — bottom-align controls with FormFieldError slots. */
export const FLIGHT_FILTER_ROW_CLASS =
  'flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-end xl:gap-4';

/** Compact filter label (date/airline rows). */
export const FLIGHT_FILTER_LABEL_CLASS =
  'mb-1.5 block text-xs font-medium text-gray-600';

/** h-10 control — matches DatePicker default height. */
export const FLIGHT_FILTER_CONTROL_CLASS =
  'box-border h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 transition-colors hover:border-gray-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';

/** Primary filter CTA (Apply / Filter / Get / Refresh). */
export const FLIGHT_FILTER_PRIMARY_BTN_CLASS =
  'inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-emerald-500 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60';

/** Secondary filter CTA (Reset / Clear / Export). */
export const FLIGHT_FILTER_SECONDARY_BTN_CLASS =
  'inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50';

/** Re-export for callers that want the slot class next to actions. */
export { FORM_FIELD_ERROR_SLOT_CLASS };
