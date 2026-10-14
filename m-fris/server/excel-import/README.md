# MAA March Excel → MongoDB import

Imports **Sheet1** (row data) using **Sheet2** (column 1 = form hint, column 2 = label, column 3 = **schema key**) into existing FRIS collections:

| Module            | Collection / service        |
|-------------------|-----------------------------|
| Main details      | `mainDetails`               |
| Terminal details  | `terminalDetails`           |
| Ramp (section 1)  | `rampDetails1`              |
| Load control      | `loadControlDetails`        |
| Remarks           | `remarks`                   |

**Primary key:** flight serial **`slNo`** (numeric), aligned with `flightSerialNumber` / `serialNo` in services (`upsertBySerial`).

**FHR / reports:** This workbook holds **operational** fields used by FHR UIs/PDFs. Those values belong in the collections above. The `reports` collection only stores **report metadata** (viewed/signature), not Excel columns—do not route spreadsheet cells there.

**Unmapped Sheet2 keys (summary):**

- **`mtow`** — no operational collection in FRIS for this field; not written.
- **`flightCode`** (Sheet2 “airline code”) — FRIS uses **`flightNo`** as the flight identifier on main/terminal; the short IATA-style code from Excel is intentionally not written to avoid overwriting `mainDetails.flightCode` (which stores the full flight number in this app).

## HTTP API

```http
POST /import/maa-march?dryRun=true
Content-Type: multipart/form-data

file=<binary .xlsx>
```

- **`dryRun=true`:** Parses and validates; returns summary **without** writing to MongoDB.
- **`dryRun=false` (default):** Upserts each flight across the five modules.

## CLI

From `server/` after compile:

```bash
npm run build
node dist/excel-import/import-maa-cli.js "C:/path/to/maa_march.xlsx" --dry-run
node dist/excel-import/import-maa-cli.js "C:/path/to/maa_march.xlsx"
```

Requires `MONGO_URI` (and optional `PORT` unrelated to import) in `.env`.

## Behaviour notes

- **Idempotent:** Re-running the same file overwrites the same `slNo` documents via upsert.
- **Dates/times:** Preserves common FRIS string formats (`dd/MM/yyyy`, `HH:mm`). Excel serial dates are normalized when detected.
- **Blank cells:** Treated as empty strings; `"null"` / `"undefined"` literals are cleared.
- **Remarks:** Uses `RemarksService.mergeForSpreadsheetImport` so inserts get default `airlineRemarksRating` + `flightStaDateIso` (from STA date when possible).

## Extending the mapping

1. Update **Sheet2** with new rows (schema key must match Mongoose paths).
2. If a new key applies to schedule/routing for all ops forms, add an entry in `augmentKeyToModulesForSheet1` in `maa-excel-mapping.ts`.
3. If the key targets a **new collection**, wire a new service upsert in `maa-excel-import.service.ts` and extend `ImportTarget` + whitelist sets.
