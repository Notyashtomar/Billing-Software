# Billing Database Design

**Database:** MongoDB (same cluster as FRIS)  
**Convention:** `billing_*` collection prefix; all billing collections use `stationAwarePlugin`  
**Timestamps:** `createdAt`, `updatedAt` on all collections

---

## Collection index

| Collection | Purpose |
|------------|---------|
| `billing_customers` | Finance customer master |
| `billing_contracts` | Handling agreements |
| `billing_contract_versions` | Immutable contract snapshots |
| `billing_rate_cards` | Service rates + ceilings |
| `billing_service_catalog` | Item/service codes (140+) |
| `billing_preparation_records` | Ops → billing bridge |
| `billing_invoice_drafts` | Pre-post invoice documents |
| `billing_invoice_headers` | Posted + draft headers |
| `billing_invoice_lines` | Invoice line items |
| `billing_backing_sheets` | Per-FHR 49-column detail |
| `billing_credit_memos` | Credit notes |
| `billing_exchange_rates` | ROE table |
| `billing_tax_rules` | GST rules |
| `billing_exports` | Export job records |
| `billing_reports` | Generated report snapshots |
| `billing_approvals` | Approval workflow |
| `billing_audit_logs` | Immutable audit trail |
| `billing_sequences` | Invoice/credit memo numbering |
| `billing_settings` | Per-station billing config |

---

## billing_customers

### Schema

