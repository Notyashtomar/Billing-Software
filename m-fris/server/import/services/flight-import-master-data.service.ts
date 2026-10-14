import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdvanceAirline,
  AdvanceAirlineDocument,
} from '../../advance-airline/schema/advance-airline.schema';
import {
  AdvanceAircraft,
  AdvanceAircraftDocument,
} from '../../advance-aircraft/schema/advance-aircraft.schema';
import {
  AdvanceTerminal,
  AdvanceTerminalDocument,
} from '../../advance-terminal/schema/advance-terminal.schema';
import {
  CreationAdditionalFlights,
  CreationAdditionalFlightsDocument,
} from '../../creation/schema/creation-additional-flights.schema';
import { parseRoutingAirports } from '../utils/routing.util';
import type { FlightImportMasterSnapshot } from '../validators/business-rule.validator';

@Injectable()
export class FlightImportMasterDataService {
  private readonly logger = new Logger(FlightImportMasterDataService.name);

  constructor(
    @InjectModel(AdvanceAirline.name)
    private readonly airlineModel: Model<AdvanceAirlineDocument>,
    @InjectModel(AdvanceAircraft.name)
    private readonly aircraftModel: Model<AdvanceAircraftDocument>,
    @InjectModel(AdvanceTerminal.name)
    private readonly terminalModel: Model<AdvanceTerminalDocument>,
    @InjectModel(CreationAdditionalFlights.name)
    private readonly additionalFlightsModel: Model<CreationAdditionalFlightsDocument>,
  ) {}

  async loadSnapshot(): Promise<FlightImportMasterSnapshot> {
    const [airlines, terminals, routings] = await Promise.all([
      this.airlineModel.find({}, { name: 1, code: 1 }).lean(),
      this.terminalModel.find({}, { terminalCode: 1, location: 1 }).lean(),
      this.additionalFlightsModel.find({}, { routing: 1 }).lean(),
    ]);

    const airlineByName = new Map<string, { name: string; code: string }>();
    const airlineByCode = new Map<string, { name: string; code: string }>();
    for (const a of airlines) {
      const name = String(a.name ?? '').trim();
      const code = String(a.code ?? '').trim().toUpperCase();
      if (!name && !code) continue;
      const entry = { name: name || code, code };
      if (name) airlineByName.set(name.toLowerCase(), entry);
      if (code) airlineByCode.set(code, entry);
    }

    const aircraftDocs = await this.aircraftModel.find({}, { aircraft: 1 }).lean();
    const aircraftTypes = new Set<string>();
    for (const ac of aircraftDocs) {
      const type = String(ac.aircraft ?? '').trim().toLowerCase();
      if (type) aircraftTypes.add(type);
    }

    const airportCodes = new Set<string>();
    for (const t of terminals) {
      const code = String(t.terminalCode ?? '').trim().toUpperCase();
      const loc = String(t.location ?? '').trim().toUpperCase();
      if (/^[A-Z]{3}$/.test(code)) airportCodes.add(code);
      if (/^[A-Z]{3}$/.test(loc)) airportCodes.add(loc);
    }
    for (const r of routings) {
      for (const code of parseRoutingAirports(String(r.routing ?? ''))) {
        airportCodes.add(code);
      }
    }

    this.logger.log(
      `Master snapshot loaded: airlines=${airlineByName.size}, aircraft=${aircraftTypes.size}, airports=${airportCodes.size}`,
    );

    return { airlineByName, airlineByCode, aircraftTypes, airportCodes };
  }
}
