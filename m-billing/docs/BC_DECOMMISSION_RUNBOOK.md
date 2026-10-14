# BC decommission runbook (Phase 8)

Final step: retire Microsoft Dynamics 365 Business Central for GBASPL invoicing. FRIS `billing_invoice_headers` with `status: posted` is the AR source of truth.

## Prerequisites (from Phase 7)

- Parallel run completed with finance sign-off
- `cutoverPhase` set to `bc_readonly` on Cutover page
- At least one FRIS posted invoice
- Invoice sequences configured (`SI-{STATION}`)

## Decommission steps

| Step | Action | Owner |
|------|--------|-------|
| 1 | Open `/billing/decommission` — verify all **required** checklist items pass | Finance |
| 2 | `POST /billing/cutover/decommission` or click **Decommission BC invoicing** | Finance admin |
| 3 | Wire legacy export guard on `PATCH /raw-flight-data/navision-export/:serialNo` | Engineering |
| 4 | Remove BC invoicing links from ops training / finance SOPs | Ops lead |
| 5 | Archive BC baseline CSVs and parallel-run snapshots | Finance |

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/billing/cutover/decommission/readiness` | Checklist |
| POST | `/billing/cutover/decommission` | Execute decommission |
| GET | `/billing/cutover/legacy-export-policy` | Gate legacy exportedNAV patches |
| GET | `/billing/cutover/decommission/records` | Audit history |
| POST | `/billing/cutover/decommission/rollback` | Emergency rollback to `bc_readonly` |

## Legacy export guard

After decommission, `legacyNavExportEnabled` is `false`. On FRIS integration, call `getLegacyExportPolicy` before allowing `navision-export` patches.

See `billing/server/src/adapters/legacy-export-guard.adapter.ts`.

## Rollback

Use rollback only with finance written approval:

1. `POST /billing/cutover/decommission/rollback` with `reason`
2. Phase returns to `bc_readonly`; legacy export re-enabled
3. Investigate root cause before re-attempting decommission

## CLI verification

```bash
cd server && node ../billing/scripts/verify-decommission-readiness.mjs --station=HYD
```

## Success criteria

- `cutoverPhase === decommissioned`
- `legacyNavExportAllowed === false`
- Zero new BC sales invoices for the station
- Month-close completes in FRIS only
