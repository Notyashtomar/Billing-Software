# Billing Workspace Migration — phases, affected areas, test guide

**Status:** Phase 0–6 implemented (2026-08-06)  
**Code home:** `BWMS/modules/m-billing/client/lib/billing-workspace/`  
**Goal:** Per-user UI workspace isolation + navigation state persistence. Business data (Mongo) and station-scoped Nest caches stay shared.

---

## How to read this doc

| Column | Meaning |
|--------|---------|
| **Phase** | Ship unit; do not skip foundation (0–1) |
| **Status** | `Done` / `Next` / `Later` |
| **Affected** | Files/routes that change or need testing |
| **Test** | Manual checks before calling the phase complete |

---

## Architecture (unchanged business behavior)

```
Shared business     Mongo invoices/prep/contracts + station Nest source caches
Personal UI         BillingWorkspaceStore keyed by userId + stationCode
Session             Cookie auth; clearFrisSession → FRIS_SESSION_CLEARED_EVENT → reset workspace
```

**Do not change:** API payloads, StationScope, send-to-prep / mark-ready / draft / review / PDF flows, Preparation URL params (`tab`/`from`/`to`/`customer`).

**Clear workspace when:** logout, session expire, user/station switch, or future explicit “Reset workspace”.

---

## Phase 0 — Particulars cache isolation — **Done**

### Affected areas

| Area | Path / route | Change |
|------|----------------|--------|
| Draft hover cache | `client/lib/billing-workspace/particulars-cache.ts` | New; keys `userId\|station\|draftId` |
| Invoice drafts list hover | `components/billing/invoices/InvoiceDraftParticularsHover.tsx` | Uses scoped cache; drops preview on identity change |
| Session clear | `m-platform/client/lib/fris-session.ts` | Emits `FRIS_SESSION_CLEARED_EVENT` |

### Test guide

1. Login as **User A** → Billing → Invoice drafts.
2. Hover a draft number until particulars preview loads.
3. Logout (or session clear) → login as **User B** (same browser tab).
4. Open Invoice drafts → hover a draft (same or different id).
5. **Pass:** Preview is empty/loading then shows **User B**’s authorized data — never flashes User A’s lines.
6. **Pass:** Hard refresh after logout still has no leftover particulars from A.

---

## Phase 1 — Workspace foundation — **Done**

### Affected areas

| Area | Path / route | Change |
|------|----------------|--------|
| Store + provider | `client/lib/billing-workspace/*` | Identity bind, reset, page-slice API |
| Layout shell | `components/billing/BillingLayoutGate.tsx` | Wraps shell with `BillingWorkspaceProvider` |
| Mounts | `scripts/ensure-module-mounts.mjs` | `apps/web/lib/billing-workspace` ← m-billing |
| Session | `fris-session.ts` | Cleared event (Phase 0) |

### Test guide

1. Login → any Billing page (e.g. Dashboard).
2. DevTools → confirm no console errors from provider.
3. Logout → login other user → navigate Billing.
4. **Pass:** App works as before (no workflow regression). Phase 1 alone does not restore filters yet.
5. From repo root: `node scripts/ensure-module-mounts.mjs` → `apps/web/lib/billing-workspace` is a junction.

---

## Phase 2 — BHS / sources + Preparation — **Done**

### Affected areas

| Area | Path / route | Change |
|------|----------------|--------|
| Slice types / keys | `billing-workspace/slices.ts`, `page-keys.ts` | `sources.<fetchMethod>`, `preparation` |
| All operational sources | `OperationalSourcePage.tsx` | Hydrate/persist filters, selection, search; remount reload |
| BHS | `/billing/scheduled-flights` | Via `listScheduledFlights` slice |
| ADS | `/billing/ads` | Via `listAds` slice |
| Equipment / Manpower | `/billing/equipment`, `/billing/manpower` | Same shared page |
| Cleaning / RAF / MAAS / XXLD / Non-sched | matching `/billing/*` routes | Same shared page |
| Preparation | `PreparationPage.tsx` → `/billing/preparation` | Selection / expanded / select-all; URL still owns period filters |

### What is persisted (personal)

