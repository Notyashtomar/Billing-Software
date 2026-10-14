// @ts-nocheck
import type { CellValue } from 'exceljs';
import { getExcelJSModule, getFileSaverSaveAs } from '@/lib/dynamic-imports';
import {
  CONTRACT_CLAUSE_APPLIES_TO_OPTIONS,
  CONTRACT_CLAUSE_TYPE_OPTIONS,
} from '@/lib/billing-shared/contract-clauses';
import type {
  BillingContractAdsEquipmentRule,
  BillingContractClause,
  BillingContractConditionalCharges,
} from '@/lib/billing-shared/types';
import { normalizeAdsEffectiveMonth } from '@/lib/billing-shared/ads-effective-month';
import { isWheelchairAdsService } from './ContractAdsEquipmentRulesEditor';
import { sanitizeContractAircraftTypes } from './sanitizeContractAircraftTypes';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_CONTRACT_ROWS = 200;
const MAX_ADS_RULE_ROWS = 2000;
const MAX_CLAUSE_ROWS = 500;

export const CONTRACT_SHEET_HEADERS = [
  'Contract Number',
  'Customer Code',
  'Category',
  'Aircraft Types',
  'Price Valid From',
  'Price Valid To',
  'Cancellation Within Hours',
  'Diverted Dom %',
  'Diverted Int %',
  'Return To Ramp %',
  'Cancel Window %',
  'Technical Handling %',
  'Standby %',
  'FILO LIFO %',
  'Status',
  'ADS Billing Enabled',
] as const;

export const ADS_RULE_SHEET_HEADERS = [
  'Contract Number',
  'Service Code',
  'Included For ADS',
  'Free Per Flight',
  'Free Per Flight NB',
  'Free Per Flight WB',
  'Always Chargeable',
  'UOM',
  'Unit Price INR',
  'Unit Price USD',
  'Aircraft Types',
  'Effective Month',
  'Category',
  'Remarks',
] as const;

export const CLAUSE_SHEET_HEADERS = [
  'Contract Number',
  'Clause Type',
  'Label',
  'Body',
  'Applies To',
] as const;

export type ContractExcelCreatePayload = {
  contractNumber: string;
  customerCode?: string;
  category?: 'Dom' | 'Int' | 'Both';
  priceValidFrom?: string;
  priceValidTo?: string;
  aircraftTypes?: string[];
  cancellationWithinHours?: number;
  conditionalCharges?: BillingContractConditionalCharges;
  clauses?: BillingContractClause[];
  adsBillingEnabled?: boolean;
  adsEquipmentRules?: BillingContractAdsEquipmentRule[];
  activate?: boolean;
  hasContractsSheetData?: boolean;
};

export type ParsedContractExcelRow = {
  rowNumber: number;
  payload: ContractExcelCreatePayload;
};

export type ContractExcelParseResult = {
  rows: ParsedContractExcelRow[];
  errors: Array<{ rowNumber: number; reason: string }>;
};

type SheetColumnMap = Map<string, number>;

const VALID_CLAUSE_TYPES = new Set<string>([
  ...CONTRACT_CLAUSE_TYPE_OPTIONS.map((option) => option.value),
  'ferry',
  'technical_landing',
  'return_to_ramp',
  'equipment_standby',
  'disbursements',
]);

const VALID_APPLIES_TO = new Set<string>(
  CONTRACT_CLAUSE_APPLIES_TO_OPTIONS.map((option) => option.value),
);

const CONTRACT_REQUIRED_HEADERS = [
  'contract number',
  'customer code',
  'category',
  'price valid from',
  'price valid to',
] as const;

