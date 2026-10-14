import {
  DEFAULT_EXPORT_LOG_TYPE,
  EXPORT_LOG_TYPE_OPTIONS,
  type ExportLogType,
} from '@/components/fris/others/exported-data-log-type-options';

export type { ExportLogType };
export { DEFAULT_EXPORT_LOG_TYPE, EXPORT_LOG_TYPE_OPTIONS };

export type ExportLogRow = {
  serialNo: string;
  flightNo: string;
  airline: string;
  exportType: string;
  exportedBy: string;
  exportedDate: string;
  exportedStatus: string;
};

export const EXPORT_LOG_TABLE_COLUMNS: {
  key: keyof ExportLogRow;
  header: string;
}[] = [
  { key: 'serialNo', header: 'Serial No' },
  { key: 'flightNo', header: 'Flight No' },
  { key: 'airline', header: 'Airline' },
  { key: 'exportType', header: 'Export Type' },
  { key: 'exportedBy', header: 'Exported By' },
  { key: 'exportedDate', header: 'Exported Date' },
  { key: 'exportedStatus', header: 'Exported Status' },
];

export function exportLogTypeLabel(value: string): string {
  return value.trim() || DEFAULT_EXPORT_LOG_TYPE;
}
