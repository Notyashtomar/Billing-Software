import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AdminAuditService } from '../../admin-audit/services/admin-audit.service';
import {
  USER_ACTIVITY_LOG_EVENT,
  type UserActivityLogEventPayload,
} from '../events/user-activity.events';
import { UserActionLogService } from '../services/user-action-log.service';
import { isUntrackedClientPath } from '../utils/describe-user-action.util';

@Injectable()
export class UserActivityLogListener {
  constructor(
    private readonly userActionLogService: UserActionLogService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  @OnEvent(USER_ACTIVITY_LOG_EVENT, { async: true })
  async handleUserActivity(payload: UserActivityLogEventPayload): Promise<void> {
    const clientPath = String(payload.metadata?.clientPath ?? '');
    if (
      isUntrackedClientPath(payload.path ?? '') ||
      isUntrackedClientPath(clientPath)
    ) {
      return;
    }
    try {
      const log = await this.userActionLogService.record(payload);
      await this.adminAuditService.recordFromActivity(payload, String(log._id));
    } catch {
      /* non-blocking audit */
    }
  }
}
