# Data-Saving Inconsistency Audit

**Scope:** NestJS backend (`server/src`, `server/scripts`)  
**Date:** 2026-07-27  
**Method:** Static code evidence only — controller → DTO → service → transformation → Mongoose → MongoDB  
**Constraint:** No code changes, migrations, or fixes in this pass  

Cross-links: `SERVER_ISSUES_AND_REMEDIATION.md` (AUD-C01, AUD-H05, §24–§28, §34, §47), `src/billing/BHS_ADS_BILLING_ARCHITECTURE.md` (billing write semantics).

---

## Executive summary

```text
Critical:                    7
High:                        7
Medium:                      6
Low:                         3
Needs runtime verification:  5
```

| Confidence bucket | Count |
|---|---:|
| Confirmed | 18 |
| Likely | 3 |
| Needs runtime / DB verification | 5 |
| Safe / intentional (documented) | 4 |

**Central question answered:** Yes — the same business action can persist different data depending on endpoint/service, and the codebase can leave the database with insecure credentials, duplicate raw flights, partial dual-writes, conflicting FHR embeds vs source forms, and multi-format status/identifier fields.

---

## Priority table

| Priority | Issue | Data affected | Write paths | Consequence | Evidence |
|---|---|---|---|---|---|
| P0 | Plaintext `loginPassword` beside bcrypt `password` | Admin + user credentials | create/update/seed/OTP reset | DB/admin API exposes reusable passwords | DS-001 |
| P0 | JWT password-reset updates hash only | Admin + user credentials | token reset vs OTP reset | Stale plaintext ≠ new hash; panel shows old password | DS-002 |
| P0 | SMTP `appPassword` stored plaintext | `adminEmails` | OTP mailer migration/create | Mail credential theft on DB breach | DS-003 |
| P0 | Invite tokens stored plaintext | `users.inviteToken` | registration invite create/reissue | Bearer token usable if DB leaked | DS-004 |
| P0 | NAV status `upsertMerge` replaces whole embeds | FHR `mainDetails` / `equipmentManpower` | `setNavisionDataExportStatus` | Wipes flight form data in FHR copy | DS-005 |
| P0 | Form delete does not clear FHR embed | FHR vs source forms | all form `deleteBySerial` | Stale authoritative-looking FHR data | DS-006 |
| P0 | Dual-write non-atomic; mirror failures swallowed | FHR + source + raw | form saves, NAV, cargo, schedule | Source and FHR diverge; API still 200 | DS-007 |
| P1 | `raw_flight_data` `insertMany` without unique serial | Raw flights | `bulkInsert`, find-then-create NAV | Duplicate business rows | DS-008 |
| P1 | Serial identifier proliferation | Raw / FHR / forms | many writers | Same flight unmatched across APIs | DS-009 |
| P1 | NAV / export multi-value formats | Raw + FHR | NAV write + readers | Yes vs Y vs Exported ambiguity | DS-010 |
| P1 | Find-then-create races on raw | `raw_flight_data` | NAV missing-doc create, cargo, merge | Duplicate inserts under concurrency | DS-011 |
| P1 | Cache not invalidated after some raw writes | Scheduled Airlines list | `bulkInsert`, status updates | Stale list after mutation | DS-012 |
| P1 | Direct FHR PUT / full replace wipe risk | `fhr_collection` | `upsertMerge`, `refreshFromSourceCollections` | Nested fields erased | DS-013 |
| P1 | Ramp2/3 FHR-number paths skip FHR mirror | Ramp + FHR | create/update by FHR no | Standalone-only; `serialNo: 0` | DS-014 |
| P2 | Loose DTOs / whitelist-only ValidationPipe | Many update bodies | Partial&lt;Create…Dto&gt; | Unexpected fields may persist | DS-015 |
| P2 | STA date multi-format persistence | Raw + forms | creation, raw normalize | Range filters miss rows | DS-016 |
| P2 | Scripts bypass Nest validation / cache | Various | `server/scripts/*` | Divergent shape vs API writes | DS-017 |
| P2 | Attachments key `fhrNo` vs forms `serialNo` | Attachments + FHR refresh | attachments + refresh | Missed attach on refresh query | DS-018 |
| P2 | Billing prep `insertMany` without upsert | Preparation | prep ingest | Duplicate prep rows possible | DS-019 |
| P2 | `updatePassword` trusts caller (no pre-save hash) | Admin + user | any future caller | Accidental plaintext `password` | DS-020 |
| P3 | MFA secret schema field (raw base32) | Admin | schema only / unknown writers | Needs DB check | DS-021 |
| P3 | Prep delete audit via `allSettled` | Audit log | preparation delete | Silent audit loss | DS-022 |
| P3 | Billing operational schemas `strict: false` | Billing reads of ops data | billing mongoose feature | Extra fields pass silently | DS-023 |

