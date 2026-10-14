import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  MainDetails,
  MainDetailsCollectionSchema,
} from '../main-details/schema/main-details.schema';
import {
  TerminalDetails,
  TerminalDetailsSchema,
} from '../terminal-details/schema/terminal-details.schema';
import {
  RampDetails3,
  RampDetails3Schema,
} from '../ramp-details-3/schema/ramp-details-3.schema';
import { StaAtaDailyService } from './sta-ata-daily.service';
import { StaAtaDailyController } from './sta-ata-daily.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MainDetails.name, schema: MainDetailsCollectionSchema },
      { name: TerminalDetails.name, schema: TerminalDetailsSchema },
      { name: RampDetails3.name, schema: RampDetails3Schema },
    ]),
  ],
  controllers: [StaAtaDailyController],
  providers: [StaAtaDailyService],
  exports: [StaAtaDailyService],
})
export class StaAtaDailyModule {}
