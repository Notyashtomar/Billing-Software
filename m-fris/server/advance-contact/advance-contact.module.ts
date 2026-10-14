import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdvanceContact,
  AdvanceContactSchema,
} from './schema/advance-contact.schema';
import { AdvanceContactService } from './services/advance-contact.service';
import { AdvanceContactController } from './controllers/advance-contact.controller';
import { RepresentativeSignaturesModule } from '../representative-signatures/representative-signatures.module';
import {
  MainDetails,
  MainDetailsCollectionSchema,
} from '../main-details/schema/main-details.schema';
import { AdvanceAirlineModule } from '../advance-airline/advance-airline.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdvanceContact.name, schema: AdvanceContactSchema },
      { name: MainDetails.name, schema: MainDetailsCollectionSchema },
    ]),
    RepresentativeSignaturesModule,
    AdvanceAirlineModule,
  ],
  controllers: [AdvanceContactController],
  providers: [AdvanceContactService],
  exports: [AdvanceContactService],
})
export class AdvanceContactModule {}
