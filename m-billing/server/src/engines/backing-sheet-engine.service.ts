import { Injectable } from '@nestjs/common';
import { mapFhrToInvoicingFlightReportRow } from '../utils/invoicing-flight-report.mapper';

export interface BackingLineInput {
  serialNo?: string;
  operationalSnapshot?: Record<string, unknown>;
}

@Injectable()
export class BackingSheetEngineService {
  buildRows(lines: BackingLineInput[]): Array<Record<string, unknown>> {
    const rows: Array<Record<string, unknown>> = [];

    for (const line of lines) {
      const serial = parseInt(String(line.serialNo ?? '0'), 10);
      const snap = line.operationalSnapshot ?? {};
      const fhr = (snap.fhr as Record<string, unknown>) ?? snap;
      const daily = (snap.dailyData as Record<string, unknown>) ?? snap;

      rows.push(
        mapFhrToInvoicingFlightReportRow(
          Number.isFinite(serial) ? serial : 0,
          fhr,
          daily,
        ),
      );
    }

    return rows;
  }
}
