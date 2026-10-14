import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  DashboardKpiFlight,
  DashboardKpiFlightSchema,
} from './schema/dashboard-kpi-flight.schema';
import { DashboardKpiFlightsController } from './controllers/dashboard-kpi-flights.controller';
import { DashboardKpiFlightsService } from './services/dashboard-kpi-flights.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DashboardKpiFlight.name, schema: DashboardKpiFlightSchema },
    ]),
  ],
  controllers: [DashboardKpiFlightsController],
  providers: [DashboardKpiFlightsService],
  exports: [DashboardKpiFlightsService],
})
export class DashboardKpiFlightsModule {}
