import {
  createProtectionTestApp,
  destroyProtectionTestApp,
} from '../../helpers/protection-test-app.factory';
import { protectionEnvForMode, FAST_TIMEOUT } from '../../fixtures/protection-env.defaults';
import { assertLogEvent } from '../../helpers/protection-assertions';
import { ProtectionLogEvent } from '../../../src/protection/logging/protection-log-events';

describe('Request timeout (e2e)', () => {
  it('times out slow routes and logs TIMEOUT', async () => {
    const ctx = await createProtectionTestApp(
      protectionEnvForMode('monitor-only', FAST_TIMEOUT),
    );

    const res = await ctx.agent.get('/smoke/slow');
    expect(res.status).toBe(408);
    assertLogEvent(ctx.logs.entries, ProtectionLogEvent.TIMEOUT, [
      'route',
      'requestId',
    ]);

    await destroyProtectionTestApp(ctx);
  });

  it('@SkipTimeout allows long handler to complete', async () => {
    const ctx = await createProtectionTestApp(
      protectionEnvForMode('monitor-only', FAST_TIMEOUT),
    );

    const res = await ctx.agent.get('/smoke/slow-skip');
    expect(res.status).toBe(200);
    expect(ctx.logs.find(ProtectionLogEvent.TIMEOUT).length).toBe(0);

    await destroyProtectionTestApp(ctx);
  });

  it('heavy report with SkipTimeout on export route completes', async () => {
    const ctx = await createProtectionTestApp(
      protectionEnvForMode('monitor-only', FAST_TIMEOUT),
    );

    const res = await ctx.agent.get('/exports/slow-report');
    expect(res.status).toBe(200);

    await destroyProtectionTestApp(ctx);
  });
});
