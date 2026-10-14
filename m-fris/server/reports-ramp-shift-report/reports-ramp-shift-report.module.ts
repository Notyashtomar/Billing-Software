import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ReportsRampShiftReport,
  ReportsRampShiftReportSchema,
} from './schema/reports-ramp-shift-report.schema';
import { ReportsRampShiftReportController } from './controllers/reports-ramp-shift-report.controller';
import { ReportsRampShiftReportService } from './services/reports-ramp-shift-report.service';
import { RawFlightDataModule } from '../raw-flight-data/raw-flight-data.module';
import { FhrCollectionModule } from '../fhr-collection/fhr-collection.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: ReportsRampShiftReport.name,
        schema: ReportsRampShiftReportSchema,
      },
    ]),
    RawFlightDataModule,
    FhrCollectionModule,
  ],
  controllers: [ReportsRampShiftReportController],
  providers: [ReportsRampShiftReportService],
  exports: [ReportsRampShiftReportService],
})
export class ReportsRampShiftReportModule {}
