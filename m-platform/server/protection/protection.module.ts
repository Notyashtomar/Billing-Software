import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { MulterLimitLoggingFilter } from './filters/multer-limit-logging.filter';
import { PROTECTION_ENV } from './config/protection-env';
import { protectionEnvFactory } from './services/protection-bootstrap.service';
import { OperationalThrottlerGuard } from './guards/operational-throttler.guard';
import { RequestTimeoutInterceptor } from './interceptors/request-timeout.interceptor';
import { ProtectionLoggerService } from './logging/protection-logger.service';
import { AuthAttemptTrackerService } from './services/auth-attempt-tracker.service';
import { ConcurrencyLockService } from './services/concurrency-lock.service';
import { ProtectionBootstrapService } from './services/protection-bootstrap.service';
import { InMemoryThrottleStore } from './stores/in-memory-throttle.store';
import { RedisThrottleStore } from './stores/redis-throttle.store';

@Global()
@Module({
  providers: [
    {
      provide: PROTECTION_ENV,
      useFactory: protectionEnvFactory,
    },
    ProtectionLoggerService,
    ProtectionBootstrapService,
    InMemoryThrottleStore,
    RedisThrottleStore,
    AuthAttemptTrackerService,
    ConcurrencyLockService,
    {
      provide: APP_GUARD,
      useClass: OperationalThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestTimeoutInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: MulterLimitLoggingFilter,
    },
  ],
  exports: [
    PROTECTION_ENV,
    ProtectionLoggerService,
    AuthAttemptTrackerService,
    ConcurrencyLockService,
    InMemoryThrottleStore,
    RedisThrottleStore,
  ],
})
export class ProtectionModule {}
