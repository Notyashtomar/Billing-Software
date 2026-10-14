# Billing KPIs, Pages & Invoice Flow

**Scope:** The three primary billing chrome tabs — **Master Data**, **Billed Services**, and **Workflow**.  
**Source of truth:** Live nav (`billingAppNav.ts`), dashboard KPIs (`GET /billing/dashboard`), preparation / invoice engines.  
**Station rule:** Every page and KPI is scoped to the logged-in station (`stationCode`). Data never crosses stations.

```
Master Data  →  Billed Services  →  Workflow
 (who/what/rates)   (ops usage)      (prep → draft → approve → post)
```

---

## End-to-end data movement (all three tabs)

```mermaid
flowchart LR
  MD[Master Data] --> SRC[Billed Services]
  SRC -->|Send to Preparation| PREP[Preparation]
  PREP -->|Create drafts| DRAFT[Invoice drafts]
  DRAFT --> REV[Review / Approve]
  REV --> PDF[Generate PDF]
  PDF --> POST[Post invoice]
  POST --> SEQ[Invoice sequence number]
```

| Stage | Tab | What moves |
|-------|-----|------------|
| 1. Setup | Master Data | Station profile, customers, catalog, contracts, concessions, rates, tax, FX, sequences |
| 2. Capture | Billed Services | FRIS ops (FHR / flights) → eligibility + contract/rate match → prep rows |
| 3. Compose | Workflow | Prep rows → invoice lines → draft → approve → PDF → posted invoice |

---

# 1. Master Data

**Nav:** Dashboard · Customers · Service Catalog · Contracts · Concessions · Rate Cards · Conversion Rates · Station Profile  
**Dashboard route:** `/billing/dashboard`

## Top KPIs (Master dashboard)

| Rank | KPI (UI label) | Field | Why it matters |
|------|----------------|-------|----------------|
| 1 | **Setup readiness** | `masterData.readinessPercent` | % of setup checklist complete — primary “can we invoice?” signal |
| 2 | **Active customers** | `masterData.customers.active` / `total` | Unblocked billable airlines vs all customers |
| 3 | **Active services** | `masterData.serviceCatalog.active` / `total` | Billable service codes available for rate cards |
| 4 | **Active contracts** | `masterData.contracts.active` (+ `draft`) | Live agreements covering billing periods |
| 5 | **Rate rows** | `masterData.rateCards` | Tariff coverage for price match |
| 6 | **Tax rules** | `masterData.taxRules` | GST rules for invoice tax |
| 7 | **FX rates** | `masterData.exchangeRates` | USD→INR ROE for foreign-currency invoices |
| 8 | **Sequences** | `masterData.sequences` | Invoice / credit-memo numbering readiness |
| 9 | **Station profile** | `masterData.stationProfile.status` | Letterhead / GSTIN / bank completeness for PDF |
| 10 | **Native billing / cutover** | `nativeBillingEnabled`, `cutoverPhase` | Whether FRIS billing is live for the station |

**Setup checklist items** (drive readiness %): station profile, customers, catalog, contracts, rates, taxes, FX, sequences.

## Page functionality

