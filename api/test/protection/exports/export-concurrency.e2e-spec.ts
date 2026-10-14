import {
  createProtectionTestApp,
  destroyProtectionTestApp,
} from '../../helpers/protection-test-app.factory';
import { protectionEnvForMode } from '../../fixtures/protection-env.defaults';
import { buildTestPrincipal } from '../../fixtures/users.fixture';
import { withTestUser } from '../../helpers/shared-ip.helper';

describe('Export operations (e2e)', () => {
  it('export succeeds for authenticated user', async () => {
    const ctx = await createProtectionTestApp(protectionEnvForMode('monitor-only'));
    const res = await withTestUser(
      ctx.agent.get('/exports/report'),
      buildTestPrincipal('EMP3001'),
    );
    expect(res.status).toBe(200);
    expect(res.body.exportId).toBeDefined();
    await destroyProtectionTestApp(ctx);
  });

  it('slow export with SkipTimeout completes under global timeout flag', async () => {
    const ctx = await createProtectionTestApp(
      protectionEnvForMode('monitor-only', {
        ENABLE_REQUEST_TIMEOUTS: 'true',
        REQUEST_TIMEOUT_MS: '100',
      }),
    );

    const res = await ctx.agent.get('/exports/slow-report');
    expect(res.status).toBe(200);
    await destroyProtectionTestApp(ctx);
  });
});
