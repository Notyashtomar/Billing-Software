/**
 * Optional live smoke against a running server (staging).
 * Run: RUN_LIVE_SMOKE=1 SMOKE_BASE_URL=http://localhost:8080 npm run test:smoke:live
 */
import request from 'supertest';

const runLive = process.env.RUN_LIVE_SMOKE === '1';
const baseUrl = process.env.SMOKE_BASE_URL;
const jwt = process.env.SMOKE_JWT;

(runLive && baseUrl ? describe : describe.skip)(
  'Live protection smoke',
  () => {
    it('health and session respond without 429 when protections disabled', async () => {
      const agent = request(baseUrl!);
      const health = await agent.get('/');
      expect(health.status).toBeLessThan(500);

      if (jwt) {
        const session = await agent
          .get('/auth/session')
          .set('Authorization', `Bearer ${jwt}`);
        expect(session.status).not.toBe(429);
      }
    });

    it('dashboard-summary does not return unexpected 429', async () => {
      if (!jwt) return;
      const agent = request(baseUrl!);
      const res = await agent
        .get('/dashboard-summary/latest')
        .set('Authorization', `Bearer ${jwt}`);
      expect(res.status).not.toBe(429);
    });
  },
);
