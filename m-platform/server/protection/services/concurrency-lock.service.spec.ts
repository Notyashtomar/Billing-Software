import { ConflictException } from '@nestjs/common';
import { ConcurrencyLockService } from './concurrency-lock.service';
import { ProtectionLoggerService } from '../logging/protection-logger.service';
import { readProtectionEnv } from '../config/protection-env';

describe('ConcurrencyLockService', () => {
  const env = readProtectionEnv();
  const svc = new ConcurrencyLockService(new ProtectionLoggerService(), env);

  afterEach(() => {
    svc.release('bulk-import', 'EMP1010');
    svc.release('bulk-import', 'EMP1020');
  });

  it('does not block when import control is disabled via caller options', () => {
    const first = svc.tryAcquire('bulk-import', 'EMP1010', {
      enabled: false,
      maxConcurrent: 1,
      mode: 'enforcement',
    });
    const second = svc.tryAcquire('bulk-import', 'EMP1020', {
      enabled: false,
      maxConcurrent: 1,
      mode: 'enforcement',
    });
    expect(first.acquired).toBe(true);
    expect(second.acquired).toBe(true);
  });

  it('allows parallel jobs in monitor-only when over capacity', () => {
    svc.tryAcquire('bulk-import', 'EMP1010', {
      enabled: true,
      maxConcurrent: 1,
      mode: 'monitor-only',
    });
    const second = svc.tryAcquire('bulk-import', 'EMP1020', {
      enabled: true,
      maxConcurrent: 1,
      mode: 'monitor-only',
    });
    expect(second.acquired).toBe(true);
  });

  it('throws in enforcement when saturated', () => {
    svc.tryAcquire('bulk-import', 'EMP1010', {
      enabled: true,
      maxConcurrent: 1,
      mode: 'enforcement',
    });
    expect(() =>
      svc.tryAcquire('bulk-import', 'EMP1020', {
        enabled: true,
        maxConcurrent: 1,
        mode: 'enforcement',
      }),
    ).toThrow(ConflictException);
  });
});
