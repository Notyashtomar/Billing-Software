import { readProtectionEnv } from './protection-env';

describe('readProtectionEnv', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('defaults all protections to disabled for zero workflow disruption', () => {
    delete process.env.ENABLE_RATE_LIMITING;
    delete process.env.ENABLE_REDIS_THROTTLING;
    delete process.env.ENABLE_REQUEST_TIMEOUTS;
    delete process.env.THROTTLE_MODE;

    const env = readProtectionEnv();
    expect(env.enableRateLimiting).toBe(false);
    expect(env.enableRedisThrottling).toBe(false);
    expect(env.enableRequestTimeouts).toBe(false);
    expect(env.enableImportConcurrencyControl).toBe(false);
    expect(env.enableExportConcurrencyControl).toBe(false);
    expect(env.enableSecurityLogging).toBe(false);
    expect(env.throttleMode).toBe('monitor-only');
  });

  it('parses enforcement mode', () => {
    process.env.THROTTLE_MODE = 'enforcement';
    expect(readProtectionEnv().throttleMode).toBe('enforcement');
  });
});
