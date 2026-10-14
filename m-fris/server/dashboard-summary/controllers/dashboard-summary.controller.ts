import {
  Body,
  Controller,
  Delete,
  Get,
  Put,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ADMIN_ROLES } from '../../auth/enums/roles.enum';
import { FrisPagePermission } from '../../auth/decorators/fris-page-permission.decorator';
import { DashboardSummaryService } from '../services/dashboard-summary.service';
import { GetDashboardSummaryQueryDto } from '../dto/get-dashboard-summary-query.dto';
import { UpsertDashboardSummaryDto } from '../dto/upsert-dashboard-summary.dto';

const queryPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

const bodyPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: false,
});

/**
 * Read/write API for precomputed dashboard card snapshots (`dashboard_summaries`).
 * Frontend should prefer GET here over live FHR aggregation when a snapshot exists.
 */
@Controller('dashboard-summaries')
export class DashboardSummaryController {
  constructor(
    private readonly dashboardSummaryService: DashboardSummaryService,
  ) {}

  /** GET /dashboard-summaries?fromDate=&tillDate=&equipmentMode=4h|6h */
  @Get()
  @FrisPagePermission('dashboard', 'Dashboard page')
  @UsePipes(queryPipe)
  getByRange(@Query() query: GetDashboardSummaryQueryDto) {
    return this.dashboardSummaryService.findByRange(
      query.fromDate,
      query.tillDate,
      query.equipmentMode,
    );
  }

  /** GET /dashboard-summaries/latest?limit=20 */
  @Get('latest')
  @FrisPagePermission('dashboard', 'Dashboard page')
  listLatest(@Query('limit') limit?: string) {
    const n = limit != null ? Number(limit) : 20;
    return this.dashboardSummaryService.findLatest(
      Number.isFinite(n) ? n : 20,
    );
  }

  /** PUT /dashboard-summaries — upsert precomputed cards (batch writer / admin). */
  @Put()
  @Roles(...ADMIN_ROLES)
  @UsePipes(bodyPipe)
  upsert(@Body() body: UpsertDashboardSummaryDto) {
    return this.dashboardSummaryService.upsert(body);
  }

  /** DELETE /dashboard-summaries?fromDate=&tillDate=&equipmentMode= */
  @Delete()
  @Roles(...ADMIN_ROLES)
  @UsePipes(queryPipe)
  deleteByRange(@Query() query: GetDashboardSummaryQueryDto) {
    return this.dashboardSummaryService.deleteByRange({
      fromDate: query.fromDate,
      tillDate: query.tillDate,
      equipmentMode: query.equipmentMode ?? '6h',
    });
  }
}
