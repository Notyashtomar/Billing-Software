export type ThrottleEnforcementMode =
  | 'monitor-only'
  | 'warn-only'
  | 'enforcement';

export type ProtectionEnv = {
  enableRateLimiting: boolean;
  enableRedisThrottling: boolean;
  enableRequestTimeouts: boolean;
  enableExportConcurrencyControl: boolean;
  enableImportConcurrencyControl: boolean;
  enableSecurityLogging: boolean;
  throttleMode: ThrottleEnforcementMode;
  nodeEnv: string;
  redisUrl: string | undefined;
  requestTimeoutMs: number;
  maxImportConcurrent: number;
  maxExportConcurrent: number;
  authFailedAttemptsThreshold: number;
  /** Global throttler: requests per TTL window (per tracker key). */
  throttleGlobalLimit: number;
  throttleGlobalTtlMs: number;
  throttleAuthLimit: number;
  throttleAuthTtlMs: number;
  throttleReportsLimit: number;
  throttleReportsTtlMs: number;
};

function envBool(key: string, defaultValue = false): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function productionDefaultBool(
  key: string,
  productionDefault: boolean,
  devDefault = false,
): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === '') {
    return process.env.NODE_ENV === 'production' ? productionDefault : devDefault;
  }
  return envBool(key, devDefault);
}

function envInt(key: string, defaultValue: number): number {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : defaultValue;
}

function parseThrottleMode(raw: string | undefined): ThrottleEnforcementMode {
  const v = String(raw ?? 'monitor-only')
    .trim()
    .toLowerCase();
  if (v === 'enforcement' || v === 'enforce') return 'enforcement';
  if (v === 'warn-only' || v === 'warn') return 'warn-only';
  return 'monitor-only';
}

export function readProtectionEnv(): ProtectionEnv {
  return {
    enableRateLimiting: productionDefaultBool('ENABLE_RATE_LIMITING', true),
    enableRedisThrottling: envBool('ENABLE_REDIS_THROTTLING', false),
    enableRequestTimeouts: productionDefaultBool('ENABLE_REQUEST_TIMEOUTS', true),
    enableExportConcurrencyControl: envBool(
      'ENABLE_EXPORT_CONCURRENCY_CONTROL',
      false,
    ),
    enableImportConcurrencyControl: envBool(
      'ENABLE_IMPORT_CONCURRENCY_CONTROL',
      false,
    ),
    enableSecurityLogging: productionDefaultBool('ENABLE_SECURITY_LOGGING', true),
    throttleMode: parseThrottleMode(process.env.THROTTLE_MODE),
    nodeEnv: String(process.env.NODE_ENV ?? 'development').trim(),
    redisUrl: process.env.REDIS_URL?.trim() || undefined,
    requestTimeoutMs: envInt('REQUEST_TIMEOUT_MS', 30_000),
    maxImportConcurrent: envInt('MAX_IMPORT_CONCURRENT', 1),
    maxExportConcurrent: envInt('MAX_EXPORT_CONCURRENT', 2),
    authFailedAttemptsThreshold: envInt('AUTH_FAILED_ATTEMPTS_THRESHOLD', 10),
    throttleGlobalLimit: envInt('THROTTLE_GLOBAL_LIMIT', 600),
    throttleGlobalTtlMs: envInt('THROTTLE_GLOBAL_TTL_MS', 60_000),
    throttleAuthLimit: envInt('THROTTLE_AUTH_LIMIT', 30),
    throttleAuthTtlMs: envInt('THROTTLE_AUTH_TTL_MS', 60_000),
    throttleReportsLimit: envInt('THROTTLE_REPORTS_LIMIT', 180),
    throttleReportsTtlMs: envInt('THROTTLE_REPORTS_TTL_MS', 60_000),
  };
}

export const PROTECTION_ENV = Symbol('PROTECTION_ENV');