const CONTRACT_HEADER_ALIASES: Record<string, string> = {
  'contract no': 'contract number',
  'contract #': 'contract number',
  'customer': 'customer code',
  'airline': 'customer code',
  'airline code': 'customer code',
  'dom int': 'category',
  'valid from': 'price valid from',
  'valid to': 'price valid to',
  'price valid from date': 'price valid from',
  'price valid to date': 'price valid to',
  'cancellation hours': 'cancellation within hours',
  'diverted domestic': 'diverted dom %',
  'diverted dom': 'diverted dom %',
  'diverted international': 'diverted int %',
  'diverted int': 'diverted int %',
  'return to ramp': 'return to ramp %',
  'rtr': 'return to ramp %',
  'cancel %': 'cancel window %',
  'cancellation %': 'cancel window %',
  'cancellation within hours %': 'cancel window %',
  'technical handling': 'technical handling %',
  'standby charges': 'standby %',
  'filo lifo': 'filo lifo %',
  'filo/lifo': 'filo lifo %',
  'filo lifo charges': 'filo lifo %',
  'filo / lifo %': 'filo lifo %',
  'ads enabled': 'ads billing enabled',
  'ads billing': 'ads billing enabled',
};

const ADS_RULE_HEADER_ALIASES: Record<string, string> = {
  'service': 'service code',
  'equipment': 'service code',
  'equipment service': 'service code',
  'equipment / service': 'service code',
  'equipment/service': 'service code',
  'service code': 'service code',
  'included for ads': 'included for ads',
  'included for ads?': 'included for ads',
  'included': 'included for ads',
  'free per flight': 'free per flight',
  'free / flight': 'free per flight',
  'free/flight': 'free per flight',
  'free qty': 'free per flight',
  'free units': 'free per flight',
  'free per flight nb': 'free per flight nb',
  'free per flight wb': 'free per flight wb',
  'always bill': 'always chargeable',
  'always chargeable': 'always chargeable',
  'always charge': 'always chargeable',
  'uom': 'uom',
  'unit price inr': 'unit price inr',
  'inr': 'unit price inr',
  'unit price usd': 'unit price usd',
  'usd': 'unit price usd',
  'aircraft': 'aircraft types',
  'aircraft types': 'aircraft types',
  'effective month': 'effective month',
  'effective month yyyy mm': 'effective month',
  'category': 'category',
  'remarks': 'remarks',
  'remarks notes': 'remarks',
};

const CLAUSE_HEADER_ALIASES: Record<string, string> = {
  'type': 'clause type',
  'clause': 'clause type',
  'applies': 'applies to',
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function resolveHeader(
  normalized: string,
  aliases: Record<string, string>,
): string {
  if (!normalized) return '';
  return aliases[normalized] ?? normalized;
}

function cellToString(value: CellValue): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? '').join('').trim();
    }
    if ('text' in value && value.text != null) return String(value.text).trim();
    if ('result' in value && value.result != null) {
      return cellToString(value.result as CellValue);
    }
  }
  return String(value).trim();
}

function parseExcelDate(value: CellValue): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const str = cellToString(value);
  if (!str) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  if (/^\d+(\.\d+)?$/.test(str)) {
    const serial = Number(str);
    const date = new Date(Date.UTC(1899, 11, 30 + Math.floor(serial)));
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return str;
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

function parseBoolean(value: string, defaultValue = false): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (['yes', 'y', 'true', '1', 'active'].includes(normalized)) return true;
  if (['no', 'n', 'false', '0', 'inactive', 'draft'].includes(normalized)) return false;
  return defaultValue;
}

function parseOptionalPercent(value: string): number | undefined {
  const trimmed = value.trim().replace(/%$/, '');
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 100) return undefined;
  return n;
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function parseOptionalInt(value: string): number | undefined {
  const n = parseOptionalNumber(value);
  if (n == null || !Number.isInteger(n) || n < 0) return undefined;
  return n;
}

function parseList(value: string): string[] {
  return value
    .split(/[,;|\n\r]+|\s+\/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseCategory(value: string): 'Dom' | 'Int' | 'Both' | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'dom' || normalized === 'domestic' || normalized === 'd') return 'Dom';
  if (normalized === 'int' || normalized === 'international' || normalized === 'i') return 'Int';
  if (
    normalized === 'both' ||
    normalized === 'all' ||
    normalized === 'dom & int' ||
    normalized === 'dom and int' ||
    normalized === 'domestic & international'
  ) {
    return 'Both';
  }
  return null;
}

