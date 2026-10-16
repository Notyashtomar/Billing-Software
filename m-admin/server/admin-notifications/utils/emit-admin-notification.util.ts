import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ADMIN_NOTIFICATION_EVENT,
  type AdminNotificationPayload,
} from '../events/admin-notification.events';

export function emitAdminNotification(
  eventEmitter: EventEmitter2,
  payload: AdminNotificationPayload,
) {
  eventEmitter.emit(ADMIN_NOTIFICATION_EVENT, payload);
}
