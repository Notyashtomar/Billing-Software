# Server issues and remediation guide

**Last reviewed:** 2026-08-04 (FHR report IPOS/departure-bag mapping remediation; seed-on-boot / seed-CLI hardening; prior computation-power register §62 — 2026-07-27; full audit 2026-07-19)

> **Authoritative current state:** The audit snapshot and active register below supersede conflicting status labels in the historical §1–§62 ledger. Historical sections remain for implementation context and traceability; they are not current-state assertions unless referenced below. **§62** is the consolidated **computation power** issue register (CPU / RAM / event-loop / Atlas I/O). **§60** is the page/section resource-cost inventory; **§61** + `SCHEDULED_AIRLINES_ARCHITECTURE_PERF_AUDIT.md` are the Scheduled Airlines Apply Filters computational audit.

## Full server audit snapshot — 2026-07-19

### Scope and evidence

Reviewed `server/src`, server configuration, schemas, controllers, services, guards, storage, imports, billing, reporting, health, protection, tests, package manifests, Railway configuration, and GitHub Actions.

Evidence labels:

- **Code verified:** Confirmed directly in current source.
- **Test verified:** Confirmed by a command executed during this audit.
- **Runtime/DB unverified:** Requires deployed configuration, production database, or multi-replica testing.
- **Historical:** Preserved prior result; not re-run during this audit.

### Verification results

| Check | Result | Evidence |
|---|---|---|
| `npm run build` | **Passed** | Nest build exited 0. |
| `npm run test:smoke` | **Passed with leak warning** | 14 suites passed, 1 skipped; 31 tests passed, 2 skipped. Jest force-exited because handles remained open. |
| `npm test -- --runInBand` | **Failed** | 35 suites passed, 3 failed; 139 tests passed, 1 failed. Auth suites cannot parse ESM from `otplib`/`@scure/base`; `UserController` test omits `AdminPanelStationScopeService`. |
| `npm run test:e2e -- --runInBand --detectOpenHandles` | **Failed** | Full-app e2e cannot resolve `src/user/services/user.service`; 15 suites passed, 1 failed, 1 skipped. |
| `npx eslint "{src,apps,libs,test}/**/*.ts"` | **Failed** | 4,400 findings: 4,208 errors and 192 warnings. Many test files are outside ESLint project-service configuration; source also contains existing lint debt. |
| `npm audit --json` | **Failed at moderate threshold** | 4 moderate, 0 high, 0 critical advisories. |
| `npm audit --omit=dev --json` | **Failed at moderate threshold** | 3 moderate production advisories through `brace-expansion` and `exceljs` → `uuid`; 0 high/critical. |

### Executive assessment

Production controls improved materially since the June audit: global JWT/RBAC/page guards, station-scoping primitives, Helmet, constrained CORS, health/readiness endpoints, shutdown hooks, Railway deployment, backend CI, secure cookie defaults, token-version invalidation, selective Mongo transactions, S3-capable storage, request IDs, and broad indexing are present.

Current release risk remains **high** because two critical credential/privilege defects are code-confirmed, several data paths bypass station or transaction boundaries, deployment checks liveness instead of readiness, and CI does not execute the currently failing unit/e2e/lint suites.

Current active register: **2 critical, 12 high, 18 medium, 3 low** findings. Runtime exposure depends on deployed flags, replica count, storage driver, and database contents.

## Active issue register — 2026-07-19

### Critical

#### AUD-C01 — Recoverable plaintext passwords in user and admin records — **Open**

**Evidence:** `src/user/schema/user.schema.ts:202-207`, `src/admin/schema/admin.schema.ts:19-24`, `src/admin/services/admin.service.ts:314-325,417-427`, `src/user/services/user.service.ts:711-733,862-940`.

`password` contains a bcrypt hash, but `loginPassword` stores the original password. Admin detail/credential flows explicitly select and serialize this field.

**Impact:** Database compromise or authorized admin access discloses reusable employee and administrator credentials.

**Remediation:**

1. Stop writing and returning `loginPassword`; remove credential-list/read endpoints.
2. Replace password viewing/edit hydration with reset-only workflows.
3. `$unset` all existing plaintext values and rotate affected credentials.
4. Audit historical access to APIs that returned plaintext credentials.
5. Add tests preventing plaintext persistence and serialization.

**Verification:** Code verified. Existing production values and access history are runtime/DB unverified.

#### AUD-C02 — Ordinary admins can promote, overwrite, or delete other admins — **Open**

**Evidence:** `src/admin/controllers/admin.controller.ts:34-35,128-139`, `src/admin/dto/update-admin.dto.ts:37-39`, `src/admin/services/admin.service.ts:329-440`.

Both `admin` and `superadmin` can call arbitrary panel update/delete routes. Update accepts `role: "superadmin"` and password changes without receiving or authorizing the acting principal.

**Impact:** Compromised or malicious admin can self-promote, reset another administrator's password, change permissions, or delete privileged accounts.

**Remediation:**

1. Restrict admin lifecycle and role/password changes to superadmin.
2. Pass current principal into service authorization checks.
3. Block self-promotion, protected-account deletion, and deletion/demotion of last superadmin.
4. Require recent authentication and MFA for privileged changes.
5. Add actor/target audit events and negative authorization tests.

**Verification:** Code verified.

### High

#### AUD-H01 — Disabled admins remain eligible for login and existing sessions — **Open**

**Evidence:** `src/admin/schema/admin.schema.ts:88-89`, `src/auth/services/auth.service.ts:1422-1461`, `src/auth/services/identity.service.ts:115-172`, `src/admin/services/admin.service.ts:354-431`.

Admin status exists, but login does not enforce it; principal resolution returns `active: true`. Status changes do not invalidate sessions.

**Remediation:** Enforce active status at login and every principal resolution; bump `tokenVersion` on status/station changes; test inactive login and session rejection.

#### AUD-H02 — Legacy reports bypass station and page authorization — **Open**

**Evidence:** `src/auth/enums/roles.enum.ts:29-47`, `src/reports/controllers/reports.controller.ts:31-33,51-55,590-635`, `src/reports/services/reports.service.ts:13-61`, `src/reports/schema/reports.schema.ts:6-31`.

Every authenticated role can access report routes, the controller lacks report-page permission enforcement, persisted reports have no station field, and CRUD queries are unscoped.

**Remediation:** Add immutable `stationCode`, backfill records, add compound indexes, enforce page permissions, and apply `StationScope.filter/stampCreate/assertOwnership` to all reads and writes.

#### AUD-H03 — Rate limiting monitors by default and trusts spoofable forwarding data — **Open**

**Evidence:** `src/protection/config/protection-env.ts:52-85`, `src/protection/guards/operational-throttler.guard.ts:82-96`, `src/protection/utils/request-context.util.ts:19-24`.

Production enables the guard but remains `monitor-only` unless configured. Client identity takes the first `X-Forwarded-For` value.

**Remediation:** Validate production `THROTTLE_MODE=enforcement`; require shared Redis; use Express trusted-proxy `req.ip`; add edge limits and forwarding-header tests.

**Runtime note:** Actual production flags and proxy header rewriting are unverified.

#### AUD-H04 — Public registration upload can allocate about 250 MiB before invite validation — **Open**

**Evidence:** `src/user/registration/controllers/user-registration.controller.ts:165-177`, `src/user/registration/services/user-registration.service.ts:1424-1439`.

Multipart parsing buffers up to 25 files × 10 MiB in memory before the service validates the invite.

**Remediation:** Validate invite before multipart parsing, lower aggregate limits, enforce edge/application concurrency, stream to quarantine object storage, and load-test heap behavior.

#### AUD-H05 — Billing aggregate mutations are not transactional — **Partial**

**Evidence (original):** `src/billing/services/billing-invoices.service.ts` post/remove; `src/billing/services/billing-invoice-drafts.service.ts` createFromPreparation.

**Remediation applied (2026-07-23):**
- Added `withBillingTransaction` (`src/billing/common/billing-transaction.ts`).
- `AuditEngineService` / `BillingSequencesService.nextNumber` / `ExportEngineService.track` / `LegacyNavBridgeService.afterInvoicePosted` accept optional `ClientSession` + `afterCommit`.
- Transactional P0 paths: invoice generate/post/remove/cancel/archive/sendToAirline (DB portion), draft create-from-prep (per group)/delete/rebuild, credit memo create/post, customer code cascade update, preparation ingest + bulkReady fast path.
- Activity/EventEmitter and legacy external NAV bridge run **after commit** only.
- Email still sent **before** send-marker DB txn (preserves prior “no mark-sent if SMTP fails” behaviour).

**Remaining (intentional / follow-up):**
- ADS contract fire-and-forget rate-card sync still post-commit async (not in invoice txn).
- Cutover/decommission/parallel-run multi-writes not yet wrapped.
- Draft line CRUD / review / bin / single-prep status flips still header+audit only (lower partial-write risk); can adopt same helper incrementally.
- Replica-set required for Mongo multi-doc transactions in production (Atlas already).

**Tests:** `billing-transaction.spec.ts`, `audit-engine.service.spec.ts` (session defer), `billing-transactions.aud-h05.spec.ts`.

#### AUD-H06 — Request timeout returns failure without cancelling work — **Open**

**Evidence:** `src/protection/interceptors/request-timeout.interceptor.ts:52-67`, `src/protection/config/protection-env.ts:61-66`.

RxJS timeout ends the response path, but Mongo writes and downstream promises can continue. Client retry can overlap a successful first mutation.

**Remediation:** Add mutation idempotency, operation-level deadlines/`maxTimeMS`, abort-aware external calls, and exclude unsafe writes from generic timeout handling until cancellation semantics exist.

#### AUD-H07 — Startup index synchronization can mutate production indexes on every replica — **Open**

**Evidence:** `src/billing/services/billing-index-migration.service.ts:50-71`; similar startup index services exist for dashboard, airline, and aircraft modules.

Startup drops legacy indexes and calls `syncIndexes()`. Concurrent replicas can race and schema changes can remove indexes outside a controlled migration.

**Remediation:** Move index changes to versioned one-shot migrations with distributed lease, preflight duplicate checks, dry-run, rollback, and migration ledger.

#### AUD-H08 — Process-local queues, locks, OTP state, and cron block safe scaling — **Open**

**Evidence:** `src/dashboard-summary/services/dashboard-refresh-queue.service.ts:30-113`, `dashboard-refresh-lock.service.ts:3-25`, `src/protection/services/concurrency-lock.service.ts:14-90`, `src/dashboard-summary/services/dashboard-summary-maintenance.service.ts:21-45`, `src/auth/services/auth.service.ts:113-131`.

**Impact:** Duplicate jobs/cron work, split limits, restart-lost state, and inconsistent OTP/reset behavior across replicas.

**Remediation:** Externalize queues/locks/OTP/reset consumption to Redis or durable workers; leader-elect schedulers; document single-replica constraint until complete.

#### AUD-H09 — Deployment checks liveness, not database readiness — **Open**

**Evidence:** `railway.toml:9-13`, `../.github/workflows/backend.yml:101-104`, `src/health/health.controller.ts:22-47`.

Railway and post-deploy CI call `/health`, which intentionally omits Mongo. `/ready` is the database readiness endpoint.

**Remediation:** Use `/ready` for Railway and post-deploy checks; retain `/health` for process liveness.

#### AUD-H10 — CI omits failing unit, full-app e2e, and lint gates — **Open**

**Evidence:** `../.github/workflows/backend.yml:44-54`, `test/jest-smoke.json:3-14`, `test/helpers/protection-harness/protection-harness.module.ts:15-30`.

CI runs audit-at-high, build, and protection smoke only. Full unit/e2e/lint checks fail during this audit but are not gates.

**Remediation:** Fix current suites/configuration, then gate non-mutating lint, unit tests, shared-bootstrap full-app e2e, health/readiness tests, coverage threshold, and production artifact startup.

#### AUD-H11 — Production storage defaults to ephemeral process-local disk — **Open**

**Evidence:** `src/common/storage/file-storage.service.ts:13-20,43-70`, `src/import/services/flight-import-error-excel.service.ts:14-53`.

S3 is supported, but local storage remains default and no Railway volume is configured in repository artifacts.

**Remediation:** Require S3/R2 in production or configure/document a persistent volume; fail bootstrap on unapproved local production storage.

**Runtime note:** Actual production storage driver is unverified.

#### AUD-H12 — Heavy 210-day warmup runs after every process startup — **Resolved**

**Was:** `DelayReportStartupWarmService` defaulted ON, waited ~20s after boot, then materialised ~210 days of `delay_reports` shards (duplicate work across replicas).

**Fix:**
- Removed startup warm service.
- Nightly cron (`DelayReportDailyMaterializeService`, UTC 01:00) materialises **yesterday + today** only (`DELAY_REPORT_DAILY_MATERIALIZE_ENABLED`, default on).
- Report reads (`getTopCards` → `ensureRangeMaterialized`) auto-store missing days for the **requested date range**, then aggregate from `delay_reports`.

**Evidence:** `src/reports/services/delay-report-daily-materialize.service.ts`, `src/reports/services/delay-report-summary.service.ts` (`ensureRangeMaterialized` / `getTopCards`).

### Medium

#### AUD-M01 — Update DTO validation can be bypassed — **Open**

Global `ValidationPipe` only uses `whitelist` (`src/main.ts:25`). Several controllers use runtime-erased `Partial<Create...Dto>` and services issue updates without `runValidators`, for example `src/advance-manpower/controllers/advance-manpower.controller.ts:60-66` and service `:128-145`.

**Remediation:** Enable `transform` and `forbidNonWhitelisted`; create concrete `PartialType` update DTOs; enable Mongoose update validators.

#### AUD-M02 — Registration documents permit active/mislabeled content and inline rendering — **Open**

**Evidence:** `src/user/registration/services/user-registration.service.ts:353-383,1529-1551`, controller `:47-61`.

**Remediation:** Validate extension, MIME, and magic bytes; reject HTML/SVG; serve attachment from isolated origin with `nosniff` and restrictive CSP.

#### AUD-M03 — Cookie-authenticated mutations lack explicit CSRF protection — **Open**

**Evidence:** `src/auth/utils/auth-cookie.util.ts:48-125`, `src/main.ts:43-48`.

Default `SameSite=Lax` reduces risk, but `SameSite=None` is configurable and no CSRF/Origin/Fetch Metadata check exists.

**Remediation:** Require CSRF token or strict Origin/Fetch Metadata checks for cookie-authenticated mutations.

#### AUD-M04 — User input becomes Mongo regular expressions — **Open**

**Evidence:** `src/admin-incidents/services/admin-incidents.service.ts:83-116`, `src/admin-incidents/dto/incident.dto.ts:38-56`.

**Remediation:** Escape input as literal text, bound length, anchor where possible, and use indexed normalized/search fields.

#### AUD-M05 — Password-reset replay protection is process-local and non-atomic — **Open**

**Evidence:** `src/auth/services/auth.service.ts:130-131,1580-1585,1603-1641`.

**Remediation:** Persist hashed JTI, atomically consume before password change, support replicas/restarts, and avoid reset bearer tokens in query strings.

#### AUD-M06 — SMTP app passwords are recoverable database fields — **Open**

**Evidence:** `src/auth/schema/admin-email.schema.ts:6-15`, `src/auth/services/otp-mailer.service.ts:78-109,129-136`.

**Remediation:** Prefer deployment secrets; otherwise envelope-encrypt with managed key and exclude credentials from normal queries.

#### AUD-M07 — Production dependency tree has three moderate advisories — **Open**

**Evidence:** `npm audit --omit=dev --json` on 2026-07-19: `brace-expansion` GHSA-f886-m6hf-6m8v and `exceljs` → `uuid` GHSA-w5hq-g745-h8pq. No high/critical advisory.

**Remediation:** Upgrade or replace affected paths, test Excel generation, and gate an agreed audit threshold. Do not blindly apply the suggested `exceljs` downgrade.

#### AUD-M08 — Invite tokens can be written to request logs — **Open**

**Evidence:** `src/user/middlewares/middlewares.middleware.ts:8-17`, registration controller `:156-162,192-205`.

**Remediation:** Log route templates without secret path/query values; redact token-like fields.

#### AUD-M09 — Invoice line-number allocation races — **Open**

**Evidence:** `src/billing/services/billing-invoice-drafts.service.ts:398-422`, unique index at `src/billing/schemas/billing.schemas.ts:827-890`.

**Remediation:** Allocate from atomic per-invoice counter inside transaction or retry duplicate-key conflicts safely.

#### AUD-M10 — Activity/audit event delivery is lossy — **Open**

**Evidence:** `src/billing/engines/audit-engine.service.ts:38-58`, `src/user-activity-notifications/listeners/user-activity-log.listener.ts:17-24`.

Listener failures are caught and discarded after successful billing audit insertion.

**Remediation:** Transactional outbox, durable consumer, retry/dead-letter policy, failure metrics, and alerts.

#### AUD-M11 — Registration cleanup targets a different local path than storage writes — **Open**

**Evidence:** storage root `src/common/storage/file-storage.service.ts:13-17`; registration writes `src/user/registration/services/user-registration.service.ts:353-362`; invite removal `:1012-1016`.

**Remediation:** Add `delete()` to storage abstraction and use the same canonical relative key for local/S3 write, read, and cleanup.

#### AUD-M12 — In-memory maps can retain expired/high-cardinality keys — **Open**

**Evidence:** `src/protection/stores/in-memory-throttle.store.ts:10-28`, `src/auth/services/otp-store.service.ts:16-113`, `src/dashboard-summary/services/dashboard-refresh-lock.service.ts:9-24`, `src/protection/services/auth-attempt-tracker.service.ts:12-45`.

**Remediation:** Use bounded TTL/LRU or Redis, periodic pruning, settled-lock deletion, and cardinality metrics.

#### AUD-M13 — Unbounded list responses and broad body limit remain — **Open**

**Evidence:** `src/reports/services/reports.service.ts:18-20`, `src/advance-manpower/services/advance-manpower.service.ts:100-112`, global 15 MiB JSON limit at `src/main.ts:11-20`.

**Remediation:** Cursor pagination with hard caps/projections/stable indexed sort; endpoint-specific body limits.

#### AUD-M14 — Audit collections lack retention/archival policy — **Open**

**Evidence:** `src/billing/schemas/billing.schemas.ts:793-825`, `src/user-activity-notifications/schema/user-action-log.schema.ts:98-101`.

