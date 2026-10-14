export const RAMP_SHIFT_REPORT_KIND = 'ramp_shift_report' as const;

export type RampShiftBand = 'day' | 'night';

/** Day band 05:00–17:00 local (minutes from midnight). */
export const RAMP_DAY_SHIFT_START_MINS = 5 * 60;
export const RAMP_DAY_SHIFT_END_MINS = 17 * 60;
