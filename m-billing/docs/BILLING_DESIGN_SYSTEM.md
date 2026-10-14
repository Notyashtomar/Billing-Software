# Billing Design System — Calm Ledger

**Last updated:** 2026-08-04  
**Scope:** Visual redesign of `/billing/*` only. No business logic, API, or workflow changes.

---

## 1. Design philosophy

**Calm Ledger** blends:

| Inspiration | What we took |
|---|---|
| Stripe Dashboard | Dense tables, clear status, financial trust |
| Linear | Calm neutrals, low chrome noise |
| IBM Carbon | Role-based tokens, surface layers |
| Ramp / Brex | Operator-first finance UI for long sessions |

We did **not** copy any product. The system is neutral-first so operators can work 8–10 hours without visual fatigue. Color is reserved for status and primary actions — never decoration.

---

## 2. Three primary colors

| Role | Name | Hex | Why |
|---|---|---|---|
| **Primary** | Ink Navy | `#0B1F33` | Trust, authority, primary buttons & titles. Dark enough for WCAG AA on white. |
| **Secondary** | Cool Slate | `#5B6B7C` | Supporting chrome, secondary labels, muted icons. Reduces contrast glare. |
| **Accent** | Soft Teal | `#0F766E` | Focus rings, links, selection, interactive highlights. Calmer than loud green; not purple. |

### Semantic (muted)

| Role | Hex | Soft surface |
|---|---|---|
| Success | `#166534` | `#F0FDF4` |
| Warning | `#B45309` | `#FFFBEB` |
| Danger | `#B91C1C` | `#FEF2F2` |
| Info | `#0369A1` | `#F0F9FF` |

---

## 3. Design tokens (CSS)

Source: `client/components/billing/billing-design-system.css`  
Applied via `.billing-app` in `BillingDesignRoot`.

Class helpers: `client/components/billing/billingUi.ts`

### Surfaces

| Token | Value |
|---|---|
| `--billing-bg` | `#F4F6F8` |
| `--billing-surface` | `#FFFFFF` |
| `--billing-surface-muted` | `#F0F3F6` |
| `--billing-border` | `#E2E8F0` |
| `--billing-border-strong` | `#CBD5E1` |

### Text

| Token | Value | Use |
|---|---|---|
| `--billing-text` | `#0F172A` | Body |
| `--billing-text-secondary` | `#334155` | Table cells |
| `--billing-text-muted` | `#64748B` | Hints, captions |
| `--billing-text-inverse` | `#F8FAFC` | On primary buttons |

### Elevation

| Token | Value |
|---|---|
| `--billing-shadow-sm` | `0 1px 2px rgba(15,23,42,0.04)` |
| `--billing-shadow-md` | `0 4px 12px -4px rgba(15,23,42,0.08)` |
| `--billing-shadow-lg` | `0 12px 28px -10px rgba(15,23,42,0.12)` |

### Radius / motion

| Token | Value |
|---|---|
| `--billing-radius` | `0.5rem` |
| `--billing-radius-xl` | `0.875rem` |
| `--billing-duration` | `150ms` |
| `--billing-ease` | `cubic-bezier(0.2, 0.8, 0.2, 1)` |

---

## 4. Typography

| Level | Size | Weight | Color |
|---|---|---|---|
| Page title | `text-xl` → `sm:text-2xl` | 600 | Primary ink |
| Page subtitle | `text-sm` | 400 | Muted |
| Section title | `text-sm` | 600 | Primary ink |
| Body / table | `text-sm` | 400–500 | Secondary text |
| Caption / hint | `text-xs` | 400 | Muted |
| KPI value | `text-2xl` | 600 tabular-nums | Primary ink |

**Font:** Source Sans 3 (humanist sans — readable at dense table sizes; not Inter/Roboto).

---

## 5. Spacing scale (4px base)

`4 / 8 / 12 / 16 / 20 / 24 / 32` → `--billing-space-1` … `--billing-space-8`

Page padding: `p-4 sm:p-6`. Section stacks: `space-y-6`. Card padding: `p-4 sm:p-5`. Table cells: `px-4 py-3`.

---

## 6. Component rules

| Surface | Rule |
|---|---|
| Tables | Light sticky headers (muted surface + ink text). Subtle hover. Optional zebra via `.billing-table`. |
| Primary button | Ink navy fill, white text |
| Outline / link | Teal accent |
| Danger | Muted red — never as default chrome |
| Forms | Strong border, teal focus ring 2px @ 25% |
| Badges | Soft semantic fills, high-contrast text |
| Icons | Lucide, equal sizing, semantic color only |

---

## 7. Accessibility

- Body text ≥ 4.5:1 on surfaces (WCAG AA)
- Focus-visible rings on interactive controls
- Status never by color alone (labels + badges)
- Checkbox / radio `accent-color` = accent teal
- Touch targets ≥ ~32–40px on action controls
