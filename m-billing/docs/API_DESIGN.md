# Billing API Design

**Framework:** NestJS 11 (follow existing FRIS patterns)  
**Base path:** `/billing`  
**Auth:** JWT cookie via `GlobalJwtAuthGuard`  
**Station:** `@CurrentStation()` on all data endpoints  
**Response envelope:** `{ success: true, data: T, meta?: PaginationMeta }`

---

## Authorization model

| Role bundle | Access |
|-------------|--------|
| `OPERATIONAL_ROLES` | Read operational sources, preparation |
| `FINANCE_ROLES` (proposed: superadmin, admin, operations + finance flag) | Drafts, review, post, credit memos |
| `ADMIN_ROLES` | Master data CRUD, settings, sequences |
| `@FrisPagePermission('billing', pageLabel)` | Per-page employee access |

**Page labels:** Dashboard, Customers, Service Catalog, Contracts, Rate Cards, Preparation, Invoice Drafts, Review, Invoices, Credit Memos, Backing Sheets, Reports, Settings, Audit

---

## Common patterns

### Pagination

```
GET /billing/invoices?page=1&limit=50&sort=-postingDate
```

```typescript
interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
```

### Filtering

Query params: `customerCode`, `status`, `from`, `to`, `billingPeriodStart`, `billingPeriodEnd`, `currencyCode`

### Station scope

All list/create/update operations filter by `stationCode` from session unless `crossStation: true` (global admin).

### Error responses

```typescript
{ success: false, message: string, errors?: ValidationError[] }
```

HTTP codes: 400 validation, 403 forbidden, 404 not found, 409 conflict (duplicate serial), 422 business rule violation

### Audit logging

All POST/PATCH/DELETE handlers call `AuditEngineService.log()` after successful mutation.

### Throttle

- EXPORT category: PDF download, Excel export, bulk export
- REPORTS category: report generation endpoints

---

## Controllers & endpoints

### BillingDashboardController

| Method | Path | Description |
|--------|------|-------------|
| GET | `/billing/dashboard` | KPI summary |

**Response:**
```typescript
{
  pendingPreparation: number,
  validationErrors: number,
  draftsAwaitingApproval: number,
  postedThisMonth: { count, totalInclTax },
  readyForInvoice: number,
  recentActivity: AuditLogEntry[]
}
```

---

