# BHS & ADS billing architecture

**Scope:** FRIS native billing for **BHS** (Basic Handling Services / scheduled flights) and **ADS** (Additional / equipment–manpower services).  
**Audience:** Engineers and operators who need the full invoicing flow from operational data through master data, preparation, drafts, approval, and posted invoices.  
**Code roots:**

| Layer | Path |
|---|---|
| Nest module | `BWMS/modules/m-billing/server/src/` (mounted at `apps/api/src/billing/`) |
| UI routes | `BWMS/modules/m-billing/client/app/billing/` |
| App nav | FRIS top navbar billing chrome — `client/components/billing/billingAppNav.ts` (no sidebar) |
| Client API | `client/lib/billing-api.ts` |
| Related feed | `server/src/advance-invoicing/` (scheduled-flight / NAV bridge into billing sources) |
| Issues register | [`docs/BILLING_ISSUES_AND_REMEDIATION.md`](../../docs/BILLING_ISSUES_AND_REMEDIATION.md) |

**Last updated:** 2026-08-04

---

## 1. What BHS and ADS mean in FRIS

| | **BHS** | **ADS** |
|---|---|---|
| **Business meaning** | Charge for handling a scheduled flight (package / service aggregate) | Charge for measured equipment, manpower, wheelchair usage beyond (or outside) the BHS package |
| **Primary UI source page** | `/billing/scheduled-flights` (nav/title: **BHS**) | `/billing/ads` (nav/title: **ADS**); also `/billing/equipment`, `/billing/manpower` |
| **Preparation `sourceType`** | `scheduled_flight` | `ads`, `equipment`, `manpower` (ADS family) |
| **Invoice category** | `BHS` | `ADS` |
| **Draft grouping** | Customer + billing period + **`BHS`** | Customer + billing period + **`ADS`** |
| **Pricing source of truth** | Price-card airline **package price** + contract rate cards / BHS conditional charges & concessions | Contract **`adsEquipmentRules`** (Included-for-ADS ticks, UOM, unit price, free allowance). Rate Cards tab is **not** the ADS price path |
| **Unit of bill** | Flights aggregated into service/package lines (quantity ≈ flight count) | Usage lines: used units → free-per-flight → charged units, then aggregated |

BHS and ADS **never share one tax invoice**. `preparationInvoiceGroupKey` always appends the category so a customer can have a BHS invoice and an ADS invoice for the same period.

```text
groupKey = CUSTOMER|periodStart|periodEnd|BHS|ADS|RAF|OTHER
```

Implementation: `common/billing-invoice-period.util.ts` → `preparationInvoiceCategory` / `preparationInvoiceGroupKey`.

---

