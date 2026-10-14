# Enterprise Protection Smoke Testing — Architecture

## Purpose

Validate operational protections (rate limits, concurrency, timeouts, logging) **without disrupting** real employee workflows. The suite is designed for staging rollout gates and CI regression, not load-test production.

## Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 3 — k6 (staging / pre-prod)                        │
│  Real HTTP, 100+ VUs, shared-IP headers, JWT from env       │
└───────────────────────────┬─────────────────────────────────┘
┌───────────────────────────▼─────────────────────────────────┐
│  Layer 2 — Jest + Supertest (CI default)                      │
│  Protection harness app (no Mongo), env-driven modes          │
└───────────────────────────┬─────────────────────────────────┘
┌───────────────────────────▼─────────────────────────────────┐
│  Layer 1 — Unit specs (`src/protection/*.spec.ts`)            │
│  Guards, env parsing, concurrency service                     │
└─────────────────────────────────────────────────────────────┘
```

## Harness app (Layer 2)

`test/helpers/protection-harness/` boots a minimal Nest app with:

- Full `ProtectionModule` (same guards/interceptors as production)
- Controllers mirroring **production route prefixes** (`/auth`, `/reports`, `/dashboard-summary`, `/import`, `/exports`)
- `TestUserMiddleware` — sets `req.user` from `X-Test-User-Id` (user-based throttling without Mongo/JWT)
- `CapturingProtectionLogger` — records structured log lines for assertions

Each test file calls `createProtectionTestApp({ env: { ... } })` which:

1. Snapshots and overrides `process.env`
2. Compiles a fresh module (parallel-safe when tests don't share env)
3. Returns `{ app, agent, logs, resetThrottle }`

## Environment matrix

| Suite | `ENABLE_RATE_LIMITING` | `THROTTLE_MODE` | Notes |
|-------|------------------------|-----------------|-------|
| `non-breaking/defaults-off` | `false` | any | Baseline — no 429 |
| `monitor-mode` | `true` | `monitor-only` | Never 429, logs `THROTTLE_MONITOR_ONLY` |
| `warn-mode` | `true` | `warn-only` | Never 429, logs `THROTTLE_WARN_ONLY` |
| `enforcement` | `true` | `enforcement` | 429 + `retryAfter` body |
| `redis` | `true` + invalid URL | any | `FALLBACK_MODE` / in-memory |
| `shared-ip` | `true` | `enforcement` | Low per-user limit, high user count |

## Polling simulation

`test/helpers/polling-simulator.ts` replays frontend intervals (default 30s dashboard bundle, 15s KPI — configurable). Uses **sequential** bursts per tab (not wall-clock sleep) to avoid flaky timers in CI.

## Live smoke (optional)

`test/protection/live/live-smoke.e2e-spec.ts` runs only when:

- `RUN_LIVE_SMOKE=1`
- `SMOKE_BASE_URL` set
- `SMOKE_JWT` or `SMOKE_LOGIN_USER` + `SMOKE_LOGIN_PASSWORD`

Skipped in default CI.

## Assertions

- HTTP: status, body shape, `x-request-id` header
- Logs: event name + required fields via `protection-assertions.ts`
- Security: no password/JWT/bearer in log lines

## CI command

```bash
npm run test:smoke
```

## Related artifacts

- `test/postman/fris-protection-smoke.postman_collection.json`
- `test/k6/*.js`
- `test/protection/ROLLOUT_CHECKLIST.md`
- `test/ci/github-actions-smoke.yml.example`
