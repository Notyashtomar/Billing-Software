import type { MainDetailsData } from '@/utils/dataProcessor';
import {
  dedupeRepeatedFlightNoSegments,
  displayFlightNoFromScheduleData,
  withAirlineCodePrefix,
} from '@/lib/schedule-flight-no-display';

export {
  dedupeRepeatedFlightNoSegments,
  displayFlightNoFromScheduleData,
  withAirlineCodePrefix,
} from '@/lib/schedule-flight-no-display';

/**
 * Build a single flight-number label from arrival / departure legs.
 * Handles equal legs, pre-combined values, and duplicated segments.
 */
export function flightNoFromArrivalDeparture(
  arrivalRaw: unknown,
  departureRaw: unknown,
  airlineCode?: string,
): string {
  return displayFlightNoFromScheduleData({
    ArrivalFltNo: arrivalRaw,
    DepartureFltNo: departureRaw,
    airlineCode: airlineCode ?? '',
    ifOperationSplit: true,
  });
}

export function flightNoFromMainDetails(
  mainDetails: MainDetailsData | null | undefined,
  fallback: string,
): string {
  if (!mainDetails) return dedupeRepeatedFlightNoSegments(fallback);
  const fromSchedule = displayFlightNoFromScheduleData({
    flightNo: mainDetails.flightCode,
    ArrivalFltNo: mainDetails.arrivalFlightNo,
    DepartureFltNo: mainDetails.departureFlightNo,
    ifOperationSplit: (mainDetails as { ifOperationSplit?: boolean }).ifOperationSplit,
  });
  if (fromSchedule) return fromSchedule;
  const code = mainDetails.flightCode?.trim();
  return dedupeRepeatedFlightNoSegments(code || fallback);
}