function parseContractStatus(value: string): 'draft' | 'active' {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return 'active';
  if (normalized === 'draft') return 'draft';
  if (['active', 'yes', 'y', 'true', '1'].includes(normalized)) return 'active';
  return 'draft';
}

function buildColumnMap(
  sheet: import('exceljs').Worksheet,
  aliases: Record<string, string>,
): SheetColumnMap {
  const columns = new Map<string, number>();
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const normalized = normalizeHeader(cellToString(cell.value));
    const canonical = resolveHeader(normalized, aliases);
    if (canonical) columns.set(canonical, columnNumber);
  });
  return columns;
}

function sheetValue(
  sheet: import('exceljs').Worksheet,
  rowNumber: number,
  columns: SheetColumnMap,
  header: string,
): string {
  const column = columns.get(header);
  if (!column) return '';
  return cellToString(sheet.getRow(rowNumber).getCell(column).value);
}

function sheetDateValue(
  sheet: import('exceljs').Worksheet,
  rowNumber: number,
  columns: SheetColumnMap,
  header: string,
): string {
  const column = columns.get(header);
  if (!column) return '';
  return parseExcelDate(sheet.getRow(rowNumber).getCell(column).value as CellValue);
}

function rowHasData(
  sheet: import('exceljs').Worksheet,
  rowNumber: number,
  columns: SheetColumnMap,
): boolean {
  return [...columns.values()].some(
    (column) => cellToString(sheet.getRow(rowNumber).getCell(column).value) !== '',
  );
}

function findSheet(
  workbook: import('exceljs').Workbook,
  names: string[],
): import('exceljs').Worksheet | undefined {
  const targets = names.map((name) => normalizeHeader(name));
  for (const sheet of workbook.worksheets) {
    const sheetName = normalizeHeader(sheet.name);
    if (targets.includes(sheetName)) return sheet;
  }
  return undefined;
}

