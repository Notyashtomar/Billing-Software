import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../user/schema/user.schema';
import { ymdTodayLocal } from '../../user-activity-notifications/utils/describe-user-action.util';
import {
  UserNotificationCenter,
  UserNotificationCenterDocument,
} from '../../user-activity-notifications/schema/user-notification-center.schema';
import type { AdminNotificationPayload } from '../events/admin-notification.events';
import {
  AdminNotificationEvent,
  AdminNotificationEventDocument,
} from '../schema/admin-notification-event.schema';
import { isShootableAdminNotificationKind } from '../utils/admin-notification-kinds.util';

@Injectable()
export class AdminNotificationService {
  constructor(
    @InjectModel(AdminNotificationEvent.name)
    private readonly notificationModel: Model<AdminNotificationEventDocument>,
    @InjectModel(UserNotificationCenter.name)
    private readonly userNotificationModel: Model<UserNotificationCenterDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async record(payload: AdminNotificationPayload) {
    const title = String(payload.title ?? '').trim();
    const subtitle = String(payload.subtitle ?? '').trim();
    if (!title || !subtitle) return null;

    const kind = String(payload.kind ?? 'system').trim();

    return this.notificationModel.create({
      kind,
      title,
      subtitle,
      actorName: payload.actorName?.trim() || undefined,
      entityType: payload.entityType,
      entityId: payload.entityId?.trim() || undefined,
      ticketNumber: payload.ticketNumber?.trim() || undefined,
      metadata: payload.metadata ?? {},
      eventDate: ymdTodayLocal(),
      shootableToUsers: isShootableAdminNotificationKind(kind),
      userBroadcastSent: false,
      readByAdminIds: [],
    });
  }

  async listForAdmin(options?: {
    fromDate?: string;
    toDate?: string;
    limit?: number;
    adminId?: string;
  }) {
    const limit = Math.min(Math.max(Number(options?.limit ?? 50) || 50, 1), 200);
    const adminId = String(options?.adminId ?? '').trim();
    const filter: Record<string, unknown> = {};
    const from = String(options?.fromDate ?? '').trim();
    const to = String(options?.toDate ?? '').trim();

    if (from && to) {
      filter.eventDate = { $gte: from, $lte: to };
    } else if (from) {
      filter.eventDate = { $gte: from };
    } else if (to) {
      filter.eventDate = { $lte: to };
    }

    const rows = await this.notificationModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    let unreadCount = 0;
    const serialized = rows.map((row) => {
      const readByAdminIds = Array.isArray(row.readByAdminIds)
        ? row.readByAdminIds.map((id) => String(id))
        : [];
      const read = adminId ? readByAdminIds.includes(adminId) : false;
      if (!read) unreadCount += 1;
      return {
        id: String(row._id),
        kind: row.kind,
        title: row.title,
        subtitle: row.subtitle,
        actorName: row.actorName ?? '',
        entityType: row.entityType ?? '',
        entityId: row.entityId ? String(row.entityId) : '',
        ticketNumber: row.ticketNumber ?? '',
        eventDate: row.eventDate,
        createdAt: (row as { createdAt?: Date }).createdAt ?? null,
        shootableToUsers: Boolean(row.shootableToUsers),
        userBroadcastSent: Boolean(row.userBroadcastSent),
        read,
      };
    });

    return {
      rows: serialized,
      total: serialized.length,
      unreadCount,
    };
  }

  async markAllReadForAdmin(
    adminId: string,
    options?: { fromDate?: string; toDate?: string },
  ) {
    const id = String(adminId ?? '').trim();
    if (!id) {
      throw new BadRequestException('Admin session required');
    }

    const filter: Record<string, unknown> = {
      readByAdminIds: { $nin: [id] },
    };
    const from = String(options?.fromDate ?? '').trim();
    const to = String(options?.toDate ?? '').trim();
    if (from && to) {
      filter.eventDate = { $gte: from, $lte: to };
    } else if (from) {
      filter.eventDate = { $gte: from };
    } else if (to) {
      filter.eventDate = { $lte: to };
    }

    const result = await this.notificationModel.updateMany(filter, {
      $addToSet: { readByAdminIds: id },
    });

    return {
      success: true,
      modifiedCount: result.modifiedCount ?? 0,
    };
  }

  async sendUniversalNotification(
    input: {
      title: string;
      message: string;
      audience?: 'all' | 'custom';
      userIds?: string[];
    },
    admin: { id: string; name: string },
  ) {
    const title = String(input.title ?? '').trim();
    const message = String(input.message ?? '').trim();
    if (!title || !message) {
      throw new BadRequestException('Title and message are required');
    }

    const audience = input.audience === 'custom' ? 'custom' : 'all';
    const requestedIds = Array.isArray(input.userIds)
      ? [
          ...new Set(
            input.userIds
              .map((id) => String(id ?? '').trim())
              .filter(Boolean),
          ),
        ]
      : [];

    if (audience === 'custom' && requestedIds.length === 0) {
      throw new BadRequestException('Select at least one user for a custom notification');
    }

    const recipients =
      audience === 'custom'
        ? await this.listFrisUserRecipientsByIds(requestedIds)
        : await this.listFrisUserRecipients();

    if (audience === 'custom' && recipients.length === 0) {
      throw new BadRequestException('None of the selected users are active registered accounts');
    }

    const event = await this.notificationModel.create({
      kind: 'universal',
      title,
      subtitle: message,
      actorName: admin.name,
      entityType: 'universal_broadcast',
      eventDate: ymdTodayLocal(),
      shootableToUsers: true,
      userBroadcastSent: false,
      readByAdminIds: [admin.id],
      metadata: {
        maxPopupShows: 2,
        audience,
        recipientUserIds: recipients.map((row) => row.id),
        recipientCount: recipients.length,
      },
    });

    return this.shootToFrisUsers(String(event._id), admin, recipients);
  }

  async shootToFrisUsers(
    eventId: string,
    admin: { id: string; name: string },
    preloadedRecipients?: Array<{ id: string; name: string }>,
  ) {
    if (!Types.ObjectId.isValid(eventId)) {
      throw new NotFoundException('Notification not found');
    }

    const event = await this.notificationModel.findById(eventId);
    if (!event) {
      throw new NotFoundException('Notification not found');
    }
    if (!event.shootableToUsers) {
      throw new BadRequestException('This notification cannot be broadcast to FRIS users');
    }
    if (event.userBroadcastSent) {
      return {
        alreadySent: true,
        recipientCount: 0,
        event: this.serializeEvent(event),
      };
    }

    const recipients =
      preloadedRecipients ?? (await this.listFrisUserRecipients());
    const sourceLogId = `admin-event:${String(event._id)}`;
    const notificationDate = ymdTodayLocal();
    const title = event.title;
    const message = event.subtitle;
    const maxPopupShows =
      event.kind === 'universal'
        ? 2
        : Number((event.metadata as { maxPopupShows?: number } | undefined)?.maxPopupShows ?? 2) ||
          2;

    for (const recipient of recipients) {
      await this.userNotificationModel.findOneAndUpdate(
        { sourceLogId, userId: recipient.id },
        {
          $set: {
            userId: recipient.id,
            userName: recipient.name,
            title,
            message,
            sourceLogId,
            notificationDate,
            delivered: false,
            deliveredAt: undefined,
            readAt: undefined,
            popupShowCount: 0,
            maxPopupShows,
            shotByAdminId: admin.id,
            shotByAdminName: admin.name,
          },
        },
        { upsert: true },
      );
    }

    event.userBroadcastSent = true;
    await event.save();

    return {
      alreadySent: false,
      recipientCount: recipients.length,
      event: this.serializeEvent(event),
    };
  }

  private async listFrisUserRecipients(): Promise<Array<{ id: string; name: string }>> {
    const users = await this.userModel
      .find({ accountStatus: 'active', isActive: { $ne: false } })
      .select('_id name')
      .lean();

    return users
      .map((row) => ({
        id: String(row._id ?? '').trim(),
        name: String(row.name ?? '').trim() || 'User',
      }))
      .filter((row) => row.id);
  }

  private async listFrisUserRecipientsByIds(
    userIds: string[],
  ): Promise<Array<{ id: string; name: string }>> {
    const ids = userIds.filter((id) => Types.ObjectId.isValid(id));
    if (ids.length === 0) return [];

    const users = await this.userModel
      .find({
        _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
        accountStatus: 'active',
        isActive: { $ne: false },
      })
      .select('_id name')
      .lean();

    const byId = new Map(
      users.map((row) => [
        String(row._id ?? '').trim(),
        String(row.name ?? '').trim() || 'User',
      ]),
    );

    // Preserve selection order from the admin UI.
    return ids
      .map((id) => {
        const name = byId.get(id);
        return name ? { id, name } : null;
      })
      .filter((row): row is { id: string; name: string } => Boolean(row));
  }

  private serializeEvent(row: AdminNotificationEventDocument | Record<string, unknown>) {
    const r = row as AdminNotificationEventDocument & { _id: Types.ObjectId };
    return {
      id: String(r._id),
      kind: r.kind,
      title: r.title,
      subtitle: r.subtitle,
      userBroadcastSent: Boolean(r.userBroadcastSent),
      shootableToUsers: Boolean(r.shootableToUsers),
    };
  }
}
