import {
  createProtectionTestApp,
  destroyProtectionTestApp,
} from '../../helpers/protection-test-app.factory';
import { protectionEnvForMode } from '../../fixtures/protection-env.defaults';
import { buildTestPrincipal } from '../../fixtures/users.fixture';
import { withSharedOfficeUser } from '../../helpers/shared-ip.helper';
import {
  DASHBOARD_POLLING_PROFILES,
  expandPollingRequests,
} from '../../helpers/polling-simulator';
import { assertNoUnexpected429 } from '../../helpers/protection-assertions';

describe('Dashboard polling (e2e)', () => {
  it('survives realistic multi-tab polling bursts without false 429s', async () => {
    const ctx = await createProtectionTestApp(
      protectionEnvForMode('enforcement', {
        THROTTLE_REPORTS_LIMIT: '180',
        THROTTLE_GLOBAL_LIMIT: '600',
      }),
    );

    const user = buildTestPrincipal('EMP1021');
    const requests = expandPollingRequests(DASHBOARD_POLLING_PROFILES);
    const statuses: number[] = [];

    for (const { path } of requests) {
      const res = await withSharedOfficeUser(ctx.agent.get(path), user);
      statuses.push(res.status);
      expect(res.headers['x-request-id']).toBeDefined();
    }

    assertNoUnexpected429(statuses);
    await destroyProtectionTestApp(ctx);
  });
});
