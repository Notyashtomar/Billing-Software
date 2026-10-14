/**
 * CLI: import MAA Excel into MongoDB via Nest application context.
 *
 * Usage (after build):
 *   node dist/excel-import/import-maa-cli.js "C:/path/to/maa_march.xlsx" [--dry-run]
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MaaExcelImportService } from './maa-excel-import.service';

const cliLogger = new Logger('ImportMaaCli');

async function bootstrap() {
  const filePath = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  if (!filePath?.trim()) {
    cliLogger.error(
      'Usage: node dist/excel-import/import-maa-cli.js <absolute-path-to.xlsx> [--dry-run]',
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const svc = app.get(MaaExcelImportService);
    const res = await svc.importFromFilePath(filePath.trim(), { dryRun });
    cliLogger.log(JSON.stringify(res, null, 2));
  } finally {
    await app.close();
  }
}

bootstrap().catch((e) => {
  cliLogger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
