import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ADMIN_ROLES } from '../../auth/enums/roles.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';
import {
  assertAdminPanelStationAccess,
} from '../../common/station/admin-panel-station-scope';
import { AdminPanelStationScopeService } from '../../common/station/admin-panel-station-scope.service';
import { AdminStationsService } from '../../admin-stations/services/admin-stations.service';
import { UserActionLogService } from '../services/user-action-log.service';

@Roles(...ADMIN_ROLES)
@Controller('admins')
export class AdminUserActivityController {
  constructor(
    private readonly userActionLogService: UserActionLogService,
    private readonly adminPanelStationScope: AdminPanelStationScopeService,
    private readonly adminStationsService: AdminStationsService,
  ) {}

  @Get('user-action-logs/filter-users')
  listActivityFilterUsers(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.userActionLogService.listFilterUsers(user);
  }

  /** Staff login counts at a station (heatmap drill-down). */
  @Get('user-action-logs/station-login-stats')
  async stationLoginStats(
    @Query('stationId') stationId?: string,
    @Query('stationCode') stationCode?: string,
    @Query('stationName') stationName?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @CurrentUser() user?: AuthenticatedPrincipal,
  ) {
    const scope = await this.adminPanelStationScope.resolve(user);
    const codeQ = String(stationCode ?? '').trim();
    const nameQ = String(stationName ?? '').trim();
    let effectiveStationId = String(stationId ?? '').trim();

    // Heatmap may send code/name only, or a non-ObjectId label as stationId.
    if (!effectiveStationId || !isValidObjectId(effectiveStationId)) {
      const ref = await this.adminStationsService.resolveStationRef(
        effectiveStationId || codeQ || nameQ,
      );
      if (ref?.id && isValidObjectId(ref.id)) {
        effectiveStationId = ref.id;
      } else if (!isValidObjectId(effectiveStationId)) {
        effectiveStationId = '';
      }
    }

    if (scope !== 'all') {
      if (!scope.length) {
        return {
          stationId: effectiveStationId,
          stationLabel: codeQ || nameQ || 'Station',
          fromDate: fromDate ?? '',
          toDate: toDate ?? '',
          todayDate: '',
          totalLogins: 0,
          uniqueStaff: 0,
          todayTotalLogins: 0,
          todayUniqueStaff: 0,
          liveCount: 0,
          rows: [],
          todayRows: [],
          liveRows: [],
        };
      }

      if (effectiveStationId && scope.includes(effectiveStationId)) {
        assertAdminPanelStationAccess(scope, effectiveStationId);
      } else {
        // Resolve clicked station within this admin's allowed stations.
        let matched: string | undefined;
        const needle = codeQ || nameQ;
        if (needle) {
          for (const id of scope) {
            const code = await this.adminStationsService.resolveStationCodeById(id);
            if (
              code &&
              (code.toUpperCase() === needle.toUpperCase() ||
                needle.toUpperCase().startsWith(`${code.toUpperCase()}-`))
            ) {
              matched = id;
              break;
            }
          }
          if (!matched) {
            const ref = await this.adminStationsService.resolveStationRef(needle);
            if (ref?.id && scope.includes(ref.id)) matched = ref.id;
          }
        }
        effectiveStationId = matched || (scope.length === 1 ? scope[0]! : '');
        if (!effectiveStationId) {
          throw new BadRequestException(
            'Could not resolve station for this admin account. Pick a station you have access to.',
          );
        }
        assertAdminPanelStationAccess(scope, effectiveStationId);
      }
    }

    if (!effectiveStationId && !codeQ && !nameQ) {
      throw new BadRequestException('stationId, stationCode, or stationName is required');
    }

    return this.userActionLogService.aggregateStationLoginStats({
      stationId: effectiveStationId || undefined,
      stationCode: codeQ || undefined,
      stationName: nameQ || undefined,
      fromDate,
      toDate,
    });
  }

  @Get('user-action-logs')
  async listUserActionLogs(
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('limit') limit?: string,
    @Query('userId') userId?: string,
    @Query('stationId') stationId?: string,
    @CurrentUser() user?: AuthenticatedPrincipal,
  ) {
    const scope = await this.adminPanelStationScope.resolve(user);
    let effectiveStationId = String(stationId ?? '').trim() || undefined;

    if (scope !== 'all') {
      if (!scope.length) {
        return [];
      }
      if (effectiveStationId) {
        assertAdminPanelStationAccess(scope, effectiveStationId);
      } else {
        effectiveStationId = scope[0];
      }
    }

    return this.userActionLogService.listForAdmin({
      fromDate,
      toDate,
      limit: limit ? Number(limit) : undefined,
      userId,
      stationId: effectiveStationId,
    });
  }

  @Post('notifications/shoot/:logId')
  async shootNotification(
    @Param('logId') logId: string,
    @CurrentUser() admin: AuthenticatedPrincipal,
  ) {
    const adminId = String(admin?.userId ?? '').trim();
    const adminName = String(admin?.name ?? admin?.userid ?? 'Admin').trim();
    if (!adminId) {
      throw new BadRequestException('Admin session required');
    }

    try {
      return await this.userActionLogService.shootNotificationFromLog(logId, {
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
