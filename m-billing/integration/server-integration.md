# Server integration

## 1. Register module

In `server/src/app.module.ts`:

```typescript
import { BillingModule } from './billing/billing.module';

@Module({
  imports: [
    // ...existing
    BillingModule,
  ],
})
export class AppModule {}
```

## 2. Station + auth decorators

Replace in all `billing/controllers/*`:

- `@CurrentBillingStation()` → `@CurrentStation()` from `common/station`
- `@CurrentBillingActor()` → your FRIS user decorator (e.g. `@CurrentUser()`)

## 3. Permissions

Add to each controller method:

```typescript
@FrisPagePermission('billing', 'ParallelRun')
@Roles(...FINANCE_ROLES)
```

Suggested page keys: `Dashboard`, `Customers`, `Preparation`, `Invoices`, `Cutover`, `ParallelRun`.

## 4. Advance invoicing adapter

See `BWMS/modules/m-billing/api/src/adapters/advance-invoicing.adapter.ts`.

## 5. Legacy NAV bridge (Phase 7 — after `fris_primary`)

See `BWMS/modules/m-billing/api/src/adapters/legacy-nav-bridge.adapter.ts`.

Wire `RawFlightDataService.patchNavisionExport` (or equivalent) so posted FRIS invoices update `exportedNAV` on `raw_flight_data`.

## 6. Legacy export guard (Phase 8 — after decommission)

See `BWMS/modules/m-billing/api/src/adapters/legacy-export-guard.adapter.ts`.

Block `PATCH /raw-flight-data/navision-export/:serialNo` when `legacyNavExportAllowed` is false.

Export `BillingDecommissionService` from `BillingModule` for the guard.

## 7. Mongo collections (new in Phase 7–8)

- `billing_parallel_run_snapshots`
- `billing_bc_decommission_records`

## 8. Scripts

```bash
cd server
node ../BWMS/modules/m-billing/scripts/sync-customers-from-advance.mjs --station=HYD
node ../BWMS/modules/m-billing/scripts/capture-parallel-week.mjs --station=HYD --from=... --to=...
```
