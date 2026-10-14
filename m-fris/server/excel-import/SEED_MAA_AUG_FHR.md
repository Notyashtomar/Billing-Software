# MAA August 2026 SKD FHR seed

Seeds **Chennai (`MAA`)** scheduled flights from the full FHR schema-key workbook
into form collections + `fhr_collection`.

| Source | Value |
|--------|--------|
| Workbook | `BWMS/apps/api/data/aug_maa_skd_flights_2026.xlsx` |
| Sheet | `Customers` |
| Rows | 660 flights (serials 20607–21266) |
| STA window | 31/07/2026 – 31/08/2026 (overnight Jul 31 included) |
| Station | **MAA** (stamped on every upsert) |

Uses the **flat schema-key** importer (`MaaExcelImportService.importFlatSheetFromFilePath`)
— row-1 headers match FHR / form schema names (`SerialNo`, `Airline`, `STADate`, …).
Only matching headers are written; unrelated export columns are left unmapped.
Does **not** skip complete FHR rows — every valid workbook row is upserted.

## Commands

From `BWMS/apps/api` with `MONGO_URI` in `.env`:

```bash
# 1. Dry-run (no writes)
npm run seed:maa-aug-fhr:dry-run

# 2. Import into MongoDB (MAA → fhr_collection)
npm run seed:maa-aug-fhr:import

# 3. Seed equipment onto matching Serial Numbers (MAA Aug GSE)
npm run seed:equipment-aug:dry-run
npm run seed:equipment-aug:import

# 4. Rebuild dashboard aggregates for August (scheduled)
npm run rebuild:dashboard-aggregates -- --from 2026-08-01 --to 2026-08-31 --station MAA --mode 4h --bust-cache
```

Equipment workbook: `data/equip-data-aug-maa-2026.xlsx` (~13,305 lines /
637 flights, serials 20607–21266). See `SEED_SCHEDULED_EQUIPMENT.md`.

## Verify

```js
db.fhr_collection.countDocuments({
  stationCode: 'MAA',
  SerialNo: { $gte: 20607, $lte: 21266 },
})
// expect 660

db.fhr_collection.countDocuments({
  stationCode: 'MAA',
  SerialNo: { $gte: 20607, $lte: 21266 },
  'equipmentDetails.0': { $exists: true },
})
// expect 637 after equipment seed

db.fhr_collection.findOne(
  { stationCode: 'MAA', SerialNo: 20633 },
  { SerialNo: 1, stationCode: 1, 'mainDetails.Airline': 1, 'mainDetails.FlightNo': 1, staDates: 1, equipmentDetails: 1 },
)
```

## Surfaces after seed

- Dashboard (MAA, Aug 2026) — after aggregate rebuild
- Flights → Scheduled airlines — live from `fhr_collection` / form embeds
- GSE / Team reports — read `fhr_collection.equipmentDetails` (split GSE vs manpower at read time)
- Billing → ADS / Equipment / Manpower — live from same FHR equipment lines (default window Aug 2026)
- Billing scheduled sources — reads `fhr_collection` for MAA
