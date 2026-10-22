import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as XLSX from 'xlsx';
import {
  aircraftMasterRowHasContent,
  aircraftMasterRowsFromSheet,
  emptyAircraftMasterRow,
  type AircraftMasterSheetRow,
} from '../aircraft-master/aircraft-master-columns';
import {
  BillingAircraftMaster,
  type BillingAircraftMasterDocument,
} from '../schemas/billing-aircraft-master.schema';

export const AIRCRAFT_MASTER_STATION = 'GLOBAL';

export type AircraftMasterWrite = Omit<AircraftMasterSheetRow, 'sortIndex'>;

function cell(value: unknown): string {
  return String(value ?? '').trim();
}

function exact(value: string): RegExp {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
}

function workbookCandidates(): string[] {
  return [
    path.join(process.cwd(), 'data', 'aircraft-master.xlsx'),
    path.join(process.cwd(), 'api', 'data', 'aircraft-master.xlsx'),
    path.join(process.cwd(), '..', 'api', 'data', 'aircraft-master.xlsx'),
  ];
}

@Injectable()
export class BillingAircraftMasterService implements OnModuleInit {
  private readonly logger = new Logger(BillingAircraftMasterService.name);

  constructor(
    @InjectModel(BillingAircraftMaster.name)
    private readonly model: Model<BillingAircraftMasterDocument>,
  ) {}

  async onModuleInit() {
    try {
      await this.seedFromWorkbookIfEmpty();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Aircraft master seed failed: ${message}`);
    }
  }

  async list() {
    const data = await this.model
      .find({ stationCode: AIRCRAFT_MASTER_STATION })
      .sort({ sortIndex: 1, aircraftType: 1 })
      .lean();
    return { data };
  }

  async importRows(rows: AircraftMasterWrite[]) {
    let created = 0;
    let updated = 0;
    for (const [index, body] of rows.entries()) {
      const row = this.normalizeWrite(body);
      if (!aircraftMasterRowHasContent(row)) continue;
      const existing = row.aircraftType
        ? await this.model.findOne({
            stationCode: AIRCRAFT_MASTER_STATION,
            aircraftType: exact(row.aircraftType),
          })
        : null;
      if (existing) {
        this.assign(existing, row, index);
        await existing.save();
        updated += 1;
      } else {
        await this.model.create({
          stationCode: AIRCRAFT_MASTER_STATION,
          sortIndex: index,
          ...row,
        });
        created += 1;
      }
    }
    return { data: { created, updated } };
  }

  async create(body: AircraftMasterWrite) {
    const row = this.normalizeWrite(body);
    const earliest = await this.model
      .findOne({ stationCode: AIRCRAFT_MASTER_STATION })
      .sort({ sortIndex: 1 })
      .select({ sortIndex: 1 })
      .lean();
    const created = await this.model.create({
      stationCode: AIRCRAFT_MASTER_STATION,
      sortIndex: Number(earliest?.sortIndex ?? 0) - 1,
      ...row,
    });
    return { data: created.toObject() };
  }

  async update(id: string, body: AircraftMasterWrite) {
    const doc = await this.model.findById(id);
    if (!doc || doc.stationCode !== AIRCRAFT_MASTER_STATION) {
      throw new NotFoundException('Aircraft not found');
    }
    this.assign(doc, this.normalizeWrite(body), doc.sortIndex);
    await doc.save();
    return { data: doc.toObject() };
  }

  async remove(id: string) {
    const doc = await this.model.findById(id);
    if (!doc || doc.stationCode !== AIRCRAFT_MASTER_STATION) {
      throw new NotFoundException('Aircraft not found');
    }
    await doc.deleteOne();
    return { data: { deleted: true } };
  }

  private normalizeWrite(body: AircraftMasterWrite): AircraftMasterWrite {
    const blank = emptyAircraftMasterRow();
    const row = {} as AircraftMasterWrite;
    for (const key of Object.keys(blank) as Array<keyof typeof blank>) {
      if (key === 'sortIndex') continue;
      row[key] = cell(body?.[key]);
    }
    return row;
  }

  private assign(
    doc: BillingAircraftMasterDocument,
    row: AircraftMasterWrite,
    sortIndex: number,
  ) {
    doc.sortIndex = sortIndex;
    doc.serialNo = row.serialNo;
    doc.aircraftType = row.aircraftType;
    doc.icaoCode = row.icaoCode;
    doc.mtowKg = row.mtowKg;
    doc.passengerCapacity = row.passengerCapacity;
    doc.manufacturer = row.manufacturer;
    doc.aircraftBody = row.aircraftBody;
    doc.wingspanM = row.wingspanM;
    doc.description = row.description;
    doc.active = row.active;
    doc.category = row.category;
    doc.categoryCode = row.categoryCode;
    doc.activeSecondary = row.activeSecondary;
    doc.ceilingRate = row.ceilingRate;
    doc.arrayRate = row.arrayRate;
    doc.validTill = row.validTill;
  }

  private async seedFromWorkbookIfEmpty() {
    const existing = await this.model.countDocuments({
      stationCode: AIRCRAFT_MASTER_STATION,
    });
    if (existing > 0) return;

    const filePath = workbookCandidates().find((candidate) => existsSync(candidate));
    if (!filePath) {
      this.logger.warn('aircraft-master.xlsx was not found. Aircraft master was not seeded.');
      return;
    }

    const workbook = XLSX.read(readFileSync(filePath), { type: 'buffer', cellDates: true });
    const sheetName =
      workbook.SheetNames.find((name) => name.trim().toLowerCase() === 'aircraft') ??
      workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (!sheet) {
      this.logger.warn(`Aircraft master workbook ${filePath} has no sheet.`);
      return;
    }
    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: false,
    }) as unknown[][];
    const rows = aircraftMasterRowsFromSheet(matrix);
    if (rows.length === 0) return;

    await this.model.insertMany(
      rows.map((row) => ({
        stationCode: AIRCRAFT_MASTER_STATION,
        ...row,
      })),
    );
    this.logger.log(`Seeded ${rows.length} aircraft master rows from ${filePath}.`);
  }
}
