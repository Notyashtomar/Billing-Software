import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { FrisPagePermissionAny } from '../../auth/decorators/fris-page-permission.decorator';
import { FLIGHT_FORM_PAGE_PERMISSIONS } from '../../auth/decorators/flight-form-page-permissions';
import { ManifestService } from '../services/manifest.service';
import { CreateManifestDto } from '../dto/create-manifest.dto';
import { CurrentStation } from '../../common/station';
import type { StationScopeContext } from '../../common/station';

@FrisPagePermissionAny(...FLIGHT_FORM_PAGE_PERMISSIONS)
@Controller('ns-raw-flight-data/manifest-details')
export class ManifestController {
  constructor(private readonly manifestService: ManifestService) {}

  private validateSerial(serialNo: string): number {
    const serial = Number(serialNo);
    if (!serialNo || Number.isNaN(serial)) {
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
    return this.manifestService.findBySerial(serial, station);
  }

  @Post(':serialNo')
  save(
    @Param('serialNo') serialNo: string,
    @Body() body: CreateManifestDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.manifestService.upsertBySerial(serial, body, station);
  }

  @Patch(':serialNo')
  update(
    @Param('serialNo') serialNo: string,
    @Body() body: Partial<CreateManifestDto>,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.manifestService.updateBySerial(serial, body, station);
  }

  @Delete(':serialNo')
  remove(
    @Param('serialNo') serialNo: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.manifestService.deleteBySerial(serial, station);
  }
}
