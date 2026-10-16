import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ADMIN_NOTIFICATION_EVENT,
  type AdminNotificationPayload,
} from '../events/admin-notification.events';
import { AdminNotificationService } from '../services/admin-notification.service';

@Injectable()
export class AdminNotificationListener {
  constructor(private readonly adminNotificationService: AdminNotificationService) {}

  @OnEvent(ADMIN_NOTIFICATION_EVENT)
  async handleAdminNotification(payload: AdminNotificationPayload) {
    await this.adminNotificationService.record(payload);
  }
}
