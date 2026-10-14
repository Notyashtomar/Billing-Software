# IXC (Chandigarh) May–June FHR seed

Seeds **Chandigarh (`IXC`)** scheduled FHR operational data from
`server/data/Chandigarh_may-june-skd-flights.xlsx`.

July 2026 seed uses `server/data/maa-ixc-july-data.xlsx` (sheet `ixc`) — see
**July seed** below.

Writes to form collections and mirrors into `fhr_collection` with
`stationCode: IXC` so flights only appear when logged into Chandigarh.

## Workbook layout (`Sheet1 (2)`)

| Row | Role |
|-----|------|
| 3 | Canonical schema keys (`slNo`, `staDate`, `bayPlanned`, …) |
| 5 | Display headers (`SerialNo`, `STADate`, …) |
| 6+ | Flight data (~265 May–June 2026 rows) |

## Commands

From `server/` with `MONGO_URI` in `.env`:

```bash
# Dry-run (no writes)
npm run seed:ixc-fhr:dry-run

# Import May–June 2026 → fhr_collection (IXC)
npm run seed:ixc-fhr:import
```

Optional:

```bash
npm run seed:ixc-fhr -- --dry-run --from=2026-05-01 --to=2026-06-30
npm run seed:ixc-fhr -- data/Chandigarh_may-june-skd-flights.xlsx --sheet="Sheet1 (2)"
```

## July 2026 seed (`maa-ixc-july-data.xlsx`, sheet `ixc`)

| Row | Role |
|-----|------|
| 3 | Canonical schema keys |
| 2 | Display headers (fallback when schema cell blank) |
| 6+ | July 2026 flight data (~63 rows, serials 11588–11658) |

Matching serials that already have complete operational FHR embeds in
`fhr_collection` (`stationCode: IXC`) are skipped. New serials are upserted
into form collections and mirrored into `fhr_collection`.

```bash
npm run seed:ixc-fhr-july:dry-run
npm run seed:ixc-fhr-july:import
```

## Verify

```js
db.fhr_collection.countDocuments({ stationCode: "IXC", staDates: /07\/2026/ })
db.fhr_collection.findOne(
  { stationCode: "IXC", SerialNo: 11588 },
  { SerialNo: 1, stationCode: 1, staDates: 1, "mainDetails.Airline": 1, "terminalDetails.STADate": 1 }
)
```

Log into FRIS as **Chandigarh (IXC)**, open **Scheduled Airlines → Flights**, filter **July 2026**.
