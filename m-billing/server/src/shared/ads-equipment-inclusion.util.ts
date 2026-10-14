/**
 * Contract ADS equipment inclusion & pricing — ADS usage/invoicing reads
 * tick-marked contract rules only (not Rate Cards tab ADS cards).
 */

import { sanitizeContractAircraftTypes } from './contract-aircraft-type.util';
import { normalizeFlightCategory } from '../utils/aircraft-type-match.util';
import { resolveAircraftBodyLabel } from '../utils/scheduled-flight-display.util';
import { toBillingTrackableFullName } from 'src/common/billing-trackable-equipment-name';

export type AdsEquipmentInclusionRule = {
  serviceCode?: string;
  includedForAds?: boolean;
  alwaysChargeable?: boolean;
  freePerFlight?: number;
  /** Wheelchair FOC for narrow-body flights (from advance aircraft body). */
  freePerFlightNb?: number;
  /** Wheelchair FOC for wide-body flights (from advance aircraft body). */
  freePerFlightWb?: number;
  unitPriceINR?: number;
  unitPriceUSD?: number;
  uom?: string;
  aircraftType?: string;
  aircraftTypes?: string[];
  /** Dom or Int when this free allowance applies to one sector only. */
  category?: string;
  effectiveMonth?: string;
};

export type AdsEquipmentInclusionContract = {
  adsBillingEnabled?: boolean;
  adsEquipmentRules?: AdsEquipmentInclusionRule[];
  aircraftTypes?: string[];
} | null | undefined;

export type AdsContractRuleMatch = {
  /** Rule exists for this equipment × aircraft on the contract. */
  matched: boolean;
  /** Tick box Included for ADS is off — never charge. */
  excluded: boolean;
  rule: AdsEquipmentInclusionRule | null;
};

function normalizeToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[–—]/g, '-')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactToken(value: string): string {
  return value.replace(/\s+/g, '');
}

/** Drop ADS / Scheduled / RAF wrappers so `ADS - Equipment - GPU-90KV` → `GPU-90KV`. */
function stripServiceWrapper(normalized: string): string {
  return normalized
    .replace(
      /^(ADS|SCHEDULED|NON SCHEDULED|RAF|EQUIPMENT|MANPOWER)(\s+(ADS|SCHEDULED|NON SCHEDULED|RAF|EQUIPMENT|MANPOWER))*\s+/g,
      '',
    )
    .trim();
}

function tokensMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const ca = compactToken(a);
  const cb = compactToken(b);
  if (ca && cb && ca === cb) return true;
  // Short codes (C, CK, DT, …) must be exact — `"C"` must not match `"ACU-NB"`.
  if (ca.length <= 2 || cb.length <= 2 || a.length <= 2 || b.length <= 2) {
    return false;
  }
  if (ca && cb && (ca.includes(cb) || cb.includes(ca))) return true;
  return a.includes(b) || b.includes(a);
}

/**
 * Canonical equipment family keys so contract `GPU-NB` matches FHR `GPU-90KV` /
 * `Ground Power Unit -90KV` (and WB / ACU / ASU equivalents).
 */
export function adsEquipmentFamilyKey(value: unknown): string | null {
  const raw = normalizeToken(value);
  if (!raw) return null;
  const stripped = stripServiceWrapper(raw);
  const compact = compactToken(stripped);

  const isGpu =
    /\bGPU\b/.test(stripped) ||
    compact.includes('GPU') ||
    compact.includes('GROUNDPOWER');
  if (isGpu) {
    if (
      /\bWB\b/.test(stripped) ||
      compact.includes('GPUWB') ||
      compact.includes('WIDEBODY') ||
      /180KV|280KV/.test(compact)
    ) {
      return 'GPU-WB';
    }
    if (
      /\bNB\b/.test(stripped) ||
      compact.includes('GPUNB') ||
      compact.includes('NARROWBODY') ||
      /90KV|140KV/.test(compact)
    ) {
      return 'GPU-NB';
    }
    return 'GPU';
  }

  const isAcu =
    /\bACU\b/.test(stripped) ||
    compact.includes('ACU') ||
    compact.includes('AIRCONDITION');
  if (isAcu) {
    if (
      /\bWB\b/.test(stripped) ||
      compact.includes('ACUWB') ||
      compact.includes('WIDEBODY')
    ) {
      return 'ACU-WB';
    }
    if (
      /\bNB\b/.test(stripped) ||
      compact.includes('ACUNB') ||
      compact.includes('NARROWBODY')
    ) {
      return 'ACU-NB';
    }
    return 'ACU';
  }

  const isAsu =
    /\bASU\b/.test(stripped) ||
    compact.includes('ASU') ||
    compact.includes('AIRSTART');
  if (isAsu) {
    if (
      /\bWB\b/.test(stripped) ||
      compact.includes('ASUWB') ||
      compact.includes('WIDEBODY')
    ) {
      return 'ASU-WB';
    }
    if (
      /\bNB\b/.test(stripped) ||
      compact.includes('ASUNB') ||
      compact.includes('NARROWBODY')
    ) {
      return 'ASU-NB';
    }
    return 'ASU';
  }

  return null;
}

