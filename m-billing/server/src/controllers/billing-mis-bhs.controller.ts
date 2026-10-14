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
import { BillingMisBhsQueryDto } from '../dto/billing-mis-bhs.dto';
import { BillingMisBhsService } from '../services/billing-mis-bhs.service';

@FrisPagePermission('mis', 'MIS BHS')
@Controller('billing/mis-bhs')
export class BillingMisBhsController {
  constructor(private readonly misBhsService: BillingMisBhsService) {}

  @Get('status')
  status(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: BillingMisBhsQueryDto,
  ) {
    return this.misBhsService.getStatus(station, query);
  }

  @Get('export')
  @SkipTimeout()
  async export(
    @CurrentBillingStation() station: StationScopeContext,
    @Query() query: BillingMisBhsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.misBhsService.exportWorkbook(station, query);
    if (!buffer?.length) {
      throw new InternalServerErrorException('BHS MIS export produced an empty workbook');
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