## 2. End-to-end flow (both products)

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  A. MASTER DATA (must exist before charging)                            │
│  Dashboard · Customers · Service Catalog · Contracts · Concessions      │
│  Rate Cards · Conversion Rates · Station Profile / Taxes / Sequences    │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────────┐
│  B. OPERATIONAL SOURCES (read-only palette → send into preparation)     │
│  BHS: Scheduled Flights                                                 │
│  ADS: ADS / Equipment / Manpower                                        │
│  (Other sources exist but are outside the BHS/ADS core path — §7)       │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ ingest / send to preparation
┌────────────────────────────────▼────────────────────────────────────────┐
│  C. PREPARATION                                                         │
│  Validate → checklist → ready_for_invoice → create drafts               │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────────┐
│  D. INVOICE WORKFLOW                                                    │
│  Drafts → Review (approve) → Invoices (generate PDF / post / send)      │
│  Invoice bin · Credit memos · Backing sheets                            │
└─────────────────────────────────────────────────────────────────────────┘
```

Operator mental model:

1. Set up **who** is billed and **how** (master data).  
2. Open a **date window** on the source page; inspect flights / usage; **send** eligible rows into Preparation.  
3. Fix validation / checklist on Preparation until status is **ready_for_invoice**.  
4. **Create drafts** (one draft per customer × period × BHS|ADS).  
5. Edit / recompute drafts if needed → **submit for approval**.  
6. **Review** approves → invoice becomes **approved**.  
7. **Generate** PDF (+ backing sheet) → **post** (fiscal number) → optional **send to airline**.

---

## 3. Master data pages (shared by BHS and ADS)

These pages do not create invoices. They define identity, eligibility, prices, tax, and numbering used by enrichment and the invoice engine.

### 3.1 `/billing/dashboard`

**Purpose:** Station-scoped billing KPI overview (open prep, draft/pending counts, posted revenue signals).  
**Role in flow:** Situational awareness only; not required to produce an invoice.

### 3.2 `/billing/customers`

**Purpose:** Customer / airline master — code, legal & bill-to names, address, GST, currency, payment terms, Advance/Gateway schedule links, enabled handling types (BHS / ADS / RAF).  
**Role in flow:**

- Source enrichment resolves **customer** from airline / customer code.  
- Contracts and drafts hang off `customerCode`.  
- Currency on the customer drives INR/USD invoice composition and conversion-rate lookup.

### 3.3 `/billing/service-catalog`

**Purpose:** Canonical service codes (categories: scheduled, equipment, manpower, raf, xxld, cleaning, maas, …), UOM, SAC / GST posting hints, royalty flags.  
**Role in flow:**

- Labels and tax classification for invoice lines.  
- Defaults for preparation `serviceCode` when the source does not already carry one (`shared/preparation-source-defaults.ts`).

### 3.4 `/billing/contracts`

**Purpose:** Commercial agreement between station and customer: Dom/Int category, aircraft types, validity dates, status (`draft` / `active` / `expired`), clauses, **BHS** conditional charges & concessions, **`adsBillingEnabled`**, and **`adsEquipmentRules`** (Included-for-ADS, aircraft scope, UOM, unit price, free / always-chargeable).  
**Role in flow:**

| Product | Contract contribution |
|---|---|
| **BHS** | Active contract by customer + date + Dom/Int; feeds package / rate matching and conditional % scaling of BHS unit price |
| **ADS** | Must have ADS billing enabled; equipment rules are the **only** charge authority for ADS compose |

Saving ADS-relevant contract fields can trigger background re-enrichment of open ADS preparation rows and rebuild of open ADS drafts so invoices stay aligned with live rules.

### 3.5 `/billing/concessions`

**Purpose:** Edit concession scenarios used on contracts (Dom/Int fees, diverted, return-to-ramp, cancellation windows, cargo %, technical / standby %, etc.).  
**Role in flow:**

- **BHS:** Conditional charge scenarios can scale package unit price (`invoice-concession.util.ts`).  
- **ADS:** Fee-style concessions from the Concessions page may apply; BHS package `conditionalCharges` are **not** applied to ADS equipment unit prices.

### 3.6 `/billing/rate-cards`

**Purpose:** Contract-linked rate cards (INR/USD, UOM, inclusive/exclusive scope, ceilings, allowances). UI also shows BHS airline package cards and ADS dual-count tooling.  
**Role in flow:**

- **BHS:** Rate cards + price-card airline package price feed scheduled-flight enrichment and BHS compose.  
- **ADS:** Contract equipment rules take precedence; enrichment / invoice engine intentionally **bypass** Rate Cards as the ADS price path (`ads-equipment-inclusion.util.ts`). Inclusive markers still help explain “package included / not billed on ADS”.

### 3.7 `/billing/conversion-rates`

**Purpose:** Maintain INR↔USD rates (manual / RBI / import) with effective dates.  
**Role in flow:** Used when composing or converting invoice amounts for USD customers / dual-currency lines.

### 3.8 Settings cluster

| Route | Purpose |
|---|---|
| `/billing/settings` | Station profile — legal entity, bank, GST state, approval required?, defaults, cutover flags |
| `/billing/settings/currency` | Currency-related station settings view |
| `/billing/settings/taxes` | Tax rules (CGST/SGST/IGST, place of supply, effective dates) |
| `/billing/settings/sequences` | Fiscal invoice / credit-memo number sequences per station |

**Role in flow:** Tax engine + posting sequences + whether drafts must go through Review before generate/post.

---

## 4. Operational sources — BHS

### 4.1 Page: `/billing/scheduled-flights` (UI title / nav: **BHS**)

**Purpose:** Operational palette of scheduled flights eligible (or already sent) for BHS preparation for a chosen station + date window.

**UI (2026-08-04):** Page title **BHS** (not “Scheduled flights”). No BC/API audit subtitle under the title. Stat filters use **compact chips** (same size language as ADS usage brief palettes) — see `BillingScheduledFlightsStatsBar.tsx` / `BILLING_ISSUES_AND_REMEDIATION.md` BILL-M01.

**Upstream data:**

1. `fhr_collection` (and related FHR merge) for STA-window scheduled flights.  
2. Optional join to `raw_flight_data` for ATD / exported-NAV style filters (Advance Invoicing / NAV bridge patterns).  
3. Enrichment against **customers**, **active contracts**, **price-card airline package**, **rate cards**, **BHS concessions**.

**What the operator sees / does:**

- Filter by date (and airline where offered).  
- Toggle compact category palettes to filter the table.  
- Inspect flight identity: serial, flight number, customer, aircraft, Dom/Int, operational times, cancellation context.  
- See enrichment: matched contract, package/rate hints, already-in-preparation flag.  
- **Send / ingest** selected rows into Preparation as `sourceType = scheduled_flight`.

**Server path (summary):**

`BillingSourcesController` → `BillingSourcesService` → `BillingSourcesScheduledService` (+ enrichment) → later `BillingPreparationService` ingest.

**One flight → one BHS preparation row** (deduped by BHS category + flight identity for the period). ADS rows for the same flight remain separate.

---

## 5. Operational sources — ADS

### 5.1 Page: `/billing/ads` (sidebar: **ADS**)

**Purpose:** Combined ADS-family usage palette (equipment + manpower + wheelchair-style lines) for the station + date window.

### 5.2 Page: `/billing/equipment`

**Purpose:** Same ADS pipeline filtered to **equipment** usage lines only.

### 5.3 Page: `/billing/manpower`

**Purpose:** Same ADS pipeline filtered to **manpower** usage lines only.

**Upstream data (station-dependent):**

| Station pattern | Source of truth |
|---|---|
| MAA / most FHR stations | Scheduled FHR embeds: `equipmentDetails` / `equipmentManpower` (+ equipment-manpower catalog). Mapper: `shared/fhr-equipment-to-ads-row.ts` |
| Excel-led stations (e.g. default DLH pattern) | `ads_usage_data` collection |

**Mapping rules (conceptual):**

- One FHR (or Excel) document can expand to **many** ADS source rows.  
- Each row carries: particular / service label, aircraft, UOM, used units (time-based UOMs use started-hour / half-hour block rules), optional free allowance inputs.  
- Wheelchair codes (WCHR / WCHS / WCHC) can be mapped into ADS rows when contract rules list them.  
- Enrichment resolves customer + **active ADS-enabled contract** + matching **`adsEquipmentRules`**.  
- Pricing bases include: contract rule price, adhoc tariff, package-inclusive (not billed), ads_excluded, not_on_contract.

**What the operator does:**

- Review used / free / charged hints and pricing basis.  
- Send lines into Preparation (`ads` / `equipment` / `manpower`).  
- Preparation treats the whole ADS family as one invoice category for grouping and dedupe.

**Server path (summary):**

`BillingSourcesController` → `BillingSourcesUsageService` (+ `BillingSourceEnrichmentService`) → Preparation ingest.

---

## 6. Preparation workflow

### 6.1 Page: `/billing/preparation`

**Purpose:** Single workbench for all source types after ingest. This is the control gate before money is drafted.

**Core statuses** (`PREPARATION_STATUSES`):

```text
eligible → pending / validation_error → ready_for_invoice → invoiced
                ↘ rejected (terminal until reintroduced)
