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

/** `CI5637/CI5637` is one flight. Distinct legs such as `CI5637/CI5640` stay paired. */
function collapseIdenticalFlightLegs(text: string): string {
  if (!text.includes('/')) return text;
  const parts = text
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return text;
  const first = parts[0].toUpperCase();
  if (parts.every((part) => part.toUpperCase() === first)) return parts[0];
  return text;
}

export function stripCancelledFlightPrefix(raw: unknown): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  const stripped = text.includes('/')
    ? text
        .split('/')
        .map((part) => stripOneCancelledToken(part.trim()))
        .filter(Boolean)
        .join('/')
    : stripOneCancelledToken(text);
  return collapseIdenticalFlightLegs(stripped);
}
