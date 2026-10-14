// types/flight.ts - Update the interface
export interface Flight {
  SerialNo: number;
  Airline: string;
  FlightNo: string;
  Typeofflight: string;
  TypeCraft: string;
  STATime: string;
  STADate: string;
  STDTime: string;
  STDDate: string;
  ATATime: string;
  ATADate: string;
  ATDTime: string;
  ATDDate: string;
  ETDtime: string;
  ETDdate: string;
  Delay?: string; // Make optional since non-scheduled doesn't have it
  RateingValue: string;
  "Cancelled data": string;
  "Count Cancelled FLIGHT": number;
  "Delay flight"?: number; // Make optional
  "Delay flight "?: number; // Add with space for non-scheduled
  GHA?: string | number | boolean | null;
  [key: string]: string | number | boolean | null | undefined; // Allow extra fields like __EMPTY_2
}

export interface FlightStats {
  totalFlights: number;
  cancelledFlights: number;
  operationalFlights: number;
  airlines: Record<string, number>;
  flightTypes: Record<string, number>;
  lockStats: {
    rampLocked: number;
    paxLocked: number;
    gsdLocked: number;
    exportedNAV: number;
  };
  flightsByDate: Record<string, number>;
  aircraftTypes: Record<string, number>;
  cancellationRate: number;
  delayStats: {
    onTime: number;
    delayed: number;
    beforeTime: number;
    gha?: number;
    nonGha?: number;
  };
  ratingDistribution: Record<string, number>;
}