```

| Status | Meaning |
|---|---|
| `eligible` / `pending` | In prep; work remaining |
| `validation_error` | System rules failed; fix data or override carefully |
| `rejected` | Explicitly rejected from workflow |
| `ready_for_invoice` | Checklist confirmed; eligible for draft creation |
| `invoiced` | Linked into a draft/invoice; released back to `ready_for_invoice` if draft/invoice is deleted/released |

**Typical actions on this page:**

1. **List / filter** by period, customer, source type, status.  
2. **Validate** — runs rule set (serial, cancellation, ATD where required, contract match, price/rate or ADS rule match, flight category, currency, customer/service linkage).  
3. **Checklist** — every validation rule (plus optional custom checks) must pass or be manually overridden; `allChecklistConfirmed` gates Ready (`shared/preparation-checklist.ts`).  
4. **Remarks / send back / reject** — operator collaboration and exception handling.  
5. **Refresh** — re-pull enrichment from live master data / sources for open rows.  
6. **Mark ready** (single or bulk).  
7. **Create drafts** — calls `BillingInvoiceDraftsService.createFromPreparation`: groups by `customerCode|period|BHS|ADS|…`, composes lines via `InvoiceEngineService`, marks linked prep rows `invoiced`.

**BHS vs ADS on Preparation:**

| Concern | BHS | ADS |
|---|---|---|
| Row grain | One row per flight | One row per usage line (UI often groups flight-wise) |
| Dedupe category | `scheduled_flight` / BHS | Shared ADS family (`ads`/`equipment`/`manpower`) |
| Pricing snapshot | Package / rate / concessions | ADS rule unit price, free, used, charged, `pricingBasis` |
| Invoice output | Separate BHS draft | Separate ADS draft |

---

## 7. Invoice workflow pages

### 7.1 `/billing/invoice-drafts`

**Purpose:** Edit generated (or manual) drafts before approval.

**Actions:** View/edit header & lines, add/remove lines, recalc / recompute from linked preparation, currency conversion, remarks, **submit for approval** → status `pending_approval`.

**Engine notes:**

- **BHS compose:** Aggregate flights by service/package/rate/aircraft/UOM; quantity from flight count; apply package price and conditional charge %.  
- **ADS compose:** Per-flight free allowance → charged units; drop `ads_excluded` / `not_on_contract` / `package_inclusive` / zero / fully free; aggregate by particular/aircraft/price/UOM; **re-check live contract rules** so stale prep cannot bill excluded equipment.

### 7.2 `/billing/review`

**Purpose:** Approval queue for drafts in `pending_approval`.

**Actions:** Inspect draft + source/prep trace → **approve** (`approved`) or **reject** (returns to `draft`).  
Station settings may require this step before generate/post.

### 7.3 `/billing/invoices`

**Purpose:** List of approved / generated / posted (and related) invoices.

### 7.4 `/billing/invoices/[id]`

**Purpose:** Invoice detail — lines, preparation/source trace, amounts, tax, actions.

**Lifecycle actions:**

```text
draft → pending_approval → approved → generated → posted
                              ↘ cancelled / archived
