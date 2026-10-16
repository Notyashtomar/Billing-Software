import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Admin, AdminDocument } from '../../admin/schema/admin.schema';
import { User, UserDocument } from '../../user/schema/user.schema';
import {
  UserActionLog,
  UserActionLogDocument,
} from '../schema/user-action-log.schema';
import {
  UserNotificationCenter,
  UserNotificationCenterDocument,
} from '../schema/user-notification-center.schema';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';
import { AdminPanelStationScopeService } from '../../common/station/admin-panel-station-scope.service';
import type { UserActivityLogEventPayload } from '../events/user-activity.events';
import { deriveClientPageLocation, UNTRACKED_CLIENT_PATH_SOURCE, ymdTodayLocal } from '../utils/describe-user-action.util';

@Injectable()
export class UserActionLogService {
  constructor(
    @InjectModel(UserActionLog.name)
    private readonly logModel: Model<UserActionLogDocument>,
    @InjectModel(UserNotificationCenter.name)
    private readonly notificationModel: Model<UserNotificationCenterDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Admin.name)
    private readonly adminModel: Model<AdminDocument>,
    private readonly adminPanelStationScope: AdminPanelStationScopeService,
  ) {}

  async record(payload: UserActivityLogEventPayload): Promise<UserActionLogDocument> {
    const userId = String(payload.userId ?? '').trim();
    const userName = String(payload.userName ?? '').trim() || 'Unknown user';
    if (!userId) {
      throw new Error('userId is required to record activity');
    }

    const action = String(payload.action ?? '').trim() || 'Performed action';
    const actionDate = ymdTodayLocal();

    const log = await this.logModel.create({
      userId,
      userName,
      userEmail: payload.userEmail?.trim() || undefined,
      accountType: payload.accountType === 'admin' ? 'admin' : 'user',
      action,
      summary: payload.summary?.trim() || undefined,
      actorRole: payload.actorRole?.trim() || undefined,
      stationId: payload.stationId?.trim() || undefined,
      stationName: payload.stationName?.trim() || undefined,
      module: payload.module?.trim() || undefined,
      page: payload.page?.trim() || undefined,
      tab: payload.tab?.trim() || undefined,
      section: payload.section?.trim() || undefined,
      entityType: payload.entityType?.trim() || undefined,
      entityId: payload.entityId?.trim() || undefined,
      entityName: payload.entityName?.trim() || undefined,
      changes:
        Array.isArray(payload.changes) && payload.changes.length > 0
          ? payload.changes
          : undefined,
      ipAddress: payload.ipAddress?.trim() || undefined,
      userAgent: payload.userAgent?.trim() || undefined,
      method: payload.method,
      path: payload.path,
      actionDate,
      metadata: payload.metadata,
      notificationSent: false,
    });

    if (payload.accountType === 'user' && payload.bumpLastActivity !== false) {
      await this.userModel
        .updateOne({ _id: userId }, { $set: { lastActivityAt: new Date() } })
        .catch(() => undefined);
    }

    return log;
  }

  async listForAdmin(options?: {
    fromDate?: string;
    toDate?: string;
    limit?: number;
    userId?: string;
    stationId?: string;
  }) {
    const limit = Math.min(Math.max(Number(options?.limit ?? 200) || 200, 1), 500);
    const and: Record<string, unknown>[] = [];
    const from = String(options?.fromDate ?? '').trim();
    const to = String(options?.toDate ?? '').trim();
    if (from && to) {
      and.push({ actionDate: { $gte: from, $lte: to } });
    } else if (from) {
      and.push({ actionDate: { $gte: from } });
    } else if (to) {
      and.push({ actionDate: { $lte: to } });
    }

    const userId = String(options?.userId ?? '').trim();
    if (userId) {
      and.push({ userId });
    }

    const stationId = String(options?.stationId ?? '').trim();
    if (stationId) {
      // Users tied to the station either by assignment or by holding FRIS
      // permission for it (matches the station-scoped user filter dropdown).
      const candidateRows = await this.userModel
        .find({
          $or: [
            { assignedStationIds: stationId },
            { [`stationPermissions.${stationId}`]: { $exists: true } },
          ],
        })
        .select('_id assignedStationIds stationPermissions')
        .lean();
      const stationUserIds = candidateRows
        .filter(
          (row) =>
            (Array.isArray(row.assignedStationIds) &&
              row.assignedStationIds.includes(stationId)) ||
            this.resolvePermittedStationIds(row.stationPermissions).includes(
              stationId,
            ),
        )
        .map((row) => String(row._id ?? '').trim())
        .filter(Boolean);

      const stationOr: Record<string, unknown>[] = [
        { 'metadata.stationId': stationId },
      ];
      if (stationUserIds.length > 0) {
        stationOr.push({ userId: { $in: stationUserIds } });
      }
      and.push({ $or: stationOr });
    }

    const hiddenClientPath = {
      $not: { $regex: UNTRACKED_CLIENT_PATH_SOURCE, $options: 'i' },
    };
    and.push({ path: hiddenClientPath });
    and.push({ 'metadata.clientPath': hiddenClientPath });

    const filter =
      and.length > 1 ? { $and: and } : and.length === 1 ? and[0]! : {};

    const rows = await this.logModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return rows.map((row) => ({
      id: String(row._id),
      userId: row.userId,
      userName: row.userName,
      userEmail: row.userEmail ?? '',
      accountType: row.accountType,
      action: row.action,
      summary: row.summary ?? '',
      actorRole: row.actorRole ?? '',
      stationId: row.stationId ?? '',
      stationName: row.stationName ?? '',
      module: row.module ?? '',
      page: row.page ?? '',
      tab: row.tab ?? '',
      section: row.section ?? '',
      entityType: row.entityType ?? '',
      entityId: row.entityId ?? '',
      entityName: row.entityName ?? '',
      changes: Array.isArray(row.changes) ? row.changes : [],
      ipAddress: row.ipAddress ?? '',
      userAgent: row.userAgent ?? '',
      method: row.method ?? '',
      path: row.path ?? '',
      actionDate: row.actionDate,
      createdAt: row.createdAt,
      metadata: row.metadata ?? null,
      notificationSent: Boolean(row.notificationSent),
      notificationId: row.notificationId ? String(row.notificationId) : null,
    }));
  }

  /**
   * Per-staff login counts for a station (FRIS + admin sign-ins at that station).
   * Also returns today's logins and a live "currently signed in" snapshot
   * (session TTL ≈ 1 day; last auth event at station is login, not logout).
   */
  async aggregateStationLoginStats(options: {
    stationId?: string;
    stationCode?: string;
    stationName?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<{
    stationId: string;
    stationLabel: string;
    fromDate: string;
    toDate: string;
    todayDate: string;
    totalLogins: number;
    uniqueStaff: number;
    todayTotalLogins: number;
    todayUniqueStaff: number;
    liveCount: number;
    rows: Array<{
      userId: string;
      userName: string;
      employeeId: string;
      accountType: string;
      loginCount: number;
      lastLoginAt: string;
      lastLoginDate: string;
      todayLoginCount: number;
      isLive: boolean;
      lastActivityAt: string;
      currentPage: string;
      currentModule: string;
      currentTab: string;
      currentPath: string;
      currentAction: string;
      currentPageAt: string;
      currentPageLabel: string;
      currentSystemId: string;
      currentSystem: string;
    }>;
    todayRows: Array<{
      userId: string;
      userName: string;
      employeeId: string;
      accountType: string;
      loginCount: number;
      lastLoginAt: string;
      lastLoginDate: string;
      isLive: boolean;
      lastActivityAt: string;
      currentPage: string;
      currentModule: string;
      currentTab: string;
      currentPath: string;
      currentAction: string;
      currentPageAt: string;
      currentPageLabel: string;
      currentSystemId: string;
      currentSystem: string;
    }>;
    liveRows: Array<{
      userId: string;
      userName: string;
      employeeId: string;
      accountType: string;
      loginCount: number;
      lastLoginAt: string;
      lastLoginDate: string;
      lastActivityAt: string;
      sessionAgeMinutes: number;
      currentPage: string;
      currentModule: string;
      currentTab: string;
      currentPath: string;
      currentAction: string;
      currentPageAt: string;
      currentPageLabel: string;
      currentSystemId: string;
      currentSystem: string;
    }>;
  }> {
    const empty = {
      stationId: '',
      stationLabel: 'Station',
      fromDate: '',
      toDate: '',
      todayDate: ymdTodayLocal(),
      totalLogins: 0,
      uniqueStaff: 0,
      todayTotalLogins: 0,
      todayUniqueStaff: 0,
      liveCount: 0,
      rows: [] as Array<{
        userId: string;
        userName: string;
        employeeId: string;
        accountType: string;
        loginCount: number;
        lastLoginAt: string;
        lastLoginDate: string;
        todayLoginCount: number;
        isLive: boolean;
        lastActivityAt: string;
        currentPage: string;
        currentModule: string;
        currentTab: string;
        currentPath: string;
        currentAction: string;
        currentPageAt: string;
        currentPageLabel: string;
        currentSystemId: string;
        currentSystem: string;
      }>,
      todayRows: [] as Array<{
        userId: string;
        userName: string;
        employeeId: string;
        accountType: string;
        loginCount: number;
        lastLoginAt: string;
        lastLoginDate: string;
        isLive: boolean;
        lastActivityAt: string;
        currentPage: string;
        currentModule: string;
        currentTab: string;
        currentPath: string;
        currentAction: string;
        currentPageAt: string;
        currentPageLabel: string;
        currentSystemId: string;
        currentSystem: string;
      }>,
      liveRows: [] as Array<{
        userId: string;
        userName: string;
        employeeId: string;
        accountType: string;
        loginCount: number;
        lastLoginAt: string;
        lastLoginDate: string;
        lastActivityAt: string;
        sessionAgeMinutes: number;
        currentPage: string;
        currentModule: string;
        currentTab: string;
        currentPath: string;
        currentAction: string;
        currentPageAt: string;
        currentPageLabel: string;
        currentSystemId: string;
        currentSystem: string;
      }>,
    };

    const stationId = String(options.stationId ?? '').trim();
    const stationCode = String(options.stationCode ?? '').trim();
    const stationName = String(options.stationName ?? '').trim();
    const stationLabel = stationCode || stationName || stationId || 'Station';

    const today = ymdTodayLocal();
    let fromDate = String(options.fromDate ?? '').trim();
    let toDate = String(options.toDate ?? '').trim();
    if (!toDate) toDate = today;
    if (!fromDate) {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      fromDate = `${y}-${m}-${day}`;
    }

    const stationOr: Record<string, unknown>[] = [];
    if (stationId) {
      stationOr.push({ stationId });
      stationOr.push({ 'metadata.stationId': stationId });
    }
    const nameTokens = [...new Set([stationCode, stationName].filter(Boolean))];
    for (const token of nameTokens) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      stationOr.push({
        stationName: { $regex: `^${escaped}$`, $options: 'i' },
      });
    }

    if (stationOr.length === 0) {
      return { ...empty, stationId, stationLabel, fromDate, toDate, todayDate: today };
    }

    const loginEventFilter = {
      $or: [
        { action: { $regex: '^signed in', $options: 'i' } },
        { path: { $regex: '/auth/(admin-)?login', $options: 'i' } },
      ],
    };
    const logoutEventFilter = {
      $or: [
        { action: { $regex: 'signed out', $options: 'i' } },
        { path: { $regex: '/auth/(admin-)?logout', $options: 'i' } },
      ],
    };

    type AggRow = {
      _id: string;
      userName?: string;
      accountType?: string;
      loginCount: number;
      lastLoginAt?: Date | string;
      lastLoginDate?: string;
    };

    const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
    const liveSince = new Date(Date.now() - SESSION_TTL_MS);

    const [aggregated, todayAggregated, authEvents] = await Promise.all([
      this.logModel
        .aggregate<AggRow>([
          {
            $match: {
              $and: [
                { actionDate: { $gte: fromDate, $lte: toDate } },
                loginEventFilter,
                { $or: stationOr },
              ],
            },
          },
          {
            $group: {
              _id: '$userId',
              userName: { $first: '$userName' },
              accountType: { $first: '$accountType' },
              loginCount: { $sum: 1 },
              lastLoginAt: { $max: '$createdAt' },
              lastLoginDate: { $max: '$actionDate' },
            },
          },
          { $sort: { loginCount: -1, userName: 1 } },
          { $limit: 200 },
        ])
        .exec(),
      this.logModel
        .aggregate<AggRow>([
          {
            $match: {
              $and: [
                { actionDate: today },
                loginEventFilter,
                { $or: stationOr },
              ],
            },
          },
          {
            $group: {
              _id: '$userId',
              userName: { $first: '$userName' },
              accountType: { $first: '$accountType' },
              loginCount: { $sum: 1 },
              lastLoginAt: { $max: '$createdAt' },
              lastLoginDate: { $max: '$actionDate' },
            },
          },
          { $sort: { loginCount: -1, userName: 1 } },
          { $limit: 200 },
        ])
        .exec(),
      this.logModel
        .find({
          $and: [
            { createdAt: { $gte: liveSince } },
            { $or: stationOr },
            { $or: [loginEventFilter, logoutEventFilter] },
          ],
        })
        .select('userId userName accountType action path createdAt actionDate')
        .sort({ createdAt: -1 })
        .limit(2000)
        .lean()
        .exec(),
    ]);

    type LiveCandidate = {
      userId: string;
      userName: string;
      accountType: string;
      lastLoginAt: Date;
      lastLoginDate: string;
      loginCountInWindow: number;
    };

    const latestByUser = new Map<
      string,
      { kind: 'login' | 'logout'; at: Date; userName: string; accountType: string; actionDate: string }
    >();
    const loginCountInWindow = new Map<string, number>();

    for (const event of authEvents) {
      const userId = String(event.userId ?? '').trim();
      if (!userId) continue;
      const action = String(event.action ?? '').toLowerCase();
      const path = String(event.path ?? '').toLowerCase();
      const isLogin =
        action.startsWith('signed in') || /\/auth\/(admin-)?login/.test(path);
      const isLogout =
        action.includes('signed out') || /\/auth\/(admin-)?logout/.test(path);
      if (!isLogin && !isLogout) continue;

      const at =
        event.createdAt instanceof Date
          ? event.createdAt
          : new Date(String(event.createdAt ?? ''));
      if (Number.isNaN(at.getTime())) continue;

      if (isLogin) {
        loginCountInWindow.set(userId, (loginCountInWindow.get(userId) ?? 0) + 1);
      }

      if (!latestByUser.has(userId)) {
        latestByUser.set(userId, {
          kind: isLogin ? 'login' : 'logout',
          at,
          userName: String(event.userName ?? '').trim() || 'Unknown',
          accountType: String(event.accountType ?? 'user'),
          actionDate: String(event.actionDate ?? '').trim(),
        });
      }
    }

    const liveCandidates: LiveCandidate[] = [];
    for (const [userId, latest] of latestByUser) {
      if (latest.kind !== 'login') continue;
      if (Date.now() - latest.at.getTime() > SESSION_TTL_MS) continue;
      liveCandidates.push({
        userId,
        userName: latest.userName,
        accountType: latest.accountType,
        lastLoginAt: latest.at,
        lastLoginDate: latest.actionDate || today,
        loginCountInWindow: loginCountInWindow.get(userId) ?? 1,
      });
    }

    const allUserIds = [
      ...new Set([
        ...aggregated.map((r) => String(r._id ?? '').trim()),
        ...todayAggregated.map((r) => String(r._id ?? '').trim()),
        ...liveCandidates.map((r) => r.userId),
      ]),
    ].filter(Boolean);

    type LatestPageRow = {
      _id: string;
      module?: string;
      page?: string;
      tab?: string;
      section?: string;
      path?: string;
      action?: string;
      clientPath?: string;
      systemId?: string;
      systemLabel?: string;
      createdAt?: Date | string;
    };

    const PAGE_LOOKBACK_MS = 24 * 60 * 60 * 1000;
    const pageSince = new Date(Date.now() - PAGE_LOOKBACK_MS);

    const employeeByUserId = new Map<string, string>();
    const lastActivityByUserId = new Map<string, string>();
    const currentPageByUserId = new Map<
      string,
      {
        currentPage: string;
        currentModule: string;
        currentTab: string;
        currentPath: string;
        currentAction: string;
        currentPageAt: string;
        currentPageLabel: string;
        currentSystemId: string;
        currentSystem: string;
      }
    >();

    if (allUserIds.length > 0) {
      const objectIds = allUserIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));

      const [users, latestPages] = await Promise.all([
        objectIds.length > 0
          ? this.userModel
              .find({ _id: { $in: objectIds } })
              .select('employeeId userid lastActivityAt')
              .lean()
              .exec()
          : Promise.resolve([]),
        this.logModel
          .aggregate<LatestPageRow>([
            {
              $match: {
                userId: { $in: allUserIds },
                createdAt: { $gte: pageSince },
                // Ignore auth noise — login/logout are not "current page".
                action: {
                  $not: { $regex: 'signed (in|out)', $options: 'i' },
                },
                module: { $ne: 'Authentication' },
                $and: [
                  {
                    path: {
                      $not: {
                        $regex: '/auth/(admin-)?(login|logout|session)',
                        $options: 'i',
                      },
                    },
                  },
                  {
                    path: {
                      $not: { $regex: UNTRACKED_CLIENT_PATH_SOURCE, $options: 'i' },
                    },
                  },
                  {
                    'metadata.clientPath': {
                      $not: { $regex: UNTRACKED_CLIENT_PATH_SOURCE, $options: 'i' },
                    },
                  },
                ],
              },
            },
            {
              $addFields: {
                _pageScore: {
                  $switch: {
                    branches: [
                      {
                        case: { $eq: ['$action', 'Viewing page'] },
                        then: 100,
                      },
                      {
                        case: {
                          $eq: [{ $ifNull: ['$metadata.pagePresence', false] }, true],
                        },
                        then: 90,
                      },
                      {
                        case: {
                          $gt: [
                            {
                              $strLenCP: {
                                $ifNull: ['$metadata.clientPath', ''],
                              },
                            },
                            0,
                          ],
                        },
                        then: 50,
                      },
                      {
                        case: {
                          $and: [
                            { $gt: [{ $strLenCP: { $ifNull: ['$page', ''] } }, 0] },
                            { $gt: [{ $strLenCP: { $ifNull: ['$module', ''] } }, 0] },
                          ],
                        },
                        then: 30,
                      },
                    ],
                    default: 1,
                  },
                },
              },
            },
            { $sort: { _pageScore: -1, createdAt: -1 } },
            {
              $group: {
                _id: '$userId',
                module: { $first: '$module' },
                page: { $first: '$page' },
                tab: { $first: '$tab' },
                section: { $first: '$section' },
                path: { $first: '$path' },
                action: { $first: '$action' },
                clientPath: { $first: '$metadata.clientPath' },
                systemId: { $first: '$metadata.systemId' },
                systemLabel: { $first: '$metadata.systemLabel' },
                createdAt: { $first: '$createdAt' },
              },
            },
          ])
          .exec(),
      ]);

      for (const user of users) {
        const id = String(user._id ?? '').trim();
        const emp =
          String(user.employeeId ?? '').trim() ||
          String(user.userid ?? '').trim();
        if (id && emp) employeeByUserId.set(id, emp);
        if (id && user.lastActivityAt) {
          const la =
            user.lastActivityAt instanceof Date
              ? user.lastActivityAt.toISOString()
              : String(user.lastActivityAt);
          lastActivityByUserId.set(id, la);
        }
      }

      const missing = allUserIds.filter((id) => !employeeByUserId.has(id));
      if (missing.length > 0) {
        const missingObjectIds = missing
          .filter((id) => Types.ObjectId.isValid(id))
          .map((id) => new Types.ObjectId(id));
        const adminQuery: Record<string, unknown>[] = [
          { userid: { $in: missing } },
        ];
        if (missingObjectIds.length > 0) {
          adminQuery.push({ _id: { $in: missingObjectIds } });
        }
        const admins = await this.adminModel
          .find({ $or: adminQuery })
          .select('userid')
          .lean()
          .exec();
        for (const admin of admins) {
          const id = String(admin._id ?? '').trim();
          const emp = String(admin.userid ?? '').trim();
          if (id && emp && !employeeByUserId.has(id)) {
            employeeByUserId.set(id, emp);
          }
        }
      }

      for (const pageRow of latestPages) {
        const id = String(pageRow._id ?? '').trim();
        if (!id) continue;
        const module = String(pageRow.module ?? '').trim();
        const page = String(pageRow.page ?? '').trim();
        const tab = String(pageRow.tab ?? pageRow.section ?? '').trim();
        const clientPath = String(pageRow.clientPath ?? '').trim();
        const path = clientPath || String(pageRow.path ?? '').trim();
        const action = String(pageRow.action ?? '').trim();
        const derived = path ? deriveClientPageLocation(path) : null;
        const systemId =
          String(pageRow.systemId ?? '').trim() ||
          String(derived?.systemId ?? '').trim();
        const systemLabel =
          String(pageRow.systemLabel ?? '').trim() ||
          String(derived?.systemLabel ?? '').trim() ||
          String(derived?.module ?? module).trim();
        const labelParts = [
          systemLabel && systemLabel !== module ? systemLabel : '',
          module,
          page,
          tab,
        ].filter(Boolean);
        // Prefer System · Page when module duplicates system (e.g. FRIS · FRIS · Dashboard)
        let currentPageLabel = '';
        if (systemLabel && page) {
          currentPageLabel = [systemLabel, page, tab].filter(Boolean).join(' · ');
        } else {
          currentPageLabel = labelParts.join(' · ');
        }
        if (!currentPageLabel && path) {
          currentPageLabel = path.split('?')[0] || path;
        }
        if (!currentPageLabel && action) currentPageLabel = action;
        if (!currentPageLabel) currentPageLabel = 'Unknown page';
        currentPageByUserId.set(id, {
          currentPage: page || String(derived?.page ?? ''),
          currentModule: module || String(derived?.module ?? ''),
          currentTab: tab || String(derived?.tab ?? ''),
          currentPath: path,
          currentAction: action,
          currentPageAt: toIsoLater(pageRow.createdAt),
          currentPageLabel,
          currentSystemId: systemId,
          currentSystem: systemLabel,
        });
      }
    }

    const liveIds = new Set(liveCandidates.map((c) => c.userId));
    const todayCountByUser = new Map(
      todayAggregated.map((row) => [
        String(row._id ?? '').trim(),
        Math.max(0, Number(row.loginCount) || 0),
      ]),
    );

    const toIso = (value: Date | string | undefined) => {
      if (value instanceof Date) return value.toISOString();
      return String(value ?? '');
    };

    function toIsoLater(value: Date | string | undefined) {
      if (value instanceof Date) return value.toISOString();
      return String(value ?? '');
    }

    const pageFields = (userId: string) => {
      const hit = currentPageByUserId.get(userId);
      return {
        currentPage: hit?.currentPage ?? '',
        currentModule: hit?.currentModule ?? '',
        currentTab: hit?.currentTab ?? '',
        currentPath: hit?.currentPath ?? '',
        currentAction: hit?.currentAction ?? '',
        currentPageAt: hit?.currentPageAt ?? '',
        currentPageLabel: hit?.currentPageLabel ?? '',
        currentSystemId: hit?.currentSystemId ?? '',
        currentSystem: hit?.currentSystem ?? '',
      };
    };

    const rows = aggregated.map((row) => {
      const userId = String(row._id ?? '').trim();
      return {
        userId,
        userName: String(row.userName ?? '').trim() || 'Unknown',
        employeeId: employeeByUserId.get(userId) ?? '',
        accountType: String(row.accountType ?? 'user'),
        loginCount: Math.max(0, Number(row.loginCount) || 0),
        lastLoginAt: toIso(row.lastLoginAt),
        lastLoginDate: String(row.lastLoginDate ?? '').trim(),
        todayLoginCount: todayCountByUser.get(userId) ?? 0,
        isLive: liveIds.has(userId),
        lastActivityAt: lastActivityByUserId.get(userId) ?? '',
        ...pageFields(userId),
      };
    });

    const todayRows = todayAggregated.map((row) => {
      const userId = String(row._id ?? '').trim();
      return {
        userId,
        userName: String(row.userName ?? '').trim() || 'Unknown',
        employeeId: employeeByUserId.get(userId) ?? '',
        accountType: String(row.accountType ?? 'user'),
        loginCount: Math.max(0, Number(row.loginCount) || 0),
        lastLoginAt: toIso(row.lastLoginAt),
        lastLoginDate: String(row.lastLoginDate ?? '').trim() || today,
        isLive: liveIds.has(userId),
        lastActivityAt: lastActivityByUserId.get(userId) ?? '',
        ...pageFields(userId),
      };
    });

    const liveRows = liveCandidates
      .map((c) => ({
        userId: c.userId,
        userName: c.userName,
        employeeId: employeeByUserId.get(c.userId) ?? '',
        accountType: c.accountType,
        loginCount: c.loginCountInWindow,
        lastLoginAt: c.lastLoginAt.toISOString(),
        lastLoginDate: c.lastLoginDate,
        lastActivityAt: lastActivityByUserId.get(c.userId) ?? '',
        sessionAgeMinutes: Math.max(
          0,
          Math.round((Date.now() - c.lastLoginAt.getTime()) / 60000),
        ),
        ...pageFields(c.userId),
      }))
      .sort((a, b) => a.sessionAgeMinutes - b.sessionAgeMinutes);

    const totalLogins = rows.reduce((sum, row) => sum + row.loginCount, 0);
    const todayTotalLogins = todayRows.reduce((sum, row) => sum + row.loginCount, 0);

    return {
      stationId,
      stationLabel,
      fromDate,
      toDate,
      todayDate: today,
      totalLogins,
      uniqueStaff: rows.length,
      todayTotalLogins,
      todayUniqueStaff: todayRows.length,
      liveCount: liveRows.length,
      rows,
      todayRows,
      liveRows,
    };
  }

  async listFilterUsers(principal?: AuthenticatedPrincipal): Promise<
    Array<{
      id: string;
      name: string;
      employeeId: string;
      accountType: 'admin' | 'user';
      stationIds: string[];
    }>
  > {
    const scope = await this.adminPanelStationScope.resolve(principal);
    const allowedIds = scope === 'all' ? null : new Set(scope);

    const [users, admins] = await Promise.all([
      this.userModel
        .find({
          accountStatus: { $nin: ['invited', 'rejected'] },
          isActive: { $ne: false },
        })
        .select('name employeeId userid assignedStationIds stationPermissions')
        .sort({ name: 1 })
        .lean(),
      scope === 'all'
        ? this.adminModel.find({}).select('name userid').sort({ name: 1 }).lean()
        : Promise.resolve([]),
    ]);

    const rows = [
      ...users.map((row) => {
        const fromPerms = this.resolvePermittedStationIds(row.stationPermissions);
        const assigned = Array.isArray(row.assignedStationIds)
          ? row.assignedStationIds.map(String).filter(Boolean)
          : [];
        const stationIds = [...new Set([...fromPerms, ...assigned])];
        return {
          id: String(row._id),
          name: String(row.name ?? '').trim() || 'User',
          employeeId: String(row.employeeId ?? row.userid ?? '').trim(),
          accountType: 'user' as const,
          stationIds,
        };
      }),
      ...admins.map((row) => ({
        id: String(row._id),
        name: String(row.name ?? '').trim() || 'Admin',
        employeeId: String(row.userid ?? '').trim(),
        accountType: 'admin' as const,
        stationIds: [] as string[],
      })),
    ];

    const filtered =
      scope === 'all'
        ? rows
        : rows.filter(
            (row) =>
              row.accountType === 'user' &&
              row.stationIds.some((stationId) => allowedIds?.has(stationId)),
          );

    return filtered
      .map((row) => ({
        ...row,
        stationIds:
          scope === 'all'
            ? row.stationIds
            : row.stationIds.filter((stationId) => allowedIds?.has(stationId)),
      }))
      .sort((a, b) => {
      const codeCmp = a.employeeId.localeCompare(b.employeeId, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      if (codeCmp !== 0) return codeCmp;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }

  /**
   * Station document ids the user actually has FRIS permission for — i.e. the
   * station appears in `stationPermissions` and grants at least one tab or
   * sub-page. Stations with an empty permission entry are excluded.
   */
  private resolvePermittedStationIds(
    stationPermissions?: Record<
      string,
      { accessTabs?: string[]; accessSubPages?: Record<string, string[]> }
    > | null,
  ): string[] {
    if (!stationPermissions || typeof stationPermissions !== 'object') return [];
    const permitted: string[] = [];
    for (const [stationId, perms] of Object.entries(stationPermissions)) {
      const id = String(stationId ?? '').trim();
      if (!id || !perms || typeof perms !== 'object') continue;
      const hasTab =
        Array.isArray(perms.accessTabs) && perms.accessTabs.length > 0;
      const hasSubPage =
        perms.accessSubPages != null &&
        typeof perms.accessSubPages === 'object' &&
        Object.values(perms.accessSubPages).some(
          (pages) => Array.isArray(pages) && pages.length > 0,
        );
      if (hasTab || hasSubPage) permitted.push(id);
    }
    return permitted;
  }

  async shootNotificationFromLog(
    logId: string,
    admin: { id: string; name: string },
  ) {
    if (!Types.ObjectId.isValid(logId)) {
      throw new Error('Invalid activity log id');
    }

    const log = await this.logModel.findById(logId);
    if (!log) {
      throw new Error('Activity log not found');
    }
    if (log.notificationSent) {
      return {
        alreadySent: true,
        recipientCount: 0,
        log: this.serializeLog(log),
      };
    }

    const recipients = await this.listAllNotificationRecipients();
    const notificationDate = ymdTodayLocal();
    const title = 'Admin notification';
    const message = `${log.userName} — ${log.action}`;
    const sourceLogId = String(log._id);

    for (const recipient of recipients) {
      await this.notificationModel.findOneAndUpdate(
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
            shotByAdminId: admin.id,
            shotByAdminName: admin.name,
          },
        },
        { upsert: true },
      );
    }

    log.notificationSent = true;
    await log.save();

    return {
      alreadySent: false,
      recipientCount: recipients.length,
      log: this.serializeLog(log),
    };
  }

  private async listAllNotificationRecipients(): Promise<
    Array<{ id: string; name: string }>
  > {
    const [users, admins] = await Promise.all([
      this.userModel
        .find({ accountStatus: { $ne: 'invited' } })
        .select('_id name')
        .lean(),
      this.adminModel.find({}).select('_id name').lean(),
    ]);

    const byId = new Map<string, { id: string; name: string }>();
    for (const row of users) {
      const id = String(row._id ?? '').trim();
      if (!id) continue;
      byId.set(id, { id, name: String(row.name ?? '').trim() || 'User' });
    }
    for (const row of admins) {
      const id = String(row._id ?? '').trim();
      if (!id) continue;
      byId.set(id, { id, name: String(row.name ?? '').trim() || 'Admin' });
    }
    return [...byId.values()];
  }

  private serializeLog(row: UserActionLogDocument | Record<string, unknown>) {
    const r = row as UserActionLogDocument & { _id: Types.ObjectId };
    return {
      id: String(r._id),
      userId: r.userId,
      userName: r.userName,
      userEmail: r.userEmail ?? '',
      accountType: r.accountType,
      action: r.action,
      method: r.method ?? '',
      path: r.path ?? '',
      actionDate: r.actionDate,
      createdAt: r.createdAt ?? null,
      notificationSent: Boolean(r.notificationSent),
      notificationId: r.notificationId ? String(r.notificationId) : null,
    };
  }

  private serializeNotification(row: Record<string, unknown>) {
    return {
      id: String(row._id ?? ''),
      userId: String(row.userId ?? ''),
      userName: String(row.userName ?? ''),
      title: String(row.title ?? ''),
      message: String(row.message ?? ''),
      notificationDate: String(row.notificationDate ?? ''),
      delivered: Boolean(row.delivered),
      deliveredAt: row.deliveredAt ?? null,
      readAt: row.readAt ?? null,
      sourceLogId: row.sourceLogId ? String(row.sourceLogId) : null,
      shotByAdminName: row.shotByAdminName ? String(row.shotByAdminName) : null,
      createdAt: row.createdAt ?? null,
    };
  }
}
