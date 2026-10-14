import { Controller, Get, Query } from '@nestjs/common';
import { BillingSourcesService } from '../services/billing-sources.service';
import { BillingSourcesQueryDto } from '../dto/billing-sources-query.dto';
import {
  CurrentBillingStation,
} from '../common/billing-context.decorator';
import type { StationScopeContext } from '../common/station-scope';

/**
 * Operational billing sources — Phase 2
 * BC: Aviation pages (AVIATION_PAGES.md)
 * FRIS: /billing/scheduled-flights, /billing/raf, etc.
 */
import { BillingPageAccess } from '../common/billing-page-access.decorator';
import { SkipTimeout } from 'src/protection/decorators/skip-timeout.decorator';

@BillingPageAccess()
@Controller('billing/sources')
export class BillingSourcesController {
  constructor(private readonly sourcesService: BillingSourcesService) {}

  @Get('scheduled-flights')
  @SkipTimeout()
  scheduledFlights(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: BillingSourcesQueryDto,
  ) {
    return this.sourcesService.scheduledFlights(station, query);
  }

  @Get('cleaning')
  cleaning(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: BillingSourcesQueryDto,
  ) {
    return this.sourcesService.cleaning(station, query);
  }

  /** Advance → Gateway → RAF Airline master (Customer dropdown on /billing/raf). */
  @Get('raf/airlines')
  rafAirlines(@CurrentBillingStation() station: StationScopeContext) {
    return this.sourcesService.rafAirlines(station);
  }

  @Get('raf')
  @SkipTimeout()
  raf(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: BillingSourcesQueryDto,
  ) {
    return this.sourcesService.raf(station, query);
  }

  @Get('maas')
  maas(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: BillingSourcesQueryDto,
  ) {
    return this.sourcesService.maas(station, query);
  }

  @Get('ads/aircraft-types')
  @SkipTimeout()
  adsAircraftTypes(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: BillingSourcesQueryDto,
  ) {
    return this.sourcesService.adsAircraftTypes(station, query);
  }

  @Get('ads')
  @SkipTimeout()
  ads(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: BillingSourcesQueryDto,
  ) {
    return this.sourcesService.ads(station, query);
  }

  @Get('xxld')
  xxldScheduled(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: BillingSourcesQueryDto,
  ) {
    return this.sourcesService.xxldScheduled(station, query);
  }

  @Get('xxld/non-scheduled')
  xxldNonScheduled(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: BillingSourcesQueryDto,
  ) {
    return this.sourcesService.xxldNonScheduled(station, query);
  }

  @Get('equipment')
  equipment(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: BillingSourcesQueryDto,
  ) {
    return this.sourcesService.equipment(station, query);
  }

  @Get('manpower')
  manpower(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: BillingSourcesQueryDto,
  ) {
    return this.sourcesService.manpower(station, query);
  }

  @Get('non-scheduled')
  nonScheduled(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: BillingSourcesQueryDto,
  ) {
    return this.sourcesService.nonScheduled(station, query);
  }

  /** Custom billing — flight palette independent of BHS / ADS invoice paths. */
  @Get('custom')
  @SkipTimeout()
  custom(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: BillingSourcesQueryDto,
  ) {
    return this.sourcesService.custom(station, query);
  }
}

