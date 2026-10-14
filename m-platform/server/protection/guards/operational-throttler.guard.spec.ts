import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OperationalThrottlerGuard } from './operational-throttler.guard';
import { ProtectionLoggerService } from '../logging/protection-logger.service';
import { InMemoryThrottleStore } from '../stores/in-memory-throttle.store';
import { RedisThrottleStore } from '../stores/redis-throttle.store';
import { readProtectionEnv } from '../config/protection-env';

function mockContext(path: string): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'GET',
        originalUrl: path,
        url: path,
        ip: '10.1.1.5',
        headers: {},
      }),
      getResponse: () => ({}),
    }),
  } as ExecutionContext;
}

describe('OperationalThrottlerGuard', () => {
  const protectionLogger = new ProtectionLoggerService();
  const memoryStore = new InMemoryThrottleStore();
  const redisStore = {
    isConnected: () => false,
    increment: memoryStore.increment.bind(memoryStore),
  } as unknown as RedisThrottleStore;

  it('allows all traffic when rate limiting is disabled', async () => {
    const env = { ...readProtectionEnv(), enableRateLimiting: false };
    const guard = new OperationalThrottlerGuard(
      new Reflector(),
      protectionLogger,
      memoryStore,
      redisStore,
      env,
    );
    await expect(
      guard.canActivate(mockContext('/reports/dashboard')),
    ).resolves.toBe(true);
  });

  it('logs monitor-only violations without blocking', async () => {
    const env = {
      ...readProtectionEnv(),
      enableRateLimiting: true,
      throttleMode: 'monitor-only' as const,
      throttleGlobalLimit: 1,
      throttleGlobalTtlMs: 60_000,
    };
    const guard = new OperationalThrottlerGuard(
      new Reflector(),
      protectionLogger,
      new InMemoryThrottleStore(),
      redisStore,
      env,
    );
    const ctx = mockContext('/reports/dashboard');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('returns 429 in enforcement mode when limit exceeded', async () => {
    const env = {
      ...readProtectionEnv(),
      enableRateLimiting: true,
      throttleMode: 'enforcement' as const,
      throttleGlobalLimit: 1,
      throttleReportsLimit: 1,
      throttleGlobalTtlMs: 60_000,
      throttleReportsTtlMs: 60_000,
    };
    const guard = new OperationalThrottlerGuard(
      new Reflector(),
      protectionLogger,
      new InMemoryThrottleStore(),
      redisStore,
      env,
    );
    const ctx = mockContext('/reports/dashboard');
    await guard.canActivate(ctx);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(HttpException);
  });
});
