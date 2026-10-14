# Protection smoke test — final report template

Fill after running `npm run test:smoke` and optional k6 staging load.

## 1. Tested routes

See `test/fixtures/route-manifest.ts` and harness controllers in `test/helpers/protection-harness/smoke-controllers.ts`.

| Category | Harness coverage | Live app (manual/k6) |
|----------|------------------|----------------------|
| Auth | Yes | Postman + k6 |
| Dashboard | Yes | k6 shared-ip |
| Reports | Yes | k6 full-operations |
| Exports | Yes (concurrency) | Manual |
| Imports | Yes | Postman |
| Seed | Yes | Postman prod check |

## 2. Detected gaps

- Live full-app e2e requires `RUN_LIVE_SMOKE=1` + MongoDB (skipped in default CI).
- Production `advance-invoicing` export paths not duplicated in harness — extend manifest when wiring export concurrency globally.
- `@SkipTimeout` must be applied per slow handler in production code (harness demonstrates pattern on `/exports/slow-report`).

## 3. Unsafe endpoints (candidates for stricter limits)

| Route | Risk | Recommendation |
|-------|------|----------------|
| `POST /auth/login` | Credential stuffing | Keep strict AUTH category |
| `POST /import/maa-march` | Heavy CPU/IO | Import concurrency + admin-only |
| `POST /seed/*` | Data destruction | Production guard (enabled) |
| Heavy report GETs | Long CPU | `@SkipTimeout` + report limits |

## 4. Recommended limit tuning

| Setting | Staging start | Notes |
|---------|---------------|-------|
| `THROTTLE_AUTH_LIMIT` | 30/min/IP or user | Lower only after measuring failed logins |
| `THROTTLE_REPORTS_LIMIT` | 180/min/user | Above 4 tabs × 30s polling |
| `THROTTLE_GLOBAL_LIMIT` | 600/min/user | Office NAT uses per-user JWT key |
| `MAX_IMPORT_CONCURRENT` | 1 | Raise only if ops confirms parallel imports |

## 5. Dashboard polling analysis

Default simulator: 4 cycles × 2 tabs × 3 endpoints = 24 requests/user burst.

With `THROTTLE_REPORTS_LIMIT=180`, false positive rate in harness: **0** (see `dashboard-polling.e2e-spec.ts`).

## 6. Export/import stress

| Test | Result |
|------|--------|
| Import concurrency enforcement | _fill after CI_ |
| Export concurrency enforcement | _fill after CI_ |
| Oversized upload 413 | _fill after CI_ |

## 7. Redis reliability

| Scenario | Expected |
|----------|----------|
| Invalid `REDIS_URL` at startup | `[FALLBACK_MODE]`, app serves traffic |
| Runtime disconnect | In-memory per instance |

## 8. Enforcement readiness

| Gate | Status |
|------|--------|
| Monitor-only soak complete | ☐ |
| Limits &gt; measured P99 | ☐ |
| Shared IP test green | ☐ |
| Rollback tested | ☐ |
| k6 429 rate acceptable | ☐ |

**Ready for enforcement:** ☐ Yes ☐ No

Signed off: _______________  Date: _______________
