import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  UserNotificationCenter,
  UserNotificationCenterDocument,
} from '../schema/user-notification-center.schema';

@Injectable()
export class UserNotificationCenterService {
  constructor(
    @InjectModel(UserNotificationCenter.name)
    private readonly notificationModel: Model<UserNotificationCenterDocument>,
  ) {}

  async listForUser(
    userId: string,
    options?: {
      undeliveredOnly?: boolean;
      popupOnly?: boolean;
      fromDate?: string;
      toDate?: string;
    },
  ) {
    const uid = String(userId ?? '').trim();
    if (!uid) return { rows: [], groupedByDate: {} as Record<string, unknown[]> };

    const filter: Record<string, unknown> = { userId: uid };
    if (options?.popupOnly) {
      // Admin-shot popups: show until popupShowCount reaches maxPopupShows (default 2).
      filter.delivered = false;
      filter.shotByAdminId = { $exists: true, $nin: [null, ''] };
      filter.$expr = {
        $lt: [
          { $ifNull: ['$popupShowCount', 0] },
          { $ifNull: ['$maxPopupShows', 2] },
        ],
      };
    } else if (options?.undeliveredOnly) {
      filter.delivered = false;
    }
    const from = String(options?.fromDate ?? '').trim();
    const to = String(options?.toDate ?? '').trim();
    if (from && to) {
      filter.notificationDate = { $gte: from, $lte: to };
    }

    const rows = await this.notificationModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const serialized = rows.map((row) => {
      const popupShowCount = Number(row.popupShowCount ?? 0) || 0;
      const maxPopupShows = Number(row.maxPopupShows ?? 2) || 2;
      return {
        id: String(row._id),
        userId: row.userId,
        userName: row.userName ?? '',
        title: row.title,
        message: row.message,
        notificationDate: row.notificationDate,
        delivered: Boolean(row.delivered),
        deliveredAt: row.deliveredAt ?? null,
        popupShowCount,
        maxPopupShows,
        readAt: row.readAt ?? null,
        sourceLogId: row.sourceLogId ? String(row.sourceLogId) : null,
        shotByAdminName: row.shotByAdminName ?? '',
        createdAt: row.createdAt ?? null,
      };
    });

    const groupedByDate: Record<string, typeof serialized> = {};
    for (const row of serialized) {
      const key = row.notificationDate || 'unknown';
      if (!groupedByDate[key]) groupedByDate[key] = [];
      groupedByDate[key].push(row);
    }

    return { rows: serialized, groupedByDate };
  }

  /**
   * Record one centered-popup display. Marks fully delivered only after
   * `maxPopupShows` displays (default 2 for universal / admin broadcasts).
   */
  async markDelivered(userId: string, notificationId: string) {
    const uid = String(userId ?? '').trim();
    const id = String(notificationId ?? '').trim();
    if (!uid || !id) return null;

    const doc = await this.notificationModel.findOne({ _id: id, userId: uid });
    if (!doc) return null;

    const maxPopupShows = Math.max(1, Number(doc.maxPopupShows ?? 2) || 2);
    const current = Math.max(0, Number(doc.popupShowCount ?? 0) || 0);

    if (doc.delivered && current >= maxPopupShows) {
      return {
        id: String(doc._id),
        delivered: true,
        deliveredAt: doc.deliveredAt ?? null,
        popupShowCount: current,
        maxPopupShows,
      };
    }

    if (current >= maxPopupShows) {
      doc.delivered = true;
      doc.deliveredAt = doc.deliveredAt ?? new Date();
      doc.popupShowCount = current;
      doc.maxPopupShows = maxPopupShows;
      await doc.save();
      return {
        id: String(doc._id),
        delivered: true,
        deliveredAt: doc.deliveredAt ?? null,
        popupShowCount: current,
        maxPopupShows,
      };
    }

    const next = current + 1;
    doc.popupShowCount = next;
    doc.maxPopupShows = maxPopupShows;
    if (next >= maxPopupShows) {
      doc.delivered = true;
      doc.deliveredAt = new Date();
    }
    await doc.save();

    return {
      id: String(doc._id),
      delivered: Boolean(doc.delivered),
      deliveredAt: doc.deliveredAt ?? null,
      popupShowCount: next,
      maxPopupShows,
    };
  }

  async markRead(userId: string, notificationId: string) {
    const uid = String(userId ?? '').trim();
    const id = String(notificationId ?? '').trim();
    if (!uid || !id) return null;

    const doc = await this.notificationModel.findOneAndUpdate(
      { _id: id, userId: uid },
      { $set: { readAt: new Date() } },
      { new: true },
    );
    if (!doc) return null;
    return {
      id: String(doc._id),
      readAt: doc.readAt ?? null,
    };
  }
}
