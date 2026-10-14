# Billing issues and remediation guide

**Last reviewed:** 2026-08-06 (Billing Workspace Phase 0–2; prior BILL-M04 2026-08-05)  
**Code roots:** `BWMS/modules/m-billing/` · Nest shell `BWMS/apps/api/src/billing/` (junction)  
**Cross-links:** [`BILLING_WORKSPACE_MIGRATION.md`](./BILLING_WORKSPACE_MIGRATION.md) (per-user UI workspace + test guides) · [`BHS_ADS_BILLING_ARCHITECTURE.md`](../server/src/BHS_ADS_BILLING_ARCHITECTURE.md) · Nest [`SERVER_ISSUES_AND_REMEDIATION.md`](../../../apps/api/SERVER_ISSUES_AND_REMEDIATION.md) (AUD-H05, AUD-H07, 2026-08-05 billing dashboard nav note)

> **Authoritative for billing product/UX/ops issues.** Security, transactions, and Nest-wide defects remain in the server remediation register; this file tracks **billing module** defects, UI remediations, and operator-facing follow-ups.

---

## Active register (billing-focused)

### High (server — see Nest register)

| ID | Summary | Status |
|----|---------|--------|
| **AUD-H05** | Billing aggregate mutations not fully transactional | **Partial** — see Nest `SERVER_ISSUES_AND_REMEDIATION.md` |
| **AUD-H07** | Startup index sync can mutate production indexes | **Open** — includes `billing-index-migration.service` |

### Medium / product

| ID | Summary | Status |
|----|---------|--------|
| **BILL-M01** | BHS source page title / audit subtitle / palette chrome mismatched ADS | **Resolved** 2026-08-04 |
| **BILL-M02** | Billing sidebar vs FRIS top-nav dual chrome | **Resolved** — sidebar removed; Master Data / Workflow / Operational Sources / Others live in FRIS navbar billing chrome |
| **BILL-M03** | Catalog `POST …/seed` demo endpoint | **Resolved** — endpoint removed (aligns with Nest seed hardening) |
| **BILL-M04** | Master / Workflow / Billed Services dashboards missing from billing chrome | **Resolved** 2026-08-05 — catalog IDs + Navbar `mayUseBillingHref` restored (`d23f79aa`); see Nest register 2026-08-05 note |

### Residual / follow-up

1. Route path remains `/billing/scheduled-flights` (stable API/bookmarks); UI title and nav label are **BHS**.
2. ADS brief palette and BHS palette share compact chip sizing; keep them aligned when either changes.
3. Cutover / decommission / parallel-run multi-writes still outside AUD-H05 transaction helper.
4. Custom billing (`sourceType: custom` / `CUSTOM` invoice category) — product path exists on branch; keep architecture + this register updated when operators expand usage.
5. Re-verify `prep-dashboard` / `billed-services` catalog entries + Navbar grant aliases after every `main`↔`backend` merge that touches `bwms-app-page-catalog` or billing chrome Navbar.
6. **Billing Workspace** Phase 0–6 done (masters hydrate/persist + Station Profile reset + particulars FIFO cap). See [`BILLING_WORKSPACE_MIGRATION.md`](./BILLING_WORKSPACE_MIGRATION.md). Optional later: more React Query GETs; dashboards if operators hit state-loss pain.

---

## Update notes — 2026-08-05

### BILL-M04 — Three focused dashboards dropped from nav after main merge — **Resolved**

**Symptom:** Routes `/billing/dashboard` (master), `/billing/prep-dashboard` (workflow), `/billing/billed-services` (sources) still rendered when opened directly, but chrome dropdowns hid **Dashboard** under Workflow / Billed Services.

**Root cause:** Merge `f8eaf9cb` (*Merge origin/main into backend*) kept billing UI formatting but took main’s platform catalog + FRIS Navbar — removed `prep-dashboard` / `billed-services` page IDs and `mayUseBillingHref` aliases. Filter then dropped unknown hrefs.

**Remediation:** Restored catalog IDs + Navbar aliases/labels in module homes; commit `d23f79aa`. Full timeline in Nest `SERVER_ISSUES_AND_REMEDIATION.md` → Update notes 2026-08-05.

**Verification:** Catalog contains both page IDs; Navbar exposes Master / Workflow / Billed Services with Dashboard links; hard-refresh billing after remount.

---

## Update notes — 2026-08-04

### BILL-M01 — BHS page UX vs ADS palettes / audit noise — **Resolved**

**Symptom:** `/billing/scheduled-flights` showed title **Scheduled flights**, a long BC/API audit subtitle, and tall stat “palettes” unlike the compact ADS usage chips.

**Remediation applied:**

| Area | Change |
|------|--------|
| `SourcePages.tsx` → `ScheduledFlightsSourcePage` | `title: 'BHS'`; `description: ''` (no BC audit / API line) |
| `BillingScheduledFlightsStatsBar.tsx` | Compact horizontal chips (`min-h-9`, checkbox + label + count) matching ADS brief bar density/grid |
| `OperationalSourcePage.tsx` | Manual-search banner says **BHS** (not “scheduled flights”) |
| `billingAppNav.ts` | Operational Sources nav label already **BHS** |

**Verification:** Visual parity with `/billing/ads` palette chip size; header shows **BHS** only.

**Do not regress:** Re-adding `BC_SCREEN_INVENTORY` / API path text under the BHS page title for operators.

### BILL-M02 — Billing sidebar removed; navbar chrome — **Resolved**

**What changed:** `BillingSidebar.tsx` deleted; `BillingLayout` is full-width main. Billing entry sets `bwmsEntryApp=billing` so shared FRIS navbar shows Master Data / Workflow / Operational Sources / Others + Advance / Flights / MIS.

**Docs:** Prefer `billingAppNav.ts` over any `BillingSidebar` references in older specs (`UI_UX_SPECIFICATION.md` may still list the sidebar — treat as stale until that doc is refreshed).

### BILL-M03 — Service catalog seed endpoint — **Resolved**

`POST` catalog seed removed from billing service-catalog controller (Nest). Operators use normal catalog CRUD; aligns with production seed block.

---

## Update notes — prior (pointers)

| Date | Topic | Where |
|------|--------|--------|
| 2026-07-23 | Billing Mongo transactions (AUD-H05 partial) | Nest `SERVER_ISSUES_AND_REMEDIATION.md` |
| 2026-07-19 | Billing CRUD → Admin User Activity | Nest update notes |
| 2026-07-27 | BHS/ADS architecture snapshot | `BHS_ADS_BILLING_ARCHITECTURE.md` |

---

## Operator-facing page names (current)

| Nav / UI label | Route | Notes |
|----------------|-------|--------|
| **BHS** | `/billing/scheduled-flights` | Compact palettes; no audit subtitle |
| **ADS** | `/billing/ads` | Brief palette chips (reference sizing) |
| Equipment / Manpower | `/billing/equipment`, `/billing/manpower` | ADS-family filters |
| Preparation → Invoices | workflow routes | Unchanged |

---

*When fixing billing UX or source/prep/invoice defects, add a dated update note here and bump **Last reviewed**. Mirror Nest-only security/transaction work in `SERVER_ISSUES_AND_REMEDIATION.md`.*
