# HYD August 2026 scheduled equipment seed

Seeds `fhr_collection.equipmentDetails[]` for **Hyderabad (`HYD`)** from the
scheduled GSE export workbook. Only writes equipment lines — flight/FHR docs
must already exist (`npm run seed:hyd-aug-fhr:import`). Lookups are scoped to
`stationCode: HYD`; serials not present at HYD are skipped (no bare-flight create).

| Source | Value |
|--------|--------|
| Workbook | `BWMS/apps/api/data/hyd_aug_eqp_data_2026.xls` |
| Sheet | `Sheet1` |
| Rows | ~7,448 equipment lines / ~521 distinct serials (29922–30529) |
| STD window | 31/07/2026 – 31/08/2026 (overnight STD=31/07 included) |
| Station | **HYD** (lookup + upsert scope) |
| Expected skip | Serial **29922** (9 lines) — not in HYD Aug FHR seed window (29928–30530) |

Uses `ScheduledEquipmentImportService` (same column mapping as MAA scheduled
equipment). Written fields: `equipment_name`, `equipment_quantity`,
`from_date` / `from_time`, `to_date` / `to_time`, `usage_time`, `remarks`.
Match-only columns (Customer, Flight No, STD/ATD, Route, Type Craft, Category)
are verified as warnings and never overwrite FHR main/terminal/ramp data.
`Unit Type`, `Weight`, Registration, and Report* columns have no
`FhrEquipmentDetailItem` fields — left unmapped (same as MAA).

Dry-run against seeded HYD FHR: **520** flights / **7,439** equipment lines,
**0** mismatch warnings, **1** skipped serial (29922).

## Commands

From `BWMS/apps/api` with `MONGO_URI` in `.env`:

```bash
# 0. Prerequisite — HYD Aug FHR must already be seeded
npm run seed:hyd-aug-fhr:import

# 1. Dry-run (no writes)
npm run seed:hyd-aug-equipment:dry-run

# 2. Import into MongoDB (HYD → fhr_collection.equipmentDetails)
npm run seed:hyd-aug-equipment:import
```

Optional:

```bash
npm run seed:hyd-aug-equipment -- --dry-run --only-serials=29928,29941
npm run seed:hyd-aug-equipment -- data/hyd_aug_eqp_data_2026.xls --dry-run
```

## Verify

```js
db.fhr_collection.countDocuments({
  stationCode: 'HYD',
  SerialNo: { $gte: 29922, $lte: 30529 },
  'equipmentDetails.0': { $exists: true },
})

db.fhr_collection.findOne(
  { stationCode: 'HYD', SerialNo: 29928 },
  {
    SerialNo: 1,
    stationCode: 1,
    'equipmentDetails.equipment_name': 1,
    'equipmentDetails.equipment_quantity': 1,
    'equipmentDetails.usage_time': 1,
    'equipmentDetails.from_date': 1,
    'equipmentDetails.to_date': 1,
  },
)
```

## Surfaces after seed

- GSE / Team reports — read `fhr_collection.equipmentDetails` (split GSE vs manpower at read time)
- Billing → ADS / Equipment / Manpower — HYD is FHR-backed (same path as MAA; not `ads_usage_data`)

## Related

- Flight/FHR seed: `SEED_HYD_AUG_FHR.md`
- MAA scheduled equipment: `SEED_SCHEDULED_EQUIPMENT.md`
- Equipment schema: `fhr-collection/schema/fhr-equipment-detail-item.schema.ts`
