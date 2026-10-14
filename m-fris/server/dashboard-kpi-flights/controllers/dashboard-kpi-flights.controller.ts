import {
  Body,
  Controller,
  Get,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ADMIN_ROLES } from '../../auth/enums/roles.enum';
import { DashboardKpiFlightsService } from '../services/dashboard-kpi-flights.service';
import { ImportDashboardKpiFlightsDto } from '../dto/import-dashboard-kpi-flights.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

const permissiveBodyPipe = new ValidationPipe({
  whitelist: false,
  forbidNonWhitelisted: false,
  transform: true,
});

@Controller('dashboard-kpi-flights')
export class DashboardKpiFlightsController {
  constructor(
    private readonly dashboardKpiFlightsService: DashboardKpiFlightsService,
  ) {}

  /**
   * Single POST to save many rows.
   * Body: { "rawText": "Header\\tCol2\\nrow1col1\\trow1col2\\n...", "replaceExisting": false }
   *   or: { "flights": [ { ... }, ... ], "replaceExisting": false }
   */
  @Post('import')
  @Roles(...ADMIN_ROLES)
  @UsePipes(permissiveBodyPipe)
  import(
    @Body() body: ImportDashboardKpiFlightsDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.dashboardKpiFlightsService.importFlights(body, station);
  }

  @Get()
  getAll(@CurrentStation() station: StationScopeContext) {
    return this.dashboardKpiFlightsService.getAll(station);
  }
}