```

| Action | Effect |
|---|---|
| **Generate** | Build PDF; create/update **backing sheet** |
| **Post** | Allocate fiscal sequence; set receivable balance; invoke legacy NAV bridge where configured |
| **Send to airline** | Delivery step after post (station process) |
| **Cancel / archive / delete** | Lifecycle exits; prep rows may return to `ready_for_invoice` when appropriate |

### 7.5 `/billing/invoice-bin`

**Purpose:** Soft-bin for invoices (`inBin` flag — separate from status). Restore or permanently delete.

### 7.6 `/billing/credit-memos`

**Purpose:** Corrections against **posted** invoices (XXLD not chargeable, delay dispute, correction, other).  
Statuses: `draft` → `posted` (allocates `CM-<station>` sequence, snapshots PDF, reduces original outstanding).  
**Note:** Backend supports create/post/PDF; UI may currently be list-heavy — treat create/post as API-capable even if UI is thin.

### 7.7 `/billing/backing-sheets`

**Purpose:** Per-invoice backing row documents produced alongside PDF generation (operational evidence behind invoice lines).

---

## 8. BHS path — step-by-step

```text
Master data ready
  Customers + Service Catalog + active Contract (BHS)
  + Price-card airline package + Rate cards + Concessions + Tax/ROE/Sequences
        │
        ▼
/billing/scheduled-flights
  Load STA window from FHR (+ optional raw NAV/ATD filters)
  Enrich: customer, contract, package/rate, Dom/Int, cancellation
  Operator sends flights → Preparation (sourceType=scheduled_flight)
        │
        ▼
