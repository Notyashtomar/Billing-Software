# Parallel run playbook (Phase 7)

Operational guide for the **4-week parallel run** before FRIS becomes the official invoice poster.

## Prerequisites

- Phase 6 cutover tooling deployed (`/billing/cutover`)
- BC baseline CSV for the billing period imported
- `billing_customers` synced from `advance-airline`
- Preparation backfill run for `exportedNAV` serials

## Weekly rhythm

| Day | Action | Owner |
|-----|--------|-------|
| Mon | Finance exports BC posted totals → import on Cutover | Finance |
| Tue | Ops runs preparation through draft → review (no BC post) | Billing ops |
| Wed | Capture week snapshot on Parallel run page | Finance |
| Thu | Review variance & missing serials | Finance + ops |
| Fri | Sign-off if `readyForSignoff` | Finance SME |

## Sign-off criteria

From `GET /billing/cutover/reconciliation`:

- `missingCount = 0`
- `bcImportedCount > 0`
- `|varianceTotal| < ₹1`

Use **Force sign-off** only with written finance approval.

## API endpoints (Phase 7)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/billing/cutover/start-parallel-run` | Enable native billing + set `parallelRunStartDate` |
| POST | `/billing/cutover/snapshots` | Capture weekly reconciliation |
| GET | `/billing/cutover/snapshots` | Snapshot history |
| POST | `/billing/cutover/sign-off` | Finance sign-off for period |
| POST | `/billing/customers/sync-from-advance` | Sync customer master |

## CLI (offline / cron)

```bash
cd server
node ../billing/scripts/sync-customers-from-advance.mjs --station=HYD
node ../billing/scripts/capture-parallel-week.mjs --station=HYD --from=2026-02-01 --to=2026-03-31
```

## After sign-off

1. Advance `cutoverPhase` to `fris_primary` on Cutover page
2. Wire `LEGACY_NAV_BRIDGE_TOKEN` so FRIS posts set `exportedNAV` on flight serials
3. Continue weekly snapshots until BC is read-only

## Rollback

See `CUTOVER_RUNBOOK.md` — set phase back to `parallel` and keep legacy `navision-export` API.
