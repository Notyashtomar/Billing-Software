import {
  formatEquipmentCategoryLabel,
  normalizeEquipmentCategory,
} from '@/components/fris/advance/equipmentManpowerCategory';
import { getExcelJSModule, getFileSaverSaveAs, getXLSXModule } from '@/lib/dynamic-imports';

/** Matches `EquipmentManpowerForm` encoding for saved Mongo rows. */
const EQ_PREFIX = 'EQ:';
const ENC_SEP = '|';

export type CatalogItemDraft = {
  abbr: string;
  description: string;
  unit_type: string;
  category: string;
};

function isBlankCatalogRow(r: CatalogItemDraft): boolean {
  return !r.abbr.trim() && !r.description.trim() && !r.unit_type.trim();
}

export function nonBlankCatalogItems(items: CatalogItemDraft[]): CatalogItemDraft[] {
  return items.filter((r) => !isBlankCatalogRow(r));
}

/** One row per distinct `abbr` (case-insensitive); first occurrence wins. */
export function uniqueCatalogByAbbr(items: CatalogItemDraft[]): CatalogItemDraft[] {
  const seen = new Set<string>();
  const out: CatalogItemDraft[] = [];
  for (const r of items) {
    const key = r.abbr.trim().toUpperCase();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      abbr: r.abbr.trim(),
      description: r.description.trim(),
      unit_type: r.unit_type.trim(),
      category: normalizeEquipmentCategory(r.category),
    });
  }
  return out;
}

export function decodeEquipmentEntryName(name: string): {
  equipmentName: string;
  equipmentSerialNo: string;
  employeeName: string;
  employeeId: string;
  designation: string;
} | null {
  const n = (name || '').trim();
  if (!n.startsWith(EQ_PREFIX)) return null;
  const rest = n.slice(EQ_PREFIX.length).split(ENC_SEP);
  const [equipmentName, equipmentSerialNo, employeeName, employeeId, designation] = rest;
  return {
    equipmentName: equipmentName || '',
    equipmentSerialNo: equipmentSerialNo || '',
    employeeName: employeeName || '',
    employeeId: employeeId || '',
    designation: designation || '',
  };
}

function str(v: unknown): string {
  if (v == null) return '';
  return String(v);
}

export interface EquipmentUsageExportRow {
  serialNo: number | string;
  airlinesOperator: string;
  flightNo: string;
  staDate: string;
  equipmentName: string;
  equipmentSerialNo: string;
  employeeName: string;
  employeeId: string;
  designation: string;
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
  remarks: string;
}

export function collectEquipmentUsageRows(adminDocs: Record<string, unknown>[]): EquipmentUsageExportRow[] {
  const usageRows: EquipmentUsageExportRow[] = [];
  for (const doc of adminDocs) {
    if (doc.isEquipmentManpowerCatalog === true) continue;
    const serialRaw = doc.serialNo;
    const serialNo: number | string =
      serialRaw != null && serialRaw !== '' ? (typeof serialRaw === 'number' ? serialRaw : String(serialRaw)) : '';
    const airlinesOperator = str(doc.airlinesOperator);
    const flightNo = str(doc.flightNo);
    const staDate = str(doc.staDate);
    const entries = doc.entries;
    if (!Array.isArray(entries)) continue;
    for (const ent of entries) {
      if (!ent || typeof ent !== 'object') continue;
      const rec = ent as Record<string, unknown>;
      const decoded = decodeEquipmentEntryName(str(rec.name));
      if (!decoded) continue;
      usageRows.push({
        serialNo,
        airlinesOperator,
        flightNo,
        staDate,
        equipmentName: decoded.equipmentName,
        equipmentSerialNo: decoded.equipmentSerialNo,
        employeeName: decoded.employeeName,
        employeeId: decoded.employeeId,
        designation: decoded.designation,
        fromDate: str(rec.fromDate),
        fromTime: str(rec.fromTime),
        toDate: str(rec.toDate),
        toTime: str(rec.toTime),
        remarks: str(rec.remarks),
      });
    }
  }
  return usageRows;
}

const EQUIPMENT_MASTER_EXPORT_HEADERS = [
  'No.',
  'Abbr',
  'Description',
  'Unit type',
  'Category code',
  'Category description',
] as const;

type EquipmentMasterExportHeader = (typeof EQUIPMENT_MASTER_EXPORT_HEADERS)[number];

