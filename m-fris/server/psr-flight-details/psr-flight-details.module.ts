import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PsrFlightDetails,
  PsrFlightDetailsSchema,
} from './schema/psr-flight-details.schema';
import { PsrFlightDetailsController } from './controllers/psr-flight-details.controller';
import { PsrFlightDetailsService } from './services/psr-flight-details.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PsrFlightDetails.name, schema: PsrFlightDetailsSchema },
    ]),
  ],
  controllers: [PsrFlightDetailsController],
  providers: [PsrFlightDetailsService],
  exports: [PsrFlightDetailsService],
})
export class PsrFlightDetailsModule {}
