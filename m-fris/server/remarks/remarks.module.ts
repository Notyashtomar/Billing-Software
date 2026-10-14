import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Remarks, RemarksSchema } from './schema/remarks.schema';
import { RemarksService } from './services/remarks.service';
import { RemarksController } from './controllers/remarks.controller';
import { FhrCollectionModule } from 'src/fhr-collection/fhr-collection.module';

@Module({
  imports: [
    FhrCollectionModule,
    MongooseModule.forFeature([{ name: Remarks.name, schema: RemarksSchema }]),
  ],
  controllers: [RemarksController],
  providers: [RemarksService],
  exports: [RemarksService],
})
export class RemarksModule {}