**Sources (`sources.<fetchMethod>`):**
- Draft + applied date range, date basis
- Customer, flight search, dom/int
- Column filters, BHS stat chips, ADS brief chips, ADS errors-only
- Selected row keys
- `searchSubmitted` (triggers reload on return)

**Preparation:**
- Selected flight-group keys, expanded keys, select-all-matching
- Tied to `tab|from|to|customer` query key (clears when that changes)

### What stays local (not persisted)

- Loading / ingesting / unsending / deleting / marking-ready busy flags
- Toast / action messages
- Loaded row payloads (re-fetched on return when search was submitted)
- Open dialogs mid-mutation

### Test guide — BHS (primary)

1. Login → **BHS** (`/billing/scheduled-flights`).
2. Set From/To, date basis, customer, flight filter; click **Search**.
3. Toggle a stat chip and/or column filter; select 2–3 rows.
4. Navigate to **Audit** or **Reports** (or Preparation).
5. Return to **BHS**.
6. **Pass:** Same dates, filters, chips, and row selection restored; data reloads for that query.
7. Navigate to **ADS**, set different dates, Search.
8. Return to **BHS** then **ADS**.
9. **Pass:** Each source keeps its **own** slice (BHS dates ≠ ADS dates).
10. Logout → login as other user → open BHS.
11. **Pass:** No leftover filters/selection from previous user.

### Test guide — Preparation

1. Open **Preparation** with period in URL (or set From/To and apply).
2. Select several flight groups; expand one ADS-style group.
3. Go to **BHS** (or Audit), then back to Preparation (**same** `tab`/`from`/`to`/`customer` in URL).
4. **Pass:** Selection and expanded rows restored after list reload.
5. Change **tab** (e.g. Eligible → Pending) or period dates.
6. **Pass:** Selection clears (new query key).
7. Deep-link still works: `/billing/preparation?tab=pending&from=…&to=…&customer=…`.
8. **Pass:** Mark ready / delete / create drafts still work (busy flags local).

### Test guide — regression smoke (Phase 2)

| Flow | Pass criteria |
|------|----------------|
| BHS Search → Send to preparation | Ingest succeeds; prep link works |
| Prep Mark ready | Status moves; no stuck overlay after nav |
| Prep Create invoice drafts | Drafts created as before |
| Source Unsend (BHS/ADS) | Unsend still works |
| Manual-search empty visit | First visit does not auto-fetch until Search (BHS/ADS/Equip/Manpower) |

---

## Phase 3 — Invoice workflow lists — **Done**

### Affected areas

| Area | Path / route | Change |
|------|----------------|--------|
| Slice types / keys | `billing-workspace/slices.ts`, `page-keys.ts` | `invoices.drafts\|review\|list\|bin\|detail.<id>` |
| Workflow pages | `InvoiceWorkflowPages.tsx` | Hydrate/persist durable UI |
| Invoice drafts | `/billing/invoice-drafts` | Drill-down + selection |
| Review | `/billing/review` | `showApproved` checkbox |
| Invoices list | `/billing/invoices` | Status filter + selection |
| Invoice bin | `/billing/invoice-bin` | Selection |
| Invoice detail | `/billing/invoices/[id]` | Tab (URL `?edit=custom` still wins) |

### What is persisted (personal)

| Slice key | Fields |
|-----------|--------|
| `invoices.drafts` | `navLevel`, `selectedCategory`, `selectedMonthKey`, `selectedAirlineKey`, `selectedIds` |
| `invoices.review` | `showApproved` |
| `invoices.list` | `status`, `selectedIds` (clears selection when status changes) |
| `invoices.bin` | `selectedIds` |
| `invoices.detail.<id>` | `tab` |

### What stays local (not persisted)

- Delete / bin / merge / restore dialog open state
- `deleting` / `binning` / `merging` / `pdfLoadingId` / `approvingId` / export busy flags
- Action toast messages
- ADS separate-line checkboxes on detail (mid-edit)

### Test guide — Invoice drafts

