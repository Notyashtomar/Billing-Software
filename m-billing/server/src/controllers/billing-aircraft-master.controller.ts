import { Body, Controller, Get, Post } from '@nestjs/common';
import { BillingPageAccess } from '../common/billing-page-access.decorator';
import {
  CurrentBillingStation,
} from '../common/billing-context.decorator';
import type { StationScopeContext } from '../common/station-scope';
import {
  BillingAircraftMasterService,
  type AircraftMasterImportRow,
} from '../services/billing-aircraft-master.service';

@BillingPageAccess()
@Controller('billing/aircraft-master')
export class BillingAircraftMasterController {
  constructor(private readonly aircraftMaster: BillingAircraftMasterService) {}

  @Get()
  list(@CurrentBillingStation() station: StationScopeContext) {
    return this.aircraftMaster.list(station);
  }

  @Post('import')
  importRows(
    @CurrentBillingStation() station: StationScopeContext,
    @Body()
    body: {
      headers?: unknown[];
      rows?: AircraftMasterImportRow[];
    },
  ) {
    return this.aircraftMaster.importRows(
      station,
      Array.isArray(body?.headers) ? body.headers : [],
      Array.isArray(body?.rows) ? body.rows : [],
    );
  }
}
