import { BadRequestException, Injectable } from '@nestjs/common';
import type { StationScopeContext } from '../../common/station-scope';
import { BillingSourcesQueryDto } from '../../dto/billing-sources-query.dto';
import { preparationSourceIdentity } from '../../utils/preparation-source-identity.util';
import { queryParamToYmd } from '../../utils/billing-date.util';
import { BillingPreparationService } from '../billing-preparation.service';
import { BillingSourceEnrichmentService } from './billing-source-enrichment.service';
import { BillingSourcesScheduledService } from './billing-sources-scheduled.service';
import type { BillingSourceRow } from '../../shared/billing-sources';

/**
 * Custom billing operational source — flight palette from scheduled/FHR data,
 * independent of BHS (`scheduled_flight`) and ADS preparation / invoice paths.
 */
@Injectable()
export class BillingSourcesCustomService {
  constructor(
    private readonly scheduledSvc: BillingSourcesScheduledService,
    private readonly enrichment: BillingSourceEnrichmentService,
    private readonly preparation: BillingPreparationService,
  ) {}

  async list(ctx: StationScopeContext, query: BillingSourcesQueryDto) {
    const fromYmd = queryParamToYmd(query.from);
    const toYmd = queryParamToYmd(query.to);
    if (!fromYmd || !toYmd) {
      throw new BadRequestException('Invalid date range');
    }

    const scheduled = await this.scheduledSvc.list(ctx, query);
    const scheduledData = scheduled.data;
    const periodStart = new Date(fromYmd);
    const snapshots = await this.preparation.getIngestedSourceSnapshots(
      ctx,
      periodStart,
      'custom',
    );
    const identities = new Set(
      snapshots.map((snap) => preparationSourceIdentity(snap)).filter(Boolean),
    );

    const rows: BillingSourceRow[] = (scheduledData.rows ?? []).map((row) => {
      const identity = preparationSourceIdentity({
        sourceRef: row.sourceRef,
        operationalData: row.operationalData,
      });
      const aircraftType = String(
        row.rateMatch?.aircraftType ??
          row.operationalData?.aircraftType ??
          row.operationalData?.ACType ??
          '',
      ).trim();

      return {
        ...row,
        sourceType: 'custom',
        sentToPreparation: Boolean(identity && identities.has(identity)),
        // Custom rates are entered on the Preparation → Custom form (not rate cards).
        contractMatch: {
          matched: true,
          message: 'Custom billing — charges entered in preparation',
          concessionRates: row.contractMatch?.concessionRates,
          conditionalCharges: row.contractMatch?.conditionalCharges,
          royaltyAtGross: row.contractMatch?.royaltyAtGross,
          cancellationWithinHours: row.contractMatch?.cancellationWithinHours,
          contractId: row.contractMatch?.contractId,
        },
        rateMatch: {
          matched: true,
          message: 'Custom billing — enter particulars on Preparation → Custom',
          aircraftType: aircraftType || row.rateMatch?.aircraftType,
          currency: row.rateMatch?.currency,
          serviceCode: 'Custom Billing',
          pricingBasis: 'custom' as BillingSourceRow['rateMatch']['pricingBasis'],
        },
        validationStatus: {
          passed: Boolean(row.validationStatus?.passed !== false),
          errors: (row.validationStatus?.errors ?? []).filter(
            (e) =>
              !/contract|rate card|rate match/i.test(
                `${e.rule ?? ''} ${e.message ?? ''}`,
              ),
          ),
        },
        billingEligibility: {
          eligible: true,
          reason: undefined,
        },
      };
    });

    // Prefer unsent first (same UX as scheduled / ADS palettes).
    rows.sort((a, b) => {
      const aSent = a.sentToPreparation ? 1 : 0;
      const bSent = b.sentToPreparation ? 1 : 0;
      if (aSent !== bSent) return aSent - bSent;
      return String(a.operationalData.atdDate ?? '').localeCompare(
        String(b.operationalData.atdDate ?? ''),
      );
    });

    return this.enrichment.wrapResponse(
      'custom',
      rows,
      fromYmd,
      toYmd,
      scheduledData.dateBasis,
    );
  }
}
