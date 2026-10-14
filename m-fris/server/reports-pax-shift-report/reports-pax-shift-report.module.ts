import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdminEmail,
  AdminEmailSchema,
} from '../auth/schema/admin-email.schema';
import {
  ReportsPaxShiftReport,
  ReportsPaxShiftReportSchema,
} from './schema/reports-pax-shift-report.schema';
import { ReportsPaxShiftReportController } from './controllers/reports-pax-shift-report.controller';
import { ReportsPaxShiftReportService } from './services/reports-pax-shift-report.service';
import { PaxShiftReportEmailService } from './services/pax-shift-report-email.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: ReportsPaxShiftReport.name,
        schema: ReportsPaxShiftReportSchema,
      },
      { name: AdminEmail.name, schema: AdminEmailSchema },
    ]),
  ],
  controllers: [ReportsPaxShiftReportController],
  providers: [ReportsPaxShiftReportService, PaxShiftReportEmailService],
  exports: [ReportsPaxShiftReportService, PaxShiftReportEmailService],
})
export class ReportsPaxShiftReportModule {}
