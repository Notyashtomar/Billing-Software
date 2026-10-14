export type BhsMisSheetStatus = {
  id: string;
  label: string;
  description: string;
  status: 'complete' | 'partial' | 'missing' | 'not_applicable';
  message: string;
  rowCount?: number;
  expectedCount?: number;
};

export type BhsMisStatusPayload = {
  stationCode: string;
  stationLabel: string;
  from: string;
  to: string;
  monthLabel: string;
  monthToken: string;
  layout: string;
  readyForExport: boolean;
  sheets: BhsMisSheetStatus[];
  missingBilling: Array<{
    customerCode: string;
    airlineName: string;
    reason: string;
  }>;
  summary: {
    scheduledFlights: number;
    eligibleFlights: number;
    priceCardAirlines: number;
    billedAirlines: number;
    bhsInvoices: number;
  };
};