---

## Safe / intentional behaviors (not defects)

1. **OTP hashes only** — flight OTP and password-reset OTP store hash in OTP store; raw OTP is emailed, not written to Mongo (`auth.service.ts`).
2. **Access JWT not persisted** — issued in cookie/response only.
3. **`password` field hashing on known create/update paths** — callers bcrypt before write (except the trust-the-caller risk in DS-020).
4. **Billing invoice sequence** — atomic `$inc` with unique sequence identity (`billing-settings.service.ts`) — race-safe numbering.

---

## ISSUE DS-001 — Plaintext `loginPassword` persisted with bcrypt `password`

**Priority:** P0  
**Confidence:** Confirmed  

**Affected files**

* `src/user/schema/user.schema.ts`
* `src/admin/schema/admin.schema.ts`
* `src/user/services/user.service.ts`
* `src/admin/services/admin.service.ts`
* `src/auth/services/auth.service.ts`

**Affected methods**

* `UserService.createPanelUser`, `updatePanelUser`, `updatePassword`
* `AdminService.createAdmin`, `ensureSuperAdminSeed`, `updatePanelAdmin`, `updatePassword`
* `AuthService.verifyPasswordResetOtp`

**Affected collections**

* `users`, `admin` (or configured admin collection)

**Affected fields**

* `password` (bcrypt), `loginPassword` (plaintext)

### Current write path

```text
Admin/User create or update / OTP reset
 ↓
Controller
 ↓
Service bcrypt.hash(plain) → password
         plain → loginPassword
 ↓
.save() / create() / findByIdAndUpdate $set
 ↓
Mongo users|admin
```

### Inconsistency

Same credential stored twice: one hashed, one plaintext. Panel list/detail explicitly `.select('+loginPassword')`.

### Example failure

Admin creates employee with password `Secret1!`. Attacker with DB read or admin panel credential view recovers `Secret1!` from `loginPassword` and reuses it on other systems.

### Database result

```json
{ "password": "$2b$10$...", "loginPassword": "Secret1!" }
```

### Read impact

`GET` panel user/admin detail and directory list return recoverable passwords.

### Root cause

Deliberate “view password in admin panel” design; no encryption-at-rest.

### Recommended fix

Stop writing/returning `loginPassword`; reset-only UX; `$unset` existing values; rotate credentials; tests forbid plaintext persistence.

### Evidence

* `user.schema.ts` ~202–207 — comment: “Plain login password…”
* `admin.schema.ts` ~19–24 — same
* `user.service.ts` ~733–789, ~1345–1346
* `admin.service.ts` ~116–156, ~218–228, ~471–472
* `auth.service.ts` ~1872–1884 — OTP reset sets `loginPassword: newPassword`

---

## ISSUE DS-002 — JWT password-reset path does not refresh `loginPassword`

**Priority:** P0  
**Confidence:** Confirmed  
**Status:** Fixed 2026-07-27 — `AuthService.resetPassword` now passes `loginPassword: newPassword` (same as OTP path).

**Affected files**

* `src/auth/services/auth.service.ts`
* `src/admin/services/admin.service.ts`
* `src/user/services/user.service.ts`

**Affected methods**

* JWT reset handler (~2163–2170) vs `verifyPasswordResetOtp` (~1872–1884)
* `updatePassword(id, hashed)` without `loginPassword` option

**Affected collections / fields**

* `users` / `admin` — `password`, `loginPassword`

### Current write path

```text
OTP reset  → hash + loginPassword=newPlain
JWT reset  → hash + loginPassword=newPlain  (aligned 2026-07-27)
```

### Inconsistency (historical)

Two reset flows left different persisted credential state for the same “change password” business action. JWT path previously updated hash only.

### Example failure (before fix)

1. User has `loginPassword: "OldPass1!"`, `password: hash(OldPass1!)`.  
2. Completes JWT link reset to `NewPass2!`.  
3. `password` becomes hash(NewPass2!); `loginPassword` remains `OldPass1!`.  
4. Admin panel / shoot-credentials still shows / emails “OldPass1!”.

### Database result (after fix)

```json
{ "password": "$2b$10$<new>", "loginPassword": "NewPass2!" }
```

### Read impact

Panel credential views, shoot-credentials email (`user.service.ts` shootCredentialsEmail).

### Root cause

Call-site inconsistency; `updatePassword` is passthrough.

### Recommended fix

**Done:** JWT `resetPassword` passes `{ loginPassword: newPassword }` like OTP. Longer-term: remove plaintext `loginPassword` (DS-001).

### Evidence

* `auth.service.ts` `resetPassword` — now passes `loginPassword: newPassword`
* `auth.service.ts` ~1872–1884 — OTP path (already correct)

---

## ISSUE DS-003 — SMTP Gmail app password stored plaintext

