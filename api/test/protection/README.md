# Enterprise protection smoke tests

## Quick start

```bash
cd server
npm run test:smoke          # Harness e2e (no Mongo, parallel-safe env per suite)
npm run test:smoke:all      # Unit + smoke
npm run test:smoke:live     # Optional staging (requires RUN_LIVE_SMOKE=1)
```

## Layout

| Directory | Purpose |
|-----------|---------|
| `auth/` | Login, forgot, reset throttling |
| `shared-ip/` | NAT / VPN user isolation |
| `dashboard/` | Polling burst simulation |
| `enforcement/` | 429 + retryAfter |
| `monitor-mode/` | No block, monitor logs |
| `warn-mode/` | Warn logs only |
| `redis/` | Fallback behavior |
| `concurrency/` | Import/export locks |
| `timeout/` | Timeout + `@SkipTimeout` |
| `logging/` | Structured log assertions |
| `non-breaking/` | Default-off regression |
| `reports/` | Report category limits |
| `imports/` / `exports/` | Upload + export paths |
| `live/` | Real server (opt-in) |
| `../helpers/` | App factory, assertions, polling |
| `../k6/` | Staging load scripts |
| `../postman/` | Manual collection |

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Rollout

See [ROLLOUT_CHECKLIST.md](./ROLLOUT_CHECKLIST.md) and [FINAL_REPORT.md](./FINAL_REPORT.md).
