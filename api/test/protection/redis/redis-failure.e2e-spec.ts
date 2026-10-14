import { ProtectionLoggerService } from '../../../src/protection/logging/protection-logger.service';
import { RedisThrottleStore } from '../../../src/protection/stores/redis-throttle.store';
import { CapturingProtectionLogger } from '../../helpers/protection-log-capture';
import { ProtectionLogEvent } from '../../../src/protection/logging/protection-log-events';
import { assertLogEvent } from '../../helpers/protection-assertions';
import {
  createProtectionTestApp,
  destroyProtectionTestApp,
} from '../../helpers/protection-test-app.factory';
import { protectionEnvForMode } from '../../fixtures/protection-env.defaults';

describe('Redis failure simulation (e2e)', () => {
  it('logs REDIS_THROTTLE_FAILURE and falls back to in-memory on connect failure', async () => {
    const capture = new CapturingProtectionLogger();
    const store = new RedisThrottleStore(capture as unknown as ProtectionLoggerService);

    const ok = await store.connect('redis://127.0.0.1:63999');
    expect(ok).toBe(false);

    const result = await store.increment('test-key', 60_000);
    expect(result.totalHits).toBe(1);

    assertLogEvent(capture.entries, ProtectionLogEvent.FALLBACK_MODE, ['mode']);
  });

  it('app continues serving requests when Redis throttling enabled but unreachable', async () => {
    const ctx = await createProtectionTestApp(
      protectionEnvForMode('enforcement', {
        ENABLE_REDIS_THROTTLING: 'true',
        REDIS_URL: 'redis://127.0.0.1:63999',
        THROTTLE_AUTH_LIMIT: '100',
      }),
    );

    const res = await ctx.agent
      .post('/auth/login')
      .send({ userid: 'u', password: 'ok' });
    expect(res.status).toBe(201);

    await destroyProtectionTestApp(ctx);
  });
});
