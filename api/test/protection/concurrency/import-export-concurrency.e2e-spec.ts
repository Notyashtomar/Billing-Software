import {
  createProtectionTestApp,
  destroyProtectionTestApp,
} from '../../helpers/protection-test-app.factory';
import { protectionEnvForMode } from '../../fixtures/protection-env.defaults';
import { buildTestPrincipal } from '../../fixtures/users.fixture';
import { withTestUser } from '../../helpers/shared-ip.helper';
import { assertLogEvent } from '../../helpers/protection-assertions';
import { ProtectionLogEvent } from '../../../src/protection/logging/protection-log-events';
import { runWithConcurrency } from '../../helpers/concurrency.helper';

describe('Import/export concurrency (e2e)', () => {
  it('blocks second import in enforcement when slot taken', async () => {
    const ctx = await createProtectionTestApp(
      protectionEnvForMode('enforcement', {
        ENABLE_IMPORT_CONCURRENCY_CONTROL: 'true',
        MAX_IMPORT_CONCURRENT: '1',
      }),
    );

    const userA = buildTestPrincipal('EMP1010');
    const userB = buildTestPrincipal('EMP1020');
    const file = Buffer.from('smoke');

    const [resA, resB] = await Promise.all([
      withTestUser(ctx.agent.post('/import/maa-march'), userA).attach(
        'file',
        file,
        'test.xlsx',
      ),
      withTestUser(ctx.agent.post('/import/maa-march'), userB).attach(
        'file',
        file,
        'test2.xlsx',
      ),
    ]);
    const statuses = [resA.status, resB.status];
    expect(statuses).toContain(201);
    expect(statuses).toContain(409);
    assertLogEvent(ctx.logs.entries, ProtectionLogEvent.CONCURRENCY_BLOCKED, [
      'operation',
      'blockedUser',
    ]);

    await destroyProtectionTestApp(ctx);
  });

  it('allows parallel imports in monitor-only with logs only', async () => {
    const ctx = await createProtectionTestApp(
      protectionEnvForMode('monitor-only', {
        ENABLE_IMPORT_CONCURRENCY_CONTROL: 'true',
        MAX_IMPORT_CONCURRENT: '1',
      }),
    );

    const file = Buffer.from('x');
    const tasks = [
      buildTestPrincipal('EMP2001'),
      buildTestPrincipal('EMP2002'),
    ].map(
      (user) => () =>
        withTestUser(ctx.agent.post('/import/maa-march'), user)
          .attach('file', file, 'a.xlsx')
          .then((r) => r.status),
    );

    const statuses = await runWithConcurrency(tasks, 2);
    expect(statuses.every((s) => s === 201)).toBe(true);
    expect(
      ctx.logs.find(ProtectionLogEvent.CONCURRENCY_BLOCKED).length,
    ).toBeGreaterThan(0);
    expect(
      ctx.logs.find(ProtectionLogEvent.THROTTLE_MONITOR_ONLY).length,
    ).toBeGreaterThan(0);

    await destroyProtectionTestApp(ctx);
  });

  it('limits simultaneous exports in enforcement', async () => {
    const ctx = await createProtectionTestApp(
      protectionEnvForMode('enforcement', {
        ENABLE_EXPORT_CONCURRENCY_CONTROL: 'true',
        MAX_EXPORT_CONCURRENT: '1',
      }),
    );

    const u1 = buildTestPrincipal('EXP001');
    const u2 = buildTestPrincipal('EXP002');

    const [res1, res2] = await Promise.all([
      withTestUser(ctx.agent.get('/exports/report'), u1),
      withTestUser(ctx.agent.get('/exports/report'), u2),
    ]);
    const statuses = [res1.status, res2.status];
    expect(statuses).toContain(200);
    expect(statuses).toContain(409);
    await destroyProtectionTestApp(ctx);
  });
});
