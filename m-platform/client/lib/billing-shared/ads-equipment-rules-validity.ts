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
export function adsEquipmentIdentity(serviceCode: string | undefined | null): string {
  return String(serviceCode ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Identity for equipment rules ignoring calendar month (for UI collapse). */
export function adsEquipmentRuleSignature(rule: BillingContractAdsEquipmentRule): string {
  return JSON.stringify({
    serviceCode: adsEquipmentIdentity(rule.serviceCode),
    freePerFlight: rule.freePerFlight ?? 0,
    freePerFlightNb: rule.freePerFlightNb ?? null,
    freePerFlightWb: rule.freePerFlightWb ?? null,
    alwaysChargeable: Boolean(rule.alwaysChargeable),
    includedForAds: rule.includedForAds !== false,
    unitPriceINR: rule.unitPriceINR ?? null,
    unitPriceUSD: rule.unitPriceUSD ?? null,
    uom: String(rule.uom ?? '').trim().toUpperCase() || 'EA',
    aircraftTypes: sortedAircraft(rule),
  });
}

function isBothCategory(rule: BillingContractAdsEquipmentRule): boolean {
  return /^both$/i.test(String(rule.category ?? '').trim());
}

function mergeAircraft(
  rules: BillingContractAdsEquipmentRule[],
): string[] {
  const aircraft = new Set<string>();
  for (const rule of rules) {
    for (const code of sortedAircraft(rule)) aircraft.add(code);
  }
  return [...aircraft].sort();
}

/**
 * One row per equipment. Domestic / international / both copies of the same
 * service collapse together. When prices differ, the "Both" copy wins, then
 * the later copy.
 */
function collapseSameEquipment(
  rules: BillingContractAdsEquipmentRule[],
): BillingContractAdsEquipmentRule {
  let chosen = rules[0]!;
  for (const rule of rules.slice(1)) {
    const chosenBoth = isBothCategory(chosen);
    const ruleBoth = isBothCategory(rule);
    if (ruleBoth && !chosenBoth) chosen = rule;
    else if (ruleBoth === chosenBoth) chosen = rule;
  }
  return {
    ...chosen,
    aircraftTypes: mergeAircraft(rules),
    aircraftType: undefined,
    category: undefined,
    effectiveMonth: undefined,
  };
}

/** Collapse duplicated monthly copies into one editable rule set. */
export function collapseAdsEquipmentRules(
  rules: BillingContractAdsEquipmentRule[],
): BillingContractAdsEquipmentRule[] {
  const groups = new Map<string, BillingContractAdsEquipmentRule[]>();
  const order: string[] = [];
  rules.forEach((rule, index) => {
    const identity = adsEquipmentIdentity(rule.serviceCode);
    const key = identity || `blank:${index}`;
    const list = groups.get(key);
    if (list) {
      list.push(rule);
      return;
    }
    groups.set(key, [rule]);
    order.push(key);
  });
  return order.map((key) => collapseSameEquipment(groups.get(key)!));
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
