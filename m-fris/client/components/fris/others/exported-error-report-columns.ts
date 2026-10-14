import type { NavisionExportErrorRow } from '@/lib/api';

export type ExportedErrorReportColumn = {
  key: keyof NavisionExportErrorRow;
  label: string;
  minWidth?: string;
};

export const EXPORTED_ERROR_REPORT_COLUMNS: ExportedErrorReportColumn[] = [
  { key: 'serialNo', label: 'Serial No', minWidth: '5.5rem' },
  { key: 'airline', label: 'Airline', minWidth: '7rem' },
  { key: 'flightNo', label: 'Flight No', minWidth: '6.5rem' },
  { key: 'staDate', label: 'STA Date', minWidth: '6.5rem' },
  { key: 'staTime', label: 'STA Time', minWidth: '5.5rem' },
  { key: 'stdDate', label: 'STD Date', minWidth: '6.5rem' },
  { key: 'exportedStatus', label: 'Export Status', minWidth: '6.5rem' },
  { key: 'errorMessage', label: 'Error Message', minWidth: '14rem' },
  { key: 'errorDate', label: 'Error Date', minWidth: '6.5rem' },
];
