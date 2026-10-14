# Billing module — integration guide

Source of truth: `BWMS/modules/m-billing` (Approach C).

Legacy root `billing/` is a **compat shim** only.

## Structure

```
BWMS/modules/m-billing/
  domain/         Shared TypeScript types & service catalog labels
  api/src/        NestJS BillingModule (copy → server/src/billing/)
  web/            Next.js components & route stubs (copy → client/)
  scripts/        Mongo seed & migration scripts
  docs/           Architecture documents
  integration/    Mount helpers
```

## Server integration

1. Copy `api/src/` → `server/src/billing/` (or run `integration/integrate-fris.mjs`)
2. In `server/src/app.module.ts` add:
   ```typescript
   import { BillingModule } from './billing/billing.module';
   // imports: [..., BillingModule]
   ```
3. Replace `@CurrentBillingStation` with FRIS `@CurrentStation()` from `common/station`
4. Add `@FrisPagePermission('billing', '<Page>')` on each controller
5. Add `@Roles(...OPERATIONAL_ROLES)` / finance roles as appropriate
6. Register `billing` tab in `permission-tab-config.ts` (client admin)

## Client integration

1. Copy `web/components/billing/` → `client/components/billing/`
2. Copy `web/lib/billing-api.ts` → `client/lib/billing-api.ts`
   - Update imports to use `@/lib/api` and `@/lib/fris-auth-fetch`
3. Create routes under `client/app/billing/` using stubs / generators in `integration/`
4. Add Billing nav item to `Navbar.tsx`
5. Add `/billing/*` rules to `fris-route-permissions.ts`

## Scripts

```bash
# From repo root (requires mongoose via server node_modules)
cd server && node ../BWMS/modules/m-billing/scripts/seed-service-catalog.mjs
cd server && node ../BWMS/modules/m-billing/scripts/migrate-bhs-revenue-master.mjs --station=HYD

# Or via shim / module package scripts:
npm --prefix billing run seed:catalog
npm --prefix BWMS/modules/m-billing run seed:catalog

# Or via API after server integration:
POST /billing/service-catalog/seed
```

See module `docs/` and previous runbooks for phase checklists, cutover, and decommission.
