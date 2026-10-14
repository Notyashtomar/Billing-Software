import type { PriceCardHandlingType } from './enums';
import { PRICE_CARD_HANDLING_TYPES } from './enums';
import { flightScheduleYmdRangeFromLabels } from '@/lib/dashboardScheduledAirlinesNav';
import {
  resolveServiceCode,
  type ValidationGuidanceContext,
} from './preparation-validation-guidance';
import { serviceMatchesHandlingType } from './price-card-handling';

function formatYmd(value?: string | Date | null): string | undefined {
  if (!value) return undefined;
  const text = value instanceof Date ? value.toISOString() : String(value);
  const ymd = text.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : undefined;
}

export function resolveHandlingTypeForContext(
  ctx: ValidationGuidanceContext,
  serviceCategoryByCode?: Map<string, string>,
): PriceCardHandlingType {
  const sourceType = ctx.sourceType?.trim().toLowerCase() ?? '';
  const serviceCode = resolveServiceCode(ctx) ?? '';

  if (sourceType === 'raf') return 'RAF';
  if (sourceType === 'ads' || sourceType === 'equipment' || sourceType === 'manpower') {
    return 'ADS';
  }

  if (serviceCategoryByCode) {
    for (const handling of PRICE_CARD_HANDLING_TYPES) {
      if (
        serviceMatchesHandlingType(
          serviceCode,
          serviceCategoryByCode.get(serviceCode),
          handling,
        )
      ) {
        return handling;
      }
    }
  }

  const code = serviceCode.toUpperCase();
  if (code.startsWith('RAF')) return 'RAF';
  if (sourceType === 'ads') return 'ADS';

  return 'BHS';
}

export function buildRateCardsFixHref(
  ctx: ValidationGuidanceContext,
  serviceCategoryByCode?: Map<string, string>,
): string {
  const params = new URLSearchParams();
  const handling = resolveHandlingTypeForContext(ctx, serviceCategoryByCode);
  params.set('handling', handling);
  const customer = ctx.customerCode?.trim();
  if (customer) params.set('customer', customer);
  const service = resolveServiceCode(ctx)?.trim();
  if (service) params.set('service', service);
  return `/billing/rate-cards?${params.toString()}`;
}

export function buildContractsFixHref(ctx: ValidationGuidanceContext): string {
  const params = new URLSearchParams();
  const customer = ctx.customerCode?.trim();
  if (customer) params.set('customer', customer);
  const qs = params.toString();
  return qs ? `/billing/contracts?${qs}` : '/billing/contracts';
}

export function buildScheduledAirlinesFixHref(ctx: ValidationGuidanceContext): string {
  const params = new URLSearchParams();
  const scheduleRange = flightScheduleYmdRangeFromLabels({
    staDate: ctx.staDate,
    stdDate: ctx.stdDate,
    ataDate: ctx.ataDate,
  });
  const atd = formatYmd(ctx.atdDate);
  const periodStart = formatYmd(ctx.billingPeriodStart);
  const periodEnd = formatYmd(ctx.billingPeriodEnd);
  const from = scheduleRange?.fromYmd ?? atd ?? periodStart;
  const to = scheduleRange?.toYmd ?? atd ?? periodEnd ?? periodStart;
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const serial = ctx.serialNo?.trim();
  if (serial) {
    params.set('highlightSerial', serial);
    params.set('serial', serial);
  }
  const airlineName =
    ctx.operationalAirlineName?.trim() || ctx.customerName?.trim() || '';
  if (airlineName) params.set('airline', airlineName);
  const aircraft = ctx.aircraftType?.trim();
  if (aircraft) params.set('aircraft', aircraft);
  return `/fris/flights/scheduledairlines?${params.toString()}`;
}

export function buildOperationalSourceFixHref(ctx: ValidationGuidanceContext): string {
  if (ctx.sourceType === 'scheduled_flight') {
    return buildScheduledAirlinesFixHref(ctx);
  }

  const pages: Record<string, string> = {
    equipment: '/billing/equipment',
    cleaning: '/billing/cleaning',
    raf: '/billing/raf',
    maas: '/billing/maas',
    ads: '/billing/ads',
    xxld: '/billing/xxld-scheduled',
    manpower: '/billing/manpower',
    non_scheduled: '/billing/non-scheduled',
  };

  const base = pages[ctx.sourceType ?? ''] ?? '/billing/insights/payables';
  const params = new URLSearchParams();
  if (ctx.customerCode) params.set('customer', ctx.customerCode);
  if (ctx.billingPeriodStart) {
    params.set('from', String(ctx.billingPeriodStart).slice(0, 10));
  }
  if (ctx.billingPeriodEnd) {
    params.set('to', String(ctx.billingPeriodEnd).slice(0, 10));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function buildPreparationRuleFixHref(
  rule: string,
  ctx: ValidationGuidanceContext,
  serviceCategoryByCode?: Map<string, string>,
): string | undefined {
  switch (rule) {
    case 'rate_match':
    case 'rate_card_linked':
    case 'ceiling_rate':
    case 'unit_price':
    case 'service_code':
      return buildRateCardsFixHref(ctx, serviceCategoryByCode);

    case 'contract_match':
    case 'contract_linked':
      return buildContractsFixHref(ctx);

    case 'customer_code':
    case 'currency':
      return '/billing/customers';

    case 'serial_positive_integer':
    case 'not_cancelled':
    case 'atd_present':
    case 'flight_number':
    case 'category_of_flight':
      return buildOperationalSourceFixHref(ctx);

    case 'currency_error':
      return '/billing/conversion-rates';

    case 'tax_error':
    case 'line_amount_incl_tax_est':
      return '/billing/settings/taxes';

    case 'duplicate_billing':
      return '/billing/preparation?tab=validation_error';

    case 'finance_rejected':
      return '/billing/preparation?tab=rejected';

    default:
      return undefined;
  }
}
