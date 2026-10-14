# HYD August 2026 SKD FHR seed

Seeds **Hyderabad (`HYD`)** scheduled flights from the schema-key SKD export
workbook into form collections + `fhr_collection`.

| Source | Value |
|--------|--------|
| Workbook | `BWMS/apps/api/data/hyd_aug_skd_flights_2026.xlsx` |
| Sheet | `Customers` |
| Rows | 600 flights (serials 29928–30530) |
| STA window | 31/07/2026 – 31/08/2026 (includes overnight STA=31/07 STD=01/08) |
| Station | **HYD** (stamped on every upsert) |

Uses `MaaExcelImportService.importFlatSheetFromFilePath` (row-1 schema keys:
`SerialNo`, `Airline`, `STADate`, …). Does **not** skip complete FHR rows —
every valid workbook row is upserted. After import, `staDates` are reindexed
for scheduled / dashboard / billing date filters.

## Commands

From `BWMS/apps/api` with `MONGO_URI` in `.env`:

```bash
# 1. Dry-run (no writes)
npm run seed:hyd-aug-fhr:dry-run

# 2. Import into MongoDB (HYD → fhr_collection)
npm run seed:hyd-aug-fhr:import

# 3. Seed equipment onto matching Serial Numbers (HYD Aug GSE)
npm run seed:hyd-aug-equipment:dry-run
npm run seed:hyd-aug-equipment:import

# 4. Rebuild dashboard aggregates for August (scheduled)
npm run rebuild:dashboard-aggregates -- --from 2026-08-01 --to 2026-08-31 --station HYD --mode 4h --bust-cache
```

Equipment workbook: `data/hyd_aug_eqp_data_2026.xls` (~7,448 lines /
~521 flights). See `SEED_HYD_AUG_EQUIPMENT.md`.

## Verify

```js
db.fhr_collection.countDocuments({
  stationCode: 'HYD',
  SerialNo: { $gte: 29928, $lte: 30530 },
})
// expect ≥ 600 (all workbook serials; may include a few pre-existing HYD rows)

db.fhr_collection.findOne(
  { stationCode: 'HYD', SerialNo: 29928 },
  { SerialNo: 1, stationCode: 1, 'mainDetails.Airline': 1, staDates: 1 },
)

// Overnight edge row (STA 31/07, STD 01/08)
db.fhr_collection.findOne(
  { stationCode: 'HYD', SerialNo: 29941 },
  { SerialNo: 1, stationCode: 1, 'mainDetails.STADate': 1, 'mainDetails.STDDate': 1, staDates: 1 },
)

// After equipment seed
db.fhr_collection.countDocuments({
  stationCode: 'HYD',
  SerialNo: { $gte: 29922, $lte: 30529 },
  'equipmentDetails.0': { $exists: true },
})
```

## Surfaces after seed

- Dashboard (HYD, Aug 2026) — after aggregate rebuild
- Flights → Scheduled airlines — live from `fhr_collection` / form embeds
- FHR report — reads `fhr_collection` for HYD
- Billing → ADS / BHS — live from same FHR rows (station-scoped; HYD not excel-only)
- GSE / Team reports — after `seed:hyd-aug-equipment:import` (reads `equipmentDetails`)
- Billing → ADS / Equipment / Manpower — FHR-backed for HYD (same path as MAA)
- Billing → RAF — lists HYD FHR flights; cleaning/RAF lines need RAF seed when available

## Notes

- Workbook uses **schema-key** headers (`SerialNo`, `STADate`, …), not display headers — do not run through `HydJulyFhrSeedService`.
- Transient `flightSerialNumber` unique-index warnings during mirror are OK when later form upserts complete the `fhr_collection` doc (verify count = 600 workbook serials).
