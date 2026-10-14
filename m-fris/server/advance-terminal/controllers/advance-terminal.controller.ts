import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
} from '@nestjs/common';
import { FrisPagePermission } from '../../auth/decorators/fris-page-permission.decorator';
import { AdvanceTerminalService } from '../services/advance-terminal.service';
import { CreateAdvanceTerminalDto } from '../dto/create-advance-terminal.dto';
import { CurrentStation } from '../../common/station/current-station.decorator';
import type { StationScopeContext } from '../../common/station/station-scope';

@FrisPagePermission('advance', 'Terminal')
@Controller('advance-terminal')
export class AdvanceTerminalController {
  constructor(
    private readonly advanceTerminalService: AdvanceTerminalService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateAdvanceTerminalDto,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceTerminalService.create(dto, station);
  }

  @Get()
  findAll(
    @CurrentStation() station: StationScopeContext,
    @Query('filter') filter?: string,
  ) {
    return this.advanceTerminalService.findAll(filter, station);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceTerminalService.findOne(id, station);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateAdvanceTerminalDto>,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceTerminalService.update(id, dto, station);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentStation() station: StationScopeContext,
  ) {
    return this.advanceTerminalService.remove(id, station);
  }
}