```typescript
{
  _id: ObjectId,
  customerCode: string,          // unique per station
  name: string,
  billToCustomerCode?: string,
  currencyCode: 'INR' | 'USD',
  paymentTermsCode?: string,
  gstRegistrationNo?: string,
  gstBusPostingGroup?: string,
  genBusPostingGroup?: string,
  blocked: boolean,              // default false
  creditLimit?: Decimal128,
  globalDimension1?: string,
  globalDimension2?: string,
  stationCode: string,
  advanceAirlineId?: ObjectId,
  contacts?: [{ type, name, address, email, phone }],
  active: boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### Relationships

- `advanceAirlineId` → `advance-airline._id`
- Referenced by `billing_contracts.customerCode`, `billing_invoice_headers.customerCode`

### Indexes

| Index | Type | Purpose |
|-------|------|---------|
| `{ stationCode: 1, customerCode: 1 }` | unique | Primary lookup |
| `{ stationCode: 1, name: 1 }` | compound | Search |
| `{ stationCode: 1, active: 1 }` | compound | Active filter |

### Constraints

- `customerCode` required, uppercase normalized
- Cannot post invoice if `blocked: true`

### Validation rules

- `currencyCode` must be INR or USD
- `gstRegistrationNo` format validation (India GSTIN pattern)

---

## billing_contracts

### Schema

```typescript
{
  _id: ObjectId,
  contractNumber: string,
  customerCode: string,
  stationCode: string,
  category: 'Dom' | 'Int',
  aircraftTypes?: string[],
  priceValidFrom: Date,
  priceValidTo: Date,
  royaltyAtGross?: Decimal128,
  royaltyInclusive?: boolean,
  xxlnClause?: string,
  delayClause?: string,
  flightsPerSchedule?: number,
  status: 'draft' | 'active' | 'expired',
  currentVersionId?: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```

### Indexes

| Index | Type |
|-------|------|
| `{ stationCode: 1, contractNumber: 1 }` | unique |
| `{ stationCode: 1, customerCode: 1, status: 1 }` | compound |
| `{ stationCode: 1, priceValidFrom: 1, priceValidTo: 1 }` | compound |

### Constraints

- Only one `active` contract per customer+category+station overlapping same period
- `priceValidTo` >= `priceValidFrom`

---

## billing_contract_versions

### Schema

```typescript
{
  _id: ObjectId,
  contractId: ObjectId,
  version: number,
  effectiveFrom: Date,
  terms: object,           // full snapshot
  createdBy: string,
  createdAt: Date
}
```

### Indexes

| Index | Type |
|-------|------|
| `{ contractId: 1, version: 1 }` | unique |

---

## billing_rate_cards

### Schema

```typescript
{
  _id: ObjectId,
  contractId: ObjectId,
  customerCode: string,
  serviceCode: string,
  category?: string,       // Dom C, Int B, etc.
  unitPriceINR?: Decimal128,
  unitPriceUSD?: Decimal128,
  ceilingRateINR?: Decimal128,
  ceilingRateUSD?: Decimal128,
  currency: 'INR' | 'USD',
  uom: string,
  minBillableUnits?: number,
  discountPercent?: Decimal128,
  discountDelayPercent?: Decimal128,
  royaltyRate?: Decimal128,
  validFrom: Date,
  validTo: Date,
  stationCode: string,
  createdAt: Date,
  updatedAt: Date
}
```

### Indexes

| Index | Type |
|-------|------|
| `{ stationCode: 1, customerCode: 1, serviceCode: 1, validFrom: 1 }` | compound |
| `{ contractId: 1 }` | single |
| `{ stationCode: 1, serviceCode: 1, category: 1 }` | compound |

### Validation rules

- Unit price must not exceed ceiling when ceiling defined
- `minBillableUnits` enforced by validation engine for RAF/ADS

---

## billing_service_catalog

### Schema

```typescript
{
  _id: ObjectId,
  serviceCode: string,     // global unique
  description: string,
  lineType: 'service' | 'adjustment',
  category: 'scheduled' | 'non_scheduled' | 'raf' | 'xxld' | 'delay' | 'cleaning' | 'maas' | 'manpower' | 'equipment',
  uom: string,
  gstProdPostingGroup?: string,
  sacCode?: string,
  royaltyApplicable: boolean,
  active: boolean,
  exportLogType?: string,
  createdAt: Date,
  updatedAt: Date
}
```

### Indexes

| Index | Type |
|-------|------|
| `{ serviceCode: 1 }` | unique |
| `{ category: 1, active: 1 }` | compound |
| `{ exportLogType: 1 }` | single |

---

## billing_preparation_records

### Schema

```typescript
{
  _id: ObjectId,
  sourceType: 'scheduled_flight' | 'equipment' | 'cleaning' | 'raf' | 'maas' | 'ads' | 'xxld' | 'manpower' | 'non_scheduled',
  sourceRef: {
    serialNo?: string,
    flightNo?: string,
    batchId?: ObjectId,
    usageRowId?: ObjectId
  },
  customerCode: string,
  customerName?: string,
  billingPeriodStart: Date,
  billingPeriodEnd: Date,
  status: 'eligible' | 'pending' | 'validation_error' | 'rejected' | 'ready_for_invoice' | 'invoiced',
  contractMatch?: { contractId?, rateCardId?, matched: boolean, message? },
  rateMatch?: { serviceCode?, unitPrice?, currency?, matched: boolean },
  validationResults: [{ rule: string, passed: boolean, message?: string }],
  operationalSnapshot?: object,  // denormalized ops data for display
  invoiceDraftId?: ObjectId,
  invoiceId?: ObjectId,
  stationCode: string,
  createdAt: Date,
  updatedAt: Date
}
```

### Indexes

| Index | Type | Purpose |
|-------|------|---------|
| `{ stationCode: 1, status: 1, billingPeriodStart: 1 }` | compound | Preparation workspace tabs |
| `{ stationCode: 1, 'sourceRef.serialNo': 1, billingPeriodStart: 1 }` | compound | Duplicate detection |
| `{ stationCode: 1, customerCode: 1, status: 1 }` | compound | Customer filter |
| `{ invoiceDraftId: 1 }` | sparse | Draft linkage |

### Constraints

- Unique `{ stationCode, sourceType, sourceRef.serialNo, billingPeriodStart }` for scheduled flights (partial index where serialNo exists)

### Validation rules

- Status transitions enforced in service layer (see SYSTEM_ARCHITECTURE.md state diagram)

---

## billing_invoice_drafts

### Schema

Same as `billing_invoice_headers` with `status` restricted to draft states and `draftNumber` required. May be merged into headers collection with status field — **implementation choice:** single `billing_invoice_headers` with status filter avoids duplication.

**Recommendation:** Use `billing_invoice_headers` only; `billing_invoice_drafts` as a view/filter (`status IN draft states`). Keep `billing_invoice_drafts` collection only if draft lifecycle needs separate retention policy.

---

## billing_invoice_headers

### Schema

```typescript
{
  _id: ObjectId,
  invoiceNumber?: string,
  draftNumber: string,
  customerCode: string,
  customerName: string,
  billToCustomerCode?: string,
  status: 'draft' | 'pending_approval' | 'approved' | 'generated' | 'posted' | 'cancelled' | 'archived',
  postingDate?: Date,
  documentDate: Date,
  dueDate?: Date,
  currencyCode: 'INR' | 'USD',
  currencyFactor: Decimal128,
  pricesIncludingVat?: boolean,
  workDescription?: string,
  externalDocumentNo?: string,
  shortcutDimension1?: string,
  shortcutDimension2?: string,
  subtotalExclTax: Decimal128,
  taxTotal: Decimal128,
  totalInclTax: Decimal128,
  remainingAmount?: Decimal128,
  billingPeriodStart: Date,
  billingPeriodEnd: Date,
  contractId?: ObjectId,
  approvalStatus?: 'pending' | 'approved' | 'rejected',
  backingSheetId?: ObjectId,
  postedAt?: Date,
  postedBy?: string,
  cancelled: boolean,
  correctedFromInvoiceId?: ObjectId,
  stationCode: string,
  createdAt: Date,
  updatedAt: Date
}
```

### Indexes

| Index | Type |
|-------|------|
| `{ stationCode: 1, invoiceNumber: 1 }` | unique sparse |
| `{ stationCode: 1, draftNumber: 1 }` | unique |
| `{ stationCode: 1, status: 1, billingPeriodStart: 1 }` | compound |
| `{ stationCode: 1, customerCode: 1, status: 1 }` | compound |
| `{ stationCode: 1, postingDate: 1 }` | compound |

### Constraints

- `invoiceNumber` assigned atomically on post from `billing_sequences`
- Posted documents immutable (updates blocked at service layer)

---

## billing_invoice_lines

### Schema

```typescript
{
  _id: ObjectId,
  invoiceId: ObjectId,
  lineNo: number,
  lineType: 'service' | 'royalty' | 'delay' | 'xxld' | 'adjustment',
  serviceCode: string,
  description: string,
  quantity: Decimal128,
  uom: string,
  unitPrice: Decimal128,
  lineDiscountPercent?: Decimal128,
  lineAmountExclTax: Decimal128,
  gstPercent: Decimal128,
  cgstAmount: Decimal128,
  sgstAmount: Decimal128,
  igstAmount: Decimal128,
  lineAmountInclTax: Decimal128,
  royaltyAmount?: Decimal128,
  shortcutDimension1?: string,
  shortcutDimension2?: string,
  sourceType?: string,
  sourceRef?: { serialNo?, flightNo?, preparationRecordId? },
  stationCode: string,
  createdAt: Date,
  updatedAt: Date
}
```

### Indexes

| Index | Type |
|-------|------|
| `{ invoiceId: 1, lineNo: 1 }` | unique |
| `{ stationCode: 1, 'sourceRef.serialNo': 1, serviceCode: 1 }` | compound |
| `{ stationCode: 1, serviceCode: 1 }` | compound |

---

## billing_backing_sheets

### Schema

```typescript
{
  _id: ObjectId,
  invoiceId: ObjectId,
  customerCode: string,
  billingPeriodStart: Date,
  billingPeriodEnd: Date,
  rows: [object],          // 49-column mapper output
  rowCount: number,
  generatedAt: Date,
  pdfStorageKey?: string,
  stationCode: string,
  createdAt: Date,
  updatedAt: Date
}
```

### Indexes

| Index | Type |
|-------|------|
| `{ invoiceId: 1 }` | unique |
| `{ stationCode: 1, customerCode: 1, billingPeriodStart: 1 }` | compound |

---

## billing_credit_memos

### Schema

```typescript
{
  _id: ObjectId,
  creditMemoNumber?: string,
  customerCode: string,
  appliesToInvoiceId: ObjectId,
  appliesToInvoiceNo: string,
  status: 'draft' | 'posted',
  postingDate?: Date,
  documentDate: Date,
  currencyCode: 'INR' | 'USD',
  currencyFactor: Decimal128,
  lines: [/* same as invoice line */],
  reason: 'xxld_not_chargeable' | 'delay_dispute' | 'correction' | 'other',
  xxldDecision?: { conclusion?, resulted?, clause? },
  totalInclTax: Decimal128,
  stationCode: string,
  createdAt: Date,
  updatedAt: Date
}
```

### Indexes

| Index | Type |
|-------|------|
| `{ stationCode: 1, creditMemoNumber: 1 }` | unique sparse |
| `{ appliesToInvoiceId: 1 }` | single |
| `{ stationCode: 1, customerCode: 1, status: 1 }` | compound |

---

## billing_exchange_rates

### Schema

```typescript
{
  _id: ObjectId,
  currencyCode: string,
  rateToINR: Decimal128,
  startingDate: Date,
  relationalRate?: Decimal128,
  source: 'manual' | 'rbi' | 'import',
  stationCode?: string,      // null = global
  createdAt: Date,
  updatedAt: Date
}
```

### Indexes

| Index | Type |
|-------|------|
| `{ currencyCode: 1, startingDate: 1, stationCode: 1 }` | unique |

---

## billing_tax_rules

### Schema

```typescript
{
  _id: ObjectId,
  ruleCode: string,
  gstPercent: Decimal128,
  placeOfSupply: 'intra_state' | 'inter_state',
  cgstPercent: Decimal128,
  sgstPercent: Decimal128,
  igstPercent: Decimal128,
  serviceCodePattern?: string,
  customerGstGroup?: string,
  effectiveFrom: Date,
  effectiveTo: Date,
  stationCode: string,
  createdAt: Date,
  updatedAt: Date
}
```

### Indexes

| Index | Type |
|-------|------|
| `{ stationCode: 1, ruleCode: 1 }` | unique |
| `{ stationCode: 1, effectiveFrom: 1, effectiveTo: 1 }` | compound |

---

## billing_exports

### Schema

```typescript
{
  _id: ObjectId,
  exportType: 'invoice_pdf' | 'backing_pdf' | 'excel_reconciliation' | 'ar_export',
  documentId: ObjectId,
  fileName: string,
  storageKey?: string,
  exportedBy: string,
  exportedAt: Date,
  recipient?: string,
  stationCode: string,
  createdAt: Date
}
```

### Indexes

| Index | Type |
|-------|------|
| `{ stationCode: 1, exportedAt: -1 }` | compound |
| `{ documentId: 1, exportType: 1 }` | compound |

---

## billing_reports

### Schema

```typescript
{
  _id: ObjectId,
  reportType: string,
  parameters: object,
  generatedAt: Date,
  generatedBy: string,
  data: object,
  storageKey?: string,
  stationCode: string,
  createdAt: Date
}
```

### Indexes

| Index | Type |
|-------|------|
| `{ stationCode: 1, reportType: 1, generatedAt: -1 }` | compound |

---

## billing_approvals

### Schema

```typescript
{
  _id: ObjectId,
  documentType: 'invoice' | 'credit_memo',
  documentId: ObjectId,
  status: 'pending' | 'approved' | 'rejected',
  requestedBy: string,
  requestedAt: Date,
  approvedBy?: string,
  approvedAt?: Date,
  rejectedBy?: string,
  rejectionReason?: string,
  stationCode: string,
  createdAt: Date,
  updatedAt: Date
}
```

### Indexes

| Index | Type |
|-------|------|
| `{ documentId: 1, documentType: 1 }` | unique |
| `{ stationCode: 1, status: 1 }` | compound |

---

## billing_audit_logs

### Schema

```typescript
{
  _id: ObjectId,
  entityType: string,
  entityId: ObjectId,
  action: string,
  userId: string,
  userName: string,
  timestamp: Date,
  changes?: object,
  ipAddress?: string,
  stationCode: string
}
```

### Indexes

| Index | Type |
|-------|------|
| `{ stationCode: 1, entityType: 1, entityId: 1, timestamp: -1 }` | compound |
| `{ stationCode: 1, timestamp: -1 }` | compound (TTL optional after 7 years) |

**Immutability:** Insert-only; no updates or deletes.

---

## billing_sequences

### Schema

```typescript
{
  _id: ObjectId,
  sequenceCode: string,
  prefix: string,
  currentValue: number,
  fiscalYear: string,
  documentType: 'invoice' | 'credit_memo',
  stationCode: string,
  updatedAt: Date
}
```

### Indexes

| Index | Type |
|-------|------|
| `{ stationCode: 1, sequenceCode: 1, fiscalYear: 1 }` | unique |

### Constraints

- `findOneAndUpdate` with `$inc: { currentValue: 1 }` for atomic numbering

---

## billing_settings

### Schema

```typescript
{
  _id: ObjectId,
  stationCode: string,
  defaultPaymentTerms?: string,
  defaultGstGroup?: string,
  dimensionMappings?: { dimension1: string, dimension2: string },
  approvalRequired: boolean,
  monthCloseLockDay?: number,
  companyLegalEntity?: { name, address, gstin, logoUrl },
  createdAt: Date,
  updatedAt: Date
}
```

### Indexes

| Index | Type |
|-------|------|
| `{ stationCode: 1 }` | unique |

---

## Migration plan

| Source | Target | Strategy |
|--------|--------|----------|
| `advance-airline` | `billing_customers` | One-time seed script + ongoing sync on airline update |
| `bhs_revenue_master` | `billing_contracts` + `billing_rate_cards` | Migration script in `billing/scripts/` |
| `EXPORT_LOG_TYPE_LABELS` | `billing_service_catalog` | Seed on module init |
| `exportedNAV` flags | `billing_preparation_records.status` | Backfill eligible rows for current period |

---

## Performance considerations

- Preparation workspace queries use `{ stationCode, status, billingPeriodStart }` compound index
- Invoice list paginated with cursor on `_id` + `postingDate`
- Backing sheet rows stored as embedded array (max ~500 rows/invoice typical); consider separate `billing_backing_sheet_rows` if rows exceed 1000
- Report generation async via job queue for month-close packs
- Audit log write concern: `{ w: 1 }` acceptable; consider capped collection for high volume
