# Billing UI/UX Specification

**Design principle:** Modern ERP experience for finance teams — not a Microsoft Dynamics clone. Preserve all BC business functionality while improving usability.

**Reference:** FRIS existing patterns (`AdvanceScreen`, Gateway pages, `InvoicingScheduledFlightDataTable`), Emil design philosophy (purposeful polish, fast feedback).

---

## UX analysis

### User workflow

Primary users: **Finance billing clerks** and **Finance managers** at BWFS stations (starting Hyderabad).

Typical month-close flow:
1. Review operational data completeness (scheduled flights, equipment, RAF, XXLD)
2. Run reconciliation (flight counts, delays, cancellations)
3. Resolve validation errors in preparation workspace
4. Generate invoice drafts per airline
5. Review and approve
6. Post invoices, generate PDFs, send to airlines

### Problems found (current FRIS invoicing)

| Problem | Impact |
|---------|--------|
| 7 of 8 invoicing sections are UI shells | Finance cannot complete billing in FRIS |
| Export to NAV is a flag only — no invoice | Broken end-to-end workflow |
| 49-column table without billing context | Hard to see contract/rate/validation status |
| No preparation workspace | Finance uses Excel parallel to BC |
| No granular invoicing permissions in UI | All-or-nothing Invoicing tab access |
| Excel export is stub | Cannot export reconciliation |
| React Query not used | Slow refetch on every search |
| `/others` routes lack route guard | Weaker permission enforcement |

### Improvements

| Improvement | Benefit |
|-------------|---------|
| Dedicated `/billing` module with clear IA | Finance finds all billing in one place |
| Preparation workspace with status tabs | Replaces Excel + BC staging |
| Inline validation badges on every row | See errors before draft creation |
| Bulk operations (select → ready → draft) | Minimal clicks for month-close |
| Invoice review gate before post | Prevents posting errors |
| React Query for list pages | Fast filter, cache, background refresh |
| Responsive tables with column presets | Mobile review for managers |
| Status-driven color system | At-a-glance workflow position |
| Keyboard shortcuts on tables | Power-user efficiency |

---

## Visual design system

### Calm Ledger (canonical)

Authoritative tokens: [`BILLING_DESIGN_SYSTEM.md`](./BILLING_DESIGN_SYSTEM.md)  
CSS: `client/components/billing/billing-design-system.css`  
Helpers: `client/components/billing/billingUi.ts`

| Role | Token | Hex |
|------|-------|-----|
| Primary | Ink navy | `#0B1F33` |
| Secondary | Cool slate | `#5B6B7C` |
| Accent | Soft teal | `#0F766E` |
| Background | `--billing-bg` | `#F4F6F8` |
| Card | `--billing-surface` + border + soft shadow | white |
| Success / Warning / Danger / Info | Muted semantic fills | see design system |
| Typography | Source Sans 3 | page → section → body hierarchy |
| Icons | Lucide | equal size, semantic color |
| Toasts | Sonner | unchanged |

### Billing-specific additions

| Token | Use |
|-------|-----|
| Status badges | Semantic soft pills (`StatusBadge`) |
| Validation icon | Accent check / amber warning / danger X |
| Currency display | INR ₹ / USD $ with ROE footnote |
| Amount columns | Right-aligned, tabular-nums |
| Tables | Light sticky headers, calm row hover (`.billing-table`) |

**Do not copy BC:** No role center, no ribbon tabs, no factboxes. Use FRIS section nav + card tabs.

---

## Information architecture

```
Billing (navbar item)
├── Dashboard
├── Master Data
│   ├── Customers
│   ├── Service Catalog
│   ├── Contracts
│   └── Rate Cards
├── Operational Sources
│   ├── Scheduled Flights
│   ├── Cleaning
│   ├── RAF
│   ├── MAAS
│   ├── ADS
│   ├── XXLD (SKD / Non-SKD)
│   ├── Equipment
│   └── Manpower
├── Preparation          ★ critical
├── Invoicing
│   ├── Invoice Drafts
│   ├── Review
│   └── Invoices
├── Credit Memos
├── Backing Sheets
├── Reports
├── Settings
│   ├── Tax Rules
│   ├── Currency
│   └── Sequences
└── Audit Trail
```

### Navigation pattern

- Desktop: collapsible left sidebar (like Advance invoicing sub-nav, expanded)
- Mobile: hamburger + bottom sheet for section switch
- Breadcrumbs on detail pages: `Billing > Invoices > SI-HYD/25-26/0042`

---

## Layout components

### BillingLayout

```
┌─────────────────────────────────────────────────┐
│ FRIS Navbar (with Billing item)                 │
├──────────┬──────────────────────────────────────┤
│ Sidebar  │ Page header (title + actions)          │
│ nav      ├──────────────────────────────────────┤
│          │ Filter bar (sticky)                  │
│          ├──────────────────────────────────────┤
│          │ Content area                         │
│          │                                      │
└──────────┴──────────────────────────────────────┘
```

### Page header pattern

