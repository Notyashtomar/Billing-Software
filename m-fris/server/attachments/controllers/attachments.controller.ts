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
import { AttachmentsService } from '../services/attachments.service';
import { CreateAttachmentsDto } from '../dto/create-attachments.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

@FrisPagePermissionAny(...FLIGHT_FORM_PAGE_PERMISSIONS)
@Controller('ns-raw-flight-data/attachments-details')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

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
    return this.attachmentsService.findBySerial(serial, station);
  }

  @Post(':serialNo')
  create(
    @Param('serialNo') serialNo: string,
    @Body() body: CreateAttachmentsDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.attachmentsService.upsertBySerial(serial, body, station);
  }

  @Patch(':serialNo')
  update(
    @Param('serialNo') serialNo: string,
    @Body() body: Partial<CreateAttachmentsDto>,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.attachmentsService.updateBySerial(serial, body, station);
  }

  @Delete(':serialNo')
  remove(
    @Param('serialNo') serialNo: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.attachmentsService.deleteBySerial(serial, station);
  }
}