1. Open **Invoice drafts** → drill Category → Month → Airline (or invoices level).
2. Select 1–2 drafts → navigate to **Preparation** (or BHS) → return to drafts.
3. **Pass:** Same drill level + selection restored after list reload.
4. Open delete (or bin) dialog → navigate away → return.
5. **Pass:** Dialog is **closed**; no stuck busy overlay.
6. Delete / merge / move-to-bin still complete successfully when confirmed on-page.

### Test guide — Review / Invoices / Bin / Detail

1. **Review:** enable “Show recently approved” → leave → return → checkbox still on; queue reloads with that filter.
2. **Invoices:** set status filter + select rows → leave → return → filter + selection restored.
3. Change status filter → **Pass:** selection clears.
4. **Bin:** select rows → leave → return → selection restored; restore/delete dialogs not auto-open.
5. **Detail:** open invoice, switch tab (e.g. lines) → go to drafts → reopen same invoice → **Pass:** tab restored.
6. Open `/billing/invoices/<id>?edit=custom` for a CUSTOM draft → **Pass:** lands on edit tab (URL wins).
7. Logout → other user → **Pass:** no leftover drill-down / selection / tabs from previous user.

### Regression smoke (Phase 3)

| Flow | Pass criteria |
|------|----------------|
| Approve from review | Approve works; list refreshes |
| Export / PDF / send from invoices list | Same as before |
| Bin restore / permanent delete | Same as before |
| Detail convert currency / recompute / separate ADS bill | Same as before |

---

## Phase 4 — Reports / Audit / remaining output — **Done**

### Design choice (do not disturb workflows)

- **Reports:** persist only `from` / `to`. Report **list rows always re-fetch** from API on mount — no soft-cache of generated report payloads (avoids stale/cross-session surprises).
- **Audit / credit memos / backing sheets:** no personal filter UI today → **no workspace slice writes**. Still fetch-on-mount; only small race-safe loading/`cancelled` guards (same happy path).
- `generateReport(type, { from, to })` payloads unchanged.

### Affected areas

| Area | Path / route | Change |
|------|----------------|--------|
| Slice types / keys | `billing-workspace/slices.ts`, `page-keys.ts` | `output.reports` (+ reserved audit key) |
| Output pages | `OutputPages.tsx` | Reports date hydrate/persist |
| Reports | `/billing/reports` | From/to restored across nav |
| Audit | `/billing/audit` | Unchanged data flow; loading state |
| Credit memos | `/billing/credit-memos` | Unchanged data flow; safer loading |
| Backing sheets | `/billing/backing-sheets` | Unchanged data flow; safer loading |

### What is persisted

| Slice key | Fields |
|-----------|--------|
| `output.reports` | `from`, `to` |

### What stays local

- `loading` while generating
- `lastResult` toast string after generate
- `reports` table rows (API reload)
- All audit / credit-memo / backing list rows

### Test guide — Reports (primary)

1. Open **Reports** → set From/To to a known window.
2. Generate **Revenue summary** (or any type) → confirm success message + row appears.
3. Navigate to **BHS** (or Audit) → return to **Reports**.
4. **Pass:** Same From/To restored.
5. **Pass:** Report list reloads from API (may show station-shared generated rows — expected).
6. Generate again with restored dates → **Pass:** uses those dates (check network payload `from`/`to`).
7. Logout → other user → **Pass:** User B sees default or their own dates, not User A’s window.

### Test guide — Audit / credit memos / backing (no filter regression)

1. Open each page → table loads as before.
2. Leave and return → data refetches; no console errors.
3. Empty states still show the same messages.

### Regression smoke (Phase 4)

| Flow | Pass criteria |
|------|----------------|
| Generate each report type | Still works; buttons disable while loading |
| Invoice detail → Generate PDF → backing sheets | Backing list still populates |
| Audit trail after a billing mutation | New entries still appear after refresh |

---

## Phase 5 — Billing React Query (read GETs) — **Done**

### Design choice (do not disturb workflows)

- Own `BillingQueryProvider` / `QueryClient` under `BillingWorkspaceProvider` — **not** shared with FRIS/Admin.
- Query keys: `['billing', userId, stationCode, …]`.
- Clear cache on logout (`FRIS_SESSION_CLEARED_EVENT`) and on user/station switch.
- `refetchOnMount: 'always'` so remount stays as fresh as prior `useEffect` fetches.
- UI filters (report dates, review “show approved”) stay in **workspace slices**; query keys only encode server-read params.
- **Not migrated yet** (on purpose): BHS/source heavy loads, preparation, invoice drafts/list/bin/detail mutations — leave until needed.