**Priority:** P0  
**Confidence:** Confirmed  

**Affected files**

* `src/auth/schema/admin-email.schema.ts`
* `src/auth/services/otp-mailer.service.ts`

**Affected methods**

* Legacy SMTP migration / `adminEmailModel.create`

**Affected collections / fields**

* `adminEmails.appPassword`

### Inconsistency

Secret required for SMTP auth stored recoverable in Mongo; no `select: false`, no envelope encryption.

### Recommended fix

Encrypt at rest with KMS/env key, or use secret manager; never log; restrict reads.

### Evidence

* `admin-email.schema.ts` ~6–15  
* `otp-mailer.service.ts` ~99–108 — `appPassword: String(legacyDoc.appPassword)`

---

## ISSUE DS-004 — Registration invite tokens stored plaintext

**Priority:** P0  
**Confidence:** Confirmed  

**Affected files**

* `src/user/schema/user.schema.ts`
* `src/user/registration/services/user-registration.service.ts`

**Affected methods**

* Invite create (~879–913), reissue `save` (~637–671), backfill `updateOne` (~575–583)

**Affected collections / fields**

* `users.inviteToken`, `inviteCode`

### Inconsistency

Bearer invite token persisted raw (unique sparse), not hashed. Token also appears in emailed URLs. Approval/rejection paths do not clearly clear token (needs runtime verify of residual tokens).

### Recommended fix

Store only hash of token; clear on consume/reject/expire; rotate outstanding invites.

### Evidence

* `user.schema.ts` ~395–400  
* `user-registration.service.ts` invite create/reissue/updateOne sites above

---

## ISSUE DS-005 — NAV export status write replaces entire FHR embeds

**Priority:** P0  
**Confidence:** Confirmed  

**Affected files**

* `src/raw-flight-data/services/raw-flight-data.service.ts`
* `src/fhr-collection/services/fhr-collection.service.ts`

**Affected methods**

* `RawFlightDataService.setNavisionDataExportStatus`
* `FhrCollectionService.upsertMerge`

**Affected collections / fields**

* `raw_flight_data.data` (OK — field merge on read-modify-write)
* `fhr_collection.mainDetails` — **replaced** with `{ exportedNAV, navisionDataExportStatus, SerialNo, flightSerialNumber }`
* `fhr_collection.equipmentManpower` — **replaced** with `{ exportedInNav }`

### Current write path

```text
PATCH /raw-flight-data/navision-export/:serialNo
 ↓
setNavisionDataExportStatus
 ↓
raw_flight_data update/create (multi-key Yes/No)
 ↓
fhrCollectionService.upsertMerge(serial, { mainDetails: { exportedNAV, navisionDataExportStatus } })
 ↓
upsertMerge: set.mainDetails = { ...dto.mainDetails }  // NOT merge with existing embed
 ↓
Mongo fhr_collection
```

### Inconsistency

Source form collections keep full main/equipment docs; FHR embed after NAV export may retain only NAV fields. Same business action (mark exported) destroys FHR copy used by Scheduled Airlines / reports / billing sources.

### Example failure

1. Flight has rich `fhr_collection.mainDetails` (airline, STA, ATD, …).  
2. Operator marks NAV exported from Advance Invoicing.  
3. `upsertMerge` sets `mainDetails` to essentially `{ exportedNAV: "Yes", navisionDataExportStatus: "Y", SerialNo, flightSerialNumber }`.  
4. Scheduled Airlines / FHR readers see stripped main details until a full form re-save or `refreshFromSourceCollections`.

### Database result

```json
{
  "SerialNo": 16616,
  "mainDetails": {
    "exportedNAV": "Yes",
    "navisionDataExportStatus": "Y",
    "SerialNo": 16616,
    "flightSerialNumber": 16616
  }
}
```

### Read impact

FHR-based list/report/billing paths; drift vs `main_details` collection.

### Root cause

`upsertMerge` assigns whole embed keys; NAV caller passes partial objects.

### Recommended fix

Deep-merge embeds with existing FHR document (or `$set` only `mainDetails.exportedNAV` paths); never replace whole form slices from status-only updates. Add regression test.

### Evidence

* `raw-flight-data.service.ts` ~2016–2022 (equipment), ~2071–2081 (flight)  
* `fhr-collection.service.ts` ~1486–1530 — `set[k] = dto[k]` / mainDetails object replace

---

## ISSUE DS-006 — Form delete leaves FHR embed intact

**Priority:** P0  
**Confidence:** Confirmed  

**Affected files**

* `src/main-details/services/main-details.service.ts` (`deleteBySerial`)
* Equivalent delete paths: terminal, ramp1, remarks, attachments, equipment-manpower (standalone delete only)

**Affected methods**

* `deleteBySerial` (main details and peer form services)

**Affected collections**

