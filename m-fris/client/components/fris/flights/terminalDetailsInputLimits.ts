/**
 * Live input limits + save-time checks for Terminal Details
 * (Scheduled + Non-Scheduled Main Details open forms).
 */

export function sanitizeDigits(raw: string, maxLen: number): string {
  return String(raw ?? '')
    .replace(/\D/g, '')
    .slice(0, Math.max(0, maxLen));
}

/** A–Z / 0–9 only, uppercased, capped length (e.g. Gate Planned / Gate Final). */
export function sanitizeAlphanumeric(raw: string, maxLen: number): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, Math.max(0, maxLen));
}

export type TerminalInputKind = 'digits' | 'alphanumeric';

export type TerminalInputRule = {
  kind: TerminalInputKind;
  maxLen: number;
  label: string;
};

/** Canonical field keys used by both forms (NS maps offloadPax → offLoadPax). */
export const TERMINAL_INPUT_RULES: Record<string, TerminalInputRule> = {
  igm: { kind: 'digits', maxLen: 8, label: 'IGM' },
  egm: { kind: 'digits', maxLen: 8, label: 'EGM' },
  dpr: { kind: 'digits', maxLen: 8, label: 'DPR' },
  ohd: { kind: 'digits', maxLen: 8, label: 'OHD' },
  offLoadPax: { kind: 'digits', maxLen: 8, label: 'Off load Pax' },
  offloadPax: { kind: 'digits', maxLen: 8, label: 'Off load Pax' },
  ahl: { kind: 'digits', maxLen: 8, label: 'AHL' },
  gatePlanned: { kind: 'alphanumeric', maxLen: 6, label: 'Gate Planned' },
  gateFinal: { kind: 'alphanumeric', maxLen: 6, label: 'Gate Final' },
  systemBagCount: { kind: 'digits', maxLen: 5, label: 'System Bag Count' },
  beltNo: { kind: 'digits', maxLen: 4, label: 'Belt No' },
  passengerArrived: { kind: 'digits', maxLen: 4, label: 'Arrived Pax' },
  departed: { kind: 'digits', maxLen: 8, label: 'Departed Pax' },
  transit: { kind: 'digits', maxLen: 2, label: 'Transit' },
  cabinBreakupF: { kind: 'digits', maxLen: 4, label: 'Cabin Break-up [F]' },
  cabinC: { kind: 'digits', maxLen: 4, label: 'Cabin Break-up [C]' },
  cabinY: { kind: 'digits', maxLen: 4, label: 'Cabin Break-up [Y]' },
  cabinBreakupC: { kind: 'digits', maxLen: 4, label: 'Cabin Break-up [C]' },
  cabinBreakupY: { kind: 'digits', maxLen: 4, label: 'Cabin Break-up [Y]' },
  arrivalWheelChairR: { kind: 'digits', maxLen: 2, label: 'Arrival Wheel Chair [R]' },
  arrivalWheelChairS: { kind: 'digits', maxLen: 2, label: 'Arrival Wheel Chair [S]' },
  arrivalWheelChairC: { kind: 'digits', maxLen: 2, label: 'Arrival Wheel Chair [C]' },
  arrivalWheelChairExtra: {
    kind: 'digits',
    maxLen: 2,
    label: 'Additional arrival wheelchairs',
  },
  departureWheelChairR: { kind: 'digits', maxLen: 2, label: 'Departure Wheel Chair [R]' },
  departureWheelChairS: { kind: 'digits', maxLen: 2, label: 'Departure Wheel Chair [S]' },
  departureWheelChairC: { kind: 'digits', maxLen: 2, label: 'Departure Wheel Chair [C]' },
  departureWheelChairExtra: {
    kind: 'digits',
    maxLen: 2,
    label: 'Additional departure wheelchairs',
  },
};

export function sanitizeTerminalInput(field: string, raw: string): string {
  const rule = TERMINAL_INPUT_RULES[field];
  if (!rule) return raw;
  return rule.kind === 'digits'
    ? sanitizeDigits(raw, rule.maxLen)
    : sanitizeAlphanumeric(raw, rule.maxLen);
}

/** Save-time check when value is present. Empty stays allowed. */
export function validateTerminalInputLimit(
  field: string,
  value: string,
  labelOverride?: string,
): string | null {
  const rule = TERMINAL_INPUT_RULES[field];
  if (!rule) return null;
  const v = String(value ?? '').trim();
  if (!v) return null;
  const label = labelOverride ?? rule.label;
  if (rule.kind === 'digits') {
    if (!/^\d+$/.test(v)) return `${label} must be numeric.`;
    if (v.length > rule.maxLen) {
      return `${label} must be at most ${rule.maxLen} digits.`;
    }
    return null;
  }
  if (!/^[A-Za-z0-9]+$/.test(v)) {
    return `${label} may only contain letters and numbers.`;
  }
  if (v.length > rule.maxLen) {
    return `${label} must be at most ${rule.maxLen} characters.`;
  }
  return null;
}
