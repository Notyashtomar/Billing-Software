export type BookingSectionId = 'pending' | 'verified' | 'cancel';

export type BookingFlightDetails = {
  bookingNo: string;
  serialNo: string;
  airline: string;
  flightNo: string;
  registration: string;
  route: string;
  aircraftType: string;
  staDate: string;
  staTime: string;
  stdDate: string;
  stdTime: string;
  ataDate: string;
  ataTime: string;
  atdDate: string;
  atdTime: string;
};

function pickMain(main: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = main[key];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

export function fhrDocToBookingFlightDetails(
  doc: Record<string, unknown>,
  bookingNo: string,
): BookingFlightDetails {
  const main =
    doc.mainDetails != null && typeof doc.mainDetails === 'object' && !Array.isArray(doc.mainDetails)
      ? (doc.mainDetails as Record<string, unknown>)
      : {};

  const serial =
    pickMain(main, 'serialNo', 'SerialNo', 'sNo', 'Sl.No') ||
    String(doc.serialNo ?? doc.serial ?? doc._id ?? '').trim();

  return {
    bookingNo: bookingNo.trim(),
    serialNo: serial,
    airline: pickMain(main, 'Airline', 'airline', 'airlineName'),
    flightNo: pickMain(main, 'FlightNo', 'flightNo', 'Flight No', 'flightCode'),
    registration: pickMain(main, 'Regn', 'regnNo', 'registration', 'Registration'),
    route: pickMain(main, 'Route', 'route', 'routing', 'Routing'),
    aircraftType: pickMain(main, 'AircraftType', 'aircraftType', 'TypeCraft', 'aircraft'),
    staDate: pickMain(main, 'STADate', 'staDate', 'STA Date'),
    staTime: pickMain(main, 'STATime', 'staTime', 'STA Time'),
    stdDate: pickMain(main, 'STDDate', 'stdDate', 'STD Date'),
    stdTime: pickMain(main, 'STDTime', 'stdTime', 'STD Time'),
    ataDate: pickMain(main, 'ATADate', 'ataDate', 'ATA Date'),
    ataTime: pickMain(main, 'ATATime', 'ataTime', 'ATA Time'),
    atdDate: pickMain(main, 'ATDDate', 'atdDate', 'ATD Date'),
    atdTime: pickMain(main, 'ATDTime', 'atdTime', 'ATD Time'),
  };
}

export function bookingDetailsHasData(d: BookingFlightDetails): boolean {
  return Boolean(
    d.airline ||
      d.flightNo ||
      d.route ||
      d.staDate ||
      d.serialNo,
  );
}
