import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdvanceNsGhrep,
  AdvanceNsGhrepSchema,
} from './schema/advance-ns-ghrep.schema';
import { AdvanceNsGhrepService } from './services/advance-ns-ghrep.service';
import { AdvanceNsGhrepController } from './controllers/advance-ns-ghrep.controller';
import { RepresentativeSignaturesModule } from '../representative-signatures/representative-signatures.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdvanceNsGhrep.name, schema: AdvanceNsGhrepSchema },
    ]),
    RepresentativeSignaturesModule,
  ],
  controllers: [AdvanceNsGhrepController],
  providers: [AdvanceNsGhrepService],
  exports: [AdvanceNsGhrepService],
})
export class AdvanceNsGhrepModule {}
