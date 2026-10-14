import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Admin, AdminDocument } from '../../admin/schema/admin.schema';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';
import { User, UserDocument } from '../../user/schema/user.schema';
import { stationPermissionsHaveAccess } from '../../user/utils/station-permissions.util';
import {
  isAdminPanelCrossStationAccess,
  type AdminPanelStationScope,
} from './admin-panel-station-scope';

@Injectable()
export class AdminPanelStationScopeService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Admin.name)
    private readonly adminModel: Model<AdminDocument>,
  ) {}

  /**
   * Station registry ids the principal may access in the admin panel.
   * Global / superadmin directory accounts: all stations. Everyone else:
   * union of admin `stationId` and the linked panel user's
   * `assignedStationIds` / `stationPermissions`.
   */
  async resolve(
    principal: AuthenticatedPrincipal | null | undefined,
  ): Promise<AdminPanelStationScope> {
    if (!principal) return [];

    const admin =
      principal.accountType === 'admin'
        ? await this.adminModel
            .findById(principal.userId)
            .select('stationId role isGlobalAdmin userid')
            .lean()
            .exec()
        : null;

    const userDoc = await this.userModel
      .findOne(
        principal.accountType === 'user'
          ? { _id: principal.userId }
          : { userid: principal.userid },
      )
      .select(
        'assignedStationIds stationPermissions authorizationRole isGlobalAdmin userid',
      )
      .lean()
      .exec();

    if (isAdminPanelCrossStationAccess({ principal, admin, user: userDoc })) {
      return 'all';
    }

    const stationIds = new Set<string>();

    if (principal.accountType === 'admin') {
      const fromPrincipal = String(principal.stationId ?? '').trim();
      if (fromPrincipal) stationIds.add(fromPrincipal);

      const fromAdminDoc = String(admin?.stationId ?? '').trim();
      if (fromAdminDoc) stationIds.add(fromAdminDoc);
    }

    if (principal.accountType === 'user') {
      const sessionStationId = String(principal.stationId ?? '').trim();
      if (sessionStationId) stationIds.add(sessionStationId);
    }

    if (userDoc) {
      for (const id of userDoc.assignedStationIds ?? []) {
        const normalized = String(id).trim();
        if (normalized) stationIds.add(normalized);
      }

      const permsMap = userDoc.stationPermissions ?? {};
      for (const stationId of Object.keys(permsMap)) {
        const id = String(stationId).trim();
        if (!id) continue;
        if (stationPermissionsHaveAccess(permsMap, id)) stationIds.add(id);
      }
    }

    if (stationIds.size === 0) return [];
    return [...stationIds];
  }
}
