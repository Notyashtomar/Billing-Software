export type InvoicePendingColumn = {
  key: keyof InvoicePendingRow;
  label: string;
  minWidth?: string;
};

export type InvoicePendingRow = {
  slNo: string;
  airline: string;
  flightNo: string;
  regn: string;
  cargo: string;
  route: string;
  typeCraft: string;
  staDate: string;
  staTime: string;
  stdDate: string;
  stdTime: string;
  ataDate: string;
  ataTime: string;
  atdDate: string;
  atdTime: string;
  exportedStatus: string;
  exportedBy: string;
  exportedDate: string;
};

export const INVOICE_PENDING_COLUMNS: InvoicePendingColumn[] = [
  { key: 'slNo', label: 'Sl.No', minWidth: '4.5rem' },
  { key: 'airline', label: 'Airline', minWidth: '7rem' },
  { key: 'flightNo', label: 'Flight No', minWidth: '6.5rem' },
  { key: 'regn', label: 'Regn', minWidth: '5rem' },
  { key: 'cargo', label: 'Cargo', minWidth: '4.5rem' },
  { key: 'route', label: 'Route', minWidth: '5rem' },
  { key: 'typeCraft', label: 'Type Craft', minWidth: '6rem' },
  { key: 'staDate', label: 'STA Date', minWidth: '6.5rem' },
  { key: 'staTime', label: 'STA Time', minWidth: '5.5rem' },
  { key: 'stdDate', label: 'STD Date', minWidth: '6.5rem' },
  { key: 'stdTime', label: 'STD Time', minWidth: '5.5rem' },
  { key: 'ataDate', label: 'ATA Date', minWidth: '6.5rem' },
  { key: 'ataTime', label: 'ATA Time', minWidth: '5.5rem' },
  { key: 'atdDate', label: 'ATD Date', minWidth: '6.5rem' },
  { key: 'atdTime', label: 'ATD Time', minWidth: '5.5rem' },
  { key: 'exportedStatus', label: 'Exported Status', minWidth: '7rem' },
  { key: 'exportedBy', label: 'Exported By', minWidth: '6.5rem' },
  { key: 'exportedDate', label: 'Exported Date', minWidth: '7rem' },
];

export type InvoicePendingFlightTypeFilter = 'scheduled' | 'non-scheduled' | 'all';

export const INVOICE_PENDING_FLIGHT_TYPE_OPTIONS: {
  value: InvoicePendingFlightTypeFilter;
  label: string;
}[] = [
  { value: 'scheduled', label: 'Scheduled Flight' },
  { value: 'non-scheduled', label: 'Non-Scheduled Flight' },
  { value: 'all', label: 'All Flights' },
];
