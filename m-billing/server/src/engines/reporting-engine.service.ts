import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BillingInvoiceHeader,
  BillingInvoiceHeaderDocument,
  BillingInvoiceLine,
  BillingInvoiceLineDocument,
  BillingPreparationRecord,
  BillingPreparationRecordDocument,
} from '../schemas/billing.schemas';
import type { StationScopeContext } from '../common/station-scope';
import { StationScope } from '../common/station-scope';

export interface ReportParams {
  from: string;
  to: string;
  customerCode?: string;
}

@Injectable()
export class ReportingEngineService {
  constructor(
    @InjectModel(BillingInvoiceHeader.name)
    private readonly invoiceModel: Model<BillingInvoiceHeaderDocument>,
    @InjectModel(BillingInvoiceLine.name)
    private readonly lineModel: Model<BillingInvoiceLineDocument>,
    @InjectModel(BillingPreparationRecord.name)
    private readonly preparationModel: Model<BillingPreparationRecordDocument>,
  ) {}

  async revenueSummary(ctx: StationScopeContext, params: ReportParams) {
    const match = this.periodMatch(ctx, params);
    const rows = await this.invoiceModel.aggregate([
      { $match: { ...match, status: 'posted' } },
      {
        $group: {
          _id: '$customerCode',
          customerName: { $first: '$customerName' },
          invoiceCount: { $sum: 1 },
          totalInclTax: { $sum: '$totalInclTax' },
        },
      },
      { $sort: { totalInclTax: -1 } },
    ]);
    return {
      reportType: 'revenue-summary',
      title: 'Revenue Summary',
      rows,
      totals: {
        invoiceCount: rows.reduce((s, r) => s + r.invoiceCount, 0),
        totalInclTax: rows.reduce((s, r) => s + r.totalInclTax, 0),
      },
    };
  }

  async scheduleReconciliation(ctx: StationScopeContext, params: ReportParams) {
    const base = StationScope.filter(
      {
        status: 'ready_for_invoice',
        billingPeriodStart: { $gte: new Date(params.from) },
        billingPeriodEnd: { $lte: new Date(params.to) },
        sourceType: 'scheduled_flight',
      },
      ctx,
    );
    const readyCount = await this.preparationModel.countDocuments(base);
    const postedLines = await this.lineModel.countDocuments({
      ...StationScope.filter({}, ctx),
      sourceType: 'scheduled_flight',
    });
    return {
      reportType: 'schedule-reconciliation',
      title: 'Schedule Reconciliation (MVP)',
      expectedFlights: readyCount,
      billedFlights: postedLines,
      variance: readyCount - postedLines,
    };
  }

  async delayCharges(ctx: StationScopeContext, params: ReportParams) {
    const lines = await this.lineModel
      .find({
        ...StationScope.filter({}, ctx),
        lineType: 'delay',
      })
      .limit(500)
      .lean();
    return {
      reportType: 'delay-charges',
      title: 'Delay Charges',
      rowCount: lines.length,
      rows: lines,
    };
  }

  async xxldDecisions(ctx: StationScopeContext, params: ReportParams) {
    const rows = await this.preparationModel
      .find({
        ...StationScope.filter(
          {
            sourceType: 'xxld',
            billingPeriodStart: { $gte: new Date(params.from) },
          },
          ctx,
        ),
      })
      .lean();
    return {
      reportType: 'xxld-decisions',
      title: 'XXLD Decisions',
      rowCount: rows.length,
      rows,
    };
  }

  async taxSummary(ctx: StationScopeContext, params: ReportParams) {
    const match = this.periodMatch(ctx, params);
    const agg = await this.invoiceModel.aggregate([
      { $match: { ...match, status: 'posted' } },
      {
        $group: {
          _id: null,
          subtotalExclTax: { $sum: '$subtotalExclTax' },
          taxTotal: { $sum: '$taxTotal' },
          totalInclTax: { $sum: '$totalInclTax' },
        },
      },
    ]);
    return {
      reportType: 'tax-summary',
      title: 'Tax Summary',
      totals: agg[0] ?? { subtotalExclTax: 0, taxTotal: 0, totalInclTax: 0 },
    };
  }

  private periodMatch(ctx: StationScopeContext, params: ReportParams) {
    const match: Record<string, unknown> = StationScope.filter(
      {
        billingPeriodStart: { $gte: new Date(params.from) },
        billingPeriodEnd: { $lte: new Date(params.to) },
      },
      ctx,
    );
    if (params.customerCode) {
      (match as Record<string, string>).customerCode = params.customerCode.toUpperCase();
    }
    return match;
  }
}
