import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as XLSX from 'xlsx';
import {
  cleanEquipmentMasterUoms,
  equipmentMasterRowsFromSheet,
  type EquipmentMasterUom,
} from '../equipment-master/equipment-master-sheet';
import {
  BillingEquipmentMaster,
  type BillingEquipmentMasterDocument,
} from '../schemas/billing-equipment-master.schema';

export const EQUIPMENT_MASTER_STATION = 'GLOBAL';

/** Codes whose catalog description is the full equipment name. */
const CANONICAL_EQUIPMENT_DESCRIPTIONS: Record<string, string> = {
  BFL: 'Baggage Freight Loader',
  EBT: 'Electrical Baggage Loader',
  GPU: 'Ground Power Unit',
  LDL: 'Lower Deck Loader',
};

export type EquipmentMasterWrite = {
  itemNo?: string;
  description?: string;
  unitType?: string;
  uoms?: EquipmentMasterUom[];
};

function cell(value: unknown): string {
  return String(value ?? '').trim();
}

function workbookCandidates(): string[] {
  return [
    path.join(process.cwd(), 'data', 'Equipment Master.xlsx'),
    path.join(process.cwd(), 'api', 'data', 'Equipment Master.xlsx'),
  ];
}

@Injectable()
export class BillingEquipmentMasterService implements OnModuleInit {
  private readonly logger = new Logger(BillingEquipmentMasterService.name);

  constructor(
    @InjectModel(BillingEquipmentMaster.name)
    private readonly model: Model<BillingEquipmentMasterDocument>,
  ) {}

  async onModuleInit() {
    try {
      await this.seedFromWorkbookIfEmpty();
      await this.applyCanonicalDescriptions();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Equipment master seed failed: ${message}`);
    }
  }

  async list() {
    const data = await this.model
      .find({ stationCode: EQUIPMENT_MASTER_STATION })
      .sort({ sortIndex: 1, itemNo: 1, description: 1 })
      .lean();
    return { data };
  }

  async importRows(rows: EquipmentMasterWrite[]) {
    let created = 0;
    let updated = 0;
    for (const body of rows) {
      const row = this.normalizeWrite(body);
      if (!row.itemNo && !row.description) continue;
      const existing = row.itemNo
        ? await this.model.findOne({
            stationCode: EQUIPMENT_MASTER_STATION,
            itemNo: new RegExp(`^${row.itemNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          })
        : null;
      if (existing) {
        if (row.description) existing.description = row.description;
        if (row.unitType) existing.unitType = row.unitType;
        if (row.uoms.length > 0) {
          existing.uoms = row.uoms;
          existing.markModified('uoms');
        }
        await existing.save();
        updated += 1;
      } else {
        await this.create(row);
        created += 1;
      }
    }
    return { data: { created, updated } };
  }

  async create(body: EquipmentMasterWrite) {
    const row = this.normalizeWrite(body);
    const earliest = await this.model
      .findOne({ stationCode: EQUIPMENT_MASTER_STATION })
      .sort({ sortIndex: 1 })
      .select({ sortIndex: 1 })
      .lean();
    const created = await this.model.create({
      stationCode: EQUIPMENT_MASTER_STATION,
      sortIndex: Number(earliest?.sortIndex ?? 0) - 1,
      ...row,
    });
    return { data: created.toObject() };
  }

  async update(id: string, body: EquipmentMasterWrite) {
    const doc = await this.model.findById(id);
    if (!doc || doc.stationCode !== EQUIPMENT_MASTER_STATION) {
      throw new NotFoundException('Equipment not found');
    }
    const row = this.normalizeWrite(body);
    doc.itemNo = row.itemNo;
    doc.description = row.description;
    doc.unitType = row.unitType;
    doc.uoms = row.uoms;
    doc.markModified('uoms');
    await doc.save();
    return { data: doc.toObject() };
  }

  async remove(id: string) {
    const doc = await this.model.findById(id);
    if (!doc || doc.stationCode !== EQUIPMENT_MASTER_STATION) {
      throw new NotFoundException('Equipment not found');
    }
    await doc.deleteOne();
    return { data: { deleted: true } };
  }

  private normalizeWrite(body: EquipmentMasterWrite) {
    return {
      itemNo: cell(body.itemNo),
      description: cell(body.description),
      unitType: cell(body.unitType),
      uoms: cleanEquipmentMasterUoms(body.uoms),
    };
  }

  private async applyCanonicalDescriptions() {
    for (const [itemNo, description] of Object.entries(CANONICAL_EQUIPMENT_DESCRIPTIONS)) {
      const result = await this.model.updateMany(
        {
          stationCode: EQUIPMENT_MASTER_STATION,
          itemNo: new RegExp(`^${itemNo}$`, 'i'),
          description: { $ne: description },
        },
        { $set: { description } },
      );
      if (result.modifiedCount > 0) {
        this.logger.log(`Updated ${itemNo} description to "${description}".`);
      }
    }
  }

  private async seedFromWorkbookIfEmpty() {
    const existing = await this.model.countDocuments({
      stationCode: EQUIPMENT_MASTER_STATION,
    });
    if (existing > 0) return;

    const filePath = workbookCandidates().find((candidate) => existsSync(candidate));
    if (!filePath) {
      this.logger.warn('Equipment Master.xlsx was not found. Equipment master was not seeded.');
      return;
    }

    const workbook = XLSX.read(readFileSync(filePath), { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (!sheet) {
      this.logger.warn(`Equipment master workbook ${filePath} has no sheet.`);
      return;
    }
    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: false,
    }) as unknown[][];
    const rows = equipmentMasterRowsFromSheet(matrix);
    if (rows.length === 0) return;

    await this.model.insertMany(
      rows.map((row) => ({
        stationCode: EQUIPMENT_MASTER_STATION,
        ...row,
      })),
    );
    this.logger.log(`Seeded ${rows.length} equipment master rows from ${filePath}.`);
  }
}
