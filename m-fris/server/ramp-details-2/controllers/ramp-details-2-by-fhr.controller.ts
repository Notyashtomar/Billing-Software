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
import { Roles } from '../../auth/decorators/roles.decorator';
import { OPERATIONAL_ROLES } from '../../auth/enums/roles.enum';
import { RampDetails2Service } from '../services/ramp-details-2.service';
import { CreateRampDetails2Dto } from '../dto/create-ramp-details-2.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

@Roles(...OPERATIONAL_ROLES)
@Controller('by-fhr/:fhrNo/ramp-details-2')
export class RampDetails2ByFhrController {
  constructor(private readonly rampDetails2Service: RampDetails2Service) {}

  private validateFhrNo(fhrNo: string): string {
    const fhr = fhrNo?.trim();
    if (!fhr) {
      throw new BadRequestException('Invalid fhrNo');
    }
    return fhr;
  }

  @Get()
  find(
    @Param('fhrNo') fhrNo: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    const fhr = this.validateFhrNo(fhrNo);
    return this.rampDetails2Service.findByFhrNo(fhr, station);
  }

  @Post()
  create(
    @Param('fhrNo') fhrNo: string,
    @Body() body: CreateRampDetails2Dto,
    @CurrentStation() station: StationScopeContext,
  ) {
    const fhr = this.validateFhrNo(fhrNo);
    return this.rampDetails2Service.createByFhrNo(fhr, body, station);
  }

  @Patch()
  update(
    @Param('fhrNo') fhrNo: string,
    @Body() body: Partial<CreateRampDetails2Dto>,
    @CurrentStation() station: StationScopeContext,
  ) {
    const fhr = this.validateFhrNo(fhrNo);
    return this.rampDetails2Service.updateByFhrNo(fhr, body, station);
  }

  @Delete()
  remove(
    @Param('fhrNo') fhrNo: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    const fhr = this.validateFhrNo(fhrNo);
    return this.rampDetails2Service.deleteByFhrNo(fhr, station);
  }
}
