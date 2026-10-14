/**
 * Export all `fhr_collection` rows to a markdown table with fields joined to `advance-aircraft`
 * on aircraft type (same normalization as AdvanceAircraftService).
 *
 * Usage (from server/):
 *   npx ts-node --project tsconfig.scripts.json scripts/export-fhr-flight-records-md.ts
 *   npx ts-node ... scripts/export-fhr-flight-records-md.ts --out ../docs/fhr-flight-records-all.md
 *
 * Requires MONGO_URI in `.env`.
 */

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '@nestjs/common';

dotenv.config({ path: path.join(__dirname, '../.env') });

const logger = new Logger('ExportFhrFlightRecordsMd');

/** Mirrors AdvanceAircraftService.normalizeAircraftType */
function normalizeAircraftType(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9/-]/g, '')
    .replace(/-+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/[-/]{2,}/g, '-')
    .replace(/^[-/]+|[-/]+$/g, '');
}

function resolveBodyFromMap(
  map: Map<string, string>,
  rawType: string,
): { body: string; matchedKey: string } {
  const tryOne = (fragment: string): string | null => {
    const normalized = normalizeAircraftType(fragment ?? '');
    if (normalized.length < 2) return null;
    const v = map.get(normalized);
    return v != null ? v : null;
  };

  const primary = tryOne(rawType);
  if (primary != null) {
    return { body: primary, matchedKey: normalizeAircraftType(rawType) };
  }
  const parts = String(rawType ?? '')
    .split(/[/|,]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const p of parts) {
    const hit = tryOne(p);
    if (hit != null) {
      return { body: hit, matchedKey: normalizeAircraftType(p) };
    }
  }
  return { body: '', matchedKey: '' };
}

function mdCell(s: unknown): string {
  const t = s == null ? '' : String(s);
  return t.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function parseArgs(): { outPath: string } {
  const argv = process.argv.slice(2);
  let outPath = path.join(__dirname, '../../docs/fhr-flight-records-all.md');
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) {
      outPath = path.resolve(argv[i + 1]);
      i++;
    }
  }
  return { outPath };
}

type FhrLean = {
  SerialNo?: number;
  flightSerialNumber?: number;
  mainDetails?: {
    SerialNo?: number;
    flightSerialNumber?: number;
    Airline?: string;
    TypeofHandling?: string;
    type_of_handling?: string;
    typeOfHandling?: string;
    Cate_of_Flight?: string;
    TypeCraft?: string;
    aircraftBody?: string;
  } | null;
  loadControlDetails?: {
    TypeCraft?: string;
  } | null;
};

async function main(): Promise<void> {
  const { outPath } = parseArgs();
  const uri = process.env.MONGO_URI?.trim();
  if (!uri) {
    logger.error('Missing MONGO_URI in environment (.env)');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    logger.error('No database handle');
    process.exit(1);
  }

  const acColl = db.collection('advance-aircraft');
  const acDocs = await acColl
    .find(
      { $or: [{ active: true }, { active: { $exists: false } }] },
      { projection: { aircraft: 1, aircraftBody: 1, active: 1 } },
    )
    .toArray();

  const bodyByType = new Map<string, string>();
  for (const row of acDocs) {
    if ((row as { active?: boolean }).active === false) continue;
    const ac = normalizeAircraftType(String((row as { aircraft?: string }).aircraft ?? ''));
    if (ac.length < 2) continue;
    const ab = String((row as { aircraftBody?: string }).aircraftBody ?? '')
      .trim()
      .toUpperCase();
    bodyByType.set(ac, ab === 'WB' ? 'WB' : 'NB');
  }

  const fhrColl = db.collection('fhr_collection');
  const fhrDocs = (await fhrColl
    .find(
      {},
      {
        projection: {
          SerialNo: 1,
          flightSerialNumber: 1,
          mainDetails: 1,
          loadControlDetails: 1,
        },
        sort: { SerialNo: 1 },
      },
    )
    .toArray()) as unknown as FhrLean[];

  const lines: string[] = [];
  lines.push('# FHR flight records (all)');
  lines.push('');
  lines.push(
    `Generated: ${new Date().toISOString()} — **${fhrDocs.length}** row(s) from \`fhr_collection\`. Column \`aircraftbody\`: **NB/WB from \`advance-aircraft\`** when \`typecraft\` matches the catalog (after normalization); otherwise \`mainDetails.aircraftBody\` from FHR.`,
  );
  lines.push('');
  lines.push(
    '| flight_serial_number | type_of_handling | airline_name | cate_of_flight | typecraft | aircraftbody |',
  );
  lines.push('| --- | --- | --- | --- | --- | --- |');

  for (const doc of fhrDocs) {
    const md = doc.mainDetails ?? null;
    const lcd = doc.loadControlDetails ?? null;
    const serial =
      doc.SerialNo ??
      doc.flightSerialNumber ??
      md?.SerialNo ??
      md?.flightSerialNumber ??
      '';
    const typeCraft = String(md?.TypeCraft ?? lcd?.TypeCraft ?? '').trim();
    const fhrBody = String(md?.aircraftBody ?? '').trim();
    const { body: fromAc } = resolveBodyFromMap(bodyByType, typeCraft);
    /** Prefer catalog NB/WB when TypeCraft matches `advance-aircraft` (same idea as FHR reports). */
    const aircraftBody = fromAc !== '' ? fromAc : fhrBody;

    const typeOfHandling = String(
      md?.TypeofHandling ?? md?.type_of_handling ?? md?.typeOfHandling ?? '',
    ).trim();
    const airline = String(md?.Airline ?? '').trim();
    const cate = String(md?.Cate_of_Flight ?? '').trim();

    lines.push(
      `| ${mdCell(serial)} | ${mdCell(typeOfHandling)} | ${mdCell(airline)} | ${mdCell(cate)} | ${mdCell(typeCraft)} | ${mdCell(aircraftBody)} |`,
    );
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  logger.log(`Wrote ${fhrDocs.length} rows to ${outPath}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
