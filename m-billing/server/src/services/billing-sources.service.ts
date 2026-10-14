import { Injectable } from '@nestjs/common';
import { BillingSourcesQueryDto } from '../dto/billing-sources-query.dto';
import type { StationScopeContext } from '../common/station-scope';
import { BillingSourcesScheduledService } from './sources/billing-sources-scheduled.service';
import {
  BillingSourcesAdsService,
  BillingSourcesEquipmentService,
  BillingSourcesManpowerService,
  BillingSourcesRafService,
} from './sources/billing-sources-usage.service';
import {
  BillingSourcesCleaningService,
  BillingSourcesMaasService,
  BillingSourcesNonScheduledService,
  BillingSourcesXxldService,
} from './sources/billing-sources-fhr.service';
import { BillingSourcesCustomService } from './sources/billing-sources-custom.service';

@Injectable()
export class BillingSourcesService {
  constructor(
    private readonly scheduledSvc: BillingSourcesScheduledService,
    private readonly cleaningSvc: BillingSourcesCleaningService,
    private readonly rafSvc: BillingSourcesRafService,
    private readonly maasSvc: BillingSourcesMaasService,
    private readonly adsSvc: BillingSourcesAdsService,
    private readonly xxldSvc: BillingSourcesXxldService,
    private readonly equipmentSvc: BillingSourcesEquipmentService,
    private readonly manpowerSvc: BillingSourcesManpowerService,
    private readonly nonScheduledSvc: BillingSourcesNonScheduledService,
    private readonly customSvc: BillingSourcesCustomService,
  ) {}

  scheduledFlights(ctx: StationScopeContext, query: BillingSourcesQueryDto) {
    return this.scheduledSvc.list(ctx, query);
  }

  cleaning(ctx: StationScopeContext, query: BillingSourcesQueryDto) {
    return this.cleaningSvc.list(ctx, query);
  }

  raf(ctx: StationScopeContext, query: BillingSourcesQueryDto) {
    return this.rafSvc.list(ctx, query);
  }

  rafAirlines(ctx: StationScopeContext) {
    return this.rafSvc.listAirlines(ctx);
  }

  maas(ctx: StationScopeContext, query: BillingSourcesQueryDto) {
    return this.maasSvc.list(ctx, query);
  }

  ads(ctx: StationScopeContext, query: BillingSourcesQueryDto) {
    return this.adsSvc.list(ctx, query);
  }

  /** MIS ADS: same FHR/ADS source as the ADS page, indexed rates instead of enriching every line. */
  adsForMis(ctx: StationScopeContext, query: BillingSourcesQueryDto) {
    return this.adsSvc.listIndexedForMis(ctx, query);
  }

  adsAircraftTypes(ctx: StationScopeContext, query: BillingSourcesQueryDto) {
    return this.adsSvc.listAircraftTypesForCustomer(ctx, query);
  }

  xxldScheduled(ctx: StationScopeContext, query: BillingSourcesQueryDto) {
    return this.xxldSvc.listScheduled(ctx, query);
  }

  xxldNonScheduled(ctx: StationScopeContext, query: BillingSourcesQueryDto) {
    return this.xxldSvc.listNonScheduled(ctx, query);
  }

  equipment(ctx: StationScopeContext, query: BillingSourcesQueryDto) {
    return this.equipmentSvc.list(ctx, query);
  }

  manpower(ctx: StationScopeContext, query: BillingSourcesQueryDto) {
    return this.manpowerSvc.list(ctx, query);
  }

  nonScheduled(ctx: StationScopeContext, query: BillingSourcesQueryDto) {
    return this.nonScheduledSvc.list(ctx, query);
  }

  custom(ctx: StationScopeContext, query: BillingSourcesQueryDto) {
    return this.customSvc.list(ctx, query);
  }
}
