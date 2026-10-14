# HYD August 2026 RAF seed

Seeds **Hyderabad (`HYD`)** RAF flights + equipment usage into:

| Target | Role |
|--------|------|
| `creation-raf` | Flights → RAF tab |
| `fhr_collection.rafAdhocDetails` | Equipment lines (Billing → Sources → RAF) |
| `advance-raf-airline` | Airline eligibility for billing Customer filter |

| Source | Value |
|--------|--------|
| Workbook | `BWMS/apps/api/data/raf_hyd_aug_2026.xlsx` |
| Sheet | `Sheet1` |
| Rows | 7 equipment lines / 7 Excel serials (1832–1838) after HTML dedupe |
| STD window | 01/08/2026 – 31/08/2026 |
| Station | **HYD** |
| Equipment | `PAX COACH` → catalog `RAF - Equipment - PAX Coach` |

> HTML table dumps named `raf_hyd_aug_2026.xls` are **not** real Excel — convert
> first: `node scripts/convert-raf-hyd-aug-html.js` (from `BWMS/apps/api`).

## Commands

From `BWMS/apps/api` with `MONGO_URI` in `.env`:

```bash
# 0. Convert HTML → xlsx (once)
node scripts/convert-raf-hyd-aug-html.js

# 1. Dry-run (no writes)
npm run seed:hyd-raf-aug:dry-run

# 2. Import into MongoDB (HYD stationCode)
npm run seed:hyd-raf-aug:import
```

## Verify

```js
db.getCollection('creation-raf').countDocuments({
  stationCode: 'HYD',
  $or: [
    { operationDate: /\/08\/2026$/ },
    { date: /\/08\/2026$/ },
  ],
})
// expect 7

db.fhr_collection.countDocuments({
  stationCode: 'HYD',
  'rafAdhocDetails.services.0': { $exists: true },
  'rafAdhocDetails.services.equipmentCode': /PAX Coach/i,
})
```

## Surfaces

- FRIS → Flights → RAF (HYD)
- Billing → Sources → RAF (date window Aug 2026, station HYD) — PAX Coach lines
