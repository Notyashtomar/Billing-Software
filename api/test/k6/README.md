# k6 protection load tests

Requires [k6](https://k6.io/docs/get-started/installation/) installed locally or in CI.

## Staging run (monitor-only recommended first)

```bash
export BASE_URL=https://staging-fris.example.com
export JWT=<employee-jwt>
export SHARED_IP=203.0.113.50

k6 run test/k6/shared-ip-dashboard.js
k6 run test/k6/auth-throttle.js
k6 run test/k6/full-operations.js
```

## Metrics to watch

- `http_req_failed` — should stay &lt; 5%
- `http_status_429` — should be ~0 in monitor-only; non-zero only after enforcement rollout
- `http_req_duration` p95 — dashboard &lt; 5s on staging hardware

## Notes

- Harness smoke tests use Nest in-process; k6 validates real network stack + reverse proxy headers.
- Set `ALLOW_429=1` when intentionally testing enforcement on staging.