**Remediation:** Approve compliance retention, archive/export policy, and TTL where permitted.

#### AUD-M15 — Bootstrap environment and Mongo resilience are not centrally validated — **Open**

**Evidence:** `src/app.module.ts:91-104` has no config validation and passes only optional Mongo URI.

**Remediation:** Typed bootstrap schema; validate required production variables and ranges; configure measured pool, selection/socket timeouts, app name, and connection metrics.

#### AUD-M16 — API contracts and error envelopes remain inconsistent — **Open**

No OpenAPI dependency/contract, no API versioning, and no global exception envelope. Specialized filters and manual query/body parsing create endpoint drift.

**Remediation:** Global error contract, OpenAPI generation, typed response DTOs, version policy, and contract tests.

#### AUD-M17 — `RawFlightDataService` and raw schema are oversized/weakly typed — **Open**

**Evidence:** `src/raw-flight-data/services/raw-flight-data.service.ts` exceeds 6,100 lines; DTO accepts `flights: any[]` and schema uses `strict:false` at `src/raw-flight-data/dto/create-raw-flight-data.dto.ts:1-8` and schema `:7-10`.

**Remediation:** Define canonical ingestion model and legacy extension bag; split ingestion, serial resolution, views, NAV, cancellation, cache, and reconciliation services.

#### AUD-M18 — Toolchain/test configuration drifts across CI and runtime — **Open**

**Evidence:** CI Node 22 (`../.github/workflows/backend.yml:22-23`), Nixpacks Node 20 (`nixpacks.toml:1-4`), no pinned package manager, Railway uses `npm install`, lint script mutates with `--fix`, smoke force-exits, and full e2e lacks alias mapping.

**Remediation:** Align Node/npm, use one deterministic install/build path, add `lint:check`, remove `forceExit`, close resources, map aliases, and share production bootstrap with e2e.

### Low

#### AUD-L01 — Public `/health/full` exposes runtime metadata — **Open**

It returns PID, Node version, uptime, and memory (`src/health/health.controller.ts:56-67`, `health.service.ts:82-96`). Protect it or reduce public output; keep `/health` and `/ready` public.

#### AUD-L02 — Nixpacks-only deployment reduces image parity — **Accepted risk / Open**

No Dockerfile exists. Nixpacks is valid but gives weaker local/production artifact parity. Document this decision or add a pinned multi-stage image.

#### AUD-L03 — Install and migration supply chain remains operationally fragile — **Open**

SheetJS is fetched from a remote CDN tarball; migrations are manual scripts and deployment has no migration compatibility gate. Preserve lockfile integrity, mirror critical artifacts if needed, and add migration preflight/ledger.

## Confirmed strengths

- Global JWT, role, and page-permission guards: `src/app.module.ts:175-187`.
- Station scope fails closed for non-global principals: `src/common/station/station-scope.ts:84-220`.
- Helmet, constrained CORS, cookie parser, trusted proxy, body limits, and shutdown hooks: `src/main.ts:18-50`.
- Separate liveness and Mongo readiness endpoints: `src/health/health.controller.ts:22-67`.
- Secure cookie defaults, JWT expiry, token purpose, and token-version checks.
- Flight import transaction has correct session cleanup: `src/import/services/flight-import-persistence.service.ts:46-64`.
- Invoice number allocation is atomic: `src/billing/services/billing-settings.service.ts:432-445`.
- Registration document download requires admin role or matching invite token.
- S3-capable storage abstraction exists.
- Backend CI, Railway deployment, and post-deploy health check exist, though coverage/probe choice need correction.

## Prioritized remediation — authoritative

### P0 — Immediate

1. Remove plaintext `loginPassword`, purge values, rotate credentials, and audit access.
2. Close admin privilege escalation; protect superadmin lifecycle and last-superadmin invariants.
3. Enforce inactive-admin rejection and invalidate affected sessions.
4. Station-scope and page-authorize legacy report CRUD.
5. Move public invite validation before multipart buffering; enforce upload limits/concurrency.

### P1 — Before next production release

1. Change Railway and post-deploy probe to `/ready`.
2. Fix unit/e2e/lint configurations and make them CI gates.
3. Make rate limiting enforcing, Redis-backed, and proxy-safe in production.
4. Transaction-wrap billing aggregate mutations and add idempotency/outbox delivery.
5. Remove unsafe timeout behavior from non-idempotent writes or add real cancellation/idempotency.
6. Require durable production object storage.
7. Disable per-process warmup/startup index mutation; move to controlled singleton jobs/migrations.

### P2 — Before horizontal scaling

1. Externalize queues, locks, OTP/reset state, throttling, and cron leadership.
2. Add central environment validation and measured Mongo pool/timeouts.
3. Add structured access/error logs, metrics, tracing, queue depth, heap/event-loop alerts.
4. Fix file cleanup, active-content handling, CSRF controls, regex handling, and reset replay.

### P3 — Maintainability and governance

1. Add OpenAPI/error/version contracts.
2. Split raw-flight bounded contexts and strengthen ingestion types.
3. Add pagination, audit retention/archive, dependency remediation, deterministic toolchain, and migration ledger.

## Audit limitations

- No production database inspection, destructive migration, credential rotation, or live exploit attempt was performed.
- Production environment flags, replica count, Railway volume/storage driver, proxy header behavior, and Redis availability remain unverified.
- Static line references reflect source state on 2026-07-19 and may move as code changes.
- Historical test/runtime claims below remain historical unless repeated in the verification table above.

## Update notes — 2026-08-04

### Scheduled Airlines FHR report — IPOS Time + Departure Bag blank — **Resolved**

**Symptom:** On scheduled-airline FHR report (`GET /reports/flight-report/:serial`), **IPOS Time** and **Departure Bag** often rendered empty even when Excel import / Ramp form data existed in `fhr_collection` / source embeds.

**Root cause (code-verified):**

1. **IPOS Time** — Import/Excel frequently stores a combined `dd/mm/yyyy HH:mm` (or ISO) value in `mainDetails.IPosDate` with an empty `IPosTime`. Report aggregation only read `IPosTime` / `iposTime`. Separately, `normalizeTime` in the FHR logical schema wiped unrecognized values (Excel day-fractions `0 < n < 1`, combined datetimes) to `''`, unlike `normalizeDateTime` which preserves unrecognized raw strings.
2. **Departure Bag** — Ramp UI “Departure bags” maps to `rampDetails1.arrivalBaggageCount`; legacy / moved terminal field lives in `bagreco`. Report mapping used `arrivalBaggageCount` → `departureBaggageCount` → `terminalDetails.departureBag` and **omitted `bagreco`**. Quality metrics for depart baggage had the same gap.

**Remediation applied:**

| Area | Change |
|------|--------|
| `fhr-collection/schema/fhr-flight-report-logical-type.schema.ts` | `normalizeTime`: Date / Excel day-fraction → `HH:mm`; strip date prefix from combined datetime; keep unrecognized non-empty raw (no silent wipe). Unit tests added for IPOS/bag cases. |
| `reports/services/report-aggregation.service.ts` | `iposTime` falls back through `IPosDate` / aliases so combined datetime still yields a clock after normalize; `departureBag` includes `r.bagreco`. |
| `fhr-collection/services/fhr-collection.service.ts` | Quality `departBaggage` aggregate also reads `bagreco`. |
| Client FHR screen / PDF utils | Display fallback: extract clock from IPOS date when time empty (parity with server). |

**Verification:**

- Focused unit suite `fhr-flight-report-logical-type.schema.spec.ts` — passed (IPOS datetime extract, Excel `0.5` → `12:00`, integer departure bag).
- API `tsc --noEmit -p tsconfig.build.json` — passed after change.

**Residual / follow-up:**

1. Batch export path `getFlightReportDataBatch` still maps from `fhr_collection` embeds only (no live source overlay). Flights never mirrored into FHR after Ramp/Main save can still miss bags/IPOS until refresh/mirror — same class as prior “unsynced-batch” note in §60.
2. Scheduled Main Details UI still has no IPOS editors; IPOS remains import/API-populated. Product may want Main Details fields later.
3. Do not reintroduce `normalizeTime` blanking of unrecognized values without an explicit allowlist — that regression wiped real import clocks.

### Admin / ops seed-on-boot and seed CLIs — **Hardened (partial)**

**What changed (backend):**

- Removed `onModuleInit` / empty-collection **demo seed** paths from admin companies, departments, incidents, messaging, and stations (`seedIfEmpty` / `syncSeed` no longer run on boot or list).
- Billing service-catalog `POST …/seed` endpoint removed from controller surface.
- Excel/ops seed CLIs under advance / FHR import paths now **exit 1** with “Seeding is disabled…” instead of writing Mongo (package scripts for those seeds removed from `apps/api/package.json`).

**Why it matters:** Prevents accidental demo rows and bulk Excel reseed against production-shaped databases; aligns with production `/seed/*` block (§2 / `ProductionSeedGuard`).

**Residual:** Historical seed source files may still exist in tree for reference; operators must use normal create/save APIs or controlled import tools. Confirm Railway/CI never invoke disabled seed CLIs.

### Billing module issues register — **Pointer**

Operator/UX billing defects (BHS page title, palette sizing, navbar chrome, catalog seed removal) are tracked in:

`BWMS/modules/m-billing/docs/BILLING_ISSUES_AND_REMEDIATION.md`

Nest security/transaction items for billing remain in this file (AUD-H05, AUD-H07, activity notes).

---

## Update notes — 2026-07-27

### Computation power — consolidated issue register — **New (§62)**

Single register for **computation power** burn on the Nest process and Mongo Atlas: which operator actions saturate **CPU, heap, event-loop time, and DB I/O**, why, and what to fix first. Detail stays in **§60** (page map) and **§61** (Scheduled Airlines deep audit). Summary + remediation priority: **§62** below.

**Headline computation-power defects:**

1. **Request-time universe assembly** on Scheduled Airlines / Quality / Delay cold paths — full STA-window FHR merge + Node transforms (not pre-materialized daily rows).
2. **Sync materialize-on-read** for Bird dashboard cold ranges and Delay Report missing days — HTTP thread rebuilds multi-day shards from FHR.
3. **Full-collection scans** — `filterByDateRange` and several MIS/legacy `find().lean()` paths load entire collections into Node (§24–§25).
4. **Forced cache miss + deep clone** — UI `nocache=1` never hits list cache, yet server still `JSON.parse(JSON.stringify(result))` writes on every miss (§61).
5. **Unbounded master supplement** — regex walk of `fhr_collection` six-digit `scheduleId` docs (§61 / §60.9).
6. **Expand-then-cap / sequential writes** — MAA ADS billing expand before hard cap; prep refresh and FHR reindex await per-doc saves.
7. **In-process Excel/PDF buffers** — heap spikes on import/export/invoice render (§27 / §60.13).
8. **Chatty polling** — Missing FHR lock ~4s, notifications ~45s, dashboard card fan-out — steady QPS under concurrent operators.

---

## Update notes — 2026-07-24

### Scheduled Airlines Apply Filters — complete architecture & performance audit — **New (§61)**

Deep trace of **Apply Filters** → `GET /scheduled-airline-pipeline/daily-from-advance` (plus parallel creation-raf). Full call graph, every Mongo touch, caches, merges, CPU/RAM/event-loop analysis, scores, and redesign plan:

- **Canonical deep doc:** [`server/SCHEDULED_AIRLINES_ARCHITECTURE_PERF_AUDIT.md`](./SCHEDULED_AIRLINES_ARCHITECTURE_PERF_AUDIT.md) (Sections 1–17)
- **Register summary:** **§61** below

**Headline defects (code-verified):**

1. Client always sends `nocache=1`, so list-daily cache **never hits** on UI — yet server still **`JSON.parse(JSON.stringify(result))` writes** the cache on every miss.
2. `loadStaWindowRowsCached` drains FHR via **`fetchDashboardBundleRowsChunk`** (dashboard projection including remarks) instead of lean scheduled-merge columns.
3. Master supplement walks **all** `fhr_collection` docs with six-digit `scheduleId` (regex) — unbounded.
4. `advance_schedule_setup` loaded **three times**; creation overlay is **O(C×R)** nested loops; times overlay **O(Rf×M)** `masters.find`.
5. Architecture is **request-time universe assembly** — not viable for millions of flights without materializing daily instance rows.

Overall architecture score in audit: **~2.8 / 10**.

### Page / section CPU–RAM–DB cost inventory — **New (§60)**

Mapped FRIS **UI pages and sections** to backend services and Mongo read/write patterns that dominate **CPU, heap, event-loop time, and Atlas I/O**. Full inventory: **§60**. Cross-links existing scalability sections §24–§27, §23 (dashboard worker), AUD-H08 / AUD-H12, AUD-M12–M13. Scheduled Airlines expanded in **§61**.

**Critical energy sinks (fix first):**

| UI page / section | Dominant cost |
|---|---|
| `/fris/flights/scheduledairlines` | Full STA-window FHR merge + advance/creation expansion in Node; large in-process cache (§26); see **§61** |
| `/fris/dashboard` (Bird cards, cold range) | Sync materialize missing daily shards: multi-generator FHR rebuild + upserts per day |
| Legacy raw-flight date-range views | `filterByDateRange` full-collection scan (§24) |

**High:** Quality Report, Delay Report / delay analytics, MAA billing ADS/equipment/manpower sources, billing preparation refresh, invoice draft create/recompose, FHR reindex / advance-schedule supplement scans.

**Medium:** Dashboard drilldown merge-before-page, Missing FHR lock polling, Admin Messaging/Incidents/Audit analytics, PDF/Excel buffers, app-wide notification poll, FHR report unsynced-batch fallback.

---

## Update notes — 2026-07-19

### Superadmin directory ownership and edit parity — **Partial**

Superadmin presentation and editing now use the dedicated **`admin`** directory as the canonical panel source:

- `GET /admins/panel` is the source for the Superadmins section; user-directory superadmins are no longer returned by panel-user list endpoints.
- `Admin` profile storage, create/update DTOs, and panel serialization now include employee/profile, company, station, per-station permission, location, and status fields required by the shared edit form.
- `GET /admins/panel/:id` explicitly selects the admin-viewable `loginPassword` field so the edit modal can hydrate the same credential/profile workflow as employee editing.
- `UserService` synchronizes elevated-account profile changes into the admin record and performs an idempotent startup backfill for legacy superadmin mirrors.
- Runtime verification on 2026-07-19 synchronized **4 legacy superadmin profiles** into the admin directory.

**Residual / follow-up:**

1. Legacy superadmin documents are **hidden from user-directory APIs but retained in `users`** for credential/session safety. A destructive migration must first define collision handling, password-hash transfer, station-scope mapping, rollback, and session invalidation.
2. Cross-collection uniqueness for `userid` / email is application-enforced, not atomic at database level.
3. Plaintext `loginPassword` remains sensitive legacy data. Restrict by-ID reads to authorized superadmins and plan removal in favor of reset-only credential management.

### Selected Billing CRUD → Admin User Activity — **Implemented, durability partial**

Billing activity logging now records selected, successful CRUD/state-changing operations while excluding filter changes, page views, navigation, dashboard refreshes, audit browsing, and other read noise:

- Generic `/billing/*` interception is suppressed in `describe-user-action.util.ts`; billing mutations publish rich domain events only after the billing audit record is persisted.
- `CurrentBillingActor` carries canonical Mongo user ID plus login ID, name, email, role/account type, station, IP, browser user-agent, request ID, and correlation ID.
- `AuditEngineService` bridges an allowlist of high-value customer, catalog, contract, rate-card, settings, invoice, credit-memo, cutover, parallel-run, and decommission mutations to `USER_ACTIVITY_LOG_EVENT`.
- Explicit module, entity, summary, and field-change data are preserved when mapping User Activity events into normalized admin audit records.

Preparation batch actions are aggregated:

- **Send to Preparation** emits one event only when records were actually created; duplicate/no-op batches emit no activity.
- **Bulk delete** emits one event after confirmed deletion, using MongoDB's actual deletion result rather than requested count.
- Aggregate metadata records requested/created/deleted/skipped/failed counts, station and period scope, status/source breakdowns, up to **25 affected-flight snapshots**, remaining count, and up to 25 failure details.
- Invalid ObjectIds become per-item failures instead of aborting the whole bulk request.
- Admin → User Activity opens a keyboard-accessible, focus-managed details sheet with actor/request context, outcome, filters/scope, affected flights, field changes, and partial failures.

**Verification completed 2026-07-19:**

- Backend build: passed.
- Focused billing/activity tests: **13 passed**.
- Protection smoke suite: **31 passed, 2 skipped**.
- Changed frontend activity files: targeted ESLint and IDE diagnostics passed.
- Full client typecheck remains blocked by unrelated pre-existing errors outside the activity files.

**Residual / follow-up:**

1. User Activity persistence is event-listener based and is **not transactionally atomic** with billing mutation + billing audit persistence. Add a MongoDB outbox/transaction for durable exactly-once delivery where deployment topology supports transactions.
2. Activity and normalized audit collections have no retention/TTL policy; define compliance retention and archival before growth becomes operational debt.
3. Historical bulk deletes cannot be fully reconstructed because older billing audit entries retained IDs/status/source only, not flight snapshots. New actions capture bounded snapshots prospectively.
4. The User Activity list remains capped at 500 rows and lacks cursor pagination/action/entity search.

## Update notes — 2026-06-02

### Production readiness audit — **New sections §44–§59**

Added a structured **production readiness overview** and **16 new issue sections** covering gaps not previously captured: health probes, graceful shutdown, horizontal scaling / in-memory state, MongoDB transactions, public PII document access, exception handling, env validation, deployment artifacts, cron leader election, file storage, API contracts, session revocation, observability, connection pooling, environment-gated modules, and global validation strictness.

**Cross-cutting themes:**

| Theme | Severity | Summary |
|-------|----------|---------|
| **Architecture** | High | Single-process assumptions; in-memory queues, locks, OTP, and caches do not compose across replicas without Redis or external workers. |
| **Security** | High | Public registration document download; no Helmet; JWT-only report routes (§41); long-lived sessions without revocation; weak global ValidationPipe. |
| **Scalability** | High | Full-collection scans (§24–§26); per-process dashboard refresh queue; hourly cron on every instance; local disk uploads. |
| **Reliability** | Medium | No health/readiness probes; no graceful shutdown; no MongoDB transactions on dual writes (§28, §34). |
| **Observability** | Medium | Protection logs exist (§15, §43) but no metrics, tracing, or unified error envelope. |
| **Operations** | Medium | No Dockerfile or server CI; `SeedModule` / import modules always registered; `.env.example` not committed for server. |

