import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdvanceDcsMaster,
  AdvanceDcsMasterSchema,
} from './schema/advance-dcs-master.schema';
import { AdvanceDcsMasterService } from './services/advance-dcs-master.service';
import { AdvanceDcsMasterController } from './controllers/advance-dcs-master.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdvanceDcsMaster.name, schema: AdvanceDcsMasterSchema },
    ]),
  ],
  controllers: [AdvanceDcsMasterController],
  providers: [AdvanceDcsMasterService],
  exports: [AdvanceDcsMasterService],
})
export class AdvanceDcsMasterModule {}
