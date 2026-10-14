# Billing Setup — Priority Order (Forms Only)

**Who this is for:** Finance / billing staff setting up Chennai (or any station) with **no external systems** — everything is saved through **FRIS Billing forms** or **FRIS Operations forms** (flights, FHR).

**Big idea (restaurant analogy):**

1. Set up the **restaurant letterhead** (station + company on invoice)
2. Register **who pays** (customer / airline)
3. Build the **menu** (service catalog)
4. File the **signed deal** (contract)
5. Enter **prices** (rate cards)
6. Set **tax, currency, invoice numbers**
7. **Then** use flight data from FRIS ops → preparation → invoice → PDF

**Rule:** Complete each priority fully before the next. Do not open invoice screens until Priorities 1–7 are done for at least one airline.

---

## Database: one collection only

All billing master data, invoices, settings, and audit rows are stored in a **single MongoDB collection**:

| Collection | Purpose |
|------------|---------|
| **`billing`** | Everything (customers, settings, contracts, rate cards, invoices, preparation, tax rules, etc.) |

Each document has a **`docType`** field (what kind of row it is) and a **`stationCode`** field (which airport it belongs to, e.g. `MAA` for Chennai).

**Station rule:** When you log in with a station selected, the system **only reads and writes data for that station**. Chennai users never see Hyderabad billing data. The `stationCode` comes from your FRIS login session — you do not type it on every form; the server stamps it automatically on save.

| docType | What it is | Has stationCode |
|---------|------------|-----------------|
| `settings` | Station profile (`/billing/settings`) | Yes — one row per station |
| `customer` | Airline customer | Yes |
| `service_catalog` | Service menu item | Yes — per station |
| `contract` | Signed deal | Yes |
| `rate_card` | Price row | Yes |
| `tax_rule` | GST rule | Yes |
| `exchange_rate` | USD → INR rate | Yes |
| `sequence` | Invoice numbering | Yes |
| `invoice_header` | Invoice / draft | Yes |
| `preparation_record` | Preparation row | Yes |

**Flight operations data** (FHR, raw flight data) stays in separate FRIS ops collections — only **billing** data uses the `billing` collection.

If you had old `billing_settings`, `billing_customers`, etc. from earlier testing, run once from `server/`:

```bash
node ../billing/scripts/migrate-to-single-billing-collection.mjs --dry-run
node ../billing/scripts/migrate-to-single-billing-collection.mjs
```

Then restart the server.

---

## Where data comes from (no external connections)

| Data type | Saved through | Not from |
|-----------|---------------|----------|
| Customers, contracts, rates, tax, sequences | **Billing → Master data forms** | Excel import, BC, third-party APIs |
| Flight work (turnarounds, equipment) | **FRIS Operations** (Scheduled Airlines, FHR) — already inside FRIS | Separate external system |
| Monthly billing lines | **Billing → Preparation → Invoices** | Manual Excel invoice |

Your **Chennai Price Card (Excel)** and **sample invoice PDF** are **reference documents only** — you **re-type** values into billing forms. They are not connected to the system.

---

## Billing sidebar map

| Section | Pages |
|---------|--------|
| **Master data** | Dashboard, Customers, Service Catalog, Contracts, Rate Cards, Settings |
| **Settings sub-pages** | Tax rules · Currency & ROE · Invoice sequences |
| **Operational sources** | Scheduled Flights, Cleaning, RAF, MAAS, ADS, XXLD, Equipment, Manpower, Non-Scheduled |
| **Workflow** | Preparation → Invoice drafts → Review → Invoices → Credit memos → Backing sheets |

---

# PRIORITY 0 — Station context (before any billing form)

**Not a billing form** — done once per login session.

| Item | Detail |
|------|--------|
| **Where** | FRIS top bar / station selector (main app) |
| **What to set** | **Chennai = MAA** |
| **Prerequisites** | Valid FRIS login with billing permission |

**Do not proceed until:** Every billing page you open is scoped to **MAA**. All master data you save is stored for Chennai only.

---

# PRIORITY 1 — Station & company profile (invoice letterhead)

**Page name:** **Station profile**  
**URL:** `/billing/settings`  
**Sidebar:** Master data → **Settings** (first tab: Station profile)

**Plain English:** Company name, address, GSTIN, and bank block that print on every tax invoice (top and bottom of PDF).

