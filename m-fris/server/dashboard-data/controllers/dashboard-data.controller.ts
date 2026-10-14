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
import { DashboardDataService } from '../services/dashboard-data.service';
import { ImportDashboardDataDto } from '../dto/import-dashboard-data.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

const permissiveBodyPipe = new ValidationPipe({
  whitelist: false,
  forbidNonWhitelisted: false,
  transform: true,
});

@Controller('dashboard-data')
export class DashboardDataController {
  constructor(private readonly dashboardDataService: DashboardDataService) {}

  /**
   * Bulk import endpoint for dashboard records.
   * Body:
   * {
   *   "replaceExisting": true,
   *   "flights": [
   *     {
   *       "flightId": 202186,
   *       "airline": "Vietjet Air",
   *       "operationType": "Turnaround",
   *       "flightCategory": "Scheduled",
   *       "aircraftType": "A330-300",
   *       "STD_Time": "22:50",
   *       "STD_Date": "24-Mar-26",
   *       "STA_Time": "00:05",
   *       "STA_Date": "25/03/2026",
   *       "ATD_Time": "22:49",
   *       "ATD_Date": "24/03/2026",
   *       "ATA_Time": "00:07",
   *       "ATA_Date": "25/03/2026",
   *       "Planned_STA_Time": "00:05",
   *       "Planned_STA_Date": "25/03/2026",
   *       "Flight_Status": "Delay",
   *       "Delay_Departure": "00:02",
   *       "Delay_Arrival": "00:02",
   *       "Delay_Code_1": "89",
   *       "Delay_Reason_1": "Restrictions at airport of departure...",
   *       "Delay_Time_1": "00:00",
   *       "Delay_Code_2": "",
   *       "Delay_Reason_2": "",
   *       "Delay_Time_2": "",
   *       "Gate_Status_Departure": "A",
   *       "Gate_Status_Arrival": "A",
   *       "Body_Type": "WB",
   *       "Remarks": "",
   *       "Performance": "Satisfactory",
   *       "Month": "Mar-26",
   *       "Record_Status": "ACTIVE"
   *     }
   *   ]
   * }
   */
  @Post('import')
  @Roles(...ADMIN_ROLES)
  @UsePipes(permissiveBodyPipe)
  import(
    @Body() body: ImportDashboardDataDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.dashboardDataService.importBulk(body, station);
  }

  @Get()
  getAll(@CurrentStation() station: StationScopeContext) {
    return this.dashboardDataService.getAll(station);
  }
}
