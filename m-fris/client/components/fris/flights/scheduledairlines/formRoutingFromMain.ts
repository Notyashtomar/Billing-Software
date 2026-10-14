import type { FlightData, MainDetailsData } from '@/utils/dataProcessor';

/**
 * Sub-form routing: saved doc → Main Details `route` → schedule/creation `flight.route` → `destination`.
 */
export function routingFromMainAndFlight(
  savedRouting: string | null | undefined,
  mainDetails: MainDetailsData | null | undefined,
  flight: FlightData,
): string {
  const saved = (savedRouting ?? '').trim();
  if (saved) return saved;
  const main = (mainDetails?.route ?? '').trim();
  if (main) return main;
  const scheduleRoute = (flight.route ?? '').trim();
  if (scheduleRoute) return scheduleRoute;
  return String(flight.destination ?? '').trim();
}