### Prerequisites before this page

| # | Must already exist |
|---|-------------------|
| 1 | Priority 0 — station **MAA** selected |

### Form fields to save

| Field | Example (Chennai / BFS India) | Source |
|-------|------------------------------|--------|
| Station code | `MAA` | Auto from login |
| Legal company name | Bird Flight Services India Pvt Ltd | Company registration |
| Company address | Full Chennai / registered office address | Letterhead |
| Company GSTIN | 15-character GST number | GST certificate |
| Company PAN | For invoice footer | PAN card |
| Default payment terms | e.g. `NET30` | Finance policy |
| Approval required | Yes / No | Finance policy |
| Month-close lock day | e.g. `5` (optional) | Finance policy |
| Bank name | e.g. Kotak Mahindra Bank | Sample invoice PDF footer |
| Bank branch & address | Full branch address | Bank letter |
| Beneficiary name | BIRD FLIGHT SERVICES (INDIA) PRIVATE LIMITED | Bank letter |
| INR account number | | Bank letter |
| IFSC code | | Bank letter |
| SWIFT (if USD customers) | | Bank letter |
| Cheque payable text | Payable to company legal name | Sample PDF terms |

### After saving, you should see

- Settings record exists for station **MAA**
- Dashboard does not block invoice generation for “missing company profile”

### Do not proceed until

- [ ] Company name, address, and GSTIN saved
- [ ] Bank details saved (needed for PDF page 2)

---

# PRIORITY 2 — Customers (who pays — airline)

**Page name:** **Customers**  
**URL:** `/billing/customers`  
**Sidebar:** Master data → **Customers**

**Plain English:** One form per airline you bill at Chennai. This is the “Bill To” on the invoice.

### Prerequisites before this page

| # | Must already exist |
|---|-------------------|
| 1 | Priority 0 — station **MAA** |
| 2 | Priority 1 — company profile saved (for consistent station setup) |
| 3 | Airline chosen from **Chennai price card** tab (e.g. GF = Gulf Air) |
| 4 | Signed SGHA / customer details in hand (name, GSTIN, address, currency) |

### Form: New customer

| Field | Required | What to enter | Example (Gulf Air) |
|-------|----------|---------------|-------------------|
| Customer code | Yes | Airline code — **must match FRIS flight data** | `GF` |
| Customer name | Yes | Legal name on contract | `Gulf Air` |
| Bill-to customer code | No | If billing entity differs | Usually same as code |
| Currency | Yes | `INR` or `USD` per contract | Per price card |
| Payment terms | No | e.g. Net 30 | `NET30` |
| GST registration no. | No | Airline GSTIN if applicable | From airline |
| Bill-to address | Yes | Full address for PDF | From SGHA |
| Credit limit | No | AR control | Optional |
| Blocked | Yes | Must be **No** | `No` |
| Active | Yes | Must be **Yes** | `Yes` |

**Do not use:** “Sync from Advance” if you have no external master — **type every customer manually** from the price card / contract.

### After saving, you should see

- Customer appears in Customers list
- Search by code or name finds the airline

### Do not proceed until

- [ ] At least **one** airline customer exists for MAA with correct **currency**
- [ ] Customer is **not blocked**

---

# PRIORITY 3 — Service catalog (what can be billed — the menu)

**Page name:** **Service Catalog**  
**URL:** `/billing/service-catalog`  
**Sidebar:** Master data → **Service Catalog**

**Plain English:** Every charge type on the price card (TRND, GPU, ASU, etc.) must exist as a **service code** before you can attach prices.

### Prerequisites before this page

| # | Must already exist |
|---|-------------------|
| 1 | Priorities 0–2 complete |
| 2 | Airline price card tab open — **column headers** listed |

### Form: New service (repeat for each charge type on price card)

| Field | Required | What to enter | Example |
|-------|----------|---------------|---------|
| Service code | Yes | Short code matching price card | `TRND`, `PH-GPU`, `PST-ASU` |
| Description | Yes | Plain English | `Turnaround handling` |
| Category | Yes | scheduled / equipment / manpower / cleaning / raf / non_scheduled / delay / xxld | `scheduled` |
| Unit of measure (UOM) | Yes | How it is counted | `FLIGHT`, `MIN`, `HR`, `TRIP`, `EA`, `ULD` |
| SAC code | No | GST service code | `996761` (airport services — confirm with finance) |
| Royalty applicable | No | Yes if royalty line | Usually No for equipment |
| Active | Yes | **Yes** | `Yes` |

