# MAA August 2026 RAF seed

Seeds **Chennai (`MAA`)** RAF flights + equipment usage from the chargeable RAF
export into:

| Target | Role |
|--------|------|
| `creation-raf` | Flights → RAF tab |
| `raf_collection` | Equipment / manpower / cleaning (moved off fhr_collection) |
| `advance-raf-airline` | Airline eligibility for billing Customer filter |

| Source | Value |
|--------|--------|
| Workbook | `BWMS/apps/api/data/raf_maa_august_2026.xlsx` |
| Sheet | `Sheet1` |
| Rows | 23 equipment lines / 8 Excel serials (522–529) |
| STD window | 01/08/2026 – 31/08/2026 |
| Station | **MAA** (stamped on every upsert) |
| Equipment | All `RC` in this export |

> HTML table dumps named `raf_maa_august_2026.xls` are **not** real Excel — convert
> first: `node scripts/convert-raf-maa-aug-html.js` (from `BWMS/apps/api`).

## Commands

From `BWMS/apps/api` with `MONGO_URI` in `.env`:

```bash
# 1. Dry-run (no writes)
npm run seed:maa-raf-aug:dry-run

# 2. Import into MongoDB (MAA stationCode)
npm run seed:maa-raf-aug:import
```

## Verify

```js
db.getCollection('creation-raf').countDocuments({
  stationCode: 'MAA',
  $or: [
    { operationDate: /\/08\/2026$/ },
    { date: /\/08\/2026$/ },
  ],
})

db.getCollection('raf_collection').countDocuments({
  stationCode: 'MAA',
  'rafAdhocDetails.services.0': { $exists: true },
})
```

## Surfaces

- FRIS → Flights → RAF
- Advance → RAF Airline (airline master for those flights)
- Billing → Sources → RAF (set date window to Aug 2026)
