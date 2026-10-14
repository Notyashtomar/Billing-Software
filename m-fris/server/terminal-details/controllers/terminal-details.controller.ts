// import {
//   Controller,
//   Get,
//   Post,
//   Body,
//   Param,
//   Patch,
//   Delete,
// } from '@nestjs/common';
// import { TerminalDetailsService } from '../services/terminal-details.service';
// import { CreateTerminalDetailsDto } from '../dto/create-terminal-details.dto';

// @Controller('terminal-details')
// export class TerminalDetailsController {
//   constructor(
//     private readonly terminalDetailsService: TerminalDetailsService,
//   ) {}

//   @Post()
//   create(@Body() body: CreateTerminalDetailsDto) {
//     return this.terminalDetailsService.create(body);
//   }

//   @Get()
//   findAll() {
//     return this.terminalDetailsService.findAll();
//   }

//   @Get('by-serial/:serialNo')
//   findBySerial(@Param('serialNo') serialNo: string) {
//     return this.terminalDetailsService.findBySerialNo(Number(serialNo));
//   }

//   @Get(':id')
//   findOne(@Param('id') id: string) {
//     return this.terminalDetailsService.findOne(id);
//   }

//   @Patch(':id')
//   update(
//     @Param('id') id: string,
//     @Body() body: Partial<CreateTerminalDetailsDto>,
//   ) {
//     return this.terminalDetailsService.update(id, body);
//   }

//   @Delete(':id')
//   remove(@Param('id') id: string) {
//     return this.terminalDetailsService.remove(id);
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
import { TerminalDetailsService } from '../services/terminal-details.service';
import { CreateTerminalDetailsDto } from '../dto/create-terminal-details.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

@FrisPagePermissionAny(...FLIGHT_FORM_PAGE_PERMISSIONS)
@Controller('ns-raw-flight-data/terminal-details')
export class TerminalDetailsController {
  constructor(
    private readonly terminalDetailsService: TerminalDetailsService,
  ) {}

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
    return this.terminalDetailsService.findBySerial(serial, station);
  }

  @Post(':serialNo')
  create(
    @Param('serialNo') serialNo: string,
    @Body() body: CreateTerminalDetailsDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.terminalDetailsService.upsertBySerial(serial, body, station);
  }

  @Patch(':serialNo')
  update(
    @Param('serialNo') serialNo: string,
    @Body() body: Partial<CreateTerminalDetailsDto>,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.terminalDetailsService.updateBySerial(serial, body, station);
  }

  @Delete(':serialNo')
  remove(
    @Param('serialNo') serialNo: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    const serial = this.validateSerial(serialNo);
    return this.terminalDetailsService.deleteBySerial(serial, station);
  }
}
