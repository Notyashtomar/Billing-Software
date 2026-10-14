import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BillingBackingSheet,
  BillingBackingSheetDocument,
} from '../schemas/billing.schemas';
import type { StationScopeContext } from '../common/station-scope';
import {
  StationScope,
  paginatedResponse,
  parsePagination,
  successResponse,
} from '../common/station-scope';
import { ListInvoicesQueryDto } from '../dto/billing-invoice.dto';

@Injectable()
export class BillingBackingSheetsService {
  constructor(
    @InjectModel(BillingBackingSheet.name)
    private readonly backingModel: Model<BillingBackingSheetDocument>,
  ) {}

  async list(ctx: StationScopeContext, query: ListInvoicesQueryDto) {
    const { page, limit, skip } = parsePagination(query);
    const filter = StationScope.filter({}, ctx);
    if (query.customerCode) filter.customerCode = query.customerCode.toUpperCase();
    const [items, total] = await Promise.all([
      this.backingModel.find(filter).sort({ generatedAt: -1 }).skip(skip).limit(limit).lean(),
      this.backingModel.countDocuments(filter),
    ]);
    return paginatedResponse(items, total, page, limit);
  }

  async findOne(ctx: StationScopeContext, id: string) {
    const doc = await this.backingModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Backing sheet not found');
    StationScope.assertOwnership(doc, ctx);
    return successResponse(doc);
  }
}
