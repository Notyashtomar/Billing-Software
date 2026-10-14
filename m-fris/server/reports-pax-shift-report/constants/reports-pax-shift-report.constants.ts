/**
 * Discriminator for documents in MongoDB collection `reports-pax-shift-report`.
 *
 * - flight_report: Open-button sidebar data for one schedule flight instance (`flightSerial` / `slNo`).
 * - short_shipped_bags: One singleton document; each flight serial is an entry inside `shortShippedBagsByFlight`.
 * - duty_allocation: One singleton document; each saved report is an entry in `dutyAllocationEntries`.
 */
export const PAX_SHIFT_REPORT_KIND = {
  FLIGHT_REPORT: 'flight_report',
  SHORT_SHIPPED_BAGS: 'short_shipped_bags',
  DUTY_ALLOCATION: 'duty_allocation',
} as const;

export type PaxShiftReportKind =
  (typeof PAX_SHIFT_REPORT_KIND)[keyof typeof PAX_SHIFT_REPORT_KIND];

/** Employee section keys used by Open sidebar + API (matches `PAX_SHIFT_EMPLOYEE_SECTIONS` on client). */
export const PAX_SHIFT_EMPLOYEE_SECTION_KEYS = [
  'psr-staff-on-duty',
  'psr-sick-leave',
  'psr-casual-leave',
  'psr-comp-off',
  'psr-annual-leave',
  'psr-absence',
  'psr-chk-in-staff-d',
  'psr-chk-in-staff-n',
  'psr-csh-in-staff-d',
  'psr-csh-in-staff-n',
  'psr-mhb-staff-d',
  'psr-mhb-staff-n',
] as const;

export type PaxShiftEmployeeSectionKey =
  (typeof PAX_SHIFT_EMPLOYEE_SECTION_KEYS)[number];

export const PAX_SHIFT_EMPLOYEE_SECTION_KEY_SET = new Set<string>(
  PAX_SHIFT_EMPLOYEE_SECTION_KEYS,
);

export function isPaxShiftEmployeeSectionKey(
  value: string,
): value is PaxShiftEmployeeSectionKey {
  return PAX_SHIFT_EMPLOYEE_SECTION_KEY_SET.has(value);
}

/** `flightSerial` on the single short-shipped-bags document (not a schedule row). */
export const SHORT_SHIPPED_BAGS_SINGLETON_SERIAL = '__short_shipped_bags__';

/** `flightSerial` on the single duty-allocation document. */
export const DUTY_ALLOCATION_SINGLETON_SERIAL = '__duty_allocation__';
