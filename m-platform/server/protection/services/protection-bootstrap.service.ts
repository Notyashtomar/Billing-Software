import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  PROTECTION_ENV,
  readProtectionEnv,
  type ProtectionEnv,
} from '../config/protection-env';
import { ProtectionLogEvent } from '../logging/protection-log-events';
import { ProtectionLoggerService } from '../logging/protection-logger.service';
import { RedisThrottleStore } from '../stores/redis-throttle.store';

@Injectable()
export class ProtectionBootstrapService
  implements OnModuleInit, OnModuleDestroy
{
  constructor(
    private readonly protectionLogger: ProtectionLoggerService,
    private readonly redisStore: RedisThrottleStore,
    @Inject(PROTECTION_ENV) private readonly env: ProtectionEnv,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.env.enableRateLimiting) {
      this.protectionLogger.logStartup(ProtectionLogEvent.RATE_LIMITING_ENABLED, {
        throttleMode: this.env.throttleMode,
        globalLimit: this.env.throttleGlobalLimit,
        globalTtlMs: this.env.throttleGlobalTtlMs,
      });
      this.protectionLogger.logStartup(ProtectionLogEvent.THROTTLE_MODE, {
        mode: this.env.throttleMode,
      });
    }

    if (this.env.enableRequestTimeouts) {
      this.protectionLogger.logStartup(
        ProtectionLogEvent.TIMEOUT_PROTECTION_ENABLED,
        { timeoutMs: this.env.requestTimeoutMs },
      );
    }

    if (this.env.enableRedisThrottling && this.env.redisUrl) {
      const ok = await this.redisStore.connect(this.env.redisUrl);
      if (!ok) {
        this.protectionLogger.logEvent(ProtectionLogEvent.RATE_LIMITING_DEGRADED, {
          reason: 'redis-connect-failed',
        });
      }
    } else if (this.env.enableRedisThrottling && !this.env.redisUrl) {
      this.protectionLogger.logEvent(ProtectionLogEvent.FALLBACK_MODE, {
        mode: 'local-memory-throttling',
        reason: 'redis-url-missing',
      });
    }
  }

  onModuleDestroy(): void {
    if (this.env.enableRedisThrottling) {
      this.protectionLogger.logEvent(ProtectionLogEvent.REDIS_DISCONNECTED, {
        reason: 'shutdown',
      });
    }
  }
}

export function protectionEnvFactory(): ProtectionEnv {
  return readProtectionEnv();
}