function equipmentFamilyMatches(a: string, b: string): boolean {
  const fa = adsEquipmentFamilyKey(a);
  const fb = adsEquipmentFamilyKey(b);
  if (!fa || !fb) return false;
  if (fa === fb) return true;
  // Bare GPU/ACU/ASU matches either body class when the other side is specific.
  const base = (key: string) => key.split('-')[0];
  return (
    (fa === base(fb) || fb === base(fa)) &&
    base(fa) === base(fb)
  );
}

function ruleAircraftTypes(
  rule: AdsEquipmentInclusionRule,
  contractAircraft: string[],
): string[] {
  const multi = sanitizeContractAircraftTypes(rule.aircraftTypes ?? []);
  if (multi.length > 0) return multi;
  if (rule.aircraftType?.trim()) {
    const legacy = sanitizeContractAircraftTypes([rule.aircraftType]);
    if (legacy.length > 0) return legacy;
  }
  return sanitizeContractAircraftTypes(contractAircraft);
}

function billingFullNameMatches(a: string, b: string): boolean {
  const variants = (raw: string): Set<string> => {
    const out = new Set<string>();
    for (const kind of ['auto', 'equipment', 'manpower'] as const) {
      const full = normalizeToken(toBillingTrackableFullName(raw, kind));
      if (!full) continue;
      out.add(full);
      const compact = compactToken(full);
      if (compact) out.add(compact);
    }
    return out;
  };
  const left = variants(a);
  if (left.size === 0) return false;
  const right = variants(b);
  for (const token of left) {
    if (right.has(token)) return true;
  }
  return false;
}

function serviceMatchesRule(
  ruleCode: string,
  candidates: string[],
): boolean {
  const code = normalizeToken(ruleCode);
  if (!code) return false;
  const codeStripped = stripServiceWrapper(code);
  const normalizedCandidates = candidates
    .map((v) => normalizeToken(v))
    .filter(Boolean)
    .flatMap((c) => {
      const stripped = stripServiceWrapper(c);
      return stripped && stripped !== c ? [c, stripped] : [c];
    });

  return normalizedCandidates.some(
    (c) =>
      tokensMatch(c, code) ||
      tokensMatch(c, codeStripped) ||
      billingFullNameMatches(c, code) ||
      billingFullNameMatches(c, codeStripped) ||
      equipmentFamilyMatches(c, code) ||
      equipmentFamilyMatches(c, codeStripped),
  );
}

/** True when two equipment / service labels refer to the same ADS equipment family. */
export function adsEquipmentLabelsMatch(left: string, right: string): boolean {
  return serviceMatchesRule(left, [right]);
}

/** Wheelchair ADS services (WCH / WCHR / WCHS / WCHC and catalog labels). */
export function isWheelchairAdsServiceCode(...values: unknown[]): boolean {
  return values.some((value) => {
    const raw = normalizeToken(value);
    if (!raw) return false;
    const compact = compactToken(raw);
    if (/\bWCH[RSC]?\b/.test(raw)) return true;
    if (
      compact === 'WCH' ||
      compact.includes('WCHR') ||
      compact.includes('WCHS') ||
      compact.includes('WCHC')
    ) {
      return true;
    }
    return raw.includes('WHEEL CHAIR') || raw.includes('WHEELCHAIR');
  });
}

