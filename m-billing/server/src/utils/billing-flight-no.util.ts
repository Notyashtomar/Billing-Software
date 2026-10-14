/**
 * Scheduled Airlines stores a cancellation as a CANC prefix on the flight number
 * (`CANC IX472`, `CANC-IX472`, or glued `CANCIX472`). Billing displays and matches
 * the operating number.
 */
function stripOneCancelledToken(part: string): string {
  const spaced = part.replace(/^CANC[\s-]+/i, '').trim();
  if (spaced !== part) return spaced;
  return part.replace(/^CANC(?=[A-Z]{1,3}\d)/i, '');
}

export function stripCancelledFlightPrefix(raw: unknown): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  if (!text.includes('/')) return stripOneCancelledToken(text);
  return text
    .split('/')
    .map((part) => stripOneCancelledToken(part.trim()))
    .filter(Boolean)
    .join('/');
}
