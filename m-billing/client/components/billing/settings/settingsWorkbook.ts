import { getExcelJSModule } from '@/lib/dynamic-imports';

export const SETTINGS_WORKBOOK_FILE = 'airport-setup-template.xlsx';
export const PROFILE_SHEET = 'Station profile';
export const TAX_SHEET = 'Tax rules';

const PROFILE_HEADERS = [
  'Legal company name',
  'GST state code',
  'Company GSTIN',
  'Registered address',
  'PAN',
  'Default payment terms',
  'Month-close lock day',
  'Invoice approval required',
  'Bank name',
  'Beneficiary name',
  'Branch address',
  'INR account number',
  'IFSC code',
  'SWIFT code',
  'Cheque payable text',
] as const;

const TAX_HEADERS = [
  'Rule code',
  'GST %',
  'Place of supply',
  'Effective from',
  'Effective to',
] as const;

const PROFILE_SAMPLE = [
  'Bird Flight Services India Pvt Ltd',
  '33',
  '33AAAAA0000A1Z5',
  'Registered address, city, PIN',
  'AAAAA0000A',
  'NET30',
  '',
  'Yes',
  'Bank name',
  'Beneficiary name',
  'Branch address',
  '000000000000',
  'SBIN0000000',
  '',
  'Payable to company legal name',
];

const TAX_SAMPLE = ['GST-AIRPORT-18', 18, 'Intra-state (CGST + SGST)', '2026-04-01', '2027-03-31'];

export type StationProfileImport = {
  companyName?: string;
  gstStateCode?: string;
  companyGstin?: string;
  companyAddress?: string;
  companyPan?: string;
  defaultPaymentTerms?: string;
  monthCloseLockDay?: string;
  approvalRequired?: boolean;
  bankName?: string;
  beneficiaryName?: string;
  branchAddress?: string;
  accountNumber?: string;
  ifscCode?: string;
  swiftCode?: string;
  chequePayableText?: string;
};

export type TaxRuleImport = {
  ruleCode: string;
  gstPercent: string;
  placeOfSupply: string;
  effectiveFrom: string;
  effectiveTo: string;
};

type ExcelCell = { value?: unknown; text?: string };

function styleHeader(sheet: {
  getRow: (n: number) => {
    height: number;
    eachCell: (fn: (cell: {
      font: unknown;
      fill: unknown;
      alignment: unknown;
      border: unknown;
    }) => void) => void;
  };
  autoFilter?: string | object;
  columns: Array<{ width?: number }>;
}) {
  const header = sheet.getRow(1);
  header.height = 32;
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
}

const CELL_BORDER = {
  top: { style: 'thin' as const, color: { argb: 'FF374151' } },
  left: { style: 'thin' as const, color: { argb: 'FF374151' } },
  bottom: { style: 'thin' as const, color: { argb: 'FF374151' } },
  right: { style: 'thin' as const, color: { argb: 'FF374151' } },
};

function outlineCells(
  sheet: { getRow: (n: number) => { getCell: (n: number) => { border: unknown } } },
  fromRow: number,
  toRow: number,
  columns: number,
) {
  for (let rowIndex = fromRow; rowIndex <= toRow; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    for (let column = 1; column <= columns; column += 1) {
      row.getCell(column).border = CELL_BORDER;
    }
  }
}

