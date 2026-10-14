import {
  createProtectionTestApp,
  destroyProtectionTestApp,
} from '../../helpers/protection-test-app.factory';
import { protectionEnvForMode, STRICT_AUTH_LIMITS } from '../../fixtures/protection-env.defaults';
import { assertLogEvent } from '../../helpers/protection-assertions';
import { ProtectionLogEvent } from '../../../src/protection/logging/protection-log-events';

describe('Monitor-only mode (e2e)', () => {
  it('never returns 429 and logs THROTTLE_MONITOR_ONLY', async () => {
    const ctx = await createProtectionTestApp(
      protectionEnvForMode('monitor-only', STRICT_AUTH_LIMITS),
    );

    const statuses: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const res = await ctx.agent
        .post('/auth/login')
        .send({ userid: 'x', password: 'ok' });
      statuses.push(res.status);
    }

    expect(statuses.every((s) => s !== 429)).toBe(true);
    const log = assertLogEvent(
      ctx.logs.entries,
      ProtectionLogEvent.THROTTLE_MONITOR_ONLY,
      ['wouldBlock', 'route'],
    );
    expect(log.fields.wouldBlock).toBe(true);

    await destroyProtectionTestApp(ctx);
  });
});
