import type { ThrottleEnforcementMode } from '../../src/protection/config/protection-env';

export type ProtectionEnvOverrides = Record<string, string | undefined>;

export const PROTECTION_ENV_OFF: ProtectionEnvOverrides = {
  ENABLE_RATE_LIMITING: 'false',
  ENABLE_REDIS_THROTTLING: 'false',
  ENABLE_REQUEST_TIMEOUTS: 'false',
  ENABLE_EXPORT_CONCURRENCY_CONTROL: 'false',
  ENABLE_IMPORT_CONCURRENCY_CONTROL: 'false',
  ENABLE_SECURITY_LOGGING: 'false',
  THROTTLE_MODE: 'monitor-only',
  NODE_ENV: 'test',
};

export function protectionEnvForMode(
  mode: ThrottleEnforcementMode,
  extra: ProtectionEnvOverrides = {},
): ProtectionEnvOverrides {
  return {
    ...PROTECTION_ENV_OFF,
    ENABLE_RATE_LIMITING: 'true',
    THROTTLE_MODE: mode,
    ...extra,
  };
}

export const STRICT_AUTH_LIMITS: ProtectionEnvOverrides = {
  THROTTLE_AUTH_LIMIT: '3',
  THROTTLE_AUTH_TTL_MS: '60000',
};

export const STRICT_REPORT_LIMITS: ProtectionEnvOverrides = {
  THROTTLE_REPORTS_LIMIT: '5',
  THROTTLE_REPORTS_TTL_MS: '60000',
};

export const FAST_TIMEOUT: ProtectionEnvOverrides = {
  ENABLE_REQUEST_TIMEOUTS: 'true',
  REQUEST_TIMEOUT_MS: '100',
};
