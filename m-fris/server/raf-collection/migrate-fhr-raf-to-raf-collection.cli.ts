/**
 * Migrate RAF payloads from `fhr_collection` → `raf_collection`, then unset on FHR.
 *
 * From BWMS/apps/api (after nest build / with mounted src):
 *   npm run migrate:fhr-raf-to-raf-collection:dry-run
 *   npm run migrate:fhr-raf-to-raf-collection
 *   npm run migrate:fhr-raf-to-raf-collection -- --station=MAA
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { FhrCollection } from '../fhr-collection/schema/fhr-collection.schema';
import { RafCollectionService } from './services/raf-collection.service';

const cliLogger = new Logger('MigrateFhrRafToRafCollectionCli');

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main() {
  const dryRun = argFlag('dry-run');
  const stationCode = argValue('station');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const raf = app.get(RafCollectionService);
    const fhrModel = app.get<Model<Record<string, unknown>>>(
      getModelToken(FhrCollection.name),
    );
    const summary = await raf.migrateFromFhrDocuments(fhrModel as never, {
      dryRun,
      stationCode,
    });
    cliLogger.log(JSON.stringify(summary));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  cliLogger.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
