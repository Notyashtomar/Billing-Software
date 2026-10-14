import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BillingInvoiceHeaderDocument,
  BillingPreparationRecord,
  BillingPreparationRecordDocument,
  BillingSettings,
  BillingSettingsDocument,
} from '../schemas/billing.schemas';
import type { StationScopeContext } from '../common/station-scope';
import { StationScope, fixedStationScope } from '../common/station-scope';
import type { BillingSessionOptions } from '../common/billing-transaction';
import {
  LEGACY_NAV_BRIDGE_TOKEN,
  type LegacyNavBridgePort,
} from '../adapters/legacy-nav-bridge.adapter';

const FRIS_PRIMARY_PHASES = new Set(['fris_primary', 'bc_readonly', 'decommissioned']);

@Injectable()
export class LegacyNavBridgeService {
  private readonly logger = new Logger(LegacyNavBridgeService.name);

  constructor(
    @InjectModel(BillingPreparationRecord.name)
    private readonly preparationModel: Model<BillingPreparationRecordDocument>,
    @InjectModel(BillingSettings.name)
    private readonly settingsModel: Model<BillingSettingsDocument>,
    @Optional()
    @Inject(LEGACY_NAV_BRIDGE_TOKEN)
    private readonly bridge?: LegacyNavBridgePort,
  ) {}

  /**
   * Marks preparation snapshots as exported-NAV inside the caller session.
   * External legacy bridge calls are deferred via `afterCommit` when provided.
   */
  async afterInvoicePosted(
    ctx: StationScopeContext,
    header: BillingInvoiceHeaderDocument,
    options?: BillingSessionOptions,
  ): Promise<{ serialsMarked: number }> {
    const stationCode = header.stationCode;
    const settings = await this.settingsModel
      .findOne(StationScope.filter({}, fixedStationScope(stationCode)))
      .session(options?.session ?? null)
      .lean();
    if (!settings?.nativeBillingEnabled) return { serialsMarked: 0 };
    if (!FRIS_PRIMARY_PHASES.has(settings.cutoverPhase ?? '')) {
      return { serialsMarked: 0 };
    }

    const prepIds = header.preparationRecordIds ?? [];
    if (!prepIds.length) return { serialsMarked: 0 };

    const records = await this.preparationModel
      .find({ _id: { $in: prepIds } })
      .session(options?.session ?? null)
      .select('sourceRef operationalSnapshot sourceType')
      .lean();

    let serialsMarked = 0;
    const externalSerials: string[] = [];

    for (const rec of records) {
      if (rec.sourceType !== 'scheduled_flight') continue;
      const serial = String((rec.sourceRef as { serialNo?: string })?.serialNo ?? '');
      if (!serial) continue;

      await this.preparationModel.updateOne(
        { _id: rec._id },
        {
          $set: {
            'operationalSnapshot.exportedNav': 'Yes',
          },
        },
        { session: options?.session },
      );

      if (this.bridge) {
        externalSerials.push(serial);
      }
      serialsMarked += 1;
    }

    if (this.bridge && externalSerials.length > 0) {
      const runExternal = async () => {
        for (const serial of externalSerials) {
          try {
            await this.bridge!.markSerialExportedNav(serial, stationCode);
          } catch (err) {
            this.logger.warn(
              `Legacy NAV bridge failed for serial ${serial}: ${err instanceof Error ? err.message : err}`,
            );
          }
        }
      };
      if (options?.afterCommit) {
        options.afterCommit(runExternal);
      } else {
        await runExternal();
      }
    }

    return { serialsMarked };
  }
}
