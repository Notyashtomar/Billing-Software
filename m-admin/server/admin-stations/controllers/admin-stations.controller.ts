import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ADMIN_ROLES } from '../../auth/enums/roles.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';
import { CreateAdminStationDto } from '../dto/create-admin-station.dto';
import { AdminStationsService } from '../services/admin-stations.service';

@Controller('admin-stations')
export class AdminStationsController {
  constructor(private readonly adminStationsService: AdminStationsService) {}

  @Post()
  @Roles(...ADMIN_ROLES)
  create(@Body() dto: CreateAdminStationDto) {
    return this.adminStationsService.create(dto);
  }

  @Get('login-options')
  @Public()
  listLoginOptions() {
    return this.adminStationsService.listLoginOptions();
  }

  @Get()
  findAll(
    @Query('filter') filter?: string,
    @CurrentUser() user?: AuthenticatedPrincipal,
  ) {
    return this.adminStationsService.findAll(filter, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user?: AuthenticatedPrincipal) {
    return this.adminStationsService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(...ADMIN_ROLES)
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateAdminStationDto>,
  ) {
    return this.adminStationsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(...ADMIN_ROLES)
  remove(@Param('id') id: string) {
    return this.adminStationsService.remove(id);
  }
}