* Source form collections vs `fhr_collection` / `ns_fhr_collection`

### Current write path

```text
DELETE form/:serial
 ↓
findOneAndDelete source collection
 ↓
(optional flight-instance mark)
 ↓
NO FHR $unset / refresh
```

### Inconsistency

Create/update dual-writes FHR; delete does not. Reads that prefer FHR still show deleted form data.

### Example failure

Operator deletes main details; Bird/FHR/report still shows previous mainDetails embed.

### Recommended fix

On delete: `$unset` corresponding FHR slice or call `refreshFromSourceCollections`; document SoT policy.

### Evidence

* `main-details.service.ts` ~865–879 — delete with no FHR clear  
* Contrast create ~109–115 — `mirrorFormSaveToFhrCollection`

---

## ISSUE DS-007 — Non-atomic dual-write; FHR mirror failures swallowed

**Priority:** P0  
**Confidence:** Confirmed  

**Affected files**

* `src/fhr-collection/services/fhr-collection.service.ts`
* `src/main-details/services/main-details.service.ts`
* `src/raw-flight-data/services/raw-flight-data.service.ts`
* `src/import/services/flight-import-persistence.service.ts` (only notable operational transaction elsewhere: import)
* `src/billing/common/billing-transaction.ts` (billing only)

**Affected methods**

* `mirrorFormSaveToFhrCollection` (try/catch warn)
* Form `create` / `upsertBySerial` sequences
* `setNavisionDataExportStatus` FHR try/catch
* Cargo / schedule FHR `.catch` then `{ success: true }`

**Affected collections**

* Form collections + `fhr_collection` + often `raw_flight_data` + `flight_instance_state`

### Current write path

```text
Form save
 ↓
source collection write (committed)
 ↓
raw status / instance state (separate writes)
 ↓
mirrorFormSaveToFhrCollection (errors logged only)
 ↓
HTTP 200 with source doc
```

### Inconsistency

No `startSession`/`withTransaction` on operational dual-writes. Failure after source commit leaves permanent drift. API still reports success.

### Example failure

Main details saves; FHR mirror throws; Scheduled Airlines continues to show old FHR mainDetails.

### Root cause

Explicit design comment: “source collection remains authoritative” + warn-only mirror — but many **reads** use FHR, not source.

### Recommended fix

Transactions where multi-collection must succeed together; or fail the request on mirror failure; or make all product reads hit SoT and treat FHR as async projection with retry/outbox.

### Evidence

* `fhr-collection.service.ts` ~1384–1423 — catch/warn  
* `raw-flight-data.service.ts` ~2016–2028, ~2070–2084, ~6255–6277, ~7613–7684  
* Transactions present: import persistence; billing helper — **not** FHR dual-write

---

## ISSUE DS-008 — `raw_flight_data` bulk insert without unique business key

**Priority:** P1  
**Confidence:** Confirmed  

**Affected files**

* `src/raw-flight-data/schema/raw-flight-data.schema.ts`
* `src/raw-flight-data/services/raw-flight-data.service.ts`

**Affected methods**

* `bulkInsert`

**Affected collections / fields**

* `raw_flight_data` — `data.SlNo` / `Serial No` / `serialNo` (non-unique indexes only)

### Inconsistency

`fhr_collection.SerialNo` is unique; `mainDetails` has station+SerialNo unique; raw flights allow unlimited duplicates of the same serial.

### Example failure

Repeated POST `/raw-flight-data` or import inserts N docs for serial 16616; NAV/status updates may hit an arbitrary doc via `findOne`.

### Recommended fix

Define business uniqueness (station + serial + STA day, or serial alone); migrate duplicates; switch writers to idempotent upsert aligned with semantics.

### Evidence

* Schema indexes ~29–35 — non-unique  
* `bulkInsert` ~1680–1705 — `insertMany` ordered:false, no invalidate of list cache (also DS-012)

---

## ISSUE DS-009 — Same flight identity written under many field names

**Priority:** P1  
**Confidence:** Confirmed  

**Affected files**

* `src/raw-flight-data/services/raw-flight-data.service.ts`
* `src/fhr-collection/schema/fhr-collection.schema.ts`
* `src/main-details/services/main-details.service.ts`
* `src/attachments/services/attachments.service.ts`
* `src/ramp-details-2/services/ramp-details-2.service.ts`

**Affected fields**

* `SerialNo`, `flightSerialNumber`, `serialNo`, `SlNo`, `slNo`, `Serial No`, `fhrNo`

### Inconsistency

Writers stamp multiple aliases; readers may query one alias and miss another. Attachments use `fhrNo`; most forms use `serialNo`; FHR uses `SerialNo`.

### Example failure

Doc A: `{ data: { "Serial No": "16616" } }`  
Doc B: `{ SerialNo: 16616, flightSerialNumber: 16616 }`  
Query on `data.serialNo` misses Doc A.

