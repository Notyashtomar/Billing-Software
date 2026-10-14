# MAA flat FHR seed (Apr–Jun 2026 workbook)

Seeds **Chennai (`MAA`)** FHR operational data from a **single-sheet** Excel file whose row-1 headers are canonical schema keys (`slNo`, `staDate`, `bayPlanned`, …).

Writes to:

| Module | Collection | `fhr_collection` embed |
|--------|------------|---------------------------|
| Main | `mainDetails` | `mainDetails` |
| Terminal | `terminalDetails` | `terminalDetails` |
| Ramp | `rampDetails1` | `rampDetails1` |
| Load control | `loadControlDetails` | `loadControlDetails` |
| Remarks | `remarks` | `remarks` |

Each upsert **mirrors** into `fhr_collection` for the same `SerialNo` / `slNo`.

## Workbook

- File: `server/data/seedingof3months.xlsx` (default; override with a path argument)
- Sheet: `Sheet1` (default)
- ~2343 rows, serials from `slNo`, STA dates Apr–Jun 2026
- Station: **MAA** (fixed in importer)

### Delay columns

| Column | Stored as |
|--------|-----------|
| `reasonOfDelay` | Single text field with **delay code + reason** → `mainDetails.arrivalDelays[].ReasonofDelay` and/or `departureDelays[].ReasonofDelay` |
| `arrivalDelay` | `Delay` in `arrivalDelays[]` + `ActualDelay` |
| `departureDelay` | `Delay` in `departureDelays[]` (if present) |
| `delay` | `mainDetails.departureStatus` |
| `delay1`, `delay2`, `delay3`, `delaycode2`, `delaycode3` | **Ignored** — do not use |

### Header aliases (auto-normalized)

| Excel header | Normalized to |
|--------------|---------------|
| `ETDdate` | `etdDate` |
| `mtow` | `MTOW` |

## Commands

From `server/` with `MONGO_URI` in `.env`:

```bash
# 1. Dry-run (no writes) — uses server/data/seedingof3months.xlsx
npm run seed:maa-fhr:dry-run

# 2. Import Apr–Jun 2026 into MongoDB (MAA → fhr_collection)
npm run seed:maa-fhr:import

# 3. Backfill indexed STA dates on fhr_collection (required for scheduled-airlines / dashboard date filters)
npm run backfill:staDates
```

Optional overrides (still from `server/`):

```bash
npm run seed:maa-fhr -- --dry-run --from=2026-04-01 --to=2026-06-30
npm run seed:maa-fhr -- data/seedingof3months.xlsx --from=2026-04-01 --to=2026-06-30
```

## CLI options

| Flag | Description |
|------|-------------|
| `--dry-run` | Validate only |
| `--from=YYYY-MM-DD` | Include rows whose `staDate` (or `stdDate`) ≥ this |
| `--to=YYYY-MM-DD` | Include rows whose `staDate` (or `stdDate`) ≤ this |
| `--sheet=Sheet1` | Worksheet name |
| `--only-serials=a,b,c` | Only import these `slNo` values — **bypasses the STA date filter** for them |

## Re-seeding rows skipped by the STA date window

`rowStaDateInRange` (in `maa-flat-import.util.ts`) filters on `staDate` first, falling back to `stdDate` only when `staDate` is blank. Overnight/midnight-crossing turnarounds that **arrive** the night before the window starts (e.g. `staDate` = `31/03/2026`) get excluded even though their `stdDate` (and most of their ground-handling activity) falls inside the window.

To re-seed just those rows without touching anything else, use `--only-serials` (matches on `slNo`, ignores `--from`/`--to` entirely for the listed rows):

```bash
npm run seed:maa-fhr -- --dry-run --only-serials=17632,17655,17656,17658,17659,17661,17665,17788
npm run seed:maa-fhr -- --only-serials=17632,17655,17656,17658,17659,17661,17665,17788
```

Convenience scripts for the 8 flights skipped in the Apr–Jun 2026 seed (`staDate` 30/31 Mar 2026, `stdDate` 01–05 Apr 2026):

```bash
npm run seed:maa-fhr:missed-mar31:dry-run
npm run seed:maa-fhr:missed-mar31:import
```

## Verify after import

```bash
# In mongosh — expect MAA station + Apr–Jun staDates
db.fhr_collection.countDocuments({ stationCode: "MAA", staDates: { $gte: "01/04/2026", $lte: "30/06/2026" } })
```

## Related

- Two-sheet March import: `npm run import:maa` + `README.md` in this folder
- Main-details-only reseed: `reseed-fhr-main-details.cli.ts`