function textOf(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return isoDate(value);
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

function isoDate(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function asDate(value: unknown): string {
  const raw = textOf(value);
  if (!raw) return '';
  if (value instanceof Date) return isoDate(value);
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const utc = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return isoDate(utc);
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return raw;
}

function placeOfSupply(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized.includes('inter') || normalized.includes('igst')) return 'inter_state';
  return 'intra_state';
}

function sheetByName(workbook: { worksheets: Array<{ name: string }> }, name: string) {
  return workbook.worksheets.find((sheet) => sheet.name.trim().toLowerCase() === name.toLowerCase());
}

export async function downloadSettingsTemplate() {
  const ExcelJS = await getExcelJSModule();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FRIS Billing';

  const profile = workbook.addWorksheet(PROFILE_SHEET, {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { tabColor: { argb: 'FF1E3A5F' } },
  });
  profile.addRow([...PROFILE_HEADERS]);
  profile.addRow(PROFILE_SAMPLE);
  profile.columns = PROFILE_HEADERS.map((header) => ({
    width: Math.min(42, Math.max(18, header.length + 4)),
  }));
  styleHeader(profile);
  profile.autoFilter = 'A1:O2';
  profile.getRow(2).height = 36;
  profile.getRow(2).eachCell({ includeEmpty: true }, (cell: { alignment: unknown; font: unknown; numFmt?: string; border: unknown }, col: number) => {
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.font = { name: 'Calibri', italic: true, color: { argb: 'FF4B5563' }, size: 11 };
    cell.border = CELL_BORDER;
    if ([2, 3, 5, 12, 13, 14].includes(col)) cell.numFmt = '@';
  });
  outlineCells(profile, 2, 8, PROFILE_HEADERS.length);
  const profileSheet = profile as unknown as {
    dataValidations: { add: (ref: string, rule: object) => void };
  };
  profileSheet.dataValidations.add('H2:H20', {
    type: 'list',
    allowBlank: true,
    formulae: ['"Yes,No"'],
    showErrorMessage: true,
    errorTitle: 'Approval',
    error: 'Choose Yes or No.',
  });

  const tax = workbook.addWorksheet(TAX_SHEET, {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { tabColor: { argb: 'FF5B3A8C' } },
  });
  tax.addRow([...TAX_HEADERS]);
  tax.addRow(TAX_SAMPLE);
  tax.columns = [
    { width: 22 },
    { width: 14 },
    { width: 32 },
    { width: 18 },
    { width: 18 },
  ];
  styleHeader(tax);
  tax.autoFilter = 'A1:E2';
  tax.getRow(2).height = 22;
  tax.getColumn(2).numFmt = '0';
  tax.getColumn(4).numFmt = 'yyyy-mm-dd';
  tax.getColumn(5).numFmt = 'yyyy-mm-dd';
  tax.getRow(2).font = { name: 'Calibri', italic: true, color: { argb: 'FF4B5563' }, size: 11 };
  outlineCells(tax, 2, 12, TAX_HEADERS.length);
  const taxSheet = tax as unknown as {
    dataValidations: { add: (ref: string, rule: object) => void };
  };
  taxSheet.dataValidations.add('C2:C50', {
    type: 'list',
    allowBlank: false,
    formulae: ['"Intra-state (CGST + SGST),Inter-state (IGST)"'],
    showErrorMessage: true,
    errorTitle: 'Place of supply',
    error: 'Choose Intra-state or Inter-state.',
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = SETTINGS_WORKBOOK_FILE;
  link.click();
  URL.revokeObjectURL(url);
}

async function loadWorkbook(file: File) {
  const ExcelJS = await getExcelJSModule();
  const workbook = new ExcelJS.Workbook();
  const bytes = await file.arrayBuffer();
  await workbook.xlsx.load(bytes as never);
  return workbook;
}

export async function parseStationProfileWorkbook(file: File): Promise<StationProfileImport> {
  const workbook = await loadWorkbook(file);
  const sheet = sheetByName(workbook, PROFILE_SHEET);
  if (!sheet) {
    throw new Error(`The workbook needs a "${PROFILE_SHEET}" sheet.`);
  }
  const row = (sheet as unknown as { getRow: (n: number) => { getCell: (n: number) => ExcelCell } }).getRow(2);
  const values = PROFILE_HEADERS.map((_, index) => textOf(row.getCell(index + 1).value));
  if (values.every((value) => !value)) {
    throw new Error('The Station profile sheet has no data in row 2.');
  }
  const approval = values[7].toLowerCase();
  const imported: StationProfileImport = {};
  if (values[0]) imported.companyName = values[0];
  if (values[1]) imported.gstStateCode = values[1].replace(/\D/g, '').slice(0, 2);
  if (values[2]) imported.companyGstin = values[2];
  if (values[3]) imported.companyAddress = values[3];
  if (values[4]) imported.companyPan = values[4];
  if (values[5]) imported.defaultPaymentTerms = values[5];
  if (values[6]) imported.monthCloseLockDay = values[6].replace(/[^\d]/g, '');
  if (approval === 'yes' || approval === 'no') imported.approvalRequired = approval === 'yes';
  if (values[8]) imported.bankName = values[8];
  if (values[9]) imported.beneficiaryName = values[9];
  if (values[10]) imported.branchAddress = values[10];
  if (values[11]) imported.accountNumber = values[11];
  if (values[12]) imported.ifscCode = values[12];
  if (values[13]) imported.swiftCode = values[13];
  if (values[14]) imported.chequePayableText = values[14];
  return imported;
}

export async function parseTaxRulesWorkbook(file: File): Promise<TaxRuleImport[]> {
  const workbook = await loadWorkbook(file);
  const sheet = sheetByName(workbook, TAX_SHEET);
  if (!sheet) {
    throw new Error(`The workbook needs a "${TAX_SHEET}" sheet.`);
  }
  const typed = sheet as unknown as {
    rowCount: number;
    getRow: (n: number) => { getCell: (n: number) => ExcelCell };
  };
  const rules: TaxRuleImport[] = [];
  for (let index = 2; index <= Math.max(typed.rowCount, 2); index += 1) {
    const row = typed.getRow(index);
    const ruleCode = textOf(row.getCell(1).value);
    const gst = textOf(row.getCell(2).value);
    const place = textOf(row.getCell(3).value);
    const from = asDate(row.getCell(4).value);
    const to = asDate(row.getCell(5).value);
    if (!ruleCode && !gst && !place && !from && !to) continue;
    if (!ruleCode || !gst || !from || !to) {
      throw new Error(`Tax rules row ${index} needs a rule code, GST %, effective from, and effective to.`);
    }
    rules.push({
      ruleCode,
      gstPercent: gst.replace(/[^\d.]/g, ''),
      placeOfSupply: placeOfSupply(place),
      effectiveFrom: from,
      effectiveTo: to,
    });
  }
  if (rules.length === 0) {
    throw new Error('The Tax rules sheet has no data rows.');
  }
  return rules;
}
