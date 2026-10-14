import {
  Body,
  Controller,
  Post,
  Get,
  Patch,
  Query,
  Param,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { OPERATIONAL_ROLES } from '../../auth/enums/roles.enum';

import { BulkCreateRawFlightDataDto } from '../dto/create-raw-flight-data.dto';
import { RawFlightDataService } from '../services/raw-flight-data.service';
import { RawFlightBulkService } from '../services/raw-flight-bulk.service';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

/** Flight rows are free-form objects stored under `data`; skip global whitelist. */
const rawFlightBodyPipe = new ValidationPipe({
  whitelist: false,
  forbidNonWhitelisted: false,
  transform: true,
});

@Controller('raw-flight-data')
export class RawFlightDataController {
  constructor(
    private readonly rawFlightDataService: RawFlightDataService,
    private readonly rawFlightBulkService: RawFlightBulkService,
  ) {}

  /**
   * Bulk insert raw flight data rows into the `raw_flight_data` collection.
   * POST /raw-flight-data/bulk
   */
  @Post('bulk')
  @Roles(...OPERATIONAL_ROLES)
  @UsePipes(rawFlightBodyPipe)
  bulkInsert(
    @Body() body: BulkCreateRawFlightDataDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.rawFlightBulkService.bulkInsert(body.flights, station);
  }

  /**
   * Single-row insert (body = one flight object, stored as document.data).
   * POST /raw-flight-data
   */
  @Post()
  @Roles(...OPERATIONAL_ROLES)
  @UsePipes(rawFlightBodyPipe)
  createOne(
    @Body() body: Record<string, unknown>,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.rawFlightBulkService.bulkInsert([{ data: body }], station);
  }
  @Get()
  getAll(
    @CurrentStation() station: StationScopeContext,
    @Query('date') date?: string,
  ) {
    return this.rawFlightDataService.getAllRawFlightData(date, station);
  }

  /** Schedule row from `raw_flight_data` by Sl. No. (Advance Schedule Setup lives here). */
  @Get('by-serial/:serialNo')
  getScheduleBySerial(
    @Param('serialNo') serialNo: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.rawFlightDataService.findScheduleBySerial(serialNo, station);
  }

  @Get('filter')
  filterByDateRange(
    @CurrentStation() station: StationScopeContext,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.rawFlightDataService.filterByDateRange(from, to, station);
  }

  /** Invoice Pending → Exported Data Status: set Navision export Y/N on flight or equipment row. */
  @Get('navision-export-errors')
  @Roles(...OPERATIONAL_ROLES)
  listNavisionExportErrors(
    @CurrentStation() station: StationScopeContext,
    @Query('serialNo') serialNo?: string,
    @Query('fromDate') fromDate?: string,
    @Query('tillDate') tillDate?: string,
  ) {
    return this.rawFlightDataService.listNavisionExportErrors(
      {
        serialNo,
        fromDate,
        tillDate,
      },
      station,
    );
  }

  @Patch('navision-export/:serialNo')
  @Roles(...OPERATIONAL_ROLES)
  setNavisionExportStatus(
    @Param('serialNo') serialNo: string,
    @Body()
    body: {
      status: 'Y' | 'N';
      recordType?: 'flight' | 'equipment';
      flightType?: string;
    },
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.rawFlightDataService.setNavisionDataExportStatus(
      serialNo,
      body,
      station,
    );
  }
}