See **§44–§59** and the updated **prioritized remediation order** at the end of this document.

---

## Update notes — 2026-06-01

### Operational protection (`ProtectionModule`) — **Partial**

Added **`server/src/protection/`** and registered **`ProtectionModule`** globally in `app.module.ts`. All protections are **feature-flag controlled** and **default off** so operational workflows are unchanged until env is set.

| Capability | Implementation | Default |
|------------|----------------|---------|
| Rate limiting | `OperationalThrottlerGuard` (custom; per-user when JWT present, else per-IP) | `ENABLE_RATE_LIMITING=false` |
| Gradual rollout | `THROTTLE_MODE=monitor-only \| warn-only \| enforcement` | `monitor-only` |
| Redis counters | `RedisThrottleStore` with in-memory fallback | `ENABLE_REDIS_THROTTLING=false` |
| Request timeouts | `RequestTimeoutInterceptor` + `@SkipTimeout` | `ENABLE_REQUEST_TIMEOUTS=false` |
| Import concurrency | `ImportConcurrencyInterceptor` on `POST /import/maa-march` | `ENABLE_IMPORT_CONCURRENCY_CONTROL=false` |
| Export concurrency | `ExportConcurrencyInterceptor` (ready; wire on production export routes as needed) | `ENABLE_EXPORT_CONCURRENCY_CONTROL=false` |
| Structured protection logs | `ProtectionLoggerService` — `[EVENT] key=value` via Nest `Logger` | always available when events fire |
| Request correlation | `RequestIdMiddleware` → `x-request-id` response header | always on |
| Auth brute-force signal | `AuthAttemptTrackerService` → `[AUTH_SUSPICIOUS_ACTIVITY]` | `ENABLE_SECURITY_LOGGING=false` |
| Production seed block | `ProductionSeedGuard` on `SeedController` | `BLOCK_SEED_IN_PRODUCTION=true` |
| OTP rate exceed | logged as `[RATE_LIMIT_BLOCKED]` category `AUTH_OTP` | — |

**Auth routes** tagged with `@ThrottleCategoryDecorator('AUTH')` on login, admin-login, forgot-password, reset-password.

**Documentation:** `server/OPERATIONAL_PROTECTION_ROLLOUT.md` (flags, rollback, monitoring).

**Enterprise smoke tests** (`server/test/protection/`, `npm run test:smoke`):

- Harness app mirrors production path prefixes (`/auth`, `/reports`, `/dashboard-summary`, `/import`, `/seed`, `/exports`).
- **33 e2e tests** (auth throttling, shared-office IP, dashboard polling bursts, monitor/warn/enforcement modes, Redis fallback, concurrency, timeouts, seed block, logging, non-breaking defaults).
- **k6** scripts: `server/test/k6/` (staging load).
- **Postman:** `server/test/postman/fris-protection-smoke.postman_collection.json`.
- **CI example:** `server/test/ci/github-actions-smoke.yml.example`.
- **Live smoke (optional):** `RUN_LIVE_SMOKE=1` + `SMOKE_BASE_URL` — see `test/protection/live/`.

**Residual / before production enforcement:**

1. Measure real dashboard polling P99 on staging; set `THROTTLE_*_LIMIT` **above** measured usage (do not guess).
2. Run **`THROTTLE_MODE=monitor-only`** soak, then `warn-only`, then `enforcement`.
3. Install **`ioredis`** if using `ENABLE_REDIS_THROTTLING=true`; otherwise fallback is per-instance in-memory.
4. Apply **`@SkipTimeout`** on long-running report/export handlers in production code.
5. Wire **`ExportConcurrencyInterceptor`** on canonical export endpoints (harness demonstrates pattern).
6. `@nestjs/throttler` remains in `package.json` but is **not** the active guard — custom guard supports monitor-only (see §6, §36, §43).
7. Edge/reverse-proxy rate limits for `/auth/*` still recommended in addition to app limits.

### Advance Invoicing — flight report data and NAV export — **Partial**

- Added **`AdvanceInvoicingModule`** (`server/src/advance-invoicing/`) with:
  - **`GET /advance-invoicing/scheduled-flight-data`** — loads scheduled flight rows for invoicing from `listDailyFromAdvance` + `fhr_collection`, mapped via `invoicing-flight-report.mapper.ts` (ATD / exported-date filters).
  - **`POST /advance-invoicing/export-nav`** — batch wrapper around `RawFlightDataService.setNavisionDataExportStatus` (still available; client now prefers per-serial PATCH — see below).
- Both routes use **`@Roles(...OPERATIONAL_ROLES)`** and global JWT (§1).

### NAV export not reflected on Scheduled Airlines table — **Resolved**

**Symptom:** After exporting from Advance → Invoicing, the Scheduled Airlines **NAV** column still showed **No** (e.g. serial **16706**).

**Root causes:**

1. **`setNavisionDataExportStatus`** updated `raw_flight_data` but called **`fhrCollectionService.upsertMerge(serial, {}, …)`** with an **empty** payload, so FHR embeds never received `exportedNAV`.
2. **`listDailyFromAdvance` → `finalizeDailyFhrCollectionOnly`** built table rows from **`fhr_collection`** only and **did not merge** `exportedNAV` / `Exported NAV` from `raw_flight_data` back onto daily row `data`.
3. Display values were inconsistent (**`Exported`** vs **`Yes`**); operators expect **Yes** on the scheduled table.

**Remediation (server):**

1. **`setNavisionDataExportStatus`** now sets **`exportedNAV: Yes` / `No`** (and legacy **`Exported NAV`** keys) on `raw_flight_data`, and merges **`mainDetails.exportedNAV`** + **`navisionDataExportStatus`** on `fhr_collection`.
2. **`finalizeDailyFhrCollectionOnly`** batch-loads NAV flags from `raw_flight_data` (`loadExportedNavLabelsBySerials`) and applies **`exportedNavLabelForDailyRow`** from FHR `mainDetails` + raw lookup so scheduled pipeline rows expose **`exportedNAV: Yes`**.
3. **`serialMatchFilter`** extended with **`data.serialNo`** and **`data.legacySlNo`** so export updates match instance vs legacy serials.
4. When no `raw_flight_data` doc exists, export **creates** one with NAV fields instead of failing (supports FHR-only daily rows).
5. **`invalidateListDailyFromAdvanceCache()`** still runs after export so the next scheduled list fetch sees updated NAV.

**Remediation (client):**

1. Invoicing export calls **`PATCH /raw-flight-data/navision-export/:serialNo`** per selected serial (`setNavisionDataExportStatus` in `client/lib/api.ts` with **`credentials: 'include'`**) instead of a broken **`POST /api-backend`** path that hit Nest as **`POST /`** (404).
2. Scheduled Airlines table treats **`Yes`**, **`Exported`**, and **`Y`** as exported (`isExportedNavStatus`); NAV column displays **Yes** in green when exported.

**Residual / follow-up:**

1. Re-export or **Apply Filters** again on Scheduled Airlines after server restart if an older export only wrote **`Exported`** to raw data without FHR merge — new loads normalize to **Yes**.
2. **`POST /advance-invoicing/export-nav`** remains for batch use; prefer documenting one canonical path to avoid drift.
3. Equipment/manpower invoicing mode is **not** wired on the client (toast only).
4. Add integration tests for export → `listDailyFromAdvance` NAV field on a fixture serial.

### User registration consolidated under `user` module — **Resolved**

- Moved **`server/src/user-registration/`** → **`server/src/user/registration/`** (controller, services, DTOs, schemas/utils).
- Invite/draft/documents/activity now live on the single **`users`** collection (`inviteToken`, `registrationDraft`, `registrationDocuments`, `registrationActivity`, etc.); legacy collections **`user_invites`**, **`user_invite_documents`**, **`user_registration_activity`** are unused (safe to drop after backup).
- **`UserRegistrationModule`** removed from `app.module.ts`; routes registered via **`UserModule`** (API paths unchanged: `/invite-user`, `/user-registration-workspace`, etc.).
- Login blocks **`accountStatus: invited`** / pending users.

### Auth — Advance/Creation tab navigation (server permission check) — **Resolved**

- Added **`GET /auth/fris/navigate/advance`** and **`GET /auth/fris/navigate/creation`** — verify `userFlags` sub-page permission and return **`redirectPath`** (client uses `client/lib/fris-navigation.ts`).

### Related client work (traceability)

- Invoicing UI: `AdvanceScreen` `InvoicingPanel`, scrollable flight-report table (viewport-bounded flex layout), serial number column after **Select Data**.
- See **`client/lib/invoicing-api.ts`**, **`client/components/fris/advance/invoicing/*`**.

---

## Update notes — 2026-05-27

### Quality Report — scheduled flight details and baggage on-time (server)

- Added **`GET /reports/quality-scheduled-table`** (`ReportsController.qualityScheduledTable`) so the Quality Report **Scheduled flight details** table and **Baggage on-time** chart read from one authoritative **`fhr_collection`** aggregation instead of static client mock rows.
- Implemented **`FhrCollectionService.getQualityReportScheduledTableForStaYmdWindow(fromYmd, toYmd, airline?)`**, which:
  - filters documents by STA calendar day in the requested window (same STA rules as other scheduled-airlines FHR reads),
  - groups metrics **per airline** (optional `airline` query narrows to one operator),
  - returns per-airline counts (flights, cancellations, additional handling), weighted percentages, pax/cargo/mail/baggage totals, and a composite `qualityScore`.
- Standardized **baggage on-time** counting with shared helpers `qualityBagAchieved`, `qualityTimeDiffMinutes`, and `qualityTimeToMinutes`:
  - **First bag on-time:** `firstBagInBmaTime` is **≤ 15 minutes** after ATA (`mainDetails` / `rampDetails1` ATA fields).
  - **Last bag on-time:** `lastBagInBmaTime` is **≤ 45 minutes** after ATA (threshold corrected from an earlier **40**-minute draft).
  - **Denominator:** **`flights`** (total scheduled rows for the airline in range), not operated-only (`flights − cancels`).
- Reuses **`findAllLeanForScheduledTableMerge`** → **`loadStaWindowRowsCached`** (see §26) for the STA window scan; same performance profile as delay analytics and other scheduled-table merges.
- **Auth note:** the new route is behind **global JWT** but does **not** yet carry `@Roles(...OPERATIONAL_ROLES)` like `main-report` / `flight-report` reads (see §41).

### Related client work (out of scope for this file, for traceability)

- Quality Report default date range set to **2026-02-28 → 2026-03-31**; table total row and chart bar labels are client-side.
- Delay Report **Operational insights** uses a **Next.js** route (`client/app/api/generate-insights`) with **Groq** — not a NestJS endpoint; API key stays server-side in the Next app only.

## Update notes — 2026-05-25 to 2026-05-26

### Changes made in `server/` from this morning

- Updated `server/src/user/dto/create-panel-user.dto.ts` so panel-user creation now treats `password` as a required field, trims it through `class-transformer`, and restricts panel-user `role` to `employee` or `operations`.
- Reused the shared password policy helper in `server/src/common/validators/password-policy.ts` for panel-user creation, covering minimum 8 characters, uppercase, lowercase, number, and special-character checks.
- Updated `server/src/user/services/user.service.ts` so create-user now validates the normalized password on the backend before hashing and saving it, instead of accepting weaker or missing values.
- Standardized `UserService` user lookup helpers by restoring `findById()` and normalizing `findByEmail()` / `findByUserId()` behavior, which also fixed the watch-mode TypeScript error triggered by `IdentityService`.
- Added focused coverage in `server/src/user/services/user.service.spec.ts` to verify that panel-user creation returns unmet password-rule messages and validates the trimmed password value that will actually be stored.

### Related integration work added later today

- Added a standalone read-only MCP server at `apps/mcp-server/` that talks to the NestJS backend over HTTP instead of touching MongoDB directly.
- Limited the initial MCP surface to **read-only** operational tools (dashboard summary, FHR lookup, flight search, operational metrics, support ticket read, cancellations read).
- Added tool/input allowlists, typed Zod validation, structured logging, timeout / response-size limits, and backend path restrictions so the MCP layer does not expose seed / prune / reset / import or destructive flight actions.
- Added integration docs under `docs/mcp/` and `.cursor/mcp.json` for local Cursor use.

### Follow-up work on 2026-05-26

- Added a read-only `GET /fhr-collection/cleaning-services` endpoint so the Cleaning Services report/export can be sourced directly from `fhr_collection` instead of stitching per-flight details in the browser.
- Restricted those rows to flights that actually contain cleaning date/time values and applied the UI date range against the FHR STA window.
- Normalized cleaning start/end date + time splitting, converted duration to **`hh:mm`**, and exposed `TypeofHandling`, `Aircraft Body`, `Flight No`, and derived `Type of Flight` for export use.
- Kept `advance-aircraft` as the authority for `Aircraft Body` lookup when `TypeCraft` matches the catalog.

### Auth hardening progress added later on 2026-05-26

- Registered global default-deny authentication in `server/src/app.module.ts` using `APP_GUARD` so JWT auth now applies across the API surface by default instead of relying on scattered controller guards.
- Canonicalized public-route handling with `server/src/common/decorators/public.decorator.ts` and `server/src/common/guards/global-jwt-auth.guard.ts`, keeping only the intended anonymous routes (`/auth/login`, `/auth/forgot-password`, `/auth/reset-password`, etc.) opted out.
- Added consistent principal injection with `server/src/common/decorators/current-user.decorator.ts` and hardened JWT validation in `server/src/auth/strategies/jwt.strategy.ts` so only real access tokens (not password-reset tokens) populate `req.user`.
- Registered `RolesGuard` after JWT auth and added explicit `@Roles()` coverage to sensitive read/write routes across seed, import, admin, user-management, dashboard mutations, raw-flight modifications, FHR, and report endpoints.
- Tightened report-read exposure for the Scheduled Airlines FHR flow by role-protecting `GET /reports/main-report/:serialNo`, `GET /reports/equipment-sheet/:serialNo`, `GET /reports/flight-report/:serialNo`, `GET /fhr-collection/flight/:serialNo`, and related cleaning-services reads.
- Added focused auth/authz verification coverage in:
  - `server/src/common/guards/global-jwt-auth.guard.spec.ts`
  - `server/src/auth/guards/roles.guard.spec.ts`
  - `server/src/auth/strategies/jwt.strategy.spec.ts`
  - `server/src/auth/auth-risk-verification.spec.ts`
  - `server/src/auth/fhr-report-flow-route-protection.spec.ts`
- Added protected `GET /auth/session` so the client can verify a real authenticated session without probing business-data endpoints directly.

This document describes known risks and technical gaps in the **NestJS server** (`server/`), including **security**, **performance**, **MongoDB data duplication / integrity**, and operational maintainability, with practical suggestions to fix or mitigate each item.

**Related architecture docs (authoritative for dashboard / scheduled list):**

- `server/DASHBOARD_ARCHITECTURE_AUDIT.md` — materialized read model, event-driven refresh
- `server/DASHBOARD_REACTIVE_MATERIALIZED_ARCHITECTURE.md` — daily `dashboard_summaries` shards, in-memory range compose
- `server/DASHBOARD_DATE_RANGE_AND_RENDERING.md` — Bird UI route → data source map (some JSDoc paths are stale; see §32–§33)
- `server/SCHEDULED_AIRLINES_ARCHITECTURE_PERF_AUDIT.md` — **complete** Apply Filters → JSON computational audit (§61)
- **§62** in this file — consolidated **computation power** issue register (CPU / RAM / event-loop / Atlas)

**Operational protection (rollout + smoke tests):**

- `server/OPERATIONAL_PROTECTION_ROLLOUT.md` — env flags, gradual enforcement, rollback
- `server/test/protection/ARCHITECTURE.md` — smoke test layers (unit / harness / k6 / live)
- `server/test/protection/ROLLOUT_CHECKLIST.md` — pre-enforcement gates
- `server/test/protection/FINAL_REPORT.md` — post-staging report template

**System architecture & data-flow maps (full stack):**

- `docs/architecture/README.md` — index (page → API → service → collection)
- `docs/architecture/MASTER_DATA_FLOW.md`, `CRUD_MATRIX.md`, `PAGE_DATA_FLOWS/`, `COLLECTION_MAPS/`

**Maintenance scripts (ops):** `server/scripts/find-maindetails-without-fhr.ts`, `server/scripts/merge-maindetails-serial-duplicates.ts`

---

## Historical issue ledger (§1–§62)

> Sections below preserve prior investigations and implementation history. Their prose may describe code that has since changed. Use the active `AUD-*` register and authoritative remediation list above for current release decisions. **§62** (computation power), **§60** (page/section energy map), and **§61** (Scheduled Airlines deep perf audit) remain current for capacity planning.

## Historical status legend

| Tag | Meaning |
|-----|---------|
| **Open** | Still applies as written |
| **Partial** | Improved but not fully resolved |
| **Resolved** | Addressed in codebase; section kept for history |
| **Legacy** | Dead code or Mongo collection; safe to drop after verification |

---

## Historical production readiness overview — **Superseded 2026-07-19**

This table was the June 2026 release view. It remains for traceability; do not use it as a current release gate.

| Dimension | Open / partial sections | Production impact |
|-----------|-------------------------|-------------------|
| **Security** | §2–§3, §4, §5, §6, §7, §10–§11, §37, §39, §41, **§48**, **§55**, **§59** | Credential leaks, unauthorized data access, brute-force, missing headers, PII exposure |
| **Architecture** | §20, §28, §32–§34, **§46**, **§47**, **§54**, **§58** | Dual-write drift, legacy module sprawl, no API versioning, modules not env-gated |
| **Scalability** | §24–§27, **§46**, **§52**, **§57**, **§60**, **§61**, **§62** | O(n) collection scans, per-process caches/queues, cron duplication, default Mongo pool; page-level CPU/RAM sinks; Scheduled Airlines request-time assembly; consolidated computation-power register |
| **Reliability** | **§44**, **§45**, **§47**, §23 (worker path) | Unhealthy pods stay in rotation; in-flight work lost on deploy; partial writes on failure |
| **Observability** | §15, **§49**, **§56** | Hard to debug prod incidents; inconsistent error shapes; no SLO dashboards |
| **Operations** | §2–§3, §9, **§51**, **§58**, §43 | No container story; seed/import always loaded; protection flags default off |
| **Data integrity** | §28–§31, §34, §42 | Duplicate rows, denormalization drift, weak ingest keys |
| **Testing / CI** | §16–§17, §41, §42, §43 | Domain coverage thin; full-app e2e diverges from `main.ts` |

