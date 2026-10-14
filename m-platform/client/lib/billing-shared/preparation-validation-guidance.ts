import type { ValidationResult } from './types';
import {
  buildContractsFixHref,
  buildOperationalSourceFixHref,
  buildPreparationRuleFixHref,
  buildRateCardsFixHref,
  buildScheduledAirlinesFixHref,
} from './preparation-fix-links';
import { formatBillingDate, formatBillingDateRange } from './billing-date-format';

export interface ValidationGuidanceContext {
  sourceType?: string;
  customerCode?: string;
  customerName?: string;
  serviceCode?: string;
  serialNo?: string;
  flightNo?: string;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  stationCode?: string;
  atdDate?: string | Date | null;
  staDate?: string | null;
  stdDate?: string | null;
  ataDate?: string | null;
  aircraftType?: string | null;
  operationalAirlineName?: string | null;
}

export interface ValidationMissingDetail {
  label: string;
  value: string;
  emphasize?: boolean;
}

export interface ValidationGuidance {
  title: string;
  description: string;
  fixHref?: string;
  fixLabel?: string;
  missingDetails?: ValidationMissingDetail[];
  hoverHint?: string;
}

/** Display order: operational → contract/rate → invoice line amount. */
export const VALIDATION_RULE_SORT_ORDER: string[] = [
  'serial_positive_integer',
  'not_cancelled',
  'atd_present',
  'duplicate_billing',
  'customer_code',
  'flight_number',
  'category_of_flight',
  'contract_match',
  'contract_linked',
  'rate_match',
  'rate_card_linked',
  'service_code',
  'unit_price',
  'currency',
  'quantity',
  'ceiling_rate',
  'billing_period',
  'line_amount_excl_tax',
  'line_amount_incl_tax_est',
  'currency_error',
  'tax_error',
  'finance_rejected',
];

export function sortValidationResults<T extends { rule: string }>(results: T[]): T[] {
  const order = new Map(VALIDATION_RULE_SORT_ORDER.map((rule, index) => [rule, index]));
  return [...results].sort((a, b) => {
    const ai = order.get(a.rule) ?? 999;
    const bi = order.get(b.rule) ?? 999;
    if (ai !== bi) return ai - bi;
    return a.rule.localeCompare(b.rule);
  });
}

const DEFAULT_SERVICE_CODE_BY_SOURCE: Record<string, string> = {
  scheduled_flight: 'Scheduled Flight',
  cleaning: 'Scheduled - Equipment - Cabin Cleaning',
  raf: 'Deep Cleaning',
  maas: 'MAAS',
  non_scheduled: 'Non Scheduled Flight',
  xxld: 'Cancel Scheduled Flight',
};

const OPERATIONAL_SOURCE_PAGES: Record<string, { href: string; label: string }> = {
  scheduled_flight: { href: '/billing/scheduled-flights', label: 'Scheduled Flights (billing)' },
  equipment: { href: '/billing/equipment', label: 'Equipment (billing)' },
  cleaning: { href: '/billing/cleaning', label: 'Cleaning (billing)' },
  raf: { href: '/billing/raf', label: 'RAF (billing)' },
  maas: { href: '/billing/maas', label: 'MAAS (billing)' },
  ads: { href: '/billing/ads', label: 'ADS (billing)' },
  xxld: { href: '/billing/xxld-scheduled', label: 'XXLD Scheduled (billing)' },
  manpower: { href: '/billing/manpower', label: 'Manpower (billing)' },
  non_scheduled: { href: '/billing/non-scheduled', label: 'Non-Scheduled (billing)' },
};

function formatPeriod(start?: string, end?: string): string {
  return formatBillingDateRange(start, end, { empty: '', separator: ' to ' });
}

function formatDate(value?: string | Date | null): string {
  return formatBillingDate(value, '');
}

function formatSourceType(sourceType?: string): string {
  if (!sourceType) return '';
  return sourceType.replace(/_/g, ' ');
}

function isAdsSourceType(sourceType?: string): boolean {
  const t = String(sourceType ?? '').trim().toLowerCase();
  return t === 'ads' || t === 'equipment' || t === 'manpower';
}

export function resolveServiceCode(ctx: ValidationGuidanceContext): string | undefined {
  const explicit = ctx.serviceCode?.trim();
  if (explicit) return explicit;
  if (!ctx.sourceType) return undefined;
  return DEFAULT_SERVICE_CODE_BY_SOURCE[ctx.sourceType];
}

function isGenericServerMessage(rule: string, message?: string): boolean {
  if (!message?.trim()) return true;
  const genericByRule: Record<string, string[]> = {
    rate_match: ['No rate card for service code', 'No rate card for service'],
    contract_match: [
      'No active contract for customer and period',
      'No active contract',
    ],
  };
  return genericByRule[rule]?.includes(message.trim()) ?? false;
}