### Recommended fix

Canonical top-level `serialNo: number` (+ station) at ingest; dual-write aliases only for temporary compat; normalize readers to one resolver.

### Evidence

* NAV create keys ~2041–2050  
* FHR schema unique `SerialNo` ~65–74  
* Attachments `fhrNo` vs forms `serialNo`  
* Ramp2 FHR-number path `serialNo: 0`

---

## ISSUE DS-010 — NAV / export status multi-format persistence

**Priority:** P1  
**Confidence:** Confirmed  

**Affected files**

* `src/raw-flight-data/services/raw-flight-data.service.ts`
* Billing / cutover readers that accept Yes/Y/Exported

**Affected fields**

* Raw: `exportedNAV`, `ExportedNAV`, `Exported NAV` (values `"Yes"`/`"No"` from NAV API)
* FHR: `mainDetails.exportedNAV` (`Yes`/`No`) + `navisionDataExportStatus` (`Y`/`N`)
* Equipment: `exportedInNav` (`Y`/`N`)

### Inconsistency

Same concept stored under three raw keys and two FHR fields with Y vs Yes. Historical rows may still say `Exported`.

### Recommended fix

Single canonical field + normalized enum at write; migrate aliases; readers use one helper only.

### Evidence

* `setNavisionDataExportStatus` ~1995–2060, ~2074–2077  
* `isExportedNavValue` ~2091–2095 accepts exported/y/yes

---

## ISSUE DS-011 — Find-then-create races on `raw_flight_data`

**Priority:** P1  
**Confidence:** Confirmed  

**Affected methods**

* `setNavisionDataExportStatus` missing-doc branch  
* Cargo / scheduled merge create-if-absent paths (~6238+, ~7592+)

### Inconsistency

Without unique index, two concurrent requests both observe absence and both `create`.

### Recommended fix

Unique index + upsert; or transaction with unique constraint.

### Evidence

* ~2035–2054 findOne then create  
* DS-008 missing unique index

---

## ISSUE DS-012 — Cache invalidation gaps after raw mutations

**Priority:** P1  
**Confidence:** Confirmed  

**Affected methods**

* `bulkInsert` — no `invalidateListDailyFromAdvanceCache`  
* `updateFlightStatusBySerial` / master status paths — often no list-cache invalidate  
* Paths where FHR merge fails before invalidate call

### Inconsistency

Mongo updated; Scheduled Airlines in-process cache may still serve prior window.

### Recommended fix

Invalidate (and FHR STA-window clear) on every raw mutation that affects list/merge; invalidate even when FHR mirror fails.

### Evidence

* `bulkInsert` ~1680–1705  
* Status update ~7788–7809, ~7818–7869  
* Contrast NAV path ~2087 which does invalidate

---

## ISSUE DS-013 — Direct FHR upsert / full document replace can wipe nested data

**Priority:** P1  
**Confidence:** Confirmed  

**Affected methods**

* `upsertMerge` — whole-key replace for each supplied form slice  
* `refreshFromSourceCollections` — `findOneAndReplace` rebuild (preserves only narrow top-level keys)

### Inconsistency

PUT FHR with partial `mainDetails` destroys unspecified nested fields. Refresh drops FHR-only fields not in preserve list (except listed keys).

### Recommended fix

Deep merge for partial updates; explicit field allowlist; never pass status-only objects as full embeds (ties to DS-005).

### Evidence

* `upsertMerge` ~1482–1530  
* `refreshFromSourceCollections` / replace ~1050–1104

---

## ISSUE DS-014 — Ramp details 2/3 FHR-number APIs write standalone only

**Priority:** P1  
**Confidence:** Confirmed  

**Affected files**

* `src/ramp-details-2/services/ramp-details-2.service.ts`
* `src/ramp-details-3/services/ramp-details-3.service.ts`

### Inconsistency

Serial-based paths mirror FHR; FHR-number paths set `serialNo: 0` and skip mirror → FHR never updated.

### Recommended fix

Resolve numeric SerialNo from FHR number; mirror; stop writing `serialNo: 0` for real flights.

### Evidence

* Ramp2 create/update by FHR no ~71–94, ~128–207  
* Mirror requires positive `serialNo` (`mirrorRampDetails2ToFhrCollection` ~1434)

---

## ISSUE DS-015 — DTO / ValidationPipe gaps on updates

**Priority:** P2  
**Confidence:** Confirmed  

**Affected files**

* `src/main.ts` — `ValidationPipe({ whitelist: true })` only  
* Many controllers: `@Body() body: Partial<Create…Dto>`  
* Loose pipes: `forbidNonWhitelisted: false` (scheduled pipeline, dashboard, advance-cargo)

### Inconsistency