**Resolved or materially improved (do not regress):** §1 global JWT, §23 dashboard materialization, §38 panel-user passwords, §40 cleaning services, §43 protection harness (defaults off).

---

## 1. Authentication gap on most HTTP routes — **Resolved**

### What changed

This gap has now been closed in code:

1. `APP_GUARD` now enforces JWT globally via a dedicated `GlobalJwtAuthGuard`.
2. Only explicitly annotated routes bypass auth via the canonical `@Public()` decorator.
3. `RolesGuard` runs after JWT auth, so role checks no longer depend on scattered local guard ordering.
4. `JwtStrategy` now validates access-token purpose/account type and consistently resolves principals for admin and panel-user sessions.

### Why it matters

Authentication is the primary boundary between “anonymous internet” and your database. Missing guards on CRUD and reporting endpoints is one of the highest-impact security defects in a typical B2B or operational API.

### Residual follow-up

1. Keep the public whitelist intentionally small and regression-test it whenever new auth, health, or integration routes are added.
2. Continue defense in depth at the edge (IP allowlist, VPN, private subnet, WAF / gateway rules) instead of relying on app auth alone.
3. Maintain focused `401` / `403` regression coverage for new high-risk modules and report reads.

---

## 2. Seed endpoints are powerful and unauthenticated — **Partial**

### What is wrong

`SeedController` exposes routes under `/seed` that can:

- Fill collections with test data for a serial number (`POST /seed/fill`, `/seed/fill/:serialNo`).
- Run workbook-based seeds with optional paths and flags (including options like **wiping a collection** before reseed).
- Accept **large file uploads** for aircraft universal seeding.

These endpoints are no longer anonymous after the 2026-05-26 auth hardening pass because global JWT enforcement now applies and elevated role checks were added. The remaining concern is that these routes are still operationally dangerous if left enabled in the wrong environment.

### Why it matters

Anyone who can hit the URL can **corrupt, wipe, or flood** your database and disk. This is especially dangerous if the app is ever exposed beyond a trusted developer machine.

### Remaining suggestions

1. **Do not register `SeedModule` in production**  
   - Use `ConfigService` and `process.env.NODE_ENV` (or a dedicated `ENABLE_SEED_ROUTES=false`) so `SeedModule` is imported only when explicitly enabled.

2. **If seed must exist in some environments**  
   - Protect with **superadmin-only** (or stronger): `@UseGuards(JwtAuthGuard, RolesGuard)` and a role that is never assigned to normal operators.  
   - Optionally require a **second secret** header or one-time token from CI, not just JWT.

3. **Operational safety**  
   - Default `dryRun` to `true` in non-production where possible.  
   - Log every seed invocation with actor id and IP.  
   - Remove or narrow `wipeCollectionFirst`-style flags outside tightly controlled maintenance windows.

4. **Production guard (added 2026-06-01)** — `ProductionSeedGuard` on `SeedController` blocks all `/seed/*` when `NODE_ENV=production` and `BLOCK_SEED_IN_PRODUCTION=true` (default), logging `[SECURITY_BLOCK]`. Non-production environments unchanged.

---

## 3. Bulk Excel import endpoint is public — **Partial**

### What changed

`MaaExcelImportController` is no longer public after the global JWT + role-hardening pass. The remaining risk is the size and operational impact of the upload path, not anonymous reachability.

### Why it matters

Bulk import still carries **data poisoning**, **DoS via large uploads**, and **unauthorized mass-change** risk if the wrong role gets access or the route is exposed in the wrong environment.

### Remaining suggestions

1. Require **JWT + role** (e.g. admin or a dedicated `data_import` role).  
2. Lower default `limits.fileSize` unless business needs 50MB; consider streaming/chunked processing for very large files.  
3. Rate-limit import routes per user or per IP — **partial:** `ImportConcurrencyInterceptor` on `POST /import/maa-march` when `ENABLE_IMPORT_CONCURRENCY_CONTROL=true`; global rate limits via `OperationalThrottlerGuard` when `ENABLE_RATE_LIMITING=true` (§43).  
4. Register this module only when `ENABLE_BULK_IMPORT=true` in non-production if imports are rare.  
5. Oversized uploads log `[REQUEST_REJECTED]` when `ENABLE_SECURITY_LOGGING=true` (`MulterLimitLoggingFilter`).

---

## 4. Secrets and environment file hygiene — **Partial**

### What changed

Root **`.gitignore`** now includes plain **`.env`** (line 118), so accidental commit of live credentials is less likely than when this section was first written.

### What is still wrong

1. **`.env.example` is also gitignored** at repo root (with only `!client/.env.example` un-ignored). There is **no committed `server/.env.example`** documenting `MONGO_URI`, `JWT_SECRET`, `SUPERADMIN_*`, protection flags, cookie settings, mail, etc.  
2. **`ConfigModule`** loads `.env` / `env` files with **no startup schema validation** beyond isolated `getOrThrow` calls (§8, **§50**).  
3. Production should use a **secret manager**, not files on disk.

### Why it matters

Committed secrets end up in git history forever unless rotated and scrubbed. Missing `.env.example` slows onboarding and causes misconfiguration in staging/production.

### Remaining suggestions

1. Add **`server/.env.example`** (dummy values + comments) and adjust `.gitignore` to allow `!server/.env.example`.  
2. If `.env` was ever committed: **rotate all secrets** and scrub history (`git filter-repo` / BFG).  
3. Prefer **managed secrets** in production (Kubernetes secrets, cloud secret manager, CI variables).  
4. Add a **validated env module** at bootstrap (§50).

---

## 5. CORS configuration includes a placeholder origin — **Resolved 2026-07-19**

### What is wrong

`main.ts` enables CORS with a hardcoded list including `https://yourdomain.com`, which is not a real deployment target unless you own that domain and use it.

### Why it matters

Misconfigured CORS either **blocks legitimate frontends** or **accidentally allows wrong origins** if lists are edited carelessly. Placeholders suggest the production story is unfinished.

### Suggestions to fix

1. Drive `origin` from **environment variables**, e.g. comma-separated `CORS_ORIGINS=https://app.example.com,https://staging.example.com`.  
2. Parse and validate that list at startup; fail fast if production has no origins configured.  
3. Remove placeholder domains from committed defaults; document required env in `.env.example`.

---

## 6. No rate limiting on authentication endpoints — **Partial**

### What changed (2026-06-01)

1. **`OperationalThrottlerGuard`** applies **AUTH** category limits to `/auth/login`, `/auth/admin-login`, `/auth/forgot-password`, `/auth/reset-password` (via path match + `@ThrottleCategoryDecorator('AUTH')`).
2. **`AuthAttemptTrackerService`** logs **`[AUTH_SUSPICIOUS_ACTIVITY]`** after repeated failed logins when `ENABLE_SECURITY_LOGGING=true`.
3. **`THROTTLE_MODE`** supports **monitor-only** (log only, no block) for safe production rollout.

### What is still wrong / off by default

1. **`ENABLE_RATE_LIMITING` defaults to `false`** — no throttling until explicitly enabled in env.  
2. **`@nestjs/throttler`** is still **not** registered; the custom guard replaces it for gradual-enforcement support (§36).  
3. No reverse-proxy rate limit is documented in-repo for `/auth/*`.  
4. Account lockout (hard block after N failures) is **logging only**, not a persistent lock.

### Why it matters

Until flags are enabled in production, auth endpoints behave as before. When enabling enforcement, tune limits using staging metrics and `npm run test:smoke` (see §43).

### Remaining suggestions

1. Enable on staging: `ENABLE_RATE_LIMITING=true`, `THROTTLE_MODE=monitor-only`, then soak and tune `THROTTLE_AUTH_LIMIT`.  
2. Add **edge rate limits** (nginx, Cloudflare, API gateway) for `/auth/*` as defense in depth.  
3. Optional: persistent lockout store (Redis/Mongo TTL) if `[AUTH_SUSPICIOUS_ACTIVITY]` volume warrants it.

---

## 7. Missing standard HTTP security middleware — **Resolved 2026-07-19**

### What is wrong

The bootstrap code does not set security headers (for example **Content-Security-Policy**, **X-Content-Type-Options**, **frame-ancestors**) via something like **Helmet** for Express.

### Why it matters

For browser-based clients, missing headers increases exposure to **clickjacking**, **MIME sniffing** issues, and other browser-class attacks. Severity depends on how the API is used (cookies vs pure Bearer tokens, embedded iframes, etc.).

### Suggestions to fix

1. Add **`helmet`** (or equivalent) early in the middleware chain in `main.ts`.  
2. Tune CSP for your actual frontend origins and static asset needs.  
3. If the API is only machine-to-machine with no browser, document that choice — but Helmet is still low cost for many deployments.

---

## 8. MongoDB URI not validated with `getOrThrow`

### What is wrong

`MongooseModule.forRootAsync` uses `config.get<string>('MONGO_URI')` without requiring the variable to exist at startup in the same way JWT config does with `getOrThrow`.

### Why it matters

A typo or missing `MONGO_URI` can produce **opaque connection errors** later, or connect to an unexpected default if any fallback exists elsewhere.

### Suggestions to fix

1. Use **`config.getOrThrow<string>('MONGO_URI')`** in the factory, or a small **validated config module** (e.g. `zod` / `joi` schema) that runs at bootstrap.  
2. Optionally validate URI shape (starts with `mongodb://` or `mongodb+srv://`).

---

## 9. Superadmin bootstrap fails hard if env is incomplete

### What is wrong

`AdminBootstrapService` throws during `onModuleInit` if any `SUPERADMIN_*` variable is missing. The application will not start.

### Why it matters

This is **good for production** if you always want a guaranteed bootstrap path, but it can **block local onboarding** for developers who only need a subset of features, unless documented.

### Suggestions to fix

1. Document **all required variables** in `README` and `.env.example`.  
2. Optionally gate bootstrap: if `NODE_ENV === 'development'` and `SKIP_SUPERADMIN_BOOTSTRAP=true`, skip creation (use only with care).  
3. Prefer **explicit failure in production** only: e.g. require vars when `NODE_ENV === 'production'`.

---

## 10. `AdminService.updatePassword` may store plaintext — **Partial**

### What is wrong

`createAdmin` hashes passwords with `bcrypt`, but `updatePassword` still assigns the `password` field **directly** from the argument. **`AuthService` reset-password now hashes before calling `updatePassword`** (§37), but any other caller passing plaintext would persist an unhashed password.

### Why it matters

Inconsistent hashing is a classic source of **credential leaks** in backups, logs, or DB dumps.

### Suggestions to fix

1. In `updatePassword`, always **`await bcrypt.hash(password, 10)`** (or use the same salt rounds as `createAdmin`) before persisting.  
2. Search all callers of `updatePassword` and ensure they never pass pre-hashed values unless you intentionally support that (rare).  
3. Add a unit test: update password then verify with `bcrypt.compare`.

---

## 11. Weak validation on some auth controller inputs

### What is wrong

`AuthController` uses individual `@Body('userid')` / `@Body('password')` for login instead of a **DTO class** with `class-validator` decorators, and `resetPassword` uses `@Body() body: any`.

### Why it matters

The global `ValidationPipe` with `whitelist: true` works best with **class-based DTOs**. Loose `any` and primitive body fragments skip structured validation and harm type safety.

### Suggestions to fix

1. Introduce **`LoginDto`**, **`ForgotPasswordDto`**, **`ResetPasswordDto`** with `@IsString()`, `@MinLength()`, `@IsEmail()`, etc., and use `@Body() dto: LoginDto`.  
2. Remove `body: any` on reset-password; use a typed DTO.  
3. Remove broad `eslint-disable` blocks on the controller once types are clean.

---

## 12. TypeScript compiler strictness is relaxed

### What is wrong

`server/tsconfig.json` sets `noImplicitAny: false` and `strictBindCallApply: false`, among other relaxed options.

### Why it matters

Large codebases under loose TS settings accumulate **`any`**, wrong arity calls, and subtle bugs that only show at runtime.

### Suggestions to fix

1. Enable **`noImplicitAny: true`** in stages: fix the worst modules first.  
2. Enable **`strictBindCallApply: true`**.  
3. Consider **`strict: true`** long term, or use project references to tighten new packages first.

---

## 13. ESLint allows explicit `any`

### What is wrong

`eslint.config.mjs` turns **`@typescript-eslint/no-explicit-any` off**.

### Why it matters

Explicit `any` disables many static checks and hides integration bugs.

### Suggestions to fix

1. Turn the rule to **`warn` or `error`** for `src/`, and fix incrementally.  
2. Use `unknown` plus narrowers at boundaries (HTTP body, Mongo raw docs).

---

## 14. Request logging middleware uses wrong or ambient types

### What is wrong

`MiddlewaresMiddleware` types `req` and `res` as `Request` and `Response` without importing them from **Express**. Depending on TS lib settings, these may resolve to **DOM** `Request`/`Response` or loose types, which is misleading.

### Why it matters

Incorrect types hide bugs (wrong property access) and confuse tooling.

### Suggestions to fix

1. Import types from **`express`**: `import type { Request, Response } from 'express';`  
2. Prefer **`Logger` from `@nestjs/common`** instead of `console.log` for request logs (see next section).

---

## 15. Logging is mostly `console.log` — **Partial**

### What changed (2026-06-01)

1. **`ProtectionLoggerService`** emits structured **`[EVENT] key=value`** lines for rate limits, concurrency, timeouts, Redis fallback, auth suspicious activity, security blocks, etc. (context: `Protection`).  
2. **`RequestIdMiddleware`** sets **`x-request-id`** on every response for correlation.  
3. Protection logs **omit** passwords and JWTs by design; smoke tests assert no sensitive leakage (`test/protection/logging/`).

### What is still wrong

1. **`MiddlewaresMiddleware`** still uses Nest `Logger` per request (`METHOD url`) — not structured JSON.  
2. No global **Pino/Winston JSON** pipeline for all domains.  
3. Business-domain services still mix ad-hoc `Logger` / `console` patterns.

### Why it matters

Protection/ops events are now searchable; full observability still needs a unified log stack.

### Remaining suggestions

1. Adopt **Pino** or **Winston** JSON for the whole app; keep protection event format compatible.  
2. Propagate **`x-request-id`** into domain log fields via `AsyncLocalStorage`.  
3. Redact sensitive fields globally in serializers.

---

## 16. Test coverage is thin compared to surface area — **Partial**

### What is wrong

There are many controllers and services and most business domains still lack meaningful automated coverage. This improved on 2026-05-26 for the auth boundary: global JWT enforcement, roles behavior, JWT strategy validation, auth-risk regression, and FHR report-flow route protection now have dedicated tests, but the wider domain surface still remains lightly tested.

### What changed (2026-06-01)

**Enterprise protection smoke suite** (`server/test/protection/`, `npm run test:smoke`):

- **33 harness e2e tests** — auth throttling, shared-office IP (60 users / one NAT), dashboard polling simulation, monitor/warn/enforcement modes, Redis fallback, import/export concurrency, timeouts, seed production block, structured logging, non-breaking defaults-off regression.
- **Unit specs** under `server/src/protection/*.spec.ts`.
- **k6** load scripts for staging (`server/test/k6/`).
- **Postman** collection for manual staging checks.
- **CI example:** `server/test/ci/github-actions-smoke.yml.example`.

Live full-app smoke (`RUN_LIVE_SMOKE=1`) remains optional and requires Mongo + running server.

### Why it matters

Regressions in business rules (MIS, FHR, ramp, dashboards) will only be caught manually or in production — but **protection rollout regressions** (false 429s, broken polling, shared-IP blocking) are now gated by `test:smoke`.

### Remaining suggestions

1. Add **contract tests** for critical services (auth, permissions, financial or safety-related calculations if any).  
2. Add **controller tests** with mocked services for new and high-risk endpoints.  
3. Prioritize **integration tests** against a test MongoDB for seed/import and complex pipelines.  
4. Run **`npm run test:smoke:all`** in CI on protection-related PRs (see §43).

---

## 17. E2E test does not mirror production bootstrap — **Partial**

### What is wrong

`test/app.e2e-spec.ts` still creates `AppModule` without the same global middleware, body parser limits, compression, CORS, and pipes as **`main.ts`** (and may 404 on `/` if bootstrap differs).

### What changed (2026-06-01)

**Protection harness e2e** (`test/helpers/protection-test-app.factory.ts`) boots `ProtectionModule` + route stubs with production path prefixes, `RequestIdMiddleware`, and env-driven guards — used by **`npm run test:smoke`** (see §16, §43). This does **not** replace full-app e2e but validates protection behavior in CI without Mongo.

### Why it matters

Full-app e2e can still diverge from production; protection smoke is isolated and repeatable.

### Remaining suggestions

1. Extract a **`createApp()`** factory used by both `main.ts` and e2e setup that applies pipes, limits, CORS, etc.  
2. Fix or retire **`test/app.e2e-spec.ts`** (align with `AppController` root route or use shared factory).  
3. Optional live suite: `npm run test:smoke:live` against staging with `SMOKE_BASE_URL`.

---

## 18. `xlsx` dependency and supply chain — **Superseded by AUD-M07/AUD-L03**

### What is wrong

The project depends on **`xlsx`** (SheetJS) at `^0.18.5`. That family of packages has historically attracted **security advisories**; version choice should be reviewed regularly.

### Why it matters

Parsing untrusted spreadsheets in-process can lead to **memory exhaustion** or parser bugs depending on advisories and usage.

### Suggestions to fix

1. Run **`npm audit`** regularly and patch.  
2. Prefer **`exceljs`** for new code paths if it meets feature needs (the project already uses exceljs elsewhere).  
3. Run parsing in a **worker** or **separate process** with resource limits for untrusted uploads.

---

## 19. ESLint `lint` script auto-fixes on run

### What is wrong