### BillingCustomersController

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/billing/customers` | Read | List with search/filter |
| GET | `/billing/customers/:id` | Read | Detail + tabs |
| POST | `/billing/customers` | Admin | Create |
| PATCH | `/billing/customers/:id` | Admin | Update |
| GET | `/billing/customers/:id/ledger` | Finance | AR ledger entries |
| GET | `/billing/customers/:id/invoices` | Read | Invoice history |
| POST | `/billing/customers/sync-from-advance` | Admin | Sync from advance-airline |

**DTOs:** `CreateCustomerDto`, `UpdateCustomerDto`, `ListCustomersQueryDto`

---

### BillingServiceCatalogController

| Method | Path | Description |
|--------|------|-------------|
| GET | `/billing/service-catalog` | List (filter by category, active) |
| GET | `/billing/service-catalog/:serviceCode` | Detail |
| POST | `/billing/service-catalog` | Create |
| PATCH | `/billing/service-catalog/:serviceCode` | Update |
| POST | `/billing/service-catalog/seed` | Seed from EXPORT_LOG_TYPE_LABELS |
| GET | `/billing/service-catalog/uoms` | Distinct UOM list |

---

### BillingContractsController

| Method | Path | Description |
|--------|------|-------------|
| GET | `/billing/contracts` | List |
| GET | `/billing/contracts/:id` | Detail with current version |
| POST | `/billing/contracts` | Create |
| PATCH | `/billing/contracts/:id` | Update |
| POST | `/billing/contracts/:id/versions` | Create new version |
| GET | `/billing/contracts/:id/versions` | Version history |
| POST | `/billing/contracts/:id/activate` | Set status active |

**DTOs:** `CreateContractDto`, `UpdateContractDto`, `CreateContractVersionDto`

---

### BillingRateCardsController

| Method | Path | Description |
|--------|------|-------------|
| GET | `/billing/rate-cards` | List (filter customer, service, valid date) |
| GET | `/billing/rate-cards/:id` | Detail |
| POST | `/billing/rate-cards` | Create |
| PATCH | `/billing/rate-cards/:id` | Update |
| POST | `/billing/rate-cards/bulk` | Bulk import |
| GET | `/billing/rate-cards/match` | Match rate for customer+service+date |

**Query:** `?customerCode=C&serviceCode=Scheduled Flight&date=2025-07-31&category=Dom`

---

### BillingSettingsController

| Method | Path | Description |
|--------|------|-------------|
| GET | `/billing/settings` | Station settings |
| PATCH | `/billing/settings` | Update settings |
| GET | `/billing/tax-rules` | List tax rules |
| POST | `/billing/tax-rules` | Create tax rule |
| PATCH | `/billing/tax-rules/:id` | Update |
| GET | `/billing/exchange-rates` | List ROE |
| POST | `/billing/exchange-rates` | Create ROE |
| GET | `/billing/exchange-rates/effective` | ROE for date+currency |
| GET | `/billing/sequences` | List sequences |
| POST | `/billing/sequences` | Create sequence |
| PATCH | `/billing/sequences/:id` | Update prefix/fiscal year |

---

### BillingSourcesController

Operational billing source endpoints. All return unified `PreparationSourceRow` with eligibility, contract match, rate match, validation status.

| Method | Path | Source collections |
|--------|------|-------------------|
| GET | `/billing/sources/scheduled-flights` | fhr_collection, raw_flight_data |
| GET | `/billing/sources/cleaning` | fhr_collection |
| GET | `/billing/sources/raf` | raf_usage_data |
| GET | `/billing/sources/maas` | psr-* |
| GET | `/billing/sources/ads` | ads_usage_data |
| GET | `/billing/sources/xxld` | fhr_collection, cancellations |
| GET | `/billing/sources/equipment` | ads_usage_data, FHR embed |
| GET | `/billing/sources/manpower` | FHR embed, ads |
| GET | `/billing/sources/non-scheduled` | ns_raw_flight_data |
| GET | `/billing/sources/export-errors` | Wraps navision-export-errors |

**Query (all sources):** `from`, `to`, `customerCode`, `dateBasis` (atd-date | exported-date)

**Response row:**
```typescript
{
  sourceType: string,
  sourceRef: object,
  operationalData: object,
  billingEligibility: { eligible: boolean, reason?: string },
  contractMatch: { matched: boolean, contractId?, message? },
  rateMatch: { matched: boolean, rateCardId?, unitPrice?, message? },
  validationStatus: { passed: boolean, errors: ValidationResult[] }
}
```

**Transition wrapper:** `GET /billing/sources/scheduled-flights` internally calls existing `AdvanceInvoicingService` during migration.

---

### BillingPreparationController

| Method | Path | Description |
|--------|------|-------------|
| GET | `/billing/preparation` | List by status tab |
| GET | `/billing/preparation/:id` | Detail |
| POST | `/billing/preparation/ingest` | Ingest from source rows |
| POST | `/billing/preparation/:id/validate` | Re-run validation |
| POST | `/billing/preparation/:id/reject` | Finance reject |
| POST | `/billing/preparation/:id/ready` | Mark ready for invoice |
| POST | `/billing/preparation/bulk-ready` | Bulk mark ready |
| POST | `/billing/preparation/create-drafts` | Create invoice drafts from ready rows |

**Query tabs:** `?status=eligible|pending|validation_error|rejected|ready_for_invoice`

---

### BillingInvoiceDraftsController

| Method | Path | Description |
|--------|------|-------------|
| GET | `/billing/invoice-drafts` | List drafts |
| GET | `/billing/invoice-drafts/:id` | Detail with lines |
| POST | `/billing/invoice-drafts` | Create manual draft |
| PATCH | `/billing/invoice-drafts/:id` | Update header |
| POST | `/billing/invoice-drafts/:id/lines` | Add line |
| PATCH | `/billing/invoice-drafts/:id/lines/:lineNo` | Update line |
| DELETE | `/billing/invoice-drafts/:id/lines/:lineNo` | Remove line |
| POST | `/billing/invoice-drafts/:id/recalculate` | Re-run invoice engine |
| POST | `/billing/invoice-drafts/:id/submit-approval` | Submit for approval |
| DELETE | `/billing/invoice-drafts/:id` | Delete draft |

---

### BillingReviewController

| Method | Path | Description |
|--------|------|-------------|
| GET | `/billing/review` | List drafts with review checks |
| GET | `/billing/review/:invoiceId` | Full review report |
| POST | `/billing/review/:invoiceId/approve` | Approve |
| POST | `/billing/review/:invoiceId/reject` | Reject with reason |

**Review checks returned:**
```typescript
{
  missingContract: boolean,
  missingRate: boolean,
  currencyError: boolean,
  taxError: boolean,
  duplicateBilling: boolean,
  approvalStatus: string,
  reconciliationMismatch?: { expected, actual, field },
  details: ValidationResult[]
}
```

---

### BillingInvoicesController

| Method | Path | Description |
|--------|------|-------------|
| GET | `/billing/invoices` | List (filter status) |
| GET | `/billing/invoices/:id` | Detail — tabs: general, lines, dimensions, backing, attachments, audit, activity, flights, credit notes |
| POST | `/billing/invoices/:id/generate` | Generate PDF + backing |
| POST | `/billing/invoices/:id/post` | Post invoice (assign number) |
| POST | `/billing/invoices/:id/cancel` | Cancel posted (credit memo chain) |
| POST | `/billing/invoices/:id/archive` | Archive |
| GET | `/billing/invoices/:id/pdf` | Download invoice PDF |
| GET | `/billing/invoices/:id/backing-sheet/pdf` | Download backing PDF |
| GET | `/billing/invoices/:id/audit-trail` | Audit entries |
| GET | `/billing/invoices/:id/related-flights` | Linked FHR serials |
| GET | `/billing/invoices/:id/credit-notes` | Related credit memos |

---

### BillingCreditMemosController

| Method | Path | Description |
|--------|------|-------------|
| GET | `/billing/credit-memos` | List |
| GET | `/billing/credit-memos/:id` | Detail |
| POST | `/billing/credit-memos` | Create from XXLD/dispute/correction |
| PATCH | `/billing/credit-memos/:id` | Update draft |
| POST | `/billing/credit-memos/:id/post` | Post credit memo |
| POST | `/billing/credit-memos/:id/apply` | Apply to invoice |
| GET | `/billing/credit-memos/:id/pdf` | Download PDF |

---

### BillingBackingSheetsController

| Method | Path | Description |
|--------|------|-------------|
| GET | `/billing/backing-sheets` | List |
| GET | `/billing/backing-sheets/:id` | Detail with rows |
| POST | `/billing/backing-sheets/generate` | Generate for invoice |
| GET | `/billing/backing-sheets/:id/pdf` | Download PDF |

---

### BillingReportsController

| Method | Path | Description |
|--------|------|-------------|
| GET | `/billing/reports` | List generated reports |
| POST | `/billing/reports/revenue-summary` | Generate Rev_Summary equivalent |
| POST | `/billing/reports/schedule-reconciliation` | Reco_Skd equivalent |
| POST | `/billing/reports/delay-charges` | Delay Flt equivalent |
| POST | `/billing/reports/xxld-decisions` | Addl & XXLD equivalent |
| POST | `/billing/reports/tax-summary` | Tax summary |
| POST | `/billing/reports/monthly-summary` | Monthly billing summary |
| POST | `/billing/reports/ar-aging` | Aged AR |
| GET | `/billing/reports/:id` | Get report data |
| GET | `/billing/reports/:id/download` | Download PDF/Excel |

---

### BillingAuditController

| Method | Path | Description |
|--------|------|-------------|
| GET | `/billing/audit` | List audit logs (filter entity, action, date) |
| GET | `/billing/audit/:entityType/:entityId` | Entity audit trail |

---

## Service layer

| Service | Responsibility |
|---------|----------------|
| `BillingCustomersService` | Customer CRUD, advance sync |
| `BillingContractsService` | Contract lifecycle |
| `BillingRateCardsService` | Rate CRUD, match |
| `BillingServiceCatalogService` | Catalog CRUD, seed |
| `BillingPreparationService` | Ingest, status transitions |
| `BillingSourcesScheduledService` | Scheduled flight source |
| `BillingSourcesRafService` | RAF source |
| `BillingSourcesAdsService` | ADS/equipment source |
| `BillingInvoiceDraftsService` | Draft CRUD |
| `BillingInvoicesService` | Invoice lifecycle, post |
| `BillingCreditMemosService` | Credit memo lifecycle |
| `BillingReviewService` | Review checks |
| `InvoiceEngineService` | Line composition + calculation |
| `BackingSheetEngineService` | 49-column generation |
| `TaxEngineService` | GST calculation |
| `CurrencyEngineService` | ROE lookup |
| `ValidationEngineService` | All business rules |
| `PdfEngineService` | PDF generation |
| `ExportEngineService` | File export tracking |
| `ReportingEngineService` | Report generation |
| `AuditEngineService` | Audit log writes |
| `ApprovalWorkflowService` | Approval state machine |
| `BillingSequencesService` | Atomic numbering |

---

## DTO examples

### CreateInvoiceDraftDto

```typescript
class CreateInvoiceDraftDto {
  @IsString() customerCode: string;
  @IsDateString() billingPeriodStart: string;
  @IsDateString() billingPeriodEnd: string;
  @IsDateString() documentDate: string;
  @IsOptional() @IsArray() preparationRecordIds?: string[];
}
```

### PostInvoiceDto

```typescript
class PostInvoiceDto {
  @IsDateString() postingDate: string;
  @IsOptional() @IsString() workDescription?: string;
}
```

### IngestPreparationDto

```typescript
class IngestPreparationDto {
  @IsEnum(SourceType) sourceType: SourceType;
  @IsDateString() billingPeriodStart: string;
  @IsDateString() billingPeriodEnd: string;
  @IsOptional() @IsArray() sourceRefs?: SourceRefDto[];
}
```

---

## PDF generation

- **Library:** PDFKit or Puppeteer (evaluate bundle size for Workers — PDF generation runs on Railway/Nest, not Workers)
- **Endpoints return:** `Content-Type: application/pdf` stream or signed URL from storage
- **Audit:** Log `downloaded` action on GET pdf

---

## Export endpoints

| Endpoint | Format | Throttle |
|----------|--------|----------|
| `GET /billing/invoices/:id/pdf` | PDF | EXPORT |
| `GET /billing/invoices/:id/backing-sheet/pdf` | PDF | EXPORT |
| `POST /billing/reports/*/download` | Excel/PDF | EXPORT |
| `POST /billing/preparation/export` | Excel | EXPORT |

---

## Workers / proxy compatibility

- All billing routes proxied through `client/app/api-backend/[[...path]]/route.ts`
- Strip `Accept-Encoding` on upstream; buffer body; remove `content-encoding` on response
- No `next.config.ts` rewrite for `/api-backend/*`

---

## Deprecation plan

| Legacy endpoint | Replacement | Remove after |
|-----------------|-------------|--------------|
| `GET /advance-invoicing/scheduled-flight-data` | `GET /billing/sources/scheduled-flights` | Cutover + 1 release |
| `PATCH /raw-flight-data/navision-export/:serialNo` | `POST /billing/preparation/ingest` | Cutover + 1 release |
| `POST /advance-invoicing/export-nav` | `POST /billing/preparation/ingest` | Cutover + 1 release |

---

## OpenAPI

Generate OpenAPI spec from NestJS decorators; publish at `/billing/openapi.json` for finance team review.
