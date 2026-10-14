import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  RampDetails3,
  RampDetails3Schema,
} from './schema/ramp-details-3.schema';
import { RampDetails3Service } from './services/ramp-details-3.service';
import { RampDetails3Controller } from './controllers/ramp-details-3.controller';
import { RampDetails3ByFhrController } from './controllers/ramp-details-3-by-fhr.controller';
import { FhrCollectionModule } from 'src/fhr-collection/fhr-collection.module';

@Module({
  imports: [
    FhrCollectionModule,
    MongooseModule.forFeature([
      { name: RampDetails3.name, schema: RampDetails3Schema },
    ]),
  ],
  controllers: [RampDetails3Controller, RampDetails3ByFhrController],
  providers: [RampDetails3Service],
  exports: [RampDetails3Service],
})
export class RampDetails3Module {}
