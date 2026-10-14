import { Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import ExcelJS from 'exceljs';
import { REQUIRED_HEADERS } from '../constants/flight-import.constants';
import type { ImportValidationError } from '../utils/import-error-collector';

export interface ErrorExcelRow {
  rowNumber: number;
  raw: Record<string, string>;
  errors: ImportValidationError[];
}

@Injectable()
export class FlightImportErrorExcelService {
  private readonly outputDir = join(process.cwd(), 'public', 'imports', 'errors');

  async generateImportErrorExcel(
    importId: string,
    failedRows: ErrorExcelRow[],
  ): Promise<string> {
    await mkdir(this.outputDir, { recursive: true });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Import Errors');

    const columns = [
      ...REQUIRED_HEADERS,
      'errorColumn',
      'errorMessage',
      'rowNumber',
    ];
    sheet.addRow(columns);

    for (const failed of failedRows) {
      const primary = failed.errors[0];
      const rowValues = REQUIRED_HEADERS.map((h) => failed.raw[h] ?? '');
      sheet.addRow([
        ...rowValues,
        primary?.column ?? '',
        failed.errors.map((e) => e.message).join('; '),
        failed.rowNumber,
      ]);
    }

    sheet.getRow(1).font = { bold: true };

    const fileName = `${importId}.xlsx`;
    const absolutePath = join(this.outputDir, fileName);
    const buffer = await workbook.xlsx.writeBuffer();
    await writeFile(absolutePath, Buffer.from(buffer));

    return `/imports/errors/${fileName}`;
  }

  async generateTemplateExcel(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Additional Flights');
    sheet.addRow([...REQUIRED_HEADERS]);
    sheet.addRow([
      'Air India',
      'AI-101',
      '100001',
      'A320',
      'DEL-BOM',
      '06:30',
      'N',
      '07:15',
      'Turnaround',
      'Additional',
      'AI',
      'N',
      '09/06/2026',
      '09/06/2026',
      'International',
    ]);
    sheet.getRow(1).font = { bold: true };
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
