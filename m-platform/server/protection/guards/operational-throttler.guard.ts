import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  PROTECTION_ENV,
  type ProtectionEnv,
} from '../config/protection-env';
import { SKIP_PROTECTION_KEY } from '../decorators/skip-protection.decorator';
import {
  THROTTLE_CATEGORY_KEY,
  type ThrottleCategory,
} from '../decorators/throttle-category.decorator';
import { ProtectionLogEvent } from '../logging/protection-log-events';
import { ProtectionLoggerService } from '../logging/protection-logger.service';
import { InMemoryThrottleStore } from '../stores/in-memory-throttle.store';
import { RedisThrottleStore } from '../stores/redis-throttle.store';
import {
  getClientIp,
  getOrCreateRequestId,
  getPrincipalFromRequest,
  getRouteLabel,
} from '../utils/request-context.util';

@Injectable()
export class OperationalThrottlerGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly protectionLogger: ProtectionLoggerService,
    private readonly memoryStore: InMemoryThrottleStore,
    private readonly redisStore: RedisThrottleStore,
    @Inject(PROTECTION_ENV) private readonly env: ProtectionEnv,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.env.enableRateLimiting) {
      return true;
    }

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_PROTECTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const route = getRouteLabel(req);
    const category = this.resolveCategory(context, route);
    const { limit, ttlMs } = this.limitsForCategory(category);
    const tracker = this.buildTracker(req);
    const key = `${category}:${tracker}`;
    const store =
      this.env.enableRedisThrottling && this.redisStore.isConnected()
        ? this.redisStore
        : this.memoryStore;

    const { totalHits, ttlMs: retryAfterMs } = await store.increment(key, ttlMs);
    if (totalHits <= limit) {
      return true;
    }

    const principal = getPrincipalFromRequest(req);
    const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
    const fields = {
      route,
      category,
      userId: principal?.userid,
      role: principal?.role,
      ip: getClientIp(req),
      requestId: getOrCreateRequestId(req),
      retryAfter: retryAfterSec,
      timestamp: new Date().toISOString(),
      securityIssue: category === 'AUTH',
    };

    if (this.env.throttleMode === 'monitor-only') {
      this.protectionLogger.logEvent(ProtectionLogEvent.THROTTLE_MONITOR_ONLY, {
        ...fields,
        wouldBlock: true,
      });
      return true;
    }

    if (this.env.throttleMode === 'warn-only') {
      this.protectionLogger.logEvent(ProtectionLogEvent.THROTTLE_WARN_ONLY, {
        ...fields,
        wouldBlock: true,
      });
      return true;
    }

    this.protectionLogger.logEvent(ProtectionLogEvent.RATE_LIMIT_BLOCKED, fields);
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests. Please retry later.',
        retryAfter: retryAfterSec,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private resolveCategory(
    context: ExecutionContext,
    route: string,
  ): ThrottleCategory {
    const explicit = this.reflector.getAllAndOverride<ThrottleCategory>(
      THROTTLE_CATEGORY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (explicit) return explicit;

    const path = route.toLowerCase();
    if (path.includes('/auth/')) return 'AUTH';
    if (path.includes('/reports/') || path.includes('/dashboard')) {
      return 'REPORTS';
    }
    if (path.includes('export')) return 'EXPORT';
    return 'GLOBAL';
  }

  private limitsForCategory(category: ThrottleCategory): {
    limit: number;
    ttlMs: number;
  } {
    switch (category) {
      case 'AUTH':
        return {
          limit: this.env.throttleAuthLimit,
          ttlMs: this.env.throttleAuthTtlMs,
        };
      case 'REPORTS':
        return {
          limit: this.env.throttleReportsLimit,
          ttlMs: this.env.throttleReportsTtlMs,
        };
      case 'EXPORT':
        return {
          limit: Math.max(30, Math.floor(this.env.throttleReportsLimit / 2)),
          ttlMs: this.env.throttleReportsTtlMs,
        };
      default:
        return {
          limit: this.env.throttleGlobalLimit,
          ttlMs: this.env.throttleGlobalTtlMs,
        };
    }
  }

  private buildTracker(req: Request): string {
    const principal = getPrincipalFromRequest(req);
    if (principal?.userid) {
      return `user:${principal.userid}`;
    }
    return `ip:${getClientIp(req)}`;
  }
}
