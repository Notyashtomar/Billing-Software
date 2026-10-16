import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminStationsController } from './controllers/admin-stations.controller';
import {
  AdminStation,
  AdminStationSchema,
} from './schema/admin-station.schema';
import { AdminStationsService } from './services/admin-stations.service';
import { User, UserSchema } from '../user/schema/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdminStation.name, schema: AdminStationSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AdminStationsController],
  providers: [AdminStationsService],
  exports: [AdminStationsService],
})
export class AdminStationsModule {}
