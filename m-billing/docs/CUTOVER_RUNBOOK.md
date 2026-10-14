# Billing cutover runbook (Phase 6)

Native billing replaces Microsoft Dynamics 365 Business Central invoicing for GBASPL. This runbook covers the **parallel run → FRIS primary → BC read-only → decommission** path.

## Prerequisites

- Phases 1–5 integrated into FRIS (`billing/INTEGRATION.md`)
- Finance sign-off on invoice PDF template (or accept text MVP for pilot)
- Sequence configured: `SI-{STATION}` + fiscal year in `/billing/settings/sequences`
- Contracts and rate cards migrated (`migrate-bhs-revenue-master.mjs`)

## Cutover phases

| Phase | `cutoverPhase` | BC | FRIS native |
|-------|----------------|-----|-------------|
| 1 | `parallel` | Official posted invoices | Drafts + reconciliation only |
| 2 | `fris_primary` | Parallel comparison | FRIS posts official invoices |
| 3 | `bc_readonly` | Read-only | Sole writer |
| 4 | `decommissioned` | No invoicing access | Production |

Set via `PATCH /billing/cutover/settings` or **Cutover** UI (`/billing/cutover`).

## Week-by-week (HYD pilot)

| Weeks | Activity |
|-------|----------|
| 1–4 | Parallel: FRIS generates drafts; BC still posts. Import BC totals CSV weekly. |
| 5–8 | Compare PDFs and totals; fix contract/rate gaps. |
| 9 | Finance sign-off on one full month (`reconciliation.readyForSignoff`) |
| 10 | Set `fris_primary`; FRIS posts; BC read-only for new invoices |
| 11–12 | `decommissioned`; retire BC invoicing nav |

## Data migration scripts

```bash
# Backfill preparation from legacy exportedNAV flags
cd server && node ../billing/scripts/backfill-preparation.mjs --station=HYD --from=2026-02-01 --to=2026-03-31 --dry-run

# Import BC posted totals for reconciliation (CSV: customerCode,invoiceNumber,totalInclTax)
cd server && node ../billing/scripts/import-bc-baseline-csv.mjs --station=HYD --from=2026-02-01 --to=2026-03-31 --file=../bc-totals.csv
```

API equivalents:

- `POST /billing/cutover/backfill`
- `POST /billing/cutover/import-bc-baseline`
- `GET /billing/cutover/reconciliation?from=&to=`

## Parallel run reconciliation

Compare three streams:

1. **exportedNAV=Yes** serials in `raw_flight_data` (legacy handoff flag)
2. **billing_preparation_records** + posted FRIS invoices
3. **billing_bc_baselines** (imported BC totals)

Target: `missingCount = 0` and `|varianceTotal| < ₹1` before sign-off.

## Feature flag

Per station: `billing_settings.nativeBillingEnabled`

- `false` during early parallel (ops can still use legacy `PATCH /raw-flight-data/navision-export/:serialNo`)
- `true` when native billing is the default UI path

On FRIS integration, gate `/billing/*` nav with this flag + permissions.

## Rollback

1. Set `cutoverPhase` back to `parallel`
2. Set `nativeBillingEnabled: false`
3. Continue BC posting until two successful FRIS-only month closes are achieved
4. Keep `exportedNAV` path functional — do not remove `navision-export` API until decommission

## Zero BC writes criterion

After `bc_readonly` or `decommissioned`, no new BC sales invoices. FRIS `billing_invoice_headers` with `status: posted` is the AR source of truth.

## Phase 8 — formal decommission

Use `/billing/decommission` (not the Cutover phase buttons) to execute decommission after `bc_readonly`:

- `GET /billing/cutover/decommission/readiness`
- `POST /billing/cutover/decommission`
- `GET /billing/cutover/legacy-export-policy` — wire on `navision-export` PATCH

See `BC_DECOMMISSION_RUNBOOK.md`.
