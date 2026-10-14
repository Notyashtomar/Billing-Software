import { Module } from '@nestjs/common';
import { AdvanceAirlineModule } from '../advance-airline/advance-airline.module';
import { AdvanceAircraftModule } from '../advance-aircraft/advance-aircraft.module';
import { AdvanceEquipmentModule } from '../advance-equipment/advance-equipment.module';
import { AdvanceTerminalModule } from '../advance-terminal/advance-terminal.module';
import { FlightsReferenceController } from './flights-reference.controller';

@Module({
  imports: [
    AdvanceAirlineModule,
    AdvanceAircraftModule,
    AdvanceEquipmentModule,
    AdvanceTerminalModule,
  ],
  controllers: [FlightsReferenceController],
})
export class FlightsReferenceModule {}
