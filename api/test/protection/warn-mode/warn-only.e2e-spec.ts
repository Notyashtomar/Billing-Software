import {
  createProtectionTestApp,
  destroyProtectionTestApp,
} from '../../helpers/protection-test-app.factory';
import { protectionEnvForMode, STRICT_AUTH_LIMITS } from '../../fixtures/protection-env.defaults';
import { assertLogEvent } from '../../helpers/protection-assertions';
import { ProtectionLogEvent } from '../../../src/protection/logging/protection-log-events';

describe('Warn-only mode (e2e)', () => {
  it('continues serving traffic and emits THROTTLE_WARN_ONLY', async () => {
    const ctx = await createProtectionTestApp(
      protectionEnvForMode('warn-only', STRICT_AUTH_LIMITS),
    );

    for (let i = 0; i < 8; i += 1) {
      await ctx.agent.post('/auth/login').send({ userid: 'x', password: 'ok' });
    }

    const res = await ctx.agent
      .post('/auth/login')
      .send({ userid: 'x', password: 'ok' });
    expect(res.status).not.toBe(429);

    assertLogEvent(ctx.logs.entries, ProtectionLogEvent.THROTTLE_WARN_ONLY, [
      'wouldBlock',
    ]);

    await destroyProtectionTestApp(ctx);
  });
});
