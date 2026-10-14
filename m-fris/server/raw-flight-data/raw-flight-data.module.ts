import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  RawFlightData,
  RawFlightDataSchema,
} from './schema/raw-flight-data.schema';
import {
  AdvanceScheduleSetup,
  AdvanceScheduleSetupSchema,
} from './schema/advance-schedule-setup.schema';
import {
  ScheduledAirlinesCreation,
  ScheduledAirlinesCreationSchema,
} from './schema/scheduled-airlines-creation.schema';
import {
  FlightInstanceIndex,
  FlightInstanceIndexSchema,
} from './schema/flight-instance-index.schema';
import {
  FlightSerialCounter,
  FlightSerialCounterSchema,
} from './schema/flight-serial-counter.schema';
import {
  CreationAdditionalFlights,
  CreationAdditionalFlightsSchema,
} from '../creation/schema/creation-additional-flights.schema';
import {
  MainDetails,
  MainDetailsCollectionSchema,
} from '../main-details/schema/main-details.schema';
import {
  TerminalDetails,
  TerminalDetailsSchema,
} from '../terminal-details/schema/terminal-details.schema';
import {
  RampDetails1,
  RampDetails1Schema,
} from '../ramp-details-1/schema/ramp-details-1.schema';
import { Remarks, RemarksSchema } from '../remarks/schema/remarks.schema';
import {
  LoadControlDetails,
  LoadControlDetailsSchema,
} from '../load-control-details/schema/load-control-details.schema';
import {
  EquipmentManpower,
  EquipmentManpowerSchema,
} from '../equipment-manpower/schema/equipment-manpower.schema';
import {
  ScheduledDailyRow,
  ScheduledDailyRowSchema,
} from './schema/scheduled-daily-row.schema';
import {
  ScheduledDailyProjectionOutbox,
  ScheduledDailyProjectionOutboxSchema,
} from './schema/scheduled-daily-projection-outbox.schema';
import { RawFlightDataService } from './services/raw-flight-data.service';
import { RawFlightBulkService } from './services/raw-flight-bulk.service';
import { ScheduledDailyReadService } from './services/scheduled-daily-read.service';
import { ScheduledDailyProjectorService } from './services/scheduled-daily-projector.service';
import { ScheduledDailyProjectionOutboxService } from './services/scheduled-daily-projection-outbox.service';
import { ScheduledDailyProjectionWorkerService } from './services/scheduled-daily-projection-worker.service';
import { ScheduledDailyParityService } from './services/scheduled-daily-parity.service';
import { ScheduledDailyCanaryService } from './services/scheduled-daily-canary.service';
import { ScheduledDailyRefreshListener } from './services/scheduled-daily-refresh.listener';
import { RawFlightDataController } from './controllers/raw-flight-data.controller';
import { ScheduledAirlinePipelineController } from './controllers/scheduled-airline-pipeline.controller';
import { FlightCancellationsModule } from '../flight-cancellations/flight-cancellations.module';
import { FhrCollectionModule } from '../fhr-collection/fhr-collection.module';

@Module({
  imports: [
    forwardRef(() => FlightCancellationsModule),
    FhrCollectionModule,
    MongooseModule.forFeature([
      { name: MainDetails.name, schema: MainDetailsCollectionSchema },
      { name: TerminalDetails.name, schema: TerminalDetailsSchema },
      { name: RampDetails1.name, schema: RampDetails1Schema },
      { name: LoadControlDetails.name, schema: LoadControlDetailsSchema },
      { name: EquipmentManpower.name, schema: EquipmentManpowerSchema },
      { name: Remarks.name, schema: RemarksSchema },
      { name: RawFlightData.name, schema: RawFlightDataSchema },
      { name: AdvanceScheduleSetup.name, schema: AdvanceScheduleSetupSchema },
      {
        name: ScheduledAirlinesCreation.name,
        schema: ScheduledAirlinesCreationSchema,
      },
      {
        name: FlightInstanceIndex.name,
        schema: FlightInstanceIndexSchema,
      },
      {
        name: FlightSerialCounter.name,
        schema: FlightSerialCounterSchema,
      },
      {
        name: CreationAdditionalFlights.name,
        schema: CreationAdditionalFlightsSchema,
      },
      // CP-01 read model + outbox (reads still legacy until Phase 3+).
      { name: ScheduledDailyRow.name, schema: ScheduledDailyRowSchema },
      {
        name: ScheduledDailyProjectionOutbox.name,
        schema: ScheduledDailyProjectionOutboxSchema,
      },
    ]),
  ],
  controllers: [RawFlightDataController, ScheduledAirlinePipelineController],
  providers: [
    RawFlightDataService,
    RawFlightBulkService,
    ScheduledDailyReadService,
    ScheduledDailyProjectorService,
    ScheduledDailyProjectionOutboxService,
    ScheduledDailyProjectionWorkerService,
    ScheduledDailyParityService,
    ScheduledDailyCanaryService,
    ScheduledDailyRefreshListener,
  ],
  exports: [
    RawFlightDataService,
    RawFlightBulkService,
    ScheduledDailyReadService,
  ],
})
export class RawFlightDataModule {}