function equipmentMasterExportColumnWidths(
  rows: Array<Record<EquipmentMasterExportHeader, string>>,
): number[] {
  return EQUIPMENT_MASTER_EXPORT_HEADERS.map((header) => {
    const headerLen = header.length;
    const valueLen = rows.reduce((max, row) => {
      const cell = String(row[header] ?? '');
      const longestLine = cell
        .split(/\r?\n/)
        .reduce((lineMax, line) => Math.max(lineMax, line.length), 0);
      return Math.max(max, longestLine);
    }, 0);
    const ideal = Math.max(headerLen, valueLen) + 4;
    return Math.min(Math.max(ideal, 14), 100);
  });
}

function excelJsWriteBufferToBlob(buffer: ArrayBuffer | ArrayBufferView): Blob {
  return new Blob([buffer as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Export every non-blank equipment master catalog row (no dedupe by abbr — full ~1000+ list).
 */
export async function downloadEquipmentMasterCatalogExcel(
  catalogDraft: CatalogItemDraft[],
): Promise<{ rowCount: number }> {
  const cleaned = nonBlankCatalogItems(
    catalogDraft.map((r) => ({
      abbr: String(r.abbr ?? ''),
      description: String(r.description ?? ''),
      unit_type: String(r.unit_type ?? ''),
      category: normalizeEquipmentCategory(r.category),
    })),
  );
  if (cleaned.length === 0) {
    throw new Error('No catalog rows to export.');
  }

  const exportRows: Array<Record<EquipmentMasterExportHeader, string>> = cleaned.map(
    (r, i) => {
      const catCode = normalizeEquipmentCategory(r.category);
      return {
        'No.': String(i + 1),
        Abbr: r.abbr,
        Description: r.description,
        'Unit type': r.unit_type,
        'Category code': catCode,
        'Category description': formatEquipmentCategoryLabel(catCode || r.category),
      };
    },
  );

  const ExcelJS = await getExcelJSModule();
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Equipment master', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  worksheet.addRow([...EQUIPMENT_MASTER_EXPORT_HEADERS]);
  for (const er of exportRows) {
    worksheet.addRow(EQUIPMENT_MASTER_EXPORT_HEADERS.map((h) => er[h]));
  }

  const headerRow = worksheet.getRow(1);
  headerRow.height = 32;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 11, color: { argb: 'FF1F2937' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFDAB9' },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'left',
      wrapText: true,
    };
  });

  equipmentMasterExportColumnWidths(exportRows).forEach((width, idx) => {
    worksheet.getColumn(idx + 1).width = width;
  });

  const buf = await workbook.xlsx.writeBuffer();
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const saveAs = await getFileSaverSaveAs();
  saveAs(excelJsWriteBufferToBlob(buf), `equipment-master-catalog_${ts}.xlsx`);
  return { rowCount: cleaned.length };
}

export async function downloadEquipmentManpowerExcel(params: {
  catalogDraft: CatalogItemDraft[];
  adminRows: Record<string, unknown>[];
}): Promise<{ masterCount: number; usageCount: number }> {
  const { catalogDraft, adminRows } = params;

  const masterUnique = uniqueCatalogByAbbr(nonBlankCatalogItems(catalogDraft));
  const usageRows = collectEquipmentUsageRows(adminRows);

  const XLSX = await getXLSXModule();
  const workbook = XLSX.utils.book_new();

  const masterSheet = XLSX.utils.json_to_sheet(
    masterUnique.map((r) => ({
      Abbr: r.abbr,
      Description: r.description,
      'Unit type': r.unit_type,
      Category: formatEquipmentCategoryLabel(r.category),
    })),
  );
  XLSX.utils.book_append_sheet(workbook, masterSheet, 'Unique master');

  const usageSheet = XLSX.utils.json_to_sheet(
    usageRows.map((r) => ({
      'Serial no': r.serialNo,
      Airline: r.airlinesOperator,
      'Flight no': r.flightNo,
      'STA date': r.staDate,
      'Equipment name': r.equipmentName,
      'Equipment serial': r.equipmentSerialNo,
      'Employee name': r.employeeName,
      'Employee id': r.employeeId,
      Designation: r.designation,
      'From date': r.fromDate,
      'From time': r.fromTime,
      'To date': r.toDate,
      'To time': r.toTime,
      Remarks: r.remarks,
    })),
  );
  XLSX.utils.book_append_sheet(workbook, usageSheet, 'Equipment usage');

  const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const buf = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const saveAs = await getFileSaverSaveAs();
  saveAs(
    new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `equipment-manpower-export_${ts}.xlsx`,
  );

  return { masterCount: masterUnique.length, usageCount: usageRows.length };
}