/billing/preparation
  Validate + checklist → ready_for_invoice
  Create drafts → groupKey …|BHS
        │
        ▼
InvoiceEngine (BHS)
  Aggregate flights → package/service lines
  Apply package price + conditional charge % / concessions
  Tax + currency
        │
        ▼
/billing/invoice-drafts → /billing/review → /billing/invoices/[id]
  Generate PDF + backing sheet → Post → Send
```

**Design intent:** Bill **handling of the flight**, not individual equipment clicks.

---

## 9. ADS path — step-by-step

```text
Master data ready
  Customers + Service Catalog + active Contract with adsBillingEnabled
  + adsEquipmentRules (Included-for-ADS, UOM, price, free, aircraft scope)
  + Tax/ROE/Sequences
  (Rate Cards not used as ADS price authority)
        │
        ▼
/billing/ads  (or /equipment or /manpower)
  Expand FHR equipment/manpower (or ads_usage_data) → many usage rows
  Enrich against contract ADS rules → used / free / charged / pricingBasis
  Operator sends lines → Preparation (ads|equipment|manpower)
        │
        ▼
/billing/preparation
  Validate + checklist → ready_for_invoice
  Create drafts → groupKey …|ADS   (never mixed with BHS)
        │
        ▼
InvoiceEngine (ADS)
  charged = max(0, used − freePerFlight) per flight
  Skip excluded / not_on_contract / package_inclusive / zero / fully free
  Aggregate charged units by particular × aircraft × price × UOM
  Live re-check contract rules during compose
  Tax + currency
        │
        ▼
Same draft → review → generate → post path as BHS
```

**Design intent:** Bill **measured additional services**, with free allowance evaluated **per flight**, separate tax invoice from BHS.

**Time-based UOM (ADS):**

- **Per Hour:** started hours with a small grace window before the next hour.  
- **Per Half Hour:** ceil to 30-minute blocks (no grace).  
- Quantity of equipment is ignored for time-based UOM — block count only.  
Implementation: `shared/rate-card-billing-scope.ts` (`adsTimeBasedUnits`) + `computeAdsUsedUnits` in `fhr-equipment-to-ads-row.ts`.

---

## 10. Other billing pages (same shell, not BHS/ADS core)

These appear under sidebar **Others** (and related). They share the Preparation → Draft → Invoice machinery when used, but are **not** the BHS/ADS product paths.

| Route | Purpose |
|---|---|
| `/billing/cleaning` | Cabin cleaning operational source |
| `/billing/raf` | RAF usage source → invoice category `RAF` |
| `/billing/maas` | MAAS source (remarks/heuristic; deeper PSR integration may be pending) |
| `/billing/xxld-scheduled` | Cancelled scheduled-flight billing source |
| `/billing/xxld-non-scheduled` | Cancelled non-scheduled billing source |
| `/billing/non-scheduled` | Non-scheduled operational intake |
| `/billing/reports` | Revenue, schedule reconciliation, delay, XXLD, tax reports |
| `/billing/audit` | Billing audit trail |
| `/billing/cutover` | BC → FRIS cutover controls |
| `/billing/parallel-run` | Parallel-period reconciliation |
| `/billing/decommission` | BC decommission readiness / execution |

Invoice category mapping for non-core sources: `raf` → `RAF`; everything else that is not scheduled/ADS-family → `OTHER` (`preparationInvoiceCategory`).

---

## 11. Server architecture map (BHS & ADS)

```text
billing.module.ts
├── controllers/          HTTP surface (station-scoped + page access)
├── services/             Domain orchestration
│   ├── sources/          Scheduled (BHS) · Usage (ADS) · Enrichment · FHR helpers
│   ├── billing-preparation.service.ts
│   ├── billing-invoice-drafts.service.ts
│   ├── billing-invoices.service.ts
│   ├── billing-contracts.service.ts
│   └── …
├── engines/
│   ├── invoice-engine.service.ts     BHS vs ADS compose
│   ├── tax-engine.service.ts
│   ├── pdf-engine / invoice-pdf.*    PDF + backing sheet
│   ├── approval-workflow.service.ts
│   └── audit / export / validation / currency / reporting
├── schemas/              Mongo collections for customers, contracts, prep, invoices, …
├── shared/               Enums, ADS mappers, rate-card scope, checklist, types
├── adapters/             Advance invoicing + legacy NAV / export guards
├── common/               Station scope, group keys, transactions, decorators
├── dto/                  Request validation
└── utils/                Dates, customer codes, concessions, flight display, …
```

**Key server files for BHS/ADS understanding:**

| Concern | File |
|---|---|
| Category / group key | `common/billing-invoice-period.util.ts` |
| BHS sources | `services/sources/billing-sources-scheduled.service.ts` |
| ADS sources | `services/sources/billing-sources-usage.service.ts` |
| Enrichment | `services/sources/billing-source-enrichment.service.ts` |
| FHR → ADS rows | `shared/fhr-equipment-to-ads-row.ts` |
| ADS contract rules | `shared/ads-equipment-inclusion.util.ts` |
| Line compose | `engines/invoice-engine.service.ts` |
| Prep gate | `services/billing-preparation.service.ts` |
| Draft create | `services/billing-invoice-drafts.service.ts` |
| Enums / statuses | `shared/enums.ts` |

---

## 12. State machines (reference)

### Preparation

```text
eligible / pending
        │ validate
        ├─► validation_error ──fix ──► pending
        ├─► rejected (stop)
        └─► checklist OK ──► ready_for_invoice ──create drafts──► invoiced
                                      ▲                              │
                                      └──────── release / delete ────┘
