import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdvanceManpower,
  AdvanceManpowerSchema,
} from './schema/advance-manpower.schema';
import { AdvanceManpowerService } from './services/advance-manpower.service';
import { AdvanceManpowerController } from './controllers/advance-manpower.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdvanceManpower.name, schema: AdvanceManpowerSchema },
    ]),
  ],
  controllers: [AdvanceManpowerController],
  providers: [AdvanceManpowerService],
  exports: [AdvanceManpowerService],
})
export class AdvanceManpowerModule {}
