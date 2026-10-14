import {
  isScheduleCancelledFlightNo,
  type FlightData,
} from '@/utils/dataProcessor';
import type { CreationRafRecord } from '@/lib/api';

/** Map Creation → RAF Mongo row into scheduled-airlines flight table shape. */
export function creationRafRecordToFlightData(
  record: CreationRafRecord,
): FlightData | null {
  const slNo = String(record.serialNo ?? record._id ?? '').trim();
  const flightNo = String(record.flightNo ?? '').trim();
  const airline = String(record.airlines ?? '').trim();
  if (!slNo || !flightNo || !airline) return null;

  const staDate = String(record.date ?? '').trim();
  const stdDate = String(record.date2 ?? record.date ?? '').trim();
  const opsType = String(record.opsType ?? 'Turnaround').trim() || 'Turnaround';
  const category = String(record.categoryOfFlight ?? '').trim();

  return {
    destination: null,
    slNo,
    flightNo,
    airline,
    aircraft: String(record.acType ?? '').trim(),
    staDate,
    staTime: String(record.staTime ?? '00:00').trim() || '00:00',
    stdDate,
    stdTime: String(record.stdTime ?? '00:00').trim() || '00:00',
    exportedNAV: 'No',
    rampLocked: 'No',
    paxLocked: 'No',
    gsdLocked: 'No',
    flightType: category || String(record.aBody ?? 'NB').trim() || 'RAF',
    cateOfFlight: category,
    typeOfHandling: opsType,
    hClose: '',
    fBag: '',
    lBag: '',
    route: String(record.routing ?? '').trim(),
    scheduleSource: 'creation-raf',
    airlineCode: String(record.airlineCode ?? '').trim() || undefined,
    flightStatus: 'Open',
    hasMainDetails: false,
    hasTerminalDetails: false,
    hasRampDetails: false,
    hasLoadControlDetails: false,
    hasEquipmentManpowerDetails: false,
    isCancelled: isScheduleCancelledFlightNo(flightNo),
  };
}

export function creationRafRecordsToFlightData(
  records: CreationRafRecord[],
): FlightData[] {
  return records
    .map(creationRafRecordToFlightData)
    .filter((row): row is FlightData => row != null);
}
