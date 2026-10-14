import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BillingAuditLog,
  BillingAuditLogDocument,
} from '../schemas/billing.schemas';
import type { StationScopeContext } from '../common/station-scope';
import { StationScope } from '../common/station-scope';
import type { BillingSessionOptions } from '../common/billing-transaction';
import {
  USER_ACTIVITY_LOG_EVENT,
  type UserActivityLogEventPayload,
} from 'src/user-activity-notifications/events/user-activity.events';
import type { BillingActor } from '../services/billing-customers.service';

export interface AuditLogInput {
  entityType: string;
  entityId: Types.ObjectId | string;
  action: string;
  userId: string;
  userName: string;
  stationCode: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  actor?: BillingActor;
}

/**
 * Billing `audit_log` persistence is disabled (collection bloat).
 * Call sites stay intact; `log` / `logBulk` are no-ops.
 * Explicit `emitActivity` still forwards to Admin User Activity when callers use it.
 */
@Injectable()
export class AuditEngineService {
  constructor(
    @InjectModel(BillingAuditLog.name)
    private readonly auditModel: Model<BillingAuditLogDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async log(
    _input: AuditLogInput,
    _options?: BillingSessionOptions,
  ): Promise<void> {
    // Intentionally no Mongo write / no auto activity bridge.
  }

  async logBulk(
    _inputs: AuditLogInput[],
    _options?: BillingSessionOptions,
  ): Promise<void> {
    // Intentionally no Mongo write / no auto activity bridge.
  }

  emitActivity(payload: UserActivityLogEventPayload): void {
    this.eventEmitter.emit(USER_ACTIVITY_LOG_EVENT, payload);
  }

  async listForEntity(
    ctx: StationScopeContext,
    entityType: string,
    entityId: string,
    limit = 50,
  ) {
    const filter = StationScope.filter(
      { entityType, entityId: new Types.ObjectId(entityId) },
      ctx,
    );
    return this.auditModel
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  async listRecent(ctx: StationScopeContext, limit = 20) {
    const filter = StationScope.filter({}, ctx);
    return this.auditModel
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean()
      .exec();
  }
}

/** Re-export for callers that type session options explicitly. */
export type { ClientSession };
