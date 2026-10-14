import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FhrCollectionService } from 'src/fhr-collection/services/fhr-collection.service';
import { NsFhrCollectionService } from 'src/ns-fhr-collection/services/ns-fhr-collection.service';
import { DASHBOARD_FLIGHT_SCOPES } from '../constants/dashboard-flight-scope';
import { DASHBOARD_SOURCE_CHANGED } from '../events/dashboard-events.constants';
import { DashboardSourceChangedEvent } from '../events/dashboard-source-changed.event';
import { DASHBOARD_SOURCE_TYPES } from '../registry/dashboard-dependency.registry';
import { ymdToDateKey } from '../utils/dashboard-range.util';

/**
 * Bridges `fhr_collection` / `ns_fhr_collection` merge notifications into the
 * global dashboard event channel without importing dashboard services into the
 * FHR modules (avoids circular DI).
 */
@Injectable()
export class DashboardSummaryFhrInvalidationHook implements OnModuleInit {
  constructor(
    private readonly fhrCollectionService: FhrCollectionService,
    private readonly nsFhrCollectionService: NsFhrCollectionService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.fhrCollectionService.registerFhrMutateCallback((ctx) => {
      this.emitSourceChanged({
        sourceType: DASHBOARD_SOURCE_TYPES.FHR_COLLECTION,
        flightScope: DASHBOARD_FLIGHT_SCOPES.SCHEDULED,
        slice: ctx?.slice,
        affectedDatesYmd: ctx?.affectedDates,
      });
    });

    this.nsFhrCollectionService.registerNsFhrMutateCallback((ctx) => {
      this.emitSourceChanged({
        sourceType: DASHBOARD_SOURCE_TYPES.NS_FHR_COLLECTION,
        flightScope: DASHBOARD_FLIGHT_SCOPES.NON_SCHEDULED,
        slice: ctx?.slice,
        affectedDatesYmd: ctx?.affectedDates,
      });
    });
  }

  private emitSourceChanged(params: {
    sourceType: string;
    flightScope: typeof DASHBOARD_FLIGHT_SCOPES.SCHEDULED | typeof DASHBOARD_FLIGHT_SCOPES.NON_SCHEDULED;
    slice?: string;
    affectedDatesYmd?: string[];
  }): void {
    const affectedDatesYmd = params.affectedDatesYmd?.filter((d) =>
      /^\d{4}-\d{2}-\d{2}$/.test(String(d).trim()),
    );
    this.eventEmitter.emit(
      DASHBOARD_SOURCE_CHANGED,
      new DashboardSourceChangedEvent({
        sourceType: params.sourceType,
        flightScope: params.flightScope,
        affectedDatesYmd,
        affectedDateKeys:
          affectedDatesYmd
            ?.map((ymd) => ymdToDateKey(ymd.trim()))
            .filter((n): n is number => n != null) ?? [],
        slice: params.slice,
        updatedAt: new Date(),
      }),
    );
  }
}
