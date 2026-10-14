import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdvanceGhrep,
  AdvanceGhrepSchema,
} from './schema/advance-ghrep.schema';
import { AdvanceGhrepService } from './services/advance-ghrep.service';
import { AdvanceGhrepController } from './controllers/advance-ghrep.controller';
import { RepresentativeSignaturesModule } from '../representative-signatures/representative-signatures.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdvanceGhrep.name, schema: AdvanceGhrepSchema },
    ]),
    RepresentativeSignaturesModule,
  ],
  controllers: [AdvanceGhrepController],
  providers: [AdvanceGhrepService],
  exports: [AdvanceGhrepService],
})
export class AdvanceGhrepModule {}