function parseAdsRulesSheet(
  sheet: import('exceljs').Worksheet | undefined,
): {
  rulesByContract: Map<string, BillingContractAdsEquipmentRule[]>;
  errors: Array<{ rowNumber: number; reason: string }>;
} {
  const rulesByContract = new Map<string, BillingContractAdsEquipmentRule[]>();
  const errors: Array<{ rowNumber: number; reason: string }> = [];
  if (!sheet || sheet.rowCount < 2) return { rulesByContract, errors };

  const columns = buildColumnMap(sheet, ADS_RULE_HEADER_ALIASES);
  if (!columns.has('contract number')) return { rulesByContract, errors };

  let parsedRows = 0;
  for (
    let rowNumber = 2;
    rowNumber <= sheet.rowCount && parsedRows < MAX_ADS_RULE_ROWS;
    rowNumber += 1
  ) {
    if (!rowHasData(sheet, rowNumber, columns)) continue;
    parsedRows += 1;

    const contractNumber = sheetValue(sheet, rowNumber, columns, 'contract number')
      .trim()
      .toUpperCase();
    const serviceCode = sheetValue(sheet, rowNumber, columns, 'service code').trim();
    if (!contractNumber) {
      errors.push({ rowNumber, reason: 'ADS rule row missing contract number.' });
      continue;
    }
    if (!serviceCode) {
      errors.push({ rowNumber, reason: 'ADS rule row missing service code.' });
      continue;
    }

    const includedForAds = parseBoolean(
      sheetValue(sheet, rowNumber, columns, 'included for ads'),
      true,
    );
    const alwaysChargeable = parseBoolean(
      sheetValue(sheet, rowNumber, columns, 'always chargeable'),
      false,
    );
    const freePerFlightRaw = parseOptionalInt(
      sheetValue(sheet, rowNumber, columns, 'free per flight'),
    );
    const freePerFlightNbRaw = parseOptionalInt(
      sheetValue(sheet, rowNumber, columns, 'free per flight nb'),
    );
    const freePerFlightWbRaw = parseOptionalInt(
      sheetValue(sheet, rowNumber, columns, 'free per flight wb'),
    );
    const aircraftTypes = sanitizeContractAircraftTypes(
      parseList(sheetValue(sheet, rowNumber, columns, 'aircraft types')).map((value) =>
        value.toUpperCase(),
      ),
    );

    const rule: BillingContractAdsEquipmentRule = {
      serviceCode,
      includedForAds,
      alwaysChargeable,
      freePerFlight:
        includedForAds === false || alwaysChargeable
          ? 0
          : freePerFlightRaw ?? 0,
      freePerFlightNb:
        includedForAds === false || alwaysChargeable
          ? 0
          : freePerFlightNbRaw ??
            (isWheelchairAdsService(serviceCode) ? freePerFlightRaw : undefined),
      freePerFlightWb:
        includedForAds === false || alwaysChargeable
          ? 0
          : freePerFlightWbRaw ??
            (isWheelchairAdsService(serviceCode) ? freePerFlightRaw : undefined),
      unitPriceINR: parseOptionalNumber(
        sheetValue(sheet, rowNumber, columns, 'unit price inr'),
      ),
      unitPriceUSD: parseOptionalNumber(
        sheetValue(sheet, rowNumber, columns, 'unit price usd'),
      ),
      uom: sheetValue(sheet, rowNumber, columns, 'uom').trim() || 'EA',
      aircraftTypes,
      effectiveMonth: normalizeAdsEffectiveMonth(
        sheetValue(sheet, rowNumber, columns, 'effective month').trim(),
      ),
      category: sheetValue(sheet, rowNumber, columns, 'category').trim() || undefined,
      remarks: sheetValue(sheet, rowNumber, columns, 'remarks').trim() || undefined,
    };

    const key = contractNumber;
    const list = rulesByContract.get(key) ?? [];
    list.push(rule);
    rulesByContract.set(key, list);
  }

  return { rulesByContract, errors };
}

function parseClausesSheet(
  sheet: import('exceljs').Worksheet | undefined,
): {
  clausesByContract: Map<string, BillingContractClause[]>;
  errors: Array<{ rowNumber: number; reason: string }>;
} {
  const clausesByContract = new Map<string, BillingContractClause[]>();
  const errors: Array<{ rowNumber: number; reason: string }> = [];
  if (!sheet || sheet.rowCount < 2) return { clausesByContract, errors };

  const columns = buildColumnMap(sheet, CLAUSE_HEADER_ALIASES);
  if (!columns.has('contract number')) return { clausesByContract, errors };

  let parsedRows = 0;
  for (
    let rowNumber = 2;
    rowNumber <= sheet.rowCount && parsedRows < MAX_CLAUSE_ROWS;
    rowNumber += 1
  ) {
    if (!rowHasData(sheet, rowNumber, columns)) continue;
    parsedRows += 1;

    const contractNumber = sheetValue(sheet, rowNumber, columns, 'contract number')
      .trim()
      .toUpperCase();
    const body = sheetValue(sheet, rowNumber, columns, 'body').trim();
    const clauseTypeRaw = sheetValue(sheet, rowNumber, columns, 'clause type').trim();
    if (!contractNumber) {
      errors.push({ rowNumber, reason: 'Clause row missing contract number.' });
      continue;
    }
    if (!body) {
      errors.push({ rowNumber, reason: 'Clause row missing body text.' });
      continue;
    }

    const clauseType = clauseTypeRaw || 'custom';
    if (!VALID_CLAUSE_TYPES.has(clauseType)) {
      errors.push({
        rowNumber,
        reason: `Unknown clause type “${clauseType}”.`,
      });
      continue;
    }

    const appliesRaw = parseList(sheetValue(sheet, rowNumber, columns, 'applies to'));
    const appliesTo =
      appliesRaw.length > 0
        ? appliesRaw.filter((value) => VALID_APPLIES_TO.has(value))
        : ['all'];

    const clause: BillingContractClause = {
      clauseType,
      label: sheetValue(sheet, rowNumber, columns, 'label').trim() || undefined,
      body,
      appliesTo: appliesTo.length > 0 ? appliesTo : ['all'],
    };

    const list = clausesByContract.get(contractNumber) ?? [];
    list.push(clause);
    clausesByContract.set(contractNumber, list);
  }

  return { clausesByContract, errors };
}

