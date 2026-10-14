import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  RafCollection,
  RafCollectionSchema,
} from './schema/raf-collection.schema';
import { RafCollectionService } from './services/raf-collection.service';
import { AdvanceRafAirlineModule } from '../advance-raf-airline/advance-raf-airline.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RafCollection.name, schema: RafCollectionSchema },
    ]),
    forwardRef(() => AdvanceRafAirlineModule),
  ],
  providers: [RafCollectionService],
  exports: [RafCollectionService, MongooseModule],
})
export class RafCollectionModule {}
