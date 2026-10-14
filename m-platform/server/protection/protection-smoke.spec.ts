/**
 * Non-breaking smoke checks: protections default OFF so operational workflows stay unchanged.
 */
import { readProtectionEnv } from './config/protection-env';
import { OperationalThrottlerGuard } from './guards/operational-throttler.guard';
import { Reflector } from '@nestjs/core';
import { ProtectionLoggerService } from './logging/protection-logger.service';
import { InMemoryThrottleStore } from './stores/in-memory-throttle.store';
import { RedisThrottleStore } from './stores/redis-throttle.store';
import { ExecutionContext } from '@nestjs/common';

describe('Protection smoke (non-breaking defaults)', () => {
  it('keeps rate limiting disabled by default (no unexpected 429)', async () => {
    const env = readProtectionEnv();
    expect(env.enableRateLimiting).toBe(false);

    const guard = new OperationalThrottlerGuard(
      new Reflector(),
      new ProtectionLoggerService(),
      new InMemoryThrottleStore(),
      { isConnected: () => false } as RedisThrottleStore,
      env,
    );

    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          originalUrl: '/dashboard-summary/bundles',
          url: '/dashboard-summary/bundles',
          headers: {},
          ip: '127.0.0.1',
          user: { userid: 'EMP1021', role: 'employee' },
        }),
      }),
    } as ExecutionContext;

    for (let i = 0; i < 50; i += 1) {
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    }
  });

  it('keeps request timeouts disabled by default', () => {
    expect(readProtectionEnv().enableRequestTimeouts).toBe(false);
  });

  it('keeps import concurrency disabled by default', () => {
    expect(readProtectionEnv().enableImportConcurrencyControl).toBe(false);
  });
});
