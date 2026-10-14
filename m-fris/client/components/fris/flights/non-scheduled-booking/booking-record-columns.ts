import type { AddPassengerSearchRecord } from './add-passenger-record';

export type BookingRecordColumn = {
  key: string;
  label: string;
  wide?: boolean;
  section: 'challan' | 'booking' | 'flight' | 'advance';
};

export const BOOKING_RECORD_COLUMNS: BookingRecordColumn[] = [
  { key: 'challanNo', label: 'Performa No', wide: true, section: 'challan' },
  { key: 'fhrNo', label: 'FHR No', section: 'challan' },
  { key: 'challanDate', label: 'Performa Date', section: 'challan' },
  { key: 'bayNo', label: 'Bay No', section: 'challan' },
  { key: 'noOfPax', label: 'No Of Pax', section: 'challan' },
  { key: 'noOfFerryIssued', label: 'No Of Ferry Issued', wide: true, section: 'challan' },
  { key: 'ghRepresentative', label: 'GH Representative', wide: true, section: 'challan' },
  { key: 'airlineRepresentative', label: 'Airline Representative', wide: true, section: 'challan' },
  { key: 'remarks', label: 'Remarks', wide: true, section: 'challan' },
  { key: 'bookingNo', label: 'Booking No', wide: true, section: 'booking' },
  { key: 'bookingDate', label: 'Booking Date', section: 'booking' },
  { key: 'booking', label: 'Booking', section: 'booking' },
  { key: 'mailReceivedFrom', label: 'Mail Received From', wide: true, section: 'booking' },
  { key: 'mailReceivedBy', label: 'Mail Received By', wide: true, section: 'booking' },
  { key: 'mailSubject', label: 'Mail Subject', wide: true, section: 'booking' },
  { key: 'service', label: 'Service', wide: true, section: 'booking' },
  { key: 'operator', label: 'Operator', wide: true, section: 'booking' },
  { key: 'airlineBillTo', label: 'Airline (B To)', wide: true, section: 'booking' },
  { key: 'airlineCode', label: 'Airline Code', section: 'flight' },
  { key: 'flightNo', label: 'Flight No', section: 'flight' },
  { key: 'registrationNo', label: 'Registration No', section: 'flight' },
  { key: 'routing', label: 'Routing', section: 'flight' },
  { key: 'staDate', label: 'STA Date', section: 'flight' },
  { key: 'staTime', label: 'STA Time', section: 'flight' },
  { key: 'stdDate', label: 'STD Date', section: 'flight' },
  { key: 'stdTime', label: 'STD Time', section: 'flight' },
  { key: 'aircraftType', label: 'Aircraft Type', wide: true, section: 'flight' },
  { key: 'aircraftBody', label: 'Aircraft Body', section: 'flight' },
  { key: 'mtow', label: 'MTOW', section: 'flight' },
  { key: 'terminalCode', label: 'Terminal Code', section: 'flight' },
  { key: 'opsType', label: 'Ops Type', section: 'flight' },
  { key: 'categoryOfFlight', label: 'Category of Flight', section: 'flight' },
  { key: 'flightType', label: 'Flight Type', section: 'flight' },
  { key: 'advance', label: 'Advance', section: 'advance' },
  { key: 'amount', label: 'Amount', section: 'advance' },
];

export const BOOKING_RECORD_SECTION_GROUPS: {
  label: string;
  section: BookingRecordColumn['section'];
}[] = [
  { label: 'Performa Detail', section: 'challan' },
  { label: 'Booking Detail', section: 'booking' },
  { label: 'Flight', section: 'flight' },
  { label: 'Advance', section: 'advance' },
];

export function columnsForBookingSection(section: BookingRecordColumn['section']) {
  return BOOKING_RECORD_COLUMNS.filter((col) => col.section === section);
}

export function bookingRecordCellValue(
  record: AddPassengerSearchRecord,
  key: string,
  paxCount = 0,
): string | number {
  if (key === 'noOfPax') return paxCount;
  if (key in record.challan) {
    return record.challan[key as keyof typeof record.challan] ?? '—';
  }
  if (key in record.booking) {
    return record.booking[key as keyof typeof record.booking] ?? '—';
  }
  if (key in record.flight) {
    return record.flight[key as keyof typeof record.flight] ?? '—';
  }
  if (key in record.advance) {
    return record.advance[key as keyof typeof record.advance] ?? '—';
  }
  return '—';
}
