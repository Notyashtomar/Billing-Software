export type AdsMisSheetStatus = {
  id: string;
  label: string;
  description: string;
  status: 'complete' | 'partial' | 'missing' | 'not_applicable';
  message: string;
  rowCount?: number;
  expectedCount?: number;
};

export type AdsMisStatusPayload = {
  stationCode: string;
  stationLabel: string;
  from: string;
  to: string;
  monthLabel: string;
  monthToken: string;
  layout: string;
  readyForExport: boolean;
  sheets: AdsMisSheetStatus[];
  missingBilling: Array<{
    customerCode: string;
    airlineName: string;
    reason: string;
  }>;
  summary: {
    scheduledFlights: number;
    equipmentLogEntries: number;
    priceCardAirlines: number;
    billedAirlines: number;
    adsInvoices: number;
  };
  previewSheets?: AdsMisPreviewSheet[];
};

export type AdsMisPreviewSheet = {
  id: string;
  label: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  rowKinds: Array<'airline' | 'equipment' | 'normal'>;
};
