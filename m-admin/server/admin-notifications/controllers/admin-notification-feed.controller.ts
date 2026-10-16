import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ADMIN_ROLES } from '../../auth/enums/roles.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';
import { SendUniversalNotificationDto } from '../dto/send-universal-notification.dto';
import { AdminNotificationService } from '../services/admin-notification.service';

@Roles(...ADMIN_ROLES)
@Controller('admins')
export class AdminNotificationFeedController {
  constructor(private readonly adminNotificationService: AdminNotificationService) {}

  @Get('notifications/feed')
  listFeed(
    @CurrentUser() admin: AuthenticatedPrincipal,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminNotificationService.listForAdmin({
      fromDate,
      toDate,
      limit: limit ? Number(limit) : undefined,
      adminId: String(admin?.userId ?? '').trim() || undefined,
    });
  }

  @Post('notifications/mark-all-read')
  markAllRead(
    @CurrentUser() admin: AuthenticatedPrincipal,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const adminId = String(admin?.userId ?? '').trim();
    if (!adminId) {
      throw new BadRequestException('Admin session required');
    }
    return this.adminNotificationService.markAllReadForAdmin(adminId, {
      fromDate,
      toDate,
    });
  }

  @Post('notifications/universal')
  async sendUniversal(
    @Body() body: SendUniversalNotificationDto,
    @CurrentUser() admin: AuthenticatedPrincipal,
  ) {
    const adminId = String(admin?.userId ?? '').trim();
    const adminName = String(admin?.name ?? admin?.userid ?? 'Admin').trim();
    if (!adminId) {
      throw new BadRequestException('Admin session required');
    }

    try {
      return await this.adminNotificationService.sendUniversalNotification(
        {
          title: body.title,
          message: body.message,
          audience: body.audience,
          userIds: body.userIds,
        },
        { id: adminId, name: adminName },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Universal send failed';
      if (message.includes('not found')) {
        throw new NotFoundException(message);
      }
      throw new BadRequestException(message);
    }
  }

  @Post('notifications/shoot-event/:eventId')
  async shootEventToFrisUsers(
    @Param('eventId') eventId: string,
    @CurrentUser() admin: AuthenticatedPrincipal,
  ) {
    const adminId = String(admin?.userId ?? '').trim();
    const adminName = String(admin?.name ?? admin?.userid ?? 'Admin').trim();
    if (!adminId) {
      throw new BadRequestException('Admin session required');
    }

    try {
      return await this.adminNotificationService.shootToFrisUsers(eventId, {
        id: adminId,
        name: adminName,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Shoot failed';
      if (message.includes('not found')) {
        throw new NotFoundException(message);
      }
      throw new BadRequestException(message);
    }
  }
}