- Title (h1)
- Subtitle (period, customer filter context)
- Primary action button (right): e.g. "Create Draft", "Post", "Export PDF"
- Secondary actions in dropdown

---

## Page specifications

### 1. Dashboard (`/billing/dashboard`)

**KPI cards (4-column grid, 2 on mobile):**
- Pending preparation
- Validation errors (click → preparation errors tab)
- Drafts awaiting approval
- Posted this month (count + total amount)

**Below:** Recent activity timeline (audit log entries), quick links to preparation and review.

**Loading:** Skeleton cards. **Empty:** "No billing activity this period" with CTA to preparation.

---

### 2. Customers (`/billing/customers`)

**List:** Searchable table — Code, Name, Currency, Payment Terms, GSTIN, Blocked, Actions

**Detail tabs:** General | Contacts | Contracts | Invoice History | Ledger

**Forms:** Modal create/edit. Blocked toggle with confirmation.

---

### 3. Service Catalog (`/billing/service-catalog`)

**List:** Filter by category (scheduled, RAF, equipment, etc.). Columns: Code, Description, UOM, GST Group, SAC, Active.

**Bulk:** Seed from export log types (admin action).

---

### 4. Contracts (`/billing/contracts`)

**List:** Customer, Category, Valid From/To, Status badge, Royalty %

**Detail:** Header fields + version history timeline + linked rate cards

---

### 5. Rate Cards (`/billing/rate-cards`)

**List:** Customer, Service, Category, Rate INR/USD, Ceiling, Valid period

**Filter:** Customer dropdown, service code search, effective date

---

### 6–13. Operational source pages

**Shared layout (all `/billing/scheduled-flights`, `/billing/raf`, etc.):**

```
┌─ Filter bar ─────────────────────────────────────┐
│ Date range | Customer | Date basis | [Search]    │
├─ Summary chips ──────────────────────────────────┤
│ Eligible: 142 | Errors: 3 | Ready: 12            │
├─ Data table ─────────────────────────────────────┤
│ □ | Serial | Flight | Customer | ... | Status   │
│   |        |        |          |     | ✓ ✓ ✓    │
├─ Bulk actions (sticky footer when rows selected) ┤
│ [Send to Preparation] [Export Excel]             │
└──────────────────────────────────────────────────┘
```

**Per-row status columns:**
- Billing Eligibility (green/red badge)
- Contract Match (✓/✗ + tooltip)
- Rate Match (✓/✗ + tooltip)
- Validation (icon + error count, expand row for details)

**Scheduled flights:** Reuse 49-column layout with **column preset toggles**: Full | Billing essentials | Backing export

---

### 14. Preparation workspace (`/billing/preparation`) ★

**Most important page.**

**Tab bar:** Eligible | Pending | Validation Errors | Rejected | Ready For Invoice

Each tab shows count badge. Table columns:
- Source type, Serial, Flight, Customer, Period
- Contract match, Rate match
- Validation summary
- Actions (Validate, Reject, Mark Ready)

**Bulk actions:**
- Select all on page → Mark Ready
- Select ready rows → Create Invoice Drafts (opens dialog: group by customer?)

**Error panel:** Expandable row shows full `validationResults` list with rule name + message + link to fix (e.g. "Add rate card").

**Empty states per tab** with guidance text.

---

### 15. Invoice Drafts (`/billing/invoice-drafts`)

**List:** Draft No., Customer, Period, Amount, Status, Last updated

**Actions:** Open, Delete, Submit for Approval

---

### 16. Invoice Review (`/billing/review`)

**List:** Drafts with review check columns (icon per check):

| Check | Icon |
|-------|------|
| Missing Contract | ✓/✗ |
| Missing Rate | ✓/✗ |
| Currency Error | ✓/✗ |
| Tax Error | ✓/✗ |
| Duplicate Billing | ✓/✗ |
| Approval Status | badge |

**Detail:** Side-by-side reconciliation panel (expected vs actual flight count, delay total, etc.)

**Actions:** Approve | Reject (reason required)

---

### 17. Invoices (`/billing/invoices`)

**List filters:** Status (multi-select), Customer, Period, Currency

**Status badges:**

| Status | Color |
|--------|-------|
| draft | gray |
| pending_approval | amber |
| approved | blue |
| generated | indigo |
| posted | emerald |
| cancelled | red |
| archived | slate |

---

### 18. Invoice Detail (`/billing/invoices/:id`)

**Tabs:** General | Lines | Dimensions | Backing Sheets | Attachments | Audit Trail | Activity Timeline | Related Flights | Related Credit Notes

**General tab:** Header fields (read-only when posted). Action bar: Generate PDF | Post | Cancel | Email (future)

**Lines tab:** Editable grid (draft only). Add line button. Running totals footer.

**Backing Sheets tab:** Preview table (49 cols, horizontal scroll) + Download PDF

**Audit Trail tab:** Chronological log from `billing_audit_logs`

**Sticky footer (draft):** Subtotal | Tax | Total | [Save] [Submit]

