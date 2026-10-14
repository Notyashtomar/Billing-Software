import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { MainDetailsModule } from './main-details/main-details.module';
import { TerminalDetailsModule } from './terminal-details/terminal-details.module';
import { LoadControlDetailsModule } from './load-control-details/load-control-details.module';
import { RampDetails1Module } from './ramp-details-1/ramp-details-1.module';
import { RampDetails2Module } from './ramp-details-2/ramp-details-2.module';
import { RampDetails3Module } from './ramp-details-3/ramp-details-3.module';
import { RemarksModule } from './remarks/remarks.module';
import { EquipmentManpowerModule } from './equipment-manpower/equipment-manpower.module';
import { EquipmentDetailsModule } from './equipment-details/equipment-details.module';
import { ReportsModule } from './reports/reports.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { RawFlightDataModule } from './raw-flight-data/raw-flight-data.module';
import { MiddlewaresMiddleware } from './user/middlewares/middlewares.middleware';
import { ManifestModule } from './manifest/manifest.module';
import { AdvanceAirlineModule } from './advance-airline/advance-airline.module';
import { AdvanceAircraftModule } from './advance-aircraft/advance-aircraft.module';
import { AdvanceEquipmentModule } from './advance-equipment/advance-equipment.module';
import { FlightsReferenceModule } from './flights-reference/flights-reference.module';
import { AdvanceManpowerModule } from './advance-manpower/advance-manpower.module';
import { AdvanceNonScheduledAirlineModule } from './advance-non-scheduled-airline/advance-non-scheduled-airline.module';
import { NonScheduledBookingModule } from './non-scheduled-booking/non-scheduled-booking.module';
import { AdvanceGatewayScheduledAirlineModule } from './advance-gateway-scheduled-airline/advance-gateway-scheduled-airline.module';
import { AdvanceRafAirlineModule } from './advance-raf-airline/advance-raf-airline.module';
import { AdvanceContactModule } from './advance-contact/advance-contact.module';
import { AdvanceNsContactModule } from './advance-ns-contact/advance-ns-contact.module';
import { AdvanceNsGhrepModule } from './advance-ns-ghrep/advance-ns-ghrep.module';
import { AdvanceTerminalModule } from './advance-terminal/advance-terminal.module';
import { AdvanceOtherServicesModule } from './advance-other-services/advance-other-services.module';
import { AdvanceDcsMasterModule } from './advance-dcs-master/advance-dcs-master.module';
import { AdvanceAmsServicesModule } from './advance-ams-services/advance-ams-services.module';
import { AdvanceAircraftRegistrationModule } from './advance-aircraft-registration/advance-aircraft-registration.module';
import { AdvanceAirlineLogoModule } from './advance-airline-logo/advance-airline-logo.module';
import { DashboardKpiFlightsModule } from './dashboard-kpi-flights/dashboard-kpi-flights.module';
import { DashboardDataModule } from './dashboard-data/dashboard-data.module';
import { OperationEmployeesModule } from './operation-employees/operation-employees.module';
import { ShippedBagsModule } from './shipped-bags/shipped-bags.module';
import { PaxDutyAllocationModule } from './pax-duty-allocation/pax-duty-allocation.module';
import { PsrSickLeaveModule } from './psr-sick-leave/psr-sick-leave.module';
import { PsrEmployeeSectionsModule } from './psr-employee-sections/psr-employee-sections.module';
import { PsrFlightDetailsModule } from './psr-flight-details/psr-flight-details.module';
import { ExcelImportModule } from './excel-import/excel-import.module';
import { ImportModule } from './import/import.module';
import { StaAtaDailyModule } from './sta-ata-daily/sta-ata-daily.module';
import { PerformanceFlightsModule } from './performance-flights/performance-flights.module';
import { FhrCollectionModule } from './fhr-collection/fhr-collection.module';
import { NsFhrCollectionModule } from './ns-fhr-collection/ns-fhr-collection.module';
import { RafCollectionModule } from './raf-collection/raf-collection.module';
import { RepresentativeSignaturesModule } from './representative-signatures/representative-signatures.module';
import { DashboardSummaryModule } from './dashboard-summary/dashboard-summary.module';
import { ReportsPaxShiftReportModule } from './reports-pax-shift-report/reports-pax-shift-report.module';
import { ReportsRampShiftReportModule } from './reports-ramp-shift-report/reports-ramp-shift-report.module';
import { AdvanceInvoicingModule } from './advance-invoicing/advance-invoicing.module';
import { TrainingMatrixModule } from './training-matrix/training-matrix.module';
import { AdminDepartmentsModule } from './admin-departments/admin-departments.module';
import { AdminStationsModule } from './admin-stations/admin-stations.module';
import { AdminCompaniesModule } from './admin-companies/admin-companies.module';
import { GlobalJwtAuthGuard } from './common/guards/global-jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { FrisPagePermissionGuard } from './auth/guards/fris-page-permission.guard';
import { ProtectionModule } from './protection/protection.module';
import { RequestIdMiddleware } from './protection/middleware/request-id.middleware';
import { HealthModule } from './health/health.module';
import { CreationModule } from './creation/creation.module';
import { AdvanceCargoModule } from './advance-cargo/advance-cargo.module';
import { AdvanceGhrepModule } from './advance-ghrep/advance-ghrep.module';
import { AdvanceScheduleEquipmentModule } from './advance-schedule-equipment/advance-schedule-equipment.module';
import { AdvanceStaffModule } from './advance-staff/advance-staff.module';
import { UserActivityNotificationsModule } from './user-activity-notifications/user-activity-notifications.module';
import { AdminAccessControlModule } from './admin-access-control/admin-access-control.module';
import { AdminAuditModule } from './admin-audit/admin-audit.module';
import { AdminMessagingModule } from './admin-messaging/admin-messaging.module';
import { AdminIncidentsModule } from './admin-incidents/admin-incidents.module';
import { AdminNotificationsModule } from './admin-notifications/admin-notifications.module';
import { StationModule } from './common/station/station.module';
import { BillingModule } from './billing/billing.module';
import { FileStorageModule } from './common/storage/file-storage.module';
import { MisStationWiseModule } from './mis-station-wise/mis-station-wise.module';

