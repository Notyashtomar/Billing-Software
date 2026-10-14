export interface NonScheduledFlightData {
  sNo: number;
  flightNo: string;
  airline: string;
  airlineCode?: string;
  aircraft: string;
  routing: string;
  ops: string;
  staDate: string;
  staTime: string;
  stdDate: string;
  stdTime: string;
  exportedNAV: string;
  challanNo: string;
  bookingNo: string;
  dataOf: string;
  /** Operator from Non-Scheduled booking (shown on FHR as Airline-Operator). */
  operator?: string;
  /** Optional: mainDetails / booking link for Open. */
  flightSerialNo?: number;
  bookingKey?: string;
  /** Open | Closed | Cancelled — same semantics as Scheduled Airlines. */
  flightStatus?: string;
  isCancelled?: boolean;
  hasMainDetails?: boolean;
  hasTerminalDetails?: boolean;
  hasRampDetails?: boolean;
  hasLoadControlDetails?: boolean;
  hasEquipmentManpowerDetails?: boolean;
  rampLocked?: string;
  paxLocked?: string;
  gsdLocked?: string;
}

export interface BaseFormProps {
  flight: NonScheduledFlightData | null;
  onSave?: (data: unknown) => void;
}