---

### 19. Credit Memos (`/billing/credit-memos`)

Similar to invoices list + detail. Link to applies-to invoice. Reason badge (XXLD, delay, correction).

---

### 20. Backing Sheets (`/billing/backing-sheets`)

Standalone list of all backing sheets. Filter by invoice, customer, period. Download PDF.

---

### 21. Reports (`/billing/reports`)

**Card grid** of report types with description. Click → parameter form (period, customer) → Generate → Preview/Download.

Reports: Revenue Summary, Schedule Reconciliation, Delay Charges, XXLD Decisions, Tax Summary, Monthly Summary, AR Aging.

---

### 22. Settings

**Tax Rules:** Table + modal CRUD  
**Currency:** ROE table with effective dates, add rate form  
**Sequences:** Invoice prefix, fiscal year, current value (read-only), reset (admin, confirmation)

---

### 23. Audit Trail (`/billing/audit`)

Filterable log table: Timestamp, User, Entity, Action, Details (expandable diff).

---

## Table UX requirements

| Requirement | Implementation |
|-------------|----------------|
| Large datasets | Server pagination (50 default), virtual scroll for 500+ |
| Fast filtering | Debounced search, filter chips, URL query sync |
| Column resize | Optional — preset columns first |
| Row selection | Checkbox column, select all on page |
| Bulk operations | Sticky footer bar when selection > 0 |
| Export | Excel (exceljs) with progress toast |
| Sort | Server-side on indexed fields |
| Loading | Skeleton rows |
| Error | Inline banner + retry |

---

## Form UX requirements

| Requirement | Implementation |
|-------------|----------------|
| Validation | Inline field errors + summary banner |
| Date entry | DatePicker / DateRangePicker (existing) |
| Customer lookup | Searchable combobox with airline code |
| Currency amounts | Input with 2 decimal places, locale formatting on display |
| Destructive actions | Confirmation dialog (Post, Delete, Cancel invoice) |
| Autosave | Draft header autosave optional (debounced PATCH) |

---

## Responsive behavior

| Breakpoint | Behavior |
|------------|----------|
| Mobile (<768px) | Sidebar → drawer; table → card list (ResponsiveTable pattern); KPI 2-col |
| Tablet | Sidebar collapsed icons; table horizontal scroll |
| Desktop | Full sidebar + wide table |

**Mobile-first:** Preparation and review must be usable on tablet for manager approvals.

---

## Accessibility

- All interactive elements keyboard reachable
- Status badges have `aria-label` text (not color-only)
- Table headers `scope="col"`
- Focus visible on all controls
- Confirmation dialogs trap focus
- Loading states announced to screen readers

---

## Loading & error states

| State | Pattern |
|-------|---------|
| Initial load | Skeleton table / cards |
| Refetch | Subtle top progress bar |
| Empty | Illustration + CTA (e.g. "No invoices — start from Preparation") |
| Error | Banner with message + Retry button |
| Partial validation | Row-level amber highlight |

---

## Permission gating (frontend)

1. Add `billing` tab to `permission-tab-config.ts` with all sub-pages
2. `BillingRouteGuard` in `billing/layout.tsx` — mirror `FrisPermissionGuard`
3. Navbar item visible when `isSubPageAllowed('billing', 'Dashboard')` or any billing sub-page
4. Hide action buttons based on role (e.g. Post only for finance roles)
5. Apply same guard to `/others` billing redirects during transition

---

## PDF preview UX

- In-browser PDF preview in modal (iframe or pdf.js) before download
- "Download" and "Print" actions
- Redact bank details in preview if user lacks finance role

---

## Implementation component map

| Component | Path |
|-----------|------|
| BillingLayout | `client/components/billing/BillingLayout.tsx` |
| BillingSidebar | `client/components/billing/BillingSidebar.tsx` |
| BillingPageHeader | `client/components/billing/BillingPageHeader.tsx` |
| BillingFilterBar | `client/components/billing/BillingFilterBar.tsx` |
| BillingDataTable | `client/components/billing/BillingDataTable.tsx` |
| StatusBadge | `client/components/billing/StatusBadge.tsx` |
| ValidationIndicator | `client/components/billing/ValidationIndicator.tsx` |
| PreparationTabs | `client/components/billing/preparation/PreparationTabs.tsx` |
| InvoiceLineGrid | `client/components/billing/invoices/InvoiceLineGrid.tsx` |
| BackingSheetPreview | `client/components/billing/backing/BackingSheetPreview.tsx` |
| ReviewChecklist | `client/components/billing/review/ReviewChecklist.tsx` |
| KpiCard | `client/components/billing/dashboard/KpiCard.tsx` |
| billing-api.ts | `client/lib/billing-api.ts` |

---

## Traceability requirement

Every page component file header comment:

```
BC Page: Sales Invoices
Audit: BC_SALES_NAV_AUDIT.md §3
FRIS: /billing/invoices
API: GET /billing/invoices
Collection: billing_invoice_headers
```
