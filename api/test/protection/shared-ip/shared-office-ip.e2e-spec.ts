import {
  createProtectionTestApp,
  destroyProtectionTestApp,
} from '../../helpers/protection-test-app.factory';
import {
  protectionEnvForMode,
  STRICT_REPORT_LIMITS,
} from '../../fixtures/protection-env.defaults';
import {
  buildSharedOfficeUsers,
  buildTestPrincipal,
} from '../../fixtures/users.fixture';
import { withSharedOfficeUser } from '../../helpers/shared-ip.helper';
import { assertNoUnexpected429 } from '../../helpers/protection-assertions';
import {
  runWithConcurrency,
  withTransientHttpRetry,
} from '../../helpers/concurrency.helper';

describe('Shared office IP (e2e)', () => {
  it('does not globally block 50+ users on same NAT IP', async () => {
    const ctx = await createProtectionTestApp(
      protectionEnvForMode('enforcement', {
        ...STRICT_REPORT_LIMITS,
        THROTTLE_REPORTS_LIMIT: '20',
      }),
    );

    const users = buildSharedOfficeUsers(60);
    const statuses = await runWithConcurrency(
      users.map(
        (user) => () =>
          withTransientHttpRetry(() =>
            withSharedOfficeUser(
              ctx.agent.get('/reports/quality-scheduled-table'),
              user,
            ),
          ).then((res) => res.status),
      ),
      5,
    );

    assertNoUnexpected429(statuses);
    await destroyProtectionTestApp(ctx);
  });

  it('isolates abusive user without blocking colleagues on same IP', async () => {
    const ctx = await createProtectionTestApp(
      protectionEnvForMode('enforcement', {
        THROTTLE_REPORTS_LIMIT: '3',
        THROTTLE_REPORTS_TTL_MS: '60000',
      }),
    );

    const abuser = buildTestPrincipal('EMP9999');
    const colleague = buildTestPrincipal('EMP1001');

    for (let i = 0; i < 5; i += 1) {
      await withSharedOfficeUser(
        ctx.agent.get('/reports/quality-scheduled-table'),
        abuser,
      );
    }

    const colleagueRes = await withSharedOfficeUser(
      ctx.agent.get('/reports/quality-scheduled-table'),
      colleague,
    );
    expect(colleagueRes.status).toBe(200);

    const abuserRes = await withSharedOfficeUser(
      ctx.agent.get('/reports/quality-scheduled-table'),
      abuser,
    );
    expect(abuserRes.status).toBe(429);

    await destroyProtectionTestApp(ctx);
  });
});
