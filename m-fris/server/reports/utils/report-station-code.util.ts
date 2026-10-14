/**
 * Legacy fallback station code, used only when a request carries no station
 * context (e.g. a system/cross-station caller).
 */
export const REPORT_STATION_CODE = 'MAA';

/**
 * e.g. `MAA / 16616`. The station code reflects the active session's station;
 * pass the request's resolved `stationCode` so reports/exports show the station
 * the user is logged in to. Falls back to the legacy station when absent.
 */
export function formatReportSerialNoDisplay(
  serialNo: string | number | null | undefined,
  stationCode?: string | null,
): string {
  const station =
    String(stationCode ?? '')
      .trim()
      .toUpperCase() || REPORT_STATION_CODE;
  const serial = String(serialNo ?? '').trim();
  return serial ? `${station} / ${serial}` : station;
}
