import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  RampDetails1,
  RampDetails1Schema,
} from './schema/ramp-details-1.schema';
import { RampDetails1Service } from './services/ramp-details-1.service';
import { RampDetails1Controller } from './controllers/ramp-details-1.controller';
import { FhrCollectionModule } from 'src/fhr-collection/fhr-collection.module';

@Module({
  imports: [
    FhrCollectionModule,
    MongooseModule.forFeature([
      { name: RampDetails1.name, schema: RampDetails1Schema },
    ]),
  ],
  controllers: [RampDetails1Controller],
  providers: [RampDetails1Service],
  exports: [RampDetails1Service],
})
export class RampDetails1Module {}
