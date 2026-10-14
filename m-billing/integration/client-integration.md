# Client integration

## 1. API client

Copy `BWMS/modules/m-billing/web/lib/billing-api.ts` → `client/lib/billing-api.ts`.

Update imports:

```typescript
import { getApiBase } from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';

export const billingApi = createBillingApi({ getApiBase, fetch: frisFetch });
```

## 2. Routes

Run from repo root:

```bash
node BWMS/modules/m-billing/integration/generate-route-stubs.mjs
```

Or manually create pages from `BWMS/modules/m-billing/web/app/billing/routes.integration.ts`.

**New in Phase 7:** `/billing/parallel-run` → `ParallelRunPage`

**New in Phase 8:** `/billing/decommission` → `DecommissionPage`

## 3. Navbar

Add Billing section with links to `/billing/dashboard` and workflow items from `BillingSidebar.tsx`.

## 4. Route permissions

Add `/billing/*` rules in `fris-route-permissions.ts` including `/billing/parallel-run`.

## 5. Cloudflare Workers

Verify all billing API calls go through `app/api-backend/[[...path]]/route.ts` — no `next.config` rewrite to Railway.

Smoke-test JSON responses are uncompressed (no stale `Content-Encoding` header).

## 6. Gate native billing

Hide Billing nav when `nativeBillingEnabled` is false unless user has admin cutover permission.
