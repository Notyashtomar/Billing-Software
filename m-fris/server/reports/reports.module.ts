import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Report, ReportSchema } from './schema/reports.schema';
import {
  DelayReportSummary,
  DelayReportSummarySchema,
} from './schema/delay-report-summary.schema';
import { ReportsService } from './services/reports.service';
import { ReportAggregationService } from './services/report-aggregation.service';
import { DelayAnalyticsService } from './services/delay-analytics.service';
import { DelayReportSummaryService } from './services/delay-report-summary.service';
import { DelayReportDailyMaterializeService } from './services/delay-report-daily-materialize.service';
import { ReportsController } from './controllers/reports.controller';
import { MainDetailsModule } from '../main-details/main-details.module';
import { TerminalDetailsModule } from '../terminal-details/terminal-details.module';
import { LoadControlDetailsModule } from '../load-control-details/load-control-details.module';
import { RampDetails1Module } from '../ramp-details-1/ramp-details-1.module';
import { RemarksModule } from '../remarks/remarks.module';
import { AdvanceAircraftModule } from '../advance-aircraft/advance-aircraft.module';
import { RawFlightDataModule } from '../raw-flight-data/raw-flight-data.module';
import { FhrCollectionModule } from '../fhr-collection/fhr-collection.module';
import { DashboardSummaryModule } from '../dashboard-summary/dashboard-summary.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Report.name, schema: ReportSchema },
      { name: DelayReportSummary.name, schema: DelayReportSummarySchema },
    ]),
    RawFlightDataModule,
    FhrCollectionModule,
    DashboardSummaryModule,
    MainDetailsModule,
    TerminalDetailsModule,
    LoadControlDetailsModule,
    RampDetails1Module,
    RemarksModule,
    AdvanceAircraftModule,
  ],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportAggregationService,
    DelayAnalyticsService,
    DelayReportSummaryService,
    DelayReportDailyMaterializeService,
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