### Minimum services to create (from Chennai price card abbreviations)

| Code pattern | Meaning | Typical UOM |
|--------------|---------|-------------|
| TRND | Turnaround / basic handling | FLIGHT |
| TRNS | Transit handling | FLIGHT |
| PH-GPU, PH-ACU | Equipment | MIN or EA |
| PST | Air Start Unit | EA |
| PP | Push back | EA |
| PTOW | Towing | EA |
| PTRIP-PAX, PTRIP-CREW | Coaches | TRIP |
| PU-WCHR-S, PU-WCHC | Wheelchairs | EA |
| PS-* | Water, disinfection, staff, etc. | Per price card |
| PF-* | Cargo / supervision | FLIGHT or ULD |

Create **every column** on your airline’s price card that has a price.

### After saving, you should see

- Service catalog list shows all codes you need for that airline
- Filter by category works

### Do not proceed until

- [ ] **TRND** (or equivalent basic handling code) exists
- [ ] Every **equipment / passenger / cargo** column you will price exists

---

# PRIORITY 4 — Contracts (signed deal + rules + validity period)

**Page name:** **Contracts**  
**URL:** `/billing/contracts`  
**Sidebar:** Master data → **Contracts**

**Plain English:** The legal agreement: **from date → to date**, domestic or international, aircraft types, and **text rules** for delays, cancellations, ferry flights (from the **lower table** on the price card).

### Prerequisites before this page

| # | Must already exist |
|---|-------------------|
| 1 | Priorities 0–3 complete |
| 2 | **Customer** saved (Priority 2) — you need `customerCode` |
| 3 | Signed SGHA / price card with **From** and **To** dates |
| 4 | Lower **Clause / Note** table from price card tab |

### Form: New contract

| Field | Required | What to enter | Source |
|-------|----------|---------------|--------|
| Contract number | Yes | Unique reference | e.g. `GF-MAA-SGHA-2026` |
| Customer code | Yes | From Priority 2 | `GF` |
| Category | Yes | `Dom` or `Int` | Most Chennai intl = `Int` |
| Aircraft types | Yes | Comma list from price card columns | `A320`, `A321`, `B737`, `B787` |
| Price valid from | Yes | Start of rate period | e.g. `2026-03-01` |
| Price valid to | Yes | End of rate period | From price card “To” row |
| Royalty at gross % | No | If contract specifies | Rev summary |
| Royalty inclusive | No | Inc/Exc | Contract |
| XXLD / cancellation clause | Yes | Paste summary from lower table | e.g. “50% if within 8 hours” |
| Delay clause | Yes | Paste summary from lower table | e.g. “+10% if delay >2h” |
| Status | Yes | **active** | Set active when live |

### Clause checklist (copy from price card lower table into contract notes)

- [ ] Return to ramp — free or charged?
- [ ] Technical landing — % of basic rate?
- [ ] Ferry flight — % of basic rate?
- [ ] Cancellation (XXLD) — notice hours + % charged?
- [ ] Delay — hours threshold + surcharge %?
- [ ] Disbursements — admin %?
- [ ] Free inclusions (wheelchairs per month, etc.)?
- [ ] Stand-by equipment — % charge?
- [ ] Annual rate increase rule (CPI %)?

### After saving, you should see

- Contract listed with customer code and valid date range
- Status = **active**

### Do not proceed until

- [ ] Contract **valid dates cover your billing month** (e.g. all of March 2026)
- [ ] Delay and cancellation rules are saved (needed in Preparation)

---

# PRIORITY 5 — Rate cards (prices — airline + aircraft + equipment)

**Page name:** **Rate Cards**  
**URL:** `/billing/rate-cards`  
**Sidebar:** Master data → **Rate Cards**

**Plain English:** Actual **numbers** from the price card top table — per service, per aircraft type, per date band.

### Prerequisites before this page

| # | Must already exist |
|---|-------------------|
| 1 | Priorities 0–4 complete |
| 2 | **Customer** exists |
| 3 | **Contract** exists — you need `contractId` |
| 4 | **Service catalog** codes exist for every column you price |
| 5 | Price card **top table** with rates for correct **From / To** period |

