import { getExcelJSModule } from '@/lib/dynamic-imports';

const HEADERS = [
  'Code',
  'Airline name',
  'Currency',
  'PAN on invoice',
  'VAT on invoice',
] as const;

export type CustomerImportRow = {
  customerCode: string;
  name: string;
  currencyCode: 'INR' | 'USD';
  showPanOnInvoice: boolean;
  showVatOnInvoice: boolean;
};

function textOf(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const record = value as { text?: string; result?: unknown; richText?: Array<{ text?: string }> };
    if (typeof record.text === 'string') return record.text.trim();
    if (record.result != null) return textOf(record.result);
    if (Array.isArray(record.richText)) {
      return record.richText.map((part) => part.text ?? '').join('').trim();
    }
  }
  return String(value).trim();
}

function yesNo(value: string, row: number, column: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'yes') return true;
  if (normalized === 'no') return false;
  throw new Error(
    `Row ${row}, ${column}: write Yes or No. "${value || '(blank)'}" is not accepted.`,
  );
}

export async function downloadCustomerTemplate() {
  const ExcelJS = await getExcelJSModule();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Customers', {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { tabColor: { argb: 'FF1E3A5F' } },
  });
  sheet.addRow([...HEADERS]);
  sheet.addRow(['QP', 'Akasa Air', 'INR', 'No', 'No']);
  sheet.columns = HEADERS.map((header) => ({ width: Math.max(18, header.length + 6) }));
  const header = sheet.getRow(1);
  header.height = 28;
  header.eachCell((cell) => {
    cell.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      right: { style: 'thin', color: { argb: 'FFFFFFFF' } },
    };
  });
  const border = {
    top: { style: 'thin' as const, color: { argb: 'FF374151' } },
    left: { style: 'thin' as const, color: { argb: 'FF374151' } },
    bottom: { style: 'thin' as const, color: { argb: 'FF374151' } },
    right: { style: 'thin' as const, color: { argb: 'FF374151' } },
  };
  for (let rowIndex = 2; rowIndex <= 8; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    row.height = 22;
    for (let column = 1; column <= HEADERS.length; column += 1) {
      const cell = row.getCell(column);
      cell.border = border;
      cell.alignment = { vertical: 'middle' };
    }
  }
  const validations = sheet as unknown as {
    dataValidations: { add: (ref: string, rule: object) => void };
  };
  validations.dataValidations.add('C2:C200', {
    type: 'list',
    allowBlank: false,
    formulae: ['"INR,USD"'],
  });
  validations.dataValidations.add('D2:E200', {
    type: 'list',
    allowBlank: false,
    formulae: ['"Yes,No"'],
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'billing-customers-template.xlsx';
  link.click();
  URL.revokeObjectURL(url);
}

export async function parseCustomerWorkbook(file: File): Promise<CustomerImportRow[]> {
  const name = file.name.toLowerCase();
  if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
    throw new Error('Upload an Excel workbook (.xlsx). The customer template is .xlsx.');
  }
  const ExcelJS = await getExcelJSModule();
  const workbook = new ExcelJS.Workbook();
  const bytes = await file.arrayBuffer();
  try {
    await workbook.xlsx.load(bytes as never);
  } catch {
    throw new Error('This file could not be read as an Excel workbook. Download the template and use that file.');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('The workbook has no sheets.');

  const headerRow = sheet.getRow(1);
  const headers = HEADERS.map((_, index) => textOf(headerRow.getCell(index + 1).value));
  const mismatches = HEADERS.filter((expected, index) => headers[index].toLowerCase() !== expected.toLowerCase());
  if (mismatches.length > 0) {
    throw new Error(
      `The header row must be: ${HEADERS.join(', ')}. Found: ${headers.filter(Boolean).join(', ') || '(empty)'}.`,
    );
  }

  const rows: CustomerImportRow[] = [];
  const seen = new Map<string, number>();
  const errors: string[] = [];
  for (let index = 2; index <= sheet.rowCount; index += 1) {
    const row = sheet.getRow(index);
    const code = textOf(row.getCell(1).value).toUpperCase();
    const airline = textOf(row.getCell(2).value);
    const currency = textOf(row.getCell(3).value).toUpperCase();
    const pan = textOf(row.getCell(4).value);
    const vat = textOf(row.getCell(5).value);
    if (!code && !airline && !currency && !pan && !vat) continue;
    if (!code) errors.push(`Row ${index}: Code is required.`);
    else if (code.length > 10) errors.push(`Row ${index}: Code "${code}" is longer than 10 characters.`);
    else if (seen.has(code)) errors.push(`Row ${index}: Code ${code} is repeated (first used on row ${seen.get(code)}).`);
    else seen.set(code, index);
    if (!airline) errors.push(`Row ${index}: Airline name is required.`);
    if (currency !== 'INR' && currency !== 'USD') {
      errors.push(`Row ${index}: Currency must be INR or USD. "${currency || '(blank)'}" is not a billing currency.`);
    }
    let showPan = false;
    let showVat = false;
    try {
      showPan = yesNo(pan, index, 'PAN on invoice');
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Row ${index}: PAN on invoice must be Yes or No.`);
    }
    try {
      showVat = yesNo(vat, index, 'VAT on invoice');
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Row ${index}: VAT on invoice must be Yes or No.`);
    }
    if (code && airline && (currency === 'INR' || currency === 'USD') && (pan.toLowerCase() === 'yes' || pan.toLowerCase() === 'no') && (vat.toLowerCase() === 'yes' || vat.toLowerCase() === 'no')) {
      rows.push({
        customerCode: code,
        name: airline,
        currencyCode: currency,
        showPanOnInvoice: showPan,
        showVatOnInvoice: showVat,
      });
    }
  }
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
  if (rows.length === 0) {
    throw new Error('The sheet has a header but no customer rows. Add one row per airline under the header.');
  }
  return rows;
}
