import { getFileSaverSaveAs, getXLSXModule } from '@/lib/dynamic-imports';
import type { AddPassengerSearchRecord } from './add-passenger-record';
import {
  BOOKING_RECORD_COLUMNS,
  bookingRecordCellValue,
} from './booking-record-columns';

export async function exportBookingRecordsToExcel(
  records: AddPassengerSearchRecord[],
  fileNamePrefix = 'non-scheduled-booking-report',
): Promise<void> {
  if (records.length === 0) return;

  const XLSX = await getXLSXModule();
  const headers = BOOKING_RECORD_COLUMNS.map((col) => col.label);
  const rows = records.map((record) =>
    BOOKING_RECORD_COLUMNS.map((col) =>
      String(bookingRecordCellValue(record, col.key, 0)),
    ),
  );

  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Report');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const ts = new Date().toISOString().slice(0, 10);
  const saveAs = await getFileSaverSaveAs();
  saveAs(blob, `${fileNamePrefix}_${ts}.xlsx`);
}
