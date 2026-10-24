import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type AnyBulkWriteOperation } from 'mongoose';
import * as XLSX from 'xlsx';
import {
  cleanEquipmentMasterUoms,
  equipmentMasterRowsFromSheet,
  isEquipmentMasterReplaceColumn,
  replaceEquipmentMasterAbbreviationValue,
  replaceEquipmentMasterUomValue,
  type EquipmentMasterReplaceColumn,
  type EquipmentMasterUom,
} from '../equipment-master/equipment-master-sheet';
import {
  BillingEquipmentMaster,
  type BillingEquipmentMasterDocument,
} from '../schemas/billing-equipment-master.schema';
import {
  BillingContract,
  BillingContractDocument,
  BillingRafAdhocRate,
  BillingRafAdhocRateDocument,
  BillingRateCard,
  BillingRateCardDocument,
  BillingServiceCatalog,
  BillingServiceCatalogDocument,
} from '../schemas/billing.schemas';

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

function replaceColumnLabel(column: EquipmentMasterReplaceColumn): string {
  if (column === 'itemNo') return 'code';
  if (column === 'unitType') return 'type';
  if (column === 'uom') return 'UOM';
  return column;
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
    @InjectModel(BillingServiceCatalog.name)
    private readonly catalogModel: Model<BillingServiceCatalogDocument>,
    @InjectModel(BillingContract.name)
    private readonly contractModel: Model<BillingContractDocument>,
    @InjectModel(BillingRateCard.name)
    private readonly rateCardModel: Model<BillingRateCardDocument>,
    @InjectModel(BillingRafAdhocRate.name)
    private readonly rafAdhocModel: Model<BillingRafAdhocRateDocument>,
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

  async replaceUom(fromRaw: string, toRaw: string) {
    const result = await this.replaceColumn('uom', fromRaw, toRaw);
    return {
      data: {
        fromUom: result.data.fromValue,
        toUom: result.data.toValue,
        equipmentMaster: result.data.equipmentMaster,
        serviceCatalog: result.data.serviceCatalog,
        contracts: result.data.contracts,
        rateCards: result.data.rateCards,
        rafAdhoc: result.data.rafAdhoc,
      },
    };
  }

  async replaceColumn(columnRaw: string, fromRaw: string, toRaw: string) {
    if (!isEquipmentMasterReplaceColumn(columnRaw)) {
      throw new BadRequestException('Choose a column to replace.');
    }
    const column: EquipmentMasterReplaceColumn = columnRaw;
    const fromValue = String(fromRaw ?? '').trim();
    const toValue = String(toRaw ?? '').trim();
    const label = replaceColumnLabel(column);
    if (!fromValue) {
      throw new BadRequestException(`Choose a ${label} from the list.`);
    }
    if (!toValue) {
      throw new BadRequestException(`Type the ${label} that should appear instead.`);
    }
    if (fromValue === toValue) {
      throw new BadRequestException(`The replacement must be different from the current ${label}.`);
    }

    const equipmentMaster = await this.replaceOnCatalog(column, fromValue, toValue);
    if (equipmentMaster === 0) {
      throw new BadRequestException(
        `No equipment, service, or manpower row uses “${fromValue}”. Pick a ${label} from the list.`,
      );
    }

    const related = await this.replaceRelated(column, fromValue, toValue);
    return {
      data: {
        column,
        fromValue,
        toValue,
        equipmentMaster,
        ...related,
      },
    };
  }

  private async replaceOnCatalog(
    column: EquipmentMasterReplaceColumn,
    fromValue: string,
    toValue: string,
  ): Promise<number> {
    if (column === 'itemNo' || column === 'description' || column === 'unitType') {
      const result = await this.model.updateMany(
        { stationCode: EQUIPMENT_MASTER_STATION, [column]: fromValue },
        { $set: { [column]: toValue } },
      );
      return result.modifiedCount;
    }

    const catalog = await this.model.find({ stationCode: EQUIPMENT_MASTER_STATION }).exec();
    const ops: AnyBulkWriteOperation<BillingEquipmentMasterDocument>[] = [];
    for (const doc of catalog) {
      const replaced =
        column === 'abbreviation'
          ? replaceEquipmentMasterAbbreviationValue(doc.uoms ?? [], fromValue, toValue)
          : replaceEquipmentMasterUomValue(doc.uoms ?? [], fromValue, toValue);
      if (!replaced.changed) continue;
      ops.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { uoms: replaced.uoms } },
        },
      });
    }
    if (ops.length === 0) return 0;
    await this.model.bulkWrite(ops, { ordered: false });
    return ops.length;
  }

  private async replaceRelated(
    column: EquipmentMasterReplaceColumn,
    fromValue: string,
    toValue: string,
  ): Promise<{
    serviceCatalog: number;
    contracts: number;
    rateCards: number;
    rafAdhoc: number;
  }> {
    const empty = { serviceCatalog: 0, contracts: 0, rateCards: 0, rafAdhoc: 0 };
    if (column === 'unitType' || column === 'abbreviation') return empty;

    if (column === 'uom') {
      const [serviceCatalog, contracts, rateCards, rafAdhoc] = await Promise.all([
        this.catalogModel.updateMany({ uom: fromValue }, { $set: { uom: toValue } }),
        this.contractModel.updateMany(
          { 'adsEquipmentRules.uom': fromValue },
          { $set: { 'adsEquipmentRules.$[rule].uom': toValue } },
          { arrayFilters: [{ 'rule.uom': fromValue }] },
        ),
        this.rateCardModel.updateMany({ uom: fromValue }, { $set: { uom: toValue } }),
        this.rafAdhocModel.updateMany({ uom: fromValue }, { $set: { uom: toValue } }),
      ]);
      return {
        serviceCatalog: serviceCatalog.modifiedCount,
        contracts: contracts.modifiedCount,
        rateCards: rateCards.modifiedCount,
        rafAdhoc: rafAdhoc.modifiedCount,
      };
    }

    if (column === 'itemNo') {
      const [contracts, rateCards] = await Promise.all([
        this.contractModel.updateMany(
          { 'adsEquipmentRules.serviceCode': fromValue },
          { $set: { 'adsEquipmentRules.$[rule].serviceCode': toValue } },
          { arrayFilters: [{ 'rule.serviceCode': fromValue }] },
        ),
        this.rateCardModel.updateMany({ serviceCode: fromValue }, { $set: { serviceCode: toValue } }),
      ]);
      let serviceCatalog = 0;
      try {
        const catalog = await this.catalogModel.updateMany(
          { serviceCode: fromValue },
          { $set: { serviceCode: toValue } },
        );
        serviceCatalog = catalog.modifiedCount;
      } catch (err) {
        this.logger.warn(
          `Service catalog codes were left unchanged while replacing “${fromValue}”: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      return {
        serviceCatalog,
        contracts: contracts.modifiedCount,
        rateCards: rateCards.modifiedCount,
        rafAdhoc: 0,
      };
    }

    const [serviceCatalog, contracts] = await Promise.all([
      this.catalogModel.updateMany({ description: fromValue }, { $set: { description: toValue } }),
      this.contractModel.updateMany(
        { 'adsEquipmentRules.serviceCode': fromValue },
        { $set: { 'adsEquipmentRules.$[rule].serviceCode': toValue } },
        { arrayFilters: [{ 'rule.serviceCode': fromValue }] },
      ),
    ]);
    return {
      serviceCatalog: serviceCatalog.modifiedCount,
      contracts: contracts.modifiedCount,
      rateCards: 0,
      rafAdhoc: 0,
    };
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
