import { Controller, Get, Param, Query } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BillingAuditLog,
  BillingAuditLogDocument,
} from '../schemas/billing.schemas';
import { CurrentBillingStation } from '../common/billing-context.decorator';
import type { StationScopeContext } from '../common/station-scope';
import { StationScope, successResponse } from '../common/station-scope';
import { ListAuditQueryDto } from '../dto/billing-invoice.dto';
import { AuditEngineService } from '../engines/audit-engine.service';

import { BillingPageAccess } from '../common/billing-page-access.decorator';

@BillingPageAccess()
@Controller('billing/audit')
export class BillingAuditController {
  constructor(
    @InjectModel(BillingAuditLog.name)
    private readonly auditModel: Model<BillingAuditLogDocument>,
    private readonly auditEngine: AuditEngineService,
  ) {}

  @Get()
  async list(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: ListAuditQueryDto,
  ) {
    const limit = Math.min(200, parseInt(query.limit ?? '50', 10) || 50);
    const filter: Record<string, unknown> = StationScope.filter({}, station);
    if (query.entityType) filter.entityType = query.entityType;
    if (query.action) filter.action = query.action;

    const items = await this.auditModel
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    return successResponse({ items, total: items.length });
  }

  @Get(':entityType/:entityId')
  entityTrail(
    @CurrentBillingStation() station: StationScopeContext,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.auditEngine
      .listForEntity(station, entityType, entityId)
      .then((items) => successResponse({ items }));
  }
}

