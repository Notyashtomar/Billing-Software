import { Controller, Get, Param, Query } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '../../auth/enums/roles.enum';
import { QueryAccessControlUsersDto } from '../dto/query-access-control-users.dto';
import { AdminAccessControlService } from '../services/admin-access-control.service';

const ACCESS_CONTROL_VIEWER_ROLES = [
  Role.SUPER_ADMIN,
  Role.MANAGER,
] as const;

@Controller('admin/access-control')
@Roles(...ACCESS_CONTROL_VIEWER_ROLES)
export class AdminAccessControlController {
  constructor(
    private readonly adminAccessControlService: AdminAccessControlService,
  ) {}

  @Get('role-summary')
  getRoleSummary() {
    return this.adminAccessControlService.getRoleSummary();
  }

  @Get('users')
  listUsers(@Query() query: QueryAccessControlUsersDto) {
    return this.adminAccessControlService.listUsers(query);
  }

  @Get('users/:id')
  getUserDetail(
    @Param('id') id: string,
    @Query('accountKind') accountKind?: string,
  ) {
    return this.adminAccessControlService.getUserDetail(id, accountKind);
  }
}
