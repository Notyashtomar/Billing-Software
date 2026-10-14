import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  LoadControlDetails,
  LoadControlDetailsSchema,
} from './schema/load-control-details.schema';
import { LoadControlDetailsService } from './services/load-control-details.service';
import { LoadControlDetailsController } from './controllers/load-control-details.controller';
import { FhrCollectionModule } from 'src/fhr-collection/fhr-collection.module';

@Module({
  imports: [
    FhrCollectionModule,
    MongooseModule.forFeature([
      { name: LoadControlDetails.name, schema: LoadControlDetailsSchema },
    ]),
  ],
  controllers: [LoadControlDetailsController],
  providers: [LoadControlDetailsService],
  exports: [LoadControlDetailsService],
})
export class LoadControlDetailsModule {}
