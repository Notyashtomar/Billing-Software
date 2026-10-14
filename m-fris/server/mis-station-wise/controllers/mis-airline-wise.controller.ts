import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { FrisPagePermission } from 'src/auth/decorators/fris-page-permission.decorator';
import { CurrentStation } from 'src/common/station/current-station.decorator';
import type { StationScopeContext } from 'src/common/station/station-scope';
import { SkipTimeout } from 'src/protection/decorators/skip-timeout.decorator';
import { MisAirlineWiseQueryDto } from '../dto/mis-airline-wise-query.dto';
import { MisStationWiseQueryDto } from '../dto/mis-station-wise-query.dto';
import { MisAirlineWiseService } from '../services/mis-airline-wise.service';

/**
 * MIS Airline Wise — all-station FHR for the selected airline (6E sheets).
 * Extra airline chips still prefer carriers that fly the login station.
 */
@FrisPagePermission('mis', 'MIS Airline Wise')
@Controller('mis/airline-wise')
export class MisAirlineWiseController {
  constructor(private readonly misAirlineWiseService: MisAirlineWiseService) {}

  @Get('status')
  status(
    @CurrentStation() station: StationScopeContext,
    @Query() query: MisStationWiseQueryDto,
  ) {
    return this.misAirlineWiseService.getStatus(station, query);
  }

  @Get('export')
  @SkipTimeout()
  async export(
    @CurrentStation() station: StationScopeContext,
    @Query() query: MisAirlineWiseQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.misAirlineWiseService.exportWorkbook(
      station,
      query,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    return new StreamableFile(buffer);
  }
}
