import type { BillingContractAdsEquipmentRule } from './types';

/** Build inclusive YYYY-MM list from contract validity dates. */
export function yearMonthsBetween(validFrom: string, validTo: string): string[] {
  const from = String(validFrom ?? '').trim().slice(0, 10);
  const to = String(validTo ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) {
    return [];
  }

  const months: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));

  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

function sortedAircraft(rule: BillingContractAdsEquipmentRule): string[] {
  const fromList = (rule.aircraftTypes ?? [])
    .map((a) => String(a ?? '').trim().toUpperCase())
    .filter(Boolean);
  if (fromList.length > 0) return [...fromList].sort();
  const legacy = String(rule.aircraftType ?? '').trim().toUpperCase();
  return legacy ? [legacy] : [];
}

/** Identity for equipment rules ignoring calendar month (for UI collapse). */
export function adsEquipmentRuleSignature(rule: BillingContractAdsEquipmentRule): string {
  return JSON.stringify({
    serviceCode: String(rule.serviceCode ?? '').trim().toUpperCase(),
    freePerFlight: rule.freePerFlight ?? 0,
    freePerFlightNb: rule.freePerFlightNb ?? null,
    freePerFlightWb: rule.freePerFlightWb ?? null,
    alwaysChargeable: Boolean(rule.alwaysChargeable),
    includedForAds: rule.includedForAds !== false,
    unitPriceINR: rule.unitPriceINR ?? null,
    unitPriceUSD: rule.unitPriceUSD ?? null,
    uom: String(rule.uom ?? '').trim().toUpperCase() || 'EA',
    aircraftTypes: sortedAircraft(rule),
    category: String(rule.category ?? '').trim(),
    remarks: String(rule.remarks ?? '').trim(),
  });
}

/** Collapse duplicated monthly copies into one editable rule set. */
export function collapseAdsEquipmentRules(
  rules: BillingContractAdsEquipmentRule[],
): BillingContractAdsEquipmentRule[] {
  const seen = new Set<string>();
  const out: BillingContractAdsEquipmentRule[] = [];
  for (const rule of rules) {
    const signature = adsEquipmentRuleSignature(rule);
    if (seen.has(signature)) continue;
    seen.add(signature);
    out.push({
      ...rule,
      aircraftTypes: sortedAircraft(rule),
      aircraftType: undefined,
      effectiveMonth: undefined,
    });
  }
  return out;
}

/** Keep one rule row for the whole contract validity (no monthly copies). */
export function expandAdsEquipmentRulesAcrossValidity(
  rules: BillingContractAdsEquipmentRule[],
  _validFrom?: string,
  _validTo?: string,
): BillingContractAdsEquipmentRule[] {
  return collapseAdsEquipmentRules(rules)
    .filter((rule) => String(rule.serviceCode ?? '').trim().length > 0)
    .map((rule) => ({
      ...rule,
      aircraftTypes: sortedAircraft(rule),
      aircraftType:
        sortedAircraft(rule).length === 1 ? sortedAircraft(rule)[0] : undefined,
      effectiveMonth: undefined,
    }));
}
