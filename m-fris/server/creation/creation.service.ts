import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../auth/services/identity.service';
import type { StationScopeContext } from '../common/station/station-scope';
import { DailyFlightOverrideService } from './daily-flight-override.service';
import { AdditionalFlightService } from './additional-flight.service';
import { CreationRafService } from './creation-raf.service';

@Injectable()
export class CreationService {
  constructor(
    private readonly dailyFlightOverrideService: DailyFlightOverrideService,
    private readonly additionalFlightService: AdditionalFlightService,
    private readonly creationRafService: CreationRafService,
  ) {}

  /**
   * Creation → Schedule Airlines save.
   * Stores a **daily operational override** for one generated flight instance/date.
   * Never mutates Advance → Schedule Setup (`advance_schedule_setup`).
   */
  async saveCreation(
    body: Record<string, unknown>,
    station: StationScopeContext,
    user?: AuthenticatedPrincipal | null,
  ) {
    return this.dailyFlightOverrideService.saveDailyOverride(body, station, user);
  }

  /** Creation tab → RAF: insert one document into `creation-raf`. */
  async saveCreationRaf(
    body: Record<string, unknown>,
    station: StationScopeContext,
    user?: AuthenticatedPrincipal | null,
  ) {
    return this.creationRafService.saveCreationRaf(body, station, user);
  }

  /**
   * Creation → Additional Flights: one-time flight for a specific date.
   * Never writes Advance → Schedule Setup; appears on Schedule Airlines daily list.
   */
  async saveCreationAdditionalFlight(
    body: Record<string, unknown>,
    station: StationScopeContext,
    user?: AuthenticatedPrincipal | null,
  ) {
    return this.additionalFlightService.saveAdditionalFlight(body, station, user);
  }

  /** Bulk insert Additional Flights rows from CSV import. */
  async bulkSaveCreationAdditionalFlights(
    rows: Record<string, unknown>[],
    station: StationScopeContext,
    user?: AuthenticatedPrincipal | null,
  ) {
    return this.additionalFlightService.bulkSaveAdditionalFlights(
      rows,
      station,
      user,
    );
  }

  /** List Additional Flights rows for a calendar day (matches `date` or `date2`, dd/MM/yyyy). */
  async listCreationAdditionalFlightsByDate(
    dateDdMmYyyy: string,
    station: StationScopeContext,
  ) {
    return this.additionalFlightService.listByDate(dateDdMmYyyy, station);
  }

  /** List RAF rows for a calendar day (matches `date` or `date2`, dd/MM/yyyy). */
  async listCreationRafByDate(
    dateDdMmYyyy: string,
    station: StationScopeContext,
  ) {
    return this.creationRafService.listByDate(dateDdMmYyyy, station);
  }

  /** List RAF rows whose STA/STD date falls within an inclusive dd/MM/yyyy range. */
  async listCreationRafByDateRange(
    fromDdMmYyyy: string,
    toDdMmYyyy: string,
    station: StationScopeContext,
    serialNo?: string,
  ) {
    return this.creationRafService.listByDateRange(
      fromDdMmYyyy,
      toDdMmYyyy,
      station,
      serialNo,
    );
  }

  /** List Additional Flights rows within an inclusive dd/MM/yyyy range. */
  async listCreationAdditionalFlightsByDateRange(
    fromDdMmYyyy: string,
    toDdMmYyyy: string,
    station: StationScopeContext,
  ) {
    return this.additionalFlightService.listByDateRange(
      fromDdMmYyyy,
      toDdMmYyyy,
      station,
    );
  }
}
