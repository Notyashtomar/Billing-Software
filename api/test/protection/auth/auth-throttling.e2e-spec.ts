import {
  createProtectionTestApp,
  destroyProtectionTestApp,
  type ProtectionTestContext,
} from '../../helpers/protection-test-app.factory';
import {
  protectionEnvForMode,
  STRICT_AUTH_LIMITS,
} from '../../fixtures/protection-env.defaults';
import { assertEnforcement429Body, assertLogEvent } from '../../helpers/protection-assertions';
import { ProtectionLogEvent } from '../../../src/protection/logging/protection-log-events';
import { withSharedOfficeIp } from '../../helpers/shared-ip.helper';

describe('Auth throttling (e2e)', () => {
  let ctx: ProtectionTestContext;

  afterEach(async () => {
    if (ctx) await destroyProtectionTestApp(ctx);
  });

  describe('enforcement mode', () => {
    beforeEach(async () => {
      ctx = await createProtectionTestApp(
        protectionEnvForMode('enforcement', STRICT_AUTH_LIMITS),
      );
    });

    const authRoutes = [
      { path: '/auth/login', body: { userid: 'u1', password: 'ok' } },
      { path: '/auth/admin-login', body: {} },
      { path: '/auth/forgot-password', body: { email: 'a@test.com' } },
      { path: '/auth/reset-password', body: { token: 't', newPassword: 'x' } },
    ];

    it.each(authRoutes)(
      'blocks $path after limit with 429 and retryAfter',
      async ({ path, body }) => {
        const statuses: number[] = [];
        for (let i = 0; i < 5; i += 1) {
          const res = await withSharedOfficeIp(ctx.agent.post(path)).send(body);
          statuses.push(res.status);
        }
        const blocked = statuses.filter((s) => s === 429);
        expect(blocked.length).toBeGreaterThan(0);
        const res429 = await withSharedOfficeIp(ctx.agent.post(path)).send(body);
        expect(res429.status).toBe(429);
        assertEnforcement429Body(res429.body);
        expect(res429.body.retryAfter).toBeGreaterThanOrEqual(1);
        assertLogEvent(ctx.logs.entries, ProtectionLogEvent.RATE_LIMIT_BLOCKED, [
          'route',
          'retryAfter',
        ]);
      },
    );

    it('successful login still works under limit', async () => {
      const res = await ctx.agent
        .post('/auth/login')
        .send({ userid: 'emp', password: 'secret' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  describe('monitor-only mode', () => {
    beforeEach(async () => {
      ctx = await createProtectionTestApp(
        protectionEnvForMode('monitor-only', STRICT_AUTH_LIMITS),
      );
    });

    it('does not block auth routes when limit exceeded', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 6; i += 1) {
        const res = await ctx.agent
          .post('/auth/login')
          .send({ userid: 'u', password: 'ok' });
        statuses.push(res.status);
      }
      expect(statuses.every((s) => s !== 429)).toBe(true);
      expect(
        ctx.logs.find(ProtectionLogEvent.THROTTLE_MONITOR_ONLY).length,
      ).toBeGreaterThan(0);
    });
  });
});
