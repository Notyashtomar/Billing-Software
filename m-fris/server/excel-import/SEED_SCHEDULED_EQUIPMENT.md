# Scheduled equipment seed (MAA)

Seeds `fhr_collection.equipmentDetails[]` for **Chennai (`MAA`)** from the "Scheduled data export → GSE report" workbook. Unlike `seed:maa-fhr`, this **only writes equipment lines** — it expects the flight/FHR document (`mainDetails`, `terminalDetails`, `rampDetails1`, …) to already exist for the `Serial Number`. Lookups are scoped to `stationCode: MAA`.

## Column mapping

| Excel header | Canonical field | Written to |
|---|---|---|
| `Serial Number` | `serialNo` | `SerialNo` — match key, selects the `fhr_collection` doc |
| `Customer Name` | `customerName` | *(match/verify only)* vs `mainDetails.Airline` |
| `Customer Code` | `customerCode` | *(match/verify only)* vs `mainDetails.Arline_Code` |
| `Flight No` | `flightNo` | *(match/verify only)* vs `terminalDetails.FlightNo` |
| `STD Date` | `stdDate` | *(match/verify only)* vs `terminalDetails.STDDate` / `rampDetails1.STDDate` |
| `ATD Date` | `atdDate` | *(match/verify only)* vs `mainDetails.ATDDate` |
| `Equipment No` | `equipmentNo` | **`equipmentDetails[].equipment_name`** |
| `Quantity` | `quantity` | **`equipmentDetails[].equipment_quantity`** |
| `Route` | `route` | *(match/verify only)* vs `mainDetails.Route` / `rampDetails1.Route` |
| `Usages Time` | `usageTime` | **`equipmentDetails[].usage_time`** (`HH:mm`) |
| `From Date` | `fromDateRaw` | **`equipmentDetails[].from_date` + `from_time`** |
| `To date` | `toDateRaw` | **`equipmentDetails[].to_date` + `to_time`** |
| `Remarks` | `remarks` | **`equipmentDetails[].remarks`** |
| `Type Craft` | `typeCraft` | *(match/verify only)* vs `mainDetails.TypeCraft` |
| `Category Of Flight` | `categoryOfFlight` | *(match/verify only)* vs `mainDetails.Cate_of_Flight` |

`Unit Type` and `Weight` are not written anywhere — `FhrEquipmentDetailItem` has no field for either. `unit_type` is resolved at read time from the shared `equipmentManpower.catalogItems[]` master list, keyed off `equipment_name` (the `Equipment No` abbreviation, e.g. `C`, `BT`, `ACU`).

Match/verify-only fields are **never written**; they're only used to sanity-check that a Excel row's parent flight (Customer/Flight/Date/Route/Type Craft/Category) lines up with the already-seeded `fhr_collection` doc for that `Serial Number`, and to surface mismatches as warnings.

## Workbooks

| Profile | File | Sheet | STD Date window |
|---|---|---|---|
| `apr-jun` (default) | `data/maa-equipment-april-june.xlsx` | `Sheet1` | all |
| `july` | `data/maa-ixc-gse-july.xlsb` | `maa-gse` | 2026-07-01 … 2026-07-31 |
| `july-31` | `data/maa-31st-july-equip_data.xlsb` | `Recovered_Sheet1` | 2026-07-31 |
| `aug` | `data/equip-data-aug-maa-2026.xlsx` | `Sheet1` | 2026-08-01 … 2026-08-31 |

Apr–Jun: ~43,997 rows across ~2,266 distinct flights (`Serial Number` 17632–19977).  
July 31: ~430 rows across 20 flights (`Serial Number` 20587–20606).  
August: ~13,305 rows across 637 distinct flights (`Serial Number` 20607–21266) — matches Aug SKD FHR seed serial window.

### Known data quirks (confirmed via dry-run against production)

