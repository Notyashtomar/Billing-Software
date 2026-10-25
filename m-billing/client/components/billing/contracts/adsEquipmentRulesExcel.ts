import { getExcelJSModule, getFileSaverSaveAs } from '@/lib/dynamic-imports';
import type { BillingContractAdsEquipmentRule } from '@/lib/billing-shared/types';
import {
  ADS_WCHR_S_SERVICE_CODE,
  adsEquipmentIdentity,
  canonicalizeWchrSServiceCode,
  isWchrSCombinedAdsService,
} from '@/lib/billing-shared/ads-equipment-rules-validity';

export const ADS_EQUIPMENT_RULE_EXCEL_HEADERS = [
  'Equipment / service',
  'FOC',
  'FOC NB',
  'FOC WB',
  'Always bill',
  'UOM',
  'INR',
  'USD',
  'Aircraft',
] as const;

const ADS_EQUIPMENT_RULE_EXCEL_HEADERS_LEGACY = [
  'Equipment / service',
  'Free / flight',
  'Free / flight NB',
  'Free / flight WB',
  'Charge on ADS',
  'Always bill',
  'UOM',
  'INR',
  'USD',
  'Aircraft',
] as const;

export const ADS_EQUIPMENT_RULES_EMPTY_EXPORT_MESSAGE =
  'Add at least one equipment rule before exporting.';

export const ADS_EQUIPMENT_RULES_INVALID_EXCEL_MESSAGE =
  'This file is not a valid ADS equipment rules workbook. Export the table first, edit that Excel file, then upload it.';

type CatalogOption = { value: string; label: string };

function textOf(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'object') {
    const record = value as {
      text?: string;
      result?: unknown;
      richText?: Array<{ text?: string }>;
    };
    if (typeof record.text === 'string') return record.text.trim();
    if (record.result != null) return textOf(record.result);
    if (Array.isArray(record.richText)) {
      return record.richText.map((part) => part.text ?? '').join('').trim();
    }
  }
  return String(value).trim();
}

function sanitizeFilePart(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function adsEquipmentRulesExcelFileName(
  airlineName: string,
  airlineCode: string,
): string {
  const name = sanitizeFilePart(airlineName) || 'Airline';
  const code = sanitizeFilePart(airlineCode) || 'XX';
  return `${name}(${code})-ads-equipments.xlsx`;
}

function yesNoCell(value: boolean): 'Yes' | 'No' {
  return value ? 'Yes' : 'No';
}

function parseYesNo(raw: string, row: number, column: string): boolean {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'yes' || normalized === 'y' || normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'no' || normalized === 'n' || normalized === 'false' || normalized === '0') {
    return false;
  }
  throw new Error(`Row ${row}, ${column}: write Yes or No. "${raw || '(blank)'}" is not accepted.`);
}

function parseOptionalYesNo(raw: string, row: number, column: string, fallback: boolean): boolean {
  if (!raw.trim()) return fallback;
  return parseYesNo(raw, row, column);
}

