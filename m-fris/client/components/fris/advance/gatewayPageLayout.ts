/** Shared Advance → Gateway page layout (matches dropdown / h-10 control height). */

export const GATEWAY_PAGE_ROOT =
  'flex min-h-0 flex-1 flex-col gap-3 w-full';

export const GATEWAY_FORM_SECTION =
  'shrink-0 rounded-xl border border-emerald-300 bg-white shadow-sm';

export const GATEWAY_FORM_INNER = 'p-4';

export const GATEWAY_FORM_GRID =
  'grid grid-cols-1 items-start gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-3';

export const GATEWAY_FORM_GRID_4 =
  'grid grid-cols-1 items-start gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-4';

export const GATEWAY_FORM_GRID_5 =
  'grid grid-cols-1 items-start gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-5';

export const GATEWAY_FORM_FIELD = 'min-w-0';

/**
 * Action buttons (Save / Cancel) in a form grid cell.
 * `self-end` + error-slot padding align the h-10 button with labeled controls
 * (label + h-10 input + FormFieldError), not with the label row.
 */
export const GATEWAY_FORM_ACTIONS =
  'flex flex-wrap items-center gap-2 self-end pb-[1.125rem]';

export const GATEWAY_LABEL =
  'mb-1.5 block text-sm font-medium text-gray-700';

/**
 * Invisible label footprint — use above Active/Block checkboxes so the control
 * row lines up with sibling labeled fields.
 */
export const GATEWAY_LABEL_SPACER =
  'mb-1.5 block h-5 text-sm invisible select-none';

/** Checkbox + caption row matching GATEWAY_CONTROL height (h-10). */
export const GATEWAY_CHECKBOX_CONTROL =
  'flex h-10 cursor-pointer items-center gap-2';

/** Native checkbox chrome shared across gateway forms. */
export const GATEWAY_CHECKBOX_INPUT =
  'h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500';

/** Same height as AdminRadioDropdown trigger (h-10). */
export const GATEWAY_CONTROL =
  'box-border h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';

export const GATEWAY_CONTROL_INVALID =
  'box-border h-10 w-full rounded-lg border border-red-500 bg-white px-3 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200';

export function gatewayControlClass(invalid?: boolean): string {
  return invalid ? GATEWAY_CONTROL_INVALID : GATEWAY_CONTROL;
}

/**
 * Width-only for AdminRadioDropdown triggers.
 * Full GATEWAY_CONTROL on the trigger fights flex + can blow up the chevron SVG.
 * Use GATEWAY_CONTROL on native inputs/text fields only.
 */
export const GATEWAY_DROPDOWN = 'w-full';

export const GATEWAY_FILTER_BAR =
  'flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50/80 px-4 py-3';

export const GATEWAY_FILTER_INPUT =
  'box-border h-10 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';

export const GATEWAY_TABLE_SECTION =
  'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-emerald-300 bg-white shadow-sm';

export const GATEWAY_TABLE_SCROLL =
  'min-h-0 flex-1 overflow-y-auto overflow-x-auto';

export const GATEWAY_GET_BTN =
  'inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60';

export const GATEWAY_SAVE_BTN =
  'flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 shadow-md shadow-emerald-500/25 disabled:opacity-60';

export const GATEWAY_SECONDARY_BTN =
  'flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60';
