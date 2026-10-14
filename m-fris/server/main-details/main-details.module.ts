import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  MainDetails,
  MainDetailsCollectionSchema,
} from './schema/main-details.schema';
import { MainDetailsService } from './services/main-details.service';
import { MainDetailsController } from './controllers/main-details.controller';
import { RawFlightDataModule } from 'src/raw-flight-data/raw-flight-data.module';
import { FlightInstanceStateModule } from 'src/flight-instance-state/flight-instance-state.module';
import { FhrCollectionModule } from 'src/fhr-collection/fhr-collection.module';

@Module({
  imports: [
    FhrCollectionModule,
    RawFlightDataModule,
    FlightInstanceStateModule,
    MongooseModule.forFeature([
      { name: MainDetails.name, schema: MainDetailsCollectionSchema },
    ]),
  ],
  controllers: [MainDetailsController],
  providers: [MainDetailsService],
  exports: [MainDetailsService],
})
export class MainDetailsModule {}
