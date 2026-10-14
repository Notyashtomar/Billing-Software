import { Injectable } from '@nestjs/common';
import type { ValidationResult } from '../shared/types';

export interface FlightReadinessInput {
  serialNo?: string;
  atdDate?: string | Date | null;
  cancelled?: boolean;
}

export interface ContractRateInput {
  hasContract: boolean;
  hasRate: boolean;
  unitPrice?: number;
  ceilingRate?: number;
  /** ADS prices come from contract equipment rules, not Rate Cards tab. */
  pricingSource?: 'ads_contract' | 'rate_card' | 'custom' | 'adhoc';
}

export interface InvoiceLineReadinessInput {
  sourceType?: string;
  customerCode?: string;
  flightNo?: string;
  serviceCode?: string;
  unitPrice?: number;
  currency?: string;
  categoryOfFlight?: string;
  contractMatched?: boolean;
  rateMatched?: boolean;
  contractId?: string;
  rateCardId?: string;
  billingPeriodStart?: Date | string;
  billingPeriodEnd?: Date | string;
  /** ADS prices come from contract equipment rules, not Rate Cards tab. */
  pricingSource?: 'ads_contract' | 'rate_card' | 'custom' | 'adhoc';
}

function formatMoney(currency: string, amount: number): string {
  return `${currency} ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

@Injectable()
export class ValidationEngineService {
  validateFlightReadiness(input: FlightReadinessInput): ValidationResult[] {
    const results: ValidationResult[] = [];
    const serial = String(input.serialNo ?? '').trim();
    if (!serial || !/^\d+$/.test(serial) || parseInt(serial, 10) <= 0) {
      results.push({
        rule: 'serial_positive_integer',
        passed: false,
        message: 'Serial must be a positive integer',
      });
    } else {
      results.push({
        rule: 'serial_positive_integer',
        passed: true,
        message: serial,
      });
    }

    if (input.cancelled) {
      results.push({
        rule: 'not_cancelled',
        passed: false,
        message: 'Cancelled flights are excluded from billing',
      });
    } else {
      results.push({ rule: 'not_cancelled', passed: true, message: 'Active movement' });
    }

    if (!input.atdDate) {
      results.push({
        rule: 'atd_present',
        passed: false,
        message: 'ATD date required for invoicing window (STA/STD fallback policy configurable)',
      });
    } else {
      const atd =
        input.atdDate instanceof Date
          ? input.atdDate.toISOString().slice(0, 10)
          : String(input.atdDate).slice(0, 10);
      results.push({ rule: 'atd_present', passed: true, message: atd });
    }

    return results;
  }

  validateContractAndRate(input: ContractRateInput): ValidationResult[] {
    const results: ValidationResult[] = [];
    const adsPricing = input.pricingSource === 'ads_contract';
    const adhocPricing = input.pricingSource === 'adhoc';
    // RAF / adhoc tariff: contracts are not part of the billing model.
    if (!adhocPricing) {
      results.push({
        rule: 'contract_match',
        passed: input.hasContract,
        message: input.hasContract
          ? 'Active contract for customer and ATD date'
          : 'No active contract for customer and period',
      });
    }
    results.push({
      rule: 'rate_match',
      passed: input.hasRate || adsPricing,
      message: input.hasRate
        ? adsPricing
          ? 'Contract ADS equipment rate matched'
          : adhocPricing
            ? 'RAF adhoc tariff matched'
            : 'Rate card matched for service and date'
        : adsPricing
          ? 'ADS bills only contract equipment — usage without a contract rate is not charged'
          : adhocPricing
            ? 'No RAF adhoc rate for this particular'
            : 'No rate card for service code',
    });

    if (
      input.hasRate &&
      !adsPricing &&
      !adhocPricing &&
      input.unitPrice != null &&
      input.ceilingRate != null &&
      input.unitPrice > input.ceilingRate
    ) {
      results.push({
        rule: 'ceiling_rate',
        passed: false,
        message: `Unit price ${input.unitPrice} exceeds ceiling ${input.ceilingRate}`,
      });
    } else if (input.hasRate || adsPricing || adhocPricing) {
      results.push({
        rule: 'ceiling_rate',
        passed: true,
        message: adsPricing
          ? 'ADS ceiling not applicable'
          : adhocPricing
            ? 'RAF adhoc ceiling not applicable'
            : 'Unit price within ceiling',
      });
    }

    return results;
  }

  validateInvoiceLineReadiness(input: InvoiceLineReadinessInput): ValidationResult[] {
    const results: ValidationResult[] = [];
    const adsPricing = input.pricingSource === 'ads_contract';
    const adhocPricing = input.pricingSource === 'adhoc';
    const isRaf = String(input.sourceType ?? '').trim().toLowerCase() === 'raf';
    const skipContract = adhocPricing || isRaf;
    const customer = String(input.customerCode ?? '').trim().toUpperCase();
    results.push(
      customer
        ? { rule: 'customer_code', passed: true, message: customer }
        : {
            rule: 'customer_code',
            passed: false,
            message: 'Customer code required on invoice line',
          },
    );

    const flightNo = String(input.flightNo ?? '').trim();
    results.push(
      flightNo
        ? { rule: 'flight_number', passed: true, message: flightNo }
        : {
            rule: 'flight_number',
            passed: false,
            message: 'Flight number required for invoice line description',
          },
    );

    const serviceCode = String(input.serviceCode ?? '').trim();
    results.push(
      serviceCode
        ? { rule: 'service_code', passed: true, message: serviceCode }
        : {
            rule: 'service_code',
            passed: false,
            message: adsPricing
              ? 'Equipment / service code required from ADS usage'
              : 'Service code from rate card required',
          },
    );

    const currency = String(input.currency ?? '').trim().toUpperCase();
    results.push(
      currency === 'INR' || currency === 'USD'
        ? { rule: 'currency', passed: true, message: currency }
        : {
            rule: 'currency',
            passed: false,
            message: 'Billing currency (INR or USD) required',
          },
    );

    const unitPrice = Number(input.unitPrice);
    const hasUnitPrice = Number.isFinite(unitPrice) && unitPrice > 0;
    const deferUnitPrice =
      adsPricing || String(input.pricingSource ?? '').trim().toLowerCase() === 'custom';
    results.push(
      hasUnitPrice
        ? {
            rule: 'unit_price',
            passed: true,
            message: `${formatMoney(currency || 'INR', unitPrice)} per flight`,
          }
        : deferUnitPrice
          ? {
              rule: 'unit_price',
              passed: true,
              message:
                String(input.pricingSource ?? '').trim().toLowerCase() === 'custom'
                  ? 'Custom rates are entered on Preparation → Custom form'
                  : 'ADS prices come from contract equipment rules when billable — no unit price required on usage',
            }
          : {
              rule: 'unit_price',
              passed: false,
              message: 'Unit price must be greater than zero',
            },
    );

    results.push({
      rule: 'quantity',
      passed: true,
      message: '1 EA (one billable movement)',
    });

    if (input.sourceType === 'scheduled_flight') {
      const category = String(input.categoryOfFlight ?? '').trim();
      results.push(
        category
          ? { rule: 'category_of_flight', passed: true, message: category }
          : {
              rule: 'category_of_flight',
              passed: false,
              message: 'Dom/Int category required for rate tier',
            },
      );
    }

    const periodStart = input.billingPeriodStart
      ? String(input.billingPeriodStart).slice(0, 10)
      : '';
    const periodEnd = input.billingPeriodEnd
      ? String(input.billingPeriodEnd).slice(0, 10)
      : '';
    if (periodStart || periodEnd) {
      results.push(
        periodStart && periodEnd
          ? {
              rule: 'billing_period',
              passed: true,
              message: `${periodStart} → ${periodEnd}`,
            }
          : {
              rule: 'billing_period',
              passed: false,
              message: 'Billing period start and end required',
            },
      );
    }

    const contractOk = Boolean(input.contractMatched || input.contractId);
    if (!skipContract) {
      results.push(
        contractOk
          ? {
              rule: 'contract_linked',
              passed: true,
              message: input.contractId
                ? `Contract linked (${String(input.contractId).slice(-8)})`
                : 'Active contract matched',
            }
          : {
              rule: 'contract_linked',
              passed: false,
              message: 'Contract reference missing on preparation row',
            },
      );
    }

    const rateOk = Boolean(input.rateMatched || input.rateCardId);
    results.push(
      rateOk
        ? {
            rule: 'rate_card_linked',
            passed: true,
            message: input.rateCardId
              ? `Rate card linked (${String(input.rateCardId).slice(-8)})`
              : adsPricing
                ? 'Contract ADS equipment rate applied'
                : skipContract
                  ? 'RAF adhoc tariff applied'
                  : 'Active rate card matched',
          }
        : adsPricing
          ? {
              rule: 'rate_card_linked',
              passed: true,
              message: 'Rate cards not used for ADS — contract equipment rules only',
            }
          : skipContract
            ? {
                rule: 'rate_card_linked',
                passed: Boolean(input.rateMatched),
                message: input.rateMatched
                  ? 'RAF adhoc tariff applied'
                  : 'No RAF adhoc rate on preparation row',
              }
            : {
                rule: 'rate_card_linked',
                passed: false,
                message: 'Rate card reference missing on preparation row',
              },
    );

    if (hasUnitPrice) {
      const billCurrency = currency === 'USD' ? 'USD' : currency || 'INR';
      const exclTax = unitPrice;
      const gstEstimate = Math.round(exclTax * 0.18 * 100) / 100;
      results.push({
        rule: 'line_amount_excl_tax',
        passed: true,
        message: formatMoney(billCurrency, exclTax),
      });
      results.push({
        rule: 'line_amount_incl_tax_est',
        passed: true,
        message: `~${formatMoney(billCurrency, exclTax + gstEstimate)} incl. est. 18% GST`,
      });
    }

    return results;
  }

  allPassed(results: ValidationResult[]): boolean {
    return results.length > 0 && results.every((r) => r.passed);
  }

  merge(...groups: ValidationResult[][]): ValidationResult[] {
    return groups.flat();
  }

  validateDuplicate(isDuplicate: boolean): ValidationResult {
    return {
      rule: 'duplicate_billing',
      passed: !isDuplicate,
      message: isDuplicate
        ? 'Serial or usage row already exists in preparation for this period'
        : undefined,
    };
  }
}