- **`Customer Code` mismatch warnings on every row are expected and harmless.** The MAA flat-FHR importer stores the *flight number* (e.g. `SG458/9458`) in `mainDetails.Arline_Code`, not a 2-letter airline code — so the Excel's `SG`/`EK`/`IX` never matches. This is a pre-existing quirk in how `mainDetails` was seeded, not a problem with the equipment data itself.
- **`equipmentDetails` is replaced per flight by default**, not merged. ~1,008 of the ~2,266 target flights already carry a placeholder equipment list (`{ACU, PBNB}` on 912 flights, `{AMB}` on 96 flights) — confirmed to be generic default stubs, not real per-flight GSE data. The Excel import is the authoritative, detailed source and is expected to overwrite these stubs. Use `--append` only if you specifically want to keep pre-existing lines alongside the new ones.
- A couple of rows have a genuine 1-day `STD Date` drift vs. the seeded flight (e.g. serials `19030`, `19036`); these are recorded as warnings, not blocked.
- **No column is required to write a row.** Every field on `FhrEquipmentDetailItem` defaults to `''` in the schema — a row with a blank `Equipment No` (e.g. a flight-level summary/total row like `"16:09 A-01 // D- 01"` in `Remarks`) is still written, just with an empty `equipment_name`. The only thing that can skip a row is a missing/invalid `Serial Number` (there's no flight to attach it to), or the flight itself not existing yet (see `--allow-create-flight`).
- **August source file:** Excel “Web Page” / frameset exports named `equip-data-aug-maa-2026.xls` are **not** real workbooks (tiny HTML shell + companion `*_files/sheet001.htm`). Convert the HTML table to `data/equip-data-aug-maa-2026.xlsx` before seeding. Aug dry-run against seeded FHR: **0** missing serials, **0** row errors (Customer Code mismatches are absent on this SKD-seeded set).

## Commands

From `server/` with `MONGO_URI` in `.env`:

```bash
# Apr–Jun
npm run seed:equipment:dry-run
npm run seed:equipment:import

# 31 Jul 2026 (MAA only — match existing Serial Numbers)
npm run seed:equipment-july31:dry-run
npm run seed:equipment-july31:import

# Aug 2026 (MAA — match existing Serial Numbers from seed:maa-aug-fhr)
npm run seed:equipment-aug:dry-run
npm run seed:equipment-aug:import
```

Optional overrides (still from `BWMS/apps/api/`):

```bash
npm run seed:equipment -- --dry-run --sheet=Sheet1
npm run seed:equipment -- data/other-workbook.xlsx --dry-run
npm run seed:equipment -- --july-31 --dry-run
npm run seed:equipment -- --aug --dry-run
npm run seed:equipment -- --dry-run --only-serials=17632,17655
```

## CLI options

| Flag | Description |
|------|-------------|
| `--dry-run` | Validate + build lines only (no MongoDB writes); still reads existing docs to report mismatches/missing flights |
| `--sheet=Sheet1` | Worksheet name (default: `Sheet1` or first tab) |
| `--append` | Merge onto whatever `equipmentDetails` already exists instead of replacing it per flight (de-duplicated on `equipment_name` + `from/to` date-time) |
| `--strict` | Skip (not just warn on) flights whose Customer/Flight/Date/Route/Type Craft/Category mismatch the existing flight |
| `--allow-create-flight` | Create a bare `fhr_collection` doc when `Serial Number` has no existing flight (off by default — this seed assumes flights are already seeded) |
| `--station=MAA` | Station used for Serial Number lookup (and create when `--allow-create-flight`) |
| `--profile=july-31` / `--july-31` | 31 Jul 2026 MAA workbook defaults |
| `--profile=aug` / `--aug` | Aug 2026 MAA workbook defaults (`equip-data-aug-maa-2026.xlsx`) |
| `--only-serials=a,b,c` | Only import these `Serial Number` values |

## Verify after import

```bash
# In mongosh — spot-check one flight's equipment lines
db.fhr_collection.findOne({ SerialNo: 17632 }, { equipmentDetails: 1 })

# Count flights in range now carrying equipment lines
db.fhr_collection.countDocuments({ SerialNo: { $gte: 17632, $lte: 19977 }, "equipmentDetails.0": { $exists: true } })
```

## Related

- Flight/FHR seed (must run first): `SEED_MAA_FHR.md`
- Equipment schema: `fhr-collection/schema/fhr-equipment-detail-item.schema.ts`
- Equipment catalog (`unit_type` resolution): `equipment-manpower/schema/equipment-manpower-catalog-item.schema.ts`
