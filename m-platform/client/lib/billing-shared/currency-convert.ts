/** USD ↔ INR conversion using station ROE (rate to INR per 1 USD). */

/** Money amounts use 2 dp (matches billing money inputs / save validation). */
export function formatBillingAmount(value: number, _currency: 'INR' | 'USD' = 'INR'): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2);
}

/** INR is shown in whole rupees everywhere in billing. Only USD carries decimals. */
export function billingDisplayFractionDigits(currencyCode?: string | null): 0 | 2 {
  return String(currencyCode ?? '').trim().toUpperCase() === 'USD' ? 2 : 0;
}

/** Display number without a currency symbol: INR `1,23,457`, USD `1,234.50`. */
export function formatBillingDisplayNumber(
  value: number,
  currencyCode?: string | null,
  options?: { grouping?: boolean },
): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const digits = billingDisplayFractionDigits(currencyCode);
  // Clean float noise first so 100.5 never shows as 100.
  const cleaned = Math.round(n * 100) / 100;
  return new Intl.NumberFormat(digits === 2 ? 'en-US' : 'en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: options?.grouping !== false,
  }).format(digits === 0 ? Math.round(cleaned) : cleaned);
}

/** Display amount with its currency symbol: `₹1,23,457` or `$1,234.50`. */
export function formatBillingDisplayCurrency(
  value: number,
  currencyCode?: string | null,
): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const digits = billingDisplayFractionDigits(currencyCode);
  const cleaned = Math.round(n * 100) / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: digits === 2 ? 'USD' : 'INR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(digits === 0 ? Math.round(cleaned) : cleaned);
}

const PARTICULAR_COLLATOR = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/**
 * Particulars list A to Z, the same order the invoice PDF prints. Rows with the
 * same particular are ordered by aircraft type, then by their saved position.
 */
export function sortParticularsAlphabetically<
  T extends { description?: unknown; sourceRef?: Record<string, unknown> | null },
>(lines: readonly T[]): T[] {
  const aircraft = (line: T) =>
    String(line.sourceRef?.aircraftType ?? line.sourceRef?.aircraft ?? '').trim();
  return lines
    .map((line, index) => ({ line, index }))
    .sort(
      (a, b) =>
        PARTICULAR_COLLATOR.compare(
          String(a.line.description ?? '').trim(),
          String(b.line.description ?? '').trim(),
        ) ||
        PARTICULAR_COLLATOR.compare(aircraft(a.line), aircraft(b.line)) ||
        a.index - b.index,
    )
    .map(({ line }) => line);
}

/** Round a money amount to 2 decimal places as a number. */
export function roundBillingAmount(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  return Number(n.toFixed(2));
}

/** Coerce ROE to a positive finite number, or null. */
export function resolveRateToInr(rateToInr: unknown): number | null {
  const rate = Number(rateToInr);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

export function usdToInr(usd: number, rateToInr: number): string {
  const amount = Number(usd);
  const rate = resolveRateToInr(rateToInr);
  if (!Number.isFinite(amount) || rate == null) return '';
  return formatBillingAmount(amount * rate, 'INR');
}

export function inrToUsd(inr: number, rateToInr: number): string {
  const amount = Number(inr);
  const rate = resolveRateToInr(rateToInr);
  if (!Number.isFinite(amount) || rate == null) return '';
  return formatBillingAmount(amount / rate, 'USD');
}

export function parseAmountInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return roundBillingAmount(n);
}
