import type { FlightData } from '@/utils/dataProcessor';

export type PaxShiftFlightGridCell = { label: string; value: string };

/** Flight instance (schedule) as exactly **3 rows × 4 columns** of label + value cells. */
export function buildFlightInstanceGrid4x3(
  flight: FlightData,
  serialLabel: string,
  status: string,
): PaxShiftFlightGridCell[][] {
  return [
    [
      { label: 'Serial', value: serialLabel },
      { label: 'Airline', value: flight.airline || '—' },
      { label: 'Flight no.', value: flight.flightNo || '—' },
      { label: 'Aircraft', value: flight.aircraft || '—' },
    ],
    [
      { label: 'STA date', value: flight.staDate || '—' },
      { label: 'STA time', value: flight.staTime || '—' },
      { label: 'STD date', value: flight.stdDate || '—' },
      { label: 'STD time', value: flight.stdTime || '—' },
    ],
    [
      { label: 'Route', value: flight.route || '—' },
      { label: 'Row status', value: status || '—' },
      { label: 'Pax lock', value: flight.paxLocked || '—' },
      {
        label: 'Ramp / GSD lock',
        value: `Ramp: ${flight.rampLocked || '—'}  ·  GSD: ${flight.gsdLocked || '—'}`,
      },
    ],
  ];
}
