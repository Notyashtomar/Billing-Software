// import {
//   Controller,
//   Get,
//   Post,
//   Body,
//   Param,
//   Patch,
//   Delete,
// } from '@nestjs/common';
// import { RampDetails2Service } from '../services/ramp-details-2.service';
// import { CreateRampDetails2Dto } from '../dto/create-ramp-details-2.dto';

// @Controller('ramp-details-2')
// export class RampDetails2Controller {
//   constructor(private readonly rampDetails2Service: RampDetails2Service) {}

//   @Post()
//   create(@Body() body: CreateRampDetails2Dto) {
//     return this.rampDetails2Service.create(body);
//   }

//   @Get()
//   findAll() {
//     return this.rampDetails2Service.findAll();
//   }

//   @Get('by-serial/:serialNo')
//   findBySerial(@Param('serialNo') serialNo: string) {
//     return this.rampDetails2Service.findBySerialNo(Number(serialNo));
//   }

//   @Get(':id')
//   findOne(@Param('id') id: string) {
//     return this.rampDetails2Service.findOne(id);
//   }

//   @Patch(':id')
//   update(
//     @Param('id') id: string,
//     @Body() body: Partial<CreateRampDetails2Dto>,
//   ) {
//     return this.rampDetails2Service.update(id, body);
//   }

//   @Delete(':id')
//   remove(@Param('id') id: string) {
//     return this.rampDetails2Service.remove(id);
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
import { RampDetails2Service } from '../services/ramp-details-2.service';
import { CreateRampDetails2Dto } from '../dto/create-ramp-details-2.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

@FrisPagePermissionAny(...FLIGHT_FORM_PAGE_PERMISSIONS)
@Controller('ns-raw-flight-data/ramp-details-2')
export class RampDetails2Controller {
  constructor(private readonly rampDetails2Service: RampDetails2Service) {}

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
    return this.rampDetails2Service.findBySerial(serial, station);
  }

  @Post(':serialNo')
  create(
    @Param('serialNo') serialNo: string,
    @Body() body: CreateRampDetails2Dto,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.rampDetails2Service.create(serial, body, station);
  }

  @Patch(':serialNo/row/:id')
  update(
    @Param('id') id: string,
    @Body() body: Partial<CreateRampDetails2Dto>,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.rampDetails2Service.updateById(id, body, station);
  }

  @Delete(':serialNo/row/:id')
  remove(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.rampDetails2Service.deleteById(id, station);
  }
}
