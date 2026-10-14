import {
  createProtectionTestApp,
  destroyProtectionTestApp,
} from '../../helpers/protection-test-app.factory';
import { PROTECTION_ENV_OFF, protectionEnvForMode } from '../../fixtures/protection-env.defaults';

describe('Import upload (e2e)', () => {
  it('accepts valid small upload when protections off', async () => {
    const ctx = await createProtectionTestApp(PROTECTION_ENV_OFF);
    const res = await ctx.agent
      .post('/import/maa-march')
      .attach('file', Buffer.from('ok'), 'small.xlsx');
    expect(res.status).toBe(201);
    await destroyProtectionTestApp(ctx);
  });

  it('rejects oversized file when multer limit exceeded', async () => {
    const ctx = await createProtectionTestApp(
      protectionEnvForMode('monitor-only', {
        ENABLE_SECURITY_LOGGING: 'true',
      }),
    );

    const big = Buffer.alloc(2048, 1);
    const res = await ctx.agent
      .post('/import/maa-march')
      .attach('file', big, 'big.xlsx');
    expect(res.status).toBe(413);

    await destroyProtectionTestApp(ctx);
  });
});
