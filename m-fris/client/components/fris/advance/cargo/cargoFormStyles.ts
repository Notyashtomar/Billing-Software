/** Shared field chrome for Advance → Cargo forms. */
export const CARGO_FIELD_FOCUS =
  'focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500';

export const CARGO_INPUT_CLASS = `w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm ${CARGO_FIELD_FOCUS}`;

export const CARGO_INPUT_INVALID =
  'w-full px-3 py-2 rounded-lg border border-red-500 bg-white text-gray-900 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200';

export function cargoInputClass(invalid?: boolean): string {
  return invalid ? CARGO_INPUT_INVALID : CARGO_INPUT_CLASS;
}

/** Red border on DatePicker trigger when invalid. */
export const CARGO_DATE_INVALID_CLASS =
  '[&_button]:!border-red-500 [&_button]:!ring-2 [&_button]:!ring-red-200';

export const CARGO_CHECKBOX_CLASS =
  'rounded border-gray-300 text-emerald-600 focus:outline-none focus:ring-emerald-500';

/** Visible scrollbar for compact cargo lists (e.g. scheduled airline picker). */
export const CARGO_VISIBLE_SCROLL =
  '[scrollbar-width:thin] [scrollbar-color:rgb(16_185_129)_rgb(243_244_246)] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-emerald-400/70';

/** Scrollable region with native scrollbar chrome hidden (wheel / trackpad still works). */
export const CARGO_HIDDEN_SCROLL =
  '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';

/** Three-column form grid for cargo schedule / similar pages. */
export const CARGO_FORM_GRID_3_COL =
  'grid grid-cols-1 items-start gap-4 md:grid-cols-2 lg:grid-cols-3';

/** Handling (type of flight) options — aligned with Schedule Setup / FRIS masters. */
export const CARGO_HANDLING_OPTIONS = [
  'Turnaround',
  'Transit',
  'Technical',
  'Originate',
  'Terminate',
  'Ferry In/Ferry Out',
  'Ferry In/Load Out',
  'Load In/Ferry Out',
  'Load In/Terminate',
  'Ferry In/Terminate',
  'Ferry Out Only',
  'Load Out Only',
  'Ramp Handling Only',
  'Diverted Flight',
  'Return to Ramp Flight',
] as const;
