import { Module } from '@nestjs/common';
import { FhrCollectionModule } from '../fhr-collection/fhr-collection.module';
import { NsFhrCollectionModule } from '../ns-fhr-collection/ns-fhr-collection.module';
import { MisAirlineWiseController } from './controllers/mis-airline-wise.controller';
import { MisMonthWiseController } from './controllers/mis-month-wise.controller';
import { MisRemarksController } from './controllers/mis-remarks.controller';
import { MisStationWiseController } from './controllers/mis-station-wise.controller';
import { MisAirlineWiseService } from './services/mis-airline-wise.service';
import { MisMonthWiseService } from './services/mis-month-wise.service';
import { MisRemarksService } from './services/mis-remarks.service';
import { MisStationWiseService } from './services/mis-station-wise.service';

@Module({
  imports: [FhrCollectionModule, NsFhrCollectionModule],
  controllers: [
    MisStationWiseController,
    MisMonthWiseController,
    MisAirlineWiseController,
    MisRemarksController,
  ],
  providers: [
    MisStationWiseService,
    MisMonthWiseService,
    MisAirlineWiseService,
    MisRemarksService,
  ],
  exports: [
    MisStationWiseService,
    MisMonthWiseService,
    MisAirlineWiseService,
    MisRemarksService,
  ],
})
export class MisStationWiseModule {}