### Form: New rate card (one row per service × aircraft × date band)

| Field | Required | What to enter | Example |
|-------|----------|---------------|---------|
| Contract | Yes | Select Priority 4 contract | `GF-MAA-SGHA-2026` |
| Customer code | Yes | Same airline | `GF` |
| Service code | Yes | From Priority 3 | `TRND` |
| Category / aircraft | Yes | Aircraft or band from price card | `A320/A321/B737` or `B787` |
| Unit price INR | If INR contract | Amount | — |
| Unit price USD | If USD contract | Amount | `590` |
| Currency | Yes | `INR` or `USD` | Match customer |
| UOM | Yes | Match service catalog | `FLIGHT` |
| Ceiling rate | No | CR cap if applicable | Optional |
| Min billable units | No | RAF/ADS minimums | Optional |
| Valid from | Yes | Same as contract band | `2026-03-01` |
| Valid to | Yes | Same as contract band | End date on card |

### Entry order (recommended)

1. **TRND** — basic handling **for each aircraft type** (most important)
2. **PH** — GPU, ACU, etc.
3. **PST, PP, PTOW** — ASU, pushback, tow
4. **PU** — wheelchairs, UMNR, etc.
5. **PTRIP** — coaches
6. **Cargo / ULD** lines if on price card

If the price card has **multiple From/To rows** (rate increase), create **separate rate card rows** for each date band.

### After saving, you should see

- Rate cards list shows rows for customer + service + aircraft
- Scheduled Flights source screen can show **Rate match = Yes** (after flights exist)

### Do not proceed until

- [ ] Every **aircraft type** your airline flies at Chennai has a **TRND** (or basic) rate
- [ ] Every **extra service** you bill has a rate row
- [ ] `validFrom` / `validTo` cover your billing month

---

# PRIORITY 6 — Tax rules (GST)

**Page name:** **Tax rules**  
**URL:** `/billing/settings/taxes`  
**Sidebar:** Master data → **Settings** → **Tax rules** tab

**Plain English:** How GST is calculated on invoice lines (9% + 9% or 18% IGST).

### Prerequisites before this page

| # | Must already exist |
|---|-------------------|
| 1 | Priorities 0–5 complete |
| 2 | Priority 1 — company GSTIN saved |
| 3 | Finance decision: **CGST+SGST** vs **IGST** per customer |

### Form: New tax rule

| Field | Required | What to enter | Example |
|-------|----------|---------------|---------|
| Rule code | Yes | Short name | `GST-AIRPORT-18` |
| GST % | Yes | Total GST | `18` |
| Place of supply | Yes | `intra_state` or `inter_state` | Per finance |
| CGST / SGST / IGST split | Yes | Per place of supply | 9+9 or 18 IGST |
| Service code pattern | No | Filter specific services | Optional |
| Effective from | Yes | Start date | `2026-01-01` |
| Effective to | Yes | End date | `2026-12-31` |

### After saving, you should see

- Tax rules list **not empty** (no more “No records found”)
- At least one rule covers your billing month

### Do not proceed until

- [ ] At least **one active tax rule** exists for the invoice posting period

---

# PRIORITY 7 — Currency & exchange rate (USD invoices only)

**Page name:** **Currency & ROE**  
**URL:** `/billing/settings/currency`  
**Sidebar:** Master data → **Settings** → **Currency & ROE** tab

**Plain English:** USD → INR rate used on the invoice (like “Rs. 94.6772 per USD” on sample PDF).

### Prerequisites before this page

| # | Must already exist |
|---|-------------------|
| 1 | Priorities 0–6 complete |
| 2 | Customer currency = **USD** (skip this priority if all customers are INR) |

### Form: New exchange rate

| Field | Required | What to enter | Example |
|-------|----------|---------------|---------|
| Currency code | Yes | `USD` | `USD` |
| Rate to INR | Yes | Rupees per 1 USD | `94.6772` |
| Starting date | Yes | Rate effective date | `2026-03-31` (month-end) |
| Source | No | manual / rbi / import | `manual` |

### After saving, you should see

- Exchange rate list shows USD rate for billing month

### Do not proceed until

- [ ] USD rate exists for **invoice posting date** (or skip if INR-only)

