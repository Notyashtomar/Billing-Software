import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { FhrCollectionService } from 'src/fhr-collection/services/fhr-collection.service';
import { NsFhrCollectionService } from 'src/ns-fhr-collection/services/ns-fhr-collection.service';
import { AdminStationsService } from 'src/admin-stations/services/admin-stations.service';
import { readDashboardRefreshEnv } from '../config/dashboard-refresh-env';
import {
  DASHBOARD_FLIGHT_SCOPES,
  type DashboardFlightScope,
  isNonScheduledDashboardScope,
} from '../constants/dashboard-flight-scope';
import { DASHBOARD_SOURCE_CHANGED } from '../events/dashboard-events.constants';
import { DashboardSourceChangedEvent } from '../events/dashboard-source-changed.event';
import { DASHBOARD_SOURCE_TYPES } from '../registry/dashboard-dependency.registry';
import { ALL_DASHBOARD_AGGREGATE_TYPES } from '../constants/dashboard-aggregate-types';
import { expandAffectedSummaryDates, ymdToDdMmYyyy } from '../utils/dashboard-range.util';
import { DailyAggregateSummaryService } from './daily-aggregate-summary.service';
import { DashboardSummaryService } from './dashboard-summary.service';
import { DashboardRefreshQueueService } from './dashboard-refresh-queue.service';

@Injectable()
export class DashboardInvalidationService {
  private readonly logger = new Logger(DashboardInvalidationService.name);

  constructor(
    private readonly fhrCollectionService: FhrCollectionService,
    private readonly nsFhrCollectionService: NsFhrCollectionService,
    private readonly dailyAggregateSummaryService: DailyAggregateSummaryService,
    private readonly dashboardSummaryService: DashboardSummaryService,
    private readonly refreshQueue: DashboardRefreshQueueService,
    private readonly adminStationsService: AdminStationsService,
  ) {}

  @OnEvent(DASHBOARD_SOURCE_CHANGED, { async: true })
  async handleDashboardSourceChanged(
    event: DashboardSourceChangedEvent,
  ): Promise<void> {
    const env = readDashboardRefreshEnv();
    const p = event.payload;
    const isFhrSource =
      p.sourceType === DASHBOARD_SOURCE_TYPES.FHR_COLLECTION ||
      p.sourceType === DASHBOARD_SOURCE_TYPES.NS_FHR_COLLECTION;

    // FHR/NS FHR form saves must always invalidate STA caches + mark day shards
    // stale so the next dashboard GET rematerializes live numbers. Other sources
    // stay behind the eventRefresh flag (heavier / less frequent).
    if (!isFhrSource && !env.eventRefreshEnabled) {
      this.logger.debug(
        '[dashboard_invalidate] skipped eventRefreshEnabled=false',
      );
      return;
    }

    const flightScope: DashboardFlightScope =
      p.flightScope ??
      (p.sourceType === DASHBOARD_SOURCE_TYPES.NS_FHR_COLLECTION
        ? DASHBOARD_FLIGHT_SCOPES.NON_SCHEDULED
        : DASHBOARD_FLIGHT_SCOPES.SCHEDULED);

    const affectedYmd = (p.affectedDatesYmd ?? [])
      .map((d) => d.trim())
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));

    if (p.sourceType === DASHBOARD_SOURCE_TYPES.FHR_COLLECTION) {
      if (affectedYmd.length) {
        this.fhrCollectionService.invalidateStaWindowRowsCache(
          affectedYmd.map(ymdToDdMmYyyy),
        );
      } else {
        this.fhrCollectionService.invalidateStaWindowRowsCache();
      }
    }

    if (p.sourceType === DASHBOARD_SOURCE_TYPES.NS_FHR_COLLECTION) {
      if (affectedYmd.length) {
        this.nsFhrCollectionService.invalidateStaWindowRowsCache(
          affectedYmd.map(ymdToDdMmYyyy),
        );
      } else {
        this.nsFhrCollectionService.invalidateStaWindowRowsCache();
      }
    }

    if (!affectedYmd.length) {
      this.logger.debug(
        '[dashboard_invalidate] no affected YMD — skipping summary invalidation',
      );
      return;
    }

    const staleDates = expandAffectedSummaryDates(affectedYmd);

    // Dashboard shards are per-station: invalidate + rebuild each active
    // station's shards for the affected days.
    const stationCodes = await this.adminStationsService.listActiveStationCodes();

    for (const stationCode of stationCodes) {
      await this.dailyAggregateSummaryService.markStaleForDateTypes({
        dates: staleDates,
        aggregateTypes: ALL_DASHBOARD_AGGREGATE_TYPES,
        stationCode,
        flightScope,
      });
      await this.dashboardSummaryService.markStaleForSummaryDates(
        staleDates,
        new Date(),
        stationCode,
        flightScope,
      );
    }

    if (!env.backgroundRefresh) {
      this.logger.log(
        `[dashboard_invalidate] marked stale source=${p.sourceType} ` +
          `scope=${flightScope} days=${staleDates.length} ` +
          `stations=${stationCodes.length} backgroundRefresh=false`,
      );
      return;
    }

    let enqueued = 0;
    for (const stationCode of stationCodes) {
      for (const ymd of staleDates) {
        for (const mode of ['4h', '6h'] as const) {
          this.refreshQueue.enqueueSummary({
            summaryDate: ymd,
            equipmentMode: mode,
            stationCode,
            flightScope,
            reason: p.sourceType,
          });
          enqueued += 1;
        }
      }
    }

    this.logger.log(
      `[dashboard_invalidate] source=${p.sourceType} scope=${flightScope} ` +
        `slice=${p.slice ?? ''} staleDays=${staleDates.length} ` +
        `stations=${stationCodes.length} enqueued=${enqueued} ` +
        `ns=${isNonScheduledDashboardScope(flightScope)}`,
    );
  }
}