`package.json` defines lint as `eslint ... --fix`, which **rewrites files** whenever lint runs.

### Why it matters

CI and local runs can **change code unexpectedly**, hide lint failures that would have blocked a merge, and create noisy diffs.

### Suggestions to fix

1. Use **`eslint` without `--fix`** in the default `lint` script.  
2. Add a separate script: **`lint:fix`**: `eslint ... --fix`.

---

## 20. Large module count and naming split (maintainability)

### What is wrong

The server contains many feature modules, including parallel concepts (**“advance-*”** vs legacy **`ns-raw-flight-data/...`** style routes). New contributors must learn multiple naming schemes and module boundaries.

### Why it matters

This is not a “bug” but it **increases cost** of changes, reviews, and consistent security policies (guards, DTOs, logging).

### Suggestions to fix

1. Add a short **`ARCHITECTURE.md`** describing domains: legacy vs advance, which DB collections they own.  
2. When adding features, **follow one naming and folder convention**; plan gradual consolidation where duplicate domains exist.  
3. Enforce **barrel exports or module templates** so new controllers always get guards and DTOs by scaffolding.

---

## 21. Dead or commented-out code in controllers

### What is wrong

Some files retain **large commented blocks** (for example older CRUD in `attachments.controller.ts`).

### Why it matters

Noise obscures the real implementation and encourages copy-paste of outdated patterns.

### Suggestions to fix

1. Delete commented blocks; recover them from git history if needed.  
2. If the old API must return, implement it behind versioned routes with clear deprecation notes.

---

## 22. Ad-hoc maintenance scripts vs canonical schema

### What is wrong

Utilities like `reset-and-test-superadmin.js` define a **minimal Mongoose schema** inline that may **diverge** from the Nest `Admin` schema (fields, hashing, collection options).

### Why it matters

Scripts can **corrupt or misunderstand** data if they assume different shapes or storage formats than the application.

### Suggestions to fix

1. Prefer **Nest CLI tasks** or `ts-node` scripts that import the **same** schema and services as the app.  
2. Document **official** admin reset procedure in the README and deprecate ad-hoc JS unless kept in sync automatically.

---

## 23. Dashboard refresh model — **Resolved** (old 5‑minute card cron removed)

**Status: Resolved** — The previous `DashboardCardRefreshService` / `dashboard_card_summaries` five-minute warming path has been **removed from code**. Do not reintroduce range-level card collections without reviewing `DASHBOARD_ARCHITECTURE_AUDIT.md`.

### Current behavior (2026-05)

| Mechanism | Role |
|-----------|------|
| **`fhr_collection` change** | `DashboardSummaryFhrInvalidationHook` → `dashboard.source.changed` → mark stale + enqueue |
| **`DashboardRefreshQueueService`** | Deduped jobs per `(summaryDate, equipmentMode)` |
| **`DashboardSummaryWorkerService.recomputeAndStore`** | One FHR read per **calendar day** → upsert **one** `dashboard_summaries` doc (`cards` + embedded `drilldowns`) |
| **`DashboardSummaryMaintenanceService`** | Optional **hourly** safety sweep (`safetySweepCron` env) for stale summaries only — not a full force refresh of all ranges |
| **HTTP read** | `DashboardSummaryReadService` — compose daily shards in memory; **no** `fhr_collection` scan on bundle routes |

### Remaining performance notes

1. Worker may still use internal **`dashboard_daily_aggregates`** day shards during generation (not on HTTP path).  
2. **`FhrCollectionService` STA-window in-memory cache** (§26) still applies on worker/admin paths.  
3. Legacy **`GET /reports/dashboard-fhr-*`** and **`GET /reports/dashboard-handled-stats`** (main-details scans) remain — deprecate if unused (see §25, §32).  
4. Drop Mongo **`dashboard_card_summaries`** if the collection still exists: `db.dashboard_card_summaries.drop()`.

---

## 24. `raw_flight_data` date filtering loads the entire collection

### What is wrong

`RawFlightDataService.filterByDateRange` executes `this.rawFlightDataModel.find().lean()` with **no** date predicate, then filters by parsing `data.STA Date` (and variants) **in application memory**.

### Why it matters

As `raw_flight_data` grows, every range request becomes **O(all documents)** in I/O, memory, and CPU. This path cannot use indexes on embedded schedule fields effectively.

### Suggestions to fix

1. Add **normalized top-level fields** (e.g. `staDateKey` numeric or ISO date) at ingest and index them; query with `find({ staDateKey: { $gte, $lte } })`.  
2. Alternatively use a **MongoDB aggregation** with `$addFields` + range filter server-side instead of loading every document.  
3. Enforce **pagination** for any “list raw flights” API.

---

## 25. Multiple services read entire collections for reporting or counts

### What is wrong

Examples include:

- **`RafMisService.buildReportFromEquipmentManpower`**: `Promise.all` of `equipmentManpowerModel.find().lean()`, `mainDetailsModel.find().lean()`, `attachmentsModel.find().lean()`, `advanceAirlineModel.find().lean()` — entire collections loaded for each report.  
- **`MainDetailsService`**: `getTopDelayReasons`, `getHandledAndCancelledCounts`, `getFlightTypeCounts` still call `mainDetailsModel.find().lean()` and filter in Node. **Bird dashboard primary/secondary cards no longer use these** (they read `dashboard_summaries`), but legacy routes `GET /reports/dashboard-handled-stats`, `dashboard-flight-types`, `delay-reasons-top` still do if called.  
- **`FhrCollectionService.getQualityReportScheduledTableForStaYmdWindow`**: loads the full STA-window merge via `findAllLeanForScheduledTableMerge` and aggregates in Node (Quality Report scheduled table + baggage bars). Cached per §26 but still **O(window rows)** CPU on each cache miss.  
- **`RafMisService.buildReportFromEquipmentManpower`**: full `mainDetailsModel.find().lean()` per report (§34).  
- Various **`find()`** list methods (equipment details, manifest, remarks, attachments, ramp/terminal/load-control, `NsRawFlightDataService.getAll`) return **unbounded** result sets.

### Why it matters

Memory spikes, long event-loop blocking, and MongoDB cursor pressure scale linearly with table size. These patterns are a common reason Nest apps “get slow” after months of operations data.

### Suggestions to fix

1. Replace full scans with **indexed queries** (date keys, serial lists, station, etc.) and **Mongo aggregations** (`$match`, `$group`, `$facet`).  
2. Add **pagination**, `limit`, and projection to all list endpoints.  
3. For cross-collection MIS joins, precompute **narrow** extracts or use `$lookup` on keyed fields only.  
4. Share one **aggregated read** per request where multiple metrics need the same population slice.

---

## 26. In-process FHR “STA window” cache holds full merged row arrays

### What is wrong

`FhrCollectionService.loadStaWindowRowsCached` stores the **entire** merged row array in an in-memory `Map` (TTL ~5 minutes). Each distinct date window key retains a **full copy** of all matching lean documents.

### Why it matters

Large windows or multiple keys increase **heap usage** and GC pressure on the Node process. A cache **per server instance** does not dedupe across horizontal replicas.

### Suggestions to fix

1. Prefer **Redis** or similar for large payloads with explicit max memory and eviction.  
2. Shorten TTL or shard cache keys by smaller day chunks if payloads are huge.  
3. Where possible, return **aggregates** from Mongo (`$group`) instead of caching raw row arrays.

---

## 27. Large request bodies and spreadsheet parsing

### What is wrong

`main.ts` sets JSON/urlencoded limits to **15mb** to support large payloads (e.g. airline logo data URLs). The stack also parses **Excel** in-process (`xlsx`, `exceljs`) on uploads and seeds.

### Why it matters

Large bodies increase latency and memory per request. Untrusted spreadsheets can cause **parser** and **heap** spikes on a single thread.

### Suggestions to fix

1. Store logos as **binary in GridFS/S3** or a CDN URL instead of megabyte JSON fields where possible.  
2. Stream uploads, enforce stricter size limits per route, move heavy parsing to a **worker** process.  
3. Continue auditing `xlsx` / supply chain (see §18).

---

## 28. FHR documents duplicate data from normalized form collections

### What is wrong

`FhrCollection` embeds subdocuments that mirror **`main_details`**, **`terminal_details`**, **`ramp_details_*`**, **`remarks`**, **`equipment_manpower`**, **`attachments`**, etc., while those **same** facts can also live as standalone documents keyed by serial.

### Why it matters

This is a deliberate **denormalization** for read performance, but it creates **drift** risk: updates to one store may not match the other unless all write paths keep them in sync. Operators can see inconsistent UI depending on whether the client reads FHR merge output or raw collections.

### Suggestions to fix

1. Document a **single source of truth** per field and which API reads which copy.  
2. Prefer **event-driven sync** or a single write façade that updates both FHR and normalized collections in one transaction or compensating job.  
3. Add **integrity checks** (scheduled diff or admin report) for serials where embedded vs normalized values disagree.

---

## 29. Non-scheduled raw flights: no uniqueness on `SerialNo`

### What is wrong

`NsRawFlightData` defines `SerialNo` as a normal field with **no** unique index at schema level. `bulkInsert` uses `insertMany(..., { ordered: false })` with no idempotency key.

### Why it matters

Repeated imports or double-submit from clients can create **multiple documents** for the same serial. Downstream `findOne({ SerialNo })` becomes **non-deterministic** (wrong row). Saved forms in `main_details` etc. may point at a different raw row than intended.

### Suggestions to fix

1. Add a **unique index** on `SerialNo` (after cleaning duplicates).  
2. Switch bulk ingest to **bulkWrite** with `updateOne` + `upsert` on `SerialNo`, or reject duplicates explicitly.  
3. Treat **batchId** + idempotency headers for integrations.

---

## 30. Scheduled `raw_flight_data`: weak schema and duplicate-friendly ingest

### What is wrong

`RawFlightData` uses a generic `data: Record<string, any>` with **`strict: false`**. `insertMany` does not enforce a natural business key (e.g. serial + STA day). There is no unique compound index in this schema file.

### Why it matters

The same flight row can be inserted many times; consumers must dedupe manually. Embedded date fields vary by naming (`STA Date`, `staDate`, …), encouraging **full collection** scans (see §24).

### Suggestions to fix

1. Introduce required top-level keys (`serialNo`, `staDateKey`, hash of source row) and **unique** constraints where the business allows.  
2. Normalize field names at **ingest** only.  
3. Add migration to dedupe legacy `raw_flight_data`.

---

## 31. MIS RAF / ADS usage rows: indexes but no duplicate-suppression key

### What is wrong

`raf_usage_data` and `ads_usage_data` define helpful **non-unique** indexes (e.g. `station + stdDateKey` / `dateKey`) but **no** unique compound index that would block double-insert from a **re-import** of the same file.

### Why it matters

Re-running ingest or overlapping batches can **multiply** revenue and usage rows, inflating reports until someone manually cleans data.

### Suggestions to fix

1. Define a **business-natural key** (e.g. `batchId + serialNumber + serviceCode + stdDateKey` or file hash + row id) and enforce **unique** where appropriate.  
2. On ingest, use **replace within batch** (`deleteMany({ batchId })` then insert) or `bulkWrite` upserts.  
3. Surface **batch metadata** in the UI so operators know which import produced which rows.

---

## 32. Dashboard materialization — current vs legacy — **Partial** (consolidated in code, Mongo may lag)

### Current architecture (Bird UI)

| Collection | Role | HTTP read? | Worker write? |
|------------|------|------------|---------------|
| **`fhr_collection`** | Source of truth | No (bundles) | Yes (ingest elsewhere) |
| **`dashboard_summaries`** | **Sole Bird read model** — **one doc per `(summaryDate, equipmentMode)`** with `cards` + embedded `drilldowns` | **Yes** | **Yes** |
| **`dashboard_daily_aggregates`** | Internal day shards for card generation | **No** | **Yes** (optional; may be removed later) |

Range requests (e.g. a week STA window) **compose** daily shards in memory (`compose-dashboard-daily-shards.util.ts`) — arbitrary `(from, till)` ranges are **not** stored as separate Mongo documents.

### Legacy / unused (not part of Bird contract)

| Collection / module | Status |
|---------------------|--------|
| **`dashboard_card_summaries`** | **Removed from code** — drop Mongo collection if present |
| **`dashboard_drilldowns`** | Schema + `DashboardDrilldownService` exist; **worker does not write**; **HTTP reads `dashboard_summaries.drilldowns`** instead. Drop collection + dead service when convenient |
| **`dashboard_data`** | Spreadsheet import only (`POST /dashboard-data/import`) — **no Bird client** |
| **`dashboard_kpi_flights`** | KPI import module — **no Bird client** |

### Stale comments in repo

`reports.controller.ts`, `DashboardSummaryPrecomputeService`, and `DASHBOARD_DATE_RANGE_AND_RENDERING.md` still mention **`dashboard_drilldowns`** as the drill read model. **Implementation:** `DashboardSummaryReadService` — *“no `dashboard_drilldowns` reads”*. Update JSDoc when cleaning debt.

### Suggestions

1. `db.dashboard_card_summaries.drop()` and `db.dashboard_drilldowns.drop()` after backup, if counts are zero or obsolete.  
2. Remove `DashboardDrilldownModule` registration or narrow to `deleteAll()` only until deleted.  
3. Deprecate `DashboardDataModule` / `DashboardKpiFlightsModule` if no external importers.

---

## 33. Legacy `dashboard_data` and `dashboard_kpi_flights` import stores — **Legacy**

### What they are

- **`dashboard_data`** — `DashboardDataModule`: bulk spreadsheet rows (`flightId`, delays, STA/ATA strings, etc.) via `POST /dashboard-data/import`.  
- **`dashboard_kpi_flights`** — `DashboardKpiFlightsModule`: similar KPI import pattern.

Neither is wired into **`DashboardSummaryWorkerService`** or Bird TanStack Query loaders.

### Suggestions

1. Confirm no Postman/cron/job still calls import endpoints.  
2. Export data if needed, then drop collections and modules.  
3. Do **not** use these as a source for Bird dashboard population — use **`fhr_collection` → `dashboard_summaries`**.

---

## 34. `mainDetails` collection integrity and dual-write — **Open**

### What is wrong

1. **Dual storage:** `mainDetails` collection vs `fhr_collection.mainDetails` embed; scheduled UI can save **FHR only** while NS/import/auth paths write the **collection**.  
2. **Duplicate rows:** Same flight can exist as `SerialNo`-only and `flightSerialNumber`-only documents (e.g. serial **16616**). Unique index is on **`SerialNo`** only; many rows have **`SerialNo: null`** with `flightSerialNumber` set (~1012 rows in a typical DB).  
3. **Full scans:** Legacy report endpoints and MIS (`RafMisService`, `BhsMisService.findAll`) still load entire `mainDetails`.

### Suggestions

1. Run `server/scripts/merge-maindetails-serial-duplicates.ts` (dry-run, then `--execute`) to merge duplicates; keep the doc with **`flightSerialNumber`**, set **`SerialNo`**, delete the orphan.  
2. Enforce **single write façade** (always `MainDetailsService.upsertBySerial` after FHR merge, or always derive collection from FHR refresh).  
3. Backfill `SerialNo` on rows that only have `flightSerialNumber` via migration.  
4. Replace `find().lean()` analytics with indexed queries or `dashboard_summaries` metrics where product allows.

---

## 35. Orphan `employees` schema vs live `operation_employees` — **Legacy**

### What is wrong

`server/src/employees/schema/employees.schema.ts` defines collection **`employees`**, but **no module registers it** in `app.module.ts`. Live Pax Shift staffing uses **`operation_employees`** via `OperationEmployeesModule` (`GET /pax-shift/operation-employees`).

### Suggestions

1. If Mongo `employees` is empty or abandoned, drop collection and delete unused schema folder.  
2. Do not confuse with **`operation_employees`** (actively used by `/fris/reports/pax-shift` and duty allocation forms).

---

## 36. `@nestjs/throttler` installed but not registered — **Superseded; package removed**

### What changed (2026-06-01)

Request throttling is implemented via **`ProtectionModule`** and **`OperationalThrottlerGuard`** (not `ThrottlerModule` / `ThrottlerGuard`). This was chosen so **`THROTTLE_MODE=monitor-only | warn-only | enforcement`** can roll out without blocking legitimate operational traffic.

`@nestjs/throttler` remains in **`package.json`** as an unused dependency — safe to remove in a cleanup PR or wire later if monitor-only is no longer needed.

### What is still off by default

`ENABLE_RATE_LIMITING=false` until ops enables it (§6, §43).

### Remaining suggestions

1. Remove **`@nestjs/throttler`** if the custom guard is canonical, **or** document why both exist.  
2. Enforce rate limits at **reverse proxy / API gateway** in addition to app limits.  
3. Complete staging soak per `server/test/protection/ROLLOUT_CHECKLIST.md` before `THROTTLE_MODE=enforcement`.

---

## 37. Auth password reset vs `AdminService.updatePassword` — **Partial**

### What is wrong

`AuthService` reset flow **hashes** before calling `adminService.updatePassword` / `userService.updatePassword`. However, **`AdminService.updatePassword` still assigns `password` verbatim** — any other caller passing plaintext would store an unhashed password (§10).

### Suggestions

1. Always **`bcrypt.hash`** inside `updatePassword` (same as `createAdmin`).  
2. Add tests for admin password update paths.

---

## 38. Panel-user creation validation and lookup helpers — **Resolved**

### What changed

The panel-user create flow under `server/src/user/` has been tightened:

1. `CreatePanelUserDto` now requires a real `password`, trims it before validation, and restricts panel-user roles to `employee` or `operations`.  
2. `UserService.createPanelUser()` now validates the normalized password against the shared password policy before hashing and saving it.  
3. `UserService` lookup helpers were standardized, including restoring `findById()`, so auth principal resolution compiles and runs correctly again.  
4. Focused tests were added to verify password-rule failures and trimmed-password handling.

### Why it matters

This closes a real gap where panel-user creation could accept missing / weak passwords or drift from the backend’s actual password rules, and it prevents auth-layer regressions caused by missing user lookup helpers.

### Residual notes

1. This improvement applies to **panel-user creation**; it does **not** resolve the separate admin plaintext password-update risk in §10 / §37.  
2. `AuthController` input validation is still weaker than ideal for login / reset routes (§11).

---

## 39. New MCP integration must remain read-only and backend-mediated — **Partial**

