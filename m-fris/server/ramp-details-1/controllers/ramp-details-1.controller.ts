// import {
//   Controller,
//   Get,
//   Post,
//   Body,
//   Param,
//   Patch,
//   Delete,
// } from '@nestjs/common';
// import { RampDetails1Service } from '../services/ramp-details-1.service';
// import { CreateRampDetails1Dto } from '../dto/create-ramp-details-1.dto';

// @Controller('ramp-details-1')
// export class RampDetails1Controller {
//   constructor(private readonly rampDetails1Service: RampDetails1Service) {}

//   @Post()
//   create(@Body() body: CreateRampDetails1Dto) {
//     return this.rampDetails1Service.create(body);
//   }

//   @Get()
//   findAll() {
//     return this.rampDetails1Service.findAll();
//   }

//   @Get('by-serial/:serialNo')
//   findBySerial(@Param('serialNo') serialNo: string) {
//     return this.rampDetails1Service.findBySerialNo(Number(serialNo));
//   }

//   @Get(':id')
//   findOne(@Param('id') id: string) {
//     return this.rampDetails1Service.findOne(id);
//   }

//   @Patch(':id')
//   update(
//     @Param('id') id: string,
//     @Body() body: Partial<CreateRampDetails1Dto>,
//   ) {
//     return this.rampDetails1Service.update(id, body);
//   }

//   @Delete(':id')
//   remove(@Param('id') id: string) {
//     return this.rampDetails1Service.remove(id);
//   }
// }

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
import { RampDetails1Service } from '../services/ramp-details-1.service';
import { CreateRampDetails1Dto } from '../dto/create-ramp-details-1.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

@FrisPagePermissionAny(...FLIGHT_FORM_PAGE_PERMISSIONS)
@Controller('ns-raw-flight-data/ramp-details')
export class RampDetails1Controller {
  constructor(private readonly rampDetails1Service: RampDetails1Service) {}

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
    return this.rampDetails1Service.findBySerial(serial, station);
  }

  @Post(':serialNo')
  create(
    @Param('serialNo') serialNo: string,
    @Body() body: CreateRampDetails1Dto,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.rampDetails1Service.upsertBySerial(serial, body, station);
  }

  @Patch(':serialNo')
  update(
    @Param('serialNo') serialNo: string,
    @Body() body: Partial<CreateRampDetails1Dto>,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.rampDetails1Service.updateBySerial(serial, body, station);
  }

  @Delete(':serialNo')
  remove(
    @Param('serialNo') serialNo: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.rampDetails1Service.deleteBySerial(serial, station);
  }
}
