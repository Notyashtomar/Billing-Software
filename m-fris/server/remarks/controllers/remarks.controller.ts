// import {
//   Controller,
//   Get,
//   Post,
//   Body,
//   Param,
//   Patch,
//   Delete,
// } from '@nestjs/common';
// import { RemarksService } from '../services/remarks.service';
// import { CreateRemarksDto } from '../dto/create-remarks.dto';

// @Controller('remarks')
// export class RemarksController {
//   constructor(private readonly remarksService: RemarksService) {}

//   @Post()
//   create(@Body() body: CreateRemarksDto) {
//     return this.remarksService.create(body);
//   }

//   @Get()
//   findAll() {
//     return this.remarksService.findAll();
//   }

//   @Get('by-serial/:serialNo')
//   findBySerial(@Param('serialNo') serialNo: string) {
//     return this.remarksService.findBySerialNo(Number(serialNo));
//   }

//   @Get(':id')
//   findOne(@Param('id') id: string) {
//     return this.remarksService.findOne(id);
//   }

//   @Patch(':id')
//   update(@Param('id') id: string, @Body() body: Partial<CreateRemarksDto>) {
//     return this.remarksService.update(id, body);
//   }

//   @Delete(':id')
//   remove(@Param('id') id: string) {
//     return this.remarksService.remove(id);
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
import { RemarksService } from '../services/remarks.service';
import { CreateRemarksDto } from '../dto/create-remarks.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

@FrisPagePermissionAny(...FLIGHT_FORM_PAGE_PERMISSIONS)
@Controller('ns-raw-flight-data/remarks-details')
export class RemarksController {
  constructor(private readonly remarksService: RemarksService) {}

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
    return this.remarksService.findBySerial(serial, station);
  }

  @Post(':serialNo')
  create(
    @Param('serialNo') serialNo: string,
    @Body() body: CreateRemarksDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.remarksService.upsertBySerial(serial, body, station);
  }

  @Patch(':serialNo')
  update(
    @Param('serialNo') serialNo: string,
    @Body() body: Partial<CreateRemarksDto>,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.remarksService.updateBySerial(serial, body, station);
  }

  @Delete(':serialNo')
  remove(
    @Param('serialNo') serialNo: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.remarksService.deleteBySerial(serial, station);
  }
}