### What changed

A new standalone MCP server now exists at `apps/mcp-server/` as an **additive** integration layer for Cursor / future desktop clients. The initial implementation is intentionally narrow:

1. It uses **stdio MCP transport** and calls the existing NestJS backend over HTTP.  
2. It does **not** connect to MongoDB directly.  
3. It exposes only **read-oriented** tools in the first phase.  
4. It validates tool inputs with **Zod**, restricts reachable backend paths, and logs sanitized tool execution metadata.  
5. It forwards `API_TOKEN` / `SERVICE_TOKEN` when present instead of bypassing backend auth.

### Why it matters

AI tooling can accidentally become a second, less-reviewed admin surface if it talks to the database directly, exposes arbitrary query execution, or wraps dangerous maintenance endpoints. Keeping MCP as a thin orchestration layer reduces that risk and preserves the NestJS app as the business-policy source of truth.

### Residual notes

1. Global JWT is in place (§1 — **Resolved**); keep MCP path-restricted and regression-test public routes when adding tools.  
2. Future MCP write tools must **not** call bypass paths like direct `/flights/cancel` create / reopen routes while OTP / auth hardening is still in progress.  
3. Any future mutation-capable MCP tool should be gated behind: backend authorization, explicit allowlisting, audit logs, and where applicable OTP / step-up approval.  
4. Keep the MCP layer **removable** and **backend-mediated**: no duplicated business logic, no raw collection access, no unrestricted query helpers.

---

## 40. Cleaning Services export was client-stitched from mixed sources — **Resolved**

### What was wrong

The Cleaning Services report/export flow was previously assembling rows in the browser from a mix of:

1. scheduled-flight list data,
2. `ns-raw-flight-data/main-details`, and
3. `GET /reports/flight-report/:serial`.

That meant the export was **not using one authoritative source**, and cleaning date/time formatting could drift or break depending on which source happened to contain the field. In practice this showed up as:

- rows appearing even when the FHR view was the intended source of truth,
- cleaning date/time values merged into the wrong export columns,
- duration formatting not matching the requested export format,
- extra enrichment fields (`Type of Handling`, `Aircraft Body`) being awkward to derive consistently.

### What changed

The Cleaning Services path now reads from a dedicated **read-only** FHR endpoint:

- `GET /fhr-collection/cleaning-services?fromDate=&tillDate=`

That endpoint:

1. filters by the selected STA date window,
2. returns only flights with actual cleaning timestamps,
3. splits cleaning date and time cleanly into separate fields,
4. formats duration as **`hh:mm`**,
5. resolves **`Aircraft Body`** from `advance-aircraft` when `TypeCraft` matches, and
6. returns `Flight No`, `TypeofHandling`, and a derived `Type of Flight` for export.

### Why it matters

This removes a fragile mixed-source browser join and makes the Cleaning Services export more deterministic, easier to debug, and closer to the FHR read model already used elsewhere for operational reporting.

### Residual notes

1. `Type of Flight` is still a **heuristic** right now: flight number containing `F` => Cargo, else Passenger. If the business wants a stricter rule, move that to a catalog / normalized backend field later.
2. This improves the **read/export path** only; report routes still need consistent `@Roles()` coverage where business policy requires it (see §1, §41).

---

## 42. Advance Invoicing export and Scheduled Airlines NAV drift — **Partial**

### What was wrong

1. **Invoicing export** could fail in the browser because the client posted to a URL that proxied as **`POST /`** on Nest (404), or because **`setNavisionDataExportStatus`** threw **`NotFoundException`** when no `raw_flight_data` document existed for a serial that only appeared in the daily FHR pipeline.
2. **NAV column** on Scheduled Airlines stayed **No** after a successful-looking export because:
   - FHR merge on export was a no-op (`upsertMerge` with `{}`),
   - daily list assembly never read `exportedNAV` from `raw_flight_data` or FHR `mainDetails`.

### What changed

See **Update notes — 2026-06-01** (NAV export → Scheduled Airlines sync). Summary:

| Layer | Change |
|-------|--------|
| `RawFlightDataService.setNavisionDataExportStatus` | Writes **Yes/No** to raw + FHR `mainDetails`; creates raw row if missing; invalidates daily cache |
| `finalizeDailyFhrCollectionOnly` | Merges NAV labels onto each daily row |
| Client invoicing export | Per-serial **`PATCH /raw-flight-data/navision-export/:serialNo`** |
| Client scheduled table | **Yes** display + `isExportedNavStatus` for **Yes/Exported/Y** |

### Remaining suggestions

1. Add **`@Roles()`** regression test: export serial → `GET /scheduled-airline-pipeline/daily-from-advance` (or invoicing list) returns **`exportedNAV: Yes`** for that serial in range.  
2. Consider a single **batch export** API that returns per-serial results without the client issuing N PATCHes.  
3. Document that **instance serial** vs **legacySlNo** must match between invoicing selection and scheduled table search (mapper resolves multiple keys; operators should search the same Sl. No. shown in both UIs).

---

## 41. Quality Report scheduled table was client-mocked — **Partial**

### What was wrong

The Quality Report **Scheduled flight details** table and **Baggage on-time** chart were driven by **static mock rows** in the Next.js client. That meant:

1. counts and percentages did not reflect **`fhr_collection`** for the selected STA date range,
2. airline-level baggage KPIs could not be reconciled with FHR timestamps,
3. totals and chart bars could drift from operational truth whenever FHR data changed.

### What changed

A dedicated read endpoint now aggregates Quality Report metrics server-side:

- **`GET /reports/quality-scheduled-table?fromDate=&tillDate=&airline=`**
- Service: **`FhrCollectionService.getQualityReportScheduledTableForStaYmdWindow`**

Per airline (for the STA window), the API returns:

| Field | Source / rule |
|-------|----------------|
| `flights` | Row count in window |
| `cancels` | `fhrLeanDocIsCancelled` |
| `additional` | Additional handling flag on non-cancelled rows |
| `firstBagPct` | % of **all flights** where first bag ≤ **15 min** after ATA |
| `lastBagPct` | % of **all flights** where last bag ≤ **45 min** after ATA |
| `holdClosedPct` | % of **all flights** where hold closed ≥ **5 min** before STD (condition evaluated only on non-cancelled rows) |
| `arrivalPax`, `departPax`, cargo/mail/baggage | Summed from terminal/ramp embeds |
| `qualityScore` | Rounded mean of the three percentage KPIs |
| `code` | Derived airline code (`qualityScheduledAirlineCode`) |

Baggage timing uses **`qualityBagAchieved(ataTime, bagTime, thresholdMinutes)`**, which compares **time-of-day only** (`qualityTimeDiffMinutes`) and wraps past midnight by adding 24h when the bag time is earlier on the clock than ATA.

Data load path: **`findAllLeanForScheduledTableMerge(dateStrings)`** → in-process STA cache (§26).

### Why it matters

Operators can now trust the Quality Report table and baggage chart against the same FHR read model used for scheduled-airlines dashboards, delay analytics, and cleaning-services export — with one aggregation definition for “on-time first/last bag” instead of duplicating rules in the browser.

### Residual notes / follow-up

1. **Role guard:** add `@Roles(...OPERATIONAL_ROLES)` to `GET /reports/quality-scheduled-table` for parity with `GET /reports/main-report/:serialNo` and other sensitive FHR reads. Today the route is **JWT-only**.  
2. **Performance:** wide date ranges still pull the full cached STA merge and aggregate in Node (§25, §26). Consider a precomputed daily quality shard if this report is opened frequently.  
3. **Time semantics:** ATA vs bag comparison is **same-day wall-clock minutes**, not full `ATADate` + `ATATime` datetime composition. Flights crossing midnight may need explicit date-aware diff if audits show mismatches.  
4. **Missing timestamps:** flights without ATA or bag times do not increment the “achieved” counters but still count in the **`flights`** denominator → lower percentages; document this for users.  
5. **Hold closed** remains a separate KPI (STD-based), not part of the baggage on-time bars.  
6. **Tests:** add service-level fixtures for `qualityBagAchieved` (15 / 45 thresholds) and a controller contract test for the new route.

---

## 43. Operational protection and safe rollout — **Partial**

### What was implemented

| Area | Location | Notes |
|------|----------|--------|
| Module | `server/src/protection/protection.module.ts` | Global; registers guard, timeout interceptor, multer filter |
| Config | `protection/config/protection-env.ts` | All `ENABLE_*` flags; defaults **off** |
| Rate limit | `guards/operational-throttler.guard.ts` | AUTH / REPORTS / EXPORT / GLOBAL categories |
| Logging | `logging/protection-logger.service.ts` | `[RATE_LIMIT_BLOCKED]`, `[THROTTLE_MONITOR_ONLY]`, etc. |
| Redis | `stores/redis-throttle.store.ts` | Optional `ioredis`; `[FALLBACK_MODE]` to in-memory |
| Timeouts | `interceptors/request-timeout.interceptor.ts` | `@SkipTimeout` on long handlers |
| Concurrency | `import-concurrency.interceptor.ts`, `export-concurrency.interceptor.ts` | Import wired on `MaaExcelImportController` |
| Seed block | `guards/production-seed.guard.ts` | `SeedController` |
| Rollout doc | `OPERATIONAL_PROTECTION_ROLLOUT.md` | Flags, rollback &lt; 5 min |
| Smoke tests | `test/protection/`, `npm run test:smoke` | 33 harness e2e tests |

### Required env flags (rollout)

`ENABLE_RATE_LIMITING`, `ENABLE_REDIS_THROTTLING`, `ENABLE_REQUEST_TIMEOUTS`, `ENABLE_EXPORT_CONCURRENCY_CONTROL`, `ENABLE_IMPORT_CONCURRENCY_CONTROL`, `ENABLE_SECURITY_LOGGING`, `THROTTLE_MODE`.

### Why it matters

The API serves many concurrent operators (dashboard polling, reports, imports). Protections must not cause **false 429s** or **shared-IP collateral blocks**. Monitor-only mode and smoke tests exist specifically to prevent workflow disruption.

### Residual / follow-up

1. **Measure** real polling intervals on staging; set limits above P99 (see `test/helpers/polling-simulator.ts`).  
2. **Wire** `ExportConcurrencyInterceptor` on all production export endpoints.  
3. **Apply** `@SkipTimeout` on known long report/export handlers.  
4. Install **`ioredis`** when enabling Redis throttling.  
5. Run **k6** on staging before `THROTTLE_MODE=enforcement`.  
6. Complete **`test/protection/FINAL_REPORT.md`** after staging validation.  
7. Consider removing unused **`@nestjs/throttler`** dependency (§36).

---

## 44. No health, readiness, or liveness probes — **Resolved; probe wiring remains AUD-H09**

### What is wrong

`AppController` exposes only **`GET /`** returning a hello string (`@Public()`). There is no:

- **`/health`** or **`/healthz`** liveness endpoint  
- **`/ready`** readiness check that verifies MongoDB connectivity  
- Dependency checks (Redis when throttling enabled, mail relay for OTP)

Load balancers and orchestrators (Kubernetes, ECS, Azure App Service) cannot distinguish **“process up but DB down”** from a healthy instance.

### Why it matters

Unready pods stay in rotation → **502/503 storms** and opaque operator outages. Rolling deploys cannot wait for warm connections or drain safely (see §45).

### Suggestions to fix

1. Add **`@nestjs/terminus`** (or a minimal custom controller) with `HealthCheckService` + `MongooseHealthIndicator`.  
2. Mark liveness **public**; gate readiness behind internal network or auth if needed.  
3. Wire probes in deployment manifests / platform config; document paths in ops runbook.

---

## 45. No graceful shutdown — **Resolved 2026-07-19**

### What is wrong

`main.ts` calls `app.listen()` with **no** `app.enableShutdownHooks()`, no signal handlers (`SIGTERM` / `SIGINT`), and no drain of:

- in-flight HTTP requests  
- `DashboardRefreshQueueService` workers  
- `@Cron` jobs mid-execution

Deploy/restart can **abort** dashboard recomputes, imports, or long report handlers.

### Why it matters

Production deploys cause **partial writes**, stale materialized summaries, and client retries that amplify load (especially with dual-write paths in §28 / §34).

### Suggestions to fix

1. Call **`enableShutdownHooks()`** and listen for termination signals.  
2. Set a **shutdown timeout** (e.g. 30s) then close the HTTP server.  
3. Optionally pause cron enqueue and let the refresh queue finish current jobs (or persist queue to Redis — §46).

---

## 46. Single-process state — horizontal scaling blockers — **Open**

### What is wrong

Multiple subsystems assume **one Node process**. Running **N replicas** without external stores causes duplicated work, split-brain caches, or inconsistent operator experience:

| Component | Location | Multi-instance behavior |
|-----------|----------|-------------------------|
| OTP store + rate limit | `AuthService` — `Map` | OTP valid only on pod that issued it; rate limits per pod |
| Dashboard refresh queue | `DashboardRefreshQueueService` | Duplicate recompute jobs; uneven load |
| Dashboard refresh lock | `DashboardRefreshLockService` — comment: *“Swap for Redis Redlock”* | No cross-pod mutex → race on same `summaryDate` |
| Scheduled airlines list cache | `listDailyFromAdvanceCache` in `raw-flight-data.service.ts` | Stale NAV/status until TTL or full `clear()` on one pod |
| FHR STA window cache | `FhrCollectionService.loadStaWindowRowsCached` (§26) | Per-pod heap; cold cache on every new replica |
| Throttle counters (fallback) | `InMemoryThrottleStore` when Redis off (§43) | Effective limit = N × configured limit |
| Protection concurrency locks | `ConcurrencyLockService` | Per-process semaphores |

### Why it matters

Scaling out **does not linearly increase capacity** and can **worsen** data freshness (caches) or **weaken** rate limits. This is a primary blocker for production HA behind a load balancer.

### Suggestions to fix

1. **Short term:** run **one API replica** until Redis-backed stores are wired; document this constraint in deployment docs.  
2. **Medium term:** Redis for throttling (§43), OTP/session step-up, refresh queue + lock (BullMQ / Redis streams), shared cache for hot read paths.  
3. **Long term:** separate **worker** deployment for dashboard refresh / imports so HTTP tier stays stateless.  
4. Invalidate caches via **pub/sub** or version keys instead of process-local `Map.clear()`.

---

## 47. No MongoDB transactions for multi-collection writes — **Partial; see AUD-H05**

### What is wrong

A repo-wide search shows **no** `startSession`, `withTransaction`, or multi-document ACID usage. Writes that touch **`fhr_collection` + normalized collections** (`main_details`, `raw_flight_data`, embeds) proceed as **sequential operations**.

Examples: FHR upsert + `mainDetails` collection update; NAV export (§42); schedule ingest + instance index.

### Why it matters

Process crash or partial failure mid-sequence produces **split-brain** documents — the core drift risk called out in §28 and §34. Operators see different values depending on which API or embed path the UI reads.

### Suggestions to fix

1. Identify **critical write façades** (one service method per business action) and wrap multi-collection updates in a **Mongo transaction** where all collections are on the same replica set.  
2. Where transactions are impractical, use **outbox / event** pattern: write intent doc → worker applies side effects → mark complete.  
3. Add **reconciliation jobs** (nightly diff FHR embed vs collection for sample serials).

---

## 48. Public registration document download — PII exposure — **Resolved; content handling remains AUD-M02**

### What is wrong

`UserRegistrationController` marks these routes **`@Public()`**:

- `GET /verify-invite/:token`  
- `POST /register-user` (multipart, memory storage up to 10MB per file)  
- **`GET /user-registration/documents/:documentId/file`** — streams files from disk **without JWT**

If `documentId` is predictable (Mongo ObjectId) or leaked via logs/referrers, **government ID, address proof, and employment documents** are downloadable anonymously.

### Why it matters

This is a **high-severity privacy/compliance** defect (GDPR-style PII, aviation operator KYC). Public upload + public download is a common audit finding.

### Suggestions to fix

1. Require **JWT + admin role** for document download, or time-limited **signed URLs** tied to invite token.  
2. Rate-limit and CAPTCHA on **`POST /register-user`** (reuse AUTH throttling patterns — §6).  
3. Store uploads in **private object storage** with server-side encryption; never serve via guessable IDs.  
4. Virus-scan and validate MIME types server-side; log access with actor + `x-request-id`.

---

## 49. No global exception filter or consistent API error envelope — **Open**

### What is wrong

Only **`MulterLimitLoggingFilter`** (protection module) handles a narrow error class. There is no global filter that:

- maps exceptions to a **stable JSON shape** (`statusCode`, `message`, `requestId`, `code`)  
- hides stack traces in production  
- logs 5xx with correlation id

Clients and MCP tools must parse heterogeneous Nest default bodies.

### Why it matters

Production debugging relies on grep-friendly logs; inconsistent responses complicate **client error handling**, **SLO alerting**, and **security** (accidental detail leakage in 500 bodies).

### Suggestions to fix

1. Register **`APP_FILTER`** with a `AllExceptionsFilter` that attaches **`x-request-id`**.  
2. Use **`HttpException`** subclasses with machine-readable `code` fields for domain errors.  
3. Never return raw `err.message` from Mongo/driver to clients in production.

---

## 50. Environment configuration not validated at bootstrap — **Open**

### What is wrong

`ConfigModule.forRoot` loads env files but **does not validate** the full surface at startup. Only some paths use `getOrThrow` (e.g. `JWT_SECRET` in `JwtStrategy`). **`MONGO_URI`** uses optional `config.get` (§8). Mail, CORS, cookie domain, Redis URL, and protection flags are read ad hoc across modules.

### Why it matters

Misconfigured production deploys **start successfully** and fail on first login, first report, or first OTP — the worst time to discover missing `SMTP_*` or wrong `AUTH_COOKIE_DOMAIN`.

### Suggestions to fix

1. Add **`server/src/config/env.schema.ts`** with **Zod** or **Joi** — validate on `ConfigModule` load.  
2. **`fail fast`** in production if required keys missing; allow relaxed schema in `development` with warnings.  
3. Generate **`.env.example`** from the schema (§4).

---

## 51. No container or deployment artifacts for the server — **Partial; CI/Railway added**

### What is wrong

The repo has **no `Dockerfile`**, **no `docker-compose`** for local prod-parity, and **no server-specific CI workflow** under `server/` (protection CI is an **example** YAML only — §43). Production runbooks are implied, not encoded.

