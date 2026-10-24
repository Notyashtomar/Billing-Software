/**
 * Sync Delhi contract ADS equipment rules onto Equipment Master names and UOMs.
 * Extra catalog UOMs are added as unpriced rows so both units stay visible
 * without changing the billed unit.
 *
 * From the api folder:
 *   npm run sync:del-ads-equipment-master:dry-run
 *   npm run sync:del-ads-equipment-master
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { AppModule } from '../../app.module';
import { EQUIPMENT_MASTER_STATION } from '../services/billing-equipment-master.service';
import {
  BillingContract,
  type BillingContractDocument,
} from '../schemas/billing.schemas';
import {
  BillingEquipmentMaster,
  type BillingEquipmentMasterDocument,
} from '../schemas/billing-equipment-master.schema';
import { syncAdsRulesToEquipmentMaster } from '../equipment-master/sync-ads-rules-to-equipment-master';

const log = new Logger('SyncDelAdsEquipmentMaster');

function readArg(flag: string, fallback: string): string {
  const prefix = `${flag}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim().toUpperCase() : fallback;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const stationCode = readArg('--station', 'DEL');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const contracts = app.get<Model<BillingContractDocument>>(getModelToken(BillingContract.name));
    const master = app.get<Model<BillingEquipmentMasterDocument>>(
      getModelToken(BillingEquipmentMaster.name),
    );

    const catalog = await master.find({ stationCode: EQUIPMENT_MASTER_STATION }).lean().exec();
    const pickCache = new Map();
    log.log(`Equipment master rows: ${catalog.length}`);

    const docs = await contracts
      .find({
        stationCode,
        adsEquipmentRules: { $exists: true, $not: { $size: 0 } },
      })
      .exec();
    log.log(`${stationCode} contracts with ADS equipment rules: ${docs.length}`);

    let updated = 0;
    let matched = 0;
    let expanded = 0;
    const unmatched = new Set<string>();
    const ambiguous = new Set<string>();

    for (const doc of docs) {
      const current = Array.isArray(doc.adsEquipmentRules) ? doc.adsEquipmentRules : [];
      const result = syncAdsRulesToEquipmentMaster(current, catalog, pickCache);
      for (const name of result.unmatched) unmatched.add(name);
      for (const name of result.ambiguous) ambiguous.add(name);
      matched += result.matched;
      expanded += result.expanded;

      const changed =
        result.renamed > 0 ||
        result.uomCanonicalized > 0 ||
        result.expanded > 0 ||
        result.rules.length !== current.length;
      if (!changed) continue;

      updated += 1;
      log.log(
        `${dryRun ? '[dry-run] ' : ''}${doc.customerCode} ${doc.contractNumber}: ${current.length} → ${result.rules.length} rows (matched ${result.matched}, extra UOMs ${result.expanded})`,
      );
      if (dryRun) continue;

      await contracts.updateOne(
        { _id: doc._id },
        { $set: { adsEquipmentRules: result.rules } },
      );
    }

    if (unmatched.size > 0) {
      log.warn(`Unmatched ADS names (${unmatched.size}): ${[...unmatched].slice(0, 40).join(' | ')}`);
    }
    if (ambiguous.size > 0) {
      log.warn(`Ambiguous ADS names (${ambiguous.size}): ${[...ambiguous].join(' | ')}`);
    }
    log.log(
      `${dryRun ? 'Dry run. ' : ''}Contracts updated: ${updated}. Rules matched: ${matched}. Extra UOM rows: ${expanded}.`,
    );
  } finally {
    await app.close();
  }
}

void main().catch((err) => {
  log.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
