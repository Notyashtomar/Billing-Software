# IXC (Chandigarh) May–June scheduled equipment seed

Seeds `fhr_collection.equipmentDetails[]` for **Chandigarh (`IXC`)** from the GSE export workbook. Only writes equipment lines — flight/FHR docs must already exist (`npm run seed:ixc-fhr:import`).

## Behaviour

| Step | Detail |
|------|--------|
| Match key | `Serial Number` → `fhr_collection.SerialNo` **scoped to `stationCode: IXC`** |
| Verify | `Flight No`, Customer, STD/ATD Date, Route, Type Craft, Category (warnings only) |
| Equipment name | Excel `Equipment No` short codes expanded to **full forms** via `IXC_EQUIPMENT_SEED` (e.g. `BT` → `Baggage Trollies`) |
| Date window | Default STD Date **2026-05-01 … 2026-06-30** (workbook may contain July rows — those are skipped) |
| Write mode | Replace `equipmentDetails` per flight (use `--append` to merge) |

Rows outside the date window never touch MongoDB. Flights only appear for users logged into Chandigarh because lookup/upsert is station-scoped to `IXC`.

## Workbook

- File: `server/data/ixc-equipment-data-may-june-2026.xlsb` (default)
- Sheet: `Sheet2`
- ~4,727 rows / ~310 distinct serials (full file); May–June subset after date filter

## Commands

From `server/` with `MONGO_URI` in `.env`:

```bash
# 1. Dry-run (no writes)
npm run seed:ixc-fhr-equipment:dry-run

# 2. Import into MongoDB (IXC → fhr_collection.equipmentDetails)
npm run seed:ixc-fhr-equipment:import
```

Optional overrides:

```bash
npm run seed:ixc-fhr-equipment -- --dry-run --from=2026-05-01 --to=2026-06-30
npm run seed:ixc-fhr-equipment -- data/ixc-equipment-data-may-june-2026.xlsb --dry-run
npm run seed:ixc-fhr-equipment -- --dry-run --only-serials=11322,11326
```

## Prerequisites

1. IXC FHR flights seeded: `npm run seed:ixc-fhr:import`
2. (Recommended) IXC equipment master catalog: `npm run seed:ixc-equipment`

## Verify after import

```js
db.fhr_collection.countDocuments({
  stationCode: 'IXC',
  'equipmentDetails.0': { $exists: true },
})

db.fhr_collection.findOne(
  { stationCode: 'IXC', SerialNo: 11322 },
  { SerialNo: 1, stationCode: 1, 'equipmentDetails.equipment_name': 1 },
)
```

## Related

- Flight/FHR seed: `SEED_IXC_FHR.md`
- MAA scheduled equipment (abbr codes, no station filter): `SEED_SCHEDULED_EQUIPMENT.md`
- Equipment schema: `fhr-collection/schema/fhr-equipment-detail-item.schema.ts`
- IXC name map: `excel-import/ixc-equipment-name-map.ts`