### Why it matters

Non-reproducible builds, “works on my machine” drift, and manual deploy steps increase **incident frequency** and slow rollback (contrast §43 rollback goal &lt; 5 min).

### Suggestions to fix

1. Multi-stage **`Dockerfile`**: `npm ci` → `nest build` → slim runtime with non-root user.  
2. **`docker-compose.yml`**: API + Mongo (+ Redis when enabling §43 / §46).  
3. CI: **`npm run build`**, **`npm run test:smoke`**, lint without `--fix` (§19), optional integration job with Mongo service container.  
4. Pin **Node LTS** in `.nvmrc` / `engines` field.

---

## 52. Scheduled cron runs on every API replica — **Open**

### What is wrong

`DashboardSummaryMaintenanceService` registers **`@Cron(CronExpression.EVERY_HOUR)`** when `safetySweepCron` is enabled. **Every** horizontally scaled API instance runs the sweep independently.

Each sweep calls `findStaleSummariesLimited(48)` and enqueues refresh jobs into the **local** queue (§46).

### Why it matters

N replicas → up to **N× duplicate refresh work** per hour, Mongo read amplification, and thundering herd on `fhr_collection` during recompute.

### Suggestions to fix

1. Run cron only on a designated **worker** process or use **distributed lock** (Redis) around the sweep.
2. Alternatively disable cron on API tier via env: `ENABLE_DASHBOARD_CRON=false` on all but one instance.  
3. Prefer **external scheduler** (K8s CronJob, cloud scheduler hitting an internal admin endpoint).

---

## 53. User registration uploads on local filesystem — **Partial; see AUD-H11/AUD-M11**

### What is wrong

`UserRegistrationService` writes invite documents with **`fs.writeFileSync`** under **`server/uploads/user-invite-docs/`**. Files are served via **`res.sendFile(file.filePath)`** (§48).

### Why it matters

Local disk is **not shared** across pods → upload on pod A, download on pod B **404s**. Backups, retention, and encryption-at-rest are operator responsibilities with no schema in code.

### Suggestions to fix

1. Move to **S3-compatible object storage** (or GridFS) with private ACLs.  
2. Store **metadata only** in Mongo (`storageKey`, `checksum`, `mimeType`).  
3. Define **retention policy** for rejected/approved registration docs.

---

## 54. No API versioning or published OpenAPI contract — **Open**

### What is wrong

Routes are flat (`/auth`, `/reports`, `/raw-flight-data`, …) with **no `/v1` prefix**. There is **no Swagger/OpenAPI** generation in `main.ts` or module bootstrap.

Parallel naming (**advance-*** vs legacy paths — §20) increases breaking-change risk without version boundaries.

### Why it matters

Mobile clients, MCP tools, and partner integrations need **stable contracts**. Undocumented breaking changes surface only in production.

### Suggestions to fix

1. Add **`@nestjs/swagger`**; expose **`/api/docs`** behind auth in non-production.  
2. Introduce **`/v1`** for new external consumers; deprecate legacy with sunset headers.  
3. Contract tests from OpenAPI for critical read paths (reports, dashboard summary).

---

## 55. JWT sessions without revocation or rotation — **Partial**

### What is wrong

Auth uses **httpOnly cookies** (good — `auth-cookie.util.ts`) with default **7-day** max age. **`AuthController` logout** clears cookies but there is **no server-side token blacklist** or session store.

Password change / admin disable does not invalidate outstanding JWTs until natural expiry. No refresh-token rotation pattern.

OTP for cancellations uses **in-memory** store (§46) — unrelated to session JWT but same scaling concern.

### Why it matters

Stolen session cookie remains valid for days. **Offboarded employees** retain API access until cookie expires unless secrets are rotated globally.

### Suggestions to fix

1. Shorten **`AUTH_COOKIE_MAX_AGE`** in production; consider **sliding session** with refresh endpoint.  
2. Store **`jti` + exp** in Redis on login; check on each request; delete on logout/password change.  
3. On role/permission change, bump **`tokenVersion`** on user/admin doc and reject old payloads in `JwtStrategy.validate`.

---

## 56. Observability gaps — metrics, tracing, alerting — **Open**

### What is wrong

Observability today is primarily **unstructured Nest `Logger` / console** plus **protection event lines** (§15). Missing:

- **Prometheus** `/metrics` (request latency, queue depth, cache hit rate, Mongo pool)  
- **OpenTelemetry** traces (HTTP → service → Mongo)  
- **Alerting hooks** on 5xx rate, refresh queue backlog, stale `dashboard_summaries` age

`DashboardMetricsService` exists for internal dashboard refresh metrics but is not exported to a standard scraper.

### Why it matters

Production SLOs (“dashboard loads &lt; 2s P95”, “no stale summary &gt; 1h”) cannot be enforced without measurable signals.

### Suggestions to fix

1. Add **`@nestjs/terminus` + prometheus** or `prom-client` middleware.  
2. Propagate **`x-request-id`** into Mongo command comments or span attributes (§15).  
3. Define **alert rules**: auth 429 spike, `[FALLBACK_MODE]` Redis, safety sweep failures, Mongo disconnect.

---

## 57. Mongoose connection lacks production pool and resilience tuning — **Open; health logging now implemented**

### What is wrong

`MongooseModule.forRootAsync` passes only **`uri`** — no explicit:

- `maxPoolSize` / `minPoolSize`  
- `serverSelectionTimeoutMS`  
- `retryWrites` / `retryReads`  
- TLS / auth source options for Atlas

Under burst traffic (dashboard compose, wide STA windows — §25), default pool sizing may **starve** or **over-connect** Mongo.

### Why it matters

Connection exhaustion manifests as **cascading timeouts** (especially if request timeouts enabled — §43). Wrong pool size per replica × N instances can hit Atlas connection limits.

### Suggestions to fix

1. Document and set **`maxPoolSize`** per instance based on `(Atlas limit / replicas) - headroom`.  
2. Enable **`retryWrites: true`** for replica sets.  
3. Add connection event logging (`disconnected`, `reconnected`) at warn level.

---

## 58. Dangerous or dev-only modules always registered — **Open**

### What is wrong

`app.module.ts` **unconditionally imports**:

- **`SeedModule`** (§2 — mitigated by `ProductionSeedGuard`, not module removal)  
- **`ExcelImportModule`** (bulk ingest — §3)  
- **`DashboardDataModule`**, **`DashboardKpiFlightsModule`** (legacy imports — §33)

There is no `ENABLE_*` guard at module import time comparable to protection flags.

### Why it matters

Larger attack surface in production; accidental route exposure if a guard regresses. Unused code paths still load schemas and increase memory.

### Suggestions to fix

1. Dynamic **`AppModule.register()`** or conditional imports:  
   `...(process.env.ENABLE_SEED_ROUTES === 'true' ? [SeedModule] : [])`  
2. Same for bulk import and legacy dashboard import modules.  
3. Integration test asserting **`/seed/*` 403** in production profile (§43 smoke partially covers this).

---

## 59. Global ValidationPipe is permissive — mass-assignment risk — **Partial**

### What is wrong

`main.ts` sets global:

```typescript
new ValidationPipe({ whitelist: true })
```

It does **not** set **`forbidNonWhitelisted: true`** or **`transform: true`** globally. Several controllers use **local permissive pipes** explicitly:

- `scheduled-airline-pipeline.controller.ts` — `forbidNonWhitelisted: false`  
- `dashboard-data.controller.ts`, `dashboard-kpi-flights.controller.ts` — same  
- `AuthController` — no DTO classes (§11)

### Why it matters

Unknown JSON fields may be **stripped silently** (whitelist) rather than rejected — confusing for API consumers. Permissive routes accept **extra properties** that services might accidentally persist on `any`-typed Mongo updates.

### Suggestions to fix

1. Tighten global pipe: **`forbidNonWhitelisted: true`**, **`transform: true`**.  
2. Fix controllers that require loose bodies by narrowing DTOs with `@Allow()` on known extension fields.  
3. Align with §11 auth DTO migration.

---

## 60. FRIS pages & sections — backend / DB CPU–RAM energy map — **Open** (inventory 2026-07-24)

### Purpose

Operators and engineers need a **page-first** view of which FRIS surfaces burn the most **Mongo I/O, Node CPU, and heap**, independent of the security AUD register. Severity here means **resource cost under realistic operator load**, not CVSS.

Cross-reference: §23 (dashboard materialization), §24 (`raw_flight_data` full scan), §25 (report full reads), §26 (FHR STA-window cache), §27 (large bodies / Excel), AUD-H08 (in-memory queues/locks), AUD-H12 (startup warmup — resolved), AUD-M12–M13 (unbounded maps / lists).

### Severity legend

| Severity | Meaning |
|---|---|
| **Critical** | Can saturate a replica’s CPU/RAM or Atlas bandwidth on a single operator action or cold range |
| **High** | Large STA windows / billing periods routinely expensive; scales with days × flights |
| **Medium** | Noticeable under concurrent users, polling, or export; usually bounded or already partially mitigated |

### Critical

#### 60.1 Scheduled Airlines list — `/fris/flights/scheduledairlines`

| | |
|---|---|
| **Backend** | `RawFlightDataService.listDailyFromAdvance` → `FhrCollectionService.loadStaWindowRowsCached` / `findAllLeanForScheduledTableMerge` |
| **Paths** | `src/raw-flight-data/services/raw-flight-data.service.ts`, `src/fhr-collection/services/fhr-collection.service.ts` |
| **Reads** | Full FHR docs for STA window; advance schedule + creation docs for station; optional NAV enrichment from `raw_flight_data` |
| **CPU / RAM** | Dedup, serial attach, day expansion, JSON clone into §26 cache (up to ~12 window keys × 5 min TTL) |
| **Writes** | None on happy-path list; NAV export / repair paths may write (see Advance Invoicing notes) |
| **Remediation** | Prefer day-sharded projections; Redis or day-key cache of **aggregates/columns needed for table**, not full embeds; push operating-day filter into Mongo; cap window length |

#### 60.2 Bird dashboard cold materialization — `/fris/dashboard` (Bird Flight Delhi)

| | |
|---|---|
| **Backend** | `DashboardSummaryReadService` + `DashboardSummaryWorkerService.recomputeAndStore` + `DailyAggregateGeneratorService` |
| **Paths** | `src/dashboard-summary/services/dashboard-summary-read.service.ts`, `dashboard-summary-worker.service.ts`, `daily-aggregate-generator.service.ts` |
| **Reads** | Warm path: daily `dashboard_summaries` / aggregate shards only. Cold path: per missing day, reload FHR bundle and run multiple generators |
| **CPU / RAM** | Sync HTTP materialization of missing days; Node maps/arrays per generator; queue/worker also consume FHR (§23) |
| **Writes** | Upserts to daily summary / aggregate / drilldown docs when stale or missing |
| **Remediation** | Never block card HTTP on multi-day rebuild — return stale/partial + async queue only; pre-warm known ranges; metrics on stale age (§56) |

#### 60.3 Raw-flight date-range filter — legacy / range APIs

| | |
|---|---|
| **Backend** | `RawFlightDataService.filterByDateRange` |
| **Path** | `src/raw-flight-data/services/raw-flight-data.service.ts` |
| **Reads** | `rawFlightDataModel.find().lean()` with **no date predicate** (§24) |
| **CPU / RAM** | Parse embedded STA date strings and filter entire collection in Node |
| **Remediation** | Indexed `staDateKey` (or equivalent) at ingest; Mongo range query; pagination |

### High

#### 60.4 Quality Report — `/fris/reports/quality`

| | |
|---|---|
| **Backend** | `GET /reports/quality-scheduled-table` → `FhrCollectionService.getQualityReportScheduledTableForStaYmdWindow` |
| **Cost** | Same STA-window merge as §60.1 / §26; Node loop for airline bags/cargo/mail/quality %; airline filter often after read |
| **Remediation** | `$match` airline/station before expand; pre-aggregate daily quality shards like delay report |

#### 60.5 Delay Report & delay analytics — `/fris/reports/delay` (+ analytics drilldowns)

| | |
|---|---|
| **Backend** | `DelayReportSummaryService` (day shards + cold auto-materialize); `DelayAnalyticsService.getAnalytics` / `getDrilldown` |
| **Paths** | `src/reports/services/delay-report-summary.service.ts`, `delay-analytics.service.ts` |
| **Cost** | Warm: merge `delay_reports` buckets in Node. Cold: up to several concurrent FHR scans + per-day upserts. Legacy analytics reload full STA range, build multi-map structures; drilldown caps output after full CPU pass |
| **Remediation** | Always serve from shards; kill or gate legacy full-scan analytics; page before aggregate |

#### 60.6 MAA billing sources — `/billing/ads`, `/billing/equipment`, `/billing/manpower`

| | |
|---|---|
| **Backend** | `BillingSourcesMaaFhrAdsService.list` (usage sources) |
| **Path** | `src/billing/services/sources/billing-sources-usage.service.ts` |
| **Cost** | FHR aggregation across alternate date fields; wide projection of embeds; expand one FHR → many ADS rows in Node; hard cap ~20 000 after expand; batch enrichment loads customers/contracts/rates |
| **Remediation** | Narrow projection; date predicates only on indexed fields; stream/cursor pagination; fail closed if hint unavailable |

#### 60.7 Billing preparation refresh — Billing → Preparation → Refresh

| | |
|---|---|
| **Backend** | `BillingPreparationService.refresh` |
| **Path** | `src/billing/services/billing-preparation.service.ts` |
| **Cost** | Load all open preparation docs for scope (no pagination); enrich; **sequential save per row** + audit |
| **Remediation** | Bulk `bulkWrite`; chunked jobs; skip unchanged rows |

#### 60.8 Invoice draft create / recompose — Billing → Invoices

| | |
|---|---|
| **Backend** | `BillingInvoiceDraftsService.createFromPreparation` |
| **Path** | `src/billing/services/billing-invoice-drafts.service.ts` |
| **Cost** | Load all ready prep rows; per-customer serial work (contract fetch, line compose, totals, prep updates in transaction); merge-open-draft reloads old+new sets |
| **Remediation** | Bound period size; parallelize independent customers carefully; idempotent draft keys (AUD-H05 / AUD-M09) |

#### 60.9 Scheduled-list FHR supplement & FHR reindex (ops / maintenance)

| | |
|---|---|
| **Backend** | `fetchAdvanceScheduleMasterSupplementForStaWindow`; `reindexStaDatesFromEmbeds` |
| **Path** | `src/fhr-collection/services/fhr-collection.service.ts` |
| **Cost** | Cursor over FHR with schedule-id shape; Node date normalize; possible repair writes. Reindex: read all scoped FHR, **awaited update per changed doc** |
| **Remediation** | Indexed filters only; batch `bulkWrite`; run reindex off HTTP / maintenance window |

### Medium

#### 60.10 Bird dashboard warm fan-out & drilldowns

| | |
|---|---|
| **UI** | `BirdFlightDelhiDashboard` / `useBirdDashboardCardFetches` — six parallel card fetches; drilldowns on open |
| **Backend** | `DashboardSummaryReadService.readPerformanceDrilldown` / `readAirlineRemarksDrilldown` |
| **Cost** | Warm reads are shard docs (good). Drilldown still deserializes/merges **all** daily flight rows for range **before** slice paging — heap + CPU grow with range length |
| **Remediation** | Page/filter inside Mongo or store paged drill shards; client: defer non-visible cards |

#### 60.11 Missing FHR report lock polling — `/fris/reports/missing-fhr`

| | |
|---|---|
| **UI** | `MissingFhrLockStatusCell` — fetch on open; re-fetch ~every 4s while open/unlocked |
| **Cost** | Repeated lean-by-serial hits; multiplies with open popovers |
| **Remediation** | SSE/WebSocket or longer backoff; shared lock status batch endpoint |

#### 60.12 Admin Messaging / Incidents / Audit workspaces

| | |
|---|---|
| **Backend** | `AdminMessagingService` (charts ≈ 5 counts × 24h; alerts recurse KPI paths); `AdminIncidentsService.getAnalytics` (parallel aggs + per-station counts); `AdminAuditService` KPIs (`count` + `distinct`) and legacy backfill |
| **Paths** | `src/admin-messaging/services/admin-messaging.service.ts`, `admin-incidents/...`, `admin-audit/...` |
| **Remediation** | Single `$facet` / precomputed hourly rollups; drop recursive alert recomputation |

#### 60.13 FHR report / PDF / Excel / import buffers

| | |
|---|---|
| **UI** | Invoice PDF/email, scheduled export, admin exports, bulk Excel import/seed |
| **Backend** | `ReportAggregationService.getFlightReportDataBatch` (9 lookups × serial on missing FHR, ≤20 workers); `pdf-engine` / invoice PDF base64; ExcelJS `writeBuffer()`; `xlsx` parse in-process (§27) |
| **Remediation** | Stream to object storage; worker process for parse/render; never base64-persist large PDFs in Mongo |

#### 60.14 Billing preparation bulk actions

| | |
|---|---|
| **Backend** | `BillingPreparationService` bulk ready/delete/unsend |
| **Cost** | Slow path still per-record validate/save; delete/unsend snapshots + parallel audit promises |
| **Remediation** | Prefer existing batch fast paths; cap snapshot size (already partially done for activity logs) |

#### 60.15 App-wide notification polling

| | |
|---|---|
| **UI** | `UserNotificationCenterContext` — ~45s poll + delivery mark |
| **Cost** | Every mounted client hits list (+ occasional write); N users × replicas |
| **Remediation** | Push / longer interval / ETag; share Redis pub-sub when scaling (AUD-H08) |

### Cost pattern summary (backend lens)

| Pattern | Where it shows up | Energy effect |
|---|---|---|
| Full STA-window FHR materialize + Node transform | Scheduled Airlines, Quality, Delay analytics, dashboard worker | Atlas transfer + heap + GC |
| Sync materialize-on-read | Dashboard cold range, Delay Report cold days | Request latency + write amplification |
| Full-collection `find().lean()` | `filterByDateRange`, RAF MIS / legacy dashboard routes (§25) | O(collection) every call |
| Expand-then-cap | MAA ADS billing sources | CPU before limit; still large responses |
| Sequential per-doc save | Prep refresh, FHR reindex | Write storms, long locks |
| In-process workbook/PDF buffers | Import, invoice, exports | Heap spikes (§27) |
| Chatty polling | Missing FHR locks, notifications, dashboard card fan-out | Steady Mongo QPS |