| Page | Route | What it does |
|------|-------|--------------|
| **Dashboard** | `/billing/dashboard` | Shows setup readiness and master counts; highlights missing station fields and sequence gaps. |
| **Customers** | `/billing/customers` | CRUD airline customers (bill-to). Fields: code (must match FRIS flights), name, currency (INR/USD), GSTIN, address, payment terms, blocked/active. Optional Advance sync. |
| **Service Catalog** | `/billing/service-catalog` | CRUD service codes (menu). Fields: code, description, category, UOM, SAC, GST group, royalty flag, active. Required before rate cards. |
| **Contracts** | `/billing/contracts` | CRUD / activate SGHA-style deals. Validity dates, Dom/Int, aircraft types, royalty, delay/XXLD clauses, ADS equipment rules. |
| **Concessions** | `/billing/concessions` | Per-contract charge % for Dom/Int, diversion, return-to-ramp, cancellation, technical, standby, cargo. Adjusts BHS effective rate or fee. |
| **Rate Cards** | `/billing/rate-cards` | CRUD prices per customer × service × aircraft/category × date band. Unit price, ceiling, min billable units, currency, UOM. Includes BHS price-card and ADS dual-count tooling. |
| **Conversion Rates** | `/billing/conversion-rates` | Manual FX rows (USD→INR, effective date). Also managed under Settings → Currency. |
| **Station Profile** | `/billing/settings` | Company legal name, address, GSTIN, PAN, bank block, approval flag, month-close lock, cutover flags. Prints on tax invoice PDF. |
| **Tax rules** | `/billing/settings/taxes` | GST % and CGST/SGST/IGST split by period / place of supply / optional service pattern. |
| **Invoice sequences** | `/billing/settings/sequences` | Prefix + fiscal year + current number for `invoice` and `credit_memo` document types. Required at post. |
| **Currency & ROE** | `/billing/settings/currency` | Station FX maintenance (same family as Conversion Rates). |

## How Master Data feeds invoices (brief rules)

1. **Customer** sets bill-to, currency, address; **blocked** customers are not billable.
2. **Service catalog** defines every charge code/UOM that can appear on a line.
3. **Active contract** must cover customer + billing period (+ aircraft/category as applicable).
4. **Rate cards** supply unit price (and ceiling / min units) for standard BHS/RAF matching.
5. **Concessions / contract clauses** reduce BHS unit price or apply fee % by scenario (cancellation, diversion, etc.).
6. **Tax rules** compute CGST/SGST/IGST (default fallback ~18% split if no rule matches).
7. **FX rates** convert USD invoices to INR for tax/receivable display (`factor = 1` for INR).
8. **Sequences** assign official invoice number only at **post**.
9. **Station profile** supplies PDF letterhead and bank footer; incomplete profile blocks readiness.

**Setup order (do not skip):** Station → Customer → Catalog → Contract → Rates → Tax → FX (if USD) → Sequences → then open Billed Services / Workflow.

---

# 2. Billed Services

**Nav:** Dashboard · BHS · ADS · Equipment · Manpower  
**Dashboard route:** `/billing/billed-services`  
*(Related sources also exist under Others: Cleaning, RAF, MAAS, XXLD, Non-Scheduled — same prep pipeline, not in this tab’s primary nav.)*

## Top KPIs (Billed Services dashboard)

### Aggregate (across sources)

| Rank | KPI | Meaning |
|------|-----|---------|
| 1 | **All prep rows** | Total preparation rows created from operational sources |
| 2 | **Eligible** | Rows waiting to be fully prepared |
| 3 | **Pending** | Rows needing contract / rate resolution |
| 4 | **Validation errors** | Rows failing billing checks |
| 5 | **Ready for invoice** | Rows that can become drafts |

### Per source (BHS, ADS, Equipment, Manpower)

| KPI | Field | Meaning |
|-----|-------|---------|
| Eligible | `eligible` | Ingested, awaiting enrichment/completion |
| Pending | `pending` | Missing contract or rate match |
| Errors | `validationErrors` | Failed validation |
| Ready | `readyForInvoice` | Cleared for draft creation |
| Invoiced | `invoiced` | Already linked to a draft/invoice |
| Open queue | `eligible + pending + validationErrors` | Work still outstanding |
| Rejected | `rejected` | Explicitly rejected (when > 0) |

## Page functionality

| Page | Route | What it does |
|------|-------|--------------|
| **Dashboard** | `/billing/billed-services` | Source-level queue health; jump into each source or filtered prep tabs. |
| **BHS** | `/billing/scheduled-flights` | Scheduled-flight / FHR turnaround rows. Filter by date basis, customer, flight/serial, Dom/Int. Shows eligibility, contract match, rate match. **Send selected → Preparation** (unsend while not yet drafted). |
| **ADS** | `/billing/ads` | FHR equipment / wheelchair usage. Contract ADS rules classify billable / free / package-inclusive / excluded. Send to prep; unsend when allowed. |
| **Equipment** | `/billing/equipment` | Equipment-family operational rows (FHR/ADS codes). Match + send to prep for ADS-family billing. |
| **Manpower** | `/billing/manpower` | Manpower rows (e.g. CSA/UH/WW). Match + send to prep as additional-services family. |

