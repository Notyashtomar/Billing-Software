import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TerminalDetails,
  TerminalDetailsSchema,
} from './schema/terminal-details.schema';
import { TerminalDetailsService } from './services/terminal-details.service';
import { TerminalDetailsController } from './controllers/terminal-details.controller';
import { FhrCollectionModule } from 'src/fhr-collection/fhr-collection.module';

@Module({
  imports: [
    FhrCollectionModule,
    MongooseModule.forFeature([
      { name: TerminalDetails.name, schema: TerminalDetailsSchema },
    ]),
  ],
  controllers: [TerminalDetailsController],
  providers: [TerminalDetailsService],
  exports: [TerminalDetailsService],
})
export class TerminalDetailsModule {}
