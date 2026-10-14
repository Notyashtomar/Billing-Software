import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdvanceAirlineLogo,
  AdvanceAirlineLogoSchema,
} from './schema/advance-airline-logo.schema';
import { AdvanceAirlineLogoService } from './services/advance-airline-logo.service';
import { AdvanceAirlineLogoController } from './controllers/advance-airline-logo.controller';
import { AdvanceAirlineModule } from '../advance-airline/advance-airline.module';

@Module({
  imports: [
    AdvanceAirlineModule,
    MongooseModule.forFeature([
      { name: AdvanceAirlineLogo.name, schema: AdvanceAirlineLogoSchema },
    ]),
  ],
  controllers: [AdvanceAirlineLogoController],
  providers: [AdvanceAirlineLogoService],
  exports: [AdvanceAirlineLogoService],
})
export class AdvanceAirlineLogoModule {}
