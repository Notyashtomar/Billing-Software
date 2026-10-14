import {
  createProtectionTestApp,
  destroyProtectionTestApp,
} from '../../helpers/protection-test-app.factory';
import { protectionEnvForMode } from '../../fixtures/protection-env.defaults';
import { buildTestPrincipal } from '../../fixtures/users.fixture';
import { withTestUser } from '../../helpers/shared-ip.helper';
import { assertNoUnexpected429 } from '../../helpers/protection-assertions';

describe('Report load (e2e)', () => {
  it('serves analytics endpoints under generous report limits', async () => {
    const ctx = await createProtectionTestApp(
      protectionEnvForMode('enforcement', {
        THROTTLE_REPORTS_LIMIT: '50',
      }),
    );

    const user = buildTestPrincipal('EMP2201');
    const paths = [
      '/reports/quality-scheduled-table',
      '/reports/delay-report-summary',
      '/reports/heavy-analytics',
    ];

    const statuses: number[] = [];
    for (const path of paths) {
      for (let i = 0; i < 10; i += 1) {
        const res = await withTestUser(ctx.agent.get(path), user);
        statuses.push(res.status);
      }
    }

    assertNoUnexpected429(statuses);
    await destroyProtectionTestApp(ctx);
  });
});
