import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  FhrCollection,
  FhrCollectionSchema,
} from './schema/fhr-collection.schema';
import { FhrCollectionService } from './services/fhr-collection.service';
import { FhrCollectionController } from './controllers/fhr-collection.controller';
import {
  MainDetails,
  MainDetailsCollectionSchema,
} from 'src/main-details/schema/main-details.schema';
import {
  TerminalDetails,
  TerminalDetailsSchema,
} from 'src/terminal-details/schema/terminal-details.schema';
import {
  LoadControlDetails,
  LoadControlDetailsSchema,
} from 'src/load-control-details/schema/load-control-details.schema';
import {
  RampDetails1,
  RampDetails1Schema,
} from 'src/ramp-details-1/schema/ramp-details-1.schema';
import {
  RampDetails2,
  RampDetails2Schema,
} from 'src/ramp-details-2/schema/ramp-details-2.schema';
import {
  RampDetails3,
  RampDetails3Schema,
} from 'src/ramp-details-3/schema/ramp-details-3.schema';
import { Remarks, RemarksSchema } from 'src/remarks/schema/remarks.schema';
import {
  EquipmentManpower,
  EquipmentManpowerSchema,
} from 'src/equipment-manpower/schema/equipment-manpower.schema';
import {
  Attachments,
  AttachmentsSchema,
} from 'src/attachments/schema/attachments.schema';
import {
  FlightInstanceIndex,
  FlightInstanceIndexSchema,
} from 'src/raw-flight-data/schema/flight-instance-index.schema';
import { Report, ReportSchema } from 'src/reports/schema/reports.schema';
import { AdvanceAircraftModule } from 'src/advance-aircraft/advance-aircraft.module';
import { AdvanceGhrepModule } from 'src/advance-ghrep/advance-ghrep.module';
import { AdvanceGatewayScheduledAirlineModule } from 'src/advance-gateway-scheduled-airline/advance-gateway-scheduled-airline.module';
import { AdvanceContactModule } from 'src/advance-contact/advance-contact.module';
import { ReportsPaxShiftReportModule } from 'src/reports-pax-shift-report/reports-pax-shift-report.module';
import { SharedReportsEmailService } from './services/shared-reports-email.service';
import { FhrSignatureService } from './services/fhr-signature.service';
import { AdminMessagingModule } from 'src/admin-messaging/admin-messaging.module';
import { RepresentativeSignaturesModule } from 'src/representative-signatures/representative-signatures.module';
import { NsFhrCollectionModule } from '../ns-fhr-collection/ns-fhr-collection.module';
import { RafCollectionModule } from '../raf-collection/raf-collection.module';

@Module({
  imports: [
    forwardRef(() => AdminMessagingModule),
    RepresentativeSignaturesModule,
    AdvanceAircraftModule,
    AdvanceGhrepModule,
    AdvanceGatewayScheduledAirlineModule,
    AdvanceContactModule,
    ReportsPaxShiftReportModule,
    NsFhrCollectionModule,
    RafCollectionModule,
    MongooseModule.forFeature([
      { name: FhrCollection.name, schema: FhrCollectionSchema },
      { name: MainDetails.name, schema: MainDetailsCollectionSchema },
      { name: TerminalDetails.name, schema: TerminalDetailsSchema },
      { name: LoadControlDetails.name, schema: LoadControlDetailsSchema },
      { name: RampDetails1.name, schema: RampDetails1Schema },
      { name: RampDetails2.name, schema: RampDetails2Schema },
      { name: RampDetails3.name, schema: RampDetails3Schema },
      { name: Remarks.name, schema: RemarksSchema },
      { name: EquipmentManpower.name, schema: EquipmentManpowerSchema },
      { name: Attachments.name, schema: AttachmentsSchema },
      { name: FlightInstanceIndex.name, schema: FlightInstanceIndexSchema },
      { name: Report.name, schema: ReportSchema },
    ]),
  ],
  controllers: [FhrCollectionController],
  providers: [
    FhrCollectionService,
    SharedReportsEmailService,
    FhrSignatureService,
  ],
  exports: [FhrCollectionService, MongooseModule],
})
export class FhrCollectionModule {}
