import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BillingReport, BillingReportDocument } from '../schemas/billing.schemas';
import type { StationScopeContext } from '../common/station-scope';
import {
  StationScope,
  paginatedResponse,
  parsePagination,
  successResponse,
} from '../common/station-scope';
import { ReportingEngineService } from '../engines/reporting-engine.service';
import type { BillingActor } from './billing-customers.service';
import { GenerateReportDto, ListInvoicesQueryDto } from '../dto/billing-invoice.dto';

@Injectable()
export class BillingReportsService {
  constructor(
    @InjectModel(BillingReport.name)
    private readonly reportModel: Model<BillingReportDocument>,
    private readonly reportingEngine: ReportingEngineService,
  ) {}

  async list(ctx: StationScopeContext, query: ListInvoicesQueryDto) {
    const { page, limit, skip } = parsePagination(query);
    const filter = StationScope.filter({}, ctx);
    const [items, total] = await Promise.all([
      this.reportModel.find(filter).sort({ generatedAt: -1 }).skip(skip).limit(limit).lean(),
      this.reportModel.countDocuments(filter),
    ]);
    return paginatedResponse(items, total, page, limit);
  }

  async findOne(ctx: StationScopeContext, id: string) {
    const doc = await this.reportModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Report not found');
    StationScope.assertOwnership(doc, ctx);
    return successResponse(doc);
  }

  async generate(
    ctx: StationScopeContext,
    type: string,
    dto: GenerateReportDto,
    actor: BillingActor,
  ) {
    const stationCode = StationScope.require(ctx);
    const params = {
      from: dto.from,
      to: dto.to,
      customerCode: dto.customerCode,
    };

    let data: Record<string, unknown>;
    switch (type) {
      case 'revenue-summary':
        data = await this.reportingEngine.revenueSummary(ctx, params);
        break;
      case 'schedule-reconciliation':
        data = await this.reportingEngine.scheduleReconciliation(ctx, params);
        break;
      case 'delay-charges':
        data = await this.reportingEngine.delayCharges(ctx, params);
        break;
      case 'xxld-decisions':
        data = await this.reportingEngine.xxldDecisions(ctx, params);
        break;
      case 'tax-summary':
        data = await this.reportingEngine.taxSummary(ctx, params);
        break;
      default:
        throw new NotFoundException(`Unknown report type: ${type}`);
    }

    const saved = await this.reportModel.create({
      reportType: type,
      title: String(data.title ?? type),
      parameters: params,
      data,
      generatedBy: actor.userName,
      generatedAt: new Date(),
      stationCode,
    });

    return successResponse(saved.toObject());
  }

  async download(ctx: StationScopeContext, id: string) {
    const doc = await this.reportModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Report not found');
    StationScope.assertOwnership(doc, ctx);
    return {
      contentType: 'application/json',
      body: JSON.stringify(doc.data, null, 2),
      fileName: `${doc.reportType}-${doc._id}.json`,
    };
  }
}
