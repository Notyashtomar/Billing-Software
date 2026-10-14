# Operational Protection Rollout

This document covers structured protection logging, feature flags, gradual enforcement, verification, and rollback for the FRIS backend.

## Design principles

1. **Zero workflow disruption by default** — all `ENABLE_*` flags default to `false`.
2. **Operational visibility** — every block/throttle/timeout logs a structured `[EVENT] key=value` line via NestJS `Logger` (`Protection` context).
3. **Safe rollout** — use `THROTTLE_MODE=monitor-only` before `enforcement`.
4. **Fast rollback** — toggle env vars and restart (target &lt; 5 minutes); no schema migrations.

## Environment flags

| Variable | Default | Purpose |
|----------|---------|---------|
| `ENABLE_RATE_LIMITING` | `false` | Master switch for HTTP rate limits |
| `ENABLE_REDIS_THROTTLING` | `false` | Use Redis counter store (optional `ioredis`) |
| `ENABLE_REQUEST_TIMEOUTS` | `false` in non-prod; **`true` when `NODE_ENV=production`** unless overridden | Global RxJS request timeout interceptor + request `AbortSignal` |
| `ENABLE_EXPORT_CONCURRENCY_CONTROL` | `false` | Export job concurrency (service ready) |
| `ENABLE_IMPORT_CONCURRENCY_CONTROL` | `false` | `POST /import/maa-march` concurrency |
| `ENABLE_SECURITY_LOGGING` | `false` | Auth suspicious activity + multer size logs |
| `THROTTLE_MODE` | `monitor-only` | `monitor-only` \| `warn-only` \| `enforcement` |
| `REDIS_URL` | — | Required when Redis throttling enabled |
| `REQUEST_TIMEOUT_MS` | `30000` | Timeout when enabled |
| `THROTTLE_*_LIMIT` / `THROTTLE_*_TTL_MS` | see `protection-env.ts` | Per-category limits |

## Gradual enforcement

1. **monitor-only** — violations logged as `[THROTTLE_MONITOR_ONLY] wouldBlock=true`; requests **not** blocked.
2. **warn-only** — `[THROTTLE_WARN_ONLY]`; requests **not** blocked.
3. **enforcement** — `[RATE_LIMIT_BLOCKED]` and HTTP `429` with `retryAfter`.

Recommended production path:

```env
ENABLE_RATE_LIMITING=true
THROTTLE_MODE=monitor-only
```

Observe logs for 1–2 weeks, tune limits, then `THROTTLE_MODE=enforcement`.

## Protected routes (when enabled)

| Category | Auto-matched routes | Default limit (60s window) |
|----------|---------------------|----------------------------|
| `AUTH` | `/auth/*` (+ `@ThrottleCategoryDecorator`) | 30 / min |
| `REPORTS` | `/reports/*`, `/dashboard*` | 180 / min |
| `EXPORT` | paths containing `export` | 90 / min |
| `GLOBAL` | all other routes | 600 / min |

Per-user key when JWT present; otherwise per-IP (supports shared office NAT).

## Compatibility validation (before enforcement)

Do **not** guess limits. Measure:

1. Dashboard polling intervals (Bird UI, KPI cards).
2. Auto-refresh APIs (`/dashboard-summary/*`, KPI flights).
3. Frontend retry/backoff on reports.
4. Batch Excel import/export frequency.
5. Peak concurrent users per shared IP.

Set `THROTTLE_*_LIMIT` **above** measured P99 per user.

## Startup / shutdown logs

On boot (when flags enabled):

- `[RATE_LIMITING_ENABLED]`
- `[THROTTLE_MODE] mode=...`
- `[TIMEOUT_PROTECTION_ENABLED]`
- `[REDIS_CONNECTED]` or `[FALLBACK_MODE]`

On degradation:

- `[RATE_LIMITING_DEGRADED]`
- `[REDIS_THROTTLE_FAILURE] fallback=in-memory`
- `[REDIS_DISCONNECTED]`

## Rollback (&lt; 5 minutes)

```env
ENABLE_RATE_LIMITING=false
ENABLE_REDIS_THROTTLING=false
ENABLE_REQUEST_TIMEOUTS=false
ENABLE_IMPORT_CONCURRENCY_CONTROL=false
ENABLE_EXPORT_CONCURRENCY_CONTROL=false
THROTTLE_MODE=monitor-only
```

Restart the Node process. No database changes required.

## Monitoring

Search logs for context `Protection`:

- `[RATE_LIMIT_BLOCKED]` — enforcement active
- `[THROTTLE_MONITOR_ONLY]` — would-block during rollout
- `[CONCURRENCY_BLOCKED]` — import/export saturation
- `[AUTH_SUSPICIOUS_ACTIVITY]` — brute-force pattern
- `[SECURITY_BLOCK]` — production seed blocked

Correlate with `requestId` response header `x-request-id`.

## Verification checklist

Run after any limit change:

```bash
cd server && npm test -- --testPathPatterns=protection
```

Manual smoke (staging):

- [ ] Login / forgot password / session
- [ ] Dashboard auto-refresh and charts
- [ ] Quality + MIS reports + exports
- [ ] Excel import (`/import/maa-march`)
- [ ] Concurrent users same IP
- [ ] Redis stopped → `[FALLBACK_MODE]` and service continues

## Known risks

- **Shared IP**: unauthenticated routes keyed by IP may aggregate staff behind one NAT.
- **Redis optional**: without `ioredis` installed, Redis mode falls back to in-memory per instance.
- **Request timeout**: enabling globally may affect long report generation; increase `REQUEST_TIMEOUT_MS` or disable for specific routes (future `@SkipProtection`).

## Tests

- `protection-env.spec.ts` — default-off guarantees
- `operational-throttler.guard.spec.ts` — monitor vs enforcement
- `protection-smoke.spec.ts` — no 429 when disabled