export async function parseContractExcel(file: File): Promise<ContractExcelParseResult> {
  if (file.size > MAX_FILE_BYTES) {
    return {
      rows: [],
      errors: [{ rowNumber: 1, reason: 'File must be 5 MB or smaller.' }],
    };
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension !== 'xlsx' && extension !== 'xls') {
    return {
      rows: [],
      errors: [{ rowNumber: 1, reason: 'Upload an .xlsx or .xls Excel file.' }],
    };
  }

  const ExcelJS = await getExcelJSModule();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const contractsSheet = findSheet(workbook, ['contracts', 'contract', 'bhs ads contracts']);
  const adsSheet = findSheet(workbook, ['ads rules', 'ads equipment rules', 'ads']);
  const clausesSheet = findSheet(workbook, ['clauses', 'contract clauses', 'sgha clauses']);

  const safeAdsSheet = adsSheet === contractsSheet ? undefined : adsSheet;
  const safeClausesSheet = clausesSheet === contractsSheet ? undefined : clausesSheet;

  const { rulesByContract, errors: adsErrors } = parseAdsRulesSheet(safeAdsSheet);
  const { clausesByContract, errors: clauseErrors } = parseClausesSheet(safeClausesSheet);

  const contractPayloadsByNumber = new Map<string, ParsedContractExcelRow>();
  const errors: Array<{ rowNumber: number; reason: string }> = [
    ...adsErrors,
    ...clauseErrors,
  ];

  if (contractsSheet && contractsSheet.rowCount >= 2) {
    const contractColumns = buildColumnMap(contractsSheet, CONTRACT_HEADER_ALIASES);
    const hasRequiredContractHeaders = CONTRACT_REQUIRED_HEADERS.every((header) =>
      contractColumns.has(header),
    );

    if (hasRequiredContractHeaders) {
      let parsedContracts = 0;
      for (
        let rowNumber = 2;
        rowNumber <= contractsSheet.rowCount && parsedContracts < MAX_CONTRACT_ROWS;
        rowNumber += 1
      ) {
        if (!rowHasData(contractsSheet, rowNumber, contractColumns)) continue;
        parsedContracts += 1;

        const contractNumber = sheetValue(
          contractsSheet,
          rowNumber,
          contractColumns,
          'contract number',
        ).trim();
        const customerCode = sheetValue(
          contractsSheet,
          rowNumber,
          contractColumns,
          'customer code',
        )
          .trim()
          .toUpperCase();
        const category = parseCategory(
          sheetValue(contractsSheet, rowNumber, contractColumns, 'category'),
        );
        const priceValidFrom = sheetDateValue(
          contractsSheet,
          rowNumber,
          contractColumns,
          'price valid from',
        );
        const priceValidTo = sheetDateValue(
          contractsSheet,
          rowNumber,
          contractColumns,
          'price valid to',
        );

        if (!contractNumber) {
          errors.push({ rowNumber, reason: 'Contract row missing contract number.' });
          continue;
        }
        if (!customerCode) {
          errors.push({ rowNumber, reason: `Row for ${contractNumber}: customer code is required.` });
          continue;
        }
        if (!category) {
          errors.push({
            rowNumber,
            reason: `Row for ${contractNumber}: category must be Dom, Int, or Both.`,
          });
          continue;
        }
        if (!priceValidFrom || !/^\d{4}-\d{2}-\d{2}$/.test(priceValidFrom)) {
          errors.push({
            rowNumber,
            reason: `Row for ${contractNumber}: price valid from must be a date (YYYY-MM-DD).`,
          });
          continue;
        }
        if (!priceValidTo || !/^\d{4}-\d{2}-\d{2}$/.test(priceValidTo)) {
          errors.push({
            rowNumber,
            reason: `Row for ${contractNumber}: price valid to must be a date (YYYY-MM-DD).`,
          });
          continue;
        }

        const aircraftTypes = sanitizeContractAircraftTypes(
          parseList(
            sheetValue(contractsSheet, rowNumber, contractColumns, 'aircraft types'),
          ).map((value) => value.toUpperCase()),
        );

        const conditionalCharges: BillingContractConditionalCharges = {};
        const divertedDom = parseOptionalPercent(
          sheetValue(contractsSheet, rowNumber, contractColumns, 'diverted dom %'),
        );
        const divertedInt = parseOptionalPercent(
          sheetValue(contractsSheet, rowNumber, contractColumns, 'diverted int %'),
        );
        const returnToRamp = parseOptionalPercent(
          sheetValue(contractsSheet, rowNumber, contractColumns, 'return to ramp %'),
        );
        const cancellationWithinHoursPercent = parseOptionalPercent(
          sheetValue(contractsSheet, rowNumber, contractColumns, 'cancel window %'),
        );
        const technicalHandlingChargesPercent = parseOptionalPercent(
          sheetValue(contractsSheet, rowNumber, contractColumns, 'technical handling %'),
        );
        const standbyChargesPercent = parseOptionalPercent(
          sheetValue(contractsSheet, rowNumber, contractColumns, 'standby %'),
        );
        const filoLifoChargesPercent = parseOptionalPercent(
          sheetValue(contractsSheet, rowNumber, contractColumns, 'filo lifo %'),
        );

        if (divertedDom != null) conditionalCharges.divertedDom = divertedDom;
        if (divertedInt != null) conditionalCharges.divertedInt = divertedInt;
        if (returnToRamp != null) conditionalCharges.returnToRamp = returnToRamp;
        if (cancellationWithinHoursPercent != null) {
          conditionalCharges.cancellationWithinHoursPercent = cancellationWithinHoursPercent;
        }
        if (technicalHandlingChargesPercent != null) {
          conditionalCharges.technicalHandlingChargesPercent = technicalHandlingChargesPercent;
        }
        if (standbyChargesPercent != null) {
          conditionalCharges.standbyChargesPercent = standbyChargesPercent;
        }
        if (filoLifoChargesPercent != null) {
          conditionalCharges.filoLifoChargesPercent = filoLifoChargesPercent;
        }

        const cancellationWithinHours = parseOptionalInt(
          sheetValue(contractsSheet, rowNumber, contractColumns, 'cancellation within hours'),
        );

        const adsBillingEnabled = parseBoolean(
          sheetValue(contractsSheet, rowNumber, contractColumns, 'ads billing enabled'),
          false,
        );

        const status = parseContractStatus(
          sheetValue(contractsSheet, rowNumber, contractColumns, 'status'),
        );

        const payload: ContractExcelCreatePayload = {
          contractNumber,
          customerCode,
          category,
          priceValidFrom,
          priceValidTo,
          aircraftTypes: aircraftTypes.length > 0 ? aircraftTypes : undefined,
          cancellationWithinHours,
          conditionalCharges:
            Object.keys(conditionalCharges).length > 0 ? conditionalCharges : undefined,
          adsBillingEnabled,
          activate: status === 'active',
          hasContractsSheetData: true,
        };

        contractPayloadsByNumber.set(contractNumber.toUpperCase(), { rowNumber, payload });
      }
    }
  }

  const allContractNumbers = new Set<string>([
    ...contractPayloadsByNumber.keys(),
    ...rulesByContract.keys(),
    ...clausesByContract.keys(),
  ]);

  const rows: ParsedContractExcelRow[] = [];

  let rowCounter = 2;
  for (const contractKey of allContractNumbers) {
    const existingParsedRow = contractPayloadsByNumber.get(contractKey);
    const adsEquipmentRules = rulesByContract.get(contractKey) ?? [];
    const clauses = clausesByContract.get(contractKey) ?? [];

    if (existingParsedRow) {
      const payload = { ...existingParsedRow.payload };
      if (adsEquipmentRules.length > 0) {
        payload.adsEquipmentRules = adsEquipmentRules;
        payload.adsBillingEnabled = true;
      }
      if (clauses.length > 0) {
        payload.clauses = clauses;
      }
      rows.push({ rowNumber: existingParsedRow.rowNumber, payload });
    } else {
      const payload: ContractExcelCreatePayload = {
        contractNumber: contractKey,
        adsEquipmentRules: adsEquipmentRules.length > 0 ? adsEquipmentRules : undefined,
        clauses: clauses.length > 0 ? clauses : undefined,
        adsBillingEnabled: adsEquipmentRules.length > 0 ? true : undefined,
        hasContractsSheetData: false,
      };
      rows.push({ rowNumber: rowCounter++, payload });
    }
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push({
      rowNumber: 1,
      reason: 'Workbook contains no data on any sheet (Contracts, ADS Rules, or Clauses).',
    });
  }

  return { rows, errors };
}

