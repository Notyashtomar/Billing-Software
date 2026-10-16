import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';
import { UserNotificationCenterService } from '../services/user-notification-center.service';

@Controller('users/notification-center')
export class UserNotificationCenterController {
  constructor(
    private readonly notificationCenterService: UserNotificationCenterService,
  ) {}

  @Get()
  listNotifications(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query('undeliveredOnly') undeliveredOnly?: string,
    @Query('popupOnly') popupOnly?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const userId = String(user?.userId ?? '').trim();
    if (!userId) throw new UnauthorizedException('Sign in required');

    return this.notificationCenterService.listForUser(userId, {
      undeliveredOnly: undeliveredOnly === 'true' || undeliveredOnly === '1',
      popupOnly: popupOnly === 'true' || popupOnly === '1',
      fromDate,
      toDate,
    });
  }

  @Patch(':id/delivered')
  markDelivered(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const userId = String(user?.userId ?? '').trim();
    if (!userId) throw new UnauthorizedException('Sign in required');
    return this.notificationCenterService.markDelivered(userId, id);
  }

  @Patch(':id/read')
  markRead(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const userId = String(user?.userId ?? '').trim();
    if (!userId) throw new UnauthorizedException('Sign in required');
    return this.notificationCenterService.markRead(userId, id);
  }
}