```

### Invoice

```text
draft ──submit──► pending_approval ──approve──► approved ──generate──► generated ──post──► posted
  ▲                      │ reject
  └──────────────────────┘
posted / generated / approved may also → cancelled | archived
bin is orthogonal: inBin true/false
```

### Credit memo

```text
draft ──post──► posted  (reduces parent invoice remaining amount)
```

---

## 13. Operator checklist — produce a BHS invoice

1. Customer exists; currency correct.  
2. Active contract covers Dom/Int + aircraft + period.  
3. Price-card airline package / rate cards present for the airline.  
4. Tax rules + sequences + (if needed) conversion rates configured.  
5. Open **BHS** (`/billing/scheduled-flights`), set period, send flights.  
6. On **Preparation**, clear validation, confirm checklist, mark ready.  
7. Create drafts → edit if needed → submit → **Review** approve.  
8. Open invoice → generate PDF → post → send.

---

## 14. Operator checklist — produce an ADS invoice

1. Customer exists.  
2. Active contract has **`adsBillingEnabled`** and correct **`adsEquipmentRules`** (ticks, aircraft, UOM, price, free).  
3. Tax / sequences / ROE ready.  
4. Open **ADS** (or Equipment / Manpower), set period, confirm used/charged/pricing basis, send lines.  
5. Preparation: validate + checklist → ready → create drafts (**ADS** group, separate from BHS).  
6. Drafts → Review → Generate → Post → Send.  
7. If contract rules change later, expect prep/draft refresh for open ADS work.

---

## 15. Non-goals / boundaries

- This document does **not** redefine BC (legacy) billing internals; see Cutover / Parallel run / Decommission pages for migration.  
- Cleaning, RAF, MAAS, XXLD, Non-Scheduled share the shell and prep/invoice pipeline but have their own source semantics — treat §10 as the index, not a full product design.  
- Client and server must stay aligned on shared enums/types under `server/src/billing/shared/` (mirrored into the client billing packages where applicable).

---

## 16. Quick glossary

| Term | Meaning |
|---|---|
| **BHS** | Basic handling invoice category from scheduled flights |
| **ADS** | Additional services invoice category from equipment/manpower/ADS usage |
| **Preparation** | Staging area between operational sources and invoice drafts |
| **Price-card airline** | Airline × aircraft × Dom/Int package price (heavy for BHS) |
| **adsEquipmentRules** | Contract tick-list that prices and includes/excludes ADS lines |
| **Backing sheet** | Supporting detail document generated with the invoice PDF |
| **Group key** | Ensures one open draft path per customer × period × BHS\|ADS\|RAF\|OTHER |

---

*When changing BHS or ADS pricing, enrichment, or grouping behavior, update this file and the related services under `services/sources/` and `engines/invoice-engine.service.ts`.*