export async function downloadContractExcelTemplate(): Promise<void> {
  const ExcelJS = await getExcelJSModule();
  const workbook = new ExcelJS.Workbook();

  const contractsSheet = workbook.addWorksheet('Contracts');
  contractsSheet.addRow([...CONTRACT_SHEET_HEADERS]);
  contractsSheet.getRow(1).font = { bold: true };
  contractsSheet.columns = [
    { width: 22 },
    { width: 14 },
    { width: 10 },
    { width: 24 },
    { width: 16 },
    { width: 16 },
    { width: 18 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
    { width: 12 },
    { width: 16 },
    { width: 12 },
    { width: 10 },
    { width: 16 },
  ];
  contractsSheet.addRow([
    'IX-MAA-SGHA',
    'IX',
    'Dom',
    'A320, B737',
    '2026-01-01',
    '2026-12-31',
    '24',
    '50',
    '',
    '50',
    '',
    '',
    '',
    '',
    '',
    'active',
    'yes',
  ]);

  const adsSheet = workbook.addWorksheet('ADS Rules');
  adsSheet.addRow([...ADS_RULE_SHEET_HEADERS]);
  adsSheet.getRow(1).font = { bold: true };
  adsSheet.columns = [
    { width: 22 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 8 },
    { width: 14 },
    { width: 14 },
    { width: 20 },
    { width: 14 },
    { width: 10 },
    { width: 28 },
  ];
  adsSheet.addRow([
    'IX-MAA-SGHA',
    'WCHR',
    'yes',
    '1',
    '1',
    '2',
    'no',
    'EA',
    '500',
    '6',
    'A320, B737',
    '2026-07',
    'equipment',
    'Wheelchair FOC NB/WB sample',
  ]);

  const clausesSheet = workbook.addWorksheet('Clauses');
  clausesSheet.addRow([...CLAUSE_SHEET_HEADERS]);
  clausesSheet.getRow(1).font = { bold: true };
  clausesSheet.columns = [{ width: 22 }, { width: 18 }, { width: 20 }, { width: 48 }, { width: 20 }];
  clausesSheet.addRow([
    'IX-MAA-SGHA',
    'ferry_in_ferry_out',
    'Ferry flights',
    'Ferry in / ferry out charged at 50% of scheduled rate.',
    'scheduled',
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  const saveAs = await getFileSaverSaveAs();
  saveAs(
    toBlob(buffer instanceof ArrayBuffer ? buffer : (buffer as ArrayBufferView)),
    'billing-contract-import-template.xlsx',
  );
}
