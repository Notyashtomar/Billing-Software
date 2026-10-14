import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  RampDetails2,
  RampDetails2Schema,
} from './schema/ramp-details-2.schema';
import { RampDetails2Service } from './services/ramp-details-2.service';
import { RampDetails2Controller } from './controllers/ramp-details-2.controller';
import { RampDetails2ByFhrController } from './controllers/ramp-details-2-by-fhr.controller';
import { FhrCollectionModule } from 'src/fhr-collection/fhr-collection.module';

@Module({
  imports: [
    FhrCollectionModule,
    MongooseModule.forFeature([
      { name: RampDetails2.name, schema: RampDetails2Schema },
    ]),
  ],
  controllers: [RampDetails2Controller, RampDetails2ByFhrController],
  providers: [RampDetails2Service],
  exports: [RampDetails2Service],
})
export class RampDetails2Module {}