function customerLabel(ctx: ValidationGuidanceContext): string {
  const code = ctx.customerCode?.trim();
  if (!code) return 'the customer';
  return ctx.customerName ? `${code} (${ctx.customerName})` : code;
}

function operationalFix(ctx: ValidationGuidanceContext): { href: string; label: string } {
  if (ctx.sourceType === 'scheduled_flight') {
    return {
      href: buildScheduledAirlinesFixHref(ctx),
      label: 'Open Scheduled Flights in FRIS',
    };
  }
  const href = buildOperationalSourceFixHref(ctx);
  const page = OPERATIONAL_SOURCE_PAGES[ctx.sourceType ?? ''];
  return {
    href,
    label: page?.label ?? 'Billing dashboard',
  };
}

export function getOperationalSourceLink(
  ctx: ValidationGuidanceContext,
): { href: string; label: string } {
  return operationalFix(ctx);
}

export function getBillingSourceLink(
  ctx: ValidationGuidanceContext,
): { href: string; label: string } | null {
  if (!ctx.sourceType) return null;
  const page = OPERATIONAL_SOURCE_PAGES[ctx.sourceType];
  if (!page) return null;
  const params = new URLSearchParams();
  if (ctx.customerCode) params.set('customer', ctx.customerCode);
  if (ctx.billingPeriodStart) params.set('from', String(ctx.billingPeriodStart).slice(0, 10));
  if (ctx.billingPeriodEnd) params.set('to', String(ctx.billingPeriodEnd).slice(0, 10));
  const qs = params.toString();
  return {
    href: qs ? `${page.href}?${qs}` : page.href,
    label: page.label,
  };
}

function buildMissingDetails(
  rule: string,
  ctx: ValidationGuidanceContext,
): ValidationMissingDetail[] {
  const details: ValidationMissingDetail[] = [];
  const push = (label: string, value?: string | null, emphasize = false) => {
    const trimmed = value?.trim();
    if (trimmed) details.push({ label, value: trimmed, emphasize });
  };

  const period = formatPeriod(ctx.billingPeriodStart, ctx.billingPeriodEnd);
  const service = resolveServiceCode(ctx);

  switch (rule) {
    case 'rate_match':
    case 'ceiling_rate':
      push('Service code', service, true);
      push('Customer', ctx.customerCode, true);
      push('Customer name', ctx.customerName);
      push('Station', ctx.stationCode);
      push('Serial', ctx.serialNo);
      push('Flight no.', ctx.flightNo);
      push('ATD date', formatDate(ctx.atdDate), true);
      push('Billing period', period);
      push('Source', formatSourceType(ctx.sourceType));
      break;

    case 'contract_match':
      push('Customer', ctx.customerCode, true);
      push('Customer name', ctx.customerName);
      push('Station', ctx.stationCode);
      push('Serial', ctx.serialNo);
      push('Flight no.', ctx.flightNo);
      push('ATD date', formatDate(ctx.atdDate));
      push('Billing period', period, true);
      push('Source', formatSourceType(ctx.sourceType));
      break;

    case 'serial_positive_integer':
    case 'not_cancelled':
    case 'atd_present':
      push('Serial', ctx.serialNo, true);
      push('Flight no.', ctx.flightNo);
      push('Customer', ctx.customerCode);
      push('ATD date', formatDate(ctx.atdDate), rule === 'atd_present');
      push('Station', ctx.stationCode);
      push('Source', formatSourceType(ctx.sourceType));
      break;

    case 'duplicate_billing':
      push('Serial', ctx.serialNo, true);
      push('Customer', ctx.customerCode);
      push('Billing period', period, true);
      push('Source', formatSourceType(ctx.sourceType));
      break;

    default:
      break;
  }

  return details;
}