function normalizeAircraftBody(value: unknown): 'NB' | 'WB' | '' {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'NB' || raw.includes('NARROW')) return 'NB';
  if (raw === 'WB' || raw.includes('WIDE')) return 'WB';
  return '';
}

function nonNegInt(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/**
 * Free allowance for a matched ADS rule.
 * Wheelchair rules may carry separate NB / WB FOC; body comes from advance.
 * Falls back to legacy `freePerFlight` when body-specific value is unset.
 */
export function resolveAdsFreePerFlightForRule(
  rule: AdsEquipmentInclusionRule,
  opts?: {
    aircraftBody?: string;
    serviceCode?: string;
    particular?: string;
    equipmentName?: string;
  },
): number {
  const wheelchair = isWheelchairAdsServiceCode(
    rule.serviceCode,
    opts?.serviceCode,
    opts?.particular,
    opts?.equipmentName,
  );
  const body = normalizeAircraftBody(opts?.aircraftBody);
  if (wheelchair) {
    if (body === 'NB') {
      const nb = nonNegInt(rule.freePerFlightNb);
      if (nb != null) return nb;
    }
    if (body === 'WB') {
      const wb = nonNegInt(rule.freePerFlightWb);
      if (wb != null) return wb;
    }
  }
  return nonNegInt(rule.freePerFlight) ?? 0;
}

function aircraftMatchesRule(ruleAircraft: string[], flightAircraft: string): boolean {
  if (ruleAircraft.length === 0) return true;
  const flight = normalizeToken(flightAircraft);
  if (!flight) return true;
  return ruleAircraft.some((ac) => tokensMatch(flight, ac));
}

function ruleHasUnitPrice(rule: AdsEquipmentInclusionRule): boolean {
  const inr = Number(rule.unitPriceINR);
  const usd = Number(rule.unitPriceUSD);
  return (Number.isFinite(inr) && inr > 0) || (Number.isFinite(usd) && usd > 0);
}

function findMatchingAdsRules(
  contract: AdsEquipmentInclusionContract,
  opts: {
    serviceCode?: string;
    particular?: string;
    equipmentName?: string;
    aircraftType?: string;
    /** Ignored — ADS lines follow contract priceValidFrom / priceValidTo. */
    effectiveMonth?: string;
  },
): AdsEquipmentInclusionRule[] {
  if (!contract) return [];
  const rules = contract.adsEquipmentRules ?? [];
  if (rules.length === 0) return [];

  const contractAircraft = sanitizeContractAircraftTypes(contract.aircraftTypes ?? []);
  const candidates = [
    String(opts.serviceCode ?? ''),
    String(opts.particular ?? ''),
    String(opts.equipmentName ?? ''),
  ].filter((v) => v.trim());
  const aircraftType = String(opts.aircraftType ?? '');

  return rules.filter((rule) => {
    if (!serviceMatchesRule(String(rule.serviceCode ?? ''), candidates)) {
      return false;
    }
    const aircraft = ruleAircraftTypes(rule, contractAircraft);
    return aircraftMatchesRule(aircraft, aircraftType);
  });
}

function adsRuleSector(rule: AdsEquipmentInclusionRule): 'Dom' | 'Int' | '' {
  const category = normalizeFlightCategory(String(rule.category ?? ''));
  return category === 'Dom' || category === 'Int' ? category : '';
}

/** When Dom and Int rules both match, keep the departure sector's rule. */
function preferAdsRulesForFlightCategory(
  rules: AdsEquipmentInclusionRule[],
  flightCategory: string | undefined,
): AdsEquipmentInclusionRule[] {
  const sector = normalizeFlightCategory(String(flightCategory ?? ''));
  if (sector !== 'Dom' && sector !== 'Int') return rules;
  const exact = rules.filter((rule) => adsRuleSector(rule) === sector);
  if (exact.length > 0) return exact;
  const unscoped = rules.filter((rule) => adsRuleSector(rule) === '');
  return unscoped.length > 0 ? unscoped : rules;
}

/**
 * Match contract ADS equipment rules for a usage row (airline × validity contract).
 * Prefer an excluded rule if any match; else the first included tick-marked rule.
 */
export function matchAdsEquipmentContractRule(
  contract: AdsEquipmentInclusionContract,
  opts: {
    serviceCode?: string;
    particular?: string;
    equipmentName?: string;
    aircraftType?: string;
    effectiveMonth?: string;
    /** Flight category. Departure sector is used when the label is split. */
    flightCategory?: string;
  },
): AdsContractRuleMatch {
  const matches = preferAdsRulesForFlightCategory(
    findMatchingAdsRules(contract, opts),
    opts.flightCategory,
  );
  if (matches.length === 0) {
    return { matched: false, excluded: false, rule: null };
  }
  const excluded = matches.find((r) => r.includedForAds === false);
  if (excluded) {
    return { matched: true, excluded: true, rule: excluded };
  }
  const included = matches.filter((r) => r.includedForAds !== false);
  const priced = included.filter(ruleHasUnitPrice);
  const rule = priced[priced.length - 1] ?? included[included.length - 1] ?? matches[0];
  return { matched: true, excluded: false, rule: rule ?? null };
}

/**
 * True when contract ADS rules explicitly exclude this equipment × aircraft
 * from ADS charging (`includedForAds === false`).
 */
export function isAdsEquipmentExcludedByContract(
  contract: AdsEquipmentInclusionContract,
  opts: {
    serviceCode?: string;
    particular?: string;
    equipmentName?: string;
    aircraftType?: string;
    effectiveMonth?: string;
  },
): boolean {
  return matchAdsEquipmentContractRule(contract, opts).excluded;
}

export type AdsContractRulePricing = {
  matched: boolean;
  excluded: boolean;
  alwaysChargeable: boolean;
  freePerFlight: number;
  unitPrice: number | null;
  uom: string;
  serviceCode: string;
};

/**
 * Price ADS usage from the tick-marked contract rule only (not Rate Cards tab).
 */
export function resolveAdsPricingFromContractRule(
  contract: AdsEquipmentInclusionContract,
  opts: {
    serviceCode?: string;
    particular?: string;
    equipmentName?: string;
    aircraftType?: string;
    /** Advance / FHR aircraft body (`NB` | `WB`) for wheelchair FOC. */
    aircraftBody?: string;
    flightCategory?: string;
    billingCurrency?: 'INR' | 'USD' | string;
    effectiveMonth?: string;
  },
): AdsContractRulePricing {
  const match = matchAdsEquipmentContractRule(contract, opts);
  if (!match.matched || !match.rule) {
    return {
      matched: false,
      excluded: false,
      alwaysChargeable: false,
      freePerFlight: 0,
      unitPrice: null,
      uom: 'Per Service',
      serviceCode: String(opts.serviceCode ?? opts.particular ?? '').trim(),
    };
  }

  const rule = match.rule;
  const uom = String(rule.uom ?? 'EA').trim() || 'EA';
  const alwaysChargeable = Boolean(rule.alwaysChargeable);
  const aircraftBody =
    normalizeAircraftBody(opts.aircraftBody) ||
    normalizeAircraftBody(
      resolveAircraftBodyLabel({}, String(opts.aircraftType ?? '').trim(), null),
    );
  const freeRaw = resolveAdsFreePerFlightForRule(rule, {
    aircraftBody,
    serviceCode: opts.serviceCode,
    particular: opts.particular,
    equipmentName: opts.equipmentName,
  });
  const freePerFlight = alwaysChargeable || match.excluded ? 0 : freeRaw;

  const currency = String(opts.billingCurrency ?? 'INR').toUpperCase();
  const inr =
    rule.unitPriceINR != null && Number.isFinite(Number(rule.unitPriceINR))
      ? Number(rule.unitPriceINR)
      : null;
  const usd =
    rule.unitPriceUSD != null && Number.isFinite(Number(rule.unitPriceUSD))
      ? Number(rule.unitPriceUSD)
      : null;
  let unitPrice: number | null = null;
  if (currency === 'USD') {
    unitPrice = usd != null && usd > 0 ? usd : inr != null && inr > 0 ? inr : null;
  } else {
    unitPrice = inr != null && inr > 0 ? inr : usd != null && usd > 0 ? usd : null;
  }

  return {
    matched: true,
    excluded: match.excluded,
    alwaysChargeable,
    freePerFlight,
    unitPrice: match.excluded ? 0 : unitPrice,
    uom,
    serviceCode: String(rule.serviceCode ?? opts.serviceCode ?? '').trim(),
  };
}
