import {
  createProtectionTestApp,
  destroyProtectionTestApp,
} from '../../helpers/protection-test-app.factory';
import {
  protectionEnvForMode,
  STRICT_AUTH_LIMITS,
} from '../../fixtures/protection-env.defaults';
import {
  assertLogEvent,
  assertNoSensitiveData,
  ALL_PROTECTION_EVENTS,
} from '../../helpers/protection-assertions';
import { ProtectionLogEvent } from '../../../src/protection/logging/protection-log-events';
import { ConcurrencyLockService } from '../../../src/protection/services/concurrency-lock.service';
import { AuthAttemptTrackerService } from '../../../src/protection/services/auth-attempt-tracker.service';

describe('Structured protection logging (e2e)', () => {
  it('RATE_LIMIT_BLOCKED includes requestId, route, category, retryAfter', async () => {
    const ctx = await createProtectionTestApp(
      protectionEnvForMode('enforcement', STRICT_AUTH_LIMITS),
    );

    for (let i = 0; i < 5; i += 1) {
      await ctx.agent.post('/auth/login').send({ userid: 'l', password: 'ok' });
    }
    const res = await ctx.agent
      .post('/auth/login')
      .send({ userid: 'l', password: 'ok' });
    expect(res.headers['x-request-id']).toBeDefined();

    const log = assertLogEvent(
      ctx.logs.entries,
      ProtectionLogEvent.RATE_LIMIT_BLOCKED,
      ['route', 'category', 'retryAfter', 'requestId'],
    );
    expect(log.fields.requestId).toBeDefined();
    assertNoSensitiveData(log.raw);

    await destroyProtectionTestApp(ctx);
  });

  it('documents all protection event constants', () => {
    expect(ALL_PROTECTION_EVENTS).toContain(
      ProtectionLogEvent.AUTH_SUSPICIOUS_ACTIVITY,
    );
    expect(ALL_PROTECTION_EVENTS).toContain(ProtectionLogEvent.REQUEST_REJECTED);
  });

  it('AUTH_SUSPICIOUS_ACTIVITY via tracker when security logging enabled', async () => {
    const ctx = await createProtectionTestApp({
      ...protectionEnvForMode('monitor-only'),
      ENABLE_SECURITY_LOGGING: 'true',
      AUTH_FAILED_ATTEMPTS_THRESHOLD: '3',
    });

    const tracker = ctx.app.get(AuthAttemptTrackerService);
    for (let i = 0; i < 3; i += 1) {
      tracker.recordFailedLogin('admin', '1.2.3.4', 'req-test-1');
    }

    assertLogEvent(
      ctx.logs.entries,
      ProtectionLogEvent.AUTH_SUSPICIOUS_ACTIVITY,
      ['userId', 'attempts', 'ip'],
    );

    await destroyProtectionTestApp(ctx);
  });

  it('CONCURRENCY_BLOCKED metadata shape', async () => {
    const ctx = await createProtectionTestApp(protectionEnvForMode('enforcement'));
    const lock = ctx.app.get(ConcurrencyLockService);
    lock.tryAcquire('bulk-import', 'EMP1', {
      enabled: true,
      maxConcurrent: 1,
      mode: 'enforcement',
      route: '/import/maa-march',
      requestId: 'req-c1',
    });
    try {
      lock.tryAcquire('bulk-import', 'EMP2', {
        enabled: true,
        maxConcurrent: 1,
        mode: 'enforcement',
      });
    } catch {
      /* expected */
    }
    assertLogEvent(ctx.logs.entries, ProtectionLogEvent.CONCURRENCY_BLOCKED, [
      'operation',
      'blockedUser',
    ]);
    await destroyProtectionTestApp(ctx);
  });
});