### Prioritized remediation (resource-focused)

1. **P0:** Index + query `raw_flight_data` by date (§24 / §60.3); stop sync multi-day dashboard rebuild on HTTP (§60.2).  
2. **P1:** Shrink Scheduled Airlines / Quality path to column projections + day shards (§60.1, §60.4); always-on delay shards, retire full-scan analytics (§60.5).  
3. **P2:** Billing prep `bulkWrite` + ADS cursor pagination (§60.6–§60.8); move Excel/PDF off request heap (§60.13).  
4. **P3:** Admin analytics rollups; reduce polling (§60.11–§60.12, §60.15); Redis for FHR window cache (§26).

### Verification notes

- **Code verified** against services listed above (static review 2026-07-24).  
- **Runtime/DB unverified:** absolute P99 latency, Atlas bytes, and heap peaks need staging k6 / APM (§43 k6 scripts, §56 metrics).

---

## 61. Scheduled Airlines Apply Filters — computational architecture & performance audit — **Open** (2026-07-24)

**Canonical deep document (all 17 sections, mermaid, full call graph):**  
[`server/SCHEDULED_AIRLINES_ARCHITECTURE_PERF_AUDIT.md`](./SCHEDULED_AIRLINES_ARCHITECTURE_PERF_AUDIT.md)

**Entry point:** UI **Apply Filters** → `loadFlightsForYmdRange` → `GET /scheduled-airline-pipeline/daily-from-advance?from&to&nocache=1` (+ parallel `creation-raf`).  
**Orchestrator:** `RawFlightDataService.listDailyFromAdvance`  
**Cross-links:** §60.1, §24–§27, §26, AUD-H08, AUD-M12–M13.

### 61.1 Request flow (summary)

| Step | File / symbol | Cost notes |
|------|---------------|------------|
| Apply Filters | `ScheduledAirlinesScreen.handleFilter` / `loadFlightsForYmdRange` | Always `bustCache: true` |
| Client fetch | `api.ts` `fetchDailyScheduledFromAdvance` | `nocache=1`; `text` + `JSON.parse` |
| Proxy | `api-backend/[[...path]]/route.ts` | Full body buffer |
| Guards | JWT → Roles (pass) → PagePerm (pass) → Throttle; `@SkipTimeout` | Auth OK; no page decorator |
| Controller | `ScheduledAirlinePipelineController.listDailyFromAdvance` | Maps nocache → skipCache |
| Service pipeline | validate → skip cache **read** → forward-only IDs → FHR append → advance append → creation append → dedupe → serials → filter → finalize → times → **stringify bytes** → **cache write clone** → return | Serial kitchen-sink |
| Serialize | Nest JSON | Full `[{data}]` |
| Client post | `processFlightData` → date filter → RAF merge → React state | Extra copies |

### 61.2 Call graph (condensed)

```
Controller.listDailyFromAdvance
 └─ RawFlightDataService.listDailyFromAdvance
    ├─ loadForwardOnlyAdvanceScheduleIds          → advance_schedule_setup.find
    ├─ appendFhrCollectionRowsToDaily
    │   └─ FhrCollectionService.findAllLeanForScheduledTableMerge
    │       └─ loadStaWindowRowsCached
    │           ├─ fetchDashboardBundleRowsChunk   ⚠ wrong projection for list
    │           │   └─ fhr_collection.find(staDates).cursor
    │           └─ fetchAdvanceScheduleMasterSupplementForStaWindow
    │               └─ fhr_collection.find(scheduleId /^\d{6}$/).cursor  ⚠ unbounded
    ├─ appendAdvanceScheduleRowsToDaily           → advance_schedule_setup.find (all)
    ├─ appendScheduledCreationRowsToDaily         → scheduled_airlines_creation.find + O(C×R)
    ├─ dedupeDailyRowsByScheduleDay
    ├─ attachStableSerials                        → flight_instance_index (+ counter)
    ├─ finalizeDailyFhrCollectionOnly
    │   ├─ getCancelledKeysInRange                → flight_cancellations
    │   └─ loadExportedNavLabelsBySerials         → raw_flight_data fat $or
    ├─ applyAdvanceScheduleTimesToDailyRows       → advance_schedule_setup.find #3 + O(Rf×M)
    └─ setListDailyFromAdvanceCacheEntry(deepClone)  ⚠ even when skipCache
```

Full nested helper list: companion audit §2.

### 61.3 Database operations (every query on cold path)

| # | Collection | Op | Risk |
|---|------------|-----|------|
| 1 | `advance_schedule_setup` | `find` forward-only | Moderate |
| 2 | `fhr_collection` | `find`+cursor STA `$in` / legacy `$or` | Indexed `$in` OK; legacy branch heavy; **dashboard-wide projection** |
| 3 | `fhr_collection` | `find`+cursor all 6-digit `scheduleId` | **Critical scan** |
| 4 | `fhr_collection` | `updateOne` staDates normalize | Side-effect on GET |
| 5 | `advance_schedule_setup` | `find` all station | Full staging |
| 6 | `scheduled_airlines_creation` | `find` all station | Full staging |
| 7–9 | `flight_instance_index` / counter | `find` / `findOneAndUpdate` / `insertMany` | Write on read path |
| 10 | `flight_cancellations` | `find` date range | Bounded |
| 11 | `raw_flight_data` | `find` huge `$or` serials | **Weak plan** |
| 12 | `advance_schedule_setup` | `find`+`sort updatedAt` | **3rd duplicate** |
| 13+ | form collections | heal `update`s | Optional write fan-out |

Duplicate / N+1: advance×3; creation Nest nested loops; heal per-doc updates. All primary reads use `.lean()`.

### 61.4 Collections touched

`fhr_collection`, `advance_schedule_setup` (×3), `scheduled_airlines_creation`, `flight_instance_index`, serial counter, `flight_cancellations`, `raw_flight_data`, optional `terminal_details` / `load_control_details` / `ramp_details_1` / `main_details` on heal. Joins/expands are **in Node**, not Mongo `$lookup`.

### 61.5–61.7 CPU / RAM / event loop

| Hotspot | Complexity | Effect |
|---------|------------|--------|
| Creation overlay | **O(C×R)** | Sync freeze |
| Advance day expand | O(A×D) | CPU + rows |
| Master supplement | O(S) | Mongo + CPU |
| Times `masters.find` | **O(Rf×M)** | Sync |
| `JSON.stringify`×2–3 | O(payload) | Sync + heap spike |
| STA cache + result + Nest JSON | 3–4 window copies | Peak RAM |
| Dashboard projection in list cache | — | RAM waste vs list needs |

### 61.8 Caches

| Cache | Key | TTL / cap | UI hit rate | Defect |
|-------|-----|-----------|-------------|--------|
| List-daily | station:from:to | 5m / 8 | **~0%** (`nocache=1`) | Still **writes** deep clone |
| STA-window | date window only | 5m / 12 | Shared w/ dashboard | Cross-station; over-wide projection |
| Client inflight | qs | request only | Dedup only | — |

### 61.9–61.12 Data / merge / lifecycle

- Response = `[{ data: { many aliases } }]` from FHR + advance + creation + index + cancels + NAV.  
- Merges: FHR explode, advance calendar expand, creation overlay, natural-key dedupe, finalize enrich, time overlay, client RAF.  
- One flight ≈ Mongo lean → daily `data` object → JSON → client `FlightData` (**3–5 copies**); server peak often **3–4** simultaneous window representations.

### 61.13 Network

Alias duplication + unused embed-derived fields inflate payload. Parallel creation-raf adds second request. Slim DTO + pagination required for scale.

### 61.14 Hot path ranks (top)

**CPU:** creation O(C×R) → supplement scan → advance expand → FHR map → JSON clone → times O(Rf×M) → dedupe → serials → finalize → Nest serialize.  
**RAM:** STA cache (dashboard proj) → result arrays → list-daily clone → staging loads → response string.  
**Mongo:** FHR STA + supplement → raw NAV `$or` → advance×3 → creation full → index/cancel.

### 61.15 Optimizations (ROI order)

1. **P0 Materialize** `scheduled_daily_rows` (station + staYmd + serial) on write; list = indexed range + slim projection + cursor page.  
2. **P0** Soft-cache UI (drop default `nocache`) **and** skip cache write when `skipCache`.  
3. **P0** Replace regex master supplement with `staDates`-scoped query (or delete).  
4. **P1** Station in Mongo filter; list projection not dashboard bundle for this consumer.  
5. **P1** One advance load; Map-index creation + times; drop raw NAV read.  
6. **P2** Redis shared cache; heal off GET; worker expand; slim DTO.

Estimated cold-path wins if P0–P1 land: **50–90%** latency/CPU/RAM on list (staging must measure). Companion §15 has small/medium/large matrix per operation.

### 61.16 Scores (/10)

| Area | Score |
|------|------:|
| Controller | 6 |
| Orchestrator service | 3 |
| Mongo queries | 3 |
| Cache design | 2 |
| Merges | 3 |
| Serialization | 2 |
| Memory | 2 |
| CPU | 2 |
| Event-loop safety | 2 |
| Overall architecture | 3 |
| **Average** | **~2.8** |

### 61.17 Executive verdict

Request-time assembly of FHR + full-station advance/creation + unbounded master supplement + forced cache miss + deep-clone write **cannot** support millions of flights. Biggest wins: **materialized daily instances**, **kill supplement scan**, **fix nocache/cache-write contradiction**, **narrow projection + station-scoped FHR query**, **O(1) Map joins instead of O(C×R)/O(Rf×M)**.

**Verification:** code-traced 2026-07-24. Runtime P99/heap/Atlas bytes unverified — use `FHR_PERF_TIMERS=1`, `FHR_EXPLAIN_MERGE=1`, k6.

---

## 62. Computation power — consolidated issue register — **Open** (2026-07-27)

### Purpose

**Computation power** here means Nest **CPU**, **heap**, **event-loop blocking**, and Mongo **Atlas read/write bytes** burned by FRIS operator actions. This section is the single index. Page detail: **§60**. Scheduled Airlines deep call-graph: **§61**. Related mechanics: §23–§27, AUD-H08 / AUD-H12, AUD-M12–M13.

Severity = **resource cost under realistic operator load**, not CVSS.

### Critical computation-power issues

| ID | Issue | Dominant burn | Where | Detail |
|---|---|---|---|---|
| **CP-01** | Request-time STA-window FHR universe assembly | Atlas transfer + Node CPU/heap + GC | `/fris/flights/scheduledairlines`, Quality Report cold merge | §60.1, §60.4, §61 |
| **CP-02** | Sync multi-day dashboard materialize on HTTP | CPU + FHR re-read + summary upserts per missing day | `/fris/dashboard` Bird cold range | §60.2, §23 |
| **CP-03** | Full-collection date filter in Node | O(collection) I/O + parse/filter CPU | `RawFlightDataService.filterByDateRange` | §60.3, §24 |
| **CP-04** | Forced list `nocache` + deep-clone cache write | Useless CPU + RAM every Apply Filters | Client `nocache=1` + `JSON.parse(JSON.stringify)` | §61 |
| **CP-05** | Unbounded FHR master supplement (regex scheduleId) | Full/partial collection cursor + Node normalize | Scheduled list / advance supplement | §60.9, §61 |

### High computation-power issues

| ID | Issue | Dominant burn | Where | Detail |
|---|---|---|---|---|
| **CP-06** | Delay Report / analytics cold full STA scan | Multi FHR scans + Node multi-map build | `/fris/reports/delay` (+ analytics) | §60.5 |
| **CP-07** | MAA ADS/equipment/manpower expand-then-cap | Wide FHR agg → many rows in Node before ~20k cap | `/billing/ads` (and peers) | §60.6 |
| **CP-08** | Billing prep refresh sequential saves | Write storm + long request | Billing → Preparation → Refresh | §60.7 |
| **CP-09** | Invoice draft create/recompose heavy serial work | Per-customer compose + prep updates in txn | Billing → Invoices | §60.8 |
| **CP-10** | FHR reindex per-doc awaited updates | Read-all + write-each | Ops / maintenance reindex | §60.9 |
| **CP-11** | Creation/times overlays O(C×R) / O(Rf×M) | Nested loops on advance + masters | Scheduled Airlines merge | §61 |
| **CP-12** | Triple `advance_schedule_setup` load | Redundant Mongo + deserialize | `listDailyFromAdvance` path | §61 |
| **CP-13** | Dashboard-bundle projection used for scheduled merge | Over-fetch remarks/embeds vs lean columns | `fetchDashboardBundleRowsChunk` | §61 |

### Medium computation-power issues

| ID | Issue | Dominant burn | Where | Detail |
|---|---|---|---|---|
| **CP-14** | Drilldown merge-all-then-page | Heap grows with range before slice | Bird dashboard drilldowns | §60.10 |
| **CP-15** | Missing FHR lock polling (~4s) | Steady lean-by-serial QPS | `/fris/reports/missing-fhr` | §60.11 |
| **CP-16** | Admin Messaging/Incidents/Audit multi-agg | Parallel counts / recursive KPI | Admin workspaces | §60.12 |
| **CP-17** | In-process Excel/PDF/workbook buffers | Heap spikes on single thread | Import, invoice PDF, exports | §60.13, §27 |
| **CP-18** | Notification poll (~45s) × N clients | Steady list QPS across replicas | App-wide notification center | §60.15 |
| **CP-19** | In-memory STA-window Map cache (full row arrays) | Per-process RAM; not shared across replicas | `loadStaWindowRowsCached` | §26, AUD-M12 |
| **CP-20** | Unbounded MIS / legacy `find().lean()` | O(collection) every report call | RAF MIS, BHS, list endpoints | §25 |

### Computation-power remediation priority

1. **P0 (cut peak CPU/RAM):** Materialize `scheduled_daily_rows` (or day shards); kill sync multi-day dashboard rebuild on HTTP; index + Mongo-range `raw_flight_data` (§24 / CP-01–CP-03).  
2. **P0 (stop waste):** Drop default UI `nocache`; skip cache write when `skipCache`; replace regex master supplement with `staDates`-scoped query (CP-04–CP-05).  
3. **P1:** Station-scoped FHR filter + lean projection (not dashboard bundle); one advance load; Map-index creation/times joins (CP-11–CP-13); always-on delay shards (CP-06).  
4. **P2:** Billing `bulkWrite` + ADS cursor pagination (CP-07–CP-09); Excel/PDF off request heap (CP-17); Redis shared FHR cache (CP-19).  
5. **P3:** Reduce polling; admin rollups; paginate MIS (CP-14–CP-16, CP-18, CP-20).

### Scores (from §61 Scheduled Airlines cold path)

| Area | /10 |
|------|----:|
| Memory | 2 |
| CPU | 2 |
| Event-loop safety | 2 |
| Overall Apply Filters architecture | ~2.8 |

### Verification

- **Code verified** via §60 inventory + §61 call-graph (static).  
- **Runtime/DB unverified:** P99, heap peaks, Atlas bytes — stage with `FHR_PERF_TIMERS=1`, `FHR_EXPLAIN_MERGE=1`, `server/test/k6/`, APM (§56).

---

## Historical prioritized remediation order — **Superseded 2026-07-19**

### P0 — Before production traffic

1. **Authentication**: global JWT + public route whitelist (§1) — **done**; regression-test on every auth change.  
2. **PII / registration**: secure document download and upload path (§48, §53).  
3. **Seed / import**: env-gate modules or disable in production (§2–§3, **§58**).  
4. **Secrets / config**: `server/.env.example` + validated env schema (§4, **§50**).  
5. **Health probes**: liveness + Mongo readiness (§**44**).  
6. **Report auth**: `@Roles()` on JWT-only report reads (§41).  
7. **Password hashing**: hash inside `AdminService.updatePassword` (§10, §37).

### P1 — Production hardening (first month)

8. **Operational protection rollout**: staging soak → enforcement (§6, §36, §43).  
9. **Helmet** / security headers (§7); **CORS from env** (§5).  
10. **Graceful shutdown** (§**45**).  
11. **Global exception filter** + request id in errors (§**49**).  
12. **Session revocation** or shorter cookie TTL + `tokenVersion` (§**55**).  
13. **MCP / AI**: keep read-only and backend-mediated (§39).  
14. **Single-replica constraint** documented until Redis stores wired (§**46**).

### P2 — Scalability and integrity

15. **Data integrity**: `mainDetails` dedupe + dual-write policy + transactions where feasible (§34, §28, **§47**).  
16. **`raw_flight_data` date query** and pagination (§24).  
17. **Performance**: unbounded `find()` on MIS / legacy routes (§25); FHR cache → Redis or aggregates (§26).  
18. **Cron leader election** or worker split (§**52**).  
19. **Mongo pool tuning** (§**57**).  
20. **Advance Invoicing** NAV integration tests (§42).

### P3 — Operational excellence

21. **Dockerfile + CI** with `test:smoke` (§**51**, §16–§17).  
22. **Unified JSON logging** + metrics/tracing (§15, **§56**).  
23. **OpenAPI / API versioning** for external consumers (§**54**).  
24. **Mongo cleanup**: legacy collections (§32–§33, §35).  
25. **ValidationPipe strictness** + auth DTOs (§11, **§59**).  
26. **TypeScript / ESLint** tightening (§12–§13) as ongoing hygiene.

**Already improved (do not regress):** event-driven **`dashboard_summaries`** worker (§23); Bird UI reads materialized bundles; Quality Report via **`GET /reports/quality-scheduled-table`** (§41); NAV export sync (§42); selected Billing CRUD → User Activity with aggregate preparation events (2026-07-19 update); admin-directory superadmin profile sync (2026-07-19 update); **`ProtectionModule`** + **`npm run test:smoke`** (§43); production **`/seed/*` block** (§2); **`x-request-id`** (§15, §43); global JWT (§1).

---

*Re-run this review after major refactors. For dashboard-specific changes, update `DASHBOARD_ARCHITECTURE_AUDIT.md` first, then mirror key points here. For page-level CPU/RAM/DB cost, update **§60**. For Scheduled Airlines Apply Filters computational architecture, update `SCHEDULED_AIRLINES_ARCHITECTURE_PERF_AUDIT.md` and **§61**. For the consolidated computation-power register (CP-01–CP-20), update **§62**.*
