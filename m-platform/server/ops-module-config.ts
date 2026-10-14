/**
 * Shared Cloudflare operational-module env checks (Hono + D1).
 * Production Workers must have D1 bindings + OPS_MODULE_SESSION_SECRET (or per-module secret).
 */
export const OPS_MODULE_SESSION_SECRET_KEY = 'OPS_MODULE_SESSION_SECRET';

const MODULE_SESSION_KEYS = [
  'SAFETY_SESSION_SECRET',
  'AMS_SESSION_SECRET',
  'CMS_SESSION_SECRET',
  'CHR_SESSION_SECRET',
  'ULD_SESSION_SECRET',
  'GEMM_SESSION_SECRET',
  'BATTEST_SESSION_SECRET',
  'HR_SESSION_SECRET',
  'MANUALS_SESSION_SECRET',
  'COMPLIANCE_SESSION_SECRET',
  'TRP_SESSION_SECRET',
  'BILL_RECEIVABLES_SESSION_SECRET',
] as const;

export function resolveModuleSessionSecret(
  env: Record<string, unknown>,
  moduleSecretKey: string,
): string | undefined {
  const specific = env[moduleSecretKey];
  if (typeof specific === 'string' && specific.trim()) return specific.trim();

  const shared = env[OPS_MODULE_SESSION_SECRET_KEY];
  if (typeof shared === 'string' && shared.trim()) return shared.trim();

  if (typeof process !== 'undefined') {
    const fromProcess =
      process.env[moduleSecretKey]?.trim() ||
      process.env[OPS_MODULE_SESSION_SECRET_KEY]?.trim() ||
      process.env.NEXTAUTH_SECRET?.trim();
    if (fromProcess) return fromProcess;
  }

  return undefined;
}

export function hasD1Binding(env: Record<string, unknown>, dbKey: string): boolean {
  return env[dbKey] != null;
}

function isProductionRuntime(): boolean {
  if (typeof process === 'undefined') return true;
  return process.env.NODE_ENV === 'production';
}

export function requireOpsModuleEnv(
  env: Record<string, unknown>,
  dbKey: string,
  sessionSecretKey: string,
): { ok: true } | { ok: false; error: string } {
  if (!hasD1Binding(env, dbKey) && isProductionRuntime()) {
    return { ok: false, error: `Missing D1 binding (${dbKey})` };
  }

  const secret = resolveModuleSessionSecret(env, sessionSecretKey);
  if (!secret && isProductionRuntime()) {
    return {
      ok: false,
      error:
        'Missing session secret (set Worker secret OPS_MODULE_SESSION_SECRET or ' +
        `${sessionSecretKey})`,
    };
  }

  return { ok: true };
}

/** Keys copied from process.env into route localBindings() for OpenNext string vars. */
export function opsModuleProcessEnvBindings(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of MODULE_SESSION_KEYS) {
    const v = process.env[key];
    if (typeof v === 'string' && v.trim()) out[key] = v.trim();
  }
  const shared = process.env[OPS_MODULE_SESSION_SECRET_KEY];
  if (typeof shared === 'string' && shared.trim()) {
    out[OPS_MODULE_SESSION_SECRET_KEY] = shared.trim();
  }
  return out;
}
