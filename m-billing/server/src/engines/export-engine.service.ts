import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  BillingExport,
  BillingExportDocument,
} from '../schemas/billing.schemas';
import type { StationScopeContext } from '../common/station-scope';
import { StationScope } from '../common/station-scope';
import type { BillingSessionOptions } from '../common/billing-transaction';

@Injectable()
export class ExportEngineService {
  constructor(
    @InjectModel(BillingExport.name)
    private readonly exportModel: Model<BillingExportDocument>,
  ) {}

  async track(
    ctx: StationScopeContext,
    input: {
      exportType: string;
      documentId: Types.ObjectId | string;
      fileName: string;
      exportedBy: string;
      recipient?: string;
    },
    options?: BillingSessionOptions,
  ) {
    const stationCode = StationScope.require(ctx);
    const payload = {
      exportType: input.exportType,
      documentId: new Types.ObjectId(String(input.documentId)),
      fileName: input.fileName,
      exportedBy: input.exportedBy,
      exportedAt: new Date(),
      recipient: input.recipient?.trim() || undefined,
      stationCode,
    };
    if (options?.session) {
      const [created] = await this.exportModel.create([payload], {
        session: options.session,
      });
      return created;
    }
    return this.exportModel.create(payload);
  }

  async listRecent(ctx: StationScopeContext, limit = 20) {
    return this.exportModel
      .find(StationScope.filter({}, ctx))
      .sort({ exportedAt: -1 })
      .limit(limit)
      .lean();
  }
}
