# Protection rollout validation checklist

## Pre-rollout (staging)

- [ ] `npm run test:smoke` green in CI
- [ ] `npm run test` (unit) green
- [ ] Measure dashboard P99 poll rate per user (see `test/helpers/polling-simulator.ts`)
- [ ] Set `THROTTLE_*_LIMIT` above measured P99
- [ ] `ENABLE_RATE_LIMITING=true`, `THROTTLE_MODE=monitor-only`
- [ ] Run k6 `shared-ip-dashboard.js` — 429 count ≈ 0
- [ ] Review `Protection` logs for `[THROTTLE_MONITOR_ONLY]`

## Warn-only phase

- [ ] `THROTTLE_MODE=warn-only` for 48h
- [ ] No operator tickets for slow/blocked workflows
- [ ] `[THROTTLE_WARN_ONLY]` volume acceptable

## Enforcement phase

- [ ] `THROTTLE_MODE=enforcement` on staging first
- [ ] Auth limits verified (`test/protection/auth`)
- [ ] Shared IP test passed (`test/protection/shared-ip`)
- [ ] Import/export concurrency in monitor-only then enforcement
- [ ] Redis fallback tested (`test/protection/redis`)

## Production

- [ ] Feature flags documented in runbook
- [ ] Rollback env snapshot ready (&lt; 5 min)
- [ ] Log alerts on `[RATE_LIMIT_BLOCKED]` spike
- [ ] Postman collection run against prod-like env

## Rollback verification

- [ ] Set all `ENABLE_*=false`
- [ ] Restart pods
- [ ] `npm run test:smoke:live` with `RUN_LIVE_SMOKE=1` — no 429
