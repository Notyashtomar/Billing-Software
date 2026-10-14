/**
 * Shared binding resolver for the operational Hono modules (Safety & Incident,
 * CHR, ULD, GEMM) that run behind a Next.js App Router adapter route.
 *
 * The Cloudflare env is where the D1 bindings live (`SAFETY_DB`, `AMS_DB`, `CMS_DB`, `CHR_DB`, `HR_DB`, `MANUALS_DB`, `COMPLIANCE_DB`, …).
 * Without it every Hono repo silently falls back to an in-memory store, so any
 * master data the user creates disappears on the next recompile or restart.
 *
 * Production: the Worker entrypoint puts the context on the global scope, so the
 * sync read succeeds immediately.
 * `next dev`: `initOpenNextCloudflareForDev()` (see `apps/web/next.config.ts`)
 * boots wrangler's platform proxy, and the async read waits for it rather than
 * timing out into the memory fallback.
 */

type CloudflareEnv = Record<string, unknown>;

let cachedEnv: CloudflareEnv | null = null;
let pendingEnv: Promise<CloudflareEnv | null> | null = null;
let warnedMissing = false;

function readCloudflareContextStore(): { env?: CloudflareEnv } | null {
  try {
    const sym = Symbol.for('__cloudflare-context__');
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, sym);
    const store = descriptor?.get?.call(globalThis) as { env?: CloudflareEnv } | undefined;
    if (store?.env && typeof store.env === 'object') return store;
  } catch {
    // ignore
  }
  return null;
}

async function readCloudflareEnv(): Promise<CloudflareEnv | null> {
  const fromAls = readCloudflareContextStore();
  if (fromAls?.env) return fromAls.env;

  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    try {
      const ctx = getCloudflareContext();
      if (ctx?.env) return ctx.env as CloudflareEnv;
    } catch {
      const ctx = await getCloudflareContext({ async: true });
      if (ctx?.env) return ctx.env as CloudflareEnv;
    }
  } catch {
    // fall through
  }

  return null;
}

async function loadCloudflareEnv(): Promise<CloudflareEnv | null> {
  if (cachedEnv) return cachedEnv;
  // Retry on the next request when resolution fails; only success is cached.
  pendingEnv ??= readCloudflareEnv().finally(() => {
    pendingEnv = null;
  });
  const env = await pendingEnv;
  if (env) cachedEnv = env;
  return env;
}

/**
 * Merge the Cloudflare Worker env (D1 bindings, secrets) over `process.env`
 * derived defaults. Returns `base` unchanged when no Cloudflare context exists.
 */
export async function resolveCloudflareBindings<T extends object>(
  base: T,
  options?: { label?: string },
): Promise<T> {
  const cloudflareEnv = await loadCloudflareEnv();

  if (!cloudflareEnv) {
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn(
        `[${options?.label ?? 'operational'}] Cloudflare bindings unavailable — ` +
          'module data is kept in memory and will not survive a restart. ' +
          'Run `npm run d1:migrate:local` in BWMS/apps/web and restart the dev server.',
      );
    }
    return base;
  }

  const merged: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(cloudflareEnv)) {
    if (value !== undefined) merged[key] = value;
  }
  // OpenNext copies string Worker vars/secrets onto process.env — keep those when
  // bindings object omits secret names (D1 objects are never on process.env).
  for (const [key, value] of Object.entries(base as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim() && merged[key] === undefined) {
      merged[key] = value;
    }
  }
  return merged as T;
}
