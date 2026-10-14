import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdvanceRafAirline,
  AdvanceRafAirlineSchema,
} from './schema/advance-raf-airline.schema';
import { AdvanceRafAirlineService } from './services/advance-raf-airline.service';
import { AdvanceRafAirlineController } from './controllers/advance-raf-airline.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdvanceRafAirline.name, schema: AdvanceRafAirlineSchema },
    ]),
  ],
  controllers: [AdvanceRafAirlineController],
  providers: [AdvanceRafAirlineService],
  exports: [AdvanceRafAirlineService],
})
export class AdvanceRafAirlineModule {}