Create may validate required fields; update Partial + whitelist strips unknowns but does not forbid extras at service if typed `any`/`Partial` spread into mongoose. No global `forbidNonWhitelisted` / `transform`.

### Recommended fix

Global `forbidNonWhitelisted: true`, `transform: true`; dedicated Update DTOs; avoid spreading raw body into `$set`.

### Evidence

* `main.ts` ~25  
* Controllers listed in grep: terminal, remarks, attachments, equipment-manpower, reports, advance-* Partial updates

---

## ISSUE DS-016 — STA date multi-name / multi-format persistence

**Priority:** P2  
**Confidence:** Confirmed  

**Affected fields**

* `'STA Date'`, `staDate`, `STADate`, and derived `staDateKey` (often compute-on-read only)

### Inconsistency

Creation/raw writers dual-write some aliases; forms use `STADate`; `filterByDateRange` parses embedded strings in Node (full scan — separate perf issue).

### Recommended fix

Normalize to ISO `staDate` + numeric `staDateKey` at ingest; keep display aliases ephemeral.

### Evidence

* `daily-flight-override.service.ts` ~168–190  
* `raw-flight-data.service.ts` normalize sites ~1331+, `filterByDateRange` ~1735–1759  
* Form schemas `STADate`

---

## ISSUE DS-017 — Scripts bypass Nest service validation and cache paths

**Priority:** P2  
**Confidence:** Confirmed  

**Affected files**

* `scripts/restore-superadmin.ts` (hashes password — good — but direct collection write)
* `scripts/migrate-fhr-signatures-to-repository.ts`
* `scripts/backfill-staDates.ts`
* `scripts/reconcile-maindetails-serial.ts`
* `scripts/rollback-6h-dashboard-aggregates.ts`
* `src/excel-import/fhr-main-details-reseed.service.ts` — updates FHR model without `upsertMerge` cache path

### Recommended fix

Scripts call shared domain services; document one-off scripts as break-glass; always invalidate caches when touching FHR/raw.

---

## ISSUE DS-018 — Attachments identifier `fhrNo` vs form `serialNo`

**Priority:** P2  
**Confidence:** Confirmed  

**Affected files**

* `src/attachments/services/attachments.service.ts`
* FHR `refreshFromSourceCollections` query by `fhrNo`

### Inconsistency

Refresh/query must remember attachments use different key; mismatch → missing attachments on rebuild.

### Recommended fix

Align on `serialNo`; migrate `fhrNo`; dual-read during transition.

---

## ISSUE DS-019 — Billing preparation `insertMany` without upsert

**Priority:** P2  
**Confidence:** Confirmed (logic) / Needs runtime verification (prod duplicates)

**Affected files**

* `src/billing/services/billing-preparation.service.ts` ~372–380  
* Schema index on `sourceRef.serialNo` non-unique

### Recommended fix

Confirm intended idempotency; if “one prep row per source identity per period”, enforce unique compound index + upsert.

---

## ISSUE DS-020 — `updatePassword` does not hash; no Mongoose pre-save hook

**Priority:** P2  
**Confidence:** Confirmed  

**Affected methods**

* `AdminService.updatePassword`, `UserService.updatePassword`

### Inconsistency

Safety depends on every caller hashing first. No `schema.pre('save')` anywhere under `server/`. JWT/OTP paths currently hash; a future caller can write plaintext into `password`.

### Recommended fix

Hash inside `updatePassword` (detect bcrypt prefix or always take plaintext + hash), or add pre-save + forbid update operators from setting raw password without service.

---

## ISSUE DS-021 — Admin `mfaSecret` schema field

**Priority:** P3  
**Confidence:** Needs runtime verification  

Schema stores raw TOTP secret with `select: false`. No clear application write path found in this audit — verify DB for populated secrets and how they were set.

---

## ISSUE DS-022 — Preparation delete audits via `Promise.allSettled`

**Priority:** P3  
**Confidence:** Confirmed  

`billing-preparation.service.ts` ~1571–1591 — rejected audits ignored; HTTP still success. Data rows deleted; audit trail incomplete.

---

## ISSUE DS-023 — Billing operational mongoose models `strict: false`

**Priority:** P3  
**Confidence:** Confirmed  

`src/billing/schemas/operational.schemas.ts` — FHR/raw/ADS/RAF/NS/advance models registered `strict: false` for read convenience. Extra fields can be written if these models are ever used for writes.

---

## Dual-write map (scheduled forms)

