/**
 * Client-side mirror of server ops-module session secret resolution for API route adapters.
 */
import { resolveNestBackendUrl } from './nest-backend-url';

export const OPS_MODULE_SESSION_SECRET_KEY = 'OPS_MODULE_SESSION_SECRET';

export function opsModuleLocalEnvBindings(): Record<string, string> {
  const keys = [
    OPS_MODULE_SESSION_SECRET_KEY,
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
    'GROQ_API_KEY',
  ];
  const out: Record<string, string> = {};
  for (const key of keys) {
    const v = process.env[key];
    if (typeof v === 'string' && v.trim()) out[key] = v.trim();
  }

  // Local dev must authenticate against local Nest — not Railway from deploy .env.
  const nestBase = resolveNestBackendUrl();
  out.API_BACKEND_URL = nestBase;
  out.NEXT_PUBLIC_API_URL = nestBase;

  return out;
}
