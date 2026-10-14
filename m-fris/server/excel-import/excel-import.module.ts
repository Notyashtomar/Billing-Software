import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MainDetailsModule } from 'src/main-details/main-details.module';
import { TerminalDetailsModule } from 'src/terminal-details/terminal-details.module';
import { RampDetails1Module } from 'src/ramp-details-1/ramp-details-1.module';
import { LoadControlDetailsModule } from 'src/load-control-details/load-control-details.module';
import { RemarksModule } from 'src/remarks/remarks.module';
import { AttachmentsModule } from 'src/attachments/attachments.module';
import { FhrCollectionModule } from 'src/fhr-collection/fhr-collection.module';
import { CreationModule } from 'src/creation/creation.module';
import { AdvanceRafAirlineModule } from 'src/advance-raf-airline/advance-raf-airline.module';
import { RawFlightDataModule } from 'src/raw-flight-data/raw-flight-data.module';
import {
  CreationRaf,
  CreationRafSchema,
} from 'src/creation/schema/creation-raf.schema';
import {
  AdvanceRafAirline,
  AdvanceRafAirlineSchema,
} from 'src/advance-raf-airline/schema/advance-raf-airline.schema';
import {
  FhrCollection,
  FhrCollectionSchema,
} from 'src/fhr-collection/schema/fhr-collection.schema';
import { MaaExcelImportService } from './maa-excel-import.service';
import { MaaExcelImportController } from './maa-excel-import.controller';
import { FhrMainDetailsReseedService } from './fhr-main-details-reseed.service';
import { ScheduledEquipmentImportService } from './scheduled-equipment-import.service';
import { HydJulyFhrSeedService } from './hyd-july-fhr-seed.service';
import { MaaRafExcelSeedService } from './maa-raf-excel-seed.service';

@Module({
  imports: [
    MainDetailsModule,
    TerminalDetailsModule,
    RampDetails1Module,
    LoadControlDetailsModule,
    RemarksModule,
    AttachmentsModule,
    FhrCollectionModule,
    AdvanceRafAirlineModule,
    forwardRef(() => CreationModule),
    forwardRef(() => RawFlightDataModule),
    MongooseModule.forFeature([
      { name: FhrCollection.name, schema: FhrCollectionSchema },
      { name: CreationRaf.name, schema: CreationRafSchema },
      { name: AdvanceRafAirline.name, schema: AdvanceRafAirlineSchema },
    ]),
  ],
  controllers: [MaaExcelImportController],
  providers: [
    MaaExcelImportService,
    FhrMainDetailsReseedService,
    ScheduledEquipmentImportService,
    HydJulyFhrSeedService,
    MaaRafExcelSeedService,
  ],
  exports: [
    MaaExcelImportService,
    FhrMainDetailsReseedService,
    ScheduledEquipmentImportService,
    HydJulyFhrSeedService,
    MaaRafExcelSeedService,
  ],
})
export class ExcelImportModule {}
