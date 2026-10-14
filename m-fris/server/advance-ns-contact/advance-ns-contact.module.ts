import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdvanceNsContact,
  AdvanceNsContactSchema,
} from './schema/advance-ns-contact.schema';
import { AdvanceNsContactService } from './services/advance-ns-contact.service';
import { AdvanceNsContactController } from './controllers/advance-ns-contact.controller';
import { RepresentativeSignaturesModule } from '../representative-signatures/representative-signatures.module';
import { AdvanceNonScheduledAirlineModule } from '../advance-non-scheduled-airline/advance-non-scheduled-airline.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdvanceNsContact.name, schema: AdvanceNsContactSchema },
    ]),
    RepresentativeSignaturesModule,
    AdvanceNonScheduledAirlineModule,
  ],
  controllers: [AdvanceNsContactController],
  providers: [AdvanceNsContactService],
  exports: [AdvanceNsContactService],
})
export class AdvanceNsContactModule {}