---

**Sidebar:** Master data → **Settings** → **Invoice sequences** tab

**Plain English:** Number series for posted invoices (e.g. `SI/MAA/25-26/0001`).

### Prerequisites before this page

| # | Must already exist |
|---|-------------------|
| 1 | Priorities 0–7 complete (or 0–6 if INR-only) |
| 2 | Finance approved prefix format |

### Form: New sequence

| Field | Required | What to enter | Example |
|-------|----------|---------------|---------|
| Sequence code | Yes | Internal id | `SI-MAA` |
| Prefix | Yes | Printed before number | `SI/MAA/25-26/` |
| Fiscal year | Yes | | `25-26` |
| Document type | Yes | `invoice` or `credit_memo` | `invoice` |
| Current value | Yes | Last used number (0 if new) | `0` |

### After saving, you should see

- Sequence listed with prefix and fiscal year

### Do not proceed until

- [ ] Invoice sequence exists for station **MAA**

---

# MASTER DATA COMPLETE — Monthly billing (operations → PDF)

After Priorities **0–8** are done for one airline, use this order **every month**.

---

## PRIORITY 9 — Operations data in FRIS (flights — not billing forms)

**Where:** FRIS main app — **Flights / Scheduled Airlines**, **FHR forms**  
**Not billing master data** — but required before billing sources show rows.

### Prerequisites

| # | Must already exist |
|---|-------------------|
| 1 | Master data Priorities 0–8 complete for this airline |
| 2 | Flights scheduled / operated in billing month |

### What ops must record (per turnaround)

- [ ] FHR completed for each flight
- [ ] Correct **aircraft type** (drives rate card)
- [ ] **ATD** and times filled
- [ ] Equipment usage (GPU, ACU times) if billable
- [ ] Cancellations recorded if applicable

**Billing key:** each flight has a **serial number**.

---

## PRIORITY 10 — Operational sources (read + ingest)

**Page name:** **Scheduled Flights** (and others as needed)  
**URL:** `/billing/scheduled-flights` (+ Cleaning, Equipment, etc.)  
**Sidebar:** Operational sources

### Prerequisites

| # | Must already exist |
|---|-------------------|
| 1 | Priorities 0–8 |
| 2 | Priority 9 — FHR data for billing month |
| 3 | Customer + contract + rate cards for airline |

### On-page actions

| Action | Purpose |
|--------|---------|
| Set date range | e.g. `2026-03-01` to `2026-03-31` |
| Filter customer | Airline code e.g. `GF` |
| Review grid | Eligible · Contract match · Rate match · Validation |
| **Ingest to preparation** | Sends rows to Preparation workspace |

### Do not proceed until

- [ ] Rows show **contract match** and **rate match**
- [ ] Validation errors = **0** (or fixed in ops data)

---

## PRIORITY 11 — Preparation workspace

**Page name:** **Preparation**  
**URL:** `/billing/preparation`  
**Sidebar:** Workflow → **Preparation**

### Prerequisites

| # | Must already exist |
|---|-------------------|
| 1 | Priority 10 — ingested rows |
| 2 | Contract clauses understood (delay, XXLD) |

### Tabs and actions

| Tab | Action |
|-----|--------|
| Eligible | Review |
| Validation errors | Fix data → **Re-validate** |
| Pending | Fix contract/rate gaps → back to Priorities 4–5 |
| Ready for invoice | **Mark ready** (bulk) |
| Rejected | Do not bill |

### Reconciliation (Used vs Charged)

Before drafts: confirm flight counts and aircraft split match price card logic.

### Do not proceed until

- [ ] All billable rows in **Ready for invoice**

---

## PRIORITY 12 — Invoice drafts

**Page name:** **Invoice drafts**  
**URL:** `/billing/invoice-drafts`  
**Sidebar:** Workflow → **Invoice drafts**

### Prerequisites

| # | Must already exist |
|---|-------------------|
| 1 | Priority 11 — rows **ready for invoice** |

### Form / action: Create draft from preparation

| Field | What to enter |
|-------|----------------|
| Customer | Select airline |
| Billing period start | `2026-03-01` |
| Billing period end | `2026-03-31` |
| Document date | Posting policy date |
| Currency | From customer |

System builds lines: **Particular · Used · Charged · Aircraft · Unit · Rate · Amount**

