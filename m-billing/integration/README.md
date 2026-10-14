# FRIS integration kit (Phase 7)

Copy-paste artifacts to wire `billing/` into the main app **without** editing this folder in place.

## Quick start

1. **Server:** copy `BWMS/modules/m-billing/api/src/` → `server/src/billing/`
2. **Client:** copy `BWMS/modules/m-billing/web/components/billing/` → `client/components/billing/`
3. **Client API:** copy `BWMS/modules/m-billing/web/lib/billing-api.ts` → `client/lib/billing-api.ts`
4. Follow `server-integration.md` and `client-integration.md` below
5. Run `node BWMS/modules/m-billing/integration/generate-route-stubs.mjs` to emit Next.js page files

## Files

| File | Purpose |
|------|---------|
| `server-integration.md` | Nest module, permissions, adapters |
| `client-integration.md` | Routes, navbar, Workers checklist |
| `generate-route-stubs.mjs` | Creates `client/app/billing/*/page.tsx` stubs |

## Adapters to wire (required for production parity)

| Token | Adapter doc |
|-------|-------------|
| `BillingAdvanceInvoicingAdapter` | `BWMS/modules/m-billing/api/src/adapters/advance-invoicing.adapter.ts` |
| `BillingLegacyNavBridge` | `BWMS/modules/m-billing/api/src/adapters/legacy-nav-bridge.adapter.ts` |

## Post-integration smoke test

```text
GET  /api-backend/billing/dashboard
POST /api-backend/billing/customers/sync-from-advance
GET  /api-backend/billing/cutover/status
POST /api-backend/billing/cutover/start-parallel-run
```

Open `https://<env>/billing/parallel-run` and capture a snapshot.
