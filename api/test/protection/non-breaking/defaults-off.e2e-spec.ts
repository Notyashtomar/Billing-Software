import {
  createProtectionTestApp,
  destroyProtectionTestApp,
} from '../../helpers/protection-test-app.factory';
import { PROTECTION_ENV_OFF } from '../../fixtures/protection-env.defaults';
import { buildTestPrincipal } from '../../fixtures/users.fixture';
import { withTestUser } from '../../helpers/shared-ip.helper';
import {
  DASHBOARD_POLLING_PROFILES,
  expandPollingRequests,
} from '../../helpers/polling-simulator';
import { assertNoUnexpected429 } from '../../helpers/protection-assertions';
import { PROTECTION_ROUTE_MANIFEST } from '../../fixtures/route-manifest';

describe('Non-breaking defaults (e2e)', () => {
  it('default env produces no 429 across representative routes', async () => {
    const ctx = await createProtectionTestApp(PROTECTION_ENV_OFF);
    const user = buildTestPrincipal('EMP1021');
    const statuses: number[] = [];

    const polling = expandPollingRequests(DASHBOARD_POLLING_PROFILES);
    for (const { path } of polling) {
      const res = await withTestUser(ctx.agent.get(path), user);
      statuses.push(res.status);
    }

    const authRes = await ctx.agent
      .post('/auth/login')
      .send({ userid: 'u', password: 'ok' });
    statuses.push(authRes.status);

    const reportRes = await withTestUser(
      ctx.agent.get('/reports/quality-scheduled-table'),
      user,
    );
    statuses.push(reportRes.status);

    const exportRes = await withTestUser(ctx.agent.get('/exports/report'), user);
    statuses.push(exportRes.status);

    assertNoUnexpected429(statuses);
    await destroyProtectionTestApp(ctx);
  });

  it('route manifest documents smoke coverage targets', () => {
    expect(PROTECTION_ROUTE_MANIFEST.auth.length).toBeGreaterThan(0);
    expect(PROTECTION_ROUTE_MANIFEST.dashboard.length).toBeGreaterThan(0);
    expect(PROTECTION_ROUTE_MANIFEST.imports.length).toBeGreaterThan(0);
  });
});
