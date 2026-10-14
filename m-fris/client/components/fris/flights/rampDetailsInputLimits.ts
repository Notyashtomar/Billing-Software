/**
 * Live digit limits for Ramp Details (Scheduled + Non-Scheduled).
 */
import { sanitizeDigits } from '@/components/fris/flights/terminalDetailsInputLimits';

export { sanitizeDigits };

export type RampDigitRule = { maxLen: number; label: string };

/** Bay / park stands & baggage — 4 digits. */
export const RAMP_BAY_BAGGAGE_RULES: Record<string, RampDigitRule> = {
  bayPlanned: { maxLen: 4, label: 'Bay Planned' },
  bayFinal: { maxLen: 4, label: 'Bay Final' },
  arrivalParkStand: { maxLen: 4, label: 'Arrival Park Stand' },
  departureParkStand: { maxLen: 4, label: 'Departure Park Stand' },
  arrivalBaggageCount: { maxLen: 4, label: 'Departure bags' },
  bagreco: { maxLen: 4, label: 'Bag reco' },
  bmaCount: { maxLen: 4, label: 'BMA Count' },
  bbaBelt: { maxLen: 4, label: 'BBA Belt' },
  arrivalBag: { maxLen: 4, label: 'Arrival Bag' },
};

/** Hold breakup — 4 digits. */
export const RAMP_HOLD_BREAKUP_RULES: Record<string, RampDigitRule> = {
  ldc: { maxLen: 4, label: 'LDC' },
  ldp: { maxLen: 4, label: 'LDP' },
  mdp: { maxLen: 4, label: 'MDP' },
};

/** Compartment five — 3 digits. */
export const RAMP_COMPARTMENT_RULES: Record<string, RampDigitRule> = {
  cgoPcsIn: { maxLen: 3, label: 'Cgo Pcs in' },
  cgoPcsOut: { maxLen: 3, label: 'Cgo Pcs Out' },
  courierPcsIn: { maxLen: 3, label: 'Courier Pcs in' },
  courierPcsOut: { maxLen: 3, label: 'Courier Pcs out' },
};

/** Cargo ULD counts — 2 digits. */
export const RAMP_ULD_RULES: Record<string, RampDigitRule> = {
  arrivalUld: { maxLen: 2, label: 'Arrival ULD' },
  depPlannedUld: { maxLen: 2, label: 'Dep planned ULD' },
  depActualUld: { maxLen: 2, label: 'Dep actual ULD' },
  transitUld: { maxLen: 2, label: 'Transit ULD' },
  arrivalNoOfULD: { maxLen: 2, label: 'Arrival ULD' },
  depPlannedNoOfULD: { maxLen: 2, label: 'Dep planned ULD' },
  depActualNoOfULD: { maxLen: 2, label: 'Dep actual ULD' },
  transitCargoNoOfULD: { maxLen: 2, label: 'Transit ULD' },
};

/** Cargo weights — 5 digits. */
export const RAMP_CARGO_WEIGHT_RULES: Record<string, RampDigitRule> = {
  arrivalCargoWeight: { maxLen: 5, label: 'Arrival cargo weight' },
  depPlannedCargoWeight: { maxLen: 5, label: 'Dep planned cargo weight' },
  depActualCargoWeight: { maxLen: 5, label: 'Dep actual cargo weight' },
  transitCargoWeight: { maxLen: 5, label: 'Transit cargo weight' },
};

/** Mail weights — 4 digits. */
export const RAMP_MAIL_WEIGHT_RULES: Record<string, RampDigitRule> = {
  arrivalMailWeight: { maxLen: 4, label: 'Arrival mail weight' },
  depPlannedMailWeight: { maxLen: 4, label: 'Dep planned mail weight' },
  depActualMailWeight: { maxLen: 4, label: 'Dep actual mail weight' },
  transitMailWeight: { maxLen: 4, label: 'Transit mail weight' },
};

export const RAMP_DIGIT_RULES: Record<string, RampDigitRule> = {
  ...RAMP_BAY_BAGGAGE_RULES,
  ...RAMP_HOLD_BREAKUP_RULES,
  ...RAMP_COMPARTMENT_RULES,
  ...RAMP_ULD_RULES,
  ...RAMP_CARGO_WEIGHT_RULES,
  ...RAMP_MAIL_WEIGHT_RULES,
};

export function sanitizeRampDigitInput(field: string, raw: string): string {
  const rule = RAMP_DIGIT_RULES[field];
  if (!rule) return raw;
  return sanitizeDigits(raw, rule.maxLen);
}

export function validateRampDigitLimit(
  field: string,
  value: string,
  labelOverride?: string,
): string | null {
  const rule = RAMP_DIGIT_RULES[field];
  if (!rule) return null;
  const v = String(value ?? '').trim();
  if (!v) return null;
  const label = labelOverride ?? rule.label;
  if (!/^\d+$/.test(v)) return `${label} must be numeric.`;
  if (v.length > rule.maxLen) {
    return `${label} must be at most ${rule.maxLen} digits.`;
  }
  return null;
}

export function rampFieldAttrs(field: string): {
  maxLength?: number;
  inputMode?: 'numeric';
} {
  const rule = RAMP_DIGIT_RULES[field];
  if (!rule) return {};
  return { maxLength: rule.maxLen, inputMode: 'numeric' };
}
