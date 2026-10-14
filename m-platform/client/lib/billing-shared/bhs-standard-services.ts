import type { BillingServiceCatalogItem } from './types';
import { defaultUomForPriceCardReference } from './price-card-references';
import { inferCatalogMeta } from './service-catalog-labels';

/** One row on the Chennai BHS price card (columns F–R) — service list only, no unit price. */
export type BhsStandardServiceTemplate = {
  /** Price-card column label (for messages). */
  column: string;
  billingReference: string;
  /** Preferred catalog codes, first match wins. */
  serviceCodeCandidates: readonly string[];
  /** Fallback when no candidate exists in catalog. */
  catalogPattern?: RegExp;
};

/**
 * Standard BHS ancillary services from the price card (columns F–R).
 * The fixed BHS package (columns D/E) lives on the price-card airline row, not here.
 */
export const BHS_STANDARD_SERVICE_TEMPLATE: readonly BhsStandardServiceTemplate[] = [
  {
    column: 'WCHR',
    billingReference: 'PU',
    serviceCodeCandidates: ['Scheduled Flight - WCHR', 'PU-WCHR-S'],
  },
  {
    column: 'WCHS',
    billingReference: 'PU',
    serviceCodeCandidates: ['Scheduled Flight - WCHS', 'PU-WCHS'],
  },
  {
    column: 'WCHC',
    billingReference: 'PU',
    serviceCodeCandidates: ['Scheduled Flight - WCHC', 'PU-WCHC'],
  },
  {
    column: 'WS',
    billingReference: 'PS',
    serviceCodeCandidates: ['PS-WS'],
    catalogPattern: /\bws\b|water service/i,
  },
  {
    column: 'TS',
    billingReference: 'PS',
    serviceCodeCandidates: ['PS-TS', 'Scheduled - Equipment - TS'],
  },
  {
    column: 'GPU',
    billingReference: 'PH',
    serviceCodeCandidates: ['PH-GPU'],
    catalogPattern: /^Scheduled - Equipment - GPU/i,
  },
  {
    column: 'ACU',
    billingReference: 'PH',
    serviceCodeCandidates: ['PH-ACU', 'Scheduled - Equipment - ACU'],
  },
  {
    column: 'BC',
    billingReference: 'PH',
    serviceCodeCandidates: ['PH-BC', 'Scheduled - Manpower - BC'],
  },
  {
    column: 'ASU',
    billingReference: 'PST',
    serviceCodeCandidates: ['PST-ASU', 'Scheduled - Equipment - ASU-NB', 'Scheduled - Equipment - ASU-WB'],
  },
  {
    column: 'Push Back',
    billingReference: 'PP',
    serviceCodeCandidates: ['PP-PUSHBACK', 'Scheduled - Equipment - PBNB', 'Scheduled - Equipment - PBWB'],
  },
  {
    column: 'Towing',
    billingReference: 'PTOW',
    serviceCodeCandidates: ['PTOW', 'Scheduled - Equipment - Tow', 'Scheduled Flight - Tow'],
  },
  {
    column: 'PSL',
    billingReference: 'PU',
    serviceCodeCandidates: ['PU-PSL', 'Scheduled - Equipment - PSL-Towable', 'Scheduled - Equipment - MPSL'],
  },
  {
    column: 'AMB',
    billingReference: 'PS',
    serviceCodeCandidates: ['PS-AMB', 'Scheduled - Equipment - AMB'],
  },
];

export type ResolvedBhsStandardService = {
  column: string;
  serviceCode: string;
  billingReference: string;
  uom: string;
};

function catalogCodeSet(services: BillingServiceCatalogItem[]): Set<string> {
  return new Set(services.map((s) => s.serviceCode));
}

function resolveOne(
  template: BhsStandardServiceTemplate,
  codes: Set<string>,
  services: BillingServiceCatalogItem[],
): ResolvedBhsStandardService | null {
  for (const candidate of template.serviceCodeCandidates) {
    if (codes.has(candidate)) {
      const catalog = services.find((s) => s.serviceCode === candidate);
      return {
        column: template.column,
        serviceCode: candidate,
        billingReference: template.billingReference,
        uom:
          defaultUomForPriceCardReference(template.billingReference) ??
          catalog?.uom ??
          inferCatalogMeta(candidate).uom,
      };
    }
  }

  if (template.catalogPattern) {
    const match = services.find((s) => template.catalogPattern!.test(s.serviceCode));
    if (match) {
      return {
        column: template.column,
        serviceCode: match.serviceCode,
        billingReference: template.billingReference,
        uom:
          defaultUomForPriceCardReference(template.billingReference) ??
          match.uom ??
          inferCatalogMeta(match.serviceCode).uom,
      };
    }
  }

  return null;
}

/** Map the 13 price-card columns to catalog service codes available at this station. */
export function resolveBhsStandardServices(
  services: BillingServiceCatalogItem[],
): { resolved: ResolvedBhsStandardService[]; missing: string[] } {
  const codes = catalogCodeSet(services);
  const resolved: ResolvedBhsStandardService[] = [];
  const missing: string[] = [];

  for (const template of BHS_STANDARD_SERVICE_TEMPLATE) {
    const item = resolveOne(template, codes, services);
    if (item) resolved.push(item);
    else missing.push(template.column);
  }

  return { resolved, missing };
}
