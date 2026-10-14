import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { OPERATIONAL_ROLES } from '../../auth/enums/roles.enum';
import { EquipmentDetailsService } from '../services/equipment-details.service';
import { CreateEquipmentDetailsDto } from '../dto/create-equipment-details.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

@Roles(...OPERATIONAL_ROLES)
@Controller('equipment-details')
export class EquipmentDetailsController {
  constructor(
    private readonly equipmentDetailsService: EquipmentDetailsService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateEquipmentDetailsDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.equipmentDetailsService.create(dto, station);
  }

  @Get()
  findAll(@CurrentStation() station: StationScopeContext) {
    return this.equipmentDetailsService.findAll(station);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.equipmentDetailsService.findOne(id, station);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateEquipmentDetailsDto>,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.equipmentDetailsService.update(id, dto, station);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.equipmentDetailsService.remove(id, station);
  }
}
