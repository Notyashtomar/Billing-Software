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
import { Roles } from '../../auth/decorators/roles.decorator';
import { ADMIN_ROLES } from '../../auth/enums/roles.enum';
import { CreateAdminDepartmentDto } from '../dto/create-admin-department.dto';
import { AdminDepartmentsService } from '../services/admin-departments.service';

@Controller('admin-departments')
export class AdminDepartmentsController {
  constructor(private readonly adminDepartmentsService: AdminDepartmentsService) {}

  @Post()
  @Roles(...ADMIN_ROLES)
  create(@Body() dto: CreateAdminDepartmentDto) {
    return this.adminDepartmentsService.create(dto);
  }

  @Get()
  findAll(@Query('filter') filter?: string) {
    return this.adminDepartmentsService.findAll(filter);
  }

  @Get('manager-options')
  @Roles(...ADMIN_ROLES)
  listManagerOptions() {
    return this.adminDepartmentsService.listManagerOptions();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.adminDepartmentsService.findOne(id);
  }

  @Patch(':id')
  @Roles(...ADMIN_ROLES)
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateAdminDepartmentDto>,
  ) {
    return this.adminDepartmentsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(...ADMIN_ROLES)
  remove(@Param('id') id: string) {
    return this.adminDepartmentsService.remove(id);
  }
}
