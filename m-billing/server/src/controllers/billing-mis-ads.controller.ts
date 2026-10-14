import {
  Controller,
  Get,
  InternalServerErrorException,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { FrisPagePermission } from 'src/auth/decorators/fris-page-permission.decorator';
import { SkipTimeout } from 'src/protection/decorators/skip-timeout.decorator';
import { CurrentBillingStation } from '../common/billing-context.decorator';
import type { StationScopeContext } from '../common/station-scope';
import { BillingMisAdsQueryDto } from '../dto/billing-mis-ads.dto';
import { BillingMisAdsService } from '../services/billing-mis-ads.service';

@FrisPagePermission('mis', 'MIS ADS')
@Controller('billing/mis-ads')
export class BillingMisAdsController {
  constructor(private readonly misAdsService: BillingMisAdsService) {}

  @Get('status')
  status(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: BillingMisAdsQueryDto,
  ) {
    return this.misAdsService.getStatus(station, query);
  }

  @Get('preview')
  @SkipTimeout()
  preview(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: BillingMisAdsQueryDto,
  ) {
    return this.misAdsService.getPreview(station, query);
  }

  @Get('export')
  @SkipTimeout()
  async export(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: BillingMisAdsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.misAdsService.exportWorkbook(station, query);
    if (!buffer?.length) {
      throw new InternalServerErrorException('ADS MIS export produced an empty workbook');
    }
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(buffer.length));
    return new StreamableFile(Uint8Array.from(buffer));
  }
}