### Affected areas

| Area | Path | Change |
|------|------|--------|
| Provider | `billing-workspace/BillingQueryProvider.tsx` | New |
| Keys / hooks | `query-keys.ts`, `queries.ts`, `query-config.ts` | New |
| Layout | `BillingLayoutGate.tsx` | Wraps shell with provider |
| Credit memos / Reports / Audit / Backing | `OutputPages.tsx` | `useQuery` lists |
| Invoice review | `InvoiceWorkflowPages.tsx` → `InvoiceReviewPage` | Queue query + invalidate on approve |

### Migrated queries

| Hook | API | Invalidate when |
|------|-----|-----------------|
| `useBillingCreditMemosQuery` | `listCreditMemos` | — |
| `useBillingReportsQuery` | `listReports` | After `generateReport` |
| `useBillingAuditLogsQuery` | `listAuditLogs` | — |
| `useBillingBackingSheetsQuery` | `listBackingSheets` | — |
| `useBillingReviewQueueQuery` | `listReviewQueue` | After `approveReview` |

### Test guide

1. Open **Reports** → list loads → generate a report → **Pass:** table updates (invalidate).
2. Leave Reports → return within a few seconds → **Pass:** brief cached paint then refetch (network still fires).
3. **Review** → Approve → **Pass:** queue refreshes; success message unchanged.
4. Toggle “Show recently approved” → **Pass:** different query key; list updates.
5. User A browses Reports/Audit → logout → User B → **Pass:** no A rows flash (cache cleared).
6. Credit memos / backing / audit still load and show empty states as before.

### Regression smoke (Phase 5)

| Flow | Pass criteria |
|------|----------------|
| Generate all report types | Same payloads `{ from, to }` |
| Approve review | Same merge/flight messages |
| BHS / Prep / Invoice drafts | Unchanged (not on React Query yet) |

---

## Phase 6 — Masters + hardening — **Done**

### Design choice (do not disturb workflows)

- Persist **filters / selection / drill-down navigation** only on masters.
- Settings form drafts stay local (avoid stale overwrite of station profile fields).
- Dialogs + mutation busy flags stay local.
- Rate Cards: URL deep-link (`handling` / `customer` / `service`) still wins over workspace when present.
- Particulars cache capped at **50** entries (FIFO).
- Explicit **Reset billing workspace** on Station Profile — clears slices + particulars + Billing React Query; does **not** logout or delete Mongo data.

### Affected areas

| Area | Path / route | Change |
|------|----------------|--------|
| Slice types / keys | `slices.ts`, `page-keys.ts` | `masters.customers\|contracts\|rate-cards\|service-catalog\|concessions` |
| Customers | `/billing/customers` | Search + selection hydrate/persist |
| Contracts | `/billing/contracts` | Selection hydrate/persist |
| Rate cards | `/billing/rate-cards` | Nav drill + filters + selection; entry id rehydrate |
| Service catalog | `/billing/service-catalog` | Category / search / selection |
| Concessions | `/billing/concessions` | Station filter + search |
| Reset UI | Station Profile (`SettingsPages`) | `BillingWorkspaceResetCard` |
| Store | `store.ts` | `resetBillingWorkspace({ clearIdentity? })` + reset hook for RQ |

### What is persisted

| Slice key | Fields |
|-----------|--------|
| `masters.customers` | `search`, `selectedIds` |
| `masters.contracts` | `selectedIds` |
| `masters.rate-cards` | `navLevel`, handling/customer/aircraft, `selectedPriceCardEntryId`, filters, `selectedIds` |
| `masters.service-catalog` | `category`, `search`, `selectedIds` |
| `masters.concessions` | `stationFilter`, `search` |

### What stays local

- Create/edit/delete dialogs and busy flags
- Station Profile / tax / sequence / FX form drafts
- Rate-card `selectedPriceCardEntry` object (rehydrated from id + list)

