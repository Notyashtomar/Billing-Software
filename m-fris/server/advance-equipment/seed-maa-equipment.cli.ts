console.error('Seeding is disabled. Use normal create/save APIs instead.');
process.exit(1);
/**
 * Seed MongoDB equipment master rows for Chennai (MAA).
 *
 * Usage (from server/):
 *   npm run seed:maa-equipment
 *   npm run seed:maa-equipment -- --dry-run
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { fixedStationScope } from '../common/station/station-scope';
import { EquipmentManpowerService } from '../equipment-manpower/services/equipment-manpower.service';
import { MAA_EQUIPMENT_SEED } from './data/maa-equipment.seed';
import { AdvanceEquipmentService } from './services/advance-equipment.service';

const cliLogger = new Logger('SeedMaaEquipmentCli');
const STATION_CODE = 'MAA';

async function bootstrap(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const station = fixedStationScope(STATION_CODE);
  const catalogItems = MAA_EQUIPMENT_SEED.map((row) => ({
    abbr: row.equipmentCode,
    description: row.equipmentName,
    unit_type: '',
    category: row.category,
  }));

  if (dryRun) {
    cliLogger.log(
      `Dry run: would upsert ${MAA_EQUIPMENT_SEED.length} advance-equipment rows and ${catalogItems.length} catalog rows for ${STATION_CODE}`,
    );
    cliLogger.log(JSON.stringify(MAA_EQUIPMENT_SEED, null, 2));
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const advanceEquipment = app.get(AdvanceEquipmentService);
    const equipmentManpower = app.get(EquipmentManpowerService);
    const advanceRes = await advanceEquipment.createBulk(
      [...MAA_EQUIPMENT_SEED],
      station,
    );
    const catalogRes = await equipmentManpower.replaceMasterCatalog(
      catalogItems,
      station,
    );
    cliLogger.log(
      `Seeded ${STATION_CODE} equipment: advance=${JSON.stringify(advanceRes)} catalog=${JSON.stringify(catalogRes)}`,
    );
  } finally {
    await app.close();
  }
}

bootstrap().catch((e) => {
  cliLogger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
