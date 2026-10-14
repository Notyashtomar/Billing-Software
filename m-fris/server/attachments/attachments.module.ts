import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Attachments, AttachmentsSchema } from './schema/attachments.schema';
import { AttachmentsService } from './services/attachments.service';
import { AttachmentsController } from './controllers/attachments.controller';
import { FhrCollectionModule } from 'src/fhr-collection/fhr-collection.module';

@Module({
  imports: [
    FhrCollectionModule,
    MongooseModule.forFeature([
      { name: Attachments.name, schema: AttachmentsSchema },
    ]),
  ],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
