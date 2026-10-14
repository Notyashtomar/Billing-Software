import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { BillingRoot, BillingRootDocument } from '../schemas/billing-root.schema';

/**
 * Pre-single-collection unique indexes on `billing` were not scoped by `docType`,
 * so unrelated rows (e.g. audit_log + settings) collided on `{ stationCode, invoiceNumber: null }`.
 */
const LEGACY_BILLING_UNIQUE_INDEXES = [
  'stationCode_1_customerCode_1',
  'stationCode_1_serviceCode_1',
  'stationCode_1_contractNumber_1',
  'stationCode_1_ruleCode_1',
  'stationCode_1_currencyCode_1_startingDate_1',
  'stationCode_1_sequenceCode_1_fiscalYear_1',
  'stationCode_1',
  'stationCode_1_invoiceNumber_1',
  'stationCode_1_draftNumber_1',
  'invoiceId_1_lineNo_1',
  'invoiceId_1',
  'stationCode_1_creditMemoNumber_1',
  /** Was unique — price card airlines now allow duplicate aircraft per customer. */
  'stationCode_1_handlingType_1_customerCode_1_aircraftType_1',
] as const;

@Injectable()
export class BillingIndexMigrationService implements OnModuleInit {
  private readonly logger = new Logger(BillingIndexMigrationService.name);

  constructor(
    @InjectModel(BillingRoot.name)
    private readonly billingModel: Model<BillingRootDocument>,
  ) {}

  private isIndexNotFoundError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('index not found') ||
      msg.includes('Index not found') ||
      msg.toLowerCase().includes('ns not found')
    ) {
      return true;
    }
    const code =
      typeof err === 'object' && err !== null ? (err as { code?: number }).code : undefined;
    return code === 27;
  }

  async onModuleInit(): Promise<void> {
    const coll = this.billingModel.collection;

    for (const indexName of LEGACY_BILLING_UNIQUE_INDEXES) {
      try {
        await coll.dropIndex(indexName);
        this.logger.log(`[billing_indexes] dropped legacy index "${indexName}"`);
      } catch (err: unknown) {
        if (!this.isIndexNotFoundError(err)) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`[billing_indexes] could not drop "${indexName}": ${msg}`);
        }
      }
    }

    try {
      await this.billingModel.syncIndexes();
      this.logger.log('[billing_indexes] syncIndexes done for billing');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[billing_indexes] syncIndexes failed: ${msg}`);
    }

    // Do not delete invoice headers, lines, or preparation rows on boot.
    // A previous startup purge removed invoiced flights, and refresh then
    // rebuilt the draft from the survivors.
  }
}
