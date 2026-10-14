/** Signed-in station for query keys. Empty during SSR. */
export function readFrisQueryStationCode(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (
      window.localStorage.getItem('userStationCode') ||
      window.localStorage.getItem('stationCode') ||
      ''
    )
      .trim()
      .toUpperCase();
  } catch {
    return '';
  }
}

export const frisQueryKeys = {
  advanceScheduleAirlines: (stationCode: string) =>
    ['fris', stationCode, 'advance-schedule-airlines'] as const,
  dailyScheduledFlights: (
    stationCode: string,
    fromDdMmYyyy: string,
    toDdMmYyyy: string,
  ) =>
    ['fris', stationCode, 'daily-scheduled-flights', fromDdMmYyyy, toDdMmYyyy] as const,
} as const;
