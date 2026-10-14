import { Controller, Get, Query } from '@nestjs/common';
import { FrisPagePermission } from '../auth/decorators/fris-page-permission.decorator';
import { StaAtaDailyService } from './sta-ata-daily.service';

@FrisPagePermission('dashboard', 'Dashboard page')
@Controller('sta-ata-daily')
export class StaAtaDailyController {
  constructor(private readonly staAtaDailyService: StaAtaDailyService) {}

  @Get('duplicate-serials')
  duplicateSerials() {
    return this.staAtaDailyService.getDuplicateSerialReport();
  }

  /**
   * Daily Σ(ATA−STA) minutes and counts for chart / month summary.
   * Query: year (e.g. 2026), month (1–12).
   */
  @Get('month-net')
  monthNet(@Query('year') yearQ?: string, @Query('month') monthQ?: string) {
    const year =
      yearQ != null && yearQ !== '' ? parseInt(String(yearQ), 10) : NaN;
    const month =
      monthQ != null && monthQ !== '' ? parseInt(String(monthQ), 10) : NaN;
    return this.staAtaDailyService.getMonthDailyNet(year, month);
  }
}
