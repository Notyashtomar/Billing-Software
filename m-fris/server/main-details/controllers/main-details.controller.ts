import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  BadRequestException,
} from '@nestjs/common';
import { FrisPagePermissionAny } from '../../auth/decorators/fris-page-permission.decorator';
import { FLIGHT_FORM_PAGE_PERMISSIONS } from '../../auth/decorators/flight-form-page-permissions';
import { MainDetailsService } from '../services/main-details.service';
import { CreateMainDetailsDto } from '../dto/create-main-details.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

@FrisPagePermissionAny(...FLIGHT_FORM_PAGE_PERMISSIONS)
@Controller('ns-raw-flight-data/main-details')
export class MainDetailsController {
  constructor(private readonly mainDetailsService: MainDetailsService) {}

  private validateSerial(serialNo: string): number {
    const trimmed = String(serialNo ?? '')
      .trim()
      .replace(/^FL-/i, '');
    const serial = Number(trimmed);
    if (!trimmed || Number.isNaN(serial)) {
      throw new BadRequestException('Invalid flight serial number');
    }
    return serial;
  }

  @Get(':serialNo')
  find(
    @Param('serialNo') serialNo: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.mainDetailsService.findBySerial(serial, station);
  }

  @Post(':serialNo')
  create(
    @Param('serialNo') serialNo: string,
    @Body() body: CreateMainDetailsDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.mainDetailsService.upsertBySerial(serial, body, station);
  }

  @Patch(':serialNo')
  update(
    @Param('serialNo') serialNo: string,
    @Body() body: Partial<CreateMainDetailsDto>,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.mainDetailsService.updateBySerial(serial, body, station);
  }

  @Delete(':serialNo')
  remove(
    @Param('serialNo') serialNo: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.mainDetailsService.deleteBySerial(serial, station);
  }
}
