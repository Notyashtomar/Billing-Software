import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StationScope, type StationScopeContext } from '../common/station-scope';
import { missingAircraftMasterHeaders } from '../aircraft-master/aircraft-master-columns';
import {
  BillingAircraftMaster,
  type BillingAircraftMasterDocument,
} from '../schemas/billing-aircraft-master.schema';

export type AircraftMasterImportRow = {
  serialNo?: string;
  aircraftType?: string;
  icaoCode?: string;
  mtowKg?: string;
  passengerCapacity?: string;
  manufacturer?: string;
  aircraftBody?: string;
  wingspanM?: string;
  description?: string;
  active?: string;
  category?: string;
  activeSecondary?: string;
  ceilingRate?: string;
  arrayRate?: string;
  validTill?: string;
};

function cell(value: unknown): string {
  return String(value ?? '').trim();
}

@Injectable()
export class BillingAircraftMasterService {
  constructor(
    @InjectModel(BillingAircraftMaster.name)
    private readonly model: Model<BillingAircraftMasterDocument>,
  ) {}

  async list(ctx: StationScopeContext) {
    const data = await this.model
      .find(StationScope.filter({}, ctx))
      .sort({ sortIndex: 1, createdAt: 1 })
      .lean();
    return { data };
  }

  async importRows(
    ctx: StationScopeContext,
    headers: unknown[],
    rows: AircraftMasterImportRow[],
  ) {
    const missing = missingAircraftMasterHeaders(headers);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Import was not added. These columns are missing: ${missing.join(', ')}.`,
      );
    }

    const docs = rows
      .map((row, index) => ({
        sortIndex: index,
        serialNo: cell(row.serialNo),
        aircraftType: cell(row.aircraftType),
        icaoCode: cell(row.icaoCode),
        mtowKg: cell(row.mtowKg),
        passengerCapacity: cell(row.passengerCapacity),
        manufacturer: cell(row.manufacturer),
        aircraftBody: cell(row.aircraftBody),
        wingspanM: cell(row.wingspanM),
        description: cell(row.description),
        active: cell(row.active),
        category: cell(row.category),
        activeSecondary: cell(row.activeSecondary),
        ceilingRate: cell(row.ceilingRate),
        arrayRate: cell(row.arrayRate),
        validTill: cell(row.validTill),
      }))
      .filter((row) =>
        [
          row.serialNo,
          row.aircraftType,
          row.icaoCode,
          row.mtowKg,
          row.passengerCapacity,
          row.manufacturer,
          row.aircraftBody,
          row.wingspanM,
          row.description,
          row.active,
          row.category,
          row.activeSecondary,
          row.ceilingRate,
          row.arrayRate,
          row.validTill,
        ].some(Boolean),
      )
      .map((row, index) =>
        StationScope.stampCreate({ ...row, sortIndex: index }, ctx),
      );

    await this.model.deleteMany(StationScope.filter({}, ctx));
    if (docs.length > 0) {
      await this.model.insertMany(docs);
    }
    return this.list(ctx);
  }
}