function parseOptionalNumber(raw: string, row: number, column: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Row ${row}, ${column}: enter a number 0 or greater. "${raw}" is not accepted.`);
  }
  return n;
}

function parseOptionalWhole(raw: string, row: number, column: string): number | undefined {
  const n = parseOptionalNumber(raw, row, column);
  if (n == null) return undefined;
  return Math.floor(n);
}

function parseAircraft(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,;/|]+/)
        .map((part) => part.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
}

export function resolveImportedEquipmentName(
  raw: string,
  options: CatalogOption[],
): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  const byValue = options.find((option) => option.value.trim().toLowerCase() === lower);
  if (byValue) return canonicalizeWchrSServiceCode(byValue.value) || byValue.value;
  const byLabel = options.find((option) => option.label.trim().toLowerCase() === lower);
  if (byLabel) return canonicalizeWchrSServiceCode(byLabel.value) || byLabel.value;
  if (isWchrSCombinedAdsService(trimmed)) return ADS_WCHR_S_SERVICE_CODE;
  return trimmed;
}

function equipmentLabel(
  serviceCode: string,
  options: CatalogOption[],
): string {
  const code = serviceCode.trim();
  if (!code) return '';
  if (isWchrSCombinedAdsService(code)) return ADS_WCHR_S_SERVICE_CODE;
  return options.find((option) => option.value === code)?.label || code;
}

function toBlob(buffer: ArrayBuffer | ArrayBufferView): Blob {
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const plain = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Blob([plain], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export async function exportAdsEquipmentRulesExcel(opts: {
  rules: BillingContractAdsEquipmentRule[];
  catalogOptions: CatalogOption[];
  airlineName: string;
  airlineCode: string;
}): Promise<void> {
  const rows = opts.rules
    .filter((rule) => String(rule.serviceCode ?? '').trim())
    .sort((a, b) =>
      equipmentLabel(String(a.serviceCode ?? ''), opts.catalogOptions).localeCompare(
        equipmentLabel(String(b.serviceCode ?? ''), opts.catalogOptions),
        undefined,
        { sensitivity: 'base', numeric: true },
      ),
    );
  if (rows.length === 0) {
    throw new Error(ADS_EQUIPMENT_RULES_EMPTY_EXPORT_MESSAGE);
  }

  const ExcelJS = await getExcelJSModule();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FRIS Billing';
  const sheet = workbook.addWorksheet('ADS equipment rules', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const headerRow = sheet.addRow([...ADS_EQUIPMENT_RULE_EXCEL_HEADERS]);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C0770' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF111827' } },
      left: { style: 'thin', color: { argb: 'FF111827' } },
      bottom: { style: 'thin', color: { argb: 'FF111827' } },
      right: { style: 'thin', color: { argb: 'FF111827' } },
    };
  });

  const border = {
    top: { style: 'thin' as const, color: { argb: 'FF374151' } },
    left: { style: 'thin' as const, color: { argb: 'FF374151' } },
    bottom: { style: 'thin' as const, color: { argb: 'FF374151' } },
    right: { style: 'thin' as const, color: { argb: 'FF374151' } },
  };

  for (const rule of rows) {
    const aircraft =
      Array.isArray(rule.aircraftTypes) && rule.aircraftTypes.length > 0
        ? rule.aircraftTypes.map((ac) => String(ac ?? '').trim()).filter(Boolean).join(', ')
        : String(rule.aircraftType ?? '').trim();
    const excelRow = sheet.addRow([
      equipmentLabel(String(rule.serviceCode ?? ''), opts.catalogOptions),
      rule.freePerFlight ?? '',
      rule.freePerFlightNb ?? '',
      rule.freePerFlightWb ?? '',
      yesNoCell(Boolean(rule.alwaysChargeable)),
      String(rule.uom ?? '').trim(),
      rule.unitPriceINR ?? '',
      rule.unitPriceUSD ?? '',
      aircraft,
    ]);
    excelRow.height = 22;
    excelRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: false };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = border;
    });
  }

  sheet.columns = ADS_EQUIPMENT_RULE_EXCEL_HEADERS.map((header) => ({
    width: Math.max(18, header.length + 8),
  }));
  sheet.getColumn(1).width = 36;
  sheet.getColumn(2).width = 12;
  sheet.getColumn(9).width = 28;

  const validations = sheet as unknown as {
    dataValidations: { add: (ref: string, rule: object) => void };
  };
  validations.dataValidations.add('E2:E2000', {
    type: 'list',
    allowBlank: false,
    formulae: ['"Yes,No"'],
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const saveAs = await getFileSaverSaveAs();
  saveAs(
    toBlob(buffer instanceof ArrayBuffer ? buffer : (buffer as ArrayBufferView)),
    adsEquipmentRulesExcelFileName(opts.airlineName, opts.airlineCode),
  );
}

export async function parseAdsEquipmentRulesWorkbook(
  file: File,
  catalogOptions: CatalogOption[],
): Promise<BillingContractAdsEquipmentRule[]> {
  const name = String(file?.name ?? '').toLowerCase();
  if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
    throw new Error(ADS_EQUIPMENT_RULES_INVALID_EXCEL_MESSAGE);
  }

  const ExcelJS = await getExcelJSModule();
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load((await file.arrayBuffer()) as never);
  } catch {
    throw new Error(ADS_EQUIPMENT_RULES_INVALID_EXCEL_MESSAGE);
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error(ADS_EQUIPMENT_RULES_INVALID_EXCEL_MESSAGE);

  const headerRow = sheet.getRow(1);
  const currentHeaders = ADS_EQUIPMENT_RULE_EXCEL_HEADERS.map((_, index) =>
    textOf(headerRow.getCell(index + 1).value),
  );
  const legacyHeaders = ADS_EQUIPMENT_RULE_EXCEL_HEADERS_LEGACY.map((_, index) =>
    textOf(headerRow.getCell(index + 1).value),
  );
  const matchesCurrent = ADS_EQUIPMENT_RULE_EXCEL_HEADERS.every(
    (expected, index) => currentHeaders[index].toLowerCase() === expected.toLowerCase(),
  );
  const matchesLegacy = ADS_EQUIPMENT_RULE_EXCEL_HEADERS_LEGACY.every(
    (expected, index) => legacyHeaders[index].toLowerCase() === expected.toLowerCase(),
  );
  if (!matchesCurrent && !matchesLegacy) {
    throw new Error(
      `${ADS_EQUIPMENT_RULES_INVALID_EXCEL_MESSAGE} Header row must be: ${ADS_EQUIPMENT_RULE_EXCEL_HEADERS.join(', ')}.`,
    );
  }
  const usingLegacy = matchesLegacy && !matchesCurrent;
  const columnCount = usingLegacy
    ? ADS_EQUIPMENT_RULE_EXCEL_HEADERS_LEGACY.length
    : ADS_EQUIPMENT_RULE_EXCEL_HEADERS.length;

  const rules: BillingContractAdsEquipmentRule[] = [];
  const seen = new Map<string, number>();
  const errors: string[] = [];

  for (let index = 2; index <= sheet.rowCount; index += 1) {
    const row = sheet.getRow(index);
    const cells = Array.from({ length: columnCount }, (_, col) =>
      textOf(row.getCell(col + 1).value),
    );
    if (cells.every((cell) => cell === '')) continue;

    const equipmentRaw = cells[0] ?? '';
    const serviceCode = resolveImportedEquipmentName(equipmentRaw, catalogOptions);
    if (!serviceCode) {
      errors.push(`Row ${index}: Equipment / service is required.`);
      continue;
    }
    const identity = adsEquipmentIdentity(serviceCode);
    if (seen.has(identity)) {
      errors.push(
        `Row ${index}: "${equipmentRaw}" is repeated (first used on row ${seen.get(identity)}).`,
      );
      continue;
    }
    seen.set(identity, index);

    try {
      const freePerFlight = parseOptionalWhole(cells[1] ?? '', index, 'FOC');
      const freePerFlightNb = parseOptionalWhole(cells[2] ?? '', index, 'FOC NB');
      const freePerFlightWb = parseOptionalWhole(cells[3] ?? '', index, 'FOC WB');
      const alwaysChargeable = parseOptionalYesNo(
        cells[usingLegacy ? 5 : 4] ?? '',
        index,
        'Always bill',
        false,
      );
      const uomIndex = usingLegacy ? 6 : 5;
      const inrIndex = usingLegacy ? 7 : 6;
      const usdIndex = usingLegacy ? 8 : 7;
      const aircraftIndex = usingLegacy ? 9 : 8;
      const unitPriceINR = parseOptionalNumber(cells[inrIndex] ?? '', index, 'INR');
      const unitPriceUSD = parseOptionalNumber(cells[usdIndex] ?? '', index, 'USD');
      rules.push({
        serviceCode: canonicalizeWchrSServiceCode(serviceCode) || serviceCode,
        freePerFlight: alwaysChargeable ? 0 : freePerFlight ?? 0,
        freePerFlightNb: alwaysChargeable ? 0 : freePerFlightNb,
        freePerFlightWb: alwaysChargeable ? 0 : freePerFlightWb,
        includedForAds: true,
        alwaysChargeable,
        uom: (cells[uomIndex] ?? '').trim() || 'EA',
        unitPriceINR,
        unitPriceUSD,
        aircraftTypes: parseAircraft(cells[aircraftIndex] ?? ''),
        aircraftType: undefined,
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Row ${index}: could not read this line.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
  if (rules.length === 0) {
    throw new Error(
      'The sheet has a header but no equipment rows. Add one row per equipment under the header.',
    );
  }
  return rules;
}
