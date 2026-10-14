import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdvanceCargo,
  AdvanceCargoSchema,
} from './schema/advance-cargo.schema';
import { AdvanceCargoService } from './services/advance-cargo.service';
import { AdvanceCargoController } from './controllers/advance-cargo.controller';
import { RawFlightDataModule } from '../raw-flight-data/raw-flight-data.module';
import { AdvanceAirlineModule } from '../advance-airline/advance-airline.module';
import { AdvanceAircraftModule } from '../advance-aircraft/advance-aircraft.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdvanceCargo.name, schema: AdvanceCargoSchema },
    ]),
    RawFlightDataModule,
    AdvanceAirlineModule,
    AdvanceAircraftModule,
  ],
  controllers: [AdvanceCargoController],
  providers: [AdvanceCargoService],
  exports: [AdvanceCargoService],
})
export class AdvanceCargoModule {}
