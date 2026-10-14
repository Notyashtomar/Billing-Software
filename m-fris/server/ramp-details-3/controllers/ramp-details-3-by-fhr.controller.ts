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
import { RampDetails3Service } from '../services/ramp-details-3.service';
import { CreateRampDetails3Dto } from '../dto/create-ramp-details-3.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

@Roles(...OPERATIONAL_ROLES)
@Controller('by-fhr/:fhrNo/ramp-details-3')
export class RampDetails3ByFhrController {
  constructor(private readonly rampDetails3Service: RampDetails3Service) {}

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
    return this.rampDetails3Service.findByFhrNo(fhr, station);
  }

  @Post()
  create(
    @Param('fhrNo') fhrNo: string,
    @Body() body: CreateRampDetails3Dto,
    @CurrentStation() station: StationScopeContext,
  ) {
    const fhr = this.validateFhrNo(fhrNo);
    return this.rampDetails3Service.createByFhrNo(fhr, body, station);
  }

  @Patch()
  update(
    @Param('fhrNo') fhrNo: string,
    @Body() body: Partial<CreateRampDetails3Dto>,
    @CurrentStation() station: StationScopeContext,
  ) {
    const fhr = this.validateFhrNo(fhrNo);
    return this.rampDetails3Service.updateByFhrNo(fhr, body, station);
  }

  @Delete()
  remove(
    @Param('fhrNo') fhrNo: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    const fhr = this.validateFhrNo(fhrNo);
    return this.rampDetails3Service.deleteByFhrNo(fhr, station);
  }
}