### Do not proceed until

- [ ] Draft lines match price card rates and flight counts

---

## PRIORITY 13 — Review & approval

**Page name:** **Review**  
**URL:** `/billing/review`  
**Sidebar:** Workflow → **Review**

### Prerequisites

| # | Must already exist |
|---|-------------------|
| 1 | Priority 12 — draft created |

### Checks

- [ ] No duplicate serial in same month
- [ ] Tax calculation correct
- [ ] USD → INR conversion correct (if applicable)
- [ ] Manager **approves**

---

## PRIORITY 14 — Generate PDF & backing sheet

**Page name:** **Invoices**  
**URL:** `/billing/invoices`  
**Sidebar:** Workflow → **Invoices**

### Prerequisites

| # | Must already exist |
|---|-------------------|
| 1 | Priority 13 — approved draft |
| 2 | Priority 1 — company + bank on profile |

### PDF must match sample layout

- Page 1: TAX INVOICE, Bill To, period, line table, GST totals, amount in words
- Backing sheet: one row per flight serial
- Page 2: bank details + terms (from Priority 1)

**Field widths** adjust to content — same structure as sample PDF.

### Action

**Generate PDF** on invoice detail.

---

## PRIORITY 15 — Post invoice

**Page name:** **Invoices** (detail)  
**URL:** `/billing/invoices/:id`

### Prerequisites

| # | Must already exist |
|---|-------------------|
| 1 | Priority 14 — PDF generated |
| 2 | Priority 8 — invoice sequence configured |

### Action

**Post** — assigns official invoice number, locks invoice.

Corrections after post → **Credit memos** page only.

---

# Quick reference — priority → page → prerequisites

| Priority | Page name | URL | Prerequisites |
|----------|-----------|-----|---------------|
| 0 | Station selector | Main FRIS | Login |
| 1 | Station profile (Settings) | `/billing/settings` | Priority 0 |
| 2 | Customers | `/billing/customers` | 0, 1 |
| 3 | Service Catalog | `/billing/service-catalog` | 0–2 |
| 4 | Contracts | `/billing/contracts` | 0–3, customer exists |
| 5 | Rate Cards | `/billing/rate-cards` | 0–4, contract + services exist |
| 6 | Tax rules | `/billing/settings/taxes` | 0–5 |
| 7 | Currency & ROE | `/billing/settings/currency` | 0–6, USD customers only |
| 8 | Invoice sequences | `/billing/settings/sequences` | 0–7 |
| 9 | Scheduled Airlines / FHR | FRIS Flights (ops) | 0–8 |
| 10 | Scheduled Flights (billing) | `/billing/scheduled-flights` | 0–9 |
| 11 | Preparation | `/billing/preparation` | 10 |
| 12 | Invoice drafts | `/billing/invoice-drafts` | 11 |
| 13 | Review | `/billing/review` | 12 |
| 14 | Invoices (PDF) | `/billing/invoices` | 13, 1 |
| 15 | Invoices (Post) | `/billing/invoices/:id` | 14, 8 |

---

# One-airline checklist (Chennai)

### Master data (forms only)

- [ ] P0 — MAA selected
- [ ] P1 — Station profile form saved
- [ ] P2 — Customer form saved
- [ ] P3 — All service codes from price card tab
- [ ] P4 — Contract form + clauses
- [ ] P5 — All rate card rows
- [ ] P6 — Tax rule form
- [ ] P7 — Exchange rate (if USD)
- [ ] P8 — Invoice sequence

### Monthly (e.g. March 2026)

- [ ] P9 — FHRs complete in FRIS ops
- [ ] P10 — Sources green → ingest
- [ ] P11 — Preparation → ready
- [ ] P12 — Draft
- [ ] P13 — Review → approve
- [ ] P14 — PDF + backing
- [ ] P15 — Post

---

# Chennai price card airlines (reference tabs)

UL · SG · SL · BS · BI · GF · IX · BG · EY · LH · EK · Hercules · AFCOM · Fits · 6E · BJ · YTO

Pick one tab → complete Priorities 2–5 from that tab only.

---

*Document version: 2026-06-26 — Forms-only workflow. All master data entered manually in Billing; flight data from FRIS operations. Sample invoice PDF = layout only; price card Excel = typing reference.*