**Common source actions:** date/customer filters → review match status → select rows → send to Preparation → (optional) unsend if still unlinkable to drafts.

## How Billed Services feed invoices (brief rules)

1. Ops data is **read** from FRIS (flights/FHR); billing does not invent flights.
2. Customer code on the flight/usage must match a **Master** customer.
3. System computes **eligibility**, **contract match**, **rate match**, and **validation** per row.
4. Only selected/validated rows become **preparation records** (`sourceType` = BHS / ADS family / etc.).
5. **BHS:** later aggregated by service × rate × aircraft into BHS draft lines; cancelled flights excluded unless cancellation billing override with charge %.
6. **ADS:** per flight `charged = max(0, used − freeAllowance)`; always-billed ⇒ free allowance 0; excluded / package-inclusive / zero-price omitted; often priced via **contract ADS rules**, not standard rate cards.
7. **Equipment / Manpower:** same ADS-family composition path once in prep.
8. Source pages **do not** create invoice numbers — they only feed the Workflow preparation queue.

---

# 3. Workflow

**Nav:** Dashboard · Preparation · Invoice drafts · Review · Invoices · Invoice bin  
**Dashboard route:** `/billing/prep-dashboard`  
**Detail:** `/billing/invoices/:id`

## Top KPIs (Preparation / Workflow dashboard)

### Top row

| Rank | KPI | Field | Meaning |
|------|-----|-------|---------|
| 1 | **Pending preparation** | `pendingPreparation` (= eligible + pending) | Maker backlog |
| 2 | **Validation errors** | `validationErrors` | Rows in `validation_error` |
| 3 | **Ready for invoice** | `readyForInvoice` | Can create drafts now |
| 4 | **Drafts awaiting approval** | `draftsAwaitingApproval` | Checker backlog |

### Maker workspace

| KPI | Field |
|-----|-------|
| Eligible | `maker.eligible` |
| Pending review | `maker.pending` |
| Validation errors | `maker.validationErrors` |
| Ready for invoice | `maker.readyForInvoice` |
| Invoiced | `maker.invoiced` |
| Draft invoices | `maker.draftInvoices` |
| Rejected | `maker.rejected` (shown when > 0) |

### Checker workspace

| KPI | Field |
|-----|-------|
| Pending approval | `checker.pendingApproval` |
| Approved | `checker.approved` |
| Generated PDF | `checker.generated` |
| Posted this month | `checker.postedThisMonth` (+ `postedTotalInclTax`) |
| Credit memo drafts | `checker.creditMemosDraft` |
| Credit memos posted | `checker.creditMemosPosted` |

## Page functionality

| Page | Route | What it does |
|------|-------|--------------|
| **Dashboard** | `/billing/prep-dashboard` | Maker vs checker queues; links into prep tabs, drafts, review, invoices, credit memos. |
| **Preparation** | `/billing/preparation` | Central workbench: filter by period / source / customer / status; refresh enrichment; revalidate; checklist; remarks; reject; mark ready; delete; **create drafts**. Custom tab for standalone custom billing lines. Statuses: `eligible` → `pending` → `validation_error` / `rejected` → `ready_for_invoice` → `invoiced`. |
| **Invoice drafts** | `/billing/invoice-drafts` | Browse drafts by **category → month → airline** (BHS / ADS / RAF / Custom). Open, merge selected, move to bin, delete. |
| **Review** | `/billing/review` | Checker queue: inspect validation, approve pending drafts (may merge same airline/period). Moves `pending_approval` → `approved`. |
| **Invoices** | `/billing/invoices` | Register of approved / generated / posted / cancelled. View, download/export/send PDF, bin/delete selection. |
| **Invoice detail** | `/billing/invoices/:id` | Header, calc, lines, linked prep, audit. Actions: submit approval, recompute, currency conversion, split ADS lines, generate/regenerate PDF, **post**, send, bin/delete. |
| **Invoice bin** | `/billing/invoice-bin` | Soft-deleted invoices: restore or permanently delete. |

