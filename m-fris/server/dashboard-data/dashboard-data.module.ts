import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  DashboardData,
  DashboardDataSchema,
} from './schema/dashboard-data.schema';
import { DashboardDataController } from './controllers/dashboard-data.controller';
import { DashboardDataService } from './services/dashboard-data.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DashboardData.name, schema: DashboardDataSchema },
    ]),
  ],
  controllers: [DashboardDataController],
  providers: [DashboardDataService],
  exports: [DashboardDataService],
})
export class DashboardDataModule {}
