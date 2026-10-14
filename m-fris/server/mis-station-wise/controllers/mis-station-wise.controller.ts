import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { FrisPagePermission } from 'src/auth/decorators/fris-page-permission.decorator';
import { CurrentStation } from 'src/common/station/current-station.decorator';
import type { StationScopeContext } from 'src/common/station/station-scope';
import { SkipTimeout } from 'src/protection/decorators/skip-timeout.decorator';
import { MisStationWiseQueryDto } from '../dto/mis-station-wise-query.dto';
import { MisStationWiseService } from '../services/mis-station-wise.service';

/**
 * MIS Station Wise — session station only (`@CurrentStation`).
 * Client cannot override station; same collect feeds Month Wise.
 */
@FrisPagePermission('mis', 'MIS Station Wise')
@Controller('mis/station-wise')
export class MisStationWiseController {
  constructor(private readonly misStationWiseService: MisStationWiseService) {}

  @Get('status')
  status(
    @CurrentStation() station: StationScopeContext,
    @Query() query: MisStationWiseQueryDto,
  ) {
    return this.misStationWiseService.getStatus(station, query);
  }

  @Get('export')
  @SkipTimeout()
  async export(
    @CurrentStation() station: StationScopeContext,
    @Query() query: MisStationWiseQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.misStationWiseService.exportWorkbook(
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
