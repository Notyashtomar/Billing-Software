import type { BookingFlightDetails } from '@/components/fris/others/booking-details-helpers';

export type NonScheduledBookingSectionId = 'pending' | 'verified' | 'cancelled';

export type NonScheduledBookingFlightDetails = BookingFlightDetails & {
  flightCancelled: boolean;
  status: string;
};

function pick(doc: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = doc[key];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

export function nsMainDetailsToBookingFlightDetails(
  doc: Record<string, unknown>,
  bookingNo: string,
): NonScheduledBookingFlightDetails {
  const serial =
    pick(doc, 'SerialNo', 'serialNo', 'flightSerialNumber', 'sNo') ||
    bookingNo.trim();

  const arrival = pick(doc, 'ArrivalFltNo', 'arrivalFlightNo');
  const departure = pick(doc, 'DepartureFltNo', 'departureFlightNo');
  const flightNo =
    arrival && departure && arrival !== departure
      ? `${arrival} / ${departure}`
      : arrival || departure;

  return {
    bookingNo: bookingNo.trim(),
    serialNo: serial,
    airline: pick(doc, 'Airline', 'airline'),
    flightNo,
    registration: pick(doc, 'Regn', 'regnNo', 'registration'),
    route: pick(doc, 'Route', 'route', 'routing'),
    aircraftType: pick(doc, 'TypeCraft', 'aircraftType', 'TypeCraft'),
    staDate: pick(doc, 'ATADate', 'ataDate', 'IPosDate', 'etdDate'),
    staTime: pick(doc, 'ATATime', 'ataTime', 'IPosTime', 'ETDtime'),
    stdDate: pick(doc, 'ATDDate', 'atdDate'),
    stdTime: pick(doc, 'ATDTime', 'atdTime'),
    ataDate: pick(doc, 'ATADate', 'ataDate'),
    ataTime: pick(doc, 'ATATime', 'ataTime'),
    atdDate: pick(doc, 'ATDDate', 'atdDate'),
    atdTime: pick(doc, 'ATDTime', 'atdTime'),
    flightCancelled: doc.flightCancelled === true,
    status: pick(doc, 'status', 'departureStatus', 'Status'),
  };
}

export function nonScheduledBookingHasData(d: NonScheduledBookingFlightDetails): boolean {
  return Boolean(d.airline || d.flightNo || d.route || d.staDate || d.serialNo);
}

export function matchesNonScheduledBookingSection(
  section: NonScheduledBookingSectionId,
  details: NonScheduledBookingFlightDetails,
): boolean {
  if (section === 'cancelled') return details.flightCancelled;
  if (details.flightCancelled) return false;
  const status = details.status.toLowerCase();
  const isVerified = status.includes('verif') || status.includes('confirm');
  if (section === 'verified') return isVerified;
  return !isVerified;
}
