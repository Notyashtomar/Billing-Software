import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BillingTaxRule,
  BillingTaxRuleDocument,
} from '../schemas/billing.schemas';
import type { StationScopeContext } from '../common/station-scope';
import { StationScope } from '../common/station-scope';

export interface TaxLineInput {
  lineAmountExclTax: number;
  serviceCode: string;
  documentDate: Date;
}

export interface TaxLineResult {
  gstPercent: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  lineAmountInclTax: number;
  ruleCode?: string;
}

type CachedTaxRule = {
  effectiveFrom?: Date;
  effectiveTo?: Date;
  serviceCodePattern?: string | null;
  gstPercent?: number;
  cgstPercent?: number;
  sgstPercent?: number;
  igstPercent?: number;
  ruleCode?: string;
};

@Injectable()
export class TaxEngineService {
  private readonly rulesCache = new Map<string, { at: number; rules: CachedTaxRule[] }>();

  constructor(
    @InjectModel(BillingTaxRule.name)
    private readonly taxRuleModel: Model<BillingTaxRuleDocument>,
  ) {}

  clearCache(): void {
    this.rulesCache.clear();
  }

  private async rulesForStation(ctx: StationScopeContext): Promise<CachedTaxRule[]> {
    const key = String(ctx.stationCode ?? '');
    const hit = this.rulesCache.get(key);
    if (hit && Date.now() - hit.at < 60_000) return hit.rules;
    const rules = (await this.taxRuleModel
      .find(StationScope.filter({}, ctx))
      .select(
        'effectiveFrom effectiveTo serviceCodePattern gstPercent cgstPercent sgstPercent igstPercent ruleCode',
      )
      .lean()) as CachedTaxRule[];
    this.rulesCache.set(key, { at: Date.now(), rules });
    return rules;
  }

  async calculateLine(
    ctx: StationScopeContext,
    input: TaxLineInput,
  ): Promise<TaxLineResult> {
    const rules = await this.rulesForStation(ctx);
    const when = input.documentDate.getTime();
    const serviceCode = String(input.serviceCode ?? '');
    let rule: CachedTaxRule | undefined;
    for (const candidate of rules) {
      const from = candidate.effectiveFrom ? new Date(candidate.effectiveFrom).getTime() : Number.NEGATIVE_INFINITY;
      const to = candidate.effectiveTo ? new Date(candidate.effectiveTo).getTime() : Number.POSITIVE_INFINITY;
      if (when < from || when > to) continue;
      const pattern = String(candidate.serviceCodePattern ?? '').trim();
      if (pattern) {
        const matcher = new RegExp(
          `^${serviceCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        );
        if (!matcher.test(pattern)) continue;
      }
      if (!rule) {
        rule = candidate;
        continue;
      }
      const ruleFrom = rule.effectiveFrom ? new Date(rule.effectiveFrom).getTime() : 0;
      if (from > ruleFrom) rule = candidate;
    }

    const gstPercent = rule?.gstPercent ?? 18;
    const cgstPercent = rule?.cgstPercent ?? gstPercent / 2;
    const sgstPercent = rule?.sgstPercent ?? gstPercent / 2;
    const igstPercent = rule?.igstPercent ?? 0;

    const cgstAmount = (input.lineAmountExclTax * cgstPercent) / 100;
    const sgstAmount = (input.lineAmountExclTax * sgstPercent) / 100;
    const igstAmount = (input.lineAmountExclTax * igstPercent) / 100;
    const taxTotal = cgstAmount + sgstAmount + igstAmount;

    return {
      gstPercent,
      cgstAmount: round2(cgstAmount),
      sgstAmount: round2(sgstAmount),
      igstAmount: round2(igstAmount),
      lineAmountInclTax: round2(input.lineAmountExclTax + taxTotal),
      ruleCode: rule?.ruleCode,
    };
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
