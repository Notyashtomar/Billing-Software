import type { FlightData } from '@/utils/dataProcessor';
import { resolveScheduledAirlinesFlightStatus } from '@/utils/dataProcessor';
import type { NonScheduledFlightData } from './types';

export function adaptNonScheduledFlight(flight: NonScheduledFlightData): FlightData {
  const serial = String(flight.flightSerialNo ?? flight.sNo);

  const base: FlightData = {
    destination: null,
    slNo: serial,
    serialLabel: serial,
    flightNo: flight.flightNo,
    airline: flight.airline,
    airlineCode: flight.airlineCode,
    aircraft: flight.aircraft,
    staDate: flight.staDate,
    staTime: flight.staTime,
    stdDate: flight.stdDate,
    stdTime: flight.stdTime,
    exportedNAV: flight.exportedNAV,
    rampLocked: flight.rampLocked ?? '',
    paxLocked: flight.paxLocked ?? '',
    gsdLocked: flight.gsdLocked ?? '',
    flightType: flight.ops || 'Non-Scheduled',
    typeOfHandling: 'Non-Scheduled',
    route: flight.routing,
    hClose: '',
    fBag: '',
    lBag: '',
    flightStatus: flight.flightStatus ?? 'Open',
    isCancelled: Boolean(flight.isCancelled),
    hasMainDetails: flight.hasMainDetails,
    hasTerminalDetails: flight.hasTerminalDetails,
    hasRampDetails: flight.hasRampDetails,
    hasLoadControlDetails: flight.hasLoadControlDetails,
    hasEquipmentManpowerDetails: flight.hasEquipmentManpowerDetails,
  };

  return {
    ...base,
    flightStatus: resolveScheduledAirlinesFlightStatus(base),
  };
}

/** Resolve Open / Closed / Cancelled for NS table rows (same rules as scheduled). */
export function resolveNonScheduledFlightStatus(
  flight: NonScheduledFlightData,
): 'Open' | 'Closed' | 'Cancelled' {
  return resolveScheduledAirlinesFlightStatus(adaptNonScheduledFlight(flight));
}