## How Workflow builds the invoice (brief rules)

### Status pipeline

```
ready_for_invoice (prep)
  → draft header + lines
  → pending_approval
  → approved
  → generated (PDF)
  → posted (sequence number locked)
```

Corrections after post use **credit memos** (Others nav), not silent edits.

### Composition rules

| Rule | Behaviour |
|------|-----------|
| **Grouping** | BHS, ADS, RAF, Custom are **separate** invoice families (never mixed on one draft). |
| **Draft gate** | Only prep rows in `ready_for_invoice` with all validations passed. |
| **BHS lines** | Aggregate by service × unit price × aircraft; apply concession % to unit price when scenario allows; cancellation % can further reduce rate. |
| **ADS lines** | Sum **charged** units per particular/aircraft after free allowance; fee concessions at header/fee level (not BHS unit-price path). |
| **Custom lines** | Rates as entered; optional concession at totals only. |
| **Ceiling** | Unit price must not exceed rate-card ceiling. |
| **Min units** | Rate-card `minBillableUnits` supported for RAF/ADS-style minimums. |
| **Currency** | Invoice amounts in customer currency; USD needs ROE for period. |
| **Tax** | Applied from station tax rules on lines / totals. |
| **Merge / split** | Drafts can merge (same airline/period); ADS can split while still draft with non-overlapping prep provenance. |
| **Post** | Requires generated PDF + invoice sequence; stamps official number; locks commercial invoice. |

### Validation gates before a draft can be created

- Station context present  
- Customer exists, active, **not blocked**  
- Valid ops identity (serial / usage row)  
- Flight readiness (e.g. ATD policy); cancelled excluded unless override  
- Dom/Int category when required for rate tier  
- Active contract matched for date  
- Rate card (standard) or ADS contract rule matched  
- Positive price where required; within ceiling  
- Complete billing period; no duplicate source identity  
- Prep status = `ready_for_invoice`  
- USD → usable ROE  
- Composition yields ≥ 1 billable line  
- Review/post additionally: tax/currency/duplicate checks; PDF + sequence for post  

---

## Cross-tab invoice rule summary

| Concern | Master Data | Billed Services | Workflow |
|---------|-------------|-----------------|----------|
| Who is billed | Customer master | Customer code on flight/usage | Bill-to on draft header |
| What is charged | Catalog + rate cards | Ops quantities / usage | Aggregated invoice lines |
| Legal terms | Contracts + concessions | Contract match on row | Enforcement at line calc |
| Price | Rate cards / ADS rules | Rate match preview | Final unit price + concessions |
| Tax / FX / number | Tax, FX, sequences | — | Applied on draft / post |
| Gate | Readiness checklist | Eligibility + validation | Ready → approve → PDF → post |

---

## Quick reference — primary routes

| Tab | Dashboard | Key pages |
|-----|-----------|-----------|
| Master Data | `/billing/dashboard` | `/billing/customers`, `/service-catalog`, `/contracts`, `/concessions`, `/rate-cards`, `/conversion-rates`, `/settings` (+ taxes, currency, sequences) |
| Billed Services | `/billing/billed-services` | `/scheduled-flights` (BHS), `/ads`, `/equipment`, `/manpower` |
| Workflow | `/billing/prep-dashboard` | `/preparation`, `/invoice-drafts`, `/review`, `/invoices`, `/invoice-bin` |

---

*Generated from module analysis of `m-billing` client nav, dashboard KPIs, preparation/invoice engines, and setup docs. Update this file when nav items or KPI fields change.*
