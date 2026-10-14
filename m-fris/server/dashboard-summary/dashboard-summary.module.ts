import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  DashboardDailyAggregate,
  DashboardDailyAggregateSchema,
} from './schemas/dashboard-daily-aggregate.schema';
import {
  DashboardSummary,
  DashboardSummarySchema,
} from './schemas/dashboard-summary.schema';
import {
  DashboardDrilldown,
  DashboardDrilldownSchema,
} from './schemas/dashboard-drilldown.schema';
import {
  NsDashboardDailyAggregate,
  NsDashboardDailyAggregateSchema,
} from './schemas/ns-dashboard-daily-aggregate.schema';
import {
  NsDashboardSummary,
  NsDashboardSummarySchema,
} from './schemas/ns-dashboard-summary.schema';
import {
  NsDashboardDrilldown,
  NsDashboardDrilldownSchema,
} from './schemas/ns-dashboard-drilldown.schema';
import { DashboardSummaryService } from './services/dashboard-summary.service';
import { DashboardSummaryController } from './controllers/dashboard-summary.controller';
import { DashboardSecondaryCardsService } from './services/dashboard-secondary-cards.service';
import { DashboardSummaryPrecomputeService } from './services/dashboard-summary-precompute.service';
import { DashboardSummaryFhrInvalidationHook } from './services/dashboard-summary-fhr-invalidation.hook';
import { DailyAggregateGeneratorService } from './services/daily-aggregate-generator.service';
import { DailyAggregateSummaryService } from './services/daily-aggregate-summary.service';
import { DashboardCardGeneratorService } from './services/dashboard-card-generator.service';
import { UnifiedDashboardSummaryAggregatorService } from './services/unified-dashboard-summary-aggregator.service';
import { FhrCollectionModule } from '../fhr-collection/fhr-collection.module';
import { NsFhrCollectionModule } from '../ns-fhr-collection/ns-fhr-collection.module';
import { EquipmentManpowerModule } from '../equipment-manpower/equipment-manpower.module';
import { AdvanceAircraftModule } from '../advance-aircraft/advance-aircraft.module';
import { AdminStationsModule } from '../admin-stations/admin-stations.module';
import { DashboardInvalidationService } from './services/dashboard-invalidation.service';
import { DashboardRefreshQueueService } from './services/dashboard-refresh-queue.service';
import { DashboardRefreshLockService } from './services/dashboard-refresh-lock.service';
import { DashboardMetricsService } from './services/dashboard-metrics.service';
import { DashboardWarmStateService } from './services/dashboard-warm-state.service';
import { DashboardStartupWarmService } from './services/dashboard-startup-warm.service';
import { DashboardDrilldownService } from './services/dashboard-drilldown.service';
import { DashboardSummaryWorkerService } from './services/dashboard-summary-worker.service';
import { DashboardSummaryReadService } from './services/dashboard-summary-read.service';
import { DashboardSummaryMaintenanceService } from './services/dashboard-summary-maintenance.service';
import { DashboardSummaryIndexMigrationService } from './services/dashboard-summary-index-migration.service';
import { InMemoryFhrWindowCacheProvider } from './providers/fhr-window-cache-inmemory.provider';
import { FHR_WINDOW_CACHE_PROVIDER } from './providers/fhr-window-cache.provider';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DashboardSummary.name, schema: DashboardSummarySchema },
      { name: DashboardDailyAggregate.name, schema: DashboardDailyAggregateSchema },
      { name: DashboardDrilldown.name, schema: DashboardDrilldownSchema },
      {
        name: NsDashboardSummary.name,
        schema: NsDashboardSummarySchema,
      },
      {
        name: NsDashboardDailyAggregate.name,
        schema: NsDashboardDailyAggregateSchema,
      },
      {
        name: NsDashboardDrilldown.name,
        schema: NsDashboardDrilldownSchema,
      },
    ]),
    FhrCollectionModule,
    NsFhrCollectionModule,
    EquipmentManpowerModule,
    AdvanceAircraftModule,
    AdminStationsModule,
  ],
  controllers: [DashboardSummaryController],
  providers: [
    DashboardSummaryIndexMigrationService,
    DashboardSummaryService,
    DashboardDrilldownService,
    DailyAggregateSummaryService,
    DailyAggregateGeneratorService,
    DashboardCardGeneratorService,
    DashboardSummaryReadService,
    DashboardSummaryWorkerService,
    DashboardSummaryMaintenanceService,
    UnifiedDashboardSummaryAggregatorService,
    DashboardSecondaryCardsService,
    DashboardSummaryPrecomputeService,
    DashboardSummaryFhrInvalidationHook,
    DashboardInvalidationService,
    DashboardRefreshQueueService,
    DashboardRefreshLockService,
    DashboardMetricsService,
    DashboardWarmStateService,
    {
      provide: FHR_WINDOW_CACHE_PROVIDER,
      useClass: InMemoryFhrWindowCacheProvider,
    },
    DashboardStartupWarmService,
  ],
  exports: [
    DashboardSummaryService,
    DailyAggregateSummaryService,
    DashboardSummaryReadService,
    DashboardSummaryWorkerService,
    DashboardSummaryPrecomputeService,
    DashboardWarmStateService,
    DashboardMetricsService,
    MongooseModule,
  ],
})
export class DashboardSummaryModule {}
