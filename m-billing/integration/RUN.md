# Run billing after FRIS integration

Integration copies `billing/` into `server/src/billing` and `client/` — re-run if you change the isolated module:

```bash
node BWMS/modules/m-billing/integration/integrate-fris.mjs
node BWMS/modules/m-billing/integration/generate-billing-pages.mjs
```

## 1. Start backend (Railway / local Nest)

```bash
cd server
npm install
npm run start:dev
```

API base: `http://127.0.0.1:8080` (or your `MONGO_URI` in `server/.env`).

Smoke test (after login cookie):

```bash
curl -s http://127.0.0.1:8080/billing/dashboard
```

## 2. Start frontend

```bash
cd client
npm install
npm run dev
```

Open: **http://localhost:3000/billing/dashboard**

Login required. Billing uses the same permission as **Advance → Invoicing** (or superadmin/manager role nav).

## 3. Seed master data (first time)

```bash
cd server
node ../BWMS/modules/m-billing/scripts/seed-service-catalog.mjs
node ../BWMS/modules/m-billing/scripts/migrate-bhs-revenue-master.mjs --station=HYD
node ../BWMS/modules/m-billing/scripts/sync-customers-from-advance.mjs --station=HYD
```

Or via API after login:

- `POST /billing/service-catalog/seed`
- `POST /billing/customers/sync-from-advance`

## 4. Enable native billing (cutover)

1. `/billing/cutover` → enable native billing / start parallel run
2. `/billing/parallel-run` → weekly snapshots
3. `/billing/decommission` → after BC read-only phase

## 5. Production (Cloudflare Workers)

- All API calls use `/api-backend/billing/*` (existing proxy route)
- Do **not** add `next.config` rewrites for `/api-backend`
- Verify JSON responses are uncompressed in Workers preview

## Troubleshooting

| Issue | Fix |
|-------|-----|
| 403 on billing API | Grant **Advance → Invoicing** in admin permissions |
| Billing nav hidden | Same as above for panel users; managers/superadmins see Billing by role |
| Empty dashboard | Run seed scripts; confirm `MONGO_URI` matches FRIS data |
| Module not found | Re-run `integrate-fris.mjs` and restart `server` |