```text
Main Details
  POST/PATCH form → main_details (SerialNo)
                 → raw status / flight_instance_state
                 → fhr_collection.mainDetails   [best-effort]
  DELETE form    → main_details only            [FHR stale]

Terminal / Load / Ramp1 / Ramp3 / Remarks / Equipment
  save  → standalone → FHR slice mirror
  delete → standalone only

Ramp2 (serial) → rampDetails2 rows → FHR rampDetails2 rebuild
Ramp2 (FHR no) → standalone only (serialNo: 0)

Attachments
  save → attachments (fhrNo) → FHR attachments

Direct FHR PUT
  → fhr_collection embeds only (no backfill to forms)

NAV export
  → raw_flight_data (and/or equipment entries)
  → FHR partial upsertMerge  [DANGEROUS — DS-005]
```

**Source of truth (code comments):** form collections.  
**Read reality:** many product surfaces read `fhr_collection`.  
**Sync guarantee:** none (warn-only mirror, no transactions).

---

## Top 10 data-saving problems to fix first

1. **Stop plaintext `loginPassword` (DS-001)**  
   Files: `user.schema.ts`, `admin.schema.ts`, `user.service.ts`, `admin.service.ts`, `auth.service.ts`  
   Methods: all create/update/OTP paths  
   Collections: `users`, `admin`  
   Why: recoverable credentials  
   Approach: remove field; reset-only UX; `$unset` + rotate  
   Migration: **yes** — purge plaintext + force password change

2. **Align all password-change paths (DS-002)**  
   Files: `auth.service.ts`  
   Methods: JWT reset vs OTP reset  
   Why: hash/plaintext diverge after JWT reset  
   Approach: `$unset loginPassword` on every password change (or remove field)  
   Migration: detect mismatch `loginPassword` vs bcrypt verify

3. **Fix NAV `upsertMerge` embed wipe (DS-005)**  
   Files: `raw-flight-data.service.ts`, `fhr-collection.service.ts`  
   Methods: `setNavisionDataExportStatus`, `upsertMerge`  
   Collections: `fhr_collection`  
   Why: silently destroys FHR flight data  
   Approach: path `$set` on leaf fields or deep-merge existing embed  
   Migration: **yes** — repair stripped FHR from `main_details` / equipment source via refresh

4. **Make dual-write failure visible or transactional (DS-007)**  
   Files: `fhr-collection.service.ts`, form services  
   Methods: `mirrorFormSaveToFhrCollection`  
   Why: success response with divergent SoT vs read model  
   Approach: outbox/retry or fail request; transactions for critical triples  
   Migration: reconcile job FHR ← forms

5. **Delete must clear or refresh FHR (DS-006)**  
   Files: form `*Service.deleteBySerial`  
   Why: deleted data still served from FHR  
   Approach: `$unset` slice or refresh  
   Migration: detect orphan embeds without source docs

6. **Unique + idempotent `raw_flight_data` writes (DS-008, DS-011)**  
   Files: `raw-flight-data.schema.ts`, `bulkInsert`, NAV create branch  
   Why: duplicates / ambiguous NAV updates  
   Approach: unique index + upsert semantics after dedupe  
   Migration: **yes** — merge duplicate serials

7. **Canonical serial + date fields (DS-009, DS-016)**  
   Files: raw writers, form schemas  
   Why: missed lookups / wrong joins  
   Approach: normalize at ingest  
   Migration: backfill canonical keys

8. **Single NAV status representation (DS-010)**  
   Files: `setNavisionDataExportStatus`, readers  
   Why: Yes/Y/Exported drift  
   Approach: store `exportedNav: boolean` or enum `Y|N` only  
   Migration: normalize existing keys

9. **Cache invalidation on all list-affecting writes (DS-012)**  
   Files: `bulkInsert`, status updaters  
   Why: UI shows pre-mutation flights  
   Approach: always invalidate list + STA caches  
   Migration: none (runtime)

10. **Encrypt or relocate SMTP app passwords (DS-003)**  
    Files: `admin-email.schema.ts`, `otp-mailer.service.ts`  
    Why: mailbox takeover  
    Approach: secret manager / envelope encryption  
    Migration: re-enter secrets; scrub plaintext

---

## Existing data verification queries

**Read-only.** Run against a secondary / backup when possible. Adjust collection names if your deployment renames them.

### Sensitive fields

```js
// Users with recoverable plaintext passwords
db.users.countDocuments({
  loginPassword: { $type: 'string', $ne: '' }
})

// Admins with recoverable plaintext passwords
db.admin.countDocuments({
  loginPassword: { $type: 'string', $ne: '' }
})

// Password reset mismatch heuristic: loginPassword set but may not match hash
// (verify in app with bcrypt.compare — do not store compare result in DB)
db.users.find(
  { loginPassword: { $type: 'string', $ne: '' } },
  { userid: 1, email: 1, loginPassword: 1, password: 1 }
).limit(20)

// Invite tokens still present
db.users.countDocuments({
  inviteToken: { $type: 'string', $ne: '' }
})

// SMTP secrets
db.adminEmails.find({}, { email: 1, appPassword: 1, isActive: 1 })
```

