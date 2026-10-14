import {
  createProtectionTestApp,
  destroyProtectionTestApp,
} from '../../helpers/protection-test-app.factory';
import { protectionEnvForMode, STRICT_AUTH_LIMITS } from '../../fixtures/protection-env.defaults';
import { assertEnforcement429Body, assertLogEvent } from '../../helpers/protection-assertions';
import { ProtectionLogEvent } from '../../../src/protection/logging/protection-log-events';

describe('Enforcement mode (e2e)', () => {
  it('returns structured 429 body with retryAfter', async () => {
    const ctx = await createProtectionTestApp(
      protectionEnvForMode('enforcement', STRICT_AUTH_LIMITS),
    );

    for (let i = 0; i < 4; i += 1) {
      await ctx.agent.post('/auth/login').send({ userid: 'a', password: 'ok' });
    }

    const res = await ctx.agent
      .post('/auth/login')
      .send({ userid: 'a', password: 'ok' });

    expect(res.status).toBe(429);
    assertEnforcement429Body(res.body);
    assertLogEvent(ctx.logs.entries, ProtectionLogEvent.RATE_LIMIT_BLOCKED, [
      'retryAfter',
      'category',
    ]);

    await destroyProtectionTestApp(ctx);
  });
});