### Test guide

1. **Customers:** set search + select rows → leave → return → **Pass:** search + selection restored.
2. **Contracts:** select rows → leave → return → **Pass:** selection restored; activate/delete still work.
3. **Rate cards:** drill into a handling/airline → leave → return → **Pass:** same nav level restored.
4. Open `/billing/rate-cards?handling=BHS&customer=XX` → **Pass:** deep-link wins over prior workspace drill.
5. **Service catalog / concessions:** change filters → leave → return → restored.
6. Station Profile → **Reset billing workspace** → confirm → open Customers/BHS → **Pass:** filters empty; sources need Search again.
7. Logout → other user → **Pass:** no A master filters/selection.
8. CRUD (create/edit customer, contract, rate card) → **Pass:** unchanged success paths.

### Regression smoke (Phase 6)

| Flow | Pass criteria |
|------|----------------|
| Customer sync / bulk delete | Same as before |
| Contract activate / delete | Same as before |
| Rate card create / copy services / deep-link | Same as before |
| Reset workspace | UI only; Mongo rows untouched |

---

## Full checklist — all Billing surfaces

Use this as a living map. Status reflects migration of **personal UI state**, not page existence.

| Surface | Route | Phase | Status |
|---------|-------|-------|--------|
| Layout / session | `/billing/*` (gate) | 0–1 | Done |
| Invoice draft hover cache | drafts list | 0 | Done |
| BHS | `/billing/scheduled-flights` | 2 | Done |
| ADS | `/billing/ads` | 2 | Done |
| Equipment | `/billing/equipment` | 2 | Done |
| Manpower | `/billing/manpower` | 2 | Done |
| Cleaning / RAF / MAAS / XXLD / Non-sched | `/billing/*` | 2 | Done |
| Preparation | `/billing/preparation` | 2 | Done |
| Invoice drafts / review / invoices / bin | workflow routes | 3 | Done |
| Invoice detail | `/billing/invoices/[id]` | 3 | Done |
| Reports / audit / credit memos / backing | output routes | 4–5 | Done |
| Invoice review queue | `/billing/review` | 3 + 5 | Done |
| Customers / contracts / rate cards / catalog / concessions | master data | 6 | Done |
| Reset billing workspace | Station Profile | 6 | Done |
| Dashboards | `/billing/dashboard`, prep-dashboard, billed-services | 6* | Later (low state) |
| Cutover / parallel-run / decommission | ops routes | 6* | Later |
| React Query (more GETs) | sources / prep / drafts | 5+ | Optional later |

\* Only if operators hit state-loss pain; otherwise leave local.

---

## Quick isolation regression (run after every phase)

| # | Steps | Pass |
|---|-------|------|
| I1 | User A sets BHS filters → logout → User B opens BHS | No A filters |
| I2 | User A hovers draft particulars → logout → User B hovers | No A preview |
| I3 | User A prep selection → logout → User B prep | No A selection |
| I4 | Same user: BHS → Audit → BHS | Filters/selection kept (Phase 2+) |
| I5 | Send to prep / mark ready / create draft | Behavior unchanged |
| I6 | Drafts drill + select → Prep → drafts | Drill + selection kept (Phase 3+) |
| I7 | User A invoice drill → logout → User B drafts | No A drill/selection |
| I8 | Reports dates → BHS → Reports | From/To kept (Phase 4+) |
| I9 | User A report dates → logout → User B reports | No A date window |
| I10 | User A Reports/Audit → logout → User B | No A list cache flash (Phase 5+) |
| I11 | Customers search → leave → return | Search kept (Phase 6+) |
| I12 | Reset billing workspace → BHS / Customers | Personal UI cleared; data still in Mongo |
| I13 | Rate cards drill → leave → return (no URL params) | Drill kept (Phase 6+) |

---

## Local verify (dev)

```bash
# repo root
node scripts/ensure-module-mounts.mjs

# optional focused check — open Billing in browser after npm run dev:web
```

After Phase 2 code changes, confirm junction:

`BWMS/apps/web/lib/billing-workspace` → `BWMS/modules/m-billing/client/lib/billing-workspace`