@Module({
  imports: [
    ProtectionModule,
    FileStorageModule,
    StationModule,
    // Load .env globally
    EventEmitterModule.forRoot({ wildcard: false, delimiter: '.' }),

    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', 'env'],
    }),

    ScheduleModule.forRoot(),

    // MongoDB using env
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI'),
      }),
    }),

    HealthModule,
    CreationModule,
    AdvanceCargoModule,
    AdvanceGhrepModule,
    AdvanceScheduleEquipmentModule,
    AdvanceStaffModule,

    AdminModule,
    UserModule,
    AuthModule,
    MainDetailsModule,
    TerminalDetailsModule,
    LoadControlDetailsModule,
    RampDetails1Module,
    RampDetails2Module,
    RampDetails3Module,
    RemarksModule,
    EquipmentManpowerModule,
    EquipmentDetailsModule,
    ReportsModule,
    AttachmentsModule,
    RawFlightDataModule,
    StaAtaDailyModule,
    ManifestModule,
    AdvanceAirlineModule,
    AdvanceAircraftModule,
    AdvanceEquipmentModule,
    FlightsReferenceModule,
    AdvanceManpowerModule,
    AdvanceNonScheduledAirlineModule,
    NonScheduledBookingModule,
    AdvanceGatewayScheduledAirlineModule,
    AdvanceRafAirlineModule,
    AdvanceContactModule,
    AdvanceNsContactModule,
    AdvanceNsGhrepModule,
    AdvanceTerminalModule,
    AdvanceOtherServicesModule,
    AdvanceDcsMasterModule,
    AdvanceAmsServicesModule,
    AdvanceAircraftRegistrationModule,
    AdvanceAirlineLogoModule,
    DashboardKpiFlightsModule,
    DashboardDataModule,
    OperationEmployeesModule,
    ShippedBagsModule,
    PaxDutyAllocationModule,
    PsrSickLeaveModule,
    PsrEmployeeSectionsModule,
    PsrFlightDetailsModule,
    ExcelImportModule,
    ImportModule,
    PerformanceFlightsModule,
    FhrCollectionModule,
    NsFhrCollectionModule,
    RafCollectionModule,
    RepresentativeSignaturesModule,
    DashboardSummaryModule,
    ReportsPaxShiftReportModule,
    ReportsRampShiftReportModule,
    AdvanceInvoicingModule,
    TrainingMatrixModule,
    AdminDepartmentsModule,
    AdminAccessControlModule,
    AdminAuditModule,
    AdminMessagingModule,
    AdminIncidentsModule,
    AdminStationsModule,
    AdminCompaniesModule,
    UserActivityNotificationsModule,
    AdminNotificationsModule,
    BillingModule,
    MisStationWiseModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: GlobalJwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: FrisPagePermissionGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
    consumer.apply(MiddlewaresMiddleware).forRoutes('*');
  }
}
