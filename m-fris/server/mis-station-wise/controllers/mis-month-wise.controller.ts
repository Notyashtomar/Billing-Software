import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { FrisPagePermission } from 'src/auth/decorators/fris-page-permission.decorator';
import { CurrentStation } from 'src/common/station/current-station.decorator';
import type { StationScopeContext } from 'src/common/station/station-scope';
import { SkipTimeout } from 'src/protection/decorators/skip-timeout.decorator';
import { MisStationWiseQueryDto } from '../dto/mis-station-wise-query.dto';
import { MisMonthWiseService } from '../services/mis-month-wise.service';

/**
 * MIS Month Wise — session station only (`@CurrentStation`), same FHR collect
 * as Station Wise. Client cannot pass a station override.
 */
@FrisPagePermission('mis', 'MIS Month Wise')
@Controller('mis/month-wise')
export class MisMonthWiseController {
  constructor(private readonly misMonthWiseService: MisMonthWiseService) {}

  @Get('status')
  status(
    @CurrentStation() station: StationScopeContext,
    @Query() query: MisStationWiseQueryDto,
  ) {
    return this.misMonthWiseService.getStatus(station, query);
  }

  @Get('export')
  @SkipTimeout()
  async export(
    @CurrentStation() station: StationScopeContext,
    @Query() query: MisStationWiseQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.misMonthWiseService.exportWorkbook(
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
