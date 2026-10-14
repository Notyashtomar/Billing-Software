# DEL August 2026 scheduled equipment seed

Seeds `fhr_collection.equipmentDetails[]` for **Delhi (`DEL`)** from the
scheduled GSE export workbook. Only writes equipment / manpower / service
lines — flight/FHR docs must already exist (`npm run seed:del-aug-fhr:import`).
Lookups are scoped to `stationCode: DEL`; serials not present at DEL are
skipped (no bare-flight create).

| Source | Value |
|--------|--------|
| Workbook | `BWMS/apps/api/data/DEL-EQP-DATA-AUG-2026.xls` |
| Sheet | `Sheet1` |
| Rows | ~25,895 equipment lines / ~2,226 distinct serials |
| STD window | 31/07/2026 – 31/08/2026 (overnight STD=31/07 included) |
| Station | **DEL** (lookup + upsert scope) |

Uses `ScheduledEquipmentImportService` (same column mapping as MAA/HYD).
Written fields: `equipment_name` (billing **full form**), `equipment_quantity`,
`from_date` / `from_time`, `to_date` / `to_time`, `usage_time`, `remarks`.
Match-only columns (Customer, Flight No, STD/ATD, Route, Type Craft, Category)
are verified as warnings and never overwrite FHR main/terminal/ramp data.

## Commands

From `BWMS/apps/api` with `MONGO_URI` in `.env`:

```bash
# 0. Prerequisite — DEL Aug FHR must already be seeded
npm run seed:del-aug-fhr:import

# 1. Dry-run (no writes)
npm run seed:del-aug-equipment:dry-run

# 2. Import into MongoDB (DEL → fhr_collection.equipmentDetails)
npm run seed:del-aug-equipment:import
```

Optional:

```bash
npm run seed:del-aug-equipment -- --dry-run --only-serials=211678,211671
npm run seed:del-aug-equipment -- data/DEL-EQP-DATA-AUG-2026.xls --dry-run
```

## Surfaces after seed

- Flights → Scheduled → GSE report — `equipmentDetails` split GSE vs manpower
- Billing → ADS / Equipment / Manpower — DEL is FHR-backed (same path as MAA/HYD)

## Related

- Flight/FHR seed: `SEED_DEL_AUG_FHR.md`
- Name map: `m-platform/server/common/billing-trackable-equipment-name.ts`
