/** USD ↔ INR conversion using station ROE (rate to INR per 1 USD). */

/** Money amounts use 2 dp (matches billing money inputs / save validation). */
export function formatBillingAmount(value: number, _currency: 'INR' | 'USD' = 'INR'): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2);
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
