# DEL August 2026 SKD FHR seed

Seeds **Delhi (`DEL`)** scheduled flights from the schema-key SKD export
workbook into form collections + `fhr_collection`.

| Source | Value |
|--------|--------|
| Workbook | `BWMS/apps/api/data/DEL-AUG-2026-SKD-FLIGHTS.xlsx` |
| Sheet | `Customers` |
| Rows | 2,321 flights (serials 211671–213993) |
| STA window | 31/07/2026 – 31/08/2026 (includes overnight STA=31/07) |
| Station | **DEL** (stamped on every upsert) |

Row-1 headers are already `fhr_collection` / form schema keys (`SerialNo`,
`Airline`, `STADate`, `STATime`, …). Combined Excel datetime serials on
schedule / IPOS / cancel / RESKD pairs are split into **date** and **time**
before write. Residual + dropped delay columns land in `workbookExtras`.

This workbook is **flights-only**. GSE / Teams reports list the same DEL
flights from `fhr_collection`. Equipment / manpower / services come from
`DEL-EQP-DATA-AUG-2026.xls` via `npm run seed:del-aug-equipment:import`
(see `SEED_DEL_AUG_EQUIPMENT.md`).

## Commands

From `BWMS/apps/api` with `MONGO_URI` in `.env`:

```bash
npm run seed:del-aug-fhr:dry-run
npm run seed:del-aug-fhr:import
npm run rebuild:dashboard-aggregates -- --from 2026-08-01 --to 2026-08-31 --station DEL --mode 4h --bust-cache
```

## Surfaces after seed

- Dashboard (DEL, Aug 2026) — after aggregate rebuild
- Flights → Scheduled airlines
- FHR / GSE / Team reports — flight headers from `fhr_collection`
- Billing billed sources (ADS / BHS / RAF / equipment / manpower) — same FHR rows, station-scoped