function guidanceForRule(
  rule: string,
  ctx: ValidationGuidanceContext,
  serverMessage?: string,
  passed = false,
): ValidationGuidance {
  const period = formatPeriod(ctx.billingPeriodStart, ctx.billingPeriodEnd);
  const customer = customerLabel(ctx);
  const serial = ctx.serialNo?.trim();
  const service = resolveServiceCode(ctx) ?? 'the required service code';
  const ops = operationalFix(ctx);
  const useServerMessage = (rule: string, fallback: string) =>
    serverMessage && !isGenericServerMessage(rule, serverMessage)
      ? serverMessage
      : fallback;

  switch (rule) {
    case 'serial_positive_integer':
      return {
        title: passed ? 'Valid flight serial' : 'Valid flight serial required',
        description:
          serverMessage ??
          (serial
            ? `Serial "${serial}" is missing or invalid. Billing needs a positive numeric serial from operational data.`
            : 'Billing needs a positive numeric flight serial from operational data.'),
        fixHref: passed ? undefined : ops.href,
        fixLabel: passed ? undefined : ops.label,
      };

    case 'not_cancelled':
      return {
        title: passed ? 'Flight is billable (not cancelled)' : 'Flight must not be cancelled',
        description:
          serverMessage ??
          (serial
            ? `Flight serial ${serial} is marked cancelled and cannot be invoiced.`
            : 'This flight is marked cancelled and cannot be invoiced.'),
        fixHref: passed ? undefined : ops.href,
        fixLabel: passed ? undefined : ops.label,
      };

    case 'atd_present':
      return {
        title: passed ? 'ATD date confirmed' : 'Actual time of departure (ATD) required',
        description:
          serverMessage ??
          (serial
            ? `Flight serial ${serial} has no ATD date. Enter ATD in operational data before billing.`
            : 'ATD date is required for the invoicing window.'),
        fixHref: passed ? undefined : ops.href,
        fixLabel: passed ? undefined : ops.label,
      };

    case 'contract_match':
      return {
        title: passed ? 'Active contract matched' : 'Active contract missing',
        description: useServerMessage(
          'contract_match',
          `No active contract found for ${customer}${period ? ` covering ${period}` : ''}.`,
        ),
        fixHref: passed ? undefined : buildContractsFixHref(ctx),
        fixLabel: passed ? undefined : 'Contracts — add or verify coverage',
      };

    case 'rate_match': {
      const isAds = isAdsSourceType(ctx.sourceType);
      return {
        title: passed
          ? isAds
            ? 'Contract ADS rate matched'
            : 'Rate card matched'
          : isAds
            ? 'Contract ADS rate missing'
            : 'Rate card missing',
        description: useServerMessage(
          'rate_match',
          isAds
            ? `No matching ADS equipment rule on the contract for ${customer} and "${service}"${period ? ` covering ${period}` : ''}. Check equipment name/aliases, aircraft, Included for ADS, and unit price.`
            : `No rate card for ${customer} and service "${service}"${period ? ` covering ${period}` : ''}.`,
        ),
        fixHref: passed
          ? undefined
          : isAds
            ? buildContractsFixHref(ctx)
            : buildRateCardsFixHref(ctx),
        fixLabel: passed
          ? undefined
          : isAds
            ? 'Contracts — ADS equipment rules'
            : 'Rate Cards — add matching rate',
      };
    }

    case 'ceiling_rate':
      return {
        title: passed ? 'Unit price within ceiling' : 'Unit price exceeds ceiling rate',
        description:
          serverMessage ??
          `The matched rate exceeds the allowed ceiling. Lower the unit price or raise the ceiling on the rate card for "${service}".`,
        fixHref: passed ? undefined : buildRateCardsFixHref(ctx),
        fixLabel: passed ? undefined : 'Rate Cards — edit ceiling or price',
      };

    case 'customer_code':
      return {
        title: passed ? 'Customer code verified' : 'Customer code missing',
        description: serverMessage ?? 'Customer code is required on the invoice line.',
        fixHref: passed ? undefined : '/billing/customers',
        fixLabel: passed ? undefined : 'Customers — verify master',
      };

    case 'flight_number':
      return {
        title: passed ? 'Flight number verified' : 'Flight number missing',
        description:
          serverMessage ?? 'Flight number is required for invoice line description and audit.',
        fixHref: passed ? undefined : ops.href,
        fixLabel: passed ? undefined : ops.label,
      };

    case 'service_code':
      return {
        title: passed ? 'Service code verified' : 'Service code missing',
        description: serverMessage ?? 'Service code from the matched rate card is required.',
        fixHref: passed ? undefined : buildRateCardsFixHref(ctx),
        fixLabel: passed ? undefined : 'Rate Cards — verify service code',
      };

    case 'unit_price': {
      const isAds = isAdsSourceType(ctx.sourceType);
      return {
        title: passed ? 'Unit price verified' : 'Unit price missing or zero',
        description:
          serverMessage ??
          (isAds
            ? 'Set unit price INR/USD on the contract ADS equipment rule for this equipment.'
            : 'Unit price must be greater than zero to compute line amount.'),
        fixHref: passed
          ? undefined
          : isAds
            ? buildContractsFixHref(ctx)
            : buildRateCardsFixHref(ctx),
        fixLabel: passed
          ? undefined
          : isAds
            ? 'Contracts — ADS equipment rules'
            : 'Rate Cards — set unit price',
      };
    }

    case 'currency':
      return {
        title: passed ? 'Billing currency verified' : 'Billing currency missing',
        description: serverMessage ?? 'Invoice currency must be INR or USD.',
        fixHref: passed ? undefined : '/billing/customers',
        fixLabel: passed ? undefined : 'Customers — set billing currency',
      };

    case 'quantity':
      return {
        title: 'Billable quantity',
        description: serverMessage ?? 'One billable movement per scheduled flight line.',
      };

    case 'category_of_flight':
      return {
        title: passed ? 'Dom/Int category verified' : 'Flight category (Dom/Int) missing',
        description:
          serverMessage ?? 'Category of flight is required to confirm the correct rate tier.',
        fixHref: passed ? undefined : ops.href,
        fixLabel: passed ? undefined : ops.label,
      };

    case 'billing_period':
      return {
        title: passed ? 'Billing period verified' : 'Billing period missing',
        description: serverMessage ?? 'Billing period start and end dates are required on the invoice.',
      };

    case 'contract_linked':
      return {
        title: passed ? 'Contract linked on row' : 'Contract not linked',
        description: serverMessage ?? 'Preparation row must reference the matched contract.',
        fixHref: passed ? undefined : buildContractsFixHref(ctx),
        fixLabel: passed ? undefined : 'Contracts — verify linkage',
      };

    case 'rate_card_linked': {
      const isAds = isAdsSourceType(ctx.sourceType);
      return {
        title: passed
          ? isAds
            ? 'Contract ADS rate applied'
            : 'Rate card linked on row'
          : isAds
            ? 'Contract ADS rate not applied'
            : 'Rate card not linked',
        description:
          serverMessage ??
          (isAds
            ? 'Preparation row needs a matched contract ADS equipment rate (not Rate Cards tab).'
            : 'Preparation row must reference the matched rate card.'),
        fixHref: passed
          ? undefined
          : isAds
            ? buildContractsFixHref(ctx)
            : buildRateCardsFixHref(ctx),
        fixLabel: passed
          ? undefined
          : isAds
            ? 'Contracts — ADS equipment rules'
            : 'Rate Cards — verify linkage',
      };
    }

    case 'line_amount_excl_tax':
      return {
        title: 'Line amount (excl. tax)',
        description: serverMessage ?? 'Computed as unit price × quantity.',
      };

    case 'line_amount_incl_tax_est':
      return {
        title: 'Estimated line total (incl. tax)',
        description: serverMessage ?? 'Estimated GST applied at draft generation.',
        fixHref: '/billing/settings/taxes',
        fixLabel: 'Settings — Taxes',
      };

    case 'duplicate_billing':
      return {
        title: 'Duplicate billing row',
        description:
          serverMessage ??
          (serial
            ? `Serial ${serial} (or the same usage row) is already in preparation for this period.`
            : 'This serial or usage row already exists in preparation for this period.'),
        fixHref: '/billing/preparation?tab=validation_error',
        fixLabel: 'Preparation — review duplicates',
      };

    case 'currency_error':
      return {
        title: 'Currency configuration error',
        description: serverMessage ?? 'Invoice currency or exchange rate setup is invalid.',
        fixHref: '/billing/conversion-rates',
        fixLabel: 'Master — Conversion Rates',
      };

    case 'tax_error':
      return {
        title: 'Tax configuration error',
        description: serverMessage ?? 'GST or tax posting groups are missing or inconsistent.',
        fixHref: '/billing/settings/taxes',
        fixLabel: 'Settings — Taxes',
      };

    case 'finance_rejected':
      return {
        title: 'Previously rejected by finance',
        description:
          serverMessage ??
          'This row was rejected during finance review. Fix the underlying issue and re-ingest or clear rejection.',
        fixHref: '/billing/preparation?tab=rejected',
        fixLabel: 'Preparation — rejected rows',
      };

    default:
      return {
        title: rule.replace(/_/g, ' '),
        description: serverMessage ?? 'Validation check failed.',
      };
  }
}

export function getValidationGuidance(
  result: Pick<ValidationResult, 'rule' | 'passed' | 'message'>,
  ctx: ValidationGuidanceContext = {},
): ValidationGuidance {
  const guidance = guidanceForRule(result.rule, ctx, result.message, result.passed);
  if (!result.passed) {
    const missingDetails = buildMissingDetails(result.rule, ctx);
    if (missingDetails.length > 0) {
      guidance.missingDetails = missingDetails;
      guidance.hoverHint = 'Hover for required values';
    }
    if (!guidance.fixHref) {
      const fallbackHref = buildPreparationRuleFixHref(result.rule, ctx);
      if (fallbackHref) {
        guidance.fixHref = fallbackHref;
        guidance.fixLabel = guidance.fixLabel ?? 'Open fix page';
      }
    }
  }
  return guidance;
}
