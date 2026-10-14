import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdvanceAirline, AdvanceAirlineSchema } from '../advance-airline/schema/advance-airline.schema';
import { AdvanceAircraft, AdvanceAircraftSchema } from '../advance-aircraft/schema/advance-aircraft.schema';
import { AdvanceTerminal, AdvanceTerminalSchema } from '../advance-terminal/schema/advance-terminal.schema';
import {
  CreationAdditionalFlights,
  CreationAdditionalFlightsSchema,
} from '../creation/schema/creation-additional-flights.schema';
import { FlightImportController } from './controllers/flight-import.controller';
import { ImportHistory, ImportHistorySchema } from './schema/import-history.schema';
import { FlightImportDbValidationService } from './services/flight-import-db-validation.service';
import { FlightImportErrorExcelService } from './services/flight-import-error-excel.service';
import { FlightImportMasterDataService } from './services/flight-import-master-data.service';
import { FlightImportPersistenceService } from './services/flight-import-persistence.service';
import { FlightImportService } from './services/flight-import.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ImportHistory.name, schema: ImportHistorySchema },
      { name: CreationAdditionalFlights.name, schema: CreationAdditionalFlightsSchema },
      { name: AdvanceAirline.name, schema: AdvanceAirlineSchema },
      { name: AdvanceAircraft.name, schema: AdvanceAircraftSchema },
      { name: AdvanceTerminal.name, schema: AdvanceTerminalSchema },
    ]),
  ],
  controllers: [FlightImportController],
  providers: [
    FlightImportService,
    FlightImportMasterDataService,
    FlightImportDbValidationService,
    FlightImportErrorExcelService,
    FlightImportPersistenceService,
  ],
  exports: [FlightImportService],
})
export class ImportModule {}
