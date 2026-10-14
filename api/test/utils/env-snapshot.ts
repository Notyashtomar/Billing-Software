export class EnvSnapshot {
  private readonly previous = new Map<string, string | undefined>();

  constructor(private readonly keys: string[]) {
    for (const key of keys) {
      this.previous.set(key, process.env[key]);
    }
  }

  apply(overrides: Record<string, string | undefined>): void {
    for (const key of this.keys) {
      const value = overrides[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  restore(): void {
    for (const key of this.keys) {
      const value = this.previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

export const PROTECTION_ENV_KEYS = [
  'ENABLE_RATE_LIMITING',
  'ENABLE_REDIS_THROTTLING',
  'ENABLE_REQUEST_TIMEOUTS',
  'ENABLE_EXPORT_CONCURRENCY_CONTROL',
  'ENABLE_IMPORT_CONCURRENCY_CONTROL',
  'ENABLE_SECURITY_LOGGING',
  'THROTTLE_MODE',
  'NODE_ENV',
  'REDIS_URL',
  'REQUEST_TIMEOUT_MS',
  'MAX_IMPORT_CONCURRENT',
  'MAX_EXPORT_CONCURRENT',
  'AUTH_FAILED_ATTEMPTS_THRESHOLD',
  'THROTTLE_GLOBAL_LIMIT',
  'THROTTLE_GLOBAL_TTL_MS',
  'THROTTLE_AUTH_LIMIT',
  'THROTTLE_AUTH_TTL_MS',
  'THROTTLE_REPORTS_LIMIT',
  'THROTTLE_REPORTS_TTL_MS',
] as const;