### Duplicate raw flights

```js
db.raw_flight_data.aggregate([
  {
    $project: {
      stationCode: 1,
      serial: {
        $ifNull: [
          '$data.SerialNo',
          {
            $ifNull: [
              '$data.serialNo',
              { $ifNull: ['$data.SlNo', '$data.Serial No'] }
            ]
          }
        ]
      }
    }
  },
  { $group: { _id: { stationCode: '$stationCode', serial: '$serial' }, n: { $sum: 1 } } },
  { $match: { n: { $gt: 1 }, '_id.serial': { $nin: [null, ''] } } },
  { $sort: { n: -1 } },
  { $limit: 50 }
])
```

### FHR vs main_details drift / NAV wipe symptoms

```js
// FHR mainDetails that look stripped (NAV-only-ish)
db.fhr_collection.find({
  mainDetails: { $type: 'object' },
  'mainDetails.exportedNAV': { $exists: true },
  'mainDetails.ArrivalFlightNo': { $exists: false },
  'mainDetails.DepartureFlightNo': { $exists: false },
  'mainDetails.STADate': { $exists: false },
  'mainDetails.STA Date': { $exists: false }
}, { SerialNo: 1, mainDetails: 1 }).limit(50)

// Source main_details exists but FHR mainDetails missing/empty
db.mainDetails.aggregate([
  { $project: { SerialNo: 1, stationCode: 1 } },
  {
    $lookup: {
      from: 'fhr_collection',
      localField: 'SerialNo',
      foreignField: 'SerialNo',
      as: 'fhr'
    }
  },
  { $match: { $or: [{ fhr: { $size: 0 } }, { 'fhr.0.mainDetails': null }] } },
  { $limit: 50 }
])

// FHR mainDetails present but source main_details deleted
db.fhr_collection.aggregate([
  { $match: { mainDetails: { $type: 'object' } } },
  {
    $lookup: {
      from: 'mainDetails', // confirm actual collection name in your DB
      localField: 'SerialNo',
      foreignField: 'SerialNo',
      as: 'src'
    }
  },
  { $match: { src: { $size: 0 } } },
  { $project: { SerialNo: 1, 'mainDetails.exportedNAV': 1 } },
  { $limit: 50 }
])
```

### Equipment embed wipe symptom

```js
db.fhr_collection.find({
  'equipmentManpower.exportedInNav': { $exists: true },
  'equipmentManpower.entries': { $exists: false }
}, { SerialNo: 1, equipmentManpower: 1 }).limit(50)
```

### Multi-format NAV values

```js
db.raw_flight_data.aggregate([
  {
    $project: {
      a: '$data.exportedNAV',
      b: '$data.ExportedNAV',
      c: '$data.Exported NAV',
      d: '$data.Exported'
    }
  },
  {
    $group: {
      _id: { a: '$a', b: '$b', c: '$c', d: '$d' },
      n: { $sum: 1 }
    }
  },
  { $sort: { n: -1 } },
  { $limit: 40 }
])
```

### Identifier null / mismatch samples

```js
db.fhr_collection.find({
  $or: [
    { flightSerialNumber: { $exists: false } },
    { $expr: { $ne: ['$SerialNo', '$flightSerialNumber'] } }
  ]
}, { SerialNo: 1, flightSerialNumber: 1 }).limit(50)

db.rampDetails2.countDocuments({ serialNo: 0 })
```

### Billing preparation duplicate risk

```js
db.billing_preparations.aggregate([
  {
    $group: {
      _id: {
        stationCode: '$stationCode',
        customerCode: '$customerCode',
        sourceType: '$sourceType',
        serial: '$sourceRef.serialNo',
        periodStart: '$billingPeriodStart',
        periodEnd: '$billingPeriodEnd'
      },
      n: { $sum: 1 }
    }
  },
  { $match: { n: { $gt: 1 } } },
  { $sort: { n: -1 } },
  { $limit: 50 }
])
// Adjust collection/field names to match billing-collection.constants.ts
```

---

## Needs runtime verification (summary)

1. Volume of `loginPassword` / `inviteToken` / `adminEmails.appPassword` in production.  
2. How many `fhr_collection` docs were stripped by NAV `upsertMerge` (DS-005 queries).  
3. Duplicate `raw_flight_data` serial counts after historical imports.  
4. Orphan FHR embeds after form deletes.  
5. Whether `mfaSecret` is populated anywhere.

---

## Appendix — write-path legend

| Symbol | Meaning |
|---|---|
| SoT | Declared source of truth in code comments |
| Mirror | Best-effort copy into FHR/NS FHR |
| Replace | Whole embed/document overwrite |
| Swallow | Error logged; HTTP success |

---

*Re-run this audit after dual-write, credential, or NAV export changes. Prefer fixing DS-001/002/005 before broad schema migrations.*
