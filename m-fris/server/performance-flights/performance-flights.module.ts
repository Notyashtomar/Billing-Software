import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PerformanceFlightsSnapshot,
  PerformanceFlightsSnapshotSchema,
} from './schema/performance-flights-snapshot.schema';
import { PerformanceFlightsController } from './controllers/performance-flights.controller';
import { PerformanceFlightsService } from './services/performance-flights.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: PerformanceFlightsSnapshot.name,
        schema: PerformanceFlightsSnapshotSchema,
      },
    ]),
  ],
  controllers: [PerformanceFlightsController],
  providers: [PerformanceFlightsService],
  exports: [PerformanceFlightsService],
})
export class PerformanceFlightsModule {}
