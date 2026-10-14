import type { FlightData } from '@/utils/dataProcessor';

export type PaxShiftFlightSnapshotPayload = {
  airline: string;
  flightNo: string;
  aircraft: string;
  staDate: string;
  staTime: string;
  stdDate: string;
  stdTime: string;
};

/** Snapshot stored on `reports-pax-shift-report` for list/report views. */
export function flightSnapshotFromFlightData(
  flight: Pick<
    FlightData,
    'airline' | 'flightNo' | 'aircraft' | 'staDate' | 'staTime' | 'stdDate' | 'stdTime'
  >,
): PaxShiftFlightSnapshotPayload {
  return {
    airline: String(flight.airline ?? '').trim(),
    flightNo: String(flight.flightNo ?? '').trim(),
    aircraft: String(flight.aircraft ?? '').trim(),
    staDate: String(flight.staDate ?? '').trim(),
    staTime: String(flight.staTime ?? '').trim(),
    stdDate: String(flight.stdDate ?? '').trim(),
    stdTime: String(flight.stdTime ?? '').trim(),
  };
}